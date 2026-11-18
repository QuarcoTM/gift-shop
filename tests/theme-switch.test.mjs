import test from "node:test";
import assert from "node:assert/strict";

test("active holiday switches actual headlines, category links and local pictures", async () => {
  const base = "https://quarcotm.github.io/gift-shop/";
  const selectors = new Map();
  const classes = [];
  const eventListeners = new Map();
  class Element {
    constructor() { this.dataset={}; this.hidden=false; this.innerHTML=""; this.textContent=""; this.attributes={}; this.children=new Map(); }
    setAttribute(name,value){this.attributes[name]=String(value);}
    getAttribute(name){return this.attributes[name] ?? null;}
    querySelector(name){return this.children.get(name) ?? null;}
    querySelectorAll(){return [];}
    addEventListener(name,fn){eventListeners.set(name,fn);}
    append(){}
  }
  class Link extends Element {
    constructor(href){super();this.setAttribute("href",href)}
    get href(){return new URL(this.getAttribute("href"),base).href}
    set href(value){this.setAttribute("href",value)}
  }
  class Img extends Element{
    constructor(){super();this.src=base+"assets/images/christmas.svg"}
  }
  const textElements=[
    ".desktop-nav .nav-season",".mobile-nav a:first-child",".announcement a",
    ".hero-actions .button-outline",".hero-subtitle",".home-season-copy .eyebrow",
    ".home-season-copy p",".home-season-copy a"
  ];
  for(const sel of textElements) selectors.set(sel,new Element());
  selectors.set(".hero-copy h1",new Element());
  const heroImg=new Img(), cardImg=new Img(), seasonImg=new Img();
  selectors.set(".hero-image img",heroImg);
  selectors.set(".home-season-image img",seasonImg);
  selectors.set(".home-season",new Element());
  selectors.set(".home-season-copy h2",new Element());
  selectors.set(".home-season-image",new Element());
  const card=new Element();
  card.children.set("img",cardImg);
  card.children.set(".collection-title",new Element());
  card.children.set(".collection-number",new Element());
  const links=[
    new Link("./collection/?category=koleda"),
    new Link("./collection/?category=koleda"),
    new Link("./collection/?category=koleda")
  ];
  selectors.set(".footer-nav a[data-season-link]",links[2]);
  const footer=new Element();
  footer.querySelector=(selector)=>null;
  selectors.set(".footer-bottom",footer);
  const page={
    documentElement:{dataset:{}},
    baseURI:base,
    body:{append(){}},
    visibilityState:"visible",
    querySelector:(sel)=>selectors.get(sel)??null,
    querySelectorAll:(sel)=>{
      if(sel==="a[href*=\"category=koleda\"]")return links.filter(x=>x.getAttribute("href").includes("category=koleda"));
      if(sel==="a[data-season-link]")return links.filter(x=>x.dataset.seasonLink==="true");
      if(sel===".collections-grid .collection-card-large")return [card];
      return [];
    },
    createElement:()=>new Element(),
    addEventListener(){}
  };
  globalThis.document=page;
  globalThis.window={
    location:{pathname:"/gift-shop/"},
    addEventListener(name,fn){eventListeners.set("window:"+name,fn)},
    dispatchEvent(){}
  };
  globalThis.localStorage={getItem:()=>null,removeItem(){},setItem(){}};
  globalThis.sessionStorage={getItem:()=>null,removeItem(){},setItem(){}};
  globalThis.CustomEvent=class{constructor(name,init){this.type=name;this.detail=init?.detail}};
  class Channel {
    constructor(name){this.name=name;Channel.current=this}
    addEventListener(name,fn){this.messageHandler=fn}
  }
  globalThis.BroadcastChannel=Channel;
  const response=(active_campaign)=>({ok:true,json:async()=>[{active_campaign}]});
  globalThis.fetch=async()=>response("easter");
  const { initSiteFeatures } = await import("../site-features.js");
  initSiteFeatures({onCampaign(){}});
  await new Promise((resolve)=>setTimeout(resolve,0));

  assert.equal(page.documentElement.dataset.campaign,"easter");
  assert.match(selectors.get(".hero-copy h1").innerHTML,/Великден/);
  assert.match(selectors.get(".desktop-nav .nav-season").textContent,/Великден/);
  assert.ok(heroImg.src.endsWith("/assets/images/easter.svg"));
  assert.ok(cardImg.src.endsWith("/assets/images/easter.svg"));
  assert.ok(seasonImg.src.endsWith("/assets/images/easter.svg"));
  assert.ok(links.every(x=>x.href.includes("category=velikden")));
  assert.match(card.children.get(".collection-title").innerHTML,/Великден/);

  Channel.current.messageHandler({data:{type:"campaign-changed",key:"valentine"}});
  assert.equal(page.documentElement.dataset.campaign,"valentine");
  assert.match(selectors.get(".hero-copy h1").innerHTML,/Любовта/);
  assert.ok(heroImg.src.endsWith("/assets/images/valentine.svg"));
  assert.ok(links.every(x=>x.href.includes("category=sveti-valentin")));
});
