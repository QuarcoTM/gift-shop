import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync,existsSync,statSync} from "node:fs";
const read = name=>readFileSync(new URL("../"+name,import.meta.url),"utf8");
const holidaySlugs=["koleda","nova-godina","velikden","sveti-valentin","osmi-mart","baba-marta"];
const everydaySlugs=["bebe","deca","povodi"];
const pages=["index.html","products/index.html","collections/index.html","collection/index.html",
  "product/index.html","cart/index.html","about/index.html","bulk/index.html",
  "contact/index.html","privacy/index.html","cookies/index.html"];

test("All category filters remain visible in products even without products",()=>{
  const html=read("products/index.html");
  for(const slug of ["all",...holidaySlugs,...everydaySlugs])
    assert.match(html,new RegExp('data-filter="'+slug+'"'),"Missing permanent category "+slug);
  assert.doesNotMatch(html,/Без празнична кампания|data-season-filter=/);
  const app=read("app.js");
  assert.match(app,/function renderCustomCategories\(/);
  assert.match(app,/\.replaceChildren\(\.\.\.ordered\)/);
  assert.match(app,/button\.classList\.toggle\("is-featured", slug === featuredSlug\)/);
  assert.doesNotMatch(app,/data\.products\.some\(\(product\) => product\.category_id === cat\.id\)/);
  const features=read("site-features.js");
  assert.doesNotMatch(features,/label\.dataset\.filter = campaign\.slug/);
});

test("New Year is an independent campaign and category, not a variant of Christmas",()=>{
  const campaigns=read("campaigns.js");
  assert.match(campaigns,/new_year:\s*\{/);
  assert.match(campaigns,/label:"Нова година", slug:"nova-godina"/);
  assert.match(campaigns,/new_year\.avif/);
  const photo = new URL("../assets/images/new_year.avif", import.meta.url);
  assert.ok(existsSync(photo), "New Year must have its own image asset");
  assert.ok(statSync(photo).size > 10000, "New Year asset should be a real photograph");
  assert.doesNotMatch(campaigns,/label:"Без празнична кампания"/);
  const sql=read("sql/gift-new-year-category.sql");
  assert.match(sql,/nova-godina/);
  assert.match(sql,/new_year/);
  const admin=read("admin.js");
  assert.match(admin,/new_year:"Подаръци/);
});

test("All holiday pages render New Year directly without blank pre-paint content",()=>{
  const css=read("styles.css");
  assert.match(css,/html\[data-campaign="new_year"\] \[data-season-content="new_year"\]\{display:contents!important\}/);
  for(const page of pages){
    const html=read(page);
    const christmas=(html.match(/data-season-content="christmas"/g)||[]).length;
    const newYear=(html.match(/data-season-content="new_year"/g)||[]).length;
    assert.ok(christmas>0 && newYear===christmas,page+" lost season copy");
    assert.match(html,/christmas\|new_year\|easter\|valentine/);
    assert.match(html,/styles\.css\?v=20261119-brand/);
    assert.match(html,/app\.js\?v=20261119-brand/);
  }
});

test("Mobile catalog wraps all category filters instead of hiding them offscreen",()=>{
  const css=read("styles.css");
  assert.match(css,/All categories are visible without horizontal swiping/);
  assert.match(css,/\.catalog-filters\{display:flex;flex-wrap:wrap;overflow-x:visible/);
  assert.match(css,/\.catalog-filters \.filter-button\.is-featured/);
});
