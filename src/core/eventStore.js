const fs = require("fs/promises");
const path = require("path");

async function ensureDir(dirPath) {
  await fs.mkdir(dirPath, { recursive: true });
}

async function appendNDJSON(filePath, obj) {
  await ensureDir(path.dirname(filePath));
  const line = `${JSON.stringify(obj)}\n`;
  await fs.appendFile(filePath, line, "utf8");
}

async function readNDJSON(filePath) {
  try {
    const raw = await fs.readFile(filePath, "utf8");
    return raw
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => JSON.parse(line));
  } catch (err) {
    if (err.code === "ENOENT") return [];
    throw err;
  }
}

async function writeNDJSON(filePath, events) {
  await ensureDir(path.dirname(filePath));
  const payload = Array.isArray(events) && events.length
    ? `${events.map((e) => JSON.stringify(e)).join("\n")}\n`
    : "";
  await fs.writeFile(filePath, payload, "utf8");
}

module.exports = {
  ensureDir,
  appendNDJSON,
  readNDJSON,
  writeNDJSON,
};
