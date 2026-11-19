// Generate the static first paint and crawler-readable cards from public catalog data.
import {readFile,writeFile,mkdir,readdir,rm} from "node:fs/promises";
import {pathToFileURL} from "node:url";
import {config} from "../site-config.js";
import {CAMPAIGNS} from "../campaigns.js";

const escape=value=>String(value??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"})[c]);
const uuid=/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;
export function bake(html,key){
  if(!Object.hasOwn(CAMPAIGNS,key))throw Error("Unknown campaign");
  return html.replace(/data-(?:static-)?campaign="[^"]+"/g,match=>match.replace(/"[^"]+"/,'"'+key+'"'))
    .replace(/<a\b[^>]*\bdata-season-link\b[^>]*>/g,tag=>tag.replace(/href="[^"]*"/,'href="./collection/?category='+CAMPAIGNS[key].slug+'"'));
}
export function productPage(template,p,origin) {
  if(!uuid.test(p.id))throw Error("Invalid product ID");
  const url=new URL("p/"+p.id+"/",origin).href,title=escape(p.name+" | За усмивка.");
  const description=escape((p.contents||p.description||p.name).trim().slice(0,230));
  const image=p.gift_product_images.filter(i=>/^https:\/\//i.test(i.image_url)).sort((a,b)=>a.sort_order-b.sort_order)[0];
  return template.replace('<base href="../"','<base href="../../"').replace('<body data-page="product"','<body data-page="product" data-product-id="'+p.id+'"')
    .replace(/<title>.*?<\/title>/,()=>'<title>'+title+'</title>')
    .replace(/<link rel="canonical" href="[^"]+"/,()=>'<link rel="canonical" href="'+escape(url)+'"')
    .replace(/<meta property="og:[^"]+"[^>]+>\s*/g,"")
    .replace(/<meta name="description"[^>]+>/,()=>'<meta name="description" content="'+description+'" />\n'+
      Object.entries({"og:type":"product","og:title":title,"og:description":description,"og:url":escape(url),...(image?{"og:image":escape(image.image_url)}:{})})
        .map(([key,value])=>'<meta property="'+key+'" content="'+value+'">').join("\n"));
}
async function rows(query) {
  const result=await fetch(config.supabaseUrl+"/rest/v1/"+query,{headers:{apikey:config.supabasePublishableKey},signal:AbortSignal.timeout(20000)});
  if(!result.ok)throw Error("Publication read failed: "+result.status);
  return result.json();
}
async function publish(){
  const [settings]=await rows("gift_shop_settings?select=active_campaign&id=eq.main");
  const key=settings.active_campaign;
  const dirs=(await readdir(".",{withFileTypes:true})).filter(d=>d.isDirectory()&&!d.name.startsWith("."));
  const files=["index.html"];
  for(const d of dirs){if((await readdir(d.name)).includes("index.html"))files.push(d.name+"/index.html")}
  for(const file of files){
    const old=await readFile(file,"utf8"),next=bake(old,key);
    if(next!==old)await writeFile(file,next);
  }
  const products=[];
  for(let offset=0;;offset+=200){
    const batch=await rows("gift_products?select=id,name,contents,description,gift_product_images(image_url,sort_order),gift_categories!inner(is_active)&is_published=eq.true&gift_categories.is_active=eq.true&order=id&limit=200&offset="+offset);
    products.push(...batch);if(batch.length<200)break;
  }
  const template=await readFile("product/index.html","utf8");
  const origin=new URL("../",template.match(/rel="canonical" href="([^"]+)"/)[1]).href;
  const ids=products.map(p=>p.id);
  await mkdir("p",{recursive:true});
  for(const p of products){
    const html=productPage(template,p,origin);
    await mkdir("p/"+p.id,{recursive:true});await writeFile("p/"+p.id+"/index.html",html);
  }
  for(const entry of await readdir("p"))if(uuid.test(entry)&&!ids.includes(entry))await rm("p/"+entry,{recursive:true});
  await writeFile("store-publication.json",JSON.stringify({campaign:key,ids})+"\n");
}
if(process.argv[1] && import.meta.url===pathToFileURL(process.argv[1]).href)await publish();
