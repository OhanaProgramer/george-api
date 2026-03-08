require("dotenv").config();

const fs = require("fs/promises");
const path = require("path");

const START_DATE = "2026-01-01";
const START_EPOCH = Math.floor(new Date(`${START_DATE}T00:00:00Z`).getTime() / 1000);
const PER_PAGE = 200;
const MAX_PAGES = 200;
const TOKEN_REFRESH_BUFFER_SECONDS = 120;

const STRAVA_TOKEN_URL = "https://www.strava.com/oauth/token";
const STRAVA_ACTIVITIES_URL = "https://www.strava.com/api/v3/athlete/activities";

const outputDir = path.join(process.cwd(), "data", "health", "histortical");
const outputPath = path.join(outputDir, `strava.activities.from_${START_DATE}.json`);

function assertRequiredEnv() {
  // Teach mode: fail fast with clear setup guidance before any network calls.
  const required = ["STRAVA_CLIENT_ID", "STRAVA_CLIENT_SECRET"];
  const missing = required.filter((name) => !String(process.env[name] || "").trim());
  if (missing.length > 0) {
    throw new Error(`Missing required env vars: ${missing.join(", ")}`);
  }
}

function resolveTokenFilePath() {
  const configured = String(process.env.STRAVA_TOKEN_FILE || "").trim();
  if (configured) return path.resolve(configured);

  const fallbackCandidates = [
    path.join(process.cwd(), "data", "strava", "tokens.json"),
    path.join(process.cwd(), "data", "tokens.json"),
  ];

  return fallbackCandidates[0];
}

async function readTokenPayload(tokenFilePath) {
  try {
    const raw = await fs.readFile(tokenFilePath, "utf8");
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") {
      throw new Error("Token payload must be a JSON object");
    }
    if (!parsed.access_token || !parsed.refresh_token) {
      throw new Error("Token payload must include access_token and refresh_token");
    }
    return parsed;
  } catch (err) {
    if (err.code === "ENOENT") {
      throw new Error(`Missing token file at ${tokenFilePath}`);
    }
    if (err instanceof SyntaxError) {
      throw new Error(`Invalid JSON in token file at ${tokenFilePath}`);
    }
    throw err;
  }
}

async function writeTokenPayload(tokenFilePath, payload) {
  await fs.mkdir(path.dirname(tokenFilePath), { recursive: true });
  const next = {
    ...payload,
    local_saved_at: new Date().toISOString(),
  };
  await fs.writeFile(tokenFilePath, `${JSON.stringify(next, null, 2)}\n`, "utf8");
  return next;
}

function isExpiredOrNearExpiry(tokens) {
  const expiresAt = Number(tokens.expires_at);
  if (!Number.isFinite(expiresAt)) return true;
  const nowEpochSeconds = Math.floor(Date.now() / 1000);
  return expiresAt <= nowEpochSeconds + TOKEN_REFRESH_BUFFER_SECONDS;
}

async function parseResponseBody(response) {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch (_err) {
    return { raw_text: text };
  }
}

async function refreshToken(tokens) {
  const response = await fetch(STRAVA_TOKEN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      client_id: String(process.env.STRAVA_CLIENT_ID || ""),
      client_secret: String(process.env.STRAVA_CLIENT_SECRET || ""),
      grant_type: "refresh_token",
      refresh_token: String(tokens.refresh_token || ""),
    }),
  });

  const body = await parseResponseBody(response);

  if (!response.ok) {
    throw new Error(
      `Token refresh failed with status ${response.status}: ${JSON.stringify(body)}`
    );
  }

  if (!body || typeof body !== "object" || !body.access_token || !body.refresh_token) {
    throw new Error("Token refresh response missing access_token or refresh_token");
  }

  return body;
}

async function getValidTokens(tokenFilePath) {
  const tokens = await readTokenPayload(tokenFilePath);
  if (!isExpiredOrNearExpiry(tokens)) {
    return tokens;
  }

  // Teach mode: refresh once before backfill pull so long page loops do not fail on expired tokens.
  const refreshed = await refreshToken(tokens);
  return writeTokenPayload(tokenFilePath, refreshed);
}

