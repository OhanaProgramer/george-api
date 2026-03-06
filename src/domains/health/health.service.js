const {
  readDailyMetrics,
  writeDailyMetrics,
} = require("./health.store");

const APP_TIMEZONE = process.env.APP_TIMEZONE || process.env.TZ || "America/New_York";
const DAY_MS = 24 * 60 * 60 * 1000;

function formatDateKeyLocal(date = new Date()) {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: APP_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const parts = Object.fromEntries(
    fmt
      .formatToParts(date)
      .filter((x) => x.type !== "literal")
      .map((x) => [x.type, x.value])
  );
  return `${parts.year}-${parts.month}-${parts.day}`;
}

function dateKeyFromOffset(days) {
  const dt = new Date();
  dt.setDate(dt.getDate() + days);
  return formatDateKeyLocal(dt);
}

function ensureDateKey(dateKey) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(dateKey || ""))) {
    throw new Error("date must be YYYY-MM-DD");
  }
  const dt = new Date(`${dateKey}T00:00:00Z`);
  if (Number.isNaN(dt.getTime())) {
    throw new Error("date must be valid YYYY-MM-DD");
  }
  return dateKey;
}

function isLockedMetric(metric, nowMs = Date.now()) {
  const until = new Date(metric && metric.locked_until ? metric.locked_until : "").getTime();
  return Number.isFinite(until) && until > nowMs;
}

function metricValue(metric, fallback = "") {
  if (!metric || typeof metric !== "object" || !("value" in metric)) return fallback;
  return metric.value;
}

function toMetric(value, source = "manual", now = new Date()) {
  const savedAt = now.toISOString();
  return {
    value,
    source: String(source || "manual"),
    saved_at: savedAt,
    locked_until: new Date(now.getTime() + DAY_MS).toISOString(),
  };
}

function validateRecoveryPayload(payload) {
  const sleepHours = Number(payload.sleep_hours);
  const restingHr = Number(payload.resting_hr);
  const hrvMs = Number(payload.hrv_ms);

  if (!Number.isFinite(sleepHours) || sleepHours < 0 || sleepHours > 14) {
    throw new Error("sleep_hours must be a number between 0.0 and 14.0");
  }
  const sleepTenths = Math.round(sleepHours * 10);
  if (Math.abs((sleepTenths / 10) - sleepHours) > 1e-9) {
    throw new Error("sleep_hours must allow at most one decimal place");
  }
  if (!Number.isInteger(restingHr) || restingHr < 30 || restingHr > 120) {
    throw new Error("resting_hr must be an integer between 30 and 120");
  }
  if (!Number.isInteger(hrvMs) || hrvMs < 5 || hrvMs > 300) {
    throw new Error("hrv_ms must be an integer between 5 and 300");
  }

  return {
    sleep_hours: sleepTenths / 10,
    resting_hr: restingHr,
    hrv_ms: hrvMs,
  };
}

function validatePainPayload(payload) {
  const rawPain = payload.pain_flag;
  let painFlag = false;
  if (typeof rawPain === "boolean") {
    painFlag = rawPain;
  } else {
    const normalized = String(rawPain || "").toLowerCase();
    painFlag = normalized === "1" || normalized === "true" || normalized === "on" || normalized === "yes";
  }

  const painNote = String(payload.pain_note || "").trim();
  if (painNote.length > 80) {
    throw new Error("pain_note must be 80 characters or fewer");
  }

  return { pain_flag: painFlag, pain_note: painNote };
}

function extractBlockLock(entry, fields) {
  const nowMs = Date.now();
  let lockedUntil = "";
  let savedAt = "";
  let locked = false;

  for (const field of fields) {
    const metric = entry && entry[field];
    if (!metric) continue;
    const metricLockedUntil = String(metric.locked_until || "");
    if (isLockedMetric(metric, nowMs)) {
      locked = true;
      lockedUntil = metricLockedUntil;
      savedAt = String(metric.saved_at || "");
      break;
    }
    if (!lockedUntil && metricLockedUntil) {
      lockedUntil = metricLockedUntil;
    }
    if (!savedAt && metric.saved_at) {
      savedAt = String(metric.saved_at);
    }
  }

  return { locked, lockedUntil, savedAt };
}

