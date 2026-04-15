const Stripe = require("stripe");
const { Resend } = require("resend");

function authCheck(req) {
  const cookie = req.headers.cookie || "";
  const match = cookie.match(/kf_session=([^;]+)/);
  return match && match[1] === process.env.DASHBOARD_PASSWORD;
}

const LOGO_URL  = "https://knitfix.nl/knitfix_logo.jpg";
const F         = "'Jost', 'Helvetica Neue', Helvetica, Arial, sans-serif";
const BG        = "#f7f2ed";
const WHITE     = "#ffffff";
const INK       = "#1f1811";
const MUTED     = "#b0998a";
const SOFT      = "#7a5e50";
const RULE      = "#f0ebe4";
const RULE2     = "#f5f0ea";
const ACCENT    = "#b85c38";
const ACCENT_LT = "#c8714a";
const LABEL_CLR = "#c8b4a5";
const NOTE_BG   = "#fdf8f5";
const GF_LINK   = `<link href="https://fonts.googleapis.com/css2?family=Jost:wght@300;400;500;600&display=swap" rel="stylesheet">
<style>@import url('https://fonts.googleapis.com/css2?family=Jost:wght@300;400;500;600&display=swap');</style>`;

function shell(inner) {
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
      knitfix &nbsp;·&nbsp; amsterdam &nbsp;·&nbsp;
      <a href="https://knitfix.nl" style="color:${LABEL_CLR};text-decoration:none;">knitfix.nl</a><br>
      kvk 42013270 &nbsp;·&nbsp; btw NL005433323B97 &nbsp;·&nbsp; eenmanszaak
    </p>
  </td></tr>
</table>
</td></tr>
</table>
</body></html>`;
}

function detailRow(label, value, last = false) {
  const border = last ? "" : `border-bottom:1px solid ${RULE2};`;
  return `
  <tr>
    <td style="padding:8px 0;width:40%;vertical-align:top;${border}">
      <span style="font-family:${F};font-size:11px;font-weight:500;letter-spacing:0.1em;text-transform:uppercase;color:${LABEL_CLR};">${label}</span>
    </td>
    <td style="padding:8px 0;vertical-align:top;${border}">
      <span style="font-family:${F};font-size:13px;color:${INK};">${value}</span>
    </td>
  </tr>`;
}

function quoteEmail(name, ref, garment, material, damage, price, quoteUrl) {
  const inner = `
    <!-- header -->
    <table width="100%" cellpadding="0" cellspacing="0" border="0">
    <tr><td style="padding:36px 40px 28px;border-bottom:1px solid ${RULE};">
      <p style="margin:0 0 12px;font-family:${F};font-size:11px;font-weight:500;letter-spacing:0.14em;text-transform:uppercase;color:${ACCENT_LT};">jouw offerte</p>
      <h1 style="margin:0 0 8px;font-family:${F};font-size:30px;font-weight:300;color:${INK};line-height:1.15;">je offerte.</h1>
      <p style="margin:0;font-family:${F};font-size:13px;color:${MUTED};">Referentie: ${ref}</p>
    </td></tr></table>

    <!-- intro -->
    <table width="100%" cellpadding="0" cellspacing="0" border="0">
    <tr><td style="padding:28px 40px;">
      <p style="margin:0 0 28px;font-family:${F};font-size:14px;color:${INK};line-height:1.7;">Hoi ${name}, hier is de offerte voor je reparatie. Bekijk de details en bevestig als alles klopt.</p>

      <!-- details -->
      <p style="margin:0 0 16px;font-family:${F};font-size:10px;font-weight:600;letter-spacing:0.16em;text-transform:uppercase;color:${LABEL_CLR};">reparatiedetails</p>
      <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:28px;">
        ${detailRow("kledingstuk", garment)}
        ${detailRow("materiaal", material)}
        ${detailRow("schade", damage)}
        ${detailRow("totaalprijs", `<strong style="color:${INK};">€${price}</strong>`)}
        ${detailRow("aanbetaling nu", "€30 (bij bevestiging)", true)}
      </table>

    </td></tr></table>

    <!-- CTA -->
    <table width="100%" cellpadding="0" cellspacing="0" border="0">
    <tr><td style="padding:0 40px 32px;text-align:center;">
      <table cellpadding="0" cellspacing="0" border="0" align="center">
      <tr><td style="background-color:${ACCENT};border-radius:10px;">
        <a href="${quoteUrl}" style="display:inline-block;padding:15px 36px;font-family:${F};font-size:13px;font-weight:500;letter-spacing:0.08em;text-transform:uppercase;color:#fff;text-decoration:none;">bevestig &amp; betaal aanbetaling &rarr;</a>
      </td></tr>
      </table>
    </td></tr></table>

    <!-- note -->
    <table width="100%" cellpadding="0" cellspacing="0" border="0">
    <tr><td style="padding:0 40px 32px;">
      <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:${NOTE_BG};border-radius:10px;border-left:3px solid ${ACCENT};">
      <tr><td style="padding:16px 20px;">
        <p style="margin:0;font-family:${F};font-size:13px;color:${SOFT};line-height:1.65;">
          Vragen? WhatsApp ons op <a href="https://wa.me/31616120895" style="color:${ACCENT};text-decoration:none;font-weight:500;">+31 6 16120895</a>
        </p>
      </td></tr></table>
    </td></tr></table>`;

  return shell(inner);
}

function generateRef() {
  const now = new Date();
  const yymm = String(now.getFullYear()).slice(2) + String(now.getMonth() + 1).padStart(2, "0");
  const rand = Math.random().toString(36).substring(2, 6).toUpperCase();
  return `KF-${yymm}-${rand}`;
}

module.exports = async function handler(req, res) {
  if (!authCheck(req)) return res.status(401).json({ error: "Unauthorized" });
  if (req.method !== "POST") return res.status(405).end();

  const { name, email, phone, garment, material, damage, price, street, house_number, postal_code, city } = req.body || {};
  if (!name || !email || !garment || !price) return res.status(400).json({ error: "Missing required fields" });

  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
  const ref = generateRef();

  const session = await stripe.checkout.sessions.create({
    payment_method_types: ["card", "ideal"],
    line_items: [{
      price_data: {
        currency: "eur",
        product_data: {
          name: "KnitFix — Reparatie Aanbetaling",
          description: `${garment} (${material || "—"}) · retourverzending inbegrepen`,
        },
        unit_amount: 3000,
      },
      quantity: 1,
    }],
    mode: "payment",
    customer_email: email,
    locale: "nl",
    metadata: {
      reference_code:     ref,
      customer_name:      name,
      customer_email:     email,
      customer_phone:     phone || "",
      garment_type:       garment,
      material:           material || "",
      damage_type:        damage || "",
      damage_description: "",
      repair_preference:  "te bespreken",
      street:             street || "",
      house_number:       house_number || "",
      postal_code:        postal_code || "",
      city:               city || "",
      quote_price:        String(price),
    },
    success_url: `${process.env.BASE_URL}/success.html?ref=${ref}`,
    cancel_url:  `${process.env.BASE_URL}/#book`,
  });

  const resend = new Resend(process.env.RESEND_API_KEY);
  await resend.emails.send({
    from: "KnitFix <hello@knitfix.nl>",
    reply_to: "hello.knitfix@gmail.com",
    to: email,
    subject: `KnitFix · je offerte (${ref})`,
    html: quoteEmail(name.split(" ")[0], ref, garment, material || "—", damage || "—", price, session.url),
  });

  return res.status(200).json({ ok: true, ref, quote_url: session.url });
};
