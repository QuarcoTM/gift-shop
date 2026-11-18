import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const home = readFileSync(new URL("../index.html", import.meta.url), "utf8");
const css = readFileSync(new URL("../styles.css", import.meta.url), "utf8");
const features = readFileSync(new URL("../site-features.js", import.meta.url), "utf8");
const presets = readFileSync(new URL("../campaigns.js", import.meta.url), "utf8");
const routes = ["index.html","collections/index.html","products/index.html","collection/index.html",
  "product/index.html","about/index.html","bulk/index.html","contact/index.html","cart/index.html","cookies/index.html"];
const keys = ["christmas","easter","valentine","womens_day","martenitsa","everyday"];
const read = (name) => readFileSync(new URL("../" + name, import.meta.url), "utf8");

test("all six holiday photographs and labels are pre-rendered for instant first paint", () => {
  for (const key of keys) {
    assert.match(home, new RegExp('data-season-content="' + key + '"'));
    assert.match(css, new RegExp('html\\[data-campaign="' + key + '"\\]\\{--instant-season-photo:url'));
    assert.ok(presets.includes(key + ": {"));
  }
  assert.match(home, /class="seasonal-photo"/);
  assert.match(home, /data-campaign="valentine"/);
  assert.doesNotMatch(home, /id="instant-season-boot"/);
  assert.doesNotMatch(css, /Campaign boot screen|body\[data-page\]::before/);
  assert.doesNotMatch(features, /mainPhoto\.decode\(\)/);
});

test("all pages show a valid first-paint holiday without executing async JavaScript", () => {
  for (const route of routes) {
    const html = read(route);
    assert.match(html, /data-campaign="valentine"/, route);
    assert.match(html, /data-season-content="christmas"/, route);
    assert.match(html, /data-season-content="easter"/, route);
    assert.match(html, /data-season-content="valentine"/, route);
    assert.doesNotMatch(html, /Visible failsafe|instant-season-boot/, route);
    const early = html.match(/<script>\/\* (?:Set active appearance before CSS|Choose before paint)[\s\S]*?<\/script>/)?.[0];
    assert.ok(early, "Missing early holiday selection script in " + route);
    assert.doesNotMatch(early,/fetch\(|localStorage|sessionStorage|document\.write|document\.body/);
  }
});

test("holiday choice is based on query and history without moving or blanking the page", () => {
  const script = home.match(/<script>\/\* Set active appearance before CSS[\s\S]*?<\/script>/)?.[0];
  assert.ok(script);
  const code = script.replace(/^<script>/,"").replace(/<\/script>$/,"");
  for (const key of keys) {
    const doc = {documentElement:{dataset:{campaign:"valentine"}}};
    const location={search:"?campaign="+key};
    const history={state:null};
    new Function("document","location","history","URLSearchParams",code)(doc,location,history,URLSearchParams);
    assert.equal(doc.documentElement.dataset.campaign,key);
  }
  const bad={documentElement:{dataset:{campaign:"valentine"}}};
  new Function("document","location","history","URLSearchParams",code)(
    bad,{search:"?campaign=invalid"},{state:null},URLSearchParams
  );
  assert.equal(bad.documentElement.dataset.campaign,"valentine");
});

test("subsequent campaign switches retain the preset DOM and URL on refresh", () => {
  assert.match(features, /querySelector\?\.\("\[data-season-content\]"\)/);
  assert.match(features, /address\.searchParams\.set\("campaign", key\)/);
  assert.match(features, /history\.replaceState/);
  assert.doesNotMatch(features,/mainPhoto\.decode\(\)/);
});
