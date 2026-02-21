const fs = require("fs/promises");
const path = require("path");
const {
  appendNDJSON,
  readNDJSON,
} = require("../../core/eventStore");

const basePath = path.join(process.cwd(), "data", "pushups");
const eventsPath = path.join(basePath, "events.json");
const eventsNdjsonPath = path.join(basePath, "events.ndjson");
const legacyPath = path.join(process.cwd(), "data", "pushups.json");
const derivedPath = path.join(basePath, "derived.json");
const publishPath = path.join(basePath, "publish.json");

async function ensureDir() {
  await fs.mkdir(basePath, { recursive: true });
}

async function readJson(filePath, fallback) {
  try {
    await ensureDir();
    const raw = await fs.readFile(filePath, "utf8");
    return JSON.parse(raw);
  } catch (err) {
    if (err.code === "ENOENT") {
      await writeJson(filePath, fallback);
      return fallback;
    }
    throw new Error(`Failed to read ${filePath}: ${err.message}`);
  }
}

function normalizeEvent(entry, n = 0) {
  const ts = String(entry && entry.ts ? entry.ts : new Date().toISOString());
  const reps = Number(entry && entry.reps);
  return {
    schema: 1,
    id: entry && entry.id ? String(entry.id) : `evt_${ts.replace(/[^0-9A-Za-z]/g, "")}_${n}`,
    ts,
    tz: "America/New_York",
    type: "pushups.set",
    reps: Number.isFinite(reps) ? Math.trunc(reps) : 0,
    source: entry && entry.source ? String(entry.source) : "unknown",
    tags: Array.isArray(entry && entry.tags) ? entry.tags : [],
    note: entry && entry.note ? String(entry.note) : "",
  };
}

function sortByTsAsc(events) {
  return [...events].sort((a, b) => {
    const ta = new Date(a.ts).getTime();
    const tb = new Date(b.ts).getTime();
    return ta - tb;
  });
}

async function statSize(filePath) {
  try {
    const st = await fs.stat(filePath);
    return st.size;
  } catch (err) {
    if (err.code === "ENOENT") return 0;
    throw err;
  }
}

async function writeJson(filePath, data) {
  try {
    await ensureDir();
    await fs.writeFile(filePath, `${JSON.stringify(data, null, 2)}\n`, "utf8");
  } catch (err) {
    throw new Error(`Failed to write ${filePath}: ${err.message}`);
  }
}

async function readEvents() {
  await ensureDir();

  const ndjsonSize = await statSize(eventsNdjsonPath);
  if (ndjsonSize <= 0) {
    console.warn("pushups.readEvents: events.ndjson missing or empty; returning []");
    return [];
  }

  const ndjsonEvents = await readNDJSON(eventsNdjsonPath);
  return sortByTsAsc(ndjsonEvents.map((evt, i) => normalizeEvent(evt, i)));
}

async function writeEvents(data) {
  return writeJson(eventsPath, data);
}

async function appendEvent(evt) {
  const normalized = normalizeEvent(evt, Date.now());
  await appendNDJSON(eventsNdjsonPath, normalized);
  return normalized;
}

async function readLegacyEventsForMigrationOnly() {
  const legacySize = await statSize(legacyPath);
  if (legacySize <= 0) return [];
  const legacy = await readJson(legacyPath, {});
  const log = Array.isArray(legacy && legacy.log) ? legacy.log : [];
  return sortByTsAsc(log.map((evt, i) => normalizeEvent(evt, i)));
}

async function readDerived() {
  return readJson(derivedPath, {});
}

async function writeDerived(data) {
  return writeJson(derivedPath, data);
}

async function readPublish() {
  return readJson(publishPath, {});
}

async function writePublish(data) {
  return writeJson(publishPath, data);
}

module.exports = {
  readEvents,
  writeEvents,
  appendEvent,
  readLegacyEventsForMigrationOnly,
  readDerived,
  writeDerived,
  readPublish,
  writePublish,
};
