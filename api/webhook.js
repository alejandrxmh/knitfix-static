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

function sendcloudAuth() {
  const pub = process.env.SENDCLOUD_PUBLIC_KEY;
  const sec = process.env.SENDCLOUD_SECRET_KEY;
  return "Basic " + Buffer.from(`${pub}:${sec}`).toString("base64");
}

/* resolve shipping method ID by name (or fall back to env var / default) */
async function resolveShipmentId() {
  if (process.env.SENDCLOUD_SHIPMENT_ID) {
    return parseInt(process.env.SENDCLOUD_SHIPMENT_ID);
  }
  const targetName = process.env.SENDCLOUD_SHIPMENT_NAME || "PostNL Klein Pakket - 10 liter";
  try {
    const res = await fetch(
      "https://panel.sendcloud.sc/api/v2/shipping_methods?from_country=NL&to_country=NL",
      { headers: { Authorization: sendcloudAuth() } }
    );
    const data = await res.json();
    const match = data.shipping_methods?.find(m =>
      m.name.toLowerCase().includes(targetName.toLowerCase())
    );
    if (match) {
      console.log(`Resolved shipment ID ${match.id} for "${match.name}"`);
      return match.id;
    }
  } catch (err) {
    console.error("Failed to resolve shipment ID:", err.message);
  }
  console.warn("Falling back to shipment ID 8");
  return 8;
}