function toLogHealthModel(dailyMetrics) {
  const todayKey = dateKeyFromOffset(0);
  const yesterdayKey = dateKeyFromOffset(-1);
  const todayEntry = dailyMetrics[todayKey] || {};
  const yesterdayEntry = dailyMetrics[yesterdayKey] || {};

  const recoveryLock = extractBlockLock(yesterdayEntry, ["sleep_hours", "resting_hr", "hrv_ms"]);
  const painLock = extractBlockLock(todayEntry, ["pain_flag", "pain_note"]);

  return {
    recovery: {
      dateKey: yesterdayKey,
      sleep_hours: metricValue(yesterdayEntry.sleep_hours, ""),
      resting_hr: metricValue(yesterdayEntry.resting_hr, ""),
      hrv_ms: metricValue(yesterdayEntry.hrv_ms, ""),
      locked: recoveryLock.locked,
      locked_until: recoveryLock.lockedUntil,
      saved_at: recoveryLock.savedAt,
    },
    pain: {
      dateKey: todayKey,
      pain_flag: Boolean(metricValue(todayEntry.pain_flag, false)),
      pain_note: String(metricValue(todayEntry.pain_note, "")),
      locked: painLock.locked,
      locked_until: painLock.lockedUntil,
      saved_at: painLock.savedAt,
    },
  };
}

async function getHealthDaily(dateKey) {
  const key = ensureDateKey(String(dateKey || ""));
  const all = await readDailyMetrics();
  return {
    date: key,
    metrics: all[key] || {},
  };
}

async function saveHealthDaily({ date, payload, source = "manual" }) {
  const key = ensureDateKey(String(date || ""));
  const all = await readDailyMetrics();
  const current = all[key] || {};
  const now = new Date();
  const next = { ...current };
  const normalizedSource = String(source || "manual");

  const hasRecoveryFields = payload && (
    Object.prototype.hasOwnProperty.call(payload, "sleep_hours")
      || Object.prototype.hasOwnProperty.call(payload, "resting_hr")
      || Object.prototype.hasOwnProperty.call(payload, "hrv_ms")
  );
  const hasPainFields = payload && (
    Object.prototype.hasOwnProperty.call(payload, "pain_flag")
      || Object.prototype.hasOwnProperty.call(payload, "pain_note")
  );

  if (!hasRecoveryFields && !hasPainFields) {
    throw new Error("No supported fields provided");
  }

  if (hasRecoveryFields) {
    // Keep block-level lock so manual and future Apple Health writes share the same guardrail.
    const locked = extractBlockLock(current, ["sleep_hours", "resting_hr", "hrv_ms"]);
    if (locked.locked) {
      const err = new Error("Recovery block is locked");
      err.code = "LOCKED";
      err.locked_until = locked.lockedUntil;
      throw err;
    }
    const recovery = validateRecoveryPayload(payload);
    next.sleep_hours = toMetric(recovery.sleep_hours, normalizedSource, now);
    next.resting_hr = toMetric(recovery.resting_hr, normalizedSource, now);
    next.hrv_ms = toMetric(recovery.hrv_ms, normalizedSource, now);
  }

  if (hasPainFields) {
    // Same metric envelope (value/source/saved_at/locked_until) supports multiple ingestion sources.
    const locked = extractBlockLock(current, ["pain_flag", "pain_note"]);
    if (locked.locked) {
      const err = new Error("Pain/Injury block is locked");
      err.code = "LOCKED";
      err.locked_until = locked.lockedUntil;
      throw err;
    }
    const pain = validatePainPayload(payload);
    next.pain_flag = toMetric(pain.pain_flag, normalizedSource, now);
    next.pain_note = toMetric(pain.pain_note, normalizedSource, now);
  }

  all[key] = next;
  await writeDailyMetrics(all);
  return {
    date: key,
    metrics: next,
  };
}

async function saveRecoveryYesterday(payload) {
  return saveHealthDaily({
    date: dateKeyFromOffset(-1),
    payload,
    source: "manual",
  });
}

async function savePainToday(payload) {
  return saveHealthDaily({
    date: dateKeyFromOffset(0),
    payload,
    source: "manual",
  });
}

async function getLogHealthModel() {
  const metrics = await readDailyMetrics();
  return toLogHealthModel(metrics);
}

module.exports = {
  APP_TIMEZONE,
  ensureDateKey,
  getHealthDaily,
  saveHealthDaily,
  saveRecoveryYesterday,
  savePainToday,
  getLogHealthModel,
};
