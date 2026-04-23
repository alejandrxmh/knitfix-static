/* Admin auth helpers.
   Previously the session cookie was literally `DASHBOARD_PASSWORD`, meaning
   the password leaked the moment anyone inspected cookies. Now we use a
   signed token: `<random-id>.<hmac-sha256(random-id)>` with the secret derived
   from DASHBOARD_PASSWORD (so no extra env vars needed). Stateless + tamper-proof. */

const crypto = require("crypto");

function secret() {
  const pw = process.env.DASHBOARD_PASSWORD;
  if (!pw) throw new Error("DASHBOARD_PASSWORD not set");
  // Derive a stable 32-byte key from the password. SHA-256 of the password
  // bytes is fine here — we're not storing passwords, just needing a consistent
  // key for signing/verification within the same deployment.
  return crypto.createHash("sha256").update(pw).digest();
}

function sign(payload) {
  return crypto.createHmac("sha256", secret()).update(payload).digest("hex");
}

/** Create a new session token. Format: `<id>.<sig>`. */
function createToken() {
  const id = crypto.randomBytes(16).toString("hex");
  return `${id}.${sign(id)}`;
}

/** Verify a token's signature. Returns true if intact, false otherwise. */
function verifyToken(token) {
  if (!token || typeof token !== "string") return false;
  const parts = token.split(".");
  if (parts.length !== 2) return false;
  const [id, sig] = parts;
  if (!/^[a-f0-9]{32}$/.test(id)) return false;

  let expected;
  try { expected = sign(id); } catch { return false; }

  // Constant-time compare to resist timing attacks
  const a = Buffer.from(sig, "hex");
  const b = Buffer.from(expected, "hex");
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

/** Read the kf_session cookie and verify it. */
function authCheck(req) {
  const cookie = req.headers.cookie || "";
  const match = cookie.match(/kf_session=([^;]+)/);
  if (!match) return false;
  return verifyToken(decodeURIComponent(match[1]));
}

module.exports = { createToken, verifyToken, authCheck };
