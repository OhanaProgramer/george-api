const fs = require("fs/promises");
const path = require("path");

const BASE_DIR = path.join(__dirname, "..", "..", "..", "data", "pushups");
const EVENTS_FILE = path.join(BASE_DIR, "events.json");
const DERIVED_FILE = path.join(BASE_DIR, "derived.json");
const PUBLISH_FILE = path.join(BASE_DIR, "publish.json");

async function readJson(filePath, fallback) {
  try {
    const raw = await fs.readFile(filePath, "utf8");
    return JSON.parse(raw);
  } catch (err) {
    if (err.code === "ENOENT") return fallback;
    throw new Error(`Failed to read ${filePath}: ${err.message}`);
  }
}

async function writeJson(filePath, data) {
  try {
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, `${JSON.stringify(data, null, 2)}\n`, "utf8");
  } catch (err) {
    throw new Error(`Failed to write ${filePath}: ${err.message}`);
  }
}

async function readEvents() {
  return readJson(EVENTS_FILE, {});
}

async function writeEvents(data) {
  return writeJson(EVENTS_FILE, data);
}

async function readDerived() {
  return readJson(DERIVED_FILE, {});
}

async function writeDerived(data) {
  return writeJson(DERIVED_FILE, data);
}

async function readPublish() {
  return readJson(PUBLISH_FILE, {});
}

async function writePublish(data) {
  return writeJson(PUBLISH_FILE, data);
}

module.exports = {
  readEvents,
  writeEvents,
  readDerived,
  writeDerived,
  readPublish,
  writePublish,
};
