const {
  appendLogEntry,
  getAnalytics,
  getDashboardCounts,
} = require("../../../models/pushupsModel");
const {
  readDerived,
  readPublish,
} = require("./pushups.store");

function getLogData(overrides = {}) {
  const { todayCount, lifetimeCount } = getDashboardCounts();
  return {
    message: "",
    error: "",
    last: "",
    todayCount,
    lifetimeCount,
    ...overrides,
  };
}

function getAnalyticsData() {
  return getAnalytics();
}

function addLogEntry(reps, source = "server") {
  return appendLogEntry(reps, source);
}

async function getStatsJson() {
  return readDerived();
}

async function getAnalyticsJson() {
  return readPublish();
}

module.exports = {
  getLogData,
  getAnalyticsData,
  addLogEntry,
  getStatsJson,
  getAnalyticsJson,
};
