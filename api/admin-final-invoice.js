const Stripe = require("stripe");
const { Resend } = require("resend");
const createMoneybirdInvoice = require("./moneybird-invoice");

function authCheck(req) {
  const cookie = req.headers.cookie || "";
  const match = cookie.match(/kf_session=([^;]+)/);
  return match && match[1] === process.env.DASHBOARD_PASSWORD;
}

function finalInvoiceEmail(name, ref, garment, totalPrice, depositPaid, remainder, paymentUrl) {
  return `<!DOCTYPE html>
<html><head><meta charset="UTF-8"/></head>
<body style="font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;background:#f4f2f0;margin:0;padding:40px 20px;">
<div style="max-width:520px;margin:0 auto;background:#fff;border:1px solid #ded6cf;">
  <div style="padding:36px 40px 24px;border-bottom:1px solid #ded6cf;">
    <p style="font-size:11px;letter-spacing:0.14em;text-transform:lowercase;color:#918b84;margin:0 0 6px;">knitfix · breiwerk reparatie atelier</p>
    <h1 style="font-size:20px;font-weight:400;color:#20201f;margin:0;text-transform:lowercase;">je reparatie is klaar.</h1>
  </div>
  <div style="padding:32px 40px;">
    <p style="font-size:14px;color:#20201f;margin:0 0 24px;line-height:1.7;">Hoi ${name}, je ${garment} is gerepareerd en klaar om terug te sturen. Betaal het restbedrag om de verzending te starten.</p>
    <div style="background:#f4f2f0;padding:20px 24px;margin-bottom:28px;">
      <p style="font-size:10px;letter-spacing:0.14em;text-transform:lowercase;color:#b85c38;margin:0 0 12px;">eindafrekening</p>
      <table style="width:100%;font-size:13px;color:#20201f;border-collapse:collapse;">
        <tr><td style="padding:5px 0;color:#918b84;">totale reparatiekosten</td><td style="text-align:right;">€${totalPrice.toFixed(2)}</td></tr>
        <tr><td style="padding:5px 0;color:#918b84;">aanbetaling (al betaald)</td><td style="text-align:right;color:#3b6d11;">− €${depositPaid.toFixed(2)}</td></tr>
        <tr style="border-top:1px solid #ded6cf;"><td style="padding:8px 0 4px;font-weight:500;">te betalen</td><td style="text-align:right;font-size:18px;font-weight:500;padding:8px 0 4px;">€${remainder.toFixed(2)}</td></tr>
      </table>
    </div>
    <a href="${paymentUrl}" style="display:inline-block;background:#b85c38;color:#f4f2f0;padding:12px 28px;font-size:12px;text-decoration:none;letter-spacing:0.08em;text-transform:lowercase;margin-bottom:20px;">betaal restbedrag →</a>
    <p style="font-size:12px;color:#918b84;margin:0;line-height:1.7;">Referentie: ${ref} · Na betaling sturen we je kledingstuk terug via koerier.</p>
    <p style="font-size:12px;color:#918b84;margin:12px 0 0;line-height:1.7;">Vragen? WhatsApp <a href="https://wa.me/31616120895" style="color:#b85c38;text-decoration:none;">+31 6 16120895</a></p>
  </div>
  <div style="padding:20px 40px;border-top:1px solid #ded6cf;">
    <p style="font-size:10px;color:#918b84;margin:0;line-height:1.8;">knitfix · amsterdam · <a href="https://knitfix.nl" style="color:#918b84;">knitfix.nl</a><br/>kvk 42013270 · btw NL005433323B97 · eenmanszaak</p>
  </div>
</div>
</body></html>`;
}

module.exports = async function handler(req, res) {
  if (!authCheck(req)) return res.status(401).json({ error: "Unauthorized" });
  if (req.method !== "POST") return res.status(405).end();

  const { ref, total_price } = req.body || {};
  if (!ref || !total_price) return res.status(400).json({ error: "Missing ref or total_price" });

  const totalPrice  = parseFloat(total_price);
  const depositPaid = 30;
  const remainder   = totalPrice - depositPaid;

  if (remainder <= 0) {
    return res.status(400).json({ error: "Restbedrag moet groter zijn dan €0. Totaal moet meer dan €30 zijn." });
  }

  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

  /* find original session */
  const sessions = await stripe.checkout.sessions.list({ limit: 100 });
  const original  = sessions.data.find(s => s.metadata?.reference_code === ref);
  if (!original) return res.status(404).json({ error: "Bestelling niet gevonden." });

  const meta = original.metadata;
  const name = meta.customer_name.split(" ")[0];

  /* create Stripe checkout for remainder */
  const session = await stripe.checkout.sessions.create({
    payment_method_types: ["card", "ideal"],
    line_items: [{
      price_data: {
        currency: "eur",
        product_data: {
          name: "KnitFix — Restbedrag reparatie",
          description: `${meta.garment_type} (${meta.material}) · ref: ${ref}`,
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
      reference_code:  ref + "-FINAL",
      total_price:     String(totalPrice),
      deposit_paid:    String(depositPaid),
      remainder:       String(remainder),
      is_final_payment: "true",
    },
    success_url: `${process.env.BASE_URL}/success.html?ref=${ref}`,
    cancel_url:  `${process.env.BASE_URL}/`,
  });

  /* send email to customer */
  const resend = new Resend(process.env.RESEND_API_KEY);
  await resend.emails.send({
    from:     "KnitFix <hello@knitfix.nl>",
    reply_to: "hello.knitfix@gmail.com",
    to:       meta.customer_email,
    subject:  `KnitFix · restbedrag reparatie (${ref})`,
    html:     finalInvoiceEmail(name, ref, meta.garment_type, totalPrice, depositPaid, remainder, session.url),
  });

  /* create final Moneybird invoice for remainder */
  try {
    await createMoneybirdInvoice({
      ...meta,
      reference_code: ref + "-FINAL",
      _override_description: `KnitFix reparatie restbedrag — ${meta.garment_type} (${meta.material})\nReferentie: ${ref} · Totaal: €${totalPrice.toFixed(2)} · Aanbetaling: −€${depositPaid.toFixed(2)}`,
      _override_price: remainder.toFixed(2),
    });
  } catch (err) {
    console.error("Moneybird final invoice failed:", err.message);
  }

  return res.status(200).json({ ok: true, remainder, payment_url: session.url });
};
