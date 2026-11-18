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
    'if(u.includes("gift_submit_order"))return response({order_code:"SBR-TEST-OK",subtotal_eur:39.8,shipping_pending:true});'+
    'return response([])};'+
    '</script>';
  const testBody='<output id="checkout-test-result"></output><script>window.addEventListener("load",function(){setTimeout(async function(){try{'+
    'var button=document.getElementById("checkout-button");if(button.disabled)throw Error("disabled checkout");'+
    'button.click();if(document.getElementById("checkout-panel").hidden)throw Error("hidden form");'+
    'var f=document.getElementById("checkout-form");var data={customer_name:"Тест Клиент",customer_phone:"0888777666",customer_email:"test@example.invalid",courier:"econt",delivery_type:"office",delivery_city:"София",delivery_location:"Офис ТЕСТ 123"};'+
    'for(var key in data)f.elements[key].value=data[key];f.elements.shipping_ack.checked=true;f.elements.contact_ack.checked=true;'+
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
