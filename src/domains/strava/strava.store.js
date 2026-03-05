const fs = require("fs/promises");
const path = require("path");

const defaultTokenCandidates = [
  path.join(process.cwd(), "data", "strava", "tokens.json"),
  path.join(process.cwd(), "data", "tokens.json"),
];

const exportsDir = path.join(process.cwd(), "data", "exports");
const latestActivitiesExportPath = path.join(exportsDir, "strava.activities.latest.json");

function buildStoreError(message, status = 500, code = "strava_store_error") {
  const err = new Error(message);
  err.status = status;
  err.code = code;
  return err;
}

async function fileExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch (_err) {
    return false;
  }
}

async function resolveTokenFilePath() {
  const raw = String(process.env.STRAVA_TOKEN_FILE || "").trim();
  if (raw) {
    return path.resolve(raw);
  }

  for (const candidate of defaultTokenCandidates) {
    if (await fileExists(candidate)) {
      return candidate;
    }
  }

  return null;
}

async function readTokenState() {
  const tokenFilePath = await resolveTokenFilePath();
  if (!tokenFilePath) {
    // Teach mode: this is the clearest operator action for missing local tokens.
    throw buildStoreError(
      "Missing token file. Set STRAVA_TOKEN_FILE or create data/strava/tokens.json.",
      500,
      "strava_token_file_missing"
    );
  }

  try {
    const raw = await fs.readFile(tokenFilePath, "utf8");
    const tokens = JSON.parse(raw);
    if (!tokens || typeof tokens !== "object") {
      throw buildStoreError(
        `Token file must contain a JSON object: ${tokenFilePath}`,
        500,
        "strava_token_file_invalid"
      );
    }
    return { tokenFilePath, tokens };
  } catch (err) {
    if (err.code === "ENOENT") {
      throw buildStoreError(
        `Missing token file at ${tokenFilePath}.`,
        500,
        "strava_token_file_missing"
      );
    }
    if (err instanceof SyntaxError) {
      throw buildStoreError(
        `Invalid JSON in token file at ${tokenFilePath}.`,
        500,
        "strava_token_file_invalid_json"
      );
    }
    throw err;
  }
}

async function writeTokenState(tokenFilePath, tokenPayload) {
  await fs.mkdir(path.dirname(tokenFilePath), { recursive: true });

  const stored = {
    ...tokenPayload,
    local_saved_at: new Date().toISOString(),
  };

  await fs.writeFile(tokenFilePath, `${JSON.stringify(stored, null, 2)}\n`, "utf8");
  return stored;
}

async function writeLatestActivitiesExport(payload) {
  await fs.mkdir(exportsDir, { recursive: true });
  await fs.writeFile(
    latestActivitiesExportPath,
    `${JSON.stringify(payload, null, 2)}\n`,
    "utf8"
  );
  return latestActivitiesExportPath;
}

module.exports = {
  buildStoreError,
  readTokenState,
  writeTokenState,
  writeLatestActivitiesExport,
  latestActivitiesExportPath,
};
