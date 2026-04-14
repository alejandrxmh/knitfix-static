/* Sends a Google review request email to a customer.
   Call this manually or hook it to a cron job / status update trigger. */
const { Resend } = require("resend");

const GOOGLE_REVIEW_URL = process.env.GOOGLE_REVIEW_URL || "https://g.page/r/knitfix/review";

function reviewEmailHtml(name, ref) {
  return `<!DOCTYPE html>
<html><head><meta charset="UTF-8"/></head>
<body style="font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;background:#f4f2f0;margin:0;padding:40px 20px;">
<div style="max-width:520px;margin:0 auto;background:#fff;border:1px solid #ded6cf;">
  <div style="padding:36px 40px 24px;border-bottom:1px solid #ded6cf;">
    <p style="font-size:11px;letter-spacing:0.14em;text-transform:lowercase;color:#918b84;margin:0 0 6px;">knitfix · breiwerk reparatie atelier</p>
    <h1 style="font-size:18px;font-weight:400;color:#20201f;margin:0;text-transform:lowercase;letter-spacing:0.04em;">hoe was je ervaring?</h1>
  </div>
  <div style="padding:32px 40px;">
    <p style="font-size:14px;color:#20201f;margin:0 0 20px;line-height:1.7;">Hoi ${name}, hopelijk is je kledingstuk goed aangekomen en ben je blij met het resultaat.</p>
    <p style="font-size:13px;color:#918b84;margin:0 0 28px;line-height:1.7;">Als je een momentje hebt, zou een recensie ons enorm helpen. Het duurt minder dan een minuut.</p>
    <a href="${GOOGLE_REVIEW_URL}" style="display:inline-block;background:#b85c38;color:#f4f2f0;padding:12px 28px;font-size:12px;text-decoration:none;letter-spacing:0.08em;text-transform:lowercase;">schrijf een recensie →</a>
    <p style="font-size:11px;color:#918b84;margin:24px 0 0;line-height:1.7;">Referentie: ${ref} · <a href="https://knitfix.nl" style="color:#918b84;">knitfix.nl</a></p>
  </div>
  <div style="padding:20px 40px;border-top:1px solid #ded6cf;">
    <p style="font-size:10px;color:#918b84;margin:0;line-height:1.8;">knitfix · amsterdam · kvk 42013270 · eenmanszaak</p>
  </div>
</div>
</body></html>`;
}

module.exports = async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end();

  /* simple auth check */
  const cookie = req.headers.cookie || "";
  const match = cookie.match(/kf_session=([^;]+)/);
  if (!match || match[1] !== process.env.DASHBOARD_PASSWORD) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const { email, name, ref } = req.body || {};
  if (!email || !name || !ref) return res.status(400).json({ error: "Missing fields" });

  const resend = new Resend(process.env.RESEND_API_KEY);
  await resend.emails.send({
    from:     "KnitFix <hello@knitfix.nl>",
    reply_to: "hello.knitfix@gmail.com",
    to:       email,
    subject:  "Hoe was je KnitFix ervaring?",
    html:     reviewEmailHtml(name.split(" ")[0], ref),
  });

  return res.status(200).json({ ok: true });
};
