const Stripe = require("stripe");
const { Resend } = require("resend");
const createMoneybirdInvoice = require("./_moneybird-invoice");
const { findSessionByRef } = require("./_stripe-helpers");
const { authCheck } = require("./_auth");

// ─── Shared design tokens (mirrored from webhook.js) ─────────────────────────
const LOGO_URL  = "https://knitfix.nl/knitfix_logo.jpg";
const F         = "'Jost', 'Helvetica Neue', Helvetica, Arial, sans-serif";
const BG        = "#f7f2ed";
const WHITE     = "#ffffff";
const INK       = "#1f1811";
const MUTED     = "#b0998a";
const SOFT      = "#7a5e50";
const RULE      = "#f0ebe4";
const RULE2     = "#ede8e0";
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

function finalQuoteEmail(name, ref, garment, totalPrice, depositPaid, remainder, paymentUrl, readyByFormatted) {
  const readyBlock = readyByFormatted ? `
    <!-- ready by -->
    <table width="100%" cellpadding="0" cellspacing="0" border="0">
    <tr><td style="padding:0 40px 24px;">
      <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:${NOTE_BG};border-radius:10px;border-left:3px solid ${ACCENT};">
        <tr><td style="padding:16px 20px;">
          <p style="margin:0 0 4px;font-family:${F};font-size:11px;font-weight:500;letter-spacing:0.12em;text-transform:uppercase;color:${ACCENT_LT};">klaar op</p>
          <p style="margin:0;font-family:${F};font-size:15px;color:${INK};line-height:1.5;">${readyByFormatted}</p>
        </td></tr>
      </table>
    </td></tr></table>
  ` : '';

  const inner = `
    <!-- header -->
    <table width="100%" cellpadding="0" cellspacing="0" border="0">
    <tr><td style="padding:36px 40px 28px;border-bottom:1px solid ${RULE};">
      <p style="margin:0 0 12px;font-family:${F};font-size:11px;font-weight:500;letter-spacing:0.14em;text-transform:uppercase;color:${ACCENT_LT};">je offerte</p>
      <h1 style="margin:0 0 12px;font-family:${F};font-size:30px;font-weight:300;color:${INK};line-height:1.2;">je offerte<br>&amp; planning.</h1>
      <p style="margin:0;font-family:${F};font-size:14px;color:${SOFT};line-height:1.7;">
        Hoi ${name}, we hebben je ${garment} bekeken en hieronder vind je de definitieve offerte voor de reparatie. Betaal het restbedrag om de reparatie te laten starten.
      </p>
    </td></tr></table>

    ${readyBlock}

    <!-- eindafrekening -->
    <table width="100%" cellpadding="0" cellspacing="0" border="0">
    <tr><td style="padding:4px 40px 0;">
      <p style="margin:0 0 16px;font-family:${F};font-size:10px;font-weight:600;letter-spacing:0.16em;text-transform:uppercase;color:${LABEL_CLR};">offerte</p>
    </td></tr>
    <tr><td style="padding:0 40px 28px;">
      <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:${NOTE_BG};border-radius:10px;overflow:hidden;">
        <tr>
          <td style="padding:16px 20px 12px;font-family:${F};font-size:13px;color:${SOFT};">totale reparatiekosten</td>
          <td style="padding:16px 20px 12px;text-align:right;font-family:${F};font-size:13px;color:${INK};">€${totalPrice.toFixed(2)}</td>
        </tr>
        <tr>
          <td style="padding:0 20px 16px;font-family:${F};font-size:13px;color:${SOFT};">aanbetaling (al betaald)</td>
          <td style="padding:0 20px 16px;text-align:right;font-family:${F};font-size:13px;color:${MUTED};">− €${depositPaid.toFixed(2)}</td>
        </tr>
        <tr><td colspan="2" style="padding:0 20px;">
          <table width="100%" cellpadding="0" cellspacing="0" border="0">
          <tr><td style="border-top:1px solid ${RULE2};font-size:0;line-height:0;"></td></tr>
          </table>
        </td></tr>
        <tr>
          <td style="padding:16px 20px;font-family:${F};font-size:14px;font-weight:500;color:${INK};">te betalen</td>
          <td style="padding:16px 20px;text-align:right;font-family:${F};font-size:22px;font-weight:500;color:${ACCENT};">€${remainder.toFixed(2)}</td>
        </tr>
      </table>
    </td></tr></table>

    <!-- CTA -->
    <table width="100%" cellpadding="0" cellspacing="0" border="0">
    <tr><td style="padding:0 40px 32px;text-align:center;">
      <table cellpadding="0" cellspacing="0" border="0" align="center">
      <tr><td style="background-color:${ACCENT};border-radius:10px;">
        <a href="${paymentUrl}" style="display:inline-block;padding:15px 36px;font-family:${F};font-size:13px;font-weight:500;letter-spacing:0.08em;text-transform:uppercase;color:#fff;text-decoration:none;">betaal &amp; start reparatie &rarr;</a>
      </td></tr>
      </table>
    </td></tr></table>

    <!-- meta -->
    <table width="100%" cellpadding="0" cellspacing="0" border="0">
    <tr><td style="padding:0 40px;border-top:1px solid ${RULE};"></td></tr>
    <tr><td style="padding:20px 40px 32px;">
      <p style="margin:0 0 4px;font-family:${F};font-size:12px;color:${MUTED};line-height:1.6;">
        Referentie: <span style="color:${SOFT};">${ref}</span> &nbsp;·&nbsp; Na betaling starten we je reparatie${readyByFormatted ? ` en sturen je kledingstuk terug zodra ${readyByFormatted.toLowerCase().startsWith('klaar') ? 'klaar' : 'gereed'}` : ''}.
      </p>
      <p style="margin:0;font-family:${F};font-size:12px;color:${MUTED};line-height:1.6;">
        Vragen? WhatsApp <a href="https://wa.me/31616120895" style="color:${ACCENT};text-decoration:none;font-weight:500;">+31 6 16120895</a>
      </p>
    </td></tr></table>`;

  return shell(inner);
}

