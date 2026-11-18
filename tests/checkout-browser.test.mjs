import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync,writeFileSync,unlinkSync,existsSync} from "node:fs";
import {spawn,execFileSync} from "node:child_process";

test("checkout with a sample catalog works in mobile Chromium without submitting a real order",async()=>{
  const browser=["/usr/bin/google-chrome","/usr/bin/google-chrome-stable","/usr/bin/chromium","/usr/bin/chromium-browser"].find(existsSync);
  if(!browser)throw Error("Chromium unavailable");
  const original=readFileSync("cart/index.html","utf8");
  const fakeHead='<script>'+
    'localStorage.setItem("sabrano_cookie_preferences_v2",JSON.stringify({version:2,necessary:true,functional:false,analytics:false,marketing:false}));'+
    'localStorage.setItem("sabrano_cart_v1",JSON.stringify([{id:"08b9dab4-b860-44ad-8ecf-57ee12002000",qty:2}]));'+
    'window.fetch=async function(url,opts){var u=String(url);var response=function(value){return{ok:true,status:200,json:async function(){return value}}};'+
    'if(u.includes("gift_shop_settings")&&u.includes("checkout_enabled"))return response([{checkout_enabled:true}]);'+
    'if(u.includes("gift_shop_settings"))return response([{active_campaign:"valentine"}]);'+
    'if(u.includes("gift_categories"))return response([{id:"11111111-1111-4111-8111-111111111111",name:"Тестови",slug:"povodi"}]);'+
    'if(u.includes("gift_products"))return response([{id:"08b9dab4-b860-44ad-8ecf-57ee12002000",category_id:"11111111-1111-4111-8111-111111111111",name:"Тестов комплект",slug:"test-set",price_eur:19.9,stock_quantity:5,is_published:true}]);'+
    'if(u.includes("gift_product_images"))return response([]);'+
    'if(u.includes("/functions/v1/speedy-offices"))return response({offices:[{id:"23",name:"КЮСТЕНДИЛ",address:"гр. Кюстендил [2500] ул. Христо Ботев No 51"},{id:"385",name:"КЮСТЕНДИЛ - ЦЕНТЪР",address:"гр. Кюстендил [2500] ул. Цар Симеон I No 23"}]});'+
    'if(u.includes("gift_submit_order"))return response({order_code:"SBR-TEST-OK",subtotal_eur:39.8,shipping_pending:true});'+
    'return response([])};'+
    '</script>';
  const testBody='<output id="checkout-test-result"></output><script>window.addEventListener("load",function(){setTimeout(async function(){try{'+
    'var button=document.getElementById("checkout-button");if(button.disabled)throw Error("disabled checkout");'+
    'button.click();if(document.getElementById("checkout-panel").hidden)throw Error("hidden form");'+
    'var f=document.getElementById("checkout-form");var data={customer_name:"Тест Клиент",customer_phone:"0888777666",customer_email:"test@example.invalid",courier:"econt",delivery_type:"office"};'+
    'for(var key in data)f.elements[key].value=data[key];f.elements.courier.dispatchEvent(new Event("change",{bubbles:true}));'+
    'document.getElementById("checkout-office-picker").click();'+
    'var dlg=document.getElementById("checkout-office-dialog");if(!dlg.open)throw Error("locator did not open");'+
    'var frame=document.getElementById("checkout-office-map");if(!frame.src.includes("officelocator.econt.com"))throw Error("wrong map");'+
    'window.dispatchEvent(new MessageEvent("message",{origin:"https://officelocator.econt.com",source:frame.contentWindow,data:{office:{code:"1234",name:"Тест Център",address:{city:{name:"София"},fullAddress:"София, ул. Тест 123"}}}}));'+
    'if(!f.elements.delivery_location.value.includes("1234")||f.elements.delivery_city.value!=="София")throw Error("map did not fill fields");'+
    'f.elements.courier.value="speedy";f.elements.courier.dispatchEvent(new Event("change",{bubbles:true}));'+
    'document.getElementById("checkout-office-picker").click();'+
    'if(!dlg.open&&document.getElementById("checkout-speedy-panel").hidden)throw Error("Speedy dropdown not expanded");'+
    'if(!document.getElementById("checkout-speedy-panel").hidden){'+
    'var input=document.getElementById("checkout-speedy-search");input.value="Кюстендил";input.dispatchEvent(new Event("input",{bubbles:true}));'+
    'await new Promise(function(r){setTimeout(r,200)});'+
    'var opts=document.querySelectorAll("#checkout-speedy-options button");if(opts.length!==2)throw Error("Speedy offices missing: "+opts.length);'+
    'opts[0].click();if(!f.elements.delivery_location.value.includes("Спиди офис 23"))throw Error("Speedy office not selected");'+
    'if(f.elements.delivery_city.value.toLocaleLowerCase("bg-BG")!=="кюстендил")throw Error("Speedy city not filled");'+
    '}else throw Error("Speedy still opens a map");'+
    'f.elements.shipping_ack.checked=true;f.elements.contact_ack.checked=true;'+
    'f.requestSubmit();await new Promise(function(r){setTimeout(r,300)});'+
    'if(document.getElementById("checkout-order-code").textContent!=="SBR-TEST-OK"||document.getElementById("checkout-success").hidden)throw Error("no success");'+
    'document.getElementById("checkout-test-result").textContent="CHECKOUT_SMOKE:PASS";'+
    '}catch(e){document.getElementById("checkout-test-result").textContent="CHECKOUT_SMOKE:FAIL:"+e.message}},400)});</script>';
  const temporary="cart/checkout-smoke-tmp.html";
  writeFileSync(temporary,original.replace("</head>",fakeHead+"</head>").replace("</body>",testBody+"</body>"));
  const server=spawn("python3",["-m","http.server","8766","--bind","127.0.0.1"],{stdio:"ignore"});
  try{
    await new Promise(resolve=>setTimeout(resolve,600));
    const output=execFileSync(browser,["--headless","--no-sandbox","--disable-gpu","--disable-dev-shm-usage",
      "--disable-background-networking","--window-size=390,844","--virtual-time-budget=3200",
      "--dump-dom","http://127.0.0.1:8766/cart/checkout-smoke-tmp.html"],{
        encoding:"utf8",timeout:30000,stdio:["ignore","pipe","ignore"]});
    const result=output.match(/CHECKOUT_SMOKE:(?:PASS|FAIL:[^<]*)/)?.[0]||"CHECKOUT_SMOKE:MISSING";
    console.log(result);
    assert.equal(result,"CHECKOUT_SMOKE:PASS");
  }finally{server.kill("SIGTERM");try{unlinkSync(temporary)}catch{}}
});
