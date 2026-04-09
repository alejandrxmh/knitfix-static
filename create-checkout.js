const Stripe = require("stripe");

/* ── collect raw body from stream ── */
async function parseBody(req) {
  if (req.body && typeof req.body === "object" && !Buffer.isBuffer(req.body)) {
    return req.body; // already parsed by some runtimes
  }
  return new Promise((resolve, reject) => {
    let data = "";
    req.on("data", (chunk) => (data += chunk.toString()));
    req.on("end", () => {
      try { resolve(JSON.parse(data || "{}")); }
      catch (e) { reject(new Error("Invalid JSON body")); }
    });
    req.on("error", reject);
  });
}

/* ── reference code: KF-YYMM-XXXX ── */
function generateRef() {
  const now = new Date();
  const yymm =
    String(now.getFullYear()).slice(2) +
    String(now.getMonth() + 1).padStart(2, "0");
  const rand = Math.random().toString(36).substring(2, 6).toUpperCase();
  return `KF-${yymm}-${rand}`;
}

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  let body;
  try { body = await parseBody(req); }
  catch { return res.status(400).json({ error: "Invalid request body" }); }

  const {
    name, email, phone,
    garment_type, material, damage_type, damage_description, repair_preference,
    street, house_number, postal_code, city,
  } = body;

  /* ── validation ── */
  const required = { name, email, garment_type, material, damage_type, repair_preference, street, house_number, postal_code, city };
  for (const [key, val] of Object.entries(required)) {
    if (!val || !String(val).trim()) {
      return res.status(400).json({ error: `Veld verplicht: ${key}` });
    }
  }

  const referenceCode = generateRef();
  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

  try {
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ["card", "ideal"],
      line_items: [
        {
          price_data: {
            currency: "eur",
            product_data: {
              name: "KnitFix — Reparatie Aanbetaling",
              description: `${garment_type} (${material}) · retourverzending inbegrepen`,
            },
            unit_amount: 3000, // €30.00
          },
          quantity: 1,
        },
      ],
      mode: "payment",
      customer_email: email,
      locale: "nl",
      metadata: {
        reference_code:     referenceCode,
        customer_name:      name,
        customer_email:     email,
        customer_phone:     phone || "",
        garment_type:       garment_type,
        material:           material,
        damage_type:        damage_type,
        damage_description: String(damage_description || "").substring(0, 490),
        repair_preference:  repair_preference,
        street:             street,
        house_number:       house_number,
        postal_code:        postal_code,
        city:               city,
      },
      success_url: `${process.env.BASE_URL}/success.html?ref=${referenceCode}`,
      cancel_url:  `${process.env.BASE_URL}/#book`,
    });

    return res.status(200).json({ url: session.url });
  } catch (err) {
    console.error("Stripe error:", err.message);
    return res.status(500).json({ error: "Betaling kon niet worden aangemaakt. Probeer opnieuw." });
  }
};
