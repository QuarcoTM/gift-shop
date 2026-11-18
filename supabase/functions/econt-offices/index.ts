// Public read-only Econt office directory, without customer data.
// Official source: https://ee.econt.com/services/Nomenclatures/NomenclaturesService.getOffices.json
// Do not accept arbitrary upstream URLs or store personal details.
const SOURCE = "https://ee.econt.com/services/Nomenclatures/NomenclaturesService.getOffices.json";
const HEADERS: Record<string,string> = {
  "Access-Control-Allow-Origin":"https://quarcotm.github.io",
  "Access-Control-Allow-Methods":"GET,OPTIONS",
  "Access-Control-Allow-Headers":"apikey,content-type",
  "Access-Control-Max-Age":"3600",
  "Vary":"Origin",
  "Content-Type":"application/json; charset=utf-8",
  "X-Content-Type-Options":"nosniff",
  "Cache-Control":"public, max-age=3600"
};
type Office = {id:string; name:string; address:string; city:string};
let cache: {at:number; offices:Office[]} | null = null;
function reply(value:unknown,status=200) {
  return new Response(JSON.stringify(value),{status,headers:HEADERS});
}
Deno.serve(async(request:Request)=>{
  if(request.method==="OPTIONS") return new Response(null,{status:204,headers:HEADERS});
  if(request.method!=="GET") return reply({error:"Method not allowed"},405);
  try {
    if(cache && Date.now()-cache.at < 24*60*60*1000)
      return reply({offices:cache.offices,source:"econt",cached:true});
    const upstream=await fetch(SOURCE,{
      headers:{"Accept":"application/json"},
      signal:AbortSignal.timeout(15000)
    });
    if(!upstream.ok) throw new Error("Upstream status: "+upstream.status);
    const data=await upstream.json();
    if(!Array.isArray(data?.offices))throw new Error("Invalid Econt response");
    const result = new Map<string,Office>();
    for(const item of data.offices){
      if(item?.isAPS===true || item?.isMPS===true)continue;
      if(item?.address?.city?.country?.code2 &&
         item.address.city.country.code2!=="BG")continue;
      const id=String(item?.code??"").trim();
      const name=String(item?.name??"").trim();
      const city=String(item?.address?.city?.name??"").trim();
      const address=String(item?.address?.fullAddress??"").trim();
      if(!/^[0-9a-zA-Z-]{1,30}$/.test(id) ||
         !name || !city || !address)continue;
      result.set(id,{id,name:name.slice(0,120),city:city.slice(0,100),address:address.slice(0,180)});
    }
    const offices=[...result.values()].sort((a,b)=>a.city.localeCompare(b.city,"bg")||a.name.localeCompare(b.name,"bg"));
    if(offices.length<100)throw new Error("Incomplete Econt office directory: "+offices.length);
    cache={at:Date.now(),offices};
    return reply({offices,source:"econt",cached:false});
  }catch(error){
    console.error("Econt office directory",String(error));
    if(cache?.offices.length)return reply({offices:cache.offices,source:"econt",cached:true,stale:true});
    return reply({error:"Списъкът на Еконт временно не е достъпен."},503);
  }
});
