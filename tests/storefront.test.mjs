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

test("all internal links target real pages, not in-page scroll positions", () => {
  for (const { name, content } of pages) {
    for (const match of content.matchAll(/href="([^"]+)"/g)) {
      const href = match[1];
      if (href === "#content") continue; // accessible skip link
      assert.ok(!href.startsWith("#"), name + " contains scrolling navigation: " + href);
      if (!href.startsWith("./") || !href.includes(".html")) continue;
      const target = href.slice(2).split("?")[0].split("#")[0];
      assert.ok(names.includes(target), name + " links to nonexistent page: " + href);
    }
  }
});

test("home page is an overview with no numbered sections or promotion badges", () => {
  const home = read("index.html");
  assert.match(home, /class="hero"/);
  assert.match(home, /class="collections-grid"/);
  assert.match(home, /href="\.\/products.html"/);
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
