/**
 * За усмивка: consent manager.
 * No first-party cookies are created by this module.
 * No localStorage / sessionStorage writes occur until an explicit choice.
 * Non-essential processing is disabled by default.
 */
export const PREFERENCE_KEY = "zausmivka_cookie_preferences_v2";
const LEGACY_ANALYTICS_KEY = "zausmivka_analytics_consent_v1";
const ANALYTICS_SESSION_KEY = "zausmivka_analytics_session_v1";
const FAVORITES_KEY = "zausmivka_favorites_v1";
const VERSION = 2;

const $ = (sel) => document.querySelector(sel);
let sessionChoice = null;
let initialized = false;

export function getCookiePreferences() {
  if (sessionChoice) return { ...sessionChoice };
  try {
    const value = JSON.parse(localStorage.getItem(PREFERENCE_KEY) || "null");
    if (!value || value.version !== VERSION || value.necessary !== true) return null;
    return {
      version: VERSION,
      necessary: true,
      functional: value.functional === true,
      analytics: value.analytics === true,
      marketing: value.marketing === true
    };
  } catch { return null; }
}

export function allowsStorage(category) {
  const prefs = getCookiePreferences();
  if (!prefs) return false;
  if (category === "necessary") return true;
  return prefs[category] === true;
}

function normalizeChoice(options = {}) {
  return {
    version: VERSION,
    necessary: true,
    functional: options.functional === true,
    analytics: options.analytics === true,
    marketing: options.marketing === true
  };
}

function saveChoice(options) {
  const old = getCookiePreferences();
  const prefs = normalizeChoice(options);
  sessionChoice = prefs; // Works in private browsing when localStorage is disabled.
  try {
    localStorage.setItem(PREFERENCE_KEY, JSON.stringify({ ...prefs, updatedAt: new Date().toISOString() }));
    localStorage.removeItem(LEGACY_ANALYTICS_KEY);
    // Removing preferences after revocation prevents old stored favorites being reused.
    if (!prefs.functional) localStorage.removeItem(FAVORITES_KEY);
  } catch { /* No persistent choice when storage is unavailable. */ }
  if (!prefs.analytics) {
    try { sessionStorage.removeItem(ANALYTICS_SESSION_KEY); } catch { /* blocked */ }
  }
  window.dispatchEvent(new CustomEvent("zausmivka:consentchange", {
    detail: { ...prefs, previous: old }
  }));
  document.querySelectorAll("[data-cookie-summary]").forEach((node) => { node.textContent = summary(prefs); });
  return prefs;
}

function summary(prefs) {
  if (!prefs) return "Не е избрано";
  const names = [];
  if (prefs.functional) names.push("функционални");
  if (prefs.analytics) names.push("аналитични");
  if (prefs.marketing) names.push("маркетингови");
  return names.length ? "Необходими + " + names.join(", ") : "Само необходими";
}

function settingsRow(key, title, description, locked = false) {
  const input = '<input type="checkbox" id="cookie-option-' + key + '" data-cookie-option="' + key +
    '" ' + (locked ? 'checked disabled aria-checked="true"' : "") + ' />';
  return '<label class="cookie-settings-row' + (locked ? " locked" : "") + '" for="cookie-option-' + key +
    '"><span class="cookie-settings-label"><strong>' + title + '</strong><small>' + description +
    '</small></span><span class="cookie-toggle">' + input + '<span class="cookie-toggle-track" aria-hidden="true"></span></span></label>';
}

function createBanner() {
  const banner = document.createElement("aside");
  banner.id = "cookie-consent-banner";
  banner.className = "cookie-consent-banner";
  banner.setAttribute("role", "region");
  banner.setAttribute("aria-labelledby", "cookie-banner-title");
  banner.innerHTML =
    '<div class="cookie-banner-text"><span class="cookie-kicker">ПОВЕРИТЕЛНОСТ &amp; ИЗБОР</span>' +
    '<h2 id="cookie-banner-title">Твоят избор има значение.</h2>' +
    '<p>Използваме съхранение за основните функции на магазина само след твой избор. ' +
    'Статистика и маркетинг се включват единствено с разрешение. ' +
    'Можеш да промениш настройките си по всяко време.</p></div>' +
    '<div class="cookie-banner-actions">' +
    '<button type="button" class="cookie-button cookie-button-plain" data-cookie-action="necessary">Само необходими</button>' +
    '<button type="button" class="cookie-button cookie-button-outline" data-cookie-action="settings">Настройки</button>' +
    '<button type="button" class="cookie-button cookie-button-primary" data-cookie-action="all">Приемам всички</button>' +
    '</div>';
  banner.hidden = Boolean(getCookiePreferences());
  return banner;
}

