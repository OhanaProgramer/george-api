const fs = require("fs/promises");
const path = require("path");

const healthDir = path.join(process.cwd(), "data", "health");
const dailyMetricsPath = path.join(healthDir, "daily_metrics.json");

async function ensureHealthDir() {
  await fs.mkdir(healthDir, { recursive: true });
}

function defaultDailyMetrics() {
  return {};
}

async function readDailyMetrics() {
  await ensureHealthDir();
  try {
    const raw = await fs.readFile(dailyMetricsPath, "utf8");
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new Error("daily_metrics.json must contain an object keyed by date");
    }
    return parsed;
  } catch (err) {
    if (err.code === "ENOENT") {
      const empty = defaultDailyMetrics();
      await writeDailyMetrics(empty);
      return empty;
    }
    throw new Error(`Failed to read health daily metrics: ${err.message}`);
  }
}

async function writeDailyMetrics(metricsByDate) {
  await ensureHealthDir();
  const tempPath = `${dailyMetricsPath}.tmp`;
  const payload = `${JSON.stringify(metricsByDate, null, 2)}\n`;
  await fs.writeFile(tempPath, payload, "utf8");
  await fs.rename(tempPath, dailyMetricsPath);
}

module.exports = {
  dailyMetricsPath,
  readDailyMetrics,
  writeDailyMetrics,
};
