import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const path = (name) => new URL("../" + name, import.meta.url);
const read = (name) => readFileSync(path(name), "utf8");
const names = ["index.html", "collections.html", "products.html", "collection.html", "product.html", "about.html", "bulk.html", "contact.html", "cart.html"];
const pages = names.map((name) => ({ name, content: read(name) }));
const css = read("styles.css");
const app = read("app.js");
const config = read("site-config.js");

test("each page and core asset exists", () => {
  for (const name of [...names, "app.js", "styles.css", "site-config.js", "assets/favicon.svg"]) {
    assert.ok(existsSync(path(name)), "Missing: " + name);
  }
});

test("all pages have correct semantic structure and unique route", () => {
  const routes = new Set();
  for (const { name, content } of pages) {
    assert.match(content, /<html lang="bg">/, name);
    assert.match(content, /<main id="content">/, name);
    assert.match(content, /<\/main>/, name);
    assert.match(content, /<footer/, name);
    const pageName = content.match(/<body data-page="([^"]+)">/)?.[1];
    assert.ok(pageName, name + " lacks data-page");
    assert.ok(!routes.has(pageName), "duplicate route " + pageName);
    routes.add(pageName);
  }
});

test("public links use extension-free routes and resolve to existing directory index pages", () => {
  const routes = new Set(["./", "./collections/", "./products/", "./collection/", "./product/", "./about/", "./bulk/", "./contact/", "./cart/", "./cookies/"]);
  for (const { name, content } of pages) {
    for (const match of content.matchAll(/<a\b[^>]*href="([^"]+)"/g)) {
      const href = match[1];
      if (href === "#content") continue;
      assert.ok(!href.startsWith("#"), name + " has in-page scrolling navigation: " + href);
      if (!href.startsWith("./")) continue;
      assert.doesNotMatch(href, /\.html(?:[?#]|$)/, name + " has a legacy URL");
      const route = href.split("?")[0].split("#")[0];
      assert.ok(routes.has(route), name + " links to unknown route: " + href);
      if (route !== "./") assert.ok(existsSync(path(route.slice(2) + "index.html")), name + " missing route " + route);
    }
  }
});
test("canonical pages use clean routes and relative base so all scripts and links resolve", () => {
  for (const name of names.filter((n) => n !== "index.html")) {
    const route = name.replace(/\.html$/, "");
    const canonical = read(route + "/index.html");
    assert.ok(canonical.includes('<base href="../" />'), name + " needs a root-relative base");
    assert.match(canonical, /<html lang="bg">/, name);
    assert.doesNotMatch(canonical, /(?:href|src)="[^"]*\.html(?:[?#]|")/, name);
    assert.ok(read(name).includes('location.replace("./' + route + '/"'), name + " should redirect the legacy entry");
  }
  const admin = read("admin/index.html");
  assert.match(admin, /noindex,nofollow/);
  assert.ok(admin.includes('<base href="../" />'));
  assert.doesNotMatch(admin, /href="[^"]*\.html/);
  assert.doesNotMatch(app, /\.html(?:[?#]|["'])/);
});

test("cookie policy has a clean URL and category controls", () => {
  const policy = read("cookies/index.html");
  assert.match(policy, /<html lang="bg">/);
  assert.match(policy, /<base href="\.\.\/" \/>/);
  assert.match(policy, /href="https:\/\/quarcotm\.github\.io\/gift-shop\/cookies\/"/);
  assert.match(policy, /data-open-cookie-settings/);
  assert.match(policy, /<main id="content">/);
  assert.doesNotMatch(policy, /href="[^"]*\.html/);
});

test("skip navigation remains on the current page with a nested base URL", () => {
  assert.match(app, /skip\.addEventListener\("click"/);
  assert.match(app, /event\.preventDefault\(\)/);
  assert.match(app, /destination\.scrollIntoView/);
});

test("home page is an overview with no numbered sections or promotion badges", () => {
  const home = read("index.html");
  assert.match(home, /class="hero"/);
  assert.match(home, /class="collections-grid"/);
  assert.match(home, /href="\.\/products\/"/);
  assert.doesNotMatch(home, /(?:\bSALE\b|\bSale\b|разпродажба|№\s*0[1-9]|[0-9]{2}\s*\/\s*(?:Открий|Подбрани|празнична))/i);
  assert.doesNotMatch(home, /<section class="section details-section"/);
});

test("mobile typography and layout are bounded by viewport width", () => {
  assert.match(css, /@media\(max-width:620px\)/);
  assert.match(css, /@media\(max-width:375px\)/);
  assert.match(css, /min-width:0/);
  assert.match(css, /overflow-wrap:break-word/);
  assert.match(css, /grid-template-columns:1fr/);
  assert.match(css, /prefers-reduced-motion/);
});

test("only Supabase publishable key is present", () => {
  assert.match(config, /sb_publishable_/);
  assert.doesNotMatch(config, /sb_secret_|service_role/);
  assert.match(config, /ycsjfsoijafepgslzzlz/);
});

test("checkout cannot place orders without a trusted backend", () => {
  const cart = read("cart.html");
  assert.match(cart, /id="checkout-button"[^>]*disabled/);
  assert.doesNotMatch(app, /gift_orders.*(?:POST|insert|rpc)/i);
});

test("JavaScript modules have valid syntax", () => {
  for (const name of ["app.js", "site-config.js"]) {
    assert.doesNotThrow(
      () => execFileSync(process.execPath, ["--check", fileURLToPath(path(name))], { stdio: "pipe" }),
      "syntax error in " + name
    );
  }
});

test("no fabricated contact data or delivery offers", () => {
  for (const { name, content } of pages) {
    assert.doesNotMatch(content, /\+359\s*8\d/, name);
    assert.doesNotMatch(content, /Безплатна доставка/i, name);
    assert.doesNotMatch(content, /\bSale\b/i, name);
  }
});


test("home hero uses two identifiable buttons without false photo controls", () => {
  const home = read("index.html");
  assert.match(home, /class="button button-dark" href="\.\/collections\/"/);
  assert.match(home, /data-season-link class="button button-outline" href="\.\/collection\/\?category=povodi"/);
  assert.match(home, /class="hero-stamp"/);
  assert.doesNotMatch(home, /hero-photo-caption|class="button button-text"/);
});

test("no decorative asterisks or arrow glyphs in site content", () => {
  for (const { name, content } of pages) {
    assert.doesNotMatch(content, /✳|↗|→|←|↑/, name);
    assert.doesNotMatch(content, /topline-accent|collection-arrow|nav-sparkle/, name);
  }
});

test("sale image has been removed from all storefront pages", () => {
  for (const { name, content } of pages) {
    assert.doesNotMatch(content, /photo-1607082350899-7e105aa886ae/, name);
  }
  assert.match(read("about.html"), /assets\/images\/about\.webp/);
  assert.doesNotMatch(read("about.html"), /images\.unsplash\.com/);
});

test("refresh keeps native scroll restoration rather than resetting to the top", () => {
  const refresh = read("refresh.js");
  assert.match(refresh, /history\.scrollRestoration = "auto"/);
  assert.doesNotMatch(refresh, /scrollRestoration = "manual"/);
  assert.doesNotMatch(refresh, /window\.scrollTo\(0, 0\)/);
  for (const { name, content } of pages) {
    assert.match(content, /src="\.\/refresh\.js"/, name);
  }
  const home = read("index.html");
  assert.match(home, /home-products-section" id="products" hidden/);
  assert.match(read("app.js"), /section\.hidden = items\.length === 0/);
  assert.doesNotMatch(css, /html\{scroll-behavior:smooth/);
});

test("refresh script is valid JavaScript", () => {
  assert.doesNotThrow(
    () => execFileSync(process.execPath, ["--check", fileURLToPath(path("refresh.js"))], { stdio: "pipe" })
  );
});

test("storefront uses locally hosted realistic photography, not image CDNs", () => {
  const home = read("index.html");
  assert.match(home, /assets\/images\/hero\.webp/);
  assert.match(home, /assets\/images\/kids\.webp/);
  assert.match(home, /assets\/images\/everyday\.webp/);
  assert.match(home, /assets\/images\/baby\.webp/);
  assert.match(home, /assets\/images\/occasions\.webp/);
  const uniqueNames = ["hero","baby","kids","occasions","christmas","easter","valentine","womens_day","martenitsa","everyday","bulk","about"];
  for (const name of uniqueNames) {
    assert.ok(existsSync(path("assets/images/" + name + ".webp")), "Missing realistic photo: " + name);
  }
  for (const { name, content } of pages) {
    assert.doesNotMatch(content, /images\.unsplash\.com|fonts\.googleapis\.com|fonts\.gstatic\.com/, name);
  }
});

test("home keeps the event gifts and removes only the bottom idea tile", () => {
  const home = read("index.html");
  assert.match(home, /<section class="home-more container">/);
  assert.match(home, /Подаръци за повече хора/);
  assert.doesNotMatch(home, /<div><span class="eyebrow">Нашата идея<\/span><h2>Подаръкът е/);
  assert.match(css, /scrollbar-color:var\(--wine\) var\(--sand\)/);
});


test("storefront never hides core sections awaiting a remote campaign request", () => {
  const css = read("styles.css");
  assert.doesNotMatch(css, /html:not\(\[data-campaign-ready="true"\]\)[\s\S]*?visibility:hidden!important/);
  const home = read("index.html");
  assert.match(home, /<h1>Малките/);
  assert.match(home, /data-season-link/);
  assert.doesNotMatch(home, /<section class="home-season" id="christmas">/);
  assert.match(read("site-features.js"), /catch \(error\) \{ console\.error\("Campaign catalog refresh:", error\); \}/);
});
