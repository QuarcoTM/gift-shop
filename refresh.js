/* Keep a normal, predictable position when the page is refreshed.
   Preserve standard browser history behavior for navigation/back actions. */
(() => {
  "use strict";
  let isReload = false;
  try {
    const entry = performance.getEntriesByType("navigation")[0];
    isReload = entry?.type === "reload" || (!entry && performance.navigation?.type === 1);
  } catch {
    isReload = false;
  }
  if (!isReload) return;

  if ("scrollRestoration" in history) {
    history.scrollRestoration = "manual";
  }

  const resetScroll = () => {
    if (!location.hash) window.scrollTo(0, 0);
  };

  // Safari may restore a saved scroll offset during or after page load.
  resetScroll();
  window.addEventListener("DOMContentLoaded", resetScroll, { once: true });
  window.addEventListener("load", () => {
    resetScroll();
    requestAnimationFrame(resetScroll);
  }, { once: true });
  window.addEventListener("pageshow", () => {
    resetScroll();
    requestAnimationFrame(resetScroll);
  });
})();
