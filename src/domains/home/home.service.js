const { getDashboardCounts } = require("../../../models/pushupsModel");
const { getRunningCheck, ensureDateKey } = require("../runningCheck/runningCheck.service");
const { getLogHealthModel } = require("../health/health.service");

function safeText(value, fallback = "Not available") {
  if (value === null || value === undefined) return fallback;
  const text = String(value).trim();
  return text ? text : fallback;
}

async function getHomeModel({ date } = {}) {
  const todayDate = date ? ensureDateKey(String(date)) : undefined;

  // Home is a summary shell, so each card loads independently with safe fallbacks.
  const [pushupsResult, runningResult, healthResult] = await Promise.allSettled([
    getDashboardCounts(),
    getRunningCheck({ date: todayDate }),
    getLogHealthModel(),
  ]);

  const pushupsSummary = pushupsResult.status === "fulfilled"
    ? {
      today_count: Number(pushupsResult.value.todayCount || 0),
      lifetime_count: Number(pushupsResult.value.lifetimeCount || 0),
      has_data: true,
    }
    : {
      today_count: "Not available",
      lifetime_count: "Not available",
      has_data: false,
    };

  const runningSummary = runningResult.status === "fulfilled"
    ? {
      date: runningResult.value.date,
      classification: safeText(runningResult.value.running_status && runningResult.value.running_status.classification),
      recommendation_code: safeText(runningResult.value.recommendation && runningResult.value.recommendation.code),
      data_available: runningResult.value.running_status && runningResult.value.running_status.data_available ? "Yes" : "No",
      recovery: safeText(runningResult.value.body_input && runningResult.value.body_input.recovery),
      pain: runningResult.value.body_input && runningResult.value.body_input.pain ? "true" : "false",
      injury: runningResult.value.body_input && runningResult.value.body_input.injury ? "true" : "false",
      has_data: true,
    }
    : {
      date: todayDate || "",
      classification: "Not available",
      recommendation_code: "Not available",
      data_available: "No",
      recovery: "Not available",
      pain: "Not available",
      injury: "Not available",
      has_data: false,
    };

  const healthSummary = healthResult.status === "fulfilled"
    ? {
      recovery_date: safeText(healthResult.value.recovery && healthResult.value.recovery.dateKey, "-"),
      sleep_hours: safeText(healthResult.value.recovery && healthResult.value.recovery.sleep_hours, "Not set"),
      resting_hr: safeText(healthResult.value.recovery && healthResult.value.recovery.resting_hr, "Not set"),
      hrv_ms: safeText(healthResult.value.recovery && healthResult.value.recovery.hrv_ms, "Not set"),
      pain_date: safeText(healthResult.value.pain && healthResult.value.pain.dateKey, "-"),
      pain_flag: healthResult.value.pain && healthResult.value.pain.pain_flag ? "true" : "false",
      pain_note: safeText(healthResult.value.pain && healthResult.value.pain.pain_note, "Not set"),
      has_data: true,
    }
    : {
      recovery_date: "-",
      sleep_hours: "Not available",
      resting_hr: "Not available",
      hrv_ms: "Not available",
      pain_date: "-",
      pain_flag: "Not available",
      pain_note: "Not available",
      has_data: false,
    };

  return {
    date: runningSummary.date || todayDate || "",
    pushups: pushupsSummary,
    running: runningSummary,
    body: healthSummary,
  };
}

module.exports = {
  getHomeModel,
};
