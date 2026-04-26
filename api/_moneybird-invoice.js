/* Creates a draft Moneybird sales invoice for a KnitFix deposit booking.
   Called from the webhook after payment succeeds. */

module.exports = async function createMoneybirdInvoice(meta) {
  const adminId  = process.env.MONEYBIRD_ADMIN_ID;
  const token    = process.env.MONEYBIRD_TOKEN;

  if (!adminId || !token) {
    console.log("Moneybird not configured — skipping invoice creation");
    return null;
  }

  const base = `https://moneybird.com/api/v2/${adminId}`;
  const headers = {
    "Authorization": `Bearer ${token}`,
    "Content-Type":  "application/json",
  };

  /* find or create contact
   *
   * Moneybird's /contacts/filter endpoint accepts a `query` param for free-text
   * search across name/email/etc. We search by email since that's our unique
   * identifier. Note: the search is case-insensitive and fuzzy, so we still
   * filter results by exact email match before using one.
   */
  let contactId = null;
  try {
    const searchRes = await fetch(
      `${base}/contacts/filter?query=${encodeURIComponent(meta.customer_email)}`,
      { headers }
    );
    if (!searchRes.ok) {
      console.error("Moneybird contact search non-ok:", searchRes.status);
      // Fall through to creation — better to attempt creating a duplicate
      // than to fail silently. Moneybird will return an error if it conflicts.
    } else {
      const contacts = await searchRes.json();
      if (Array.isArray(contacts) && contacts.length > 0) {
        const target = meta.customer_email.toLowerCase();
        const exact = contacts.find(c => (c.email || "").toLowerCase() === target);
        if (exact) contactId = exact.id;
      }
    }

    if (!contactId) {
      const createRes = await fetch(`${base}/contacts.json`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          contact: {
            firstname:    meta.customer_name.split(" ")[0],
            lastname:     meta.customer_name.split(" ").slice(1).join(" "),
            email:        meta.customer_email,
            phone:        meta.customer_phone || "",
            address1:     `${meta.street} ${meta.house_number}`,
            zipcode:      meta.postal_code,
            city:         meta.city,
            country:      "NL",
          }
        }),
      });
      if (!createRes.ok) {
        const errText = await createRes.text();
        console.error("Moneybird contact create non-ok:", createRes.status, errText);
        return null;
      }
      const newContact = await createRes.json();
      contactId = newContact.id;
    }
  } catch (err) {
    console.error("Moneybird contact error:", err.message);
    return null;
  }

  /* create draft invoice */
  try {
    const invoiceRes = await fetch(`${base}/sales_invoices.json`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        sales_invoice: {
          contact_id:       contactId,
          reference:        meta.reference_code,
          invoice_date:     new Date().toISOString().split("T")[0],
          currency:         "EUR",
          prices_are_incl_tax: true,
          details_attributes: [
            {
              description: meta._override_description || `KnitFix reparatie aanbetaling — ${meta.garment_type} (${meta.material})\nReferentie: ${meta.reference_code}`,
              price:        meta._override_price || "30.00",
              amount:       "1",
              tax_rate_id:  process.env.MONEYBIRD_TAX_RATE_ID || null,
              ledger_account_id: process.env.MONEYBIRD_LEDGER_ID || null,
            }
          ]
        }
      }),
    });

    if (!invoiceRes.ok) {
      const errText = await invoiceRes.text();
      console.error("Moneybird invoice non-ok:", invoiceRes.status, errText);
      return null;
    }

    const invoice = await invoiceRes.json();
    console.log("Moneybird invoice created:", invoice.id || invoice.invoice_id);
    return invoice.id;
  } catch (err) {
    console.error("Moneybird invoice error:", err.message);
    return null;
  }
};
