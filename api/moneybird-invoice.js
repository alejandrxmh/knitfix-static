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

  /* find or create contact */
  let contactId = null;
  try {
    const searchRes = await fetch(
      `${base}/contacts?query=${encodeURIComponent(meta.customer_email)}`,
      { headers }
    );
    const contacts = await searchRes.json();
    if (contacts.length > 0) {
      contactId = contacts[0].id;
    } else {
      const createRes = await fetch(`${base}/contacts`, {
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
      const newContact = await createRes.json();
      contactId = newContact.id;
    }
  } catch (err) {
    console.error("Moneybird contact error:", err.message);
    return null;
  }

  /* create draft invoice */
  try {
    const invoiceRes = await fetch(`${base}/sales_invoices`, {
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
    const invoice = await invoiceRes.json();
    console.log("Moneybird invoice created:", invoice.invoice_id);
    return invoice.id;
  } catch (err) {
    console.error("Moneybird invoice error:", err.message);
    return null;
  }
};
