const fs = require("fs/promises");
const { latestActivitiesExportPath } = require("../strava/strava.store");
const {
  readRunningCheckDaily,
  writeRunningCheckDaily,
} = require("./runningCheck.store");

const APP_TIMEZONE = process.env.APP_TIMEZONE || process.env.TZ || "America/New_York";

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

function parseBoolean(value) {
  if (typeof value === "boolean") return value;
  const normalized = String(value || "").trim().toLowerCase();
  return normalized === "1" || normalized === "true" || normalized === "yes" || normalized === "on";
}

function round(value, decimals = 2) {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

function parseISODateToDateKey(isoValue) {
  const dt = new Date(String(isoValue || ""));
  if (Number.isNaN(dt.getTime())) return "";
  return formatDateKeyLocal(dt);
}

function addDaysDateKey(dateKey, offsetDays) {
  const [y, m, d] = String(dateKey).split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + offsetDays);
  const yy = dt.getUTCFullYear();
  const mm = String(dt.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(dt.getUTCDate()).padStart(2, "0");
  return `${yy}-${mm}-${dd}`;
}

function sumRange(dailyByDate, endKey, days) {
  let total = 0;
  for (let i = 0; i < days; i += 1) {
    const key = addDaysDateKey(endKey, -i);
    total += Number(dailyByDate[key] || 0);
  }
  return total;
}

function activeDaysRange(dailyByDate, endKey, days) {
  let count = 0;
  for (let i = 0; i < days; i += 1) {
    const key = addDaysDateKey(endKey, -i);
    if (Number(dailyByDate[key] || 0) > 0) count += 1;
  }
  return count;
}

function buildSignalState(metrics) {
  const weeklyJumpPct = metrics.risk.weekly_jump_pct;
  const avg7 = metrics.consistency.avg_7d;
  const avg30 = metrics.consistency.avg_30d;
  const ratio = avg30 > 0 ? avg7 / avg30 : null;

  const detrainingDrop = weeklyJumpPct !== null && weeklyJumpPct <= -30;
  const baselineGap = ratio !== null && ratio < 0.85;
  const baselineOk = ratio !== null && ratio >= 0.85;
  const wowWithinBounds = weeklyJumpPct !== null && weeklyJumpPct >= 0 && weeklyJumpPct <= 15;

  return {
    detraining_drop: detrainingDrop,
    baseline_gap: baselineGap,
    baseline_ok: baselineOk,
    wow_within_global_guardrails: wowWithinBounds,
  };
}

function classifyRunningStatus(signals) {
  const detrainingCount = Number(signals.detraining_drop) + Number(signals.baseline_gap);
  if (detrainingCount >= 2) {
    return "detraining_risk";
  }

  const controlledCount = Number(signals.wow_within_global_guardrails) + Number(signals.baseline_ok);
  if (controlledCount >= 2) {
    return "controlled_growth";
  }

  return "stable";
}

function isCoolingOrDetraining(classification) {
  const normalized = String(classification || "").trim().toLowerCase();
  return (
    normalized === "detraining_risk"
    || normalized === "cooling_phase"
    || normalized === "cooling"
    || normalized === "caution"
  );
}

function buildRecommendation({ runningStatus, manualInput }) {
  const injury = parseBoolean(manualInput && manualInput.injury);
  const significantPain = parseBoolean(manualInput && manualInput.pain);
  const classification = runningStatus && runningStatus.classification;

  // Deterministic Stage 2 rules:
  // 1) injury -> rest/cross-train
  // 2) pain -> easy/cautious
  // 3) cooling/detraining -> short easy run
  // 4) otherwise -> run normally
  if (injury) {
    return {
      code: "rest_or_cross_train",
      status: "Rest or cross-train.",
      primary_fix: "Skip running today.",
      constraint: "Use only low-impact movement if comfortable.",
    };
  }

  if (significantPain) {
    return {
      code: "easy_cautious",
      status: "Easy / cautious recommendation.",
      primary_fix: "If you run, keep it short and easy.",
      constraint: "Stop if pain increases.",
    };
  }

  if (isCoolingOrDetraining(classification)) {
    return {
      code: "short_easy_run",
      status: "Caution day from running status.",
      primary_fix: "Do a short easy run.",
      constraint: "Keep effort controlled.",
    };
  }

  return {
    code: "run_normally",
    status: "Run normally.",
    primary_fix: "Follow your normal run plan.",
    constraint: "Keep the day routine and controlled.",
  };
}

async function getRunningDailyFromStrava(dateKey) {
  try {
    const raw = await fs.readFile(latestActivitiesExportPath, "utf8");
    const exportPayload = JSON.parse(raw);
    const activities = Array.isArray(exportPayload.activities) ? exportPayload.activities : [];
    const running = activities.filter((a) => String(a && a.sport_type || "").toLowerCase() === "run");
    const byDate = {};
    for (const activity of running) {
      const key = parseISODateToDateKey(activity.start_date);
      if (!key) continue;
      byDate[key] = (byDate[key] || 0) + (Number(activity.moving_time_s) || 0);
    }

    const last7 = sumRange(byDate, dateKey, 7);
    const prior7End = addDaysDateKey(dateKey, -7);
    const prior7 = sumRange(byDate, prior7End, 7);
    const weeklyJumpPct = prior7 > 0 ? ((last7 - prior7) / prior7) * 100 : null;
    const avg7 = last7 / 7;
    const avg30 = sumRange(byDate, dateKey, 30) / 30;
    const active30 = activeDaysRange(byDate, dateKey, 30);

    const metrics = {
      consistency: {
        avg_7d: round(avg7, 2),
        avg_30d: round(avg30, 2),
        active_days_30d: active30,
      },
      risk: {
        last_7d_total: round(last7, 2),
        prior_7d_total: round(prior7, 2),
        weekly_jump_pct: weeklyJumpPct === null ? null : round(weeklyJumpPct, 2),
      },
    };
    const signals = buildSignalState(metrics);
    const classification = classifyRunningStatus(signals);

    return {
      source: "strava.activities.latest",
      as_of: dateKey,
      policy: "event_running.yaml",
      metrics,
      signals,
      classification,
      data_available: running.length > 0,
    };
  } catch (_err) {
    return {
      source: "strava.activities.latest",
      as_of: dateKey,
      policy: "event_running.yaml",
      metrics: {
        consistency: { avg_7d: 0, avg_30d: 0, active_days_30d: 0 },
        risk: { last_7d_total: 0, prior_7d_total: 0, weekly_jump_pct: null },
      },
      signals: {
        detraining_drop: false,
        baseline_gap: false,
        baseline_ok: false,
        wow_within_global_guardrails: false,
      },
      classification: "stable",
      data_available: false,
    };
  }
}

function normalizeManualInput(input = {}) {
  const recovery = String(input.recovery || "").trim();
  if (recovery.length > 60) throw new Error("recovery must be 60 characters or fewer");

  const yesterdayChoice = String(input.yesterday_choice || "").trim();
  if (yesterdayChoice.length > 60) throw new Error("yesterday_choice must be 60 characters or fewer");

  const yesterdayReason = String(input.yesterday_reason || "").trim();
  if (yesterdayReason.length > 240) throw new Error("yesterday_reason must be 240 characters or fewer");

  return {
    recovery,
    pain: parseBoolean(input.pain),
    injury: parseBoolean(input.injury),
    yesterday_choice: yesterdayChoice,
    yesterday_reason: yesterdayReason,
  };
}

async function saveManualInput({ date, input }) {
  const dateKey = ensureDateKey(String(date || formatDateKeyLocal()));
  const normalized = normalizeManualInput(input);
  const all = await readRunningCheckDaily();
  const current = all[dateKey] || {};

  // Keep manual payload flat and replaceable while this is still Stage 1 plumbing.
  all[dateKey] = {
    ...current,
    manual_input: normalized,
    updated_at: new Date().toISOString(),
  };
  await writeRunningCheckDaily(all);

  return {
    date: dateKey,
    manual_input: normalized,
  };
}

async function getRunningCheck({ date } = {}) {
  const dateKey = ensureDateKey(String(date || formatDateKeyLocal()));
  const all = await readRunningCheckDaily();
  const manualInput = (all[dateKey] && all[dateKey].manual_input) || {
    recovery: "",
    pain: false,
    injury: false,
    yesterday_choice: "",
    yesterday_reason: "",
  };

  // Running status derives from the latest Strava export so this endpoint stays read-only for policy inputs.
  const runningStatus = await getRunningDailyFromStrava(dateKey);
  const recommendation = buildRecommendation({ runningStatus, manualInput });

  return {
    date: dateKey,
    running_status: runningStatus,
    body_input: {
      recovery: manualInput.recovery,
      pain: manualInput.pain,
      injury: manualInput.injury,
    },
    yesterday_choice: {
      choice: manualInput.yesterday_choice,
      reason: manualInput.yesterday_reason,
    },
    recommendation,
  };
}

module.exports = {
  ensureDateKey,
  getRunningCheck,
  saveManualInput,
  // Exported for lightweight local scenario checks.
  buildRecommendation,
};
