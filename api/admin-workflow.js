/**
 * admin-workflow — edit any workflow-state field on an order.
 *
 * Replaces the old admin-status.js. No longer sends any customer emails —
 * this endpoint is purely a "fix what's wrong in the database" tool. The
 * proper customer-facing flows live elsewhere:
 *   - admin-final-invoice.js  -> sends the quote email + creates Stripe link
 *   - admin-send-label.js     -> sends inbound label / outbound shipping
 *                                emails with PDF + tracking
 *   - review-email.js         -> sends the review request email
 *
 * POST /api/admin-workflow
 * Body fields (all optional; only provided fields are updated):
 *   ref                         string   (REQUIRED — order reference code)
 *   status                      string   ('ontvangen'|'in behandeling'|'klaar'|'verzonden')
 *   ready_by                    string   (YYYY-MM-DD, or '' to clear)
 *   inbound_tracking            string   ('' to clear)
 *   inbound_label_sent_at       number   (ms timestamp, or null/0 to clear)
 *   outbound_tracking           string   ('' to clear)
 *   shipped_at                  number   (ms timestamp, or null/0 to clear)
 *   final_invoice_sent_at       number   (ms timestamp, or null/0 to clear)
 *   final_total                 number   (total price in €)
 *   review_sent                 boolean  (sets kf_review_sent + kf_review_sent_at)
 *   review_sent_at              number   (ms timestamp, or null/0 to clear)
 *
 * Stripe metadata supports empty-string deletion: setting a metadata key to
 * "" removes it. We use that to clear fields rather than keeping stale values.
 */

const Stripe = require("stripe");
const { findSessionByRef } = require("./_stripe-helpers");
const { authCheck } = require("./_auth");

/** Helpers to coerce incoming values into the string format Stripe metadata expects. */
function tsString(v) {
  if (v === null || v === undefined || v === "" || v === 0) return "";
  const n = typeof v === "number" ? v : parseInt(v, 10);
  if (!Number.isFinite(n) || n <= 0) return "";
  return String(n);
}

function strOrEmpty(v) {
  if (v === null || v === undefined) return undefined; // undefined = don't touch this field
  return String(v).trim();
}

module.exports = async function handler(req, res) {
  if (!authCheck(req)) return res.status(401).json({ error: "Unauthorized" });
  if (req.method !== "POST") return res.status(405).end();

  const b = req.body || {};
  const { ref } = b;
  if (!ref) return res.status(400).json({ error: "Missing ref" });

  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
  const session = await findSessionByRef(stripe, ref);
  if (!session) return res.status(404).json({ error: "Order not found" });

  const piId = typeof session.payment_intent === "string"
    ? session.payment_intent
    : session.payment_intent?.id;
  if (!piId) return res.status(400).json({ error: "No payment intent on session" });

  // Build the metadata update object. Only include keys for fields the caller
  // explicitly provided — undefined means "don't touch". Empty string means
  // "clear this field" (Stripe treats empty-string metadata values as deletions).
  const meta = {};

  // 1. Status
  if (b.status !== undefined) {
    const s = strOrEmpty(b.status);
    const valid = ["ontvangen", "in behandeling", "klaar", "verzonden"];
    if (s && !valid.includes(s)) {
      return res.status(400).json({ error: `Invalid status: ${s}` });
    }
    meta.kf_status = s;
  }

  // 2. Ready-by date
  if (b.ready_by !== undefined) {
    const r = strOrEmpty(b.ready_by);
    // Accept empty string (clear) or ISO YYYY-MM-DD
    if (r && !/^\d{4}-\d{2}-\d{2}$/.test(r)) {
      return res.status(400).json({ error: "ready_by must be YYYY-MM-DD" });
    }
    meta.kf_ready_by = r;
  }

  // 3. Inbound tracking
  if (b.inbound_tracking !== undefined) {
    meta.kf_inbound_tracking = strOrEmpty(b.inbound_tracking).toUpperCase();
  }

  // 4. Inbound label sent timestamp
  if (b.inbound_label_sent_at !== undefined) {
    meta.kf_inbound_label_sent = tsString(b.inbound_label_sent_at);
  }

  // 5. Final quote sent flag + timestamp (paired)
  if (b.final_invoice_sent_at !== undefined) {
    meta.kf_final_invoice_sent = tsString(b.final_invoice_sent_at);
  }

  // 6. Final total price (stored as string for consistency with existing writes)
  if (b.final_total !== undefined) {
    const t = b.final_total;
    if (t === "" || t === null) {
      meta.kf_final_total = "";
    } else {
      const n = typeof t === "number" ? t : parseFloat(t);
      if (!Number.isFinite(n) || n < 0) {
        return res.status(400).json({ error: "final_total must be a non-negative number" });
      }
      meta.kf_final_total = String(n);
    }
  }

  // 7. Outbound tracking
  if (b.outbound_tracking !== undefined) {
    meta.kf_outbound_tracking = strOrEmpty(b.outbound_tracking).toUpperCase();
  }

  // 8. Shipped timestamp
  if (b.shipped_at !== undefined) {
    meta.kf_shipped_at = tsString(b.shipped_at);
  }

  // 9. Review sent flag + timestamp (paired, kept consistent)
  if (b.review_sent !== undefined) {
    meta.kf_review_sent = b.review_sent ? "true" : "";
  }
  if (b.review_sent_at !== undefined) {
    meta.kf_review_sent_at = tsString(b.review_sent_at);
  }
  // Convenience: if flipping review_sent=true without an explicit timestamp,
  // auto-set timestamp to now so the stepper shows a date
  if (b.review_sent === true && b.review_sent_at === undefined) {
    meta.kf_review_sent_at = String(Date.now());
  }
  // Inverse: if flipping review_sent=false, clear the timestamp
  if (b.review_sent === false && b.review_sent_at === undefined) {
    meta.kf_review_sent_at = "";
  }

  // Only hit Stripe if we actually have something to change
  if (Object.keys(meta).length === 0) {
    return res.status(200).json({ ok: true, unchanged: true });
  }

  try {
    await stripe.paymentIntents.update(piId, { metadata: meta });
  } catch (err) {
    console.error("admin-workflow update failed:", err.message);
    return res.status(500).json({ error: "Stripe update failed" });
  }

  return res.status(200).json({ ok: true, updated: Object.keys(meta) });
};
