const fs = require("fs/promises");
const path = require("path");

const legacyPath = path.join(process.cwd(), "data", "pushups.json");
const eventsPath = path.join(process.cwd(), "data", "pushups", "events.json");

function isNonEmptyJson(value) {
  if (Array.isArray(value)) return value.length > 0;
  if (value && typeof value === "object") return Object.keys(value).length > 0;
  return Boolean(value);
}

async function exists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function main() {
  await fs.mkdir(path.dirname(eventsPath), { recursive: true });

  if (await exists(eventsPath)) {
    try {
      const raw = await fs.readFile(eventsPath, "utf8");
      const parsed = JSON.parse(raw);
      if (isNonEmptyJson(parsed)) {
        console.log("events.json already present; skipping migration");
        return;
      }
    } catch {
      // If file is invalid/empty, continue and attempt migration.
    }
  }

  if (!(await exists(legacyPath))) {
    console.log("no legacy file; nothing to migrate");
    return;
  }

  const legacyRaw = await fs.readFile(legacyPath, "utf8");
  const legacyParsed = JSON.parse(legacyRaw);
  await fs.writeFile(eventsPath, `${JSON.stringify(legacyParsed, null, 2)}\n`, "utf8");
  console.log(`migrated legacy data to ${eventsPath}`);
}

main().catch((err) => {
  console.error("migration failed:", err.message);
  process.exit(1);
});
