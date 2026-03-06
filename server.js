require("dotenv").config();
const express = require("express");
const path = require("path");
const session = require("express-session");
const bcrypt = require("bcryptjs");
const pushupsRouter = require("./src/domains/pushups");
const stravaRouter = require("./src/domains/strava");
const healthRouter = require("./src/domains/health");
const runningCheckRouter = require("./src/domains/runningCheck");
const packageJson = require("./package.json");
const { getAppMeta } = require("./src/core/appMeta");

const app = express();
const PORT = process.env.PORT || 3000;

const APP_META = getAppMeta({ repoRoot: __dirname, packageJson });

function isAdminSession(req) {
  return !!(req.session && req.session.isAdmin === true);
}

app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(session({
  name: "george.sid",
  secret: process.env.SESSION_SECRET || "dev-session-secret",
  resave: false,
  saveUninitialized: false,
  cookie: { httpOnly: true, sameSite: "lax" },
}));
app.use((req, res, next) => {
  res.locals.appMeta = APP_META;
  res.locals.auth = req.auth || { scope: "unknown" };
  next();
});

// ------------------------------
// 📘 Teach-mode: Header-based API key auth (Option A)
// - Clients send: Authorization: Bearer <key>
// - We support two scopes via env:
//   SITE_TOKENS_READONLY (GET/HEAD/OPTIONS)
//   SITE_TOKENS_ADMIN   (writes: POST/PUT/PATCH/DELETE)
// - We intentionally do NOT accept query-string tokens or cookies.
//   Why: they leak into logs/history and create accidental exposure.
// ------------------------------

function parseBearer(req) {
  const h = req.headers.authorization || "";
  const m = h.match(/^Bearer\s+(.+)$/i);
  return m ? m[1].trim() : "";
}

function setFromEnv(name) {
  const raw = process.env[name] || "";
  return new Set(
    raw
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean)
  );
}

const READONLY = setFromEnv("SITE_TOKENS_READONLY");
const ADMIN = setFromEnv("SITE_TOKENS_ADMIN");

function requireApiKey(req, res, next) {
  // Public endpoints
  if (req.path === "/health" || req.path === "/login") return next();

  const key = parseBearer(req);
  const adminSession = isAdminSession(req);

  if (READONLY.size === 0 || ADMIN.size === 0) {
    if (adminSession) {
      req.auth = { scope: "admin" };
      res.locals.auth = req.auth;
      return next();
    }
    return res.status(500).send("SITE_TOKENS_READONLY / SITE_TOKENS_ADMIN not set");
  }

  // 📘 Teach-mode: Simple scope rule for v0.1
  // - Reads: GET/HEAD/OPTIONS must have a READONLY key
  // - Writes: POST/PUT/PATCH/DELETE must have an ADMIN key
  const method = (req.method || "GET").toUpperCase();
  const isRead = method === "GET" || method === "HEAD" || method === "OPTIONS";
  const isAdminKey = ADMIN.has(key);

  // 📘 Teach-mode: ADMIN should be a superset.
  // If you have an admin key, you can always read.
  const ok = isRead ? (READONLY.has(key) || isAdminKey || adminSession) : (isAdminKey || adminSession);
  if (!ok) return res.status(401).send("Unauthorized");

  req.auth = { scope: (isAdminKey || adminSession) ? "admin" : "readonly" };
  res.locals.auth = req.auth;
  return next();
}

app.get("/health", (req, res) => {
  res.status(200).json({ ok: true, service: "george-api-local", ts: new Date().toISOString() });
});

app.get("/login", (req, res) => {
  if (isAdminSession(req)) {
    return res.redirect(302, "/pushups/settings");
  }
  return res.status(200).render("login", { error: "" });
});

app.post("/login", async (req, res) => {
  const username = String(req.body.username || "");
  const password = String(req.body.password || "");
  const expectedUser = process.env.ADMIN_USERNAME || "";
  const passwordHash = process.env.ADMIN_PASSWORD_HASH || "";

  if (!expectedUser || !passwordHash) {
    return res.status(500).render("login", { error: "Admin login is not configured." });
  }

  try {
    const userOk = username === expectedUser;
    const passOk = userOk ? await bcrypt.compare(password, passwordHash) : false;
    if (!userOk || !passOk) {
      return res.status(401).render("login", { error: "Invalid username or password." });
    }
    req.session.isAdmin = true;
    return res.redirect(302, "/pushups/settings");
  } catch (err) {
    console.error("Login error:", err);
    return res.status(500).render("login", { error: "Unable to process login right now." });
  }
});

app.post("/logout", (req, res) => {
  if (!req.session) {
    return res.redirect(302, "/");
  }
  req.session.destroy(() => {
    res.clearCookie("george.sid");
    res.redirect(302, "/");
  });
});

app.use(requireApiKey);
app.use("/public", express.static(path.join(__dirname, "public")));

app.get("/", (req, res) => {
  res.redirect(302, "/pushups/log");
});

app.get("/log", (req, res) => {
  res.redirect(302, "/pushups/log");
});

app.get("/analytics", (req, res) => {
  res.redirect(302, "/pushups/analytics");
});

app.get("/stats", (req, res) => {
  res.redirect(302, "/pushups/stats.json");
});

app.get("/analytics.json", (req, res) => {
  res.redirect(302, "/pushups/analytics.json");
});

app.use("/", stravaRouter);
app.use("/", healthRouter);
app.use("/", runningCheckRouter);
app.use("/", pushupsRouter);

app.listen(PORT, () => {
  console.log(`listening on http://127.0.0.1:${PORT}`);
});
