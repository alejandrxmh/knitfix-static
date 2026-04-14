const Stripe = require("stripe");
const { Resend } = require("resend");

function authCheck(req) {
  const cookie = req.headers.cookie || "";
  const match = cookie.match(/kf_session=([^;]+)/);
  return match && match[1] === process.env.DASHBOARD_PASSWORD;
}

function quoteEmail(name, ref, garment, material, damage, price, quoteUrl) {
  return `<!DOCTYPE html>
<html><head><meta charset="UTF-8"/></head>
<body style="font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;background:#f4f2f0;margin:0;padding:40px 20px;">
<div style="max-width:520px;margin:0 auto;background:#fff;border:1px solid #ded6cf;">
  <div style="padding:36px 40px 24px;border-bottom:1px solid #ded6cf;">
    <p style="font-size:11px;letter-spacing:0.14em;text-transform:lowercase;color:#918b84;margin:0 0 6px;">knitfix · breiwerk reparatie atelier</p>
    <h1 style="font-size:20px;font-weight:400;color:#20201f;margin:0;text-transform:lowercase;">je offerte.</h1>
  </div>
  <div style="padding:32px 40px;">
    <p style="font-size:14px;color:#20201f;margin:0 0 24px;line-height:1.7;">Hoi ${name}, hier is de offerte voor je reparatie. Bekijk de details en bevestig als alles klopt.</p>
    <div style="background:#f4f2f0;padding:20px 24px;margin-bottom:28px;">
      <p style="font-size:10px;letter-spacing:0.14em;text-transform:lowercase;color:#b85c38;margin:0 0 10px;">offertenummer</p>
      <p style="font-size:20px;letter-spacing:0.1em;color:#20201f;margin:0;font-family:monospace;font-weight:600;">${ref}</p>
    </div>
    <table style="width:100%;font-size:13px;color:#20201f;margin-bottom:28px;border-collapse:collapse;">
      <tr><td style="padding:5px 0;color:#918b84;width:130px;">kledingstuk</td><td>${garment}</td></tr>
      <tr><td style="padding:5px 0;color:#918b84;">materiaal</td><td>${material}</td></tr>
      <tr><td style="padding:5px 0;color:#918b84;">schade</td><td>${damage}</td></tr>
      <tr><td style="padding:5px 0;color:#918b84;">totaalprijs</td><td style="font-weight:500;">€${price}</td></tr>
      <tr><td style="padding:5px 0;color:#918b84;">aanbetaling nu</td><td>€30 (bij bevestiging)</td></tr>
    </table>
    <a href="${quoteUrl}" style="display:inline-block;background:#b85c38;color:#f4f2f0;padding:12px 28px;font-size:12px;text-decoration:none;letter-spacing:0.08em;text-transform:lowercase;margin-bottom:16px;">bevestig & betaal aanbetaling →</a>
    <p style="font-size:11px;color:#918b84;margin:16px 0 0;line-height:1.7;">Vragen? WhatsApp ons op <a href="https://wa.me/31616120895" style="color:#b85c38;text-decoration:none;">+31 6 16120895</a></p>
  </div>
  <div style="padding:20px 40px;border-top:1px solid #ded6cf;">
    <p style="font-size:10px;color:#918b84;margin:0;line-height:1.8;">knitfix · amsterdam · <a href="https://knitfix.nl" style="color:#918b84;">knitfix.nl</a><br/>kvk 42013270 · eenmanszaak</p>
  </div>
</div>
</body></html>`;
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

  /* create Stripe checkout session for the deposit */
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

  /* send quote email */
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
