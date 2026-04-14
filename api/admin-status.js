function authCheck(req) {
  const cookie = req.headers.cookie || "";
  const match = cookie.match(/kf_session=([^;]+)/);
  return match && match[1] === process.env.DASHBOARD_PASSWORD;
}

module.exports = async function handler(req, res) {
  if (!authCheck(req)) return res.status(401).json({ error: "Unauthorized" });
  if (req.method !== "POST") return res.status(405).end();

  const { ref, status } = req.body || {};
  if (!ref || !status) return res.status(400).json({ error: "Missing ref or status" });

  try {
    const { kv } = require("@vercel/kv");
    await kv.set(`status:${ref}`, status);
    return res.status(200).json({ ok: true });
  } catch {
    return res.status(500).json({ error: "KV not configured" });
  }
};