function createDialog() {
  const dialog = document.createElement("dialog");
  dialog.id = "cookie-preferences-dialog";
  dialog.className = "cookie-preferences-dialog";
  dialog.setAttribute("aria-labelledby", "cookie-settings-title");
  dialog.innerHTML =
    '<div class="cookie-dialog-head"><div><span class="cookie-kicker">СЪБРАНО. / ПОВЕРИТЕЛНОСТ</span>' +
    '<h2 id="cookie-settings-title">Настройки за бисквитки</h2>' +
    '<p>Избери кои категории разрешаваш. Незадължителните остават изключени, докато сам не ги активираш.</p></div>' +
    '<button type="button" class="cookie-dialog-close" data-cookie-action="close" aria-label="Затвори настройките">×</button></div>' +
    '<div class="cookie-dialog-options">' +
    settingsRow("necessary", "Необходими", "Основни функции като запазване на количката след твоя избор. Не се използват за реклама.", true) +
    settingsRow("functional", "Функционални", "Запазване на предпочитания като „Любими“ между посещенията.") +
    settingsRow("analytics", "Аналитични", "Анонимна статистика за сесии и посещавани страници. Без записване на IP адреси в нашата база.") +
    settingsRow("marketing", "Маркетингови", "За бъдещи рекламни инструменти. В момента няма активирани маркетингови скриптове.") +
    '</div><div class="cookie-dialog-bottom"><span data-cookie-summary>Не е избрано</span>' +
    '<div class="cookie-dialog-actions">' +
    '<button type="button" class="cookie-button cookie-button-plain" data-cookie-action="necessary">Само необходими</button>' +
    '<button type="button" class="cookie-button cookie-button-outline" data-cookie-action="save">Запази избора</button>' +
    '<button type="button" class="cookie-button cookie-button-primary" data-cookie-action="all">Приеми всички</button></div></div>';
  return dialog;
}

function fillDialog() {
  const prefs = getCookiePreferences();
  for (const key of ["functional", "analytics", "marketing"]) {
    const node = $("#cookie-option-" + key);
    if (node) node.checked = prefs?.[key] === true;
  }
  const status = document.querySelector("#cookie-preferences-dialog [data-cookie-summary]");
  if (status) status.textContent = summary(prefs);
}

export function openCookieSettings() {
  const dialog = $("#cookie-preferences-dialog");
  if (!dialog) return;
  fillDialog();
  if (!dialog.open) dialog.showModal();
}

function closeDialog() {
  const dialog = $("#cookie-preferences-dialog");
  if (dialog?.open) dialog.close();
}

function makeChoice(choice) {
  const options = choice === "all"
    ? { functional: true, analytics: true, marketing: true }
    : choice === "necessary"
      ? { functional: false, analytics: false, marketing: false }
      : {
          functional: $("#cookie-option-functional")?.checked === true,
          analytics: $("#cookie-option-analytics")?.checked === true,
          marketing: $("#cookie-option-marketing")?.checked === true
        };
  saveChoice(options);
  const banner = $("#cookie-consent-banner");
  if (banner) banner.hidden = true;
  closeDialog();
}

function addFooterControls() {
  const footer = $(".footer-bottom");
  if (!footer || footer.querySelector("[data-open-cookie-settings]")) return;
  const link = document.createElement("button");
  link.type = "button";
  link.className = "cookie-footer-link";
  link.textContent = "Настройки на бисквитките";
  link.dataset.openCookieSettings = "";
  footer.append(link);
  const info = document.createElement("a");
  info.className = "cookie-footer-link";
  info.href = "./cookies/";
  info.textContent = "Политика за бисквитки";
  footer.append(info);
}

export function initCookieManager() {
  if (initialized) return;
  initialized = true;
  // Retire legacy analytics permission and session without accepting it silently.
  // Fresh visitors still incur ZERO storage writes before their first choice.
  if (!getCookiePreferences()) {
    try {
      if (localStorage.getItem(LEGACY_ANALYTICS_KEY) !== null) localStorage.removeItem(LEGACY_ANALYTICS_KEY);
    } catch { /* blocked */ }
    try {
      if (sessionStorage.getItem(ANALYTICS_SESSION_KEY) !== null) sessionStorage.removeItem(ANALYTICS_SESSION_KEY);
    } catch { /* blocked */ }
  }
  document.body.append(createBanner(), createDialog());
  addFooterControls();
  document.querySelectorAll("[data-cookie-summary]").forEach((node) => {
    node.textContent = summary(getCookiePreferences());
  });
  document.addEventListener("click", (event) => {
    const action = event.target.closest("[data-cookie-action]");
    if (action) {
      if (action.dataset.cookieAction === "settings") openCookieSettings();
      if (action.dataset.cookieAction === "close") closeDialog();
      if (["necessary", "all", "save"].includes(action.dataset.cookieAction)) makeChoice(action.dataset.cookieAction);
      return;
    }
    if (event.target.closest("[data-open-cookie-settings]")) {
      event.preventDefault();
      openCookieSettings();
    }
  });
  // Native dialog handles Escape and restores keyboard focus.
}
