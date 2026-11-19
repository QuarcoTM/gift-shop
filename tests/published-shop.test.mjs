import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {bake,productPage} from "../scripts/publish-store.mjs";
import {gallery} from "../store-ui.js";
const home=readFileSync("index.html","utf8");
test("holiday publication bakes the correct initial links and preserves other categories",()=>{
 const html=bake(home,"new_year");
 assert.match(html,/data-static-campaign="new_year"/);
 for(const [tag] of html.matchAll(/<a\b[^>]*\bdata-season-link\b[^>]*>/g))assert.match(tag,/category=nova-godina/);
 assert.match(html,/category=bebe/);
 assert.ok(html.indexOf('id="products"')<html.indexOf('id="collections"'));
});
test("shared pages identify the product and expose escaped metadata without running JS",()=>{
 const id="00000000-0000-4000-8000-000000000001";
 const page=productPage(readFileSync("product/index.html","utf8"),{id,name:'A & "B"',contents:"Cup",gift_product_images:[{image_url:"https://example.test/second",sort_order:1},{image_url:"https://example.test/main",sort_order:0}]},"https://shop.test/gifts/");
 assert.match(page,/og:title" content="A &amp; &quot;B&quot;/);assert.match(page,/og:image" content="https:\/\/example.test\/main"/);
 assert.ok(page.includes("https://shop.test/gifts/p/"+id+"/"));assert.ok(page.includes('data-product-id="'+id+'"'));assert.ok(page.includes('base href="../../"'));
});
test("gallery exposes every image with swipe targets, indexed controls and an enlargement dialog",()=>{
 const html=gallery([{image_url:"one"},{image_url:"two"}],"Box",v=>v,url=>'<img src="'+url+'">');
 assert.match(html,/data-enlarge="1"/);assert.match(html,/data-slide="1"/);assert.match(html,/<dialog/);
});
