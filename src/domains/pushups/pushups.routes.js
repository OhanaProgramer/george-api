const express = require("express");
const {
  addLogEntry,
  getAnalyticsData,
  getAnalyticsJson,
  getLogData,
  getStatsJson,
} = require("./pushups.service");

const router = express.Router();

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

router.get("/pushups/stats.json", async (req, res) => {
  const data = await getStatsJson();
  return res.status(200).json(data);
});

router.get("/pushups/analytics.json", async (req, res) => {
  const data = await getAnalyticsJson();
  return res.status(200).json(data);
});

module.exports = router;
