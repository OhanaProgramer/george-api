const fs = require("fs/promises");
const path = require("path");
const { ensureDir, writeNDJSON } = require("../src/core/eventStore");

const LEGACY_FILE = path.join(process.cwd(), "data", "pushups.json");
const NDJSON_FILE = path.join(process.cwd(), "data", "pushups", "events.ndjson");

function toEvent(entry, index) {
  const ts = entry.ts || new Date(0).toISOString();
  return {
    schema: 1,
    id: `evt_${String(ts).replace(/[^0-9A-Za-z]/g, "")}_${index}`,
    ts,
    tz: "America/New_York",
    type: "pushups.set",
    reps: Number(entry.reps) || 0,
    source: entry.source || "unknown",
    tags: [],
    note: entry.note || "",
  };
}

async function ndjsonExistsAndNonEmpty() {
  try {
    const st = await fs.stat(NDJSON_FILE);
    return st.size > 0;
  } catch (err) {
    if (err.code === "ENOENT") return false;
    throw err;
  }
}

async function main() {
  await ensureDir(path.dirname(NDJSON_FILE));

  const force = process.env.FORCE === "1";
  if (!force && (await ndjsonExistsAndNonEmpty())) {
    console.log("events.ndjson already exists and is non-empty; skipping (set FORCE=1 to overwrite)");
    return;
  }

  const legacyRaw = await fs.readFile(LEGACY_FILE, "utf8");
  const legacyData = JSON.parse(legacyRaw);
  const log = Array.isArray(legacyData.log) ? legacyData.log : [];
  const events = log.map(toEvent);

  await writeNDJSON(NDJSON_FILE, events);
  console.log(`exported ${events.length} events to ${NDJSON_FILE}`);
}

main().catch((err) => {
  console.error("export failed:", err.message);
  process.exit(1);
});
