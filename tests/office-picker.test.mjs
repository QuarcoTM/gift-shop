import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { ECONT_MAP_ORIGIN, SPEEDY_OFFICES_URL, getOfficeMapURL, readEcontSelection } from "../office-picker.js";

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
  assert.match(js,/iframe\.src = url/);
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
  assert.equal(getOfficeMapURL("speedy","Кюстендил"),SPEEDY_OFFICES_URL);
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
