const Stripe = require("stripe");
const { Resend } = require("resend");
const { findSessionByRef } = require("./_stripe-helpers");
const { authCheck } = require("./_auth");

// ─── Design tokens (mirrored from admin-status.js) ───────────────────────────
const LOGO_URL  = "https://knitfix.nl/knitfix_logo.png";
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

function labelEmailHtml(name, ref, trackingCode) {
  const trackingUrl = `https://jouw.postnl.nl/track-and-trace/${trackingCode}-NL-NL`;
  return `<!DOCTYPE html>
<html lang="nl">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0">${GF_LINK}</head>
<body style="margin:0;padding:0;background-color:${BG};font-family:${F};">
<table width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:${BG};padding:48px 16px 56px;">
<tr><td align="center">
<table width="540" cellpadding="0" cellspacing="0" border="0" style="max-width:540px;width:100%;">

  <tr><td style="padding-bottom:28px;text-align:center;">
    <img src="${LOGO_URL}" width="120" alt="KnitFix"
      style="display:block;margin:0 auto;">
  </td></tr>

  <tr><td style="background-color:${WHITE};border-radius:16px;overflow:hidden;box-shadow:0 2px 16px rgba(40,20,10,0.08);">

    <table width="100%" cellpadding="0" cellspacing="0" border="0">
    <tr><td style="padding:36px 40px 28px;border-bottom:1px solid ${RULE};">
      <p style="margin:0 0 12px;font-family:${F};font-size:11px;font-weight:500;letter-spacing:0.14em;text-transform:uppercase;color:${ACCENT_LT};">verzendlabel</p>
      <h1 style="margin:0;font-family:${F};font-size:30px;font-weight:300;color:${INK};line-height:1.2;">stuur je kledingstuk<br>naar ons op.</h1>
    </td></tr></table>

    <table width="100%" cellpadding="0" cellspacing="0" border="0">
    <tr><td style="padding:32px 40px 12px;">
      <p style="margin:0 0 18px;font-family:${F};font-size:14px;color:${INK};line-height:1.7;">Hoi ${name}, je verzending is geregeld. Hieronder vind je alles wat je nodig hebt om je kledingstuk op te sturen — zonder printer.</p>

      <p style="margin:22px 0 10px;font-family:${F};font-size:11px;font-weight:500;letter-spacing:0.14em;text-transform:uppercase;color:${ACCENT_LT};">inpakken</p>
      <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 4px;">
        <tr><td style="padding:6px 0;font-family:${F};font-size:13px;color:${SOFT};line-height:1.7;">
          &bull; &nbsp; een padded envelop of klein doosje is prima — breiwerk is zacht en heeft geen bubbeltjesplastic nodig
        </td></tr>
        <tr><td style="padding:6px 0;font-family:${F};font-size:13px;color:${SOFT};line-height:1.7;">
          &bull; &nbsp; was het stuk niet vooraf — ik wil het zien zoals jij het draagt
        </td></tr>
        <tr><td style="padding:6px 0;font-family:${F};font-size:13px;color:${SOFT};line-height:1.7;">
          &bull; &nbsp; check zakken en voering op spullen die je niet kwijt wilt
        </td></tr>
      </table>

      <p style="margin:22px 0 10px;font-family:${F};font-size:11px;font-weight:500;letter-spacing:0.14em;text-transform:uppercase;color:${ACCENT_LT};">naar PostNL</p>
      <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 20px;">
        <tr><td style="padding:6px 0;font-family:${F};font-size:13px;color:${SOFT};line-height:1.7;">
          <span style="color:${ACCENT};font-weight:500;">01</span> &nbsp; neem je pakket mee naar een willekeurig PostNL-punt
        </td></tr>
        <tr><td style="padding:6px 0;font-family:${F};font-size:13px;color:${SOFT};line-height:1.7;">
          <span style="color:${ACCENT};font-weight:500;">02</span> &nbsp; toon de PDF op je telefoon of noem trackingcode <strong style="color:${INK};">${trackingCode}</strong> — de medewerker print het label voor je
        </td></tr>
        <tr><td style="padding:6px 0;font-family:${F};font-size:13px;color:${SOFT};line-height:1.7;">
          <span style="color:${ACCENT};font-weight:500;">03</span> &nbsp; volg je pakket via <a href="${trackingUrl}" style="color:${ACCENT};text-decoration:none;font-weight:500;">${trackingCode}</a>
        </td></tr>
      </table>
    </td></tr></table>

    <table width="100%" cellpadding="0" cellspacing="0" border="0">
    <tr><td style="padding:0 40px 32px;">
      <table width="100%" cellpadding="0" cellspacing="0" border="0"
        style="background-color:${NOTE_BG};border-radius:10px;border-left:3px solid ${ACCENT};">
        <tr><td style="padding:16px 20px;">
          <p style="margin:0;font-family:${F};font-size:13px;color:${SOFT};line-height:1.65;">
            Heb je een printer en plak je het label liever zelf? Print de bijgevoegde PDF op A4 en plak hem op het pakket.
          </p>
        </td></tr>
      </table>
    </td></tr></table>

    <table width="100%" cellpadding="0" cellspacing="0" border="0">
    <tr><td style="padding:0 40px;border-top:1px solid ${RULE};"></td></tr>
    <tr><td style="padding:20px 40px 32px;">
      <p style="margin:0;font-family:${F};font-size:12px;color:${LABEL_CLR};line-height:1.6;">
        Referentie: <span style="color:${SOFT};">${ref}</span> &nbsp;·&nbsp;
        WhatsApp: <a href="https://wa.me/31616120895" style="color:${LABEL_CLR};text-decoration:none;">+31 6 16120895</a>
      </p>
    </td></tr></table>

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

// ─── Multipart parser (no formidable dep needed) ─────────────────────────────
// Vercel/Node expose req as a readable stream; we parse the multipart body
// ourselves to avoid adding dependencies to package.json.
function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

function parseMultipart(buffer, boundary) {
  const boundaryBuf = Buffer.from("--" + boundary);
  const parts = [];
  let start = 0;
  while (true) {
    const idx = buffer.indexOf(boundaryBuf, start);
    if (idx === -1) break;
    if (start > 0) parts.push(buffer.slice(start, idx - 2)); // -2 strips CRLF before boundary
    start = idx + boundaryBuf.length;
    // Skip CRLF after boundary; "--" means end
    if (buffer[start] === 0x2d && buffer[start + 1] === 0x2d) break;
    start += 2;
  }

  const fields = {};
  const files = {};
  for (const part of parts) {
    const headerEnd = part.indexOf("\r\n\r\n");
    if (headerEnd === -1) continue;
    const header = part.slice(0, headerEnd).toString("utf8");
    const content = part.slice(headerEnd + 4);

    const nameMatch = header.match(/name="([^"]+)"/);
    if (!nameMatch) continue;
    const name = nameMatch[1];
    const filenameMatch = header.match(/filename="([^"]+)"/);

    if (filenameMatch) {
      files[name] = { filename: filenameMatch[1], content };
    } else {
      fields[name] = content.toString("utf8").trim();
    }
  }
  return { fields, files };
}

// ─── Handler ─────────────────────────────────────────────────────────────────

module.exports = async function handler(req, res) {
  if (!authCheck(req)) return res.status(401).json({ error: "Unauthorized" });
  if (req.method !== "POST") return res.status(405).end();

  const contentType = req.headers["content-type"] || "";
  const boundaryMatch = contentType.match(/boundary=(?:"([^"]+)"|([^;]+))/);
  if (!boundaryMatch) return res.status(400).json({ error: "Missing multipart boundary" });
  const boundary = boundaryMatch[1] || boundaryMatch[2];

  let body;
  try {
    body = await readBody(req);
  } catch (err) {
    return res.status(400).json({ error: "Body read failed" });
  }

  if (body.length > 10 * 1024 * 1024) {
    return res.status(413).json({ error: "PDF too large (max 10MB)" });
  }

  const { fields, files } = parseMultipart(body, boundary);
  const ref = fields.ref;
  const trackingCode = fields.tracking_code;
  const overrideEmail = (fields.override_email || "").trim();
  const pdf = files.label;

  if (!ref || !trackingCode || !pdf) {
    return res.status(400).json({ error: "Missing ref, tracking_code, or label PDF" });
  }

  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
  const session = await findSessionByRef(stripe, ref);
  if (!session) return res.status(404).json({ error: "Order not found" });

  const fullName = session.metadata?.customer_name || "";
  const name = fullName.split(" ")[0] || "";

  // Override email wins if provided; otherwise use the one saved on the order
  const email = overrideEmail || session.metadata?.customer_email;

  if (!email) return res.status(400).json({ error: "No customer email on this order" });
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ error: "Email address looks invalid" });
  }

  // Send the email with PDF attached
  try {
    const resend = new Resend(process.env.RESEND_API_KEY);
    await resend.emails.send({
      from:     "KnitFix <hello@knitfix.nl>",
      reply_to: "hello@knitfix.nl",
      to:       email,
      subject:  `KnitFix · je verzendlabel (${ref})`,
      html:     labelEmailHtml(name, ref, trackingCode),
      attachments: [
        {
          filename: `knitfix-verzendlabel-${ref}.pdf`,
          content:  pdf.content.toString("base64"),
        },
      ],
    });
  } catch (err) {
    console.error("Label email failed:", err.message);
    return res.status(500).json({ error: "Email failed to send" });
  }

  // Store tracking info on the PaymentIntent so it shows up in the dashboard
  const piId = typeof session.payment_intent === "string"
    ? session.payment_intent
    : session.payment_intent?.id;

  if (piId) {
    await stripe.paymentIntents.update(piId, {
      metadata: {
        kf_inbound_tracking:    trackingCode,
        kf_inbound_label_sent:  String(Date.now()),
      },
    });
  }

  // If an override email was used, persist it to the checkout session metadata
  // so future emails (status updates, final invoice, review) go to the right address
  if (overrideEmail && overrideEmail !== session.metadata?.customer_email) {
    try {
      await stripe.checkout.sessions.update(session.id, {
        metadata: {
          ...session.metadata,
          customer_email: overrideEmail,
        },
      });
    } catch (err) {
      console.error("Could not persist override email to session metadata:", err.message);
      // non-fatal — the label was sent successfully
    }
  }

  return res.status(200).json({ ok: true, sent_to: email });
};
