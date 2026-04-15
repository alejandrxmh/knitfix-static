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

function customerEmail(meta, address, repeat) {
  const firstName = meta.customer_name.split(" ")[0];
  const greeting = repeat
    ? `Welkom terug ${firstName}! Fijn dat je KnitFix weer vertrouwt voor je reparatie.`
    : `Hoi ${firstName}, je boeking is ontvangen en de aanbetaling is verwerkt.`;

  return `<!DOCTYPE html>
<html><head><meta charset="UTF-8"/></head>
<body style="font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;background:#f4f2f0;margin:0;padding:40px 20px;">
<div style="max-width:520px;margin:0 auto;background:#fff;border:1px solid #ded6cf;">
  <div style="padding:36px 40px 24px;border-bottom:1px solid #ded6cf;">
    <p style="font-size:11px;letter-spacing:0.14em;text-transform:lowercase;color:#918b84;margin:0 0 6px;">knitfix · breiwerk reparatie atelier</p>
    <h1 style="font-size:20px;font-weight:400;color:#20201f;margin:0;text-transform:lowercase;">boeking bevestigd.</h1>
  </div>
  <div style="padding:32px 40px;">
    <p style="font-size:14px;color:#20201f;margin:0 0 24px;line-height:1.7;">${greeting}</p>
    <div style="background:#f4f2f0;padding:20px 24px;margin-bottom:28px;">
      <p style="font-size:10px;letter-spacing:0.14em;text-transform:lowercase;color:#b85c38;margin:0 0 10px;">jouw referentiecode</p>
      <p style="font-size:26px;letter-spacing:0.14em;color:#20201f;margin:0;font-family:monospace;font-weight:600;">${meta.reference_code}</p>
      <p style="font-size:11px;color:#918b84;margin:8px 0 0;line-height:1.6;">Schrijf deze code op een briefje en doe het bij je pakket.</p>
    </div>
    <p style="font-size:10px;letter-spacing:0.12em;text-transform:lowercase;color:#b85c38;margin:0 0 8px;">sturen naar</p>
    <p style="font-size:14px;color:#20201f;margin:0 0 28px;line-height:1.7;">${address}<br/><span style="color:#918b84;font-size:12px;">Nederland</span></p>
    <p style="font-size:10px;letter-spacing:0.12em;text-transform:lowercase;color:#b85c38;margin:0 0 8px;">wat je hebt geboekt</p>
    <table style="width:100%;font-size:13px;color:#20201f;margin-bottom:28px;border-collapse:collapse;">
      <tr><td style="padding:5px 0;color:#918b84;width:130px;">kledingstuk</td><td>${meta.garment_type}</td></tr>
      <tr><td style="padding:5px 0;color:#918b84;">materiaal</td><td>${meta.material}</td></tr>
      <tr><td style="padding:5px 0;color:#918b84;">schade</td><td>${meta.damage_type}</td></tr>
      ${meta.damage_description ? `<tr><td style="padding:5px 0;color:#918b84;">omschrijving</td><td>${meta.damage_description}</td></tr>` : ""}
      <tr><td style="padding:5px 0;color:#918b84;">reparatiestijl</td><td>${meta.repair_preference}</td></tr>
      <tr><td style="padding:5px 0;color:#918b84;">aanbetaling</td><td>€30 (incl. retourverzending)</td></tr>
    </table>
    <div style="border-left:2px solid #b85c38;padding-left:16px;margin-bottom:28px;">
      <p style="font-size:13px;color:#20201f;margin:0 0 8px;font-weight:500;">hoe opsturen</p>
      <p style="font-size:12px;color:#918b84;margin:0;line-height:1.75;">Verpak het kledingstuk in een plastic zakje, daarna in een doos of stevige envelop. Voeg een briefje toe met je referentiecode. Verstuur via PostNL, DHL of een andere aanbieder — bewaar je bon, de verzendkosten worden vergoed.</p>
    </div>
    <p style="font-size:13px;color:#20201f;margin:0 0 8px;line-height:1.7;">Stuur ook <strong>2 tot 4 foto's van de schade</strong> via WhatsApp naar <a href="https://wa.me/31616120895" style="color:#b85c38;text-decoration:none;">+31 6 16120895</a> met je referentiecode ${meta.reference_code}.</p>
    <p style="font-size:13px;color:#918b84;margin:0;line-height:1.7;">Na ontvangst sturen we een bevestiging en de definitieve planning. Het restbedrag wordt daarna gefactureerd.</p>
  </div>
  <div style="padding:20px 40px;border-top:1px solid #ded6cf;">
    <p style="font-size:10px;color:#918b84;margin:0;line-height:1.8;">knitfix · amsterdam · <a href="https://knitfix.nl" style="color:#918b84;">knitfix.nl</a><br/>kvk 42013270 · btw NL005433323B97 · eenmanszaak</p>
  </div>
</div>
</body></html>`;
}

function adminEmail(meta, repeat) {
  return `<!DOCTYPE html>
<html><head><meta charset="UTF-8"/></head>
<body style="font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;background:#f4f2f0;margin:0;padding:40px 20px;">
<div style="max-width:520px;margin:0 auto;background:#fff;border:1px solid #ded6cf;padding:32px 40px;">
  <p style="font-size:10px;letter-spacing:0.14em;text-transform:lowercase;color:#918b84;margin:0 0 6px;">knitfix · ${repeat ? "terugkerende klant 🔁" : "nieuwe boeking"}</p>
  <h1 style="font-size:22px;font-weight:400;color:#20201f;margin:0 0 6px;font-family:monospace;">${meta.reference_code}</h1>
  <p style="font-size:12px;color:#b85c38;margin:0 0 24px;">€30 aanbetaling ontvangen</p>
  <table style="width:100%;font-size:13px;color:#20201f;margin-bottom:24px;border-collapse:collapse;">
    <tr><td style="padding:5px 0;color:#918b84;width:130px;">naam</td><td>${meta.customer_name}</td></tr>
    <tr><td style="padding:5px 0;color:#918b84;">email</td><td><a href="mailto:${meta.customer_email}" style="color:#b85c38;">${meta.customer_email}</a></td></tr>
    <tr><td style="padding:5px 0;color:#918b84;">telefoon</td><td>${meta.customer_phone || "niet opgegeven"}</td></tr>
    <tr><td style="padding:5px 0;color:#918b84;">retouradres</td><td>${meta.street} ${meta.house_number}, ${meta.postal_code} ${meta.city}</td></tr>
    <tr><td style="padding:5px 0;color:#918b84;">kledingstuk</td><td>${meta.garment_type}</td></tr>
    <tr><td style="padding:5px 0;color:#918b84;">materiaal</td><td>${meta.material}</td></tr>
    <tr><td style="padding:5px 0;color:#918b84;">schade</td><td>${meta.damage_type}</td></tr>
    ${meta.damage_description ? `<tr><td style="padding:5px 0;color:#918b84;">omschrijving</td><td>${meta.damage_description}</td></tr>` : ""}
    <tr><td style="padding:5px 0;color:#918b84;">reparatiestijl</td><td>${meta.repair_preference}</td></tr>
  </table>
  <p style="font-size:11px;color:#918b84;margin:0;">knitfix · kvk 42013270</p>
</div>
</body></html>`;
}

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
