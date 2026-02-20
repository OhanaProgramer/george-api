const fs = require("fs");
const path = require("path");

const DATA_FILE = path.join(__dirname, "..", "data", "pushups.json");
const GOAL_TOTAL_2026 = 30000;
const GOAL_START_2026 = "2026-01-01";
const GOAL_DEADLINE_2026 = "2026-12-22";
const APP_TIMEZONE = process.env.APP_TIMEZONE || process.env.TZ || "Pacific/Honolulu";

function dateKeyLocal(date = new Date()) {
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

function createEmptyData() {
  return {
    meta: {
      schemaVersion: 2,
      created: dateKeyLocal(),
      tool: "george-api",
      storage: "local.file",
    },
    training_rules: {
      exclude_reps_values: [1],
      exclude_flags: ["exclude_from_training"],
    },
    summary: {
      lastUpdated: dateKeyLocal(),
      today: { date: dateKeyLocal(), count: 0 },
      lifetime: 0,
    },
    daily: {},
    log: [],
    daily_counts: {},
    daily_training: {},
  };
}

function loadData() {
  if (!fs.existsSync(DATA_FILE)) {
    const fresh = createEmptyData();
    fs.mkdirSync(path.dirname(DATA_FILE), { recursive: true });
    fs.writeFileSync(DATA_FILE, JSON.stringify(fresh, null, 2) + "\n", "utf8");
    return fresh;
  }
  return JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));
}

function saveData(data) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2) + "\n", "utf8");
}

function getLifetimeCount(data) {
  if (!Array.isArray(data.log)) return 0;
  return data.log.reduce((sum, e) => sum + (Number(e.reps) || 0), 0);
}

function getTodayCountFromLog(data, todayKey) {
  if (!Array.isArray(data.log)) return 0;
  return data.log.reduce((sum, e) => {
    return e.date === todayKey ? sum + (Number(e.reps) || 0) : sum;
  }, 0);
}

function appendLogEntry(reps, source = "server") {
  const data = loadData();
  const now = new Date();
  const today = dateKeyLocal(now);

  if (!Array.isArray(data.log)) data.log = [];
  if (!data.daily || typeof data.daily !== "object") data.daily = {};
  if (!data.daily_counts || typeof data.daily_counts !== "object") data.daily_counts = {};
  if (!data.daily_training || typeof data.daily_training !== "object") data.daily_training = {};
  if (!data.summary || typeof data.summary !== "object") data.summary = {};

  data.log.push({
    ts: now.toISOString(),
    date: today,
    reps,
    source,
  });

  data.daily[today] = Number(data.daily[today] || 0) + reps;
  data.daily_counts[today] = Number(data.daily_counts[today] || 0) + reps;
  data.daily_training[today] = Number(data.daily_training[today] || 0) + reps;

  data.summary.lastUpdated = today;
  data.summary.today = { date: today, count: Number(data.daily[today] || 0) };
  data.summary.lifetime = getLifetimeCount(data);

  saveData(data);
  return data;
}

function getDashboardCounts() {
  const data = loadData();
  const today = dateKeyLocal();
  return {
    todayCount: getTodayCountFromLog(data, today),
    lifetimeCount: getLifetimeCount(data),
  };
}

