const Stripe = require("stripe");
const { Resend } = require("resend");

function authCheck(req) {
  const cookie = req.headers.cookie || "";
  const match = cookie.match(/kf_session=([^;]+)/);
  return match && match[1] === process.env.DASHBOARD_PASSWORD;
}

const statusMessages = {
  "in behandeling": {
    subject: (ref) => `KnitFix · je reparatie is gestart (${ref})`,
    body: (name, ref) => `
      <p style="font-size:14px;color:#20201f;margin:0 0 16px;line-height:1.7;">Hoi ${name}, goed nieuws — je kledingstuk is aangekomen en we zijn begonnen met de reparatie.</p>
      <p style="font-size:13px;color:#918b84;margin:0;line-height:1.7;">Zodra alles klaar is sturen we een update. Heb je vragen? Stuur een WhatsApp naar <a href="https://wa.me/31616120895" style="color:#b85c38;text-decoration:none;">+31 6 16120895</a> met je referentiecode ${ref}.</p>
    `
  },
  "klaar": {
    subject: (ref) => `KnitFix · je reparatie is klaar (${ref})`,
    body: (name, ref) => `
      <p style="font-size:14px;color:#20201f;margin:0 0 16px;line-height:1.7;">Hoi ${name}, je reparatie is klaar! Je ontvangt binnenkort een factuur voor het restbedrag. Zodra betaald sturen we je kledingstuk terug.</p>
      <p style="font-size:13px;color:#918b84;margin:0;line-height:1.7;">Vragen? Stuur een WhatsApp naar <a href="https://wa.me/31616120895" style="color:#b85c38;text-decoration:none;">+31 6 16120895</a> met je referentiecode ${ref}.</p>
    `
  },
  "verzonden": {
    subject: (ref) => `KnitFix · je pakket is onderweg (${ref})`,
    body: (name, ref) => `
      <p style="font-size:14px;color:#20201f;margin:0 0 16px;line-height:1.7;">Hoi ${name}, je kledingstuk is verstuurd en is binnenkort bij je thuis. Bedankt voor je vertrouwen in KnitFix!</p>
      <p style="font-size:13px;color:#918b84;margin:0;line-height:1.7;">Referentie: ${ref} · Vragen? <a href="https://wa.me/31616120895" style="color:#b85c38;text-decoration:none;">+31 6 16120895</a></p>
    `
  }
};

function buildEmail(subject, bodyHtml) {
  return `<!DOCTYPE html>
<html><head><meta charset="UTF-8"/></head>
<body style="font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;background:#f4f2f0;margin:0;padding:40px 20px;">
<div style="max-width:520px;margin:0 auto;background:#fff;border:1px solid #ded6cf;">
  <div style="padding:36px 40px 24px;border-bottom:1px solid #ded6cf;">
    <p style="font-size:11px;letter-spacing:0.14em;text-transform:lowercase;color:#918b84;margin:0 0 6px;">knitfix · breiwerk reparatie atelier</p>
    <h1 style="font-size:18px;font-weight:400;color:#20201f;margin:0;text-transform:lowercase;letter-spacing:0.04em;">${subject.split('·')[1]?.trim() || 'update'}</h1>
  </div>
  <div style="padding:32px 40px;">
    ${bodyHtml}
  </div>
  <div style="padding:20px 40px;border-top:1px solid #ded6cf;">
    <p style="font-size:10px;color:#918b84;margin:0;line-height:1.8;">knitfix · amsterdam · <a href="https://knitfix.nl" style="color:#918b84;">knitfix.nl</a><br/>kvk 42013270 · eenmanszaak</p>
  </div>
</div>
</body></html>`;
}

module.exports = async function handler(req, res) {
  if (!authCheck(req)) return res.status(401).json({ error: "Unauthorized" });
  if (req.method !== "POST") return res.status(405).end();

  const { ref, status, customer_email, customer_name } = req.body || {};
  if (!ref || !status) return res.status(400).json({ error: "Missing ref or status" });

  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

  /* find the session and update PaymentIntent metadata */
  const sessions = await stripe.checkout.sessions.list({ limit: 100 });
  const session = sessions.data.find(s => s.metadata?.reference_code === ref);

  if (!session) return res.status(404).json({ error: "Order not found" });

  if (session.payment_intent) {
    await stripe.paymentIntents.update(
      typeof session.payment_intent === "string" ? session.payment_intent : session.payment_intent.id,
      { metadata: { kf_status: status } }
    );
  }

  /* send status email to customer if applicable */
  const template = statusMessages[status];
  const email = customer_email || session.metadata?.customer_email;
  const name = (customer_name || session.metadata?.customer_name || "").split(" ")[0];

  if (template && email) {
    try {
      const resend = new Resend(process.env.RESEND_API_KEY);
      const subject = template.subject(ref);
      await resend.emails.send({
        from:     "KnitFix <hello@knitfix.nl>",
        reply_to: "hello.knitfix@gmail.com",
        to:       email,
        subject,
        html:     buildEmail(subject, template.body(name, ref)),
      });
      console.log(`Status email sent to ${email} for status: ${status}`);
    } catch (err) {
      console.error("Status email failed:", err.message);
    }
  }

  return res.status(200).json({ ok: true });
};
