const fs = require("fs");
const path = require("path");

function formatDateYmd(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function readGitShaFromHead(repoRoot) {
  try {
    const gitDir = path.join(repoRoot, ".git");
    const headPath = path.join(gitDir, "HEAD");
    const head = fs.readFileSync(headPath, "utf8").trim();
    if (!head) return "dev";

    if (head.startsWith("ref:")) {
      const refPath = head.replace(/^ref:\s*/, "");
      const fullRefPath = path.join(gitDir, refPath);
      const refSha = fs.readFileSync(fullRefPath, "utf8").trim();
      return refSha ? refSha.slice(0, 7) : "dev";
    }

    return head.slice(0, 7);
  } catch (_err) {
    return "dev";
  }
}

function getAppMeta({ repoRoot, packageJson }) {
  const version = String((packageJson && packageJson.version) || "0.0.0");
  const gitSha = process.env.GIT_SHA
    ? String(process.env.GIT_SHA).slice(0, 7)
    : readGitShaFromHead(repoRoot);
  const buildDate = formatDateYmd(new Date());

  return {
    version,
    gitSha,
    buildDate,
  };
}

module.exports = {
  getAppMeta,
};
