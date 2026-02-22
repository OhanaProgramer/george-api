#!/usr/bin/env node
const fs = require("fs/promises");
const path = require("path");
const { appendNDJSON, ensureDir, readNDJSON } = require("../src/core/eventStore");
const { eventFingerprint } = require("../src/core/fingerprint");

const EVENTS_FILE = path.join(process.cwd(), "data", "pushups", "events.ndjson");
const BACKUP_DIR = path.join(process.cwd(), "data", "pushups", "backups");
const DEFAULT_TZ = "America/New_York";

function usage() {
  return [
    "Usage:",
    "  node scripts/import_pushups_events.js --in <path> [--apply]",
    "",
    "Options:",
    "  --in <path>                 Input file path (required)",
    "  --apply                     Append new events to events.ndjson (default is dry run)",
    "  --format <auto|legacy|ndjson|jsonarray>  Input format (default: auto)",
    "  --since <YYYY-MM-DD>        Skip events older than this local date",
    "  --help                      Show this help",
  ].join("\n");
}

function parseArgs(argv) {
  const args = {
    apply: false,
    format: "auto",
    input: "",
    since: "",
    help: false,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === "--help" || a === "-h") {
      args.help = true;
      continue;
    }
    if (a === "--apply") {
      args.apply = true;
      continue;
    }
    if (a === "--in") {
      args.input = argv[i + 1] || "";
      i += 1;
      continue;
    }
    if (a === "--format") {
      args.format = (argv[i + 1] || "").toLowerCase();
      i += 1;
      continue;
    }
    if (a === "--since") {
      args.since = argv[i + 1] || "";
      i += 1;
      continue;
    }
    throw new Error(`Unknown argument: ${a}`);
  }

  if (!["auto", "legacy", "ndjson", "jsonarray"].includes(args.format)) {
    throw new Error(`Invalid --format value: ${args.format}`);
  }

  if (args.since && !/^\d{4}-\d{2}-\d{2}$/.test(args.since)) {
    throw new Error("Invalid --since value (expected YYYY-MM-DD)");
  }

  return args;
}

function toDateKeyInTz(date, timeZone = DEFAULT_TZ) {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const parts = Object.fromEntries(
    fmt
      .formatToParts(date)
      .filter((p) => p.type !== "literal")
      .map((p) => [p.type, p.value])
  );
  return `${parts.year}-${parts.month}-${parts.day}`;
}

function parseJsonArrayOrLegacy(raw) {
  const parsed = JSON.parse(raw);
  if (Array.isArray(parsed)) return { format: "jsonarray", rows: parsed };
  if (parsed && Array.isArray(parsed.log)) return { format: "legacy", rows: parsed.log };
  throw new Error("JSON input is not legacy {log:[...]} or a JSON array");
}

async function detectAndParseInput(filePath, forcedFormat) {
  const raw = await fs.readFile(filePath, "utf8");
  const ext = path.extname(filePath).toLowerCase();

  if (forcedFormat === "ndjson") {
    return {
      format: "ndjson",
      rows: raw.split("\n").map((l) => l.trim()).filter(Boolean).map((l) => JSON.parse(l)),
    };
  }
  if (forcedFormat === "legacy" || forcedFormat === "jsonarray") {
    const { format, rows } = parseJsonArrayOrLegacy(raw);
    if (forcedFormat !== format) {
      throw new Error(`Input does not match --format ${forcedFormat} (detected ${format})`);
    }
    return { format, rows };
  }

  if (ext === ".ndjson") {
    return {
      format: "ndjson",
      rows: raw.split("\n").map((l) => l.trim()).filter(Boolean).map((l) => JSON.parse(l)),
    };
  }

  return parseJsonArrayOrLegacy(raw);
}

function normalizeIncoming(row, { warn }) {
  if (!row || typeof row !== "object") {
    warn("Skipping non-object row");
    return null;
  }

  const tsRaw = row.ts;
  if (!tsRaw) {
    warn("Skipping row with missing ts");
    return null;
  }
  const dt = new Date(tsRaw);
  if (Number.isNaN(dt.getTime())) {
    warn(`Skipping row with invalid ts: ${String(tsRaw)}`);
    return null;
  }
  const ts = dt.toISOString();

  const repsNum = Number(row.reps);
  if (!Number.isFinite(repsNum)) {
    warn(`Skipping row with invalid reps: ${String(row.reps)}`);
    return null;
  }
  const reps = Math.trunc(repsNum);
  if (reps < 0) {
    warn(`Skipping row with negative reps: ${String(row.reps)}`);
    return null;
  }

  const source = row.source ? String(row.source) : "unknown";
  const note = row.note ? String(row.note) : "";
  const tags = Array.isArray(row.tags) ? row.tags.map((t) => String(t)) : [];
  const type = "pushups.set";
  const fp = eventFingerprint({ ts, type, reps, source, note });
  const id = row.id ? String(row.id) : `evt_${fp}`;

  return {
    schema: 1,
    id,
    ts,
    tz: row.tz ? String(row.tz) : DEFAULT_TZ,
    type,
    reps,
    source,
    tags,
    note,
    _dedupeKey: row.id ? `id:${id}` : `fp:${fp}`,
    _fingerprint: fp,
  };
}

