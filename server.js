require("dotenv").config();
const express = require("express");
const path = require("path");
const pushupsRouter = require("./src/domains/pushups");

const app = express();
const PORT = process.env.PORT || 3000;

app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));
app.use(express.urlencoded({ extended: false }));

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
  if (req.path === "/health") return next();

  const key = parseBearer(req);

  if (READONLY.size === 0 || ADMIN.size === 0) {
    return res.status(500).send("SITE_TOKENS_READONLY / SITE_TOKENS_ADMIN not set");
  }

  // 📘 Teach-mode: Simple scope rule for v0.1
  // - Reads: GET/HEAD/OPTIONS must have a READONLY key
  // - Writes: POST/PUT/PATCH/DELETE must have an ADMIN key
  const method = (req.method || "GET").toUpperCase();
  const isRead = method === "GET" || method === "HEAD" || method === "OPTIONS";

  // 📘 Teach-mode: ADMIN should be a superset.
  // If you have an admin key, you can always read.
  const ok = isRead ? (READONLY.has(key) || ADMIN.has(key)) : ADMIN.has(key);
  if (!ok) return res.status(401).send("Unauthorized");

  req.auth = { scope: isRead ? "readonly" : "admin" };
  return next();
}

app.get("/health", (req, res) => {
  res.status(200).json({ ok: true, service: "george-api-local", ts: new Date().toISOString() });
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

app.use("/", pushupsRouter);

app.listen(PORT, () => {
  console.log(`listening on http://127.0.0.1:${PORT}`);
});
