const express = require("express");
const {
  addLogEntry,
  getAnalyticsData,
  getAnalyticsJson,
  getLogData,
  getStatsJson,
  rebuildPushups,
} = require("./pushups.service");
const { readSettings, writeSettings } = require("./pushups.settings");

const router = express.Router();

function parseBearer(req) {
  const h = req.headers.authorization || "";
  const m = h.match(/^Bearer\s+(.+)$/i);
  return m ? m[1].trim() : "";
}

function tokenSetFromEnv(name) {
  return new Set(
    String(process.env[name] || "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean)
  );
}

const ADMIN_TOKENS = tokenSetFromEnv("SITE_TOKENS_ADMIN");

function requireAdminToken(req, res, next) {
  if (ADMIN_TOKENS.size === 0) {
    return res.status(500).send("SITE_TOKENS_READONLY / SITE_TOKENS_ADMIN not set");
  }
  const key = parseBearer(req);
  if (!ADMIN_TOKENS.has(key)) {
    return res.status(401).send("Unauthorized");
  }
  return next();
}

router.get("/pushups/log", async (req, res) => {
  const model = await getLogData();
  return res.status(200).render("pushups/log", model);
});

router.post("/pushups/log", async (req, res) => {
  const rawCount = req.body.count;
  const n = Number(rawCount);

  if (!Number.isInteger(n) || n < 1 || n > 300) {
    const model = await getLogData({
      message: "",
      error: "Enter a whole number between 1 and 300.",
      last: rawCount || "",
    });
    return res.status(400).render(
      "pushups/log",
      model
    );
  }

  try {
    await addLogEntry(n, "server");
  } catch (err) {
    console.error("Failed to append log entry:", err);
    const permissionError = err && (err.code === "EACCES" || err.code === "EPERM");
    const model = await getLogData({
      message: "",
      error: permissionError
        ? "Storage permission issue on server. Please contact admin."
        : "Unable to save your entry right now. Please try again.",
      last: rawCount || "",
    });
    return res.status(500).render(
      "pushups/log",
      model
    );
  }

  const model = await getLogData({
    message: `Logged ${n}.`,
    error: "",
    last: "",
  });
  return res.status(200).render(
    "pushups/log",
    model
  );
});

router.get("/pushups/analytics", async (req, res) => {
  const model = await getAnalyticsData();
  return res.status(200).render("pushups/analytics", model);
});

router.get("/pushups/support", async (req, res) => {
  const model = await getAnalyticsData();
  return res.status(200).render("pushups/support", model);
});

router.get("/pushups/settings", requireAdminToken, async (req, res) => {
  const [settings, publish] = await Promise.all([
    readSettings(),
    getAnalyticsJson(),
  ]);

  return res.status(200).render("pushups/settings", {
    settings,
    computedTargetDaily: Number(publish && publish.target_daily) || 0,
    error: "",
    message: req.query.ok === "1" ? "Settings saved." : "",
  });
});

router.post("/pushups/settings", requireAdminToken, async (req, res) => {
  const form = {
    goal_total: req.body.goal_total,
    target_date: req.body.target_date,
    target_daily_override: req.body.target_daily_override,
  };

  try {
    await writeSettings(form);
    await rebuildPushups();
    return res.redirect(302, "/pushups/settings?ok=1");
  } catch (err) {
    const [currentSettings, publish] = await Promise.all([
      readSettings().catch(() => ({
        schema: 1,
        goal_total: 30000,
        target_date: "2026-12-31",
        target_daily_override: 0,
      })),
      getAnalyticsJson().catch(() => ({})),
    ]);
    return res.status(400).render("pushups/settings", {
      settings: {
        ...currentSettings,
        goal_total: form.goal_total,
        target_date: form.target_date,
        target_daily_override: form.target_daily_override,
      },
      computedTargetDaily: Number(publish && publish.target_daily) || 0,
      error: err && err.message ? err.message : "Unable to save settings.",
      message: "",
    });
  }
});

router.get("/pushups/stats.json", async (req, res) => {
  const data = await getStatsJson();
  return res.status(200).json(data);
});

router.get("/pushups/analytics.json", async (req, res) => {
  const data = await getAnalyticsJson();
  return res.status(200).json(data);
});

module.exports = router;
