/**
 * Courier office chooser.
 * Econt retains its official iframe map with origin-checked postMessage.
 * Speedy uses a searchable inline office dropdown populated on demand from
 * its official public office directory through our read-only Edge proxy.
 * Neither third-party source is fetched before the visitor opens it.
 */
export const ECONT_MAP_ORIGIN = "https://officelocator.econt.com";
export const SPEEDY_OFFICES_URL = "https://services.speedy.bg/office_locator_widget_v2/offices_list.php?lang=bg";
export const SPEEDY_OFFICES_ENDPOINT = "https://ycsjfsoijafepgslzzlz.supabase.co/functions/v1/speedy-offices";
export const ECONT_OFFICES_ENDPOINT = "https://ycsjfsoijafepgslzzlz.supabase.co/functions/v1/econt-offices";

export function getOfficeMapURL(courier, city = "", shopURL = "") {
  if (courier !== "econt") return ""; // No map for Speedy.
  const url = new URL(ECONT_MAP_ORIGIN + "/");
  url.searchParams.set("shopUrl", shopURL || "https://quarcotm.github.io/gift-shop/");
  if (city && city.trim()) url.searchParams.set("city", city.trim().slice(0,100));
  url.searchParams.set("officeType","office");
  url.searchParams.set("lang","bg");
  return url.href;
}

export function readEcontSelection(event, expectedSource) {
  if (!event || event.origin !== ECONT_MAP_ORIGIN || !expectedSource || event.source !== expectedSource) return null;
  const selected = event.data?.office;
  if (!selected || typeof selected !== "object" || Array.isArray(selected)) return null;
  if (selected.isAPS === true || selected.isMPS === true) return null;
  const city = selected.address?.city?.name;
  const address = selected.address?.fullAddress;
  const name = selected.name;
  const code = selected.code;
  if (typeof code !== "string" && typeof code !== "number") return null;
  if (typeof name !== "string" || !name.trim()) return null;
  if (typeof city !== "string" || !city.trim()) return null;
  const safeCode = String(code).trim().slice(0,30);
  if (!/^[a-zA-Z0-9-]{1,30}$/.test(safeCode)) return null;
  const safeCity = city.trim().slice(0,100);
  const safeName = name.trim().replace(/\s+/g," ").slice(0,75);
  const safeAddress = typeof address === "string" ? address.trim().replace(/\s+/g," ").slice(0,130) : "";
  return {
    city: safeCity,
    location: ("Еконт офис " + safeCode + " — " + safeName + (safeAddress ? ", " + safeAddress : "")).slice(0,220)
  };
}

const normalize = (text) => String(text || "").trim().toLocaleLowerCase("bg-BG");

export function filterSpeedyOffices(offices, query = "", limit = 50) {
  if (!Array.isArray(offices)) return [];
  const words = normalize(query).split(/\s+/).filter(Boolean);
  return offices.filter((item) =>
    item && typeof item.id === "string" && /^[0-9]{1,7}$/.test(item.id) &&
    typeof item.name === "string" && typeof item.address === "string" &&
    !/\(АВТОМАТ\)/i.test(item.name) &&
    words.every((word)=>normalize(item.name + " " + item.address + " " + item.id).includes(word))
  ).slice(0, limit);
}

export function cityForSpeedyOffice(office) {
  const address = String(office?.address || "");
  const named = address.match(/^(?:гр\.|с\.)\s*([^[]+?)\s*(?:\[[0-9]{4}\]|ул\.|бул\.|жк|кв\.|пл\.)/i);
  const fromName = String(office?.name||"").split(" - ")[0].replace(/\s*\([^)]*\)\s*$/,"").trim();
  const source = (named?.[1] || fromName).trim();
  return source.replace(/(^|\s)(\S)/g,(_,space,char)=>space+char.toUpperCase())
    .slice(0,100);
}


