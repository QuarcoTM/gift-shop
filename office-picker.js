/**
 * Official courier office maps. Loaded only after the visitor clicks the picker:
 * no additional third-party requests during normal checkout rendering.
 *
 * Econt documents iframe + cross-origin postMessage {office:{code,name,address}}.
 * Speedy offers an official interactive map; its automatic selection callback
 * cannot be assumed without a validated widget integration, so manual office
 * entry remains available. Never accept postMessage data from another origin.
 */
export const ECONT_MAP_ORIGIN = "https://officelocator.econt.com";
export const SPEEDY_OFFICES_URL = "https://www.speedy.bg/bg/speedy-offices-automats";

export function getOfficeMapURL(courier, city = "", shopURL = "") {
  if (courier === "speedy") return SPEEDY_OFFICES_URL;
  if (courier !== "econt") return "";
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

export function initOfficePicker(form) {
  if (!form) return;
  const $ = (selector) => document.querySelector(selector);
  const dialog = $("#checkout-office-dialog");
  const iframe = $("#checkout-office-map");
  const launcher = $("#checkout-office-picker");
  const closer = $("#checkout-office-close");
  const done = $("#checkout-office-done");
  const external = $("#checkout-office-external");
  const instructions = $("#checkout-office-instructions");
  const tools = $("#checkout-office-tools");
  const hint = $("#checkout-office-hint");
  const locationLabel = $("#checkout-location-label");
  const city = form.elements.delivery_city;
  const address = form.elements.delivery_location;
  const courier = form.elements.courier;
  const deliveryType = form.elements.delivery_type;
  if (!dialog || !iframe || !launcher || !external || !city || !address || !courier || !deliveryType) return;

  function closeMap() {
    if (dialog.open && typeof dialog.close === "function") dialog.close();
    iframe.removeAttribute("src");
  }
  function refreshFields(resetOffice = false) {
    const toOffice = deliveryType.value === "office";
    tools.hidden = !toOffice;
    if (locationLabel) {
      // Label first text node is intentionally kept independent of form controls.
      locationLabel.firstChild.textContent = toOffice ? "Офис на куриера " : "Точен адрес ";
    }
    address.placeholder = toOffice ? "Посочи офис или избери от карта" : "Улица, номер, вход, апартамент";
    if (resetOffice) address.value = "";
    if (hint) hint.textContent = courier.value === "econt"
      ? "При избор от картата на Еконт офисът се попълва автоматично."
      : courier.value === "speedy"
      ? "Картата на Спиди помага да намериш офис; след това посочи името му в полето."
      : "Избери куриер, за да намериш най-удобния офис.";
    if (dialog.open) closeMap();
  }
  function openMap() {
    if (deliveryType.value !== "office") return;
    if (courier.value !== "econt" && courier.value !== "speedy") {
      courier.focus();
      if (hint) hint.textContent = "Първо избери Еконт или Спиди.";
      return;
    }
    const url = getOfficeMapURL(courier.value, city.value, new URL("./",document.baseURI).href);
    if (!url) return;
    const speedy = courier.value === "speedy";
    $("#checkout-office-dialog-title").textContent = speedy ? "Офиси на Спиди" : "Офиси на Еконт";
    instructions.textContent = speedy
      ? "Намери удобен офис на картата. След това въведи името или адреса му в полето от формата. При нужда отвори картата в нов прозорец."
      : "Избери офис на картата — кодът, адресът и населеното място ще се попълнят автоматично. Ако картата не се зареди, отвори я в нов прозорец и попълни офиса ръчно.";
    external.href = url;
    iframe.title = speedy ? "Официална карта на офисите на Спиди" : "Официален локатор на офисите на Еконт";
    // Only launch an external resource after explicit visitor action.
    iframe.src = url;
    if (typeof dialog.showModal === "function") dialog.showModal();
    else dialog.setAttribute("open","");
  }

  launcher.addEventListener("click",openMap);
  closer?.addEventListener("click",closeMap);
  done?.addEventListener("click",closeMap);
  dialog.addEventListener("click",(event)=>{
    if (event.target === dialog) closeMap();
  });
  dialog.addEventListener("close",()=>iframe.removeAttribute("src"));
  courier.addEventListener("change",()=>refreshFields(true));
  deliveryType.addEventListener("change",()=>refreshFields(true));
  window.addEventListener("message",(event)=>{
    if (!dialog.open || courier.value !== "econt" || deliveryType.value !== "office") return;
    const chosen = readEcontSelection(event,iframe.contentWindow);
    if (!chosen) return;
    city.value = chosen.city;
    address.value = chosen.location;
    city.dispatchEvent(new Event("input",{bubbles:true}));
    address.dispatchEvent(new Event("input",{bubbles:true}));
    closeMap();
    address.focus();
  });
  refreshFields();
}
