import test from "node:test";
import assert from "node:assert/strict";

test("first visit does not write client storage; consent can be granted and revoked", async () => {
  const data = new Map();
  const temp = new Map();
  let writes = 0;
  const makeStorage = (map) => ({
    getItem(key) { return map.has(key) ? map.get(key) : null; },
    setItem(key, value) { writes++; map.set(key, String(value)); },
    removeItem(key) { writes++; map.delete(key); }
  });
  globalThis.localStorage = makeStorage(data);
  globalThis.sessionStorage = makeStorage(temp);
  globalThis.CustomEvent = class { constructor(type, opts) { this.type = type; this.detail = opts?.detail; } };
  const created = new Map(), listeners = new Map();
  globalThis.window = { dispatchEvent() {} };
  globalThis.document = {
    body: { append(...nodes) { for (const node of nodes) created.set(node.id, node); } },
    createElement(tag) {
      return {
        tagName: tag, hidden: false, open: false,
        setAttribute() {}, innerHTML: "",
        showModal() { this.open = true; },
        close() { this.open = false; }
      };
    },
    querySelector(query) { return created.get(query.replace(/^#/, "")) || null; },
    querySelectorAll() { return []; },
    addEventListener(type, handler) { listeners.set(type, handler); }
  };

  const { getCookiePreferences, allowsStorage, initCookieManager } = await import("../cookie-consent.js");
  assert.equal(getCookiePreferences(), null);
  assert.equal(allowsStorage("necessary"), false);
  assert.equal(allowsStorage("analytics"), false);
  assert.equal(writes, 0, "Initial consent reads must not write anything");

  initCookieManager();
  assert.equal(writes, 0, "Showing the banner must not write anything");
  assert.equal(created.get("cookie-consent-banner").hidden, false);

  function choose(action) {
    listeners.get("click")({ target: {
      closest(selector) {
        return selector === "[data-cookie-action]" ? { dataset: { cookieAction: action } } : null;
      }
    } });
  }

  choose("all");
  assert.equal(allowsStorage("analytics"), true);
  assert.equal(allowsStorage("functional"), true);
  assert.equal(allowsStorage("marketing"), true);
  assert.equal(created.get("cookie-consent-banner").hidden, true);
  assert.ok(data.has("sabrano_cookie_preferences_v2"));

  temp.set("sabrano_analytics_session_v1", "stale-session");
  data.set("sabrano_favorites_v1", '["test-product"]');
  choose("necessary");
  assert.equal(allowsStorage("necessary"), true);
  assert.equal(allowsStorage("analytics"), false);
  assert.equal(allowsStorage("marketing"), false);
  assert.equal(allowsStorage("functional"), false);
  assert.equal(temp.has("sabrano_analytics_session_v1"), false, "Revocation must clear session ID");
  assert.equal(data.has("sabrano_favorites_v1"), false, "Revocation must clear functional storage");
});
