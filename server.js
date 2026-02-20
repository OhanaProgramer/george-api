const express = require("express");
const cookieParser = require("cookie-parser");
const path = require("path");
const { appendLogEntry, getAnalytics, getDashboardCounts, getStats } = require("./models/pushupsModel");
const app = express();
const PORT = process.env.PORT || 3000;
const COOKIE_NAME = process.env.SITE_COOKIE_NAME || "pushups_auth";
const TOKENS = new Set(
  (process.env.SITE_TOKENS || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
);

app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));
app.use(express.urlencoded({ extended: false }));
app.use(cookieParser());

function hasValidToken(token) {
  return TOKENS.has(String(token || "").trim());
}

function renderLog(res, { message = "", error = "", last = "" } = {}, statusCode = 200) {
  const { todayCount, lifetimeCount } = getDashboardCounts();
  return res.status(statusCode).render("log", { message, error, last, todayCount, lifetimeCount });
}

app.get("/health", (req, res) => {
  res.status(200).json({ ok: true, service: "george-api-local", ts: new Date().toISOString() });
});

app.get("/verify", (req, res) => {
  if (TOKENS.size === 0) {
    return res.status(500).send("SITE_TOKENS not set");
  }

  const token = req.query.token;
  if (!hasValidToken(token)) {
    return res.status(401).send("Invalid token");
  }

  res.cookie(COOKIE_NAME, String(token).trim(), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 30 * 24 * 60 * 60 * 1000,
  });

  return res.redirect(302, "/log");
});

function requireSiteToken(req, res, next) {
  if (req.path === "/health" || req.path === "/verify") {
    return next();
  }

  if (TOKENS.size === 0) {
    return res.status(500).send("SITE_TOKENS not set");
  }

  const token = req.cookies?.[COOKIE_NAME] || req.get("x-site-token") || req.query.token;
  if (!hasValidToken(token)) {
    return res.status(401).send("Unauthorized");
  }

  return next();
}

app.use(requireSiteToken);
app.use("/public", express.static(path.join(__dirname, "public")));

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