function sortByTsAsc(events) {
  return [...events].sort((a, b) => new Date(a.ts).getTime() - new Date(b.ts).getTime());
}

function timestampLabel(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  const hh = String(date.getHours()).padStart(2, "0");
  const mm = String(date.getMinutes()).padStart(2, "0");
  const ss = String(date.getSeconds()).padStart(2, "0");
  return `${y}${m}${d}-${hh}${mm}${ss}`;
}

async function backupEventsNdjson() {
  await ensureDir(BACKUP_DIR);
  const backupPath = path.join(BACKUP_DIR, `events.ndjson.${timestampLabel()}`);
  try {
    await fs.copyFile(EVENTS_FILE, backupPath);
    return backupPath;
  } catch (err) {
    if (err.code === "ENOENT") {
      await fs.writeFile(backupPath, "", "utf8");
      return backupPath;
    }
    throw err;
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  if (args.help) {
    console.log(usage());
    process.exit(0);
  }
  if (!args.input) {
    console.error(usage());
    process.exit(1);
  }

  const inputPath = path.resolve(process.cwd(), args.input);
  const existing = await readNDJSON(EVENTS_FILE);
  const existingSeen = new Set();
  for (const evt of existing) {
    const fp = eventFingerprint(evt);
    existingSeen.add(`fp:${fp}`);
    if (evt && evt.id) existingSeen.add(`id:${String(evt.id)}`);
  }

  const warnings = [];
  const warn = (msg) => warnings.push(msg);
  const parsed = await detectAndParseInput(inputPath, args.format);

  let inputCount = 0;
  let filteredBySince = 0;
  let invalidSkipped = 0;
  let duplicateSkipped = 0;
  const staged = [];
  const localSeen = new Set(existingSeen);

  for (const row of parsed.rows) {
    inputCount += 1;
    const evt = normalizeIncoming(row, { warn });
    if (!evt) {
      invalidSkipped += 1;
      continue;
    }

    if (args.since) {
      const dateKey = toDateKeyInTz(new Date(evt.ts), DEFAULT_TZ);
      if (dateKey < args.since) {
        filteredBySince += 1;
        continue;
      }
    }

    const dedupeKeys = [evt._dedupeKey, `fp:${evt._fingerprint}`];
    if (dedupeKeys.some((k) => localSeen.has(k))) {
      duplicateSkipped += 1;
      continue;
    }
    for (const k of dedupeKeys) localSeen.add(k);
    staged.push(evt);
  }

  const newEvents = sortByTsAsc(staged).map(({ _dedupeKey, _fingerprint, ...evt }) => evt);

  console.log(`Detected format: ${parsed.format}`);
  console.log(`Input file: ${inputPath}`);
  console.log(`Mode: ${args.apply ? "APPLY" : "DRY RUN"}`);
  if (args.since) console.log(`Since filter: ${args.since}`);
  console.log(`Events in input: ${inputCount}`);
  console.log(`Existing events in NDJSON: ${existing.length}`);
  console.log(`New events to append: ${newEvents.length}`);
  console.log(`Duplicates skipped: ${duplicateSkipped}`);
  console.log(`Filtered by --since: ${filteredBySince}`);
  console.log(`Invalid/skipped rows: ${invalidSkipped}`);

  if (warnings.length) {
    const preview = warnings.slice(0, 10);
    for (const msg of preview) console.warn(`WARN: ${msg}`);
    if (warnings.length > preview.length) {
      console.warn(`WARN: ... ${warnings.length - preview.length} more warnings`);
    }
  }

  if (!args.apply) return;

  const backupPath = await backupEventsNdjson();
  for (const evt of newEvents) {
    await appendNDJSON(EVENTS_FILE, evt);
  }
  console.log(`Appended events: ${newEvents.length}`);
  console.log(`Backup file: ${backupPath}`);
}

main().catch((err) => {
  console.error(`Fatal: ${err.message}`);
  process.exit(1);
});
