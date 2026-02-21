const path = require("path");
const { getAnalytics, getStats } = require("../../../models/pushupsModel");
const { readEvents, writeDerived, writePublish } = require("./pushups.store");

const derivedPath = path.join(process.cwd(), "data", "pushups", "derived.json");
const publishPath = path.join(process.cwd(), "data", "pushups", "publish.json");

async function rebuildPushups({ nowTs } = {}) {
  const events = await readEvents();
  const stats = await getStats({ nowTs });
  const analytics = await getAnalytics({ nowTs });

  await writeDerived(stats);
  await writePublish(analytics);

  return {
    eventsProcessed: events.length,
    derivedPath,
    publishPath,
  };
}

module.exports = {
  rebuildPushups,
};
