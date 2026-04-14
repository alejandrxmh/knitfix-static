const Stripe = require("stripe");

function authCheck(req) {
  const cookie = req.headers.cookie || "";
  const match = cookie.match(/kf_session=([^;]+)/);
  return match && match[1] === process.env.DASHBOARD_PASSWORD;
}

module.exports = async function handler(req, res) {
  if (!authCheck(req)) return res.status(401).json({ error: "Unauthorized" });

  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

  const sessions = await stripe.checkout.sessions.list({
    limit: 100,
    expand: ["data.payment_intent"],
  });

  const orders = sessions.data
    .filter(s => s.payment_status === "paid" && s.metadata?.reference_code)
    .map(s => ({
      ref:         s.metadata.reference_code,
      name:        s.metadata.customer_name,
      email:       s.metadata.customer_email,
      phone:       s.metadata.customer_phone || "",
      garment:     s.metadata.garment_type,
      material:    s.metadata.material,
      damage:      s.metadata.damage_type,
      description: s.metadata.damage_description || "",
      style:       s.metadata.repair_preference,
      address:     `${s.metadata.street} ${s.metadata.house_number}, ${s.metadata.postal_code} ${s.metadata.city}`,
      amount:      (s.amount_total / 100).toFixed(2),
      date:        new Date(s.created * 1000).toLocaleDateString("nl-NL", { day: "numeric", month: "short" }),
      status:      s.payment_intent?.metadata?.kf_status || "ontvangen",
      payment_intent: typeof s.payment_intent === "object" ? s.payment_intent.id : s.payment_intent,
    }));

  return res.status(200).json({ orders });
};
