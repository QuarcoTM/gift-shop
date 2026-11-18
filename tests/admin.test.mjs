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
