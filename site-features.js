import { config } from "./site-config.js";
import { CAMPAIGNS, campaignOf } from "./campaigns.js?v=20261118-b";
import { initCookieManager, allowsStorage } from "./cookie-consent.js?v=20261118-b";

const API = String(config.supabaseUrl || "").replace(/\/+$/, "");
const KEY = config.supabasePublishableKey;
const SESSION_KEY = "sabrano_analytics_session_v1";
const CAMPAIGN_CHANNEL = "sabrano-campaign-updates-v1";
const PAGES = new Set(["/","/products/","/collections/","/collection/","/product/","/cart/","/about/","/bulk/","/contact/","/cookies/"]);
const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => Array.from(document.querySelectorAll(selector));
const setText = (selector, value) => { const el = $(selector); if (el) el.textContent = value; };
let currentCampaign = null;
let inflightCampaign = null;
let lastReadAt = 0;

function sitePath() {
  const relative = window.location.pathname.replace(/^\/gift-shop\/?/, "/");
  if (!relative || relative === "/index.html") return "/";
  const normalized = relative.endsWith("/") ? relative : relative + "/";
  return PAGES.has(normalized) ? normalized : "";
}
function campaignLinks() {
  const standard = Object.values(CAMPAIGNS).map((item) => item.slug);
  for (const link of $$('a[href*="category=koleda"]')) link.dataset.seasonLink = "true";
  return $$("a[data-season-link]").filter((link) => {
    try { return standard.includes(new URL(link.href).searchParams.get("category")); }
    catch { return false; }
  });
}
function updateSeasonalImages(campaign) {
  const assign = (img, alt) => {
    if (!img) return;
    const src = new URL(campaign.image, document.baseURI).href;
    if (img.src !== src) img.src = src;
    img.alt = alt;
    img.hidden = false;
  };
  assign($(".hero-image img"), "Подаръчни комплекти за " + campaign.label);
  assign($(".home-season-image img"), "Подаръци за " + campaign.label);
  for (const card of $$(".collections-grid .collection-card-large")) {
    assign(card.querySelector("img"), "Празнична колекция: " + campaign.label);
    const title = card.querySelector(".collection-title");
    const overline = card.querySelector(".collection-number");
    if (title) title.innerHTML = campaign.cardTitle; // trusted static configuration
    if (overline) overline.textContent = campaign.eyebrow;
  }
}
function applyCampaign(key, onCampaign) {
  if (!Object.hasOwn(CAMPAIGNS,key)) key = "christmas";
  const campaign = campaignOf(key);
  const isNew = key !== currentCampaign;
  currentCampaign = key;
  document.documentElement.dataset.campaign = key;

  // Every visitor sees the actual active campaign, including already-open tabs.
  for (const link of campaignLinks()) {
    const dest = new URL(link.getAttribute("href"), document.baseURI);
    dest.searchParams.set("category", campaign.slug);
    link.setAttribute("href", "./collection/?category=" + encodeURIComponent(campaign.slug));
  }
  updateSeasonalImages(campaign);
  setText(".desktop-nav .nav-season", campaign.nav);
  setText(".mobile-nav a:first-child", campaign.nav);
  setText(".announcement a", campaign.announcement);
  setText(".hero-actions .button-outline", campaign.heroButton);
  const footer = $(".footer-nav a[data-season-link]");
  if (footer) footer.textContent = campaign.nav;

  const heroTitle = $(".hero-copy h1");
  if (heroTitle) heroTitle.innerHTML = campaign.heroTitle; // trusted static configuration
  setText(".hero-subtitle", campaign.heroSubtitle);

  const label = $('.catalog-filters button[data-filter="koleda"]') || $('.catalog-filters button[data-season-filter]');
  if (label) {
    label.dataset.seasonFilter = "true";
    label.dataset.filter = campaign.slug;
    label.textContent = campaign.label;
  }
  const section = $(".home-season");
  if (section) {
    section.id = "campaign";
    setText(".home-season-copy .eyebrow", campaign.eyebrow);
    const title = $(".home-season-copy h2");
    if (title) title.innerHTML = campaign.title; // trusted static configuration
    setText(".home-season-copy p", campaign.description);
    setText(".home-season-copy a", campaign.button);
    const art = $(".home-season-image");
    if (art) art.setAttribute("aria-label", campaign.label);
  }
  if (isNew) {
    window.dispatchEvent(new CustomEvent("sabrano:campaign-applied", { detail: { key, label: campaign.label } }));
  }
  onCampaign?.(campaign);
  // Reveal holiday content only after every image, heading and link is updated.
  document.documentElement.dataset.campaignReady = "true";
  return key;
}
async function fetchCampaign(onCampaign, force = false) {
  if (!API || !KEY) { applyCampaign("everyday", onCampaign); return; }
  if (inflightCampaign) return inflightCampaign;
  if (!force && currentCampaign && Date.now() - lastReadAt < 800) return;
  inflightCampaign = (async () => {
    try {
      const response = await fetch(API + "/rest/v1/gift_shop_settings?select=active_campaign&id=eq.main&limit=1", {
        headers: { apikey: KEY, Accept: "application/json", "Cache-Control": "no-cache" },
        cache: "no-store"
      });
      if (!response.ok) throw Error("Campaign settings HTTP " + response.status);
      const result = await response.json();
      if (!result?.[0]?.active_campaign) throw Error("Missing active campaign record");
      applyCampaign(result[0].active_campaign, onCampaign);
      lastReadAt = Date.now();
    } catch (error) {
      console.warn("Неуспешна синхронизация на празничната визия:", error);
      // Never silently revert an already loaded campaign to Christmas.
      if (!currentCampaign) applyCampaign("everyday", onCampaign);
    } finally { inflightCampaign = null; }
  })();
  return inflightCampaign;
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
  if (!allowsStorage("analytics") || !API || !KEY) return;
  const path = sitePath();
  if (!path) return;
  const result = await fetch(API + "/rest/v1/gift_visit_events", {
    method: "POST",
    headers: { apikey: KEY, "Content-Type": "application/json", Prefer: "return=minimal" },
    body: JSON.stringify({ session_id: sessionId(), page_path: path }),
    keepalive: true
  });
  if (!result.ok) throw Error("Analytics HTTP " + result.status);
}
export function initSiteFeatures(options = {}) {
  const sync = () => fetchCampaign(options.onCampaign, true);
  fetchCampaign(options.onCampaign);
  initCookieManager();
  if (allowsStorage("analytics")) {
    recordVisit().catch((error) => console.warn("Anonymous analytics:", error));
  }
  window.addEventListener("sabrano:consentchange", (event) => {
    if (event.detail.analytics && event.detail.previous?.analytics !== true) {
      recordVisit().catch((error) => console.warn("Anonymous analytics:", error));
    }
  });
  // BroadcastChannel updates all open same-origin tabs immediately after admin save.
  if (typeof BroadcastChannel !== "undefined") {
    const channel = new BroadcastChannel(CAMPAIGN_CHANNEL);
    channel.addEventListener("message", (event) => {
      if (event.data?.type !== "campaign-changed") return;
      if (Object.hasOwn(CAMPAIGNS, event.data.key)) applyCampaign(event.data.key, options.onCampaign);
      sync(); // Reconcile with the database, which is the source of truth.
    });
  }
  window.addEventListener("focus", sync);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") sync();
  });
}
