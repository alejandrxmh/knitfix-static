const Stripe = require("stripe");
const { findSessionByRef } = require("./_stripe-helpers");
const { authCheck } = require("./_auth");

/**
 * Toggle kf_archived on an order's payment intent metadata.
 * Archived orders are hidden from the default admin view but can be
 * revealed with the "show archived" toggle.
 *
 * POST /api/admin-archive
 * Body: { ref: string, archived: boolean }
 */
module.exports = async function handler(req, res) {
  if (!authCheck(req)) return res.status(401).json({ error: "Unauthorized" });
  if (req.method !== "POST") return res.status(405).end();

  const { ref, archived } = req.body || {};
  if (!ref) return res.status(400).json({ error: "Missing ref" });

  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
  const session = await findSessionByRef(stripe, ref);
  if (!session) return res.status(404).json({ error: "Order not found" });

  const piId = typeof session.payment_intent === "string"
    ? session.payment_intent
    : session.payment_intent?.id;

  if (!piId) return res.status(400).json({ error: "No payment intent on session" });

  // Stripe metadata: empty string deletes the key
  await stripe.paymentIntents.update(piId, {
    metadata: {
      kf_archived:    archived ? "true" : "",
      kf_archived_at: archived ? String(Date.now()) : "",
    }
  });

  return res.status(200).json({ ok: true, archived: !!archived });
};
