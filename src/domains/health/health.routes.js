const express = require("express");
const {
  ensureDateKey,
  getHealthDaily,
  saveHealthDaily,
} = require("./health.service");

const router = express.Router();

function requireAdmin(req, res, next) {
  if (!req.auth || req.auth.scope !== "admin") {
    return res.status(401).json({ error: "Unauthorized" });
  }
  return next();
}

router.get("/admin/health/daily", requireAdmin, async (req, res) => {
  try {
    const date = ensureDateKey(String(req.query.date || ""));
    const data = await getHealthDaily(date);
    return res.status(200).json(data);
  } catch (err) {
    return res.status(400).json({ error: err.message || "Invalid date" });
  }
});

router.post("/admin/health/daily", requireAdmin, async (req, res) => {
  try {
    const date = ensureDateKey(String(req.body.date || ""));
    const source = String(req.body.source || "manual");
    const payload = {};
    const fields = ["sleep_hours", "resting_hr", "hrv_ms", "pain_flag", "pain_note"];
    for (const field of fields) {
      if (Object.prototype.hasOwnProperty.call(req.body, field)) {
        payload[field] = req.body[field];
      }
    }
    const saved = await saveHealthDaily({ date, payload, source });
    return res.status(200).json(saved);
  } catch (err) {
    if (err && err.code === "LOCKED") {
      return res.status(423).json({
        error: "Locked",
        locked_until: err.locked_until || "",
      });
    }
    return res.status(400).json({ error: err && err.message ? err.message : "Invalid payload" });
  }
});

module.exports = router;
