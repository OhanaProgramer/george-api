const express = require("express");
const {
  applyRateLimitHeaders,
  isStravaEnabled,
  runSelfTest,
} = require("./strava.service");

const router = express.Router();

router.get("/admin/strava/selftest", async (req, res) => {
  if (!isStravaEnabled()) {
    return res.status(200).json({ ok: false, disabled: true });
  }

  if (!req.auth || req.auth.scope !== "admin") {
    return res.status(401).send("Unauthorized");
  }

  try {
    const result = await runSelfTest(req.query || {});
    applyRateLimitHeaders(res, result.rateLimits);

    return res.status(200).json({
      ok: true,
      count: result.count,
      rate_limits: result.rateLimits,
      activities: result.activities,
    });
  } catch (err) {
    const status = Number.isInteger(err && err.status) ? err.status : 500;

    if (err && err.rateLimits) {
      applyRateLimitHeaders(res, err.rateLimits);
    }

    return res.status(status).json({
      ok: false,
      error: err && err.code ? String(err.code) : "strava_selftest_failed",
      message: err && err.message ? String(err.message) : "Strava self-test failed.",
      rate_limits: err && err.rateLimits ? err.rateLimits : {},
      details: err && err.details !== undefined ? err.details : null,
    });
  }
});

module.exports = router;
