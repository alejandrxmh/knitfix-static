/* Long-lived payment links.
   Stripe Checkout Sessions expire after 24h max, so emails no longer contain
   session.url directly. Instead they link to /api/pay?ref=...&t=..., which
   creates a fresh Checkout Session on click (see api/pay.js).

   The `t` token is an HMAC of the ref so nobody can guess refs and open
   checkout pages for other people's orders. Key: PAY_LINK_SECRET if set,
   otherwise derived from STRIPE_SECRET_KEY (no extra env var needed, but
   rotating the Stripe key will invalidate links already sent). */

const crypto = require("crypto");

function key() {
  if (process.env.PAY_LINK_SECRET) return process.env.PAY_LINK_SECRET;
  const sk = process.env.STRIPE_SECRET_KEY;
  if (!sk) throw new Error("STRIPE_SECRET_KEY not set");
  return crypto.createHash("sha256").update("knitfix-pay-link:" + sk).digest();
}

function payToken(ref) {
  return crypto.createHmac("sha256", key()).update(String(ref)).digest("base64url").slice(0, 24);
}

function verifyPayToken(ref, token) {
  if (!ref || !token) return false;
  const a = Buffer.from(payToken(ref));
  const b = Buffer.from(String(token));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function payLinkUrl(baseUrl, ref) {
  return `${baseUrl}/api/pay?ref=${encodeURIComponent(ref)}&t=${payToken(ref)}`;
}

module.exports = { payToken, verifyPayToken, payLinkUrl };
