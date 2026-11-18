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

export function initOfficePicker(form) {
  if (!form) return;
  const $ = (selector) => document.querySelector(selector);
  const dialog = $("#checkout-office-dialog");
  const iframe = $("#checkout-office-map");
  const launcher = $("#checkout-office-picker");
  const launcherLabel = $("#checkout-office-picker-label");
  const closer = $("#checkout-office-close");
  const done = $("#checkout-office-done");
  const external = $("#checkout-office-external");
  const instructions = $("#checkout-office-instructions");
  const tools = $("#checkout-office-tools");
  const hint = $("#checkout-office-hint");
  const locationLabel = $("#checkout-location-label");
  const speedyPanel = $("#checkout-speedy-panel");
  const speedySearch = $("#checkout-speedy-search");
  const speedyOptions = $("#checkout-speedy-options");
  const speedyFeedback = $("#checkout-speedy-feedback");
  const city = form.elements.delivery_city;
  const address = form.elements.delivery_location;
  const courier = form.elements.courier;
  const deliveryType = form.elements.delivery_type;
  if (!dialog || !iframe || !launcher || !external || !tools || !speedyPanel ||
      !speedySearch || !speedyOptions || !speedyFeedback ||
      !city || !address || !courier || !deliveryType) return;
  let offices = null;
  let fetchInFlight = null;

  function closeMap() {
    if (dialog.open && typeof dialog.close === "function") dialog.close();
    iframe.removeAttribute("src");
    launcher.setAttribute("aria-expanded","false");
  }
  function closeSpeedy() {
    speedyPanel.hidden = true;
    launcher.setAttribute("aria-expanded","false");
  }
  function renderSpeedy() {
    speedyOptions.replaceChildren();
    if (!Array.isArray(offices)) return;
    const term = speedySearch.value.trim() || city.value.trim();
    if (!term) {
      speedyFeedback.textContent = "Напиши населено място или адрес на офиса в търсачката, за да видиш предложения.";
      return;
    }
    const matches = filterSpeedyOffices(offices,term,50);
    speedyFeedback.textContent = matches.length
      ? "Намерени " + matches.length + (matches.length === 50 ? " или повече" : "") + " офиса. Избери един от списъка:"
      : "Няма намерени офиси. Опитай с друго населено място или улица.";
    for(const entry of matches){
      const option = document.createElement("button");
      option.type="button";
      option.className="checkout-speedy-option";
      option.setAttribute("role","option");
      option.setAttribute("aria-selected","false");
      const title=document.createElement("strong");
      title.textContent=entry.name + " · № " + entry.id;
      const detail=document.createElement("small");
      detail.textContent=entry.address;
      option.append(title,detail);
      option.addEventListener("click",()=>{
        city.value=cityForSpeedyOffice(entry);
        address.value=("Спиди офис " + entry.id + " — " + entry.name + ", " + entry.address).slice(0,220);
        address.dataset.speedyOfficeId=entry.id;
        city.dispatchEvent(new Event("input",{bubbles:true}));
        address.dispatchEvent(new Event("input",{bubbles:true}));
        if (launcherLabel) launcherLabel.textContent="Промени избрания офис";
        closeSpeedy();
        address.focus();
      });
      speedyOptions.append(option);
    }
  }
  async function loadSpeedy() {
    if (offices) { renderSpeedy(); return; }
    if (fetchInFlight) return fetchInFlight;
    speedyFeedback.textContent="Зареждане на официалните офиси на Спиди…";
    speedyOptions.replaceChildren();
    fetchInFlight=(async()=>{
      try {
        const response=await fetch(SPEEDY_OFFICES_ENDPOINT,{
          method:"GET",mode:"cors",cache:"default",signal:AbortSignal.timeout(13000)
        });
        if(!response.ok)throw Error("Office directory: "+response.status);
        const result=await response.json();
        if(!Array.isArray(result?.offices)||result.offices.length<50)
          throw Error("Invalid Speedy directory response");
        offices=result.offices;
        if (!speedyPanel.hidden && courier.value==="speedy")renderSpeedy();
      }catch(error){
        console.warn("Speedy office directory unavailable:",error);
        if (!speedyPanel.hidden) speedyFeedback.textContent=
          "Списъкът временно не е достъпен. Можеш да напишеш офис ръчно или да го провериш в официалния списък по-долу.";
      }finally{fetchInFlight=null}
    })();
    return fetchInFlight;
  }
  function refreshFields(resetOffice = false) {
    const toOffice = deliveryType.value === "office";
    tools.hidden = !toOffice;
    if (locationLabel) {
      locationLabel.firstChild.textContent = toOffice ? "Офис на куриера " : "Точен адрес ";
    }
    address.placeholder = toOffice ? "Посочи офис или избери от списъка" : "Улица, номер, вход, апартамент";
    if (resetOffice) {
      address.value="";
      delete address.dataset.speedyOfficeId;
      if (launcherLabel) launcherLabel.textContent="Избери офис";
    }
    if (launcherLabel) launcherLabel.textContent = courier.value==="speedy"
      ? (address.dataset.speedyOfficeId ? "Промени избрания офис" : "Избери офис от списък")
      : "Избери офис от карта";
    if (courier.value==="econt") launcher.setAttribute("aria-haspopup","dialog");
    else launcher.removeAttribute("aria-haspopup");
    if (hint) hint.textContent = courier.value === "econt"
      ? "Изборът от картата на Еконт попълва офиса автоматично."
      : courier.value === "speedy"
      ? "Избери офис на Спиди от падащия списък. Населеното място и адресът се попълват сами."
      : "Първо избери куриер, за да се покажат офисите.";
    if (dialog.open) closeMap();
    closeSpeedy();
  }
  function openEcontMap() {
    const url=getOfficeMapURL("econt",city.value,new URL("./",document.baseURI).href);
    $("#checkout-office-dialog-title").textContent="Офиси на Еконт";
    instructions.textContent="Избери офис на картата — кодът, адресът и населеното място ще се попълнят автоматично. Ако картата не се зареди, отвори я в нов прозорец и попълни офиса ръчно.";
    external.href=url;
    iframe.title="Официална карта на офисите на Еконт";
    iframe.src=url;
    if(typeof dialog.showModal==="function")dialog.showModal();
    else dialog.setAttribute("open","");
    launcher.setAttribute("aria-expanded","true");
  }
  function toggleSpeedy() {
    if (!speedyPanel.hidden) {closeSpeedy();return;}
    speedyPanel.hidden=false;
    launcher.setAttribute("aria-expanded","true");
    speedySearch.value=city.value.trim();
    if (offices)renderSpeedy();
    else loadSpeedy();
    speedySearch.focus({preventScroll:true});
    speedyPanel.scrollIntoView({block:"nearest",behavior:"smooth"});
  }
  launcher.addEventListener("click",()=>{
    if(deliveryType.value!=="office")return;
    if(courier.value==="speedy")return toggleSpeedy();
    if(courier.value==="econt")return openEcontMap();
    courier.focus();
    if(hint)hint.textContent="Първо избери Еконт или Спиди.";
  });
  closer?.addEventListener("click",closeMap);
  done?.addEventListener("click",closeMap);
  dialog.addEventListener("click",(event)=>{
    if (event.target===dialog)closeMap();
  });
  dialog.addEventListener("close",()=>iframe.removeAttribute("src"));
  speedySearch.addEventListener("input",renderSpeedy);
  speedySearch.addEventListener("keydown",(event)=>{
    if(event.key==="Escape"){event.preventDefault();closeSpeedy();launcher.focus()}
    if(event.key==="ArrowDown"){
      const first=speedyOptions.querySelector("button");
      if(first){event.preventDefault();first.focus()}
    }
  });
  city.addEventListener("input",()=>{
    if (!speedyPanel.hidden && !speedySearch.value.trim())renderSpeedy();
  });
  courier.addEventListener("change",()=>refreshFields(true));
  deliveryType.addEventListener("change",()=>refreshFields(true));
  window.addEventListener("message",(event)=>{
    if(!dialog.open || courier.value!=="econt" || deliveryType.value!=="office")return;
    const chosen=readEcontSelection(event,iframe.contentWindow);
    if(!chosen)return;
    city.value=chosen.city;
    address.value=chosen.location;
    city.dispatchEvent(new Event("input",{bubbles:true}));
    address.dispatchEvent(new Event("input",{bubbles:true}));
    closeMap();
    address.focus();
  });
  refreshFields();
}
