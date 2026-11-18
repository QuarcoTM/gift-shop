import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { ECONT_MAP_ORIGIN, SPEEDY_OFFICES_URL, SPEEDY_OFFICES_ENDPOINT, getOfficeMapURL, readEcontSelection, filterSpeedyOffices, cityForSpeedyOffice } from "../office-picker.js";

const read=(name)=>readFileSync(new URL("../"+name,import.meta.url),"utf8");

test("no step numbers in the actual checkout",()=>{
  const html=read("cart/index.html");
  for(const n of ["01 / Данни","02 / Доставка","03 / Плащане"])assert.doesNotMatch(html,new RegExp(n));
  for(const field of ["Данни за контакт","Доставка","Плащане и потвърждение"])assert.ok(html.includes(field));
});

test("official map is optional and accessible with a manual fallback",()=>{
  const html=read("cart/index.html"),js=read("office-picker.js");
  assert.match(html,/id="checkout-office-picker"/);
  assert.match(html,/id="checkout-office-dialog"/);
  assert.match(html,/id="checkout-office-external"/);
  assert.match(html,/name="delivery_location"/);
  assert.match(html,/id="checkout-office-map"/);
  assert.doesNotMatch(html,/<iframe[^>]*\ssrc=/i,"Do not fetch third-party resources before visitor click");
  assert.match(js,/iframe\.src=url/);
  assert.match(js,/event\.origin !== ECONT_MAP_ORIGIN/);
  assert.match(js,/event\.source !== expectedSource/);
  assert.match(js,/courier\.addEventListener\("change"/);
  assert.match(js,/deliveryType\.addEventListener\("change"/);
});

test("Econt office map URL follows official integration parameters",()=>{
  const url=new URL(getOfficeMapURL("econt","Кюстендил","https://quarcotm.github.io/gift-shop/"));
  assert.equal(url.origin,ECONT_MAP_ORIGIN);
  assert.equal(url.searchParams.get("officeType"),"office");
  assert.equal(url.searchParams.get("lang"),"bg");
  assert.equal(url.searchParams.get("city"),"Кюстендил");
  assert.equal(url.searchParams.get("shopUrl"),"https://quarcotm.github.io/gift-shop/");
  assert.equal(getOfficeMapURL("speedy","Кюстендил"),"");
  assert.match(SPEEDY_OFFICES_URL,/services\.speedy\.bg\/office_locator_widget_v2\/offices_list\.php/);
  assert.equal(getOfficeMapURL("unknown"),"");
});

test("Econt can fill office ID, address and city, but untrusted messages are ignored",()=>{
  const source={}, payload={office:{
    code:"1234",name:"Кюстендил Център",isAPS:false,
    address:{city:{name:"Кюстендил"},fullAddress:"Кюстендил, ул. Тест 15"}
  }};
  const event={origin:ECONT_MAP_ORIGIN,source,data:payload};
  const chosen=readEcontSelection(event,source);
  assert.equal(chosen.city,"Кюстендил");
  assert.match(chosen.location,/1234/);
  assert.match(chosen.location,/ул\. Тест 15/);
  assert.equal(readEcontSelection({...event,origin:"https://evil.example"},source),null);
  assert.equal(readEcontSelection({...event,source:{}},source),null);
  assert.equal(readEcontSelection({...event,data:{office:{...payload.office,isAPS:true}}},source),null);
  assert.equal(readEcontSelection({...event,data:{office:{...payload.office,code:"<script>"}}},source),null);
});


test("Econt and Speedy share a single city-driven office dropdown",()=>{
  const html=read("cart/index.html"),module=read("office-picker.js");
  assert.equal((html.match(/name="delivery_city"/g)||[]).length,1);
  assert.match(html,/id="checkout-office-panel"[^>]*hidden/);
  assert.match(html,/id="checkout-office-options"/);
  assert.match(html,/id="checkout-office-feedback"/);
  assert.match(html,/id="checkout-office-selected"/);
  assert.doesNotMatch(html,/checkout-speedy-search/);
  assert.doesNotMatch(html,/Избери офис от списък/);
  assert.match(html,/id="checkout-office-picker-label">Избери офис/);
  assert.match(module,/ECONT_OFFICES_ENDPOINT/);
  assert.match(module,/SPEEDY_OFFICES_ENDPOINT/);
  assert.match(module,/panel\.hidden=false/);
  assert.match(module,/options\.append\(option\)/);
  assert.match(module,/address\.type=toOffice\?"hidden":"text"/);
  assert.match(module,/cityOf\(item\)===entered/);
  assert.doesNotMatch(module,/checkout-speedy-search/);
});

test("Speedy office search filters real-office shaped entries and excludes lockers",()=>{
  const offices=[
    {id:"23",name:"КЮСТЕНДИЛ",address:"гр. Кюстендил [2500] ул. Христо Ботев No 51"},
    {id:"385",name:"КЮСТЕНДИЛ - ЦЕНТЪР",address:"гр. Кюстендил [2500] ул. Цар Симеон I No 23"},
    {id:"9656",name:"КЮСТЕНДИЛ (АВТОМАТ)",address:"гр. Кюстендил [2500] ул. Александър Димитров No 7"},
    {id:"212",name:"СОФИЯ - БАНИШОРА",address:"гр. София жк Банишора бл. 53"}
  ];
  assert.equal(filterSpeedyOffices(offices,"кюстендил").length,2);
  assert.equal(filterSpeedyOffices(offices,"цар симеон").length,1);
  assert.equal(filterSpeedyOffices(offices,"385").length,1);
  assert.equal(filterSpeedyOffices(offices,"кюстендил",1).length,1);
  assert.equal(cityForSpeedyOffice(offices[0]),"Кюстендил");
  assert.equal(filterSpeedyOffices(offices,"несъществуващ").length,0);
  assert.match(SPEEDY_OFFICES_ENDPOINT,/supabase\.co\/functions\/v1\/speedy-offices$/);
});
