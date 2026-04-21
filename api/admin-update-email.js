const Stripe = require("stripe");

function authCheck(req) {
  const cookie = req.headers.cookie || "";
  const match = cookie.match(/kf_session=([^;]+)/);
  return match && match[1] === process.env.DASHBOARD_PASSWORD;
}

module.exports = async function handler(req, res) {
  if (!authCheck(req)) return res.status(401).json({ error: "Unauthorized" });
  if (req.method !== "POST") return res.status(405).end();

  const { ref, email } = req.body || {};
  if (!ref || !email) return res.status(400).json({ error: "Missing ref or email" });

  const clean = String(email).trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(clean)) {
    return res.status(400).json({ error: "Email adres lijkt ongeldig" });
  }

  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
  const sessions = await stripe.checkout.sessions.list({ limit: 100 });
  const session = sessions.data.find((s) => s.metadata?.reference_code === ref);
  if (!session) return res.status(404).json({ error: "Order niet gevonden" });

  try {
    await stripe.checkout.sessions.update(session.id, {
      metadata: {
        ...session.metadata,
        customer_email: clean,
      },
    });
  } catch (err) {
    console.error("Email update failed:", err.message);
    return res.status(500).json({ error: "Kon email niet bijwerken" });
  }

  return res.status(200).json({ ok: true, email: clean });
};
