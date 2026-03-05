const {
  readTokenState,
  writeTokenState,
  writeLatestActivitiesExport,
} = require("./strava.store");

const STRAVA_API_BASE_URL = "https://www.strava.com/api/v3";
const STRAVA_TOKEN_URL = "https://www.strava.com/oauth/token";
const TOKEN_REFRESH_BUFFER_SECONDS = 120;

function isStravaEnabled() {
  return String(process.env.STRAVA_ENABLED || "0").trim() === "1";
}

function buildServiceError(message, status = 500, code = "strava_service_error", details, rateLimits) {
  const err = new Error(message);
  err.status = status;
  err.code = code;
  if (details !== undefined) err.details = details;
  if (rateLimits && typeof rateLimits === "object") err.rateLimits = rateLimits;
  return err;
}

function parsePositiveInt(value, fallback, label) {
  if (value === undefined || value === null || value === "") {
    return fallback;
  }

  const parsed = Number.parseInt(String(value), 10);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw buildServiceError(
      `Invalid ${label}. It must be a positive integer.`,
      400,
      "strava_invalid_query"
    );
  }

  return parsed;
}

function collectRateLimits(headers) {
  const keys = [
    "x-ratelimit-limit",
    "x-ratelimit-usage",
    "x-readratelimit-limit",
    "x-readratelimit-usage",
  ];

  const result = {};
  for (const key of keys) {
    const value = headers.get(key);
    if (value !== null) {
      result[key] = value;
    }
  }

  return result;
}

function applyRateLimitHeaders(res, rateLimits) {
  if (!rateLimits || typeof rateLimits !== "object") return;
  for (const [key, value] of Object.entries(rateLimits)) {
    if (value !== undefined && value !== null) {
      res.set(key, String(value));
    }
  }
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

function assertRequiredEnv() {
  // Teach mode: fail fast on missing OAuth client credentials.
  const required = ["STRAVA_CLIENT_ID", "STRAVA_CLIENT_SECRET"];
  const missing = required.filter((name) => !String(process.env[name] || "").trim());

  if (missing.length > 0) {
    throw buildServiceError(
      `Missing required Strava env vars: ${missing.join(", ")}`,
      500,
      "strava_env_missing"
    );
  }
}

function validateTokenShape(tokens, tokenFilePath) {
  if (!tokens || typeof tokens !== "object") {
    throw buildServiceError(
      `Token payload in ${tokenFilePath} is invalid.`,
      500,
      "strava_token_invalid"
    );
  }
  if (!tokens.access_token || !tokens.refresh_token) {
    throw buildServiceError(
      `Token payload in ${tokenFilePath} must include access_token and refresh_token.`,
      500,
      "strava_token_invalid"
    );
  }
}

function isExpiredOrNearExpiry(tokens) {
  const nowEpochSeconds = Math.floor(Date.now() / 1000);
  const expiresAt = Number(tokens.expires_at);
  if (!Number.isFinite(expiresAt)) {
    return true;
  }
  return expiresAt <= nowEpochSeconds + TOKEN_REFRESH_BUFFER_SECONDS;
}

async function refreshToken(refreshToken) {
  const form = new URLSearchParams({
    client_id: String(process.env.STRAVA_CLIENT_ID || ""),
    client_secret: String(process.env.STRAVA_CLIENT_SECRET || ""),
    grant_type: "refresh_token",
    refresh_token: String(refreshToken || ""),
  });

  const response = await fetch(STRAVA_TOKEN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: form,
  });

  const rateLimits = collectRateLimits(response.headers);
  const body = await parseResponseBody(response);

  if (!response.ok) {
    // Teach mode: token refresh failures should be explicit so operators know to re-auth.
    throw buildServiceError(
      `Token refresh failure from Strava (status ${response.status}).`,
      response.status,
      "strava_token_refresh_failed",
      body,
      rateLimits
    );
  }

  validateTokenShape(body, "Strava refresh response");
  return { refreshedTokens: body, rateLimits };
}

