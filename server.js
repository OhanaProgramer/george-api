const express = require("express");
const path = require("path");
const { appendLogEntry, getAnalytics, getDashboardCounts, getStats } = require("./models/pushupsModel");
const app = express();
const PORT = process.env.PORT || 3000;

app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));
app.use(express.urlencoded({ extended: false }));

function renderLog(res, { message = "", error = "", last = "" } = {}, statusCode = 200) {
  const { todayCount, lifetimeCount } = getDashboardCounts();
  return res.status(statusCode).render("log", { message, error, last, todayCount, lifetimeCount });
}

app.get("/health", (req, res) => {
  res.status(200).json({ ok: true, service: "george-api-local", ts: new Date().toISOString() });
});

app.get("/", (req, res) => {
  res.redirect(302, "/log");
});

app.get("/log", (req, res) => {
  renderLog(res, {
    message: "",
    error: "",
    last: "",
  });
});

app.post("/log", (req, res) => {
  const rawCount = req.body.count;
  const n = Number(rawCount);

  if (!Number.isInteger(n) || n < 1 || n > 300) {
    return renderLog(
      res,
      {
      message: "",
      error: "Enter a whole number between 1 and 300.",
      last: rawCount || "",
      },
      400
    );
  }

  appendLogEntry(n, "server");

  return renderLog(res, {
    message: `Logged ${n}.`,
    error: "",
    last: "",
  });
});

app.get("/stats", (req, res) => {
  return res.status(200).json(getStats());
});

app.get("/analytics", (req, res) => {
  return res.status(200).render("analytics", getAnalytics());
});

app.get("/analytics.json", (req, res) => {
  return res.status(200).json(getAnalytics());
});

app.listen(PORT, () => {
  console.log(`listening on http://127.0.0.1:${PORT}`);
});
