import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL("../" + path, import.meta.url), "utf8");
const pages = [
  "index.html", "about/index.html", "bulk/index.html", "contact/index.html",
  "collection/index.html", "collections/index.html", "products/index.html",
  "product/index.html", "cart/index.html", "privacy/index.html",
  "cookies/index.html", "order/index.html"
];
const clientCopy = ["campaigns.js", "app.js", "site-features.js"];
const unwanted = [
  /най-хубавите изненади често са събрани/i,
  /няколко (малки|внимателно подбрани|добре подбрани) (неща|предмета)/i,
  /съчетаваме ги така/i,
  /малки изненади, събрани в нещо специално/i,
  /малки неща, подбрани с повече сърце/i,
  /малките неща се помнят/i,
  /радостта е в<br\s*\/><em>малките неща/i,
  /подбрано с обич/i,
  /коледа,<br\s*\/>събрана с обич/i
];
test("All public pages and campaign variants sell complete gifts, not assemblies of objects", () => {
  for (const path of [...pages, ...clientCopy]) {
    const content = read(path);
    for (const pattern of unwanted) assert.doesNotMatch(content, pattern, path + " contains old marketing copy");
  }
});
test("About page tells a customer-facing story, without describing product assembly", () => {
  const about = read("about/index.html");
  assert.match(about, /За моментите,/);
  assert.match(about, /Красивото представяне/);
  assert.doesNotMatch(about, /добре подбрани предмета|Съчетаваме ги/);
});
test("Seasonal copy is updated in both static HTML and the campaign module", () => {
  const home = read("index.html");
  const campaigns = read("campaigns.js");
  const categories = read("collections/index.html");
  assert.match(home, /Подаръци, които оставят впечатление/);
  assert.match(campaigns, /Подаръци, които оставят впечатление/);
  assert.match(home, /Коледа,<br \/>с много обич/);
  assert.match(categories, /Коледа,<br \/>с много обич/);
  for (const path of pages.filter(x=>x!=="order/index.html"))
    assert.match(read(path), /app\.js\?v=20261119-store/, "Refresh the storefront module on " + path);
});
