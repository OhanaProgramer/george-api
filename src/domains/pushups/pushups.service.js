const { appendLogEntry, getDashboardCounts } = require("../../../models/pushupsModel");
const {
  readDerived,
  readPublish,
} = require("./pushups.store");
const { rebuildPushups } = require("./pushups.rebuild");
const { getLogHealthModel } = require("../health/health.service");

async function getLogData(overrides = {}) {
  const [{ todayCount, lifetimeCount }, healthModel] = await Promise.all([
    getDashboardCounts(),
    getLogHealthModel(),
  ]);
  return {
    message: "",
    error: "",
    last: "",
    recoveryMessage: "",
    recoveryError: "",
    painMessage: "",
    painError: "",
    todayCount,
    lifetimeCount,
    ...healthModel,
    ...overrides,
  };
}

async function getAnalyticsData() {
  return getAnalyticsJson();
}

async function addLogEntry(reps, source = "server") {
  await appendLogEntry(reps, source);
  return rebuildPushups();
}

async function getStatsJson() {
  const derived = await readDerived();
  if (derived && typeof derived === "object" && Object.keys(derived).length > 0) {
    return derived;
  }
  await rebuildPushups();
  return readDerived();
}

async function getAnalyticsJson() {
  const publish = await readPublish();
  if (publish && typeof publish === "object" && Object.keys(publish).length > 0) {
    return publish;
  }
  await rebuildPushups();
  return readPublish();
}

module.exports = {
  getLogData,
  getAnalyticsData,
  addLogEntry,
  getStatsJson,
  getAnalyticsJson,
  rebuildPushups,
};
