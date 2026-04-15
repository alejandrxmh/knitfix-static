import Stripe from "stripe";
import { Resend } from "resend";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
const resend = new Resend(process.env.RESEND_API_KEY);

// ─── Email helpers ────────────────────────────────────────────────────────────

const LOGO_URL  = "https://knitfix.nl/knitfix_logo.jpg";
const BASE_FONT = "'Jost', Helvetica, Arial, sans-serif";

const sharedHead = `
  <link href="https://fonts.googleapis.com/css2?family=Jost:wght@300;400;500;600&display=swap" rel="stylesheet">
  <style>@import url('https://fonts.googleapis.com/css2?family=Jost:wght@300;400;500;600&display=swap');</style>
`;

function row(label, value) {
  return `
    <tr>
      <td style="padding:8px 0;width:40%;vertical-align:top;border-bottom:1px solid #f5f0ea;">
        <span style="font-family:${BASE_FONT};font-size:11px;font-weight:500;letter-spacing:0.1em;text-transform:uppercase;color:#c8b4a5;">${label}</span>
      </td>
      <td style="padding:8px 0;vertical-align:top;border-bottom:1px solid #f5f0ea;">
        <span style="font-family:${BASE_FONT};font-size:13px;font-weight:400;color:#1f1811;">${value}</span>
      </td>
    </tr>`;
}

function emailShell(bodyContent) {
  return `<!DOCTYPE html>
<html lang="nl">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  ${sharedHead}
</head>
<body style="margin:0;padding:0;background-color:#f7f2ed;font-family:${BASE_FONT};">
  <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#f7f2ed;padding:48px 16px 56px;">
    <tr>
      <td align="center">
        <table width="540" cellpadding="0" cellspacing="0" border="0" style="max-width:540px;width:100%;">

          <tr>
            <td style="padding-bottom:28px;text-align:center;">
              <img src="${LOGO_URL}" width="64" height="64" alt="KnitFix"
                style="display:block;margin:0 auto;border-radius:14px;">
            </td>
          </tr>

          <tr>
            <td style="background-color:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 2px 16px rgba(40,20,10,0.08);">
              ${bodyContent}
            </td>
          </tr>

          <tr>
            <td style="padding:24px 8px 0;text-align:center;">
              <p style="margin:0;font-family:${BASE_FONT};font-size:11px;color:#c8b4a5;letter-spacing:0.04em;line-height:1.8;">
                knitfix &nbsp;·&nbsp; amsterdam &nbsp;·&nbsp;
                <a href="https://knitfix.nl" style="color:#c8b4a5;text-decoration:none;">knitfix.nl</a><br>
                kvk 42013270 &nbsp;·&nbsp; btw NL005433323B97 &nbsp;·&nbsp; eenmanszaak
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

// ─── Customer booking confirmation email ──────────────────────────────────────

function buildCustomerEmail({ referenceCode, naam, email, telefoon, retouradres, kledingstuk, materiaal, schade, reparatiestijl, terugkerendeKlant }) {
  const body = `
    <!-- header -->
    <table width="100%" cellpadding="0" cellspacing="0" border="0">
      <tr>
        <td style="padding:36px 40px 28px;border-bottom:1px solid #f0ebe4;">
          <p style="margin:0 0 12px;font-family:${BASE_FONT};font-size:11px;font-weight:500;letter-spacing:0.14em;text-transform:uppercase;color:#c8714a;">boeking ontvangen</p>
          <h1 style="margin:0 0 8px;font-family:${BASE_FONT};font-size:30px;font-weight:300;letter-spacing:0.02em;color:#1f1811;line-height:1.15;">${referenceCode}</h1>
          <p style="margin:0;font-family:${BASE_FONT};font-size:13px;color:#b0998a;">${terugkerendeKlant ? "terugkerende klant &nbsp;·&nbsp; " : ""}€30 aanbetaling ontvangen</p>
        </td>
      </tr>
    </table>

    <!-- contact -->
    <table width="100%" cellpadding="0" cellspacing="0" border="0">
      <tr><td style="padding:24px 40px 0;">
        <p style="margin:0 0 16px;font-family:${BASE_FONT};font-size:10px;font-weight:600;letter-spacing:0.16em;text-transform:uppercase;color:#c8b4a5;">contactgegevens</p>
      </td></tr>
      <tr><td style="padding:0 40px 24px;">
        <table width="100%" cellpadding="0" cellspacing="0" border="0">
          ${row("naam", naam)}
          ${row("email", `<a href="mailto:${email}" style="color:#b85c38;text-decoration:none;">${email}</a>`)}
          ${row("telefoon", telefoon)}
          ${row("retouradres", retouradres)}
        </table>
      </td></tr>
    </table>

    <!-- repair details -->
    <table width="100%" cellpadding="0" cellspacing="0" border="0">
      <tr><td style="padding:0 40px;border-top:1px solid #f0ebe4;">
        <p style="margin:24px 0 16px;font-family:${BASE_FONT};font-size:10px;font-weight:600;letter-spacing:0.16em;text-transform:uppercase;color:#c8b4a5;">reparatiedetails</p>
      </td></tr>
      <tr><td style="padding:0 40px 24px;">
        <table width="100%" cellpadding="0" cellspacing="0" border="0">
          ${row("kledingstuk", kledingstuk)}
          ${row("materiaal", materiaal)}
          ${row("schade", schade)}
          ${row("reparatiestijl", reparatiestijl)}
        </table>
      </td></tr>
    </table>

    <!-- note -->
    <table width="100%" cellpadding="0" cellspacing="0" border="0">
      <tr><td style="padding:0 40px 36px;">
        <table width="100%" cellpadding="0" cellspacing="0" border="0"
          style="background-color:#fdf8f5;border-radius:10px;border-left:3px solid #b85c38;">
          <tr><td style="padding:16px 20px;">
            <p style="margin:0;font-family:${BASE_FONT};font-size:13px;color:#7a5e50;line-height:1.65;">
              We nemen contact op via WhatsApp zodra je pakketje is ontvangen.
              Vragen? Stuur een bericht naar
              <a href="https://wa.me/31616120895" style="color:#b85c38;text-decoration:none;font-weight:500;">+31 6 16120895</a>.
            </p>
          </td></tr>
        </table>
      </td></tr>
    </table>`;

  return emailShell(body);
}

// ─── Admin booking notification email ────────────────────────────────────────

function buildAdminEmail({ referenceCode, naam, email, telefoon, retouradres, kledingstuk, materiaal, schade, reparatiestijl, terugkerendeKlant }) {
  const body = `
    <table width="100%" cellpadding="0" cellspacing="0" border="0">
      <tr>
        <td style="padding:36px 40px 28px;border-bottom:1px solid #f0ebe4;">
          <p style="margin:0 0 12
