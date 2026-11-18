import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
const boot = html.match(/<script id="instant-season-boot">([\s\S]*?)<\/script>/)?.[1];

class Element {
  constructor(attributes = {}) { this.attrs = {...attributes}; this.textContent=""; this.innerHTML=""; this.dataset={}; this.alt=""; this.src=""; }
  setAttribute(key,val){this.attrs[key]=String(val)}
  getAttribute(key){return this.attrs[key]??null}
  querySelector(key){return this.children?.[key]??null}
}

function firstPaint(selected, query="") {
  const url = "https://quarcotm.github.io/gift-shop/" + query;
  const links=Array.from({length:7},()=>new Element({href:"./collection/?category=koleda"}));
  const sections=new Map();
  for (const name of [
    ".announcement a",".desktop-nav .nav-season",".mobile-nav a:first-child",
    ".hero-actions .button-outline",".footer-nav a[data-season-link]",
    ".hero-copy h1",".hero-subtitle",".hero-image img",
    ".home-season-copy .eyebrow",".home-season-copy h2",
    ".home-season-copy p",".home-season-copy a",".home-season-image img"
  ])sections.set(name,new Element());
  const card=new Element();
  card.children={".collection-title":new Element(),".collection-number":new Element(),"img":new Element()};
  sections.set(".collections-grid .collection-card-large",card);
  const doc={
    baseURI:"https://quarcotm.github.io/gift-shop/",
    documentElement:{dataset:{campaign:"christmas",campaignReady:"true"}},
    querySelector(sel){return sections.get(sel)??null},
    querySelectorAll(sel){return sel==="a[data-season-link]"?links:[]}
  };
  const state={sabranoCampaign:selected};
  const history={state,replaceState(next,unused,relative){this.state=next;this.uri=relative;}};
  const location={href:url};
  assert.ok(boot);
  assert.doesNotMatch(boot,/fetch\(|localStorage|sessionStorage|XMLHttpRequest/);
  new Function("document","history","location","URL","console",boot)(doc,history,location,URL,console);
  return {doc,history,links,sections,card};
}

test("first paint is static active Christmas, without a loading screen",()=>{
  assert.match(html,/<html lang="bg" data-campaign="christmas" data-static-campaign="christmas" data-campaign-ready="true">/);
  assert.match(html,/<h1>Коледа, която/);
  assert.match(html,/src="\.\/assets\/images\/christmas\.webp"/);
  assert.doesNotMatch(html,/Visible failsafe/);
});

test("refresh of the same tab synchronously restores Easter without any network request",()=>{
  const p=firstPaint("easter");
  assert.equal(p.doc.documentElement.dataset.campaign,"easter");
  assert.match(p.sections.get(".hero-copy h1").innerHTML,/Великден/);
  assert.ok(p.sections.get(".hero-image img").src.endsWith("/assets/images/easter.webp"));
  assert.ok(p.card.children["img"].src.endsWith("/assets/images/easter.webp"));
  assert.ok(p.links.every(link=>link.getAttribute("href").endsWith("category=velikden")));
  assert.equal(p.history.state.sabranoCampaign,"easter");
});

test("admin preview query selects the current holiday on initial paint and cleans the address",()=>{
  const p=firstPaint("christmas","?campaign=valentine");
  assert.equal(p.doc.documentElement.dataset.campaign,"valentine");
  assert.match(p.sections.get(".hero-copy h1").innerHTML,/Любовта/);
  assert.ok(p.sections.get(".hero-image img").src.endsWith("/assets/images/valentine.webp"));
  assert.equal(p.history.uri,"/gift-shop/");
  assert.equal(p.history.state.sabranoCampaign,"valentine");
});
