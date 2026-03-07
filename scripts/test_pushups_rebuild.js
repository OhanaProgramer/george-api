#!/usr/bin/env node
/**
 * Rebuild + assertion check for repaired pushups totals.
 *
 * Run:
 *   node scripts/rebuild_pushups.js
 *   node scripts/test_pushups_rebuild.js
 *
 * Or end-to-end:
 *   node scripts/clean_pushup_events.js && node scripts/rebuild_pushups.js && node scripts/test_pushups_rebuild.js
 */
const fs = require("fs/promises");
const path = require("path");

const DERIVED_PATH = path.join(process.cwd(), "data", "pushups", "derived.json");
const EXPECTED_LIFETIME_TOTAL = 6193;

function readLifetimeTotal(derived) {
  const candidates = [
    derived && derived.totals && derived.totals.lifetime && derived.totals.lifetime.reps,
    derived && derived.totals && derived.totals.lifetime_all_years,
    derived && derived.lifetime_total,
  ];

  for (const value of candidates) {
    const n = Number(value);
    if (Number.isFinite(n)) return n;
  }
  return NaN;
}

async function main() {
  const raw = await fs.readFile(DERIVED_PATH, "utf8");
  const derived = JSON.parse(raw);
  const lifetime = readLifetimeTotal(derived);
  if (!Number.isFinite(lifetime)) {
    throw new Error("Could not locate numeric lifetime total in derived.json");
  }

  if (lifetime !== EXPECTED_LIFETIME_TOTAL) {
    throw new Error(`Lifetime total mismatch: expected ${EXPECTED_LIFETIME_TOTAL}, got ${lifetime}`);
  }

  console.log(`PASS lifetime total = ${lifetime}`);
}

main().catch((err) => {
  console.error("Pushups rebuild test failed:", err.message || err);
  process.exit(1);
});
