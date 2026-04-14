/* /api/label?id=PARCEL_ID
   Proxies the Sendcloud label PDF with server-side auth so the customer
   can download it directly without needing Sendcloud credentials. */

function sendcloudAuth() {
  const pub = process.env.SENDCLOUD_PUBLIC_KEY;
  const sec = process.env.SENDCLOUD_SECRET_KEY;
  return "Basic " + Buffer.from(`${pub}:${sec}`).toString("base64");
}

module.exports = async function handler(req, res) {
  const { id } = req.query;

  if (!id || !/^\d+$/.test(id)) {
    return res.status(400).json({ error: "Ongeldige parcel ID." });
  }

  const url = `https://panel.sendcloud.sc/api/v2/labels/normal_printer/${id}?start_from=0`;

  let upstream;
  try {
    upstream = await fetch(url, {
      headers: { Authorization: sendcloudAuth() },
    });
  } catch (err) {
    console.error("Sendcloud label fetch error:", err.message);
    return res.status(502).json({ error: "Label kon niet worden opgehaald." });
  }

  if (!upstream.ok) {
    console.error("Sendcloud label non-ok:", upstream.status);
    return res.status(upstream.status).json({ error: "Label niet beschikbaar." });
  }

  const contentType = upstream.headers.get("content-type") || "application/pdf";
  res.setHeader("Content-Type", contentType);
  res.setHeader("Content-Disposition", `attachment; filename="verzendetiket-${id}.pdf"`);
  res.setHeader("Cache-Control", "private, max-age=3600");

  const buffer = await upstream.arrayBuffer();
  return res.send(Buffer.from(buffer));
};
