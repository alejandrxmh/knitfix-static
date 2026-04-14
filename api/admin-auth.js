module.exports = async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end();
  const { password } = req.body || {};
  if (!password) return res.status(400).json({ error: "No password" });
  if (password !== process.env.DASHBOARD_PASSWORD) {
    return res.status(401).json({ error: "Incorrect password" });
  }
  res.setHeader("Set-Cookie", `kf_session=${process.env.DASHBOARD_PASSWORD}; Path=/; HttpOnly; SameSite=Strict; Max-Age=86400`);
  return res.status(200).json({ ok: true });
};