function normalizeActivity(activity) {
  return {
    source: "strava",
    source_id: activity && activity.id != null ? String(activity.id) : "",
    athlete_id:
      activity && activity.athlete && activity.athlete.id != null
        ? String(activity.athlete.id)
        : null,
    name: activity && activity.name ? String(activity.name) : "",
    sport_type: activity && (activity.sport_type || activity.type)
      ? String(activity.sport_type || activity.type)
      : "",
    start_date: activity && activity.start_date ? String(activity.start_date) : null,
    distance_m: Number.isFinite(Number(activity && activity.distance)) ? Number(activity.distance) : null,
    moving_time_s: Number.isFinite(Number(activity && activity.moving_time)) ? Number(activity.moving_time) : null,
    elapsed_time_s: Number.isFinite(Number(activity && activity.elapsed_time)) ? Number(activity.elapsed_time) : null,
    total_elevation_gain_m:
      Number.isFinite(Number(activity && activity.total_elevation_gain))
        ? Number(activity.total_elevation_gain)
        : null,
    average_speed_mps:
      Number.isFinite(Number(activity && activity.average_speed))
        ? Number(activity.average_speed)
        : null,
    max_speed_mps:
      Number.isFinite(Number(activity && activity.max_speed))
        ? Number(activity.max_speed)
        : null,
    average_heartrate:
      Number.isFinite(Number(activity && activity.average_heartrate))
        ? Number(activity.average_heartrate)
        : null,
    max_heartrate:
      Number.isFinite(Number(activity && activity.max_heartrate))
        ? Number(activity.max_heartrate)
        : null,
    average_cadence:
      Number.isFinite(Number(activity && activity.average_cadence))
        ? Number(activity.average_cadence)
        : null,
    calories: Number.isFinite(Number(activity && activity.calories)) ? Number(activity.calories) : null,
    manual: Boolean(activity && activity.manual),
    trainer: Boolean(activity && activity.trainer),
    commute: Boolean(activity && activity.commute),
    private: Boolean(activity && activity.private),
  };
}

async function fetchActivitiesPage(accessToken, page) {
  const url = new URL(STRAVA_ACTIVITIES_URL);
  url.searchParams.set("per_page", String(PER_PAGE));
  url.searchParams.set("page", String(page));
  url.searchParams.set("after", String(START_EPOCH));

  const response = await fetch(url, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  const body = await parseResponseBody(response);
  if (response.status === 429) {
    throw new Error(`Rate limited by Strava (429): ${JSON.stringify(body)}`);
  }
  if (!response.ok) {
    throw new Error(`Strava API error ${response.status}: ${JSON.stringify(body)}`);
  }
  if (!Array.isArray(body)) {
    throw new Error("Unexpected Strava activities response shape (expected array)");
  }

  return body;
}

async function main() {
  assertRequiredEnv();

  const tokenFilePath = resolveTokenFilePath();
  const tokens = await getValidTokens(tokenFilePath);

  const collected = [];
  let pagesFetched = 0;

  for (let page = 1; page <= MAX_PAGES; page += 1) {
    const pageActivities = await fetchActivitiesPage(tokens.access_token, page);
    pagesFetched += 1;
    collected.push(...pageActivities);

    if (pageActivities.length < PER_PAGE) {
      break;
    }
  }

  const normalized = collected
    .map((activity) => normalizeActivity(activity))
    .filter((activity) => activity.start_date && activity.start_date >= `${START_DATE}T00:00:00Z`)
    .sort((a, b) => String(a.start_date).localeCompare(String(b.start_date)));

  await fs.mkdir(outputDir, { recursive: true });
  const payload = {
    schema: 1,
    source: "strava",
    start_date: START_DATE,
    exported_at: new Date().toISOString(),
    token_file: tokenFilePath,
    pages_fetched: pagesFetched,
    count: normalized.length,
    activities: normalized,
  };

  await fs.writeFile(outputPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");

  console.log(`[backfill_strava_histortical] Exported ${normalized.length} activities to ${outputPath}`);
}

main().catch((err) => {
  console.error("[backfill_strava_histortical] Failed:", err && err.message ? err.message : err);
  process.exit(1);
});