module.exports = async function handler(req, res) {
  if (!authCheck(req)) return res.status(401).json({ error: "Unauthorized" });
  if (req.method !== "POST") return res.status(405).end();

  const { ref, total_price, ready_by } = req.body || {};
  if (!ref || !total_price) return res.status(400).json({ error: "Missing ref or total_price" });

  const totalPrice  = parseFloat(total_price);
  const depositPaid = 30;
  const remainder   = totalPrice - depositPaid;

  if (remainder <= 0) {
    return res.status(400).json({ error: "Remainder must be greater than €0. Total must exceed €30." });
  }

  // Format ready_by (YYYY-MM-DD) to Dutch-locale readable string
  let readyByFormatted = "";
  if (ready_by) {
    try {
      const d = new Date(ready_by + "T12:00:00");
      if (!isNaN(d.getTime())) {
        readyByFormatted = d.toLocaleDateString("nl-NL", {
          weekday: "long",
          day:     "numeric",
          month:   "long",
          year:    "numeric",
        });
        // Capitalize first letter (nl-NL locale returns lowercase weekday)
        readyByFormatted = readyByFormatted.charAt(0).toUpperCase() + readyByFormatted.slice(1);
      }
    } catch (_) { /* leave empty */ }
  }

  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

  const baseUrl = process.env.BASE_URL;
  if (!baseUrl) {
    console.error("BASE_URL env var is not set");
    return res.status(500).json({ error: "Server configuration error." });
  }

  let original;
  try {
    original = await findSessionByRef(stripe, ref);
  } catch (err) {
    console.error("Stripe lookup failed:", err.message, err);
    return res.status(502).json({ error: "Could not look up the order in Stripe: " + err.message });
  }
  if (!original) return res.status(404).json({ error: "Order not found." });

  const meta = original.metadata || {};
  if (!meta.customer_name || !meta.customer_email) {
    return res.status(400).json({ error: "Order is missing customer info — cannot send quote." });
  }
  const name = meta.customer_name.split(" ")[0];

  let session;
  try {
    session = await stripe.checkout.sessions.create({
      payment_method_types: ["card", "ideal"],
      line_items: [{
        price_data: {
          currency: "eur",
          product_data: {
            name: "KnitFix — Final quote for repair",
            description: `${meta.garment_type || "garment"} (${meta.material || "—"}) · ref: ${ref}`,
          },
          unit_amount: Math.round(remainder * 100),
        },
        quantity: 1,
      }],
      mode:           "payment",
      customer_email: meta.customer_email,
      locale:         "nl",
      metadata: {
        ...meta,
        reference_code:   ref + "-FINAL",
        total_price:      String(totalPrice),
        deposit_paid:     String(depositPaid),
        remainder:        String(remainder),
        is_final_payment: "true",
      },
      success_url: `${baseUrl}/success.html?ref=${ref}`,
      cancel_url:  `${baseUrl}/`,
    });
  } catch (err) {
    console.error("Stripe checkout creation failed:", err.message, err);
    return res.status(502).json({ error: "Could not create payment link: " + err.message });
  }

  try {
    const resend = new Resend(process.env.RESEND_API_KEY);
    await resend.emails.send({
      from:     "KnitFix <hello@knitfix.nl>",
      reply_to: "hello@knitfix.nl",
      to:       meta.customer_email,
      subject:  `KnitFix · je offerte & planning (${ref})`,
      html:     finalQuoteEmail(name, ref, meta.garment_type, totalPrice, depositPaid, remainder, session.url, readyByFormatted),
    });
  } catch (err) {
    console.error("Resend email send failed:", err.message, err);
    return res.status(502).json({ error: "Quote could not be emailed: " + err.message });
  }

  // Mark final quote as sent on the ORIGINAL payment intent FIRST. This is
  // the source of truth for the admin dashboard, so if anything else after
  // this hangs/fails, the dashboard still reflects the correct state.
  try {
    const piId = typeof original.payment_intent === "string"
      ? original.payment_intent
      : original.payment_intent?.id;
    if (piId) {
      const metadataUpdate = {
        kf_final_invoice_sent: String(Date.now()),
        kf_final_total:        String(totalPrice),
        kf_final_remainder:    String(remainder),
        kf_status:             "in behandeling",
      };
      if (ready_by)          metadataUpdate.kf_ready_by = ready_by;
      if (readyByFormatted)  metadataUpdate.kf_ready_by_formatted = readyByFormatted;
      await stripe.paymentIntents.update(piId, { metadata: metadataUpdate });
    }
  } catch (err) {
    console.error("Failed to mark final quote sent:", err.message);
  }

  // Moneybird invoice creation is a "nice to have" — file it but don't let it
  // block the response. We race it against a 4s deadline; if it doesn't finish
  // in time, log and move on. The customer email + Stripe metadata + checkout
  // URL are the things that actually matter for the user.
  try {
    await Promise.race([
      createMoneybirdInvoice({
        ...meta,
        reference_code: ref + "-FINAL",
        _override_description: `KnitFix — final quote for repair — ${meta.garment_type} (${meta.material})\nRef: ${ref} · Total: €${totalPrice.toFixed(2)} · Deposit: −€${depositPaid.toFixed(2)}${readyByFormatted ? ` · Ready by: ${readyByFormatted}` : ''}`,
        _override_price: remainder.toFixed(2),
      }),
      new Promise((_, reject) => setTimeout(() => reject(new Error("moneybird timeout (4s)")), 4000)),
    ]);
  } catch (err) {
    console.error("Moneybird final quote invoice failed (non-fatal):", err.message);
  }

  return res.status(200).json({ ok: true, remainder, payment_url: session.url, ready_by_formatted: readyByFormatted });
};
