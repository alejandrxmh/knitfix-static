const Stripe = require("stripe");
const { Resend } = require("resend");

function authCheck(req) {
  const cookie = req.headers.cookie || "";
  const match = cookie.match(/kf_session=([^;]+)/);
  return match && match[1] === process.env.DASHBOARD_PASSWORD;
}

// ─── Design tokens ────────────────────────────────────────────────────────────
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
const NOTE_BG   = "#fdf8f5";
const GF_LINK   = `<link href="https://fonts.googleapis.com/css2?family=Jost:wght@300;400;500;600&display=swap" rel="stylesheet">
<style>@import url('https://fonts.googleapis.com/css2?family=Jost:wght@300;400;500;600&display=swap');</style>`;

function buildEmail(headline, tag, bodyHtml) {
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

    <!-- header -->
    <table width="100%" cellpadding="0" cellspacing="0" border="0">
    <tr><td style="padding:36px 40px 28px;border-bottom:1px solid ${RULE};">
      <p style="margin:0 0 12px;font-family:${F};font-size:11px;font-weight:500;letter-spacing:0.14em;text-transform:uppercase;color:${ACCENT_LT};">${tag}</p>
      <h1 style="margin:0;font-family:${F};font-size:30px;font-weight:300;color:${INK};line-height:1.2;">${headline}</h1>
    </td></tr></table>

    <!-- body -->
    <table width="100%" cellpadding="0" cellspacing="0" border="0">
    <tr><td style="padding:32px 40px 36px;">
      ${bodyHtml}
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

function noteBlock(html) {
  return `<table width="100%" cellpadding="0" cellspacing="0" border="0"
    style="background-color:${NOTE_BG};border-radius:10px;border-left:3px solid ${ACCENT};margin-top:20px;">
    <tr><td style="padding:16px 20px;">
      <p style="margin:0;font-family:${F};font-size:13px;color:${SOFT};line-height:1.65;">${html}</p>
    </td></tr></table>`;
}

function bodyText(html) {
  return `<p style="margin:0 0 16px;font-family:${F};font-size:14px;color:${INK};line-height:1.7;">${html}</p>`;
}

function mutedText(html) {
  return `<p style="margin:0;font-family:${F};font-size:13px;color:${SOFT};line-height:1.7;">${html}</p>`;
}

// ─── Status email templates ───────────────────────────────────────────────────

const statusMessages = {
  "in behandeling": {
    subject: (ref) => `KnitFix · je reparatie is gestart (${ref})`,
    html: (name, ref, readyBy) => {
      const dateNote = readyBy
        ? ` We verwachten je kledingstuk klaar te hebben op <strong style="color:${INK};">${readyBy}</strong>.`
        : "";
      return buildEmail(
        "je reparatie<br>is gestart.",
        "reparatie gestart",
        bodyText(`Hoi ${name}, goed nieuws — je kledingstuk is aangekomen en we zijn begonnen met de reparatie.${dateNote}`) +
        noteBlock(`Heb je vragen? WhatsApp <a href="https://wa.me/31616120895" style="color:${ACCENT};text-decoration:none;font-weight:500;">+31 6 16120895</a> met referentie <strong style="color:${INK};">${ref}</strong>.`)
      );
    }
  },
  "klaar": {
    subject: (ref) => `KnitFix · je reparatie is klaar (${ref})`,
    html: (name, ref) => buildEmail(
      "je reparatie<br>is klaar.",
      "reparatie voltooid",
      bodyText(`Hoi ${name}, je reparatie is klaar! Je ontvangt binnenkort een factuur voor het restbedrag. Zodra betaald sturen we je kledingstuk terug.`) +
      noteBlock(`Vragen? WhatsApp <a href="https://wa.me/31616120895" style="color:${ACCENT};text-decoration:none;font-weight:500;">+31 6 16120895</a> · ref: <strong style="color:${INK};">${ref}</strong>`)
    )
  },
  "verzonden": {
    subject: (ref) => `KnitFix · je pakket is onderweg (${ref})`,
    html: (name, ref) => buildEmail(
      "je pakket<br>is onderweg.",
      "verzonden",
      bodyText(`Hoi ${name}, je kledingstuk is verstuurd en is binnenkort bij je thuis. Bedankt voor je vertrouwen in KnitFix!`) +
      noteBlock(`Referentie: <strong style="color:${INK};">${ref}</strong> · <a href="https://wa.me/31616120895" style="color:${ACCENT};text-decoration:none;font-weight:500;">+31 6 16120895</a>`)
    )
  }
};

// ─── Handler ──────────────────────────────────────────────────────────────────

module.exports = async function handler(req, res) {
  if (!authCheck(req)) return res.status(401).json({ error: "Unauthorized" });
  if (req.method !== "POST") return res.status(405).end();

  const { ref, status, customer_email, customer_name, ready_by } = req.body || {};
  if (!ref || !status) return res.status(400).json({ error: "Missing ref or status" });

  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
  const sessions = await stripe.checkout.sessions.list({ limit: 100 });
  const session = sessions.data.find(s => s.metadata?.reference_code === ref);
  if (!session) return res.status(404).json({ error: "Order not found" });

  const piId = typeof session.payment_intent === "string"
    ? session.payment_intent
    : session.payment_intent?.id;

  if (piId) {
    const updateData = { metadata: { kf_status: status } };
    if (ready_by) updateData.metadata.kf_ready_by = ready_by;
    if (status === "verzonden") updateData.metadata.kf_shipped_at = String(Date.now());
    await stripe.paymentIntents.update(piId, updateData);
  }

  const template = statusMessages[status];
  const email = customer_email || session.metadata?.customer_email;
  const name  = (customer_name || session.metadata?.customer_name || "").split(" ")[0];

  if (template && email) {
    try {
      const resend = new Resend(process.env.RESEND_API_KEY);
      await resend.emails.send({
        from:     "KnitFix <hello@knitfix.nl>",
        reply_to: "hello.knitfix@gmail.com",
        to:       email,
        subject:  template.subject(ref),
        html:     template.html(name, ref, ready_by),
      });
    } catch (err) {
      console.error("Status email failed:", err.message);
    }
  }

  return res.status(200).json({ ok: true });
};
