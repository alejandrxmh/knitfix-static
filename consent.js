/* knitfix: google tag (analytics + ads) with consent mode v2 and a small cookie banner.
   include in <head> of every public page:  <script src="/consent.js"></script>  */
(function () {
  var GA_ID = "G-64EC5J5JE0";
  var ADS_ID = "AW-18481317644";
  var ADS_CONVERSION = "AW-18481317644/QvwwCJruu4sdEIyOyuxE";
  var KEY = "knitfix-consent"; // "granted" | "denied"

  window.dataLayer = window.dataLayer || [];
  function gtag() { dataLayer.push(arguments); }
  window.gtag = gtag;

  var saved = null;
  try { saved = localStorage.getItem(KEY); } catch (e) {}
  var state = saved === "granted" ? "granted" : "denied";

  gtag("consent", "default", {
    ad_storage: state,
    ad_user_data: state,
    ad_personalization: state,
    analytics_storage: state,
    wait_for_update: 500
  });

  var s = document.createElement("script");
  s.async = true;
  s.src = "https://www.googletagmanager.com/gtag/js?id=" + GA_ID;
  document.head.appendChild(s);

  gtag("js", new Date());
  gtag("config", GA_ID);
  gtag("config", ADS_ID);

  // conversion: deposit paid (stripe redirects to /success.html?ref=XXXX)
  if (/\/success(\.html)?$/.test(location.pathname)) {
    var ref = new URLSearchParams(location.search).get("ref");
    if (ref) {
      gtag("event", "conversion", { send_to: ADS_CONVERSION, transaction_id: ref });
    }
  }

  function setConsent(value) {
    try { localStorage.setItem(KEY, value); } catch (e) {}
    gtag("consent", "update", {
      ad_storage: value,
      ad_user_data: value,
      ad_personalization: value,
      analytics_storage: value
    });
  }

  // lets the privacy page reopen the banner: <a href="#" onclick="knitfixCookies();return false">
  window.knitfixCookies = function () { showBanner(true); };

  var TEXT = {
    nl: {
      msg: "we gebruiken cookies om websitebezoek te meten en onze advertenties te verbeteren.",
      more: "meer info",
      no: "weigeren",
      yes: "accepteren"
    },
    en: {
      msg: "we use cookies to measure site visits and improve our ads.",
      more: "more info",
      no: "decline",
      yes: "accept"
    }
  };

  function showBanner(force) {
    if (!force && saved) return;
    if (document.getElementById("kf-cookie")) return;
    var lang = (document.documentElement.lang || "nl").slice(0, 2);
    var t = TEXT[lang] || TEXT.nl;

    var css = document.createElement("style");
    css.textContent =
      "#kf-cookie{position:fixed;left:16px;right:16px;bottom:16px;z-index:9999;max-width:460px;margin:0 auto;" +
      "background:#f5f2ee;color:#1a1714;border:1px solid #c9c3b8;border-radius:14px;padding:16px 18px;" +
      "box-shadow:0 6px 28px rgba(26,23,20,.12);font-family:'Jost',system-ui,sans-serif;font-size:14px;line-height:1.5}" +
      "#kf-cookie p{margin:0 0 12px}#kf-cookie a{color:#7a7269}" +
      "#kf-cookie .kf-row{display:flex;gap:8px;justify-content:flex-end}" +
      "#kf-cookie button{font:inherit;border-radius:999px;padding:8px 16px;cursor:pointer;border:1px solid #c9c3b8;background:transparent;color:#1a1714}" +
      "#kf-cookie button.kf-yes{background:#b85c38;border-color:#b85c38;color:#fff}" +
      "#kf-cookie button.kf-yes:hover{background:#d4795a;border-color:#d4795a}" +
      "#kf-cookie button.kf-yes:active{background:#8a3e22}";
    document.head.appendChild(css);

    var box = document.createElement("div");
    box.id = "kf-cookie";
    box.setAttribute("role", "dialog");
    box.setAttribute("aria-label", "cookies");
    box.innerHTML =
      "<p>" + t.msg + ' <a href="/privacy.html">' + t.more + "</a></p>" +
      '<div class="kf-row"><button type="button" class="kf-no">' + t.no + "</button>" +
      '<button type="button" class="kf-yes">' + t.yes + "</button></div>";
    document.body.appendChild(box);

    box.querySelector(".kf-yes").onclick = function () { setConsent("granted"); box.remove(); };
    box.querySelector(".kf-no").onclick = function () { setConsent("denied"); box.remove(); };
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", function () { showBanner(false); });
  } else {
    showBanner(false);
  }
})();
