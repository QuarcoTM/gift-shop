import { config } from "./site-config.js";
import { campaignOf } from "./campaigns.js";

const API = String(config.supabaseUrl || "").replace(/\/+$/, "");
const KEY = config.supabasePublishableKey;
const CONSENT_KEY = "sabrano_analytics_consent_v1";
const SESSION_KEY = "sabrano_analytics_session_v1";
const PAGES = new Set(["/","/products/","/collections/","/collection/","/product/","/cart/","/about/","/bulk/","/contact/"]);
const $ = (selector) => document.querySelector(selector);
const setText = (selector, value) => { const el = $(selector); if (el) el.textContent = value; };

function sitePath() {
  const path = window.location.pathname;
  const relative = path.replace(/^\/gift-shop\/?/, "/");
  if (!relative || relative === "/index.html") return "/";
  const normalized = relative.endsWith("/") ? relative : relative + "/";
  return PAGES.has(normalized) ? normalized : "";
}
function applyCampaign(key, onCampaign) {
  const campaign = campaignOf(key);
  const kind = Object.entries({
    christmas:"christmas", easter:"easter", valentine:"valentine",
    womens_day:"womens_day", martenitsa:"martenitsa", everyday:"everyday"
  }).some(([k]) => k === key) ? key : "christmas";
  document.documentElement.dataset.campaign = kind;

  // Keep every public seasonal entry point in sync, desktop and mobile alike.
  const footerSeasonLink = Array.from(document.querySelectorAll(".footer-nav a"))
    .find((link) => link.getAttribute("href")?.includes("category=koleda"));
  const seasonCard = $(".collections-grid .collection-card-large");
  if (seasonCard) {
    const title = seasonCard.querySelector(".collection-title");
    if (title) title.innerHTML = campaign.cardTitle; // predefined trusted preset
    const label = seasonCard.querySelector(".collection-number");
    if (label) label.textContent = campaign.eyebrow;
  }
  document.querySelectorAll('a[href*="category=koleda"]').forEach((link) => {
    const href = link.getAttribute("href");
    link.setAttribute("href", href.replace("category=koleda", "category=" + campaign.slug));
  });
  setText(".desktop-nav .nav-season", campaign.nav);
  setText(".announcement a", campaign.announcement);
  setText(".mobile-nav a:first-child", campaign.nav);
  setText(".hero-actions .button-outline", campaign.heroButton);
  if (footerSeasonLink) footerSeasonLink.textContent = campaign.nav;
  const button = $('.catalog-filters button[data-filter="koleda"]');
  if (button) { button.dataset.filter = campaign.slug; button.textContent = campaign.label; }
  const seasonSection = $(".home-season");
  if (seasonSection) {
    seasonSection.id = "campaign";
    setText(".home-season-copy .eyebrow", campaign.eyebrow);
    const title = $(".home-season-copy h2");
    if (title) title.innerHTML = campaign.title; // predefined trusted preset
    setText(".home-season-copy p", campaign.description);
    setText(".home-season-copy a", campaign.button);
    const art = $(".home-season-image");
    if (art) { art.dataset.mark = campaign.mark; art.setAttribute("aria-label", campaign.label); }
  }
  onCampaign?.(campaign);
}

async function fetchCampaign(onCampaign) {
  if (!API || !KEY) return;
  try {
    const r = await fetch(API + "/rest/v1/gift_shop_settings?select=active_campaign&id=eq.main&limit=1", {
      headers: { apikey: KEY, Accept:"application/json" }, cache: "no-store"
    });
    if (!r.ok) throw Error("Campaign settings HTTP " + r.status);
    const list = await r.json();
    applyCampaign(list[0]?.active_campaign || "christmas", onCampaign);
  } catch (error) {
    console.warn("Campaign: using default", error);
    applyCampaign("christmas", onCampaign);
  }
}
function getConsent() {
  try { return localStorage.getItem(CONSENT_KEY); } catch { return null; }
}
function setConsent(value) {
  try { localStorage.setItem(CONSENT_KEY, value); } catch { /* no persistent choice */ }
}
function sessionId() {
  try {
    let id = sessionStorage.getItem(SESSION_KEY);
    if (!id || !/^[a-f0-9-]{36}$/i.test(id)) {
      id = crypto.randomUUID();
      sessionStorage.setItem(SESSION_KEY, id);
    }
    return id;
  } catch { return crypto.randomUUID(); }
}
async function recordVisit() {
  if (getConsent() !== "yes" || !API || !KEY) return;
  const path = sitePath();
  if (!path) return;
  const result = await fetch(API + "/rest/v1/gift_visit_events", {
    method: "POST",
    headers: { apikey: KEY, "Content-Type":"application/json", Prefer:"return=minimal" },
    body: JSON.stringify({ session_id: sessionId(), page_path: path }),
    keepalive: true
  });
  if (!result.ok) throw Error("Analytics HTTP " + result.status);
}
function openConsentBanner() {
  const existing = $("#analytics-choice");
  if (existing) existing.hidden = false;
}
function setupConsent() {
  if ($("#analytics-choice")) return;
  const panel = document.createElement("aside");
  panel.id = "analytics-choice";
  panel.className = "analytics-choice";
  panel.setAttribute("aria-label", "Настройки за посещенията");
  panel.innerHTML = '<div class="analytics-choice-main"><strong>Статистика на посещенията</strong>' +
    '<p>Събираме анонимни данни за преглеждания и сесии само с твое разрешение. Не записваме имена или IP адреси в статистиката. Можеш да промениш избора си по всяко време.</p></div>' +
    '<div class="analytics-choice-actions"><button type="button" class="analytics-no" data-choice="no">Само необходими</button>' +
    '<button type="button" class="analytics-yes" data-choice="yes">Разрешавам статистика</button></div>';
  document.body.append(panel);
  const footer = $(".footer-bottom");
  if (footer) {
    const control = document.createElement("button");
    control.type = "button"; control.className = "analytics-preferences";
    control.textContent = "Настройки за статистиката";
    control.addEventListener("click", openConsentBanner);
    footer.append(control);
  }
  panel.addEventListener("click", (event) => {
    const btn = event.target.closest("[data-choice]");
    if (!btn) return;
    const choice = btn.dataset.choice;
    setConsent(choice);
    panel.hidden = true;
    if (choice === "no") {
      try { sessionStorage.removeItem(SESSION_KEY); } catch { /* ignore */ }
    } else {
      recordVisit().catch((error) => console.warn("Anonymous analytics:", error));
    }
  });
  panel.hidden = getConsent() !== null;
  if (getConsent() === "yes") recordVisit().catch((error) => console.warn("Anonymous analytics:", error));
}

export function initSiteFeatures(options = {}) {
  fetchCampaign(options.onCampaign);
  setupConsent();
}
