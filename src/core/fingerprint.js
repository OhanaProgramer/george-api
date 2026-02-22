const crypto = require("crypto");

function eventFingerprint(evt) {
  const ts = String(evt && evt.ts ? evt.ts : "");
  const type = String(evt && evt.type ? evt.type : "pushups.set");
  const reps = Number.isFinite(Number(evt && evt.reps)) ? Math.trunc(Number(evt.reps)) : 0;
  const source = String(evt && evt.source ? evt.source : "");
  const note = String(evt && evt.note ? evt.note : "");
  const payload = `${ts}|${type}|${reps}|${source}|${note}`;
  return crypto.createHash("sha1").update(payload).digest("hex");
}

module.exports = {
  eventFingerprint,
};