function parseDateKey(dateKey) {
  const [y, m, d] = String(dateKey).split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

function toDateKey(dateObj) {
  const y = dateObj.getUTCFullYear();
  const m = String(dateObj.getUTCMonth() + 1).padStart(2, "0");
  const d = String(dateObj.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function addDays(dateObj, days) {
  const next = new Date(dateObj.getTime());
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

function diffDays(startDate, endDate) {
  return Math.floor((endDate - startDate) / (24 * 60 * 60 * 1000));
}

function round(value, decimals = 2) {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

function buildDailyFromLog(data) {
  if (!Array.isArray(data.log)) return {};
  const daily = {};
  for (const entry of data.log) {
    daily[entry.date] = (daily[entry.date] || 0) + (Number(entry.reps) || 0);
  }
  return daily;
}

function sumDailyRange(daily, startKey, endKey) {
  let total = 0;
  for (const [k, reps] of Object.entries(daily)) {
    if (k >= startKey && k <= endKey) total += Number(reps) || 0;
  }
  return total;
}

function rollingAverage(daily, endKey, days) {
  const end = parseDateKey(endKey);
  let total = 0;
  for (let i = 0; i < days; i += 1) {
    total += Number(daily[toDateKey(addDays(end, -i))] || 0);
  }
  return total / days;
}

function activeDays(daily, endKey, days) {
  const end = parseDateKey(endKey);
  let count = 0;
  for (let i = 0; i < days; i += 1) {
    if (Number(daily[toDateKey(addDays(end, -i))] || 0) > 0) count += 1;
  }
  return count;
}

function getStats() {
  const data = loadData();
  const todayKey = dateKeyLocal();
  const daily = buildDailyFromLog(data);

  const goalStart = parseDateKey(GOAL_START_2026);
  const goalEnd = parseDateKey(GOAL_DEADLINE_2026);
  const today = parseDateKey(todayKey);
  const totalGoalDays = diffDays(goalStart, goalEnd) + 1;
  const elapsedDaysRaw = diffDays(goalStart, today) + 1;
  const elapsedDays = Math.max(0, Math.min(totalGoalDays, elapsedDaysRaw));
  const expectedByToday = (GOAL_TOTAL_2026 * elapsedDays) / totalGoalDays;

  const goalProgressToDate = sumDailyRange(daily, GOAL_START_2026, todayKey);
  const aheadBehind = goalProgressToDate - expectedByToday;
  const remainingToGoal = Math.max(0, GOAL_TOTAL_2026 - goalProgressToDate);
  const daysLeft = today <= goalEnd ? diffDays(today, goalEnd) + 1 : 0;
  const requiredPerDayRemaining = daysLeft > 0 ? remainingToGoal / daysLeft : 0;

  const avg7 = rollingAverage(daily, todayKey, 7);
  const avg30 = rollingAverage(daily, todayKey, 30);
  const active30 = activeDays(daily, todayKey, 30);

  const last7Total = round(avg7 * 7, 2);
  const prior7End = toDateKey(addDays(parseDateKey(todayKey), -7));
  const prior7Avg = rollingAverage(daily, prior7End, 7);
  const prior7Total = round(prior7Avg * 7, 2);
  const weeklyJumpPct = prior7Total > 0 ? ((last7Total - prior7Total) / prior7Total) * 100 : null;
  const projectedTotalByDeadline = goalProgressToDate + avg30 * Math.max(0, daysLeft - 1);

  return {
    as_of: todayKey,
    goal: {
      period_start: GOAL_START_2026,
      target_date: GOAL_DEADLINE_2026,
      target_total: GOAL_TOTAL_2026,
      current_total_2026: goalProgressToDate,
      expected_total_by_today: round(expectedByToday, 2),
      ahead_behind: round(aheadBehind, 2),
      required_per_day_remaining: round(requiredPerDayRemaining, 2),
      projected_total_by_target_30d_pace: round(projectedTotalByDeadline, 2),
      on_pace_today: aheadBehind >= 0,
    },
    consistency: {
      avg_7d: round(avg7, 2),
      avg_30d: round(avg30, 2),
      active_days_30d: active30,
    },
    risk: {
      last_7d_total: round(last7Total, 2),
      prior_7d_total: round(prior7Total, 2),
      weekly_jump_pct: weeklyJumpPct === null ? null : round(weeklyJumpPct, 2),
      high_ramp_risk: weeklyJumpPct !== null && weeklyJumpPct > 30,
    },
    totals: {
      lifetime_all_years: getLifetimeCount(data),
    },
  };
}

function getAnalytics() {
  const stats = getStats();
  const paceDelta = stats.goal.ahead_behind;
  const onPace = stats.goal.on_pace_today;
  const weeklyJump = stats.risk.weekly_jump_pct;
  const highRampRisk = stats.risk.high_ramp_risk;
  const avg7 = stats.consistency.avg_7d;
  const avg30 = stats.consistency.avg_30d;
  const active30 = stats.consistency.active_days_30d;

  let paceStatus = "On pace";
  let paceAdvice = "Stay steady. Keep daily output near your 30-day average.";
  if (!onPace) {
    paceStatus = "Behind pace";
    paceAdvice = `Close the gap with a controlled increase toward ${stats.goal.required_per_day_remaining} reps/day.`;
  } else if (paceDelta > 300) {
    paceStatus = "Ahead of pace";
    paceAdvice = "Protect consistency and avoid overreaching. Bank the lead gradually.";
  }

  let consistencyStatus = "Stable";
  let consistencyAdvice = "Current habit strength is good. Keep daily streak density high.";
  if (avg7 < avg30 * 0.9) {
    consistencyStatus = "Cooling";
    consistencyAdvice = "Recent week is below baseline. Add one extra session block this week.";
  } else if (avg7 > avg30 * 1.1) {
    consistencyStatus = "Surging";
    consistencyAdvice = "Recent week is above baseline. Maintain only if recovery stays good.";
  }
  if (active30 < 20) {
    consistencyStatus = "Low frequency";
    consistencyAdvice = "Increase training days first, then raise volume.";
  }

  let riskStatus = "Controlled";
  let riskAdvice = "Ramp rate looks manageable.";
  if (highRampRisk) {
    riskStatus = "Ramp risk";
    riskAdvice = "Weekly volume jumped >30%. Consider a lighter day to avoid burnout.";
  } else if (weeklyJump !== null && weeklyJump < -20) {
    riskStatus = "Detraining risk";
    riskAdvice = "Recent drop is steep. Rebuild with small daily targets this week.";
  }

  let coachNote = "This week: keep momentum with daily reps at or just above required pace.";
  if (!onPace && highRampRisk) {
    coachNote = `This week: recover first, then close the gap. Hold daily reps near ${Math.round(stats.goal.required_per_day_remaining)} with one lighter day.`;
  } else if (!onPace) {
    coachNote = `This week: close your pace gap by averaging ${Math.round(stats.goal.required_per_day_remaining)} reps/day across 7 days.`;
  } else if (highRampRisk) {
    coachNote = "This week: you are on pace. Protect consistency by reducing one high-volume day and keeping daily minimums.";
  } else if (avg7 < avg30) {
    coachNote = "This week: rebuild consistency. Add one extra training day and match your 30-day average.";
  } else if (paceDelta > 500) {
    coachNote = "This week: bank the lead safely. Keep steady daily volume and avoid unnecessary spikes.";
  }

  return {
    ...stats,
    interpretation: {
      pace: { status: paceStatus, advice: paceAdvice },
      consistency: { status: consistencyStatus, advice: consistencyAdvice },
      risk: { status: riskStatus, advice: riskAdvice },
    },
    pro_dev: [
      {
        name: "One Lead Metric",
        why: "Top performers anchor behavior to a single pace number each day.",
        action: `Hit or exceed required pace: ${stats.goal.required_per_day_remaining} reps/day.`,
      },
      {
        name: "Consistency Before Intensity",
        why: "Sustained frequency compounds faster than occasional spikes.",
        action: `Target >= 24 active days per 30 days (currently ${active30}).`,
      },
      {
        name: "Progressive Overload With Guardrails",
        why: "Improvement comes from controlled increases, not random jumps.",
        action: "Keep week-over-week volume change between 0% and +20% when possible.",
      },
    ],
    coach_note: coachNote,
  };
}

module.exports = {
  appendLogEntry,
  getDashboardCounts,
  getAnalytics,
  getStats,
};
