const Stripe = require("stripe");
const { Resend } = require("resend");

async function getRawBody(req) {
  if (Buffer.isBuffer(req.body)) return req.body;
  if (typeof req.body === "string") return Buffer.from(req.body);
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (chunk) => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

async function isRepeatCustomer(stripe, email, currentSessionId) {
  try {
    const sessions = await stripe.checkout.sessions.list({ limit: 100 });
    return sessions.data.some(s =>
      s.id !== currentSessionId &&
      s.payment_status === "paid" &&
      s.metadata?.customer_email === email
    );
  } catch { return false; }
}

// ─── Shared design tokens ─────────────────────────────────────────────────────

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

const GF_LINK = `<link href="https://fonts.googleapis.com/css2?family=Jost:wght@300;400;500;600&display=swap" rel="stylesheet">
<style>@import url('https://fonts.googleapis.com/css2?family=Jost:wght@300;400;500;600&display=swap');</style>`;

function shell(inner) {
  return `<!DOCTYPE html>
<html lang="nl">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0">${GF_LINK}</head>
<body style="margin:0;padding:0;background-color:${BG};font-family:${F};">
<table width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:${BG};padding:48px 16px 56px;">
<tr><td align="center">
<table width="540" cellpadding="0" cellspacing="0" border="0" style="max-width:540px;width:100%;">

  <!-- logo -->
  <tr><td style="padding-bottom:28px;text-align:center;">
    <img src="${LOGO_URL}" width="64" height="64" alt="KnitFix"
      style="display:block;margin:0 auto;border-radius:14px;">
  </td></tr>

  <!-- card -->
  <tr><td style="background-color:${WHITE};border-radius:16px;overflow:hidden;box-shadow:0 2px 16px rgba(40,20,10,0.08);">
    ${inner}
  </td></tr>

  <!-- footer -->
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

function sectionLabel(text) {
  return `<p style="margin:0 0 16px;font-family:${F};font-size:10px;font-weight:600;letter-spacing:0.16em;text-transform:uppercase;color:${LABEL_CLR};">${text}</p>`;
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

function ctaButton(text, url) {
  return `
  <table cellpadding="0" cellspacing="0" border="0" align="center">
    <tr><td style="background-color:${ACCENT};border-radius:10px;">
      <a href="${url}" style="display:inline-block;padding:15px 36px;font-family:${F};font-size:13px;font-weight:500;letter-spacing:0.08em;text-transform:uppercase;color:#fff;text-decoration:none;">${text} &rarr;</a>
    </td></tr>
  </table>`;
}

// ─── Customer booking confirmation ────────────────────────────────────────────

function customerEmail(meta, address, repeat) {
  const firstName = meta.customer_name.split(" ")[0];
  const greeting = repeat
    ? `Welkom terug ${firstName}! Fijn dat je KnitFix weer vertrouwt voor je reparatie.`
    : `Hoi ${firstName}, je boeking is ontvangen en de aanbetaling is verwerkt.`;

  const inner = `
    <!-- header -->
    <table width="100%" cellpadding="0" cellspacing="0" border="0">
    <tr><td style="padding:36px 40px 28px;border-bottom:1px solid ${RULE};">
      <p style="margin:0 0 12px;font-family:${F};font-size:11px;font-weight:500;letter-spacing:0.14em;text-transform:uppercase;color:${ACCENT_LT};">boeking bevestigd</p>
      <h1 style="margin:0 0 8px;font-family:${F};font-size:30px;font-weight:300;letter-spacing:0.02em;color:${INK};line-height:1.15;">${meta.reference_code}</h1>
      <p style="margin:0;font-family:${F};font-size:13px;color:${MUTED};">${repeat ? "terugkerende klant &nbsp;·&nbsp; " : ""}€30 aanbetaling ontvangen</p>
    </td></tr></table>

    <!-- intro -->
    <table width="100%" cellpadding="0" cellspacing="0" border="0">
    <tr><td style="padding:28px 40px 0;">
      <p style="margin:0 0 24px;font-family:${F};font-size:14px;color:${INK};line-height:1.7;">${greeting}</p>

      <!-- reference box -->
      <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:${NOTE_BG};border-radius:10px;border-left:3px solid ${ACCENT};margin-bottom:28px;">
      <tr><td style="padding:18px 20px;">
        <p style="margin:0 0 4px;font-family:${F};font-size:10px;font-weight:600;letter-spacing:0.14em;text-transform:uppercase;color:${ACCENT_LT};">jouw referentiecode</p>
        <p style="margin:0 0 6px;font-family:monospace;font-size:22px;font-weight:600;color:${INK};letter-spacing:0.12em;">${meta.reference_code}</p>
        <p style="margin:0;font-family:${F};font-size:12px;color:${SOFT};line-height:1.6;">Schrijf deze code op een briefje en doe het bij je pakket.</p>
      </td></tr></table>

    </td></tr></table>

    <!-- send-to section -->
    <table width="100%" cellpadding="0" cellspacing="0" border="0">
    <tr><td style="padding:0 40px 24px;">
      ${sectionLabel("sturen naar")}
      <p style="margin:0;font-family:${F};font-size:14px;color:${INK};line-height:1.7;">${address}<br>
        <span style="color:${MUTED};font-size:12px;">Nederland</span></p>
    </td></tr></table>

    <!-- repair details -->
    <table width="100%" cellpadding="0" cellspacing="0" border="0">
    <tr><td style="padding:0 40px;border-top:1px solid ${RULE};">
      <p style="margin:24px 0 16px;font-family:${F};font-size:10px;font-weight:600;letter-spacing:0.16em;text-transform:uppercase;color:${LABEL_CLR};">wat je hebt geboekt</p>
    </td></tr>
    <tr><td style="padding:0 40px 24px;">
      <table width="100%" cellpadding="0" cellspacing="0" border="0">
        ${detailRow("kledingstuk", meta.garment_type)}
        ${detailRow("materiaal", meta.material)}
        ${detailRow("schade", meta.damage_type)}
        ${meta.damage_description ? detailRow("omschrijving", meta.damage_description) : ""}
        ${detailRow("reparatiestijl", meta.repair_preference)}
        ${detailRow("aanbetaling", "€30 (incl. retourverzending)", true)}
      </table>
    </td></tr></table>

    <!-- how to ship -->
    <table width="100%" cellpadding="0" cellspacing="0" border="0">
    <tr><td style="padding:0 40px;border-top:1px solid ${RULE};">
      <p style="margin:24px 0 10px;font-family:${F};font-size:13px;font-weight:500;color:${INK};">hoe opsturen</p>
      <p style="margin:0 0 20px;font-family:${F};font-size:13px;color:${SOFT};line-height:1.75;">Verpak het kledingstuk in een plastic zakje, daarna in een doos of stevige envelop. Voeg een briefje toe met je referentiecode. Verstuur via PostNL, DHL of een andere aanbieder — bewaar je bon, de verzendkosten worden vergoed.</p>
    </td></tr></table>

    <!-- whatsapp note -->
    <table width="100%" cellpadding="0" cellspacing="0" border="0">
    <tr><td style="padding:0 40px 36px;">
      <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:${NOTE_BG};border-radius:10px;border-left:3px solid ${ACCENT};">
      <tr><td style="padding:16px 20px;">
        <p style="margin:0;font-family:${F};font-size:13px;color:${SOFT};line-height:1.65;">
          Stuur ook <strong style="color:${INK};">2–4 foto's van de schade</strong> via WhatsApp naar
          <a href="https://wa.me/31616120895" style="color:${ACCENT};text-decoration:none;font-weight:500;">+31 6 16120895</a>
          met je referentiecode <strong style="color:${INK};">${meta.reference_code}</strong>.
        </p>
      </td></tr></table>
    </td></tr></table>`;

  return shell(inner);
}

// ─── Admin booking notification ───────────────────────────────────────────────

function adminEmail(meta, repeat) {
  const inner = `
    <!-- header -->
    <table width="100%" cellpadding="0" cellspacing="0" border="0">
    <tr><td style="padding:36px 40px 28px;border-bottom:1px solid ${RULE};">
      <p style="margin:0 0 12px;font-family:${F};font-size:11px;font-weight:500;letter-spacing:0.14em;text-transform:uppercase;color:${ACCENT_LT};">${repeat ? "terugkerende klant 🔁" : "nieuwe boeking"}</p>
      <h1 style="margin:0 0 8px;font-family:${F};font-size:30px;font-weight:300;letter-spacing:0.02em;color:${INK};line-height:1.15;">${meta.reference_code}</h1>
      <p style="margin:0;font-family:${F};font-size:13px;color:${MUTED};">€30 aanbetaling ontvangen</p>
    </td></tr></table>

    <!-- contact -->
    <table width="100%" cellpadding="0" cellspacing="0" border="0">
    <tr><td style="padding:24px 40px 0;">${sectionLabel("contactgegevens")}</td></tr>
    <tr><td style="padding:0 40px 24px;">
      <table width="100%" cellpadding="0" cellspacing="0" border="0">
        ${detailRow("naam", meta.customer_name)}
        ${detailRow("email", `<a href="mailto:${meta.customer_email}" style="color:${ACCENT};text-decoration:none;">${meta.customer_email}</a>`)}
        ${detailRow("telefoon", meta.customer_phone || "niet opgegeven")}
        ${detailRow("retouradres", `${meta.street} ${meta.house_number}, ${meta.postal_code} ${meta.city}`, true)}
      </table>
    </td></tr></table>

    <!-- repair -->
    <table width="100%" cellpadding="0" cellspacing="0" border="0">
    <tr><td style="padding:0 40px;border-top:1px solid ${RULE};">
      <p style="margin:24px 0 16px;font-family:${F};font-size:10px;font-weight:600;letter-spacing:0.16em;text-transform:uppercase;color:${LABEL_CLR};">reparatiedetails</p>
    </td></tr>
    <tr><td style="padding:0 40px 36px;">
      <table width="100%" cellpadding="0" cellspacing="0" border="0">
        ${detailRow("kledingstuk", meta.garment_type)}
        ${detailRow("materiaal", meta.material)}
        ${detailRow("schade", meta.damage_type)}
        ${meta.damage_description ? detailRow("omschrijving", meta.damage_description) : ""}
        ${detailRow("reparatiestijl", meta.repair_preference, true)}
      </table>
    </td></tr></table>`;

  return shell(inner);
}

// ─── Webhook handler ──────────────────────────────────────────────────────────

module.exports = async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).send("Method not allowed");

  const rawBody = await getRawBody(req);
  const sig = req.headers["stripe-signature"];
  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

  let event;
  try {
    event = stripe.webhooks.constructEvent(rawBody, sig, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    console.error("Webhook signature failed:", err.message);
    return res.status(400).send(`Webhook error: ${err.message}`);
  }

  if (event.type !== "checkout.session.completed") {
    return res.status(200).json({ received: true });
  }

  const session = event.data.object;
  const meta = session.metadata;
  const resend = new Resend(process.env.RESEND_API_KEY);

  const repeat = await isRepeatCustomer(stripe, meta.customer_email, session.id);

  const knitfixAddress = [
    process.env.KNITFIX_STREET,
    process.env.KNITFIX_HOUSE_NUMBER,
    process.env.KNITFIX_POSTAL,
    process.env.KNITFIX_CITY || "Amsterdam",
  ].filter(Boolean).join(" ");

  try {
    await resend.emails.send({
      from: "KnitFix <hello@knitfix.nl>",
      reply_to: "hello.knitfix@gmail.com",
      to: meta.customer_email,
      subject: `KnitFix · boeking bevestigd (${meta.reference_code})`,
      html: customerEmail(meta, knitfixAddress, repeat),
    });
    console.log("Customer email sent, repeat:", repeat);
  } catch (err) {
    console.error("Customer email failed:", err.message);
  }

  try {
    await resend.emails.send({
      from: "KnitFix Boekingen <hello@knitfix.nl>",
      reply_to: "hello.knitfix@gmail.com",
      to: process.env.KNITFIX_NOTIFY_EMAIL || "hello.knitfix@gmail.com",
      subject: `${repeat ? "🔁 " : ""}Nieuwe boeking: ${meta.reference_code} · ${meta.garment_type}`,
      html: adminEmail(meta, repeat),
    });
  } catch (err) {
    console.error("Admin email failed:", err.message);
  }

  return res.status(200).json({ received: true });
};
