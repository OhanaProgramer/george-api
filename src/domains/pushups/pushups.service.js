const { appendLogEntry, getAnalytics, getDashboardCounts } = require("../../../models/pushupsModel");
const {
  readDerived,
  readPublish,
} = require("./pushups.store");

async function getLogData(overrides = {}) {
  const { todayCount, lifetimeCount } = await getDashboardCounts();
  return {
    message: "",
    error: "",
    last: "",
    todayCount,
    lifetimeCount,
    ...overrides,
  };
}

async function getAnalyticsData() {
  return getAnalytics();
}

async function addLogEntry(reps, source = "server") {
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
