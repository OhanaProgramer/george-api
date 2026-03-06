const fs = require("fs/promises");
const path = require("path");

const runningDir = path.join(process.cwd(), "data", "running");
const runningCheckDailyPath = path.join(runningDir, "running_check_daily.json");

async function ensureRunningDir() {
  await fs.mkdir(runningDir, { recursive: true });
}

function defaultDailyChecks() {
  return {};
}

async function readRunningCheckDaily() {
  await ensureRunningDir();
  try {
    const raw = await fs.readFile(runningCheckDailyPath, "utf8");
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new Error("running_check_daily.json must contain an object keyed by date");
    }
    return parsed;
  } catch (err) {
    if (err.code === "ENOENT") {
      const empty = defaultDailyChecks();
      await writeRunningCheckDaily(empty);
      return empty;
    }
    throw new Error(`Failed to read running check daily data: ${err.message}`);
  }
}

async function writeRunningCheckDaily(dailyData) {
  await ensureRunningDir();
  const tmpPath = `${runningCheckDailyPath}.tmp`;
  const payload = `${JSON.stringify(dailyData, null, 2)}\n`;
  await fs.writeFile(tmpPath, payload, "utf8");
  await fs.rename(tmpPath, runningCheckDailyPath);
}

module.exports = {
  runningCheckDailyPath,
  readRunningCheckDaily,
  writeRunningCheckDaily,
};