/** Shared, city-driven office dropdown for both couriers. */
export function initOfficePicker(form) {
  if (!form) return;
  const $=(selector)=>document.querySelector(selector);
  const courier=form.elements.courier;
  const deliveryType=form.elements.delivery_type;
  const city=form.elements.delivery_city;
  const address=form.elements.delivery_location;
  const locationLabel=$("#checkout-location-label");
  const tools=$("#checkout-office-tools");
  const launcher=$("#checkout-office-picker");
  const selected=$("#checkout-office-selected");
  const panel=$("#checkout-office-panel");
  const feedback=$("#checkout-office-feedback");
  const options=$("#checkout-office-options");
  const fallback=$("#checkout-office-fallback");
  const manual=$("#checkout-office-manual");
  const fallbackLink=$("#checkout-office-fallback-link");
  const mapFallback=$("#checkout-office-map-fallback");
  const dialog=$("#checkout-office-dialog");
  const iframe=$("#checkout-office-map");
  const external=$("#checkout-office-external");
  const instructions=$("#checkout-office-instructions");
  if(!courier || !deliveryType || !city || !address || !locationLabel ||
     !tools || !launcher || !selected || !panel || !feedback || !options ||
     !fallback || !manual || !fallbackLink || !mapFallback || !dialog || !iframe)return;

  const directory={speedy:null,econt:null};
  const loading={speedy:null,econt:null};
  const endpoints={speedy:SPEEDY_OFFICES_ENDPOINT,econt:ECONT_OFFICES_ENDPOINT};
  const normalizeCity=(value)=>normalize(value).replace(/^(?:гр\.|с\.)\s*/,"").replace(/\s+/g," ");
  let settingOffice=false;

  function closePanel(){
    panel.hidden=true;
    launcher.setAttribute("aria-expanded","false");
  }
  function closeMap(){
    if(dialog.open && typeof dialog.close==="function")dialog.close();
    iframe.removeAttribute("src");
  }
  function clearOffice(){
    address.value="";
    delete address.dataset.selectedOfficeId;
    delete address.dataset.selectedCourier;
    selected.hidden=true;
    selected.textContent="";
  }
  function showManual(){
    clearOffice();
    address.type="text";
    address.required=true;
    locationLabel.hidden=false;
    locationLabel.firstChild.textContent="Офис на куриера ";
    address.placeholder="Напиши името или адреса на офиса";
    closePanel();
    address.focus();
  }
  function showFallback(show){
    fallback.hidden=!show;
    if(show){
      fallbackLink.href=courier.value==="speedy" ? SPEEDY_OFFICES_URL : ECONT_MAP_ORIGIN+"/";
      fallbackLink.textContent=courier.value==="speedy" ? "Официален списък на Спиди" : "Официални офиси на Еконт";
      mapFallback.hidden=courier.value!=="econt";
    }
  }
  function refreshFields(){
    const toOffice=deliveryType.value==="office";
    clearOffice();
    closePanel();
    closeMap();
    tools.hidden=!toOffice;
    locationLabel.hidden=toOffice;
    address.type=toOffice?"hidden":"text";
    address.required=!toOffice;
    address.placeholder=toOffice?"":"Улица, номер, вход, апартамент";
    locationLabel.firstChild.textContent=toOffice?"Офис на куриера ":"Точен адрес ";
    showFallback(false);
  }
  function pick(office){
    settingOffice=true;
    const isSpeedy=courier.value==="speedy";
    city.value=isSpeedy?cityForSpeedyOffice(office):office.city;
    address.value=(isSpeedy
      ? "Спиди офис "+office.id+" — "+office.name+", "+office.address
      : "Еконт офис "+office.id+" — "+office.name+", "+office.address).slice(0,220);
    address.dataset.selectedOfficeId=office.id;
    address.dataset.selectedCourier=courier.value;
    selected.textContent="Избран офис: "+office.name+" · № "+office.id;
    selected.hidden=false;
    settingOffice=false;
    address.dispatchEvent(new Event("input",{bubbles:true}));
    closePanel();
    launcher.focus({preventScroll:true});
  }
  function render(){
    options.replaceChildren();
    showFallback(false);
    const courierKey=courier.value;
    const entered=normalizeCity(city.value);
    if(!entered){
      feedback.textContent="Първо въведи населено място в полето по-горе.";
      return;
    }
    const items=directory[courierKey];
    if(!Array.isArray(items)){
      feedback.textContent="Зареждане на офисите…";
      return;
    }
    const cityOf=(office)=>normalizeCity(courierKey==="speedy"?cityForSpeedyOffice(office):office.city);
    let matches=items.filter(item=>cityOf(item)===entered);
    if(!matches.length && entered.length>=3)matches=items.filter(item=>cityOf(item).startsWith(entered));
    matches=matches.slice(0,300);
    if(!matches.length){
      feedback.textContent="Няма намерени офиси за това населено място. Провери изписването.";
      showFallback(true);
      return;
    }
    feedback.textContent="Намерени "+matches.length+" офиса. Избери от списъка:";
    for(const entry of matches){
      const option=document.createElement("button");
      option.type="button";
      option.className="checkout-office-option";
      option.setAttribute("role","option");
      const name=document.createElement("strong");
      name.textContent=entry.name+" · № "+entry.id;
      const details=document.createElement("small");
      details.textContent=entry.address;
      option.append(name,details);
      option.addEventListener("click",()=>pick(entry));
      options.append(option);
    }
  }
  async function load(courierKey){
    if(directory[courierKey]){render();return;}
    if(loading[courierKey])return loading[courierKey];
    feedback.textContent="Зареждане на офисите…";
    loading[courierKey]=(async()=>{
      try{
        const response=await fetch(endpoints[courierKey],{
          method:"GET",mode:"cors",cache:"default",signal:AbortSignal.timeout(15000)
        });
        if(!response.ok)throw Error("Office directory: "+response.status);
        const result=await response.json();
        if(!Array.isArray(result?.offices) || result.offices.length<1)
          throw Error("Invalid office directory response");
        directory[courierKey]=result.offices;
        if(!panel.hidden && courier.value===courierKey)render();
      }catch(error){
        console.warn("Courier office directory unavailable:",error);
        if(!panel.hidden && courier.value===courierKey){
          options.replaceChildren();
          feedback.textContent="Списъкът временно не е достъпен. Можеш да въведеш офиса ръчно.";
          showFallback(true);
        }
      }finally{loading[courierKey]=null}
    })();
    return loading[courierKey];
  }
  function openFallbackMap(){
    if(courier.value!=="econt" || deliveryType.value!=="office")return;
    const url=getOfficeMapURL("econt",city.value,new URL("./",document.baseURI).href);
    $("#checkout-office-dialog-title").textContent="Офиси на Еконт";
    if(instructions)instructions.textContent="Избери офис от картата, за да се попълнят данните автоматично.";
    if(external)external.href=url;
    iframe.title="Официална карта на офисите на Еконт";
    iframe.src=url;
    if(typeof dialog.showModal==="function")dialog.showModal();
    else dialog.setAttribute("open","");
  }

  launcher.addEventListener("click",()=>{
    if(deliveryType.value!=="office")return;
    if(!courier.value){courier.focus();return;}
    if(!city.value.trim()){city.focus();city.reportValidity();return;}
    if(!panel.hidden){closePanel();return;}
    panel.hidden=false;
    launcher.setAttribute("aria-expanded","true");
    if(directory[courier.value])render();else load(courier.value);
    panel.scrollIntoView({block:"nearest",behavior:"smooth"});
  });
  manual.addEventListener("click",showManual);
  mapFallback.addEventListener("click",openFallbackMap);
  city.addEventListener("input",()=>{
    if(settingOffice)return;
    clearOffice();
    if(!panel.hidden)render();
  });
  courier.addEventListener("change",refreshFields);
  deliveryType.addEventListener("change",refreshFields);
  $("#checkout-office-close")?.addEventListener("click",closeMap);
  $("#checkout-office-done")?.addEventListener("click",closeMap);
  dialog.addEventListener("click",(event)=>{if(event.target===dialog)closeMap()});
  dialog.addEventListener("close",()=>iframe.removeAttribute("src"));
  window.addEventListener("message",(event)=>{
    if(!dialog.open || courier.value!=="econt" || deliveryType.value!=="office")return;
    const chosen=readEcontSelection(event,iframe.contentWindow);
    if(!chosen)return;
    settingOffice=true;
    city.value=chosen.city;
    address.value=chosen.location;
    address.type="hidden";
    address.required=false;
    locationLabel.hidden=true;
    address.dataset.selectedOfficeId="econt-map";
    address.dataset.selectedCourier="econt";
    selected.textContent="Избран офис: "+chosen.location;
    selected.hidden=false;
    settingOffice=false;
    closeMap();
    closePanel();
    launcher.focus({preventScroll:true});
  });
  refreshFields();
}