async function getValidTokenState() {
  assertRequiredEnv();

  const { tokenFilePath, tokens } = await readTokenState();
  validateTokenShape(tokens, tokenFilePath);

  if (!isExpiredOrNearExpiry(tokens)) {
    return { tokenFilePath, tokens, refreshed: false, refreshRateLimits: {} };
  }

  const { refreshedTokens, rateLimits } = await refreshToken(tokens.refresh_token);
  const storedTokens = await writeTokenState(tokenFilePath, refreshedTokens);

  return {
    tokenFilePath,
    tokens: storedTokens,
    refreshed: true,
    refreshRateLimits: rateLimits,
  };
}

function toNumberOrNull(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function normalizeActivity(activity) {
  return {
    source: "strava",
    source_id: activity && activity.id !== undefined && activity.id !== null ? String(activity.id) : "",
    athlete_id:
      activity && activity.athlete && activity.athlete.id !== undefined && activity.athlete.id !== null
        ? String(activity.athlete.id)
        : null,
    name: activity && activity.name ? String(activity.name) : "",
    sport_type: activity && (activity.sport_type || activity.type) ? String(activity.sport_type || activity.type) : "",
    start_date: activity && activity.start_date ? String(activity.start_date) : null,
    distance_m: toNumberOrNull(activity && activity.distance),
    moving_time_s: toNumberOrNull(activity && activity.moving_time),
    elapsed_time_s: toNumberOrNull(activity && activity.elapsed_time),
    total_elevation_gain_m: toNumberOrNull(activity && activity.total_elevation_gain),
    average_speed_mps: toNumberOrNull(activity && activity.average_speed),
    max_speed_mps: toNumberOrNull(activity && activity.max_speed),
    average_heartrate: toNumberOrNull(activity && activity.average_heartrate),
    max_heartrate: toNumberOrNull(activity && activity.max_heartrate),
    average_cadence: toNumberOrNull(activity && activity.average_cadence),
    calories: toNumberOrNull(activity && activity.calories),
    manual: Boolean(activity && activity.manual),
    trainer: Boolean(activity && activity.trainer),
    commute: Boolean(activity && activity.commute),
    private: Boolean(activity && activity.private),
  };
}

async function runSelfTest(query = {}) {
  const perPage = parsePositiveInt(query.per_page, 5, "per_page");
  const page = parsePositiveInt(query.page, 1, "page");

  const { tokens } = await getValidTokenState();

  const url = new URL(`${STRAVA_API_BASE_URL}/athlete/activities`);
  url.searchParams.set("per_page", String(perPage));
  url.searchParams.set("page", String(page));

  const response = await fetch(url, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${tokens.access_token}`,
    },
  });

  const rateLimits = collectRateLimits(response.headers);
  const body = await parseResponseBody(response);

  if (response.status === 429) {
    // Teach mode: preserve 429 and surfaced rate-limit headers for operator visibility.
    throw buildServiceError(
      "Strava API rate limit reached.",
      429,
      "strava_rate_limited",
      body,
      rateLimits
    );
  }

  if (!response.ok) {
    // Teach mode: include Strava body for debugging upstream API failures.
    throw buildServiceError(
      `Strava API error while loading athlete activities (status ${response.status}).`,
      response.status,
      "strava_api_error",
      body,
      rateLimits
    );
  }

  if (!Array.isArray(body)) {
    throw buildServiceError(
      "Unexpected Strava response format for athlete activities.",
      502,
      "strava_api_bad_shape",
      body,
      rateLimits
    );
  }

  const activities = body.map((activity) => normalizeActivity(activity));

  await writeLatestActivitiesExport({
    schema: 1,
    source: "strava",
    exported_at: new Date().toISOString(),
    request: {
      per_page: perPage,
      page,
    },
    count: activities.length,
    rate_limits: rateLimits,
    activities,
  });

  return {
    count: activities.length,
    rateLimits,
    activities,
  };
}

module.exports = {
  applyRateLimitHeaders,
  buildServiceError,
  isStravaEnabled,
  runSelfTest,
};
