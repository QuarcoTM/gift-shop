import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync, statSync } from "node:fs";

const file = path => new URL("../"+path, import.meta.url);
const read = path => readFileSync(file(path),"utf8");
const main = "assets/brand/za-usmivka-main.avif";
const badge = "assets/brand/za-usmivka-sticker.avif";
const mainPng = "assets/brand/za-usmivka-main.png";
const badgePng = "assets/brand/za-usmivka-sticker.png";
const printPng = "assets/brand/za-usmivka-sticker-print.png";
const pages = ["index.html","products/index.html","collections/index.html","collection/index.html",
  "product/index.html","cart/index.html","about/index.html","bulk/index.html",
  "contact/index.html","privacy/index.html","cookies/index.html","order/index.html"];

test("Approved logo 4 appears consistently in every public header, and in existing footers",()=>{
  for(const page of pages) {
    const html = read(page);
    assert.match(html,/class="brand-image"[^>]*za-usmivka-main\.avif/,page);
    assert.match(html,/alt="За усмивка\."/,page);
    assert.doesNotMatch(html, /class="brand-type"/,page);
    assert.doesNotMatch(html,/събрано\./i,page);
    assert.match(html,page==="index.html" ? /styles\.css\?v=20261119-hero-brand/ : /styles\.css\?v=20261119-footerfix/,page);
  }
  assert.doesNotMatch(read("index.html"),/Private-to-the-link visual preview|Optional name review only/);
  const css = read("styles.css");
  assert.match(css,/\.brand-footer \.brand-image/);
  assert.match(css,/\.brand-footer\{[^\n]*background:transparent/);
  assert.match(css,/filter:brightness\(0\) invert\(1\)/);
});

test("Hero uses approved lightweight round logo without obscuring the seasonal photograph",()=>{
  const html=read("index.html"),css=read("styles.css");
  const start=html.indexOf('<div class="hero-image"');
  const hero=html.slice(start,html.indexOf("</section>",start));
  assert.ok(start>=0 && hero.length>0,"Home hero must be present");
  assert.ok(hero.includes('class="hero-stamp" aria-hidden="true"'),"Hero stamp must be decorative");
  assert.ok(hero.includes('class="hero-stamp-logo" src="./assets/brand/za-usmivka-hero-badge.avif"'),"Must show round brand badge №3");
  assert.ok(!hero.includes("Подарък<br />от сърце"),"Old generic stamp text must be removed");
  const picture=file("assets/brand/za-usmivka-hero-badge.avif");
  assert.ok(existsSync(picture),"Optimized badge for hero must exist");
  assert.ok(statSync(picture).size<45000,"Hero badge should remain small for mobile performance");
  assert.ok(css.includes("html[data-campaign] .hero-image .hero-stamp img"),"Campaign CSS must not turn badge into full-size hero image");
  assert.ok(css.includes("filter:drop-shadow("),"Badge should keep contrast on all seasonal photos");
  const features=read("site-features.js");
  assert.ok(!features.includes('assign($(".hero-image img")'),"Seasonal script must never replace the logo");
  assert.ok(features.includes('img[data-campaign-photo]'),"Only marked campaign photos may be replaced");
});

test("Original approved images remain available to administrators as high-resolution transparent PNGs",()=>{
  for(const path of [main,badge,mainPng,badgePng,printPng]){
    assert.ok(existsSync(file(path)),"Missing approved logo asset: "+path);
    assert.ok(statSync(file(path)).size>10000,"Logo asset is unexpectedly tiny: "+path);
  }
  for(const path of [mainPng,badgePng,printPng]){
    const bytes=readFileSync(file(path));
    assert.equal(bytes.subarray(0,8).toString("hex"),"89504e470d0a1a0a","Must be a real PNG: "+path);
    assert.equal(bytes[25],6,"Must preserve transparent RGBA logo: "+path);
    assert.equal(bytes.subarray(-12).toString("hex"),"0000000049454e44ae426082","PNG must be complete: "+path);
  }
  const admin=read("admin.js"),markup=read("admin/index.html");
  assert.match(admin,/function branding\(\)/);
  assert.match(admin,/za-usmivka-main\.png/);
  assert.match(admin,/za-usmivka-sticker-print\.png/);
  assert.match(admin,/width="1254" height="1254"/);
  assert.match(admin,/download="za-usmivka-sticker\.png"/);
  assert.match(markup,/data-view="branding"/);
  assert.match(markup,/Бранд материали/);
  assert.match(read("admin.html"),/data-view="branding"/);
});

test("The storefront title, admin and shop name use За усмивка without changing storage identities",()=>{
  assert.match(read("site-config.js"),/shopName: 'За усмивка\.'/);
  assert.match(read("admin/index.html"),/За усмивка\./);
  assert.match(read("index.html"),/<title>Подаръци за специални моменти \| За усмивка\.<\/title>/);
  assert.match(read("app.js"),/\| За усмивка\./);
  assert.match(read("app.js"),/sabrano:consentchange/);
});
