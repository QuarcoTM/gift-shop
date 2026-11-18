import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const url = (path) => new URL("../" + path, import.meta.url);
const read = (path) => readFileSync(url(path), "utf8");
const markup = read("index.html");
const css = read("styles.css");
const app = read("app.js");
const config = read("site-config.js");

test("all storefront assets are committed", () => {
  for (const path of ["index.html", "styles.css", "app.js", "site-config.js", "assets/favicon.svg"]) {
    assert.ok(existsSync(url(path)), "missing " + path);
  }
});

test("semantic Bulgarian homepage with mobile styling", () => {
  assert.match(markup, /<html lang="bg">/);
  for (const id of ["content", "collections", "products", "story", "christmas", "bulk", "cart-dialog", "search-dialog", "product-dialog"]) {
    assert.ok(markup.includes('id="' + id + '"'), "missing " + id);
  }
  assert.match(css, /@media\(max-width:620px\)/);
  assert.match(css, /prefers-reduced-motion/);
});

test("only the publishable Supabase credential is in browser config", () => {
  assert.match(config, /sb_publishable_/);
  assert.doesNotMatch(config, /sb_secret_/);
  assert.match(config, /ycsjfsoijafepgslzzlz/);
});

test("checkout stays blocked until an authenticated server endpoint exists", () => {
  assert.match(app, /\$\("#checkout-button"\)\.disabled = true/);
  assert.match(markup, /id="checkout-button" disabled/);
  assert.doesNotMatch(app, /fetch\([^)]*gift_orders/i);
});

test("app and config are valid ES modules", () => {
  for (const path of ["app.js", "site-config.js"]) {
    assert.doesNotThrow(() => execFileSync(process.execPath, ["--check", fileURLToPath(url(path))], {stdio: "pipe"}));
  }
});

test("no fabricated address, phone or unconfirmed commercial promises", () => {
  assert.doesNotMatch(markup, /\+359\s*8\d/);
  assert.doesNotMatch(markup, /Безплатна доставка/i);
  assert.doesNotMatch(markup, /(?:[1-9][0-9]?,[0-9]{2})\s*€/);
});
