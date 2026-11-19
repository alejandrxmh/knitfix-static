/* GET /api/pay?ref=KF-2611-AB12[-FINAL]&t=<token>
   Emailed payment links point here instead of at a Stripe Checkout Session
   (those expire after 24h). On each click:
     1. already paid            -> "al betaald" page
     2. an open session exists  -> redirect to it
     3. otherwise               -> clone the latest session for this ref into a
                                   new one (same amount, metadata, urls) and redirect
   Metadata is copied as-is, so the webhook and admin dashboard behave exactly
   as if the original session had been paid. */

const Stripe = require("stripe");
const { findSessionsByRef } = require("./_stripe-helpers");
const { verifyPayToken } = require("./_pay-link");

const REF_RE = /^KF-\d{4}-[A-Z0-9]{4}(-FINAL)?$/;

function page(res, status, title, body) {
  res.statusCode = status;
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.end(`<!DOCTYPE html>
<html lang="nl"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0">
<title>${title} · KnitFix</title>
<link href="https://fonts.googleapis.com/css2?family=Jost:wght@300;400;500&display=swap" rel="stylesheet">
</head>
<body style="margin:0;background:#f7f2ed;font-family:'Jost',Helvetica,Arial,sans-serif;color:#1f1811;">
<div style="max-width:460px;margin:72px auto;padding:0 16px;text-align:center;">
  <img src="/knitfix_logo.jpg" width="64" height="64" alt="KnitFix" style="border-radius:14px;">
  <div style="background:#fff;border-radius:16px;padding:36px 32px;margin-top:28px;box-shadow:0 2px 16px rgba(40,20,10,0.08);">
    <h1 style="margin:0 0 12px;font-size:26px;font-weight:300;">${title}</h1>
    <p style="margin:0;font-size:14px;line-height:1.7;color:#7a5e50;">${body}</p>
  </div>
  <p style="margin-top:20px;font-size:13px;color:#7a5e50;">Vragen? WhatsApp
    <a href="https://wa.me/31616120895" style="color:#b85c38;text-decoration:none;">+31 6 16120895</a></p>
</div></body></html>`);
}

module.exports = async function handler(req, res) {
  if (req.method !== "GET") return res.status(405).end();

  const ref = String(req.query?.ref || "").trim().toUpperCase();
  const token = String(req.query?.t || "");

  if (!REF_RE.test(ref) || !verifyPayToken(ref, token)) {
    return page(res, 404, "link niet geldig", "Deze betaallink klopt niet. Neem even contact met ons op, dan sturen we een nieuwe.");
  }

  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

  let sessions;
  try {
    sessions = await findSessionsByRef(stripe, ref, { maxSearched: 1000 });
  } catch (err) {
    console.error("pay: Stripe lookup failed:", err.message);
    return page(res, 502, "even geduld", "Er ging iets mis bij het openen van de betaling. Probeer het over een paar minuten opnieuw.");
  }

  if (!sessions.length) {
    return page(res, 404, "betaling niet gevonden", `We konden geen betaling vinden voor referentie ${ref}.`);
  }

  // 1. already paid
  if (sessions.some((s) => s.payment_status === "paid" || s.status === "complete")) {
    return page(res, 200, "al betaald", `De betaling voor ${ref.replace(/-FINAL$/, "")} is al binnen. Bedankt!`);
  }

  // sessions are newest-first
  const latest = sessions[0];
  const nowSec = Math.floor(Date.now() / 1000);

  // 2. reuse a still-open session (with a few minutes of margin)
  if (latest.status === "open" && latest.url && latest.expires_at > nowSec + 300) {
    res.writeHead(303, { Location: latest.url, "Cache-Control": "no-store" });
    return res.end();
  }

  // 3. clone the latest session into a fresh one
  try {
    const items = await stripe.checkout.sessions.listLineItems(latest.id, {
      limit: 20,
      expand: ["data.price.product"],
    });

    const line_items = items.data.map((li) => {
      const product = li.price?.product;
      const product_data = { name: (product && product.name) || li.description || "KnitFix" };
      if (product && product.description) product_data.description = product.description;
      return {
        price_data: {
          currency: li.price?.currency || li.currency || "eur",
          product_data,
          unit_amount: li.price?.unit_amount ?? Math.round(li.amount_total / (li.quantity || 1)),
        },
        quantity: li.quantity || 1,
      };
    });

    const meta = latest.metadata || {};
    const fresh = await stripe.checkout.sessions.create({
      payment_method_types: latest.payment_method_types?.length ? latest.payment_method_types : ["card", "ideal"],
      line_items,
      mode: "payment",
      customer_email: meta.customer_email || latest.customer_email || latest.customer_details?.email || undefined,
      locale: latest.locale || "nl",
      metadata: meta,
      success_url: latest.success_url,
      cancel_url: latest.cancel_url,
    });

    res.writeHead(303, { Location: fresh.url, "Cache-Control": "no-store" });
    return res.end();
  } catch (err) {
    console.error("pay: could not create fresh session for", ref, err.message);
    return page(res, 502, "even geduld", "Er ging iets mis bij het openen van de betaling. Probeer het over een paar minuten opnieuw.");
  }
};
