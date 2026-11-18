/* Restore the browser's native scroll position on refresh and history navigation.
   Do not force a scroll to the top; this also keeps Safari's restoration enabled. */
(() => {
  "use strict";
  if ("scrollRestoration" in history) {
    history.scrollRestoration = "auto";
  }
})();
