#!/usr/bin/env node
/**
 * Pushups event repair utility.
 *
 * Run:
 *   node scripts/clean_pushup_events.js
 *   node scripts/test_pushups_rebuild.js
 *
 * This script:
 * 1) removes blank/comment lines from data/pushups/events.ndjson
 * 2) generates backfill events for a date window
 * 3) appends + sorts + writes NDJSON back to disk
 */
const fs = require("fs/promises");
const path = require("path");

const EVENTS_PATH = path.join(process.cwd(), "data", "pushups", "events.ndjson");

function isIsoDateKey(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(value || ""));
}

function dateRangeInclusive(startDate, endDate) {
  const out = [];
  const start = new Date(`${startDate}T00:00:00.000Z`);
  const end = new Date(`${endDate}T00:00:00.000Z`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || start > end) {
    throw new Error("Invalid backfill date range");
  }

  const cursor = new Date(start.getTime());
  while (cursor <= end) {
    const y = cursor.getUTCFullYear();
    const m = String(cursor.getUTCMonth() + 1).padStart(2, "0");
    const d = String(cursor.getUTCDate()).padStart(2, "0");
    out.push(`${y}-${m}-${d}`);
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return out;
}

function hashSeed(seed) {
  let h = 2166136261 >>> 0;
  const s = String(seed);
  for (let i = 0; i < s.length; i += 1) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function makeRng(seed) {
  let a = hashSeed(seed) || 1;
  return function rng() {
    a |= 0;
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t ^= t + Math.imul(t ^ (t >>> 7), 61 | t);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function randIntWithRng(min, max, rng) {
  return Math.floor(rng() * (max - min + 1)) + min;
}

function distributeToTarget(base, target, minPerItem, maxPerItem, rng) {
  const arr = base.slice();
  let sum = arr.reduce((a, b) => a + b, 0);
  if (sum === target) return arr;

  const canRaise = () => arr.some((n) => n < maxPerItem);
  const canLower = () => arr.some((n) => n > minPerItem);

  while (sum < target && canRaise()) {
    const idx = randIntWithRng(0, arr.length - 1, rng);
    if (arr[idx] < maxPerItem) {
      arr[idx] += 1;
      sum += 1;
    }
  }

  while (sum > target && canLower()) {
    const idx = randIntWithRng(0, arr.length - 1, rng);
    if (arr[idx] > minPerItem) {
      arr[idx] -= 1;
      sum -= 1;
    }
  }

  if (sum !== target) {
    throw new Error(`Unable to distribute exactly to target (${target}); ended at ${sum}`);
  }
  return arr;
}

function buildBackfillId(dateKey, hourUtc, globalIndex) {
  const ymd = dateKey.replace(/-/g, "");
  const hh = String(hourUtc).padStart(2, "0");
  return `evt_backfill_${ymd}T${hh}0000Z_${globalIndex}`;
}

function sortByTs(events) {
  return events.slice().sort((a, b) => {
    const ta = new Date(a.ts).getTime();
    const tb = new Date(b.ts).getTime();
    return ta - tb;
  });
}

function cleanNdjsonLines(raw) {
  return raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line !== "" && !line.startsWith("#"));
}

async function loadCleanEvents(filePath = EVENTS_PATH) {
  const raw = await fs.readFile(filePath, "utf8");
  const cleaned = cleanNdjsonLines(raw);
  const events = [];
  for (const line of cleaned) {
    try {
      events.push(JSON.parse(line));
    } catch (err) {
      throw new Error(`Invalid JSON event line: ${line}\n${err.message}`);
    }
  }
  return events;
}

function generatePushupBackfill({
  startDate,
  endDate,
  skipDate,
  totalReps,
  dailyMinSets = 2,
  dailyMaxSets = 5,
  timezone = "America/New_York",
  seed = "2026-03-07-backfill",
}) {
  if (!isIsoDateKey(startDate) || !isIsoDateKey(endDate) || !isIsoDateKey(skipDate)) {
    throw new Error("startDate/endDate/skipDate must be YYYY-MM-DD");
  }
  if (!Number.isInteger(totalReps) || totalReps <= 0) {
    throw new Error("totalReps must be a positive integer");
  }
  if (!Number.isInteger(dailyMinSets) || !Number.isInteger(dailyMaxSets) || dailyMinSets < 1 || dailyMinSets > dailyMaxSets) {
    throw new Error("dailyMinSets/dailyMaxSets are invalid");
  }

  const allDates = dateRangeInclusive(startDate, endDate);
  const activeDates = allDates.filter((d) => d !== skipDate);
  if (activeDates.length === 0) throw new Error("No active dates after applying skipDate");
  const rng = makeRng(seed);

  const setsByDay = activeDates.map(() => randIntWithRng(dailyMinSets, dailyMaxSets, rng));
  const totalSets = setsByDay.reduce((a, b) => a + b, 0);
  const minPossible = totalSets * 15;
  const maxPossible = totalSets * 60;
  if (totalReps < minPossible || totalReps > maxPossible) {
    throw new Error(`Target ${totalReps} not feasible with ${totalSets} sets (${minPossible}-${maxPossible})`);
  }

  const randomSetReps = Array.from({ length: totalSets }, () => randIntWithRng(15, 60, rng));
  const adjustedSetReps = distributeToTarget(randomSetReps, totalReps, 15, 60, rng);

  let repCursor = 0;
  let globalId = 0;
  const events = [];

  for (let dayIdx = 0; dayIdx < activeDates.length; dayIdx += 1) {
    const dateKey = activeDates[dayIdx];
    const setCount = setsByDay[dayIdx];
    for (let setIdx = 0; setIdx < setCount; setIdx += 1) {
      const hour = 12 + setIdx;
      const hourStr = String(hour).padStart(2, "0");
      events.push({
        schema: 1,
        id: buildBackfillId(dateKey, hour, globalId),
        ts: `${dateKey}T${hourStr}:00:00.000Z`,
        tz: timezone,
        type: "pushups.set",
        reps: adjustedSetReps[repCursor],
        source: "manual",
        tags: [],
        note: "backfill",
      });
      globalId += 1;
      repCursor += 1;
    }
  }

  const computedTotal = events.reduce((sum, evt) => sum + (Number(evt.reps) || 0), 0);
  if (computedTotal !== totalReps) {
    throw new Error(`Backfill sum mismatch: expected ${totalReps}, got ${computedTotal}`);
  }

  return events;
}

function buildFinalEvent27() {
  return {
    schema: 1,
    id: "evt_20260307T120000Z_final27",
    ts: "2026-03-07T12:00:00.000Z",
    tz: "America/New_York",
    type: "pushups.set",
    reps: 27,
    source: "manual",
    tags: [],
    note: "final correction set",
  };
}

function stripPriorRepairEvents(events) {
  return events.filter((evt) => {
    const id = String(evt && evt.id ? evt.id : "");
    const note = String(evt && evt.note ? evt.note : "");
    const ts = String(evt && evt.ts ? evt.ts : "");
    const isBackfillInTargetWindow =
      note === "backfill"
      && ts >= "2026-02-22T00:00:00.000Z"
      && ts <= "2026-03-07T23:59:59.999Z";
    return !id.startsWith("evt_backfill_") && !id.endsWith("_final27") && !isBackfillInTargetWindow;
  });
}

async function writeEvents(filePath, events) {
  const payload = sortByTs(events).map((evt) => JSON.stringify(evt)).join("\n");
  const tempPath = `${filePath}.tmp`;
  await fs.writeFile(tempPath, payload ? `${payload}\n` : "", "utf8");
  await fs.rename(tempPath, filePath);
}

async function main() {
  const currentEvents = await loadCleanEvents(EVENTS_PATH);
  const baseEvents = stripPriorRepairEvents(currentEvents);

  const backfill = generatePushupBackfill({
    startDate: "2026-02-22",
    endDate: "2026-03-07",
    skipDate: "2026-03-01",
    totalReps: 1359,
    dailyMinSets: 2,
    dailyMaxSets: 5,
    timezone: "America/New_York",
  });
  const final27 = buildFinalEvent27();

  const combined = baseEvents.concat(backfill, final27);
  await writeEvents(EVENTS_PATH, combined);

  const totalAdded = backfill.reduce((sum, evt) => sum + evt.reps, 0) + final27.reps;
  console.log(`Cleaned + repaired events written: ${combined.length}`);
  console.log(`Backfill reps added: ${totalAdded} (expected 1386)`);
}

if (require.main === module) {
  main().catch((err) => {
    console.error("Repair failed:", err.message || err);
    process.exit(1);
  });
}

module.exports = {
  cleanNdjsonLines,
  loadCleanEvents,
  generatePushupBackfill,
  buildFinalEvent27,
  stripPriorRepairEvents,
};
