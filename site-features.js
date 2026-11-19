import { config } from "./site-config.js";
import { CAMPAIGNS, campaignOf } from "./campaigns.js?v=20261119-new-year";
import { initCookieManager, allowsStorage } from "./cookie-consent.js?v=20261118-i";

const API = String(config.supabaseUrl || "").replace(/\/+$/, "");
const KEY = config.supabasePublishableKey;
const SESSION_KEY = "sabrano_analytics_session_v1";
const CAMPAIGN_CHANNEL = "sabrano-campaign-updates-v1";
const PAGES = new Set(["/","/products/","/collections/","/collection/","/product/","/cart/","/about/","/bulk/","/contact/","/cookies/"]);
const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => Array.from(document.querySelectorAll(selector));
const setText = (selector, value) => { const el = $(selector); if (el && !el.querySelector?.("[data-season-content]")) el.textContent = value; };
let currentCampaign = document.documentElement.dataset.campaign || null;
let inflightCampaign = null;
let lastReadAt = 0;

function sitePath() {
  const relative = window.location.pathname.replace(/^\/gift-shop\/?/, "/");
  if (!relative || relative === "/index.html") return "/";
  const normalized = relative.endsWith("/") ? relative : relative + "/";
  return PAGES.has(normalized) ? normalized : "";
}
function campaignLinks() {
  // Explicit campaign shortcuts only. Ordinary category links stay intact.
  return $$("a[data-season-link]");
}
function carryCampaignAcrossNavigation(key) {
  // Pages served by GitHub Pages are static. Carry the current public campaign
  // in internal links until the published HTML catches up, without cookies,
  // localStorage, blocking network calls or a splash screen.
  const baked = document.documentElement.dataset.staticCampaign || "valentine";
  for (const link of $$('a[href^="./"]')) {
    const href = link.getAttribute("href");
    const prefix = href.split(/[?#]/)[0];
    try {
      const url = new URL(href, document.baseURI);
      if (!url.pathname.startsWith("/gift-shop/") || url.pathname.startsWith("/gift-shop/admin/")) continue;
      if (key !== baked) url.searchParams.set("campaign", key);
      else url.searchParams.delete("campaign");
      link.setAttribute("href", prefix + url.search + url.hash);
    } catch { /* Ignore invalid or external links. */ }
  }
}
function updateSeasonalImages(campaign) {
  const assign = (img, alt) => {
    if (!img) return;
    const src = new URL(campaign.image, document.baseURI).href;
    if (img.src !== src) img.src = src;
    img.alt = alt;
    img.hidden = false;
  };
  // The main hero photograph is a CSS .seasonal-photo layer, while the
  // img nested inside .hero-stamp is the permanent brand badge.
  // Only change an explicitly marked campaign photo, never the logo.
  assign($(".hero-image > img[data-campaign-photo]"), "Подаръчни комплекти за " + campaign.label);
  assign($(".home-season-image img"), "Подаръци за " + campaign.label);
  for (const card of $$(".collections-grid .collection-card-large")) {
    assign(card.querySelector("img"), "Празнична колекция: " + campaign.label);
    const title = card.querySelector(".collection-title");
    const overline = card.querySelector(".collection-number");
    if (title && !title.querySelector?.("[data-season-content]")) title.innerHTML = campaign.cardTitle; // trusted static configuration
    if (overline && !overline.querySelector?.("[data-season-content]")) overline.textContent = campaign.eyebrow;
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
  carryCampaignAcrossNavigation(key);
  setText(".desktop-nav .nav-season", campaign.nav);
  setText(".mobile-nav a:first-child", campaign.nav);
  setText(".announcement a", campaign.announcement);
  setText(".hero-actions .button-outline", campaign.heroButton);
  const footer = $(".footer-nav a[data-season-link]");
  if (footer && !footer.querySelector?.("[data-season-content]")) footer.textContent = campaign.nav;

  const heroTitle = $(".hero-copy h1");
  if (heroTitle && !heroTitle.querySelector?.("[data-season-content]")) heroTitle.innerHTML = campaign.heroTitle; // trusted static configuration
  setText(".hero-subtitle", campaign.heroSubtitle);

  // The active holiday highlights its category, but never replaces other filters.
  const section = $(".home-season");
  if (section) {
    section.id = "campaign";
    setText(".home-season-copy .eyebrow", campaign.eyebrow);
    const title = $(".home-season-copy h2");
    if (title && !title.querySelector?.("[data-season-content]")) title.innerHTML = campaign.title; // trusted static configuration
    setText(".home-season-copy p", campaign.description);
    setText(".home-season-copy a", campaign.button);
    const art = $(".home-season-image");
    if (art) art.setAttribute("aria-label", campaign.label);
  }
  if (isNew) {
    window.dispatchEvent(new CustomEvent("sabrano:campaign-applied", { detail: { key, label: campaign.label } }));
  }
  // Campaign state must remain usable even if an optional catalog rendering callback fails.
  try { onCampaign?.(campaign); }
  catch (error) { console.error("Campaign catalog refresh:", error); }
  // Keep the chosen presentation in the current history entry (not in
  // cookies or localStorage), so a refresh of this tab can paint it immediately.
  try {
    const previous = (history.state && typeof history.state === "object") ? history.state : {};
    const address = new URL(location.href);
    const baked = document.documentElement.dataset.staticCampaign || "valentine";
    if (key !== baked) address.searchParams.set("campaign", key);
    else address.searchParams.delete("campaign");
    const next = address.pathname + address.search + address.hash;
    if (previous.sabranoCampaign !== key || next !== location.pathname + location.search + location.hash) {
      history.replaceState({ ...previous, sabranoCampaign: key }, "", next);
    }
  } catch { /* Navigation and the currently rendered campaign remain functional. */ }
  document.documentElement.dataset.campaignReady = "true";
  return key;
}
async function fetchCampaign(onCampaign, force = false) {
  if (!API || !KEY) return;
  if (inflightCampaign) return inflightCampaign;
  if (!force && currentCampaign && Date.now() - lastReadAt < 800) return;
  inflightCampaign = (async () => {
    try {
      const controller = new AbortController();
      const deadline = setTimeout(() => controller.abort(), 2400);
      let response;
      try {
        response = await fetch(API + "/rest/v1/gift_shop_settings?select=active_campaign&id=eq.main&limit=1", {
          headers: { apikey: KEY, Accept: "application/json", "Cache-Control": "no-cache" },
          cache: "no-store",
          signal: controller.signal
        });
      } finally {
        clearTimeout(deadline);
      }
      if (!response.ok) throw Error("Campaign settings HTTP " + response.status);
      const result = await response.json();
      if (!result?.[0]?.active_campaign) throw Error("Missing active campaign record");
      applyCampaign(result[0].active_campaign, onCampaign);
      lastReadAt = Date.now();
    } catch (error) {
      console.warn("Неуспешна синхронизация на празничната визия:", error);
      // Never silently revert an already loaded campaign to Christmas.
      // Preserve the static campaign if the API is temporarily unavailable.
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
  // The HTML already contains the currently published campaign. No loader.
  // The pre-paint inline code also handles a campaign passed from the admin
  // preview or retained in browser history during refresh.
  const inline = document.documentElement.dataset.campaign;
  if (Object.hasOwn(CAMPAIGNS, inline) && inline !== currentCampaign) {
    applyCampaign(inline, options.onCampaign);
  }
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
  // Product cards are created after the catalogue loads. Keep their links
  // on the chosen holiday as well, including when they were not in the DOM
  // during the original campaign update.
  document.addEventListener("click", (event) => {
    if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    const link = event.target.closest?.('a[href^="./"]');
    if (!link || link.target === "_blank") return;
    try {
      const key = document.documentElement.dataset.campaign;
      if (!Object.hasOwn(CAMPAIGNS, key)) return;
      const url = new URL(link.getAttribute("href"), document.baseURI);
      if (!url.pathname.startsWith("/gift-shop/") || url.pathname.startsWith("/gift-shop/admin/")) return;
      if (key !== (document.documentElement.dataset.staticCampaign || "valentine")) url.searchParams.set("campaign", key);
      else url.searchParams.delete("campaign");
      const relative = link.getAttribute("href").split(/[?#]/)[0];
      link.setAttribute("href", relative + url.search + url.hash);
    } catch { /* Keep the original working link. */ }
  }, true);
  window.addEventListener("focus", sync);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") sync();
  });
}
