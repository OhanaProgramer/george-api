const path = require("path");
const { getAnalytics, getStats } = require("../../../models/pushupsModel");
const { readEvents, writeDerived, writePublish } = require("./pushups.store");

const derivedPath = path.join(process.cwd(), "data", "pushups", "derived.json");
const publishPath = path.join(process.cwd(), "data", "pushups", "publish.json");
const SERIES_TZ = "America/New_York";
const SERIES_WINDOW_DAYS = 60;
const ROLLING_AVG_DAYS = 14;

function toDateKeyInTz(date, timeZone = SERIES_TZ) {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const parts = Object.fromEntries(
    fmt
      .formatToParts(date)
      .filter((p) => p.type !== "literal")
      .map((p) => [p.type, p.value])
  );
  return `${parts.year}-${parts.month}-${parts.day}`;
}

function parseDateKeyUtc(dateKey) {
  const [y, m, d] = String(dateKey).split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

function addDaysUtc(dateObj, days) {
  const next = new Date(dateObj.getTime());
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

function toDateKeyUtc(dateObj) {
  const y = dateObj.getUTCFullYear();
  const m = String(dateObj.getUTCMonth() + 1).padStart(2, "0");
  const d = String(dateObj.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function round1(n) {
  return Math.round(n * 10) / 10;
}

function buildSeriesFields(events) {
  const dailyTotals = new Map();

  // Bucket by calendar date in a fixed timezone so charts stay stable across clients.
  for (const evt of events) {
    if (!evt || evt.type !== "pushups.set") continue;
    const ts = new Date(evt.ts);
    if (Number.isNaN(ts.getTime())) continue;

    const key = toDateKeyInTz(ts, SERIES_TZ);
    const reps = Math.trunc(Number(evt.reps) || 0);
    dailyTotals.set(key, (dailyTotals.get(key) || 0) + reps);
  }

  if (dailyTotals.size === 0) {
    return {
      series_60d: [],
      avg_14d: [],
    };
  }

  const endDateKey = [...dailyTotals.keys()].sort()[dailyTotals.size - 1];
  const endDate = parseDateKeyUtc(endDateKey);
  const startDate = addDaysUtc(endDate, -(SERIES_WINDOW_DAYS - 1));
  const series_60d = [];

  // Keep a fixed 60-day window to support a compact mobile chart without overloading the view.
  for (let i = 0; i < SERIES_WINDOW_DAYS; i += 1) {
    const key = toDateKeyUtc(addDaysUtc(startDate, i));
    series_60d.push({
      date: key,
      total: dailyTotals.get(key) || 0,
    });
  }

  // 14-day rolling average smooths day-to-day spikes while staying responsive to trend changes.
  const avg_14d = series_60d.map((point, i) => {
    const start = Math.max(0, i - (ROLLING_AVG_DAYS - 1));
    let sum = 0;
    for (let j = start; j <= i; j += 1) {
      sum += series_60d[j].total;
    }
    const avg = sum / (i - start + 1);
    return { date: point.date, avg: round1(avg) };
  });

  return { series_60d, avg_14d };
}

async function rebuildPushups({ nowTs } = {}) {
  const events = await readEvents();
  const stats = await getStats({ nowTs });
  const analytics = await getAnalytics({ nowTs });
  const { series_60d, avg_14d } = buildSeriesFields(events);
  const publish = {
    ...analytics,
    series_60d,
    avg_14d,
    target_daily: 0,
    flags: {
      trend_down: false,
      below_target_projection: false,
    },
  };

  await writeDerived(stats);
  await writePublish(publish);

  return {
    eventsProcessed: events.length,
    derivedPath,
    publishPath,
  };
}

module.exports = {
  rebuildPushups,
};
