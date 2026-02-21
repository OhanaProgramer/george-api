#!/usr/bin/env node
const { rebuildPushups } = require("../src/domains/pushups/pushups.rebuild");

async function main() {
  const result = await rebuildPushups();
  console.log(`Processed events: ${result.eventsProcessed}`);
  console.log(`Wrote derived: ${result.derivedPath}`);
  console.log(`Wrote publish: ${result.publishPath}`);
}

main().catch((err) => {
  console.error("Rebuild failed:", err);
  process.exit(1);
});
