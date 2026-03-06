const express = require("express");
const {
  ensureDateKey,
  getRunningCheck,
  saveManualInput,
} = require("./runningCheck.service");

const router = express.Router();

function requireAdmin(req, res, next) {
  if (!req.auth || req.auth.scope !== "admin") {
    return res.status(401).json({ error: "Unauthorized" });
  }
  return next();
}

// Read-only payload for the running check page composition.
router.get("/running/check.json", async (req, res) => {
  try {
    const date = req.query.date ? ensureDateKey(String(req.query.date)) : undefined;
    const data = await getRunningCheck({ date });
    return res.status(200).json(data);
  } catch (err) {
    return res.status(400).json({ error: err && err.message ? err.message : "Invalid request" });
  }
});

// Admin write endpoint for daily manual inputs used by running check.
router.post("/admin/running/check/manual", requireAdmin, async (req, res) => {
  try {
    const date = req.body.date ? ensureDateKey(String(req.body.date)) : undefined;
    const input = {
      recovery: req.body.recovery,
      pain: req.body.pain,
      injury: req.body.injury,
      yesterday_choice: req.body.yesterday_choice,
      yesterday_reason: req.body.yesterday_reason,
    };
    const saved = await saveManualInput({ date, input });
    const merged = await getRunningCheck({ date: saved.date });
    return res.status(200).json({
      ok: true,
      saved,
      running_check: merged,
    });
  } catch (err) {
    return res.status(400).json({ error: err && err.message ? err.message : "Invalid payload" });
  }
});

module.exports = router;
