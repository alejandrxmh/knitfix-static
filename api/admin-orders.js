const Stripe = require("stripe");
const { Resend } = require("resend");

function authCheck(req) {
  const cookie = req.headers.cookie || "";
  const match = cookie.match(/kf_session=([^;]+)/);
  return match && match[1] === process.env.DASHBOARD_PASSWORD;
}

const REVIEW_URL = process.env.GOOGLE_REVIEW_URL || "https://g.page/r/knitfix/review";

function reviewEmailHtml(name, ref) {
  return `<!DOCTYPE html><html><head><meta charset="UTF-8"/></head>
<body style="font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;background:#f4f2f0;margin:0;padding:40px 20px;">
<div style="max-width:520px;margin:0 auto;background:#fff;border:1px solid #ded6cf;">
  <div style="padding:36px 40px 24px;border-bottom:1px solid #ded6cf;">
    <p style="font-size:11px;letter-spacing:0.14em;text-transform:lowercase;color:#918b84;margin:0 0 6px;">knitfix · breiwerk reparatie atelier</p>
    <h1 style="font-size:18px;font-weight:400;color:#20201f;margin:0;text-transform:lowercase;">hoe was je ervaring?</h1>
  </div>
  <div style="padding:32px 40px;">
    <p style="font-size:14px;color:#20201f;margin:0 0 20px;line-height:1.7;">Hoi ${name}, hopelijk is je kledingstuk goed aangekomen en blij met het resultaat.</p>
    <p style="font-size:13px;color:#918b84;margin:0 0 28px;line-height:1.7;">Als je een momentje hebt, zou een recensie ons enorm helpen. Het duurt minder dan een minuut.</p>
    <a href="${REVIEW_URL}" style="display:inline-block;background:#b85c38;color:#f4f2f0;padding:12px 28px;font-size:12px;text-decoration:none;letter-spacing:0.08em;text-transform:lowercase;">schrijf een recensie →</a>
    <p style="font-size:11px;color:#918b84;margin:24px 0 0;">Referentie: ${ref}</p>
  </div>
  <div style="padding:20px 40px;border-top:1px solid #ded6cf;">
    <p style="font-size:10px;color:#918b84;margin:0;">knitfix · amsterdam · kvk 42013270</p>
  </div>
</div>
</body></html>`;
}

module.exports = async function handler(req, res) {
  if (!authCheck(req)) return res.status(401).json({ error: "Unauthorized" });

  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
  const sessions = await stripe.checkout.sessions.list({
    limit: 100,
    expand: ["data.payment_intent"],
  });

  const now = Date.now();
  const fourteenDays = 14 * 24 * 60 * 60 * 1000;
  const resend = new Resend(process.env.RESEND_API_KEY);

  const orders = [];

  for (const s of sessions.data) {
    if (s.payment_status !== "paid" || !s.metadata?.reference_code) continue;

    const pi = s.payment_intent;
    const status = pi?.metadata?.kf_status || "ontvangen";
    const shippedAt = pi?.metadata?.kf_shipped_at ? parseInt(pi.metadata.kf_shipped_at) : null;
    const reviewSent = pi?.metadata?.kf_review_sent === "true";
    const readyBy = pi?.metadata?.kf_ready_by || null;

    /* auto-send review email 14 days after verzonden */
    if (status === "verzonden" && shippedAt && !reviewSent && (now - shippedAt) >= fourteenDays) {
      try {
        const name = (s.metadata.customer_name || "").split(" ")[0];
        await resend.emails.send({
          from: "KnitFix <hello@knitfix.nl>",
          reply_to: "hello.knitfix@gmail.com",
          to: s.metadata.customer_email,
          subject: "Hoe was je KnitFix ervaring?",
          html: reviewEmailHtml(name, s.metadata.reference_code),
        });
        const piId = typeof pi === "string" ? pi : pi?.id;
        if (piId) {
          await stripe.paymentIntents.update(piId, { metadata: { kf_review_sent: "true" } });
        }
        console.log("Auto review email sent for", s.metadata.reference_code);
      } catch (err) {
        console.error("Auto review email failed:", err.message);
      }
    }

    orders.push({
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
      status,
      ready_by:    readyBy,
      review_sent: reviewSent,
    });
  }

  return res.status(200).json({ orders });
};
