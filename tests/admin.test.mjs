import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const read = (name) => readFileSync(new URL("../" + name, import.meta.url), "utf8");

test("admin page is a distinct, noindex workspace with sign-in", () => {
  const html = read("admin.html");
  assert.match(html, /<html lang="bg">/);
  assert.match(html, /noindex,nofollow/);
  assert.match(html, /id="login-form"/);
  assert.match(html, /id="admin-root"[^>]*hidden/);
  assert.match(html, /id="editor-dialog"/);
  assert.match(html, /data-view="dashboard"/);
  for (const name of ["products", "categories", "orders", "settings"]) {
    assert.match(html, new RegExp('data-view="' + name + '"'));
  }
  assert.doesNotMatch(html, /service_role|sb_secret_/);
});

test("admin Javascript has valid syntax and uses the store publishable key", () => {
  assert.doesNotThrow(() => execFileSync(process.execPath, ["--check", fileURLToPath(new URL("../admin.js", import.meta.url))], { stdio: "pipe" }));
  const js = read("admin.js");
  assert.match(js, /config\.supabasePublishableKey/);
  assert.match(js, /gift_admins\?select=user_id,is_active/);
  assert.match(js, /auth\/v1\/token\?grant_type=/);
  assert.match(js, /sessionStorage\.setItem/);
  assert.match(js, /gift_categories\?select=/);
  assert.match(js, /gift_products\?select=/);
  assert.match(js, /gift_product_images\?select=/);
  assert.match(js, /gift_orders\?select=/);
  assert.match(js, /storage\/v1\/object\/gift-product-images\//);
  assert.doesNotMatch(js, /service_role|sb_secret_|auth\.signUp/);
});

test("admin has a responsive, cohesive standalone style", () => {
  const css = read("admin.css");
  assert.match(css, /--forest:#243c33/);
  assert.match(css, /--wine:#752f3f/);
  assert.match(css, /\.metric-grid/);
  assert.match(css, /\.data-table/);
  assert.match(css, /\.editor-dialog/);
  assert.match(css, /@media\(max-width:660px\)/);
});


test("navigation uses real SVG icons rather than placeholder stripe glyphs", () => {
  for (const name of ["admin/index.html", "admin.html"]) {
    const html = read(name);
    assert.match(html, /data-view="analytics"/);
    assert.match(html, /data-view="campaigns"/);
    assert.match(html, /class="nav-icon"><svg /);
    assert.doesNotMatch(html, /class="nav-icon">[◫▦▤▧⚙↗]/);
  }
});
test("analytics and client storage are gated by granular consent", () => {
  const features = read("site-features.js");
  const consent = read("cookie-consent.js");
  const store = read("app.js");
  assert.match(features, /!allowsStorage\("analytics"\)/);
  assert.match(features, /sessionStorage\.setItem\(SESSION_KEY/);
  assert.match(features, /crypto\.randomUUID\(\)/);
  assert.match(features, /gift_visit_events/);
  assert.match(features, /page_path: path/);
  assert.match(consent, /sabrano_cookie_preferences_v2/);
  assert.match(consent, /functional.*analytics.*marketing|analytics.*marketing/);
  assert.match(consent, /if \(!prefs\.analytics\)/);
  assert.match(consent, /sessionStorage\.removeItem\(ANALYTICS_SESSION_KEY\)/);
  assert.match(store, /if \(!allowsStorage\(category\)\) return/);
  assert.match(store, /allowsStorage\("necessary"\) \? loadSaved\(CART_KEY\)/);
  assert.match(store, /allowsStorage\("functional"\) \? loadSaved\(FAVORITES_KEY\)/);
  assert.doesNotMatch(features + consent, /document\.cookie/);
  assert.doesNotMatch(features + consent, /navigator\.userAgent/);
  assert.match(read("admin.js"), /gift_daily_analytics/);
  assert.match(read("admin.js"), /gift_page_analytics/);
  assert.match(read("admin.js"), /timeZone: "Europe\/Sofia"/);
});
test("preferences center has category choices, refusal and live reconfiguration", () => {
  const consent = read("cookie-consent.js");
  const html = read("cookies/index.html");
  assert.match(consent, /data-cookie-action="necessary"/);
  assert.match(consent, /data-cookie-action="settings"/);
  assert.match(consent, /data-cookie-action="all"/);
  assert.match(consent, /data-cookie-action="save"/);
  assert.match(consent, /data-cookie-option/);
  assert.match(consent, /data-open-cookie-settings/);
  assert.match(consent, /sabrano:consentchange/);
  assert.match(consent, /if \(!prefs\.functional\) localStorage\.removeItem\(FAVORITES_KEY\)/);
  assert.match(html, /<base href="\.\.\/" \/>/);
  assert.match(html, /Политика за|Политика/);
  assert.match(html, /data-open-cookie-settings/);
  assert.match(read("styles.css"), /\.cookie-preferences-dialog/);
});
test("campaigns are read from DB and admin sets them with a confirmed protected PATCH", () => {
  const features = read("site-features.js");
  const admin = read("admin.js");
  const presets = read("campaigns.js");
  const sql = read("sql/gift-seasons-analytics.sql");
  assert.match(features, /gift_shop_settings\?select=active_campaign/);
  assert.match(admin, /gift_shop_settings\?select=id,active_campaign/);
  assert.match(admin, /rest\("gift_shop_settings\?id=eq\.main","PATCH"/);
  assert.match(admin, /updated\[0\]\.active_campaign !== key/);
  for (const campaign of ["christmas","easter","valentine","womens_day","martenitsa","everyday"]) {
    assert.ok(presets.includes(campaign + ": {"));
  }
  assert.match(sql, /security_invoker=true/);
  assert.match(sql, /gift_private\.is_gift_admin\(\)/);
  assert.match(features, /assign\(\$\("\.hero-image img"\)/);
  assert.match(features, /new BroadcastChannel\(CAMPAIGN_CHANNEL\)/);
  assert.match(admin, /channel\.postMessage\(\{ type: "campaign-changed", key \}\)/);
  assert.match(presets, /assets\/images\/easter\.webp/);
});
