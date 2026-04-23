const { createToken } = require("./_auth");

module.exports = async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end();
  const { password } = req.body || {};
  if (!password) return res.status(400).json({ error: "No password" });
  if (password !== process.env.DASHBOARD_PASSWORD) {
    return res.status(401).json({ error: "Incorrect password" });
  }

  const token = createToken();
  // Secure only on HTTPS. In local dev over http://localhost the Secure flag
  // would prevent the cookie from being set at all.
  const isProd = req.headers["x-forwarded-proto"] === "https" || process.env.NODE_ENV === "production";
  const secureFlag = isProd ? "Secure; " : "";

  res.setHeader(
    "Set-Cookie",
    `kf_session=${token}; Path=/; HttpOnly; ${secureFlag}SameSite=Strict; Max-Age=86400`
  );
  return res.status(200).json({ ok: true });
};
