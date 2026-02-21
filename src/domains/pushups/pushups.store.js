const fs = require("fs/promises");
const path = require("path");

const basePath = path.join(process.cwd(), "data", "pushups");
const eventsPath = path.join(basePath, "events.json");
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

async function writeJson(filePath, data) {
  try {
    await ensureDir();
    await fs.writeFile(filePath, `${JSON.stringify(data, null, 2)}\n`, "utf8");
  } catch (err) {
    throw new Error(`Failed to write ${filePath}: ${err.message}`);
  }
}

async function readEvents() {
  return readJson(eventsPath, {});
}

async function writeEvents(data) {
  return writeJson(eventsPath, data);
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
  readDerived,
  writeDerived,
  readPublish,
  writePublish,
};
