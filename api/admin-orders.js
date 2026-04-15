const Stripe = require("stripe");
const { Resend } = require("resend");

function authCheck(req) {
  const cookie = req.headers.cookie || "";
  const match = cookie.match(/kf_session=([^;]+)/);
  return match && match[1] === process.env.DASHBOARD_PASSWORD;
}

const REVIEW_URL = process.env.GOOGLE_REVIEW_URL || "https://g.page/r/knitfix/review";

// ─── Design tokens ────────────────────────────────────────────────────────────
const LOGO_URL  = "https://knitfix.nl/knitfix_logo.jpg";
const F         = "'Jost', 'Helvetica Neue', Helvetica, Arial, sans-serif";
const BG        = "#f7f2ed";
const WHITE     = "#ffffff";
const INK       = "#1f1811";
const SOFT      = "#7a5e50";
const RULE      = "#f0ebe4";
const ACCENT    = "#b85c38";
const ACCENT_LT = "#c8714a";
const LABEL_CLR = "#c8b4a5";
const NOTE_BG   = "#fdf8f5";
const GF_LINK   = `<link href="https://fonts.googleapis.com/css2?family=Jost:wght@300;400;500;600&display=swap" rel="stylesheet">
<style>@import url('https://fonts.googleapis.com/css2?family=Jost:wght@300;400;500;600&display=swap');</style>`;

function reviewEmailHtml(name, ref) {
  return `<!DOCTYPE html>
<html lang="nl">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0">${GF_LINK}</head>
<body style="margin:0;padding:0;background-color:${BG};font-family:${F};">
<table width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:${BG};padding:48px 16px 56px;">
<tr><td align="center">
<table width="540" cellpadding="0" cellspacing="0" border="0" style="max-width:540px;width:100%;">

  <tr><td style="padding-bottom:28px;text-align:center;">
    <img src="${LOGO_URL}" width="64" height="64" alt="KnitFix"
      style="display:block;margin:0 auto;border-radius:14px;">
  </td></tr>

  <tr><td style="background-color:${WHITE};border-radius:16px;overflow:hidden;box-shadow:0 2px 16px rgba(40,20,10,0.08);">

    <table width="100%" cellpadding="0" cellspacing="0" border="0">
    <tr><td style="padding:36px 40px 28px;border-bottom:1px solid ${RULE};">
      <p style="margin:0 0 12px;font-family:${F};font-size:11px;font-weight:500;letter-spacing:0.14em;text-transform:uppercase;color:${ACCENT_LT};">jouw ervaring</p>
      <h1 style="margin:0;font-family:${F};font-size:30px;font-weight:300;color:${INK};line-height:1.2;">hoe was je<br>reparatie?</h1>
    </td></tr></table>

    <table width="100%" cellpadding="0" cellspacing="0" border="0">
    <tr><td style="padding:28px 40px;">
      <p style="margin:0 0 16px;font-family:${F};font-size:14px;color:${INK};line-height:1.7;">Hoi ${name}, hopelijk is je kledingstuk goed aangekomen en ben je blij met het resultaat.</p>
      <p style="margin:0 0 28px;font-family:${F};font-size:13px;color:${SOFT};line-height:1.7;">Als je een momentje hebt, zou een recensie ons enorm helpen. Het duurt minder dan een minuut.</p>
      <table cellpadding="0" cellspacing="0" border="0" align="left">
      <tr><td style="background-color:${ACCENT};border-radius:10px;">
        <a href="${REVIEW_URL}" style="display:inline-block;padding:15px 36px;font-family:${F};font-size:13px;font-weight:500;letter-spacing:0.08em;text-transform:uppercase;color:#fff;text-decoration:none;">schrijf een recensie &rarr;</a>
      </td></tr></table>
    </td></tr></table>

    <table width="100%" cellpadding="0" cellspacing="0" border="0">
    <tr><td style="padding:0 40px;border-top:1px solid ${RULE};"></td></tr>
    <tr><td style="padding:20px 40px 32px;">
      <p style="margin:0;font-family:${F};font-size:12px;color:${LABEL_CLR};line-height:1.6;">
        Referentie: <span style="color:${SOFT};">${ref}</span> &nbsp;·&nbsp;
        <a href="https://knitfix.nl" style="color:${LABEL_CLR};text-decoration:none;">knitfix.nl</a>
      </p>
    </td></tr></table>

  </td></tr>

  <tr><td style="padding:24px 8px 0;text-align:center;">
    <p style="margin:0;font-family:${F};font-size:11px;color:${LABEL_CLR};letter-spacing:0.04em;line-height:1.8;">
      knitfix &nbsp;·&nbsp; amsterdam &nbsp;·&nbsp; kvk 42013270 &nbsp;·&nbsp; eenmanszaak
    </p>
  </td></tr>

</table>
</td></tr>
</table>
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
    const status     = pi?.metadata?.kf_status || "ontvangen";
    const shippedAt  = pi?.metadata?.kf_shipped_at ? parseInt(pi.metadata.kf_shipped_at) : null;
    const reviewSent = pi?.metadata?.kf_review_sent === "true";
    const readyBy    = pi?.metadata?.kf_ready_by || null;

    /* auto-send review email 14 days after verzonden */
    if (status === "verzonden" && shippedAt && !reviewSent && (now - shippedAt) >= fourteenDays) {
      try {
        const name = (s.metadata.customer_name || "").split(" ")[0];
        await resend.emails.send({
          from:     "KnitFix <hello@knitfix.nl>",
          reply_to: "hello.knitfix@gmail.com",
          to:       s.metadata.customer_email,
          subject:  "Hoe was je KnitFix ervaring?",
          html:     reviewEmailHtml(name, s.metadata.reference_code),
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
