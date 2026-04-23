/* Sends a Google review request email to a customer. */
const Stripe = require("stripe");
const { Resend } = require("resend");
const { findSessionByRef } = require("./_stripe-helpers");
const { authCheck } = require("./_auth");

const GOOGLE_REVIEW_URL = process.env.GOOGLE_REVIEW_URL;
if (!GOOGLE_REVIEW_URL) {
  console.warn("GOOGLE_REVIEW_URL env var is not set — review emails will have a broken link");
}

const LOGO_URL  = "https://knitfix.nl/knitfix_logo.jpg";
const F         = "'Jost', 'Helvetica Neue', Helvetica, Arial, sans-serif";
const BG        = "#f7f2ed";
const WHITE     = "#ffffff";
const INK       = "#1f1811";
const MUTED     = "#b0998a";
const SOFT      = "#7a5e50";
const RULE      = "#f0ebe4";
const ACCENT    = "#b85c38";
const ACCENT_LT = "#c8714a";
const LABEL_CLR = "#c8b4a5";
const GF_LINK   = `<link href="https://fonts.googleapis.com/css2?family=Jost:wght@300;400;500;600&display=swap" rel="stylesheet">
<style>@import url('https://fonts.googleapis.com/css2?family=Jost:wght@300;400;500;600&display=swap');</style>`;

function reviewEmailHtml(name, ref) {
  const inner = `
    <!-- header -->
    <table width="100%" cellpadding="0" cellspacing="0" border="0">
    <tr><td style="padding:36px 40px 28px;border-bottom:1px solid ${RULE};">
      <p style="margin:0 0 12px;font-family:${F};font-size:11px;font-weight:500;letter-spacing:0.14em;text-transform:uppercase;color:${ACCENT_LT};">jouw ervaring</p>
      <h1 style="margin:0;font-family:${F};font-size:30px;font-weight:300;color:${INK};line-height:1.2;">hoe was je<br>reparatie?</h1>
    </td></tr></table>

    <!-- body -->
    <table width="100%" cellpadding="0" cellspacing="0" border="0">
    <tr><td style="padding:28px 40px;">
      <p style="margin:0 0 16px;font-family:${F};font-size:14px;color:${INK};line-height:1.7;">Hoi ${name}, hopelijk is je kledingstuk goed aangekomen en ben je blij met het resultaat.</p>
      <p style="margin:0 0 28px;font-family:${F};font-size:13px;color:${SOFT};line-height:1.7;">Als je een momentje hebt, zou een recensie ons enorm helpen. Het duurt minder dan een minuut.</p>
    </td></tr></table>

    <!-- CTA -->
    <table width="100%" cellpadding="0" cellspacing="0" border="0">
    <tr><td style="padding:0 40px 32px;text-align:center;">
      <table cellpadding="0" cellspacing="0" border="0" align="center">
      <tr><td style="background-color:${ACCENT};border-radius:10px;">
        <a href="${GOOGLE_REVIEW_URL}" style="display:inline-block;padding:15px 36px;font-family:${F};font-size:13px;font-weight:500;letter-spacing:0.08em;text-transform:uppercase;color:#fff;text-decoration:none;">schrijf een recensie &rarr;</a>
      </td></tr>
      </table>
    </td></tr></table>

    <!-- meta -->
    <table width="100%" cellpadding="0" cellspacing="0" border="0">
    <tr><td style="padding:0 40px;border-top:1px solid ${RULE};"></td></tr>
    <tr><td style="padding:20px 40px 32px;">
      <p style="margin:0;font-family:${F};font-size:12px;color:${MUTED};line-height:1.6;">
        Referentie: <span style="color:${SOFT};">${ref}</span> &nbsp;·&nbsp;
        <a href="https://knitfix.nl" style="color:${MUTED};text-decoration:none;">knitfix.nl</a>
      </p>
    </td></tr></table>`;

  return `<!DOCTYPE html>
<html lang="nl">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0">${GF_LINK}</head>
<body style="margin:0;padding:0;background-color:${BG};font-family:${F};">
<table width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:${BG};padding:48px 16px 56px;">
<tr><td align="center">
<table width="540" cellpadding="0" cellspacing="0" border="0" style="max-width:540px;width:100%;">
  <tr><td style="padding-bottom:28px;text-align:center;">
    <img src="${LOGO_URL}" width="64" height="64" alt="KnitFix" style="display:block;margin:0 auto;border-radius:14px;">
  </td></tr>
  <tr><td style="background-color:${WHITE};border-radius:16px;overflow:hidden;box-shadow:0 2px 16px rgba(40,20,10,0.08);">
    ${inner}
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
  if (req.method !== "POST") return res.status(405).end();

  if (!authCheck(req)) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const { email, name, ref } = req.body || {};
  if (!email || !name || !ref) return res.status(400).json({ error: "Missing fields" });

  const resend = new Resend(process.env.RESEND_API_KEY);
  await resend.emails.send({
    from:     "KnitFix <hello@knitfix.nl>",
    reply_to: "hello@knitfix.nl",
    to:       email,
    subject:  "Hoe was je KnitFix ervaring?",
    html:     reviewEmailHtml(name.split(" ")[0], ref),
  });

  // Mark review as sent in Stripe metadata so (a) the auto-send cron in
  // admin-orders.js doesn't fire a duplicate 14 days later, and (b) the
  // admin UI stepper shows the step as completed with a timestamp.
  try {
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
    const session = await findSessionByRef(stripe, ref);
    const piId = typeof session?.payment_intent === "string"
      ? session.payment_intent
      : session?.payment_intent?.id;
    if (piId) {
      await stripe.paymentIntents.update(piId, {
        metadata: {
          kf_review_sent:    "true",
          kf_review_sent_at: String(Date.now()),
        },
      });
    }
  } catch (err) {
    console.error("Could not mark review_sent in Stripe metadata:", err.message);
    // Email was sent successfully, so we don't fail the request
  }

  return res.status(200).json({ ok: true });
};