/* inbound: customer → knitfix (label goes to customer so they can ship to us) */
async function createInboundParcel(meta) {
  const shipmentId = await resolveShipmentId();
  const body = {
    parcel: {
      name:          meta.customer_name,
      address:       meta.street,
      house_number:  meta.house_number,
      city:          meta.city,
      postal_code:   meta.postal_code,
      country:       "NL",
      email:         meta.customer_email,
      telephone:     meta.customer_phone || "",
      order_number:  meta.reference_code + "-IN",
      weight:        "1.000",
      shipment:      { id: shipmentId },
      request_label: true,
      /* ship TO knitfix studio */
      to_name:         "KnitFix",
      to_address:      process.env.KNITFIX_STREET || "",
      to_house_number: process.env.KNITFIX_HOUSE_NUMBER || "",
      to_city:         process.env.KNITFIX_CITY || "Amsterdam",
      to_postal_code:  process.env.KNITFIX_POSTAL || "",
      to_country:      "NL",
    },
  };

  const res = await fetch("https://panel.sendcloud.sc/api/v2/parcels", {
    method: "POST",
    headers: { Authorization: sendcloudAuth(), "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`SendCloud inbound error ${res.status}: ${txt}`);
  }

  const data = await res.json();
  const parcel = data.parcel;
  return { id: parcel?.id };
}

/* outbound: knitfix → customer (Alejandro prints this when repair is done) */
async function createOutboundParcel(meta) {
  const shipmentId = await resolveShipmentId();
  const body = {
    parcel: {
      name:          meta.customer_name,
      address:       meta.street,
      house_number:  meta.house_number,
      city:          meta.city,
      postal_code:   meta.postal_code,
      country:       "NL",
      email:         meta.customer_email,
      telephone:     meta.customer_phone || "",
      order_number:  meta.reference_code + "-OUT",
      weight:        "1.000",
      shipment:      { id: shipmentId },
      request_label: true,
    },
  };

  const res = await fetch("https://panel.sendcloud.sc/api/v2/parcels", {
    method: "POST",
    headers: { Authorization: sendcloudAuth(), "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`SendCloud outbound error ${res.status}: ${txt}`);
  }

  const data = await res.json();
  return data.parcel?.id || null;
}

/* ── email templates ── */
function customerEmail(meta, address, labelUrl) {
  const firstName = meta.customer_name.split(" ")[0];
  const labelBlock = labelUrl
    ? `<div style="background:#f4f2f0;padding:20px 24px;margin-bottom:28px;border-left:2px solid #b85c38;">
        <p style="font-size:10px;letter-spacing:0.14em;text-transform:lowercase;color:#b85c38;margin:0 0 8px;">jouw verzendetiket</p>
        <p style="font-size:12px;color:#20201f;margin:0 0 12px;line-height:1.6;">Print dit etiket, plak het op je pakket en lever het in bij een PostNL punt.</p>
        <a href="${labelUrl}" style="display:inline-block;background:#b85c38;color:#f4f2f0;padding:10px 20px;font-size:12px;text-decoration:none;letter-spacing:0.06em;text-transform:lowercase;">download verzendetiket</a>
      </div>`
    : `<div style="background:#f4f2f0;padding:20px 24px;margin-bottom:28px;">
        <p style="font-size:12px;color:#918b84;margin:0;line-height:1.6;">Je ontvangt je verzendetiket apart via e-mail. Je kunt ook zelf opsturen via PostNL, DHL of een andere aanbieder en de kosten declareren.</p>
      </div>`;

  return `<!DOCTYPE html>
<html><head><meta charset="UTF-8"/></head>
<body style="font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;background:#f4f2f0;margin:0;padding:40px 20px;">
<div style="max-width:520px;margin:0 auto;background:#fff;border:1px solid #ded6cf;">
  <div style="padding:36px 40px 24px;border-bottom:1px solid #ded6cf;">
    <p style="font-size:11px;letter-spacing:0.14em;text-transform:lowercase;color:#918b84;margin:0 0 6px;">knitfix · breiwerk reparatie atelier</p>
    <h1 style="font-size:20px;font-weight:400;color:#20201f;margin:0;text-transform:lowercase;letter-spacing:0.04em;">boeking bevestigd.</h1>
  </div>
  <div style="padding:32px 40px;">
    <p style="font-size:14px;color:#20201f;margin:0 0 24px;line-height:1.7;">Hoi ${firstName}, je boeking is ontvangen en de aanbetaling is verwerkt.</p>
    <div style="background:#f4f2f0;padding:20px 24px;margin-bottom:28px;">
      <p style="font-size:10px;letter-spacing:0.14em;text-transform:lowercase;color:#b85c38;margin:0 0 10px;">jouw referentiecode</p>
      <p style="font-size:26px;letter-spacing:0.14em;color:#20201f;margin:0;font-family:monospace;font-weight:600;">${meta.reference_code}</p>
      <p style="font-size:11px;color:#918b84;margin:8px 0 0;line-height:1.6;">Schrijf deze code op een briefje en doe het bij je pakket.</p>
    </div>
    ${labelBlock}
    <p style="font-size:10px;letter-spacing:0.12em;text-transform:lowercase;color:#b85c38;margin:0 0 8px;">sturen naar</p>
    <p style="font-size:14px;color:#20201f;margin:0 0 28px;line-height:1.7;">${address}<br/><span style="color:#918b84;font-size:12px;">Nederland</span></p>
    <p style="font-size:10px;letter-spacing:0.12em;text-transform:lowercase;color:#b85c38;margin:0 0 8px;">wat je hebt geboekt</p>
    <table style="width:100%;font-size:13px;color:#20201f;margin-bottom:28px;border-collapse:collapse;">
      <tr><td style="padding:5px 0;color:#918b84;width:130px;vertical-align:top;">kledingstuk</td><td>${meta.garment_type}</td></tr>
      <tr><td style="padding:5px 0;color:#918b84;vertical-align:top;">materiaal</td><td>${meta.material}</td></tr>
      <tr><td style="padding:5px 0;color:#918b84;vertical-align:top;">schade</td><td>${meta.damage_type}</td></tr>
      ${meta.damage_description ? `<tr><td style="padding:5px 0;color:#918b84;vertical-align:top;">omschrijving</td><td>${meta.damage_description}</td></tr>` : ""}
      <tr><td style="padding:5px 0;color:#918b84;vertical-align:top;">reparatiestijl</td><td>${meta.repair_preference}</td></tr>
      <tr><td style="padding:5px 0;color:#918b84;vertical-align:top;">aanbetaling</td><td>€30 (incl. retourverzending)</td></tr>
    </table>
    <div style="border-left:2px solid #b85c38;padding-left:16px;margin-bottom:28px;">
      <p style="font-size:13px;color:#20201f;margin:0 0 8px;font-weight:500;">verpakkingstips</p>
      <p style="font-size:12px;color:#918b84;margin:0;line-height:1.75;">Verpak het kledingstuk in een plastic zakje tegen vocht, daarna in een doos of stevige envelop. Voeg een briefje toe met je referentiecode.</p>
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

function adminEmail(meta, inboundId, outboundId) {
  const inLink  = inboundId  ? `<a href="https://app.sendcloud.com/v2/shipping/parcel/${inboundId}"  style="color:#b85c38;">inbound label (klant → knitfix)</a>` : "aanmaken mislukt";
  const outLink = outboundId ? `<a href="https://app.sendcloud.com/v2/shipping/parcel/${outboundId}" style="color:#b85c38;">outbound label (knitfix → klant)</a>` : "aanmaken mislukt";

  return `<!DOCTYPE html>
<html><head><meta charset="UTF-8"/></head>
<body style="font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;background:#f4f2f0;margin:0;padding:40px 20px;">
<div style="max-width:520px;margin:0 auto;background:#fff;border:1px solid #ded6cf;padding:32px 40px;">
  <p style="font-size:10px;letter-spacing:0.14em;text-transform:lowercase;color:#918b84;margin:0 0 6px;">knitfix · nieuwe boeking</p>
  <h1 style="font-size:22px;font-weight:400;color:#20201f;margin:0 0 6px;font-family:monospace;">${meta.reference_code}</h1>
  <p style="font-size:12px;color:#b85c38;margin:0 0 24px;">€30 aanbetaling ontvangen</p>
  <table style="width:100%;font-size:13px;color:#20201f;margin-bottom:24px;border-collapse:collapse;">
    <tr><td style="padding:5px 0;color:#918b84;width:130px;vertical-align:top;">naam</td><td>${meta.customer_name}</td></tr>
    <tr><td style="padding:5px 0;color:#918b84;vertical-align:top;">email</td><td><a href="mailto:${meta.customer_email}" style="color:#b85c38;">${meta.customer_email}</a></td></tr>
    <tr><td style="padding:5px 0;color:#918b84;vertical-align:top;">telefoon</td><td>${meta.customer_phone || "niet opgegeven"}</td></tr>
    <tr><td style="padding:5px 0;color:#918b84;vertical-align:top;">retouradres</td><td>${meta.street} ${meta.house_number}, ${meta.postal_code} ${meta.city}</td></tr>
    <tr><td style="padding:5px 0;color:#918b84;vertical-align:top;">kledingstuk</td><td>${meta.garment_type}</td></tr>
    <tr><td style="padding:5px 0;color:#918b84;vertical-align:top;">materiaal</td><td>${meta.material}</td></tr>
    <tr><td style="padding:5px 0;color:#918b84;vertical-align:top;">schade</td><td>${meta.damage_type}</td></tr>
    ${meta.damage_description ? `<tr><td style="padding:5px 0;color:#918b84;vertical-align:top;">omschrijving</td><td>${meta.damage_description}</td></tr>` : ""}
    <tr><td style="padding:5px 0;color:#918b84;vertical-align:top;">reparatiestijl</td><td>${meta.repair_preference}</td></tr>
  </table>
  <div style="background:#f4f2f0;padding:16px 20px;margin-bottom:8px;">
    <p style="font-size:10px;letter-spacing:0.1em;text-transform:lowercase;color:#918b84;margin:0 0 10px;">sendcloud labels</p>
    <p style="font-size:13px;margin:0 0 6px;">${inLink}</p>
    <p style="font-size:11px;color:#918b84;margin:0 0 14px;">klant heeft dit label al ontvangen per email. print voor je eigen administratie.</p>
    <p style="font-size:13px;margin:0 0 6px;">${outLink}</p>
    <p style="font-size:11px;color:#918b84;margin:0;">print dit label wanneer de reparatie klaar is en stuur het pakket terug.</p>
  </div>
  <p style="font-size:11px;color:#918b84;margin:16px 0 0;">knitfix · kvk 42013270</p>
</div>
</body></html>`;
}

/* ── main handler ── */
module.exports = async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).send("Method not allowed");

  const rawBody = await getRawBody(req);
  const sig     = req.headers["stripe-signature"];
  const stripe  = new Stripe(process.env.STRIPE_SECRET_KEY);

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
  const meta    = session.metadata;
  const resend  = new Resend(process.env.RESEND_API_KEY);

  /* create both labels */
  let inboundId  = null;
  let inboundLabelUrl = null;
  let outboundId = null;

  try {
    const inbound = await createInboundParcel(meta);
    inboundId      = inbound.id;
    inboundLabelUrl = inboundId
      ? `${process.env.BASE_URL}/api/label?id=${inboundId}`
      : null;
    console.log("SendCloud inbound created:", inboundId);
  } catch (err) {
    console.error("SendCloud inbound failed:", err.message);
  }

  try {
    outboundId = await createOutboundParcel(meta);
    console.log("SendCloud outbound created:", outboundId);
  } catch (err) {
    console.error("SendCloud outbound failed:", err.message);
  }

  const knitfixAddress = [
    process.env.KNITFIX_STREET,
    process.env.KNITFIX_HOUSE_NUMBER,
    process.env.KNITFIX_POSTAL,
    process.env.KNITFIX_CITY || "Amsterdam",
  ].filter(Boolean).join(" ");

  /* email to customer */
  try {
    await resend.emails.send({
      from:     "KnitFix <hello@knitfix.nl>",
      reply_to: "hello.knitfix@gmail.com",
      to:       meta.customer_email,
      subject:  `KnitFix · boeking bevestigd (${meta.reference_code})`,
      html:     customerEmail(meta, knitfixAddress, inboundLabelUrl),
    });
  } catch (err) {
    console.error("Customer email failed:", err.message);
  }

  /* email to Alejandro */
  try {
    await resend.emails.send({
      from:     "KnitFix Boekingen <hello@knitfix.nl>",
      reply_to: "hello.knitfix@gmail.com",
      to:       process.env.KNITFIX_NOTIFY_EMAIL || "hello.knitfix@gmail.com",
      subject:  `Nieuwe boeking: ${meta.reference_code} · ${meta.garment_type}`,
      html:     adminEmail(meta, inboundId, outboundId),
    });
  } catch (err) {
    console.error("Admin email failed:", err.message);
  }

  return res.status(200).json({ received: true });
};
