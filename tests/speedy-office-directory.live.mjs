// One-time live check for public Speedy office directory, not a checkout order.
const url="https://ycsjfsoijafepgslzzlz.supabase.co/functions/v1/speedy-offices";
const response=await fetch(url,{signal:AbortSignal.timeout(20000)});
const body=await response.text();
console.log("Speedy office proxy status:",response.status,"bytes:",body.length);
if(!response.ok){console.error(body.slice(0,700));process.exit(1);}
let data;
try{data=JSON.parse(body)}catch{throw Error("Invalid office directory JSON");}
const offices=data.offices;
if(!Array.isArray(offices)||offices.length<50)throw Error("Too few offices in official source: "+(offices?.length??"unknown"));
const kyustendil=offices.filter(o=>(o.name+" "+o.address).toLocaleLowerCase("bg-BG").includes("кюстендил"));
console.log("Total real Speedy offices:",offices.length);
console.log("Kyustendil count:",kyustendil.length);
console.log("Kyustendil examples:",JSON.stringify(kyustendil.slice(0,4)));
if(!kyustendil.length)throw Error("No Kyustendil offices from current official source");
if(!offices.every(o=>/^[0-9]{1,7}$/.test(o.id)&&o.address&&o.name&&!/\(АВТОМАТ\)/.test(o.name)))throw Error("Invalid office records");
console.log("SPEEDY_OFFICE_DIRECTORY_OK");
