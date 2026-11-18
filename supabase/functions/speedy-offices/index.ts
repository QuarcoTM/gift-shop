// Speedy office directory proxy. Public information, no customer data.
// Source: https://services.speedy.bg/office_locator_widget_v2/offices_list.php?lang=bg
// The official HTML directory is converted into a minimal JSON office list.
// Never accept arbitrary upstream URLs or persist checkout/customer data here.
const SPEEDY_SOURCE="https://services.speedy.bg/office_locator_widget_v2/offices_list.php?lang=bg";
const ORIGIN="https://quarcotm.github.io";
const HEADERS={
  "Access-Control-Allow-Origin":ORIGIN,
  "Access-Control-Allow-Methods":"GET,OPTIONS",
  "Access-Control-Allow-Headers":"apikey,content-type",
  "Access-Control-Max-Age":"3600",
  "Vary":"Origin",
  "Content-Type":"application/json; charset=utf-8",
  "X-Content-Type-Options":"nosniff",
  "Cache-Control":"public,max-age=1800"
};
type Office={id:string,name:string,address:string};
let cache:{timestamp:number,offices:Office[]}|null=null;
function decodeEntities(text:string):string {
  const named:Record<string,string>={
    nbsp:" ",amp:"&",quot:'"',apos:"'",lt:"<",gt:">",ndash:"–",mdash:"—",bull:"•"
  };
  return text.replace(/&(#x[0-9a-f]+|#[0-9]+|[a-zA-Z]+);/gi,(matched,entity:string)=>{
    if(entity[0]==="#"){
      const hex=entity[1]?.toLowerCase()==="x";
      const n=parseInt(entity.slice(hex?2:1),hex?16:10);
      return Number.isFinite(n)&&n>0&&n<=0x10ffff?String.fromCodePoint(n):"";
    }
    return named[entity.toLowerCase()]??matched;
  });
}
export function parseSpeedyOffices(html:string):Office[]{
  // The public directory renders each location as a heading with [ID],
  // followed by a line starting "Адрес:". Strip markup to normalized lines.
  const lines=decodeEntities(html)
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,"")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi,"")
    .replace(/<(?:br|hr)\s*\/?>/gi,"\n")
    .replace(/<\/(?:p|div|li|tr|h[1-6]|section|article)>/gi,"\n")
    .replace(/<[^>]+>/g," ")
    .replace(/\r/g,"\n")
    .split("\n")
    .map(line=>line.replace(/\s+/g," ").trim()).filter(Boolean);
  const result=new Map<string,Office>();
  for(let i=0;i<lines.length;i++){
    const match=lines[i].match(/^(.{2,150}?)\s*\[([0-9]{1,7})\]\s*$/);
    if(!match)continue;
    const name=match[1].trim();
    const id=match[2];
    if(/\(АВТОМАТ\)|\bLOCKER\b/i.test(name))continue;
    let address="";
    for(let n=i+1;n<Math.min(i+5,lines.length);n++){
      if(/^Адрес\s*:/i.test(lines[n])){
        address=lines[n].replace(/^Адрес\s*:\s*/i,"").trim();
        break;
      }
      if(/\[[0-9]{1,7}\]$/.test(lines[n]))break;
    }
    if(!address||address.length>240)continue;
    result.set(id,{id,name:name.slice(0,150),address:address.slice(0,220)});
  }
  return [...result.values()].sort((a,b)=>a.name.localeCompare(b.name,"bg"));
}
function json(body:unknown,status=200):Response{
  return new Response(JSON.stringify(body),{status,headers:HEADERS});
}
Deno.serve(async(req:Request):Promise<Response>=>{
  if(req.method==="OPTIONS")return new Response(null,{status:204,headers:HEADERS});
  if(req.method!=="GET")return json({error:"Method not allowed"},405);
  try{
    if(cache&&Date.now()-cache.timestamp<6*60*60*1000){
      return json({offices:cache.offices,source:"speedy",cached:true});
    }
    const response=await fetch(SPEEDY_SOURCE,{
      headers:{"Accept":"text/html","User-Agent":"SabranoGiftShop/1.0 (public office list)"},
      signal:AbortSignal.timeout(10000)
    });
    if(!response.ok)throw new Error("Upstream status "+response.status);
    const bytes=await response.arrayBuffer();
    if(bytes.byteLength<3000||bytes.byteLength>6_000_000)throw new Error("Unexpected source size");
    const charset=/charset=([^;\s]+)/i.exec(response.headers.get("content-type")??"")?.[1];
    const html=new TextDecoder(charset||"utf-8",{fatal:false}).decode(bytes);
    const offices=parseSpeedyOffices(html);
    if(offices.length<50)throw new Error("Unexpected office directory format: "+offices.length);
    cache={timestamp:Date.now(),offices};
    return json({offices,source:"speedy",cached:false});
  }catch(error){
    console.error("Speedy directory retrieval",String(error));
    if(cache&&cache.offices.length)return json({offices:cache.offices,source:"speedy",cached:true,stale:true});
    return json({error:"Списъкът на Спиди временно не е достъпен. Можеш да въведеш офиса ръчно."},503);
  }
});
