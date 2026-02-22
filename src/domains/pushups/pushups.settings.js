const fs = require("fs/promises");
const path = require("path");

const settingsDir = path.join(process.cwd(), "data", "pushups");
const settingsPath = path.join(settingsDir, "settings.json");

const DEFAULT_SETTINGS = {
  schema: 1,
  goal_total: 30000,
  target_date: "2026-12-31",
  target_daily_override: 0,
};

function cloneDefaults() {
  return { ...DEFAULT_SETTINGS };
}

async function ensureDir() {
  await fs.mkdir(settingsDir, { recursive: true });
}

function isValidDateKey(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value))) return false;
  const [y, m, d] = String(value).split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (Number.isNaN(dt.getTime())) return false;
  return (
    dt.getUTCFullYear() === y &&
    dt.getUTCMonth() + 1 === m &&
    dt.getUTCDate() === d
  );
}

function normalizeSettings(input) {
  const goalTotal = Number(input && input.goal_total);
  const targetDate = String(input && input.target_date ? input.target_date : "");
  const targetDailyOverride = Number(input && input.target_daily_override);

  if (!Number.isInteger(goalTotal) || goalTotal < 1) {
    throw new Error("goal_total must be an integer >= 1");
  }
  if (!isValidDateKey(targetDate)) {
    throw new Error("target_date must be a valid YYYY-MM-DD");
  }
  if (!Number.isInteger(targetDailyOverride) || targetDailyOverride < 0) {
    throw new Error("target_daily_override must be an integer >= 0");
  }

  return {
    schema: 1,
    goal_total: goalTotal,
    target_date: targetDate,
    target_daily_override: targetDailyOverride,
  };
}

async function readSettings() {
  try {
    await ensureDir();
    const raw = await fs.readFile(settingsPath, "utf8");
    const parsed = JSON.parse(raw);
    return normalizeSettings({
      goal_total: parsed.goal_total,
      target_date: parsed.target_date,
      target_daily_override: parsed.target_daily_override,
    });
  } catch (err) {
    if (err.code === "ENOENT") return cloneDefaults();
    if (err instanceof SyntaxError) {
      throw new Error(`Invalid settings JSON at ${settingsPath}`);
    }
    throw err;
  }
}

async function writeSettings(obj) {
  const normalized = normalizeSettings(obj);
  await ensureDir();
  const tmpPath = `${settingsPath}.tmp`;
  await fs.writeFile(tmpPath, `${JSON.stringify(normalized, null, 2)}\n`, "utf8");
  await fs.rename(tmpPath, settingsPath);
  return normalized;
}

module.exports = {
  DEFAULT_SETTINGS,
  readSettings,
  writeSettings,
};
