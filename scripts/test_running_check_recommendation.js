const { buildRecommendation } = require("../src/domains/runningCheck/runningCheck.service");

const scenarios = [
  {
    name: "normal day",
    runningStatus: { classification: "stable" },
    manualInput: { recovery: "good", pain: false, injury: false, yesterday_choice: "", yesterday_reason: "" },
    expectedCode: "run_normally",
  },
  {
    name: "pain day",
    runningStatus: { classification: "stable" },
    manualInput: { recovery: "ok", pain: true, injury: false, yesterday_choice: "", yesterday_reason: "" },
    expectedCode: "easy_cautious",
  },
  {
    name: "injury day",
    runningStatus: { classification: "stable" },
    manualInput: { recovery: "poor", pain: true, injury: true, yesterday_choice: "", yesterday_reason: "" },
    expectedCode: "rest_or_cross_train",
  },
  {
    name: "cooling-phase / caution day",
    runningStatus: { classification: "detraining_risk" },
    manualInput: { recovery: "ok", pain: false, injury: false, yesterday_choice: "", yesterday_reason: "" },
    expectedCode: "short_easy_run",
  },
];

let failed = 0;

for (const scenario of scenarios) {
  const result = buildRecommendation({
    runningStatus: scenario.runningStatus,
    manualInput: scenario.manualInput,
  });
  const pass = result.code === scenario.expectedCode;
  if (!pass) failed += 1;

  console.log(JSON.stringify({
    scenario: scenario.name,
    expected_code: scenario.expectedCode,
    actual_code: result.code,
    status: result.status,
    pass,
  }));
}

if (failed > 0) {
  process.exit(1);
}
