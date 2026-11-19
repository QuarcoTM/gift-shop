import test from "node:test";
import assert from "node:assert/strict";
import {createServer} from "node:http";
import {readFile} from "node:fs/promises";
import {existsSync} from "node:fs";
import {resolve,extname} from "node:path";
import {execFile} from "node:child_process";
import {promisify} from "node:util";
const run=promisify(execFile);
const id="bca4b949-39c6-47cc-984d-4fa4c069e7ba";
function fixtures(id){
 const products=[1,2].map((n)=>({id:n===1?id:"other",name:"Комплект "+n,category_id:"cat",description:"",contents:"Чаша × 1",stock_quantity:3,price_eur:n*10,featured_slot:n,packed_photo:location.origin+"/assets/images/bulk.webp"}));
 const images=["bulk","hero"].map((file,i)=>({product_id:id,image_url:location.origin+"/assets/images/"+file+".webp",sort_order:i}));
 window.fetch=async(url,options)=>{
   const u=String(url);let data=[];
   if(u.includes("gift_products?"))data=products;
   if(u.includes("gift_categories?"))data=[{id:"cat",name:"Коледа",slug:"koleda"}];
   if(u.includes("gift_product_images?"))data=images;
   if(u.includes("store-publication.json"))data={ids:[id],campaign:"christmas"};
   if(u.includes("gift_ask_offer"))window.offer=JSON.parse(options.body);
   return {ok:true,json:async()=>data};
 };
}
async function checks(id){
 const $=s=>document.querySelector(s),all=s=>Array.from(document.querySelectorAll(s));
 const check=(ok,why)=>{if(!ok)throw Error(why)};
 try{
   const page=document.body.dataset.page;
   if(page==="product"){
     check(all(".gift-slide").length===2,"gallery");
     $("[data-slide='1']").click();check($(".gift-slides").scrollLeft>0,"swipe track");
     $("[data-enlarge='1']").click();check($("dialog.gift-lightbox").open,"zoom");
     $(".gift-lightbox button").click();check(!$(".gift-lightbox").open,"close");
     check($(".product-page-details li").textContent.includes("Чаша"),"contents");
     check($(".product-page-buttons").textContent.includes("Сподели"),"share");
   } else if(page==="products"){
     check(all(".product-card").length===2,"catalog");
     const select=$("#budget-filter");select.selectedIndex=1;select.dispatchEvent(new Event("change"));
     check(all(".product-card").length===1,"budget");
     $("#catalog-search").value="xxxxx";$("#catalog-search").dispatchEvent(new Event("input"));
     check($("#product-grid").textContent.includes("Няма резултати"),"empty search");
     $("[data-clear]").click();check(all(".product-card").length===2,"clear");
   } else if(page==="home"){
     check(all(".product-card").length===2,"featured");
     check(!$("#packed-story").hidden,"packaging");
     const frame=document.createElement("iframe");
     frame.style.cssText="width:320px;height:120px;border:0";
     document.body.append(frame);
     const layout=frame.contentDocument;
     const styles=layout.createElement("style");
     const sheet=$("link[href*='styles.css']").sheet;
     styles.textContent=Array.from(sheet.cssRules,rule=>rule.cssText).join("\n");
     layout.head.append(styles);
     layout.body.append(layout.importNode($("header"),true));
     for(const width of [320,390]){
       frame.style.width=width+"px";
       const header=frame.contentDocument.querySelector("header");
       const heart=header.querySelector(".favorites-trigger");
       check(new URL(heart.href).searchParams.get("favorites")==="1","favorites link");
       let previous=header.querySelector(".brand-image").getBoundingClientRect();
       for(const control of header.querySelectorAll(".header-tools .icon-button")){
         const rect=control.getBoundingClientRect();
         check(rect.width>=24 && rect.left>=previous.right-1 && rect.right<=width,"header at "+width+"px: "+control.getAttribute("aria-label"));
         previous=rect;
       }
     }
     frame.remove();
   } else if(page==="cart"){
     check($("#cart-page-items").textContent.includes("Комплект 1"),"transferred gift");
     check($("#cart-page-total").textContent.includes("20"),"transferred quantity");
     check(!location.hash.includes("selection"),"clean cart address");
   } else {
     const f=$("#offer-form");for(const [name,v] of Object.entries({quantity:"18",budget:"8",needed_on:"2099-01-01",contact:"example@example.invalid"}))f.elements[name].value=v;
     f.requestSubmit();await new Promise(r=>setTimeout(r,40));
     check(window.offer?.p_quantity===18 && f.innerText.includes("Получихме"),"offer");
   }
   if(["home","products","product"].includes(page)){
     const button=$("[data-add]");
     button.focus();button.click();
     const panel=$("#added-gift");
     check(panel.open && panel.querySelector("[data-added-name]").textContent==="Комплект 1","added dialog");
     check(panel.querySelector(".added-photo img") && panel.querySelector("[data-added-quantity]").textContent.startsWith("1 бр."),"quantity and photo");
     const cartLink=panel.querySelector("[data-open-cart]");
     check(new URL(cartLink.href).pathname==="/cart/" && decodeURIComponent(new URL(cartLink.href).hash).includes(id+":1"),"in-memory cart link");
     panel.querySelector(".added-continue").click();check(!panel.open && document.activeElement===button,"resume shopping");
     button.click();check(panel.querySelector("[data-added-total]").textContent.includes("20") && panel.querySelector("[data-added-quantity]").textContent.startsWith("2 бр."),"updated subtotal");
     panel.close();
   }
   document.querySelector("#result").textContent="CHECK_OK";
 }catch(e){document.querySelector("#result").textContent="FAIL "+e.message}
}
test("mobile and desktop storefront with a private fixture catalog",async()=>{
 const browser=["/usr/bin/google-chrome","/usr/bin/google-chrome-stable","/usr/bin/chromium"].find(existsSync);
 const root=process.cwd();
 const server=createServer(async(req,res)=>{
  try{
   let path=decodeURIComponent(new URL(req.url,"http://localhost").pathname);
   if(path.endsWith("/"))path+="index.html";
   const file=resolve(root,"."+path);
   if(!file.startsWith(root+"/"))throw Error();
   let body=await readFile(file);
   if(path.endsWith(".html")){
     body=body.toString().replace("</head>","<script>("+fixtures.toString()+")("+JSON.stringify(id)+");</script></head>").replace("</body>",'<output id="result"></output><script>addEventListener("load",()=>setTimeout(()=>('+checks.toString()+')('+JSON.stringify(id)+'),200))</script></body>');
   }
   res.writeHead(200,{"Content-Type":({".html":"text/html; charset=utf-8",".js":"text/javascript",".css":"text/css",".webp":"image/webp",".avif":"image/avif"})[extname(path)]||"application/octet-stream"});res.end(body);
  }catch{res.writeHead(404);res.end()}
 });
 await new Promise((done,reject)=>{server.once("error",reject);server.listen(0,"127.0.0.1",done)});
 try{
  const base="http://127.0.0.1:"+server.address().port;
  for(const [width,path] of [[390,"/"],[390,"/product/?id="+id],[1366,"/product/?id="+id],[390,"/products/"],[390,"/cart/#selection="+id+"%3A2"],[1366,"/bulk/"]]){
    const {stdout}=await run(browser,["--headless","--no-sandbox","--disable-dev-shm-usage","--disable-gpu","--window-size="+width+",900","--virtual-time-budget=2000","--dump-dom",base+path],{timeout:25000,maxBuffer:2e6});
    assert.equal(stdout.match(/<output id="result">([^<]*)</)?.[1],"CHECK_OK",path);
  }
 }finally{server.close()}
});
