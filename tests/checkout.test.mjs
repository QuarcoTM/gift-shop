import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (p) => readFileSync(new URL("../" + p, import.meta.url),"utf8");

test("guest cart displays a real checkout with shipping, courier, COD and clear data processing",()=>{
  const html=read("cart/index.html");
  for(const field of ["customer_name","customer_phone","customer_email","courier","delivery_type",
    "delivery_city","delivery_location","shipping_ack","contact_ack"]){
    assert.match(html,new RegExp('name="'+field+'"'),"Missing "+field);
  }
  assert.match(html,/id="checkout-form"/);
  assert.match(html,/id="checkout-success"/);
  assert.match(html,/id="checkout-order-code"/);
  assert.match(html,/href="\.\/privacy\/"/);
  assert.match(html,/Наложен платеж/);
  assert.match(html,/не е включена/);
  assert.match(html,/id="checkout-submit"/);
  assert.match(html,/id="checkout-button"[^>]*disabled/);
  assert.doesNotMatch(html,/въведи номер на карта|CVV|Плати с карта/);
});

test("checkout is a public RPC with server-side price and stock, not anonymous table writes",()=>{
  const app=read("app.js"), sql=read("sql/gift-checkout.sql");
  assert.match(app,/rpc\/gift_submit_order/);
  assert.match(app,/p_expected_subtotal:cartSubtotal\(\)/);
  assert.match(app,/p_items:data\.cart\.map/);
  assert.match(app,/checkoutEnabled=rows\[0\]\?\.checkout_enabled===true/);
  assert.match(app,/checkoutRequestKey=crypto\.randomUUID\(\)/);
  assert.match(app,/Keep the same request key for safe network retries/);
  assert.match(sql,/security definer|SECURITY DEFINER/i);
  assert.match(sql,/grant execute on function public\.gift_submit_order/);
  assert.match(sql,/revoke all on public\.gift_orders,public\.gift_order_items from anon/);
  assert.match(sql,/p\.is_published=true and c\.is_active=true/);
  assert.match(sql,/for update of p/);
  assert.match(sql,/price_eur\*v_line\.qty/);
  assert.match(sql,/stock_quantity=stock_quantity-v_line\.qty/);
  assert.match(sql,/checkout_enabled=true/);
  assert.match(sql,/p_shipping_ack is distinct from true/);
  assert.match(sql,/gift_restore_cancelled_stock/);
  assert.match(sql,/request_key=p_request_key/);
  assert.doesNotMatch(app,/rest\/v1\/gift_orders/);
});

test("order admin exposes delivery details, order reference and stock-safe cancellation",()=>{
  const admin=read("admin.js");
  assert.match(admin,/gift_order_items\?select=/);
  assert.match(admin,/order_number/);
  assert.match(admin,/shipping_quote_pending/);
  assert.match(admin,/Продукти \(наложен платеж\)/);
  assert.match(admin,/rpc\/gift_admin_order_action/);
  assert.doesNotMatch(admin,/rest\("gift_orders\?id=eq\." \+ encodeURIComponent\(id\), "PATCH", \{ status \}\)/);
});

test("checkout policy is separate from cookie consent, and public form does not store contact data",()=>{
  const app=read("app.js"), policy=read("privacy/index.html");
  assert.match(policy,/данни за доставка/);
  assert.match(policy,/лични данни|Лични данни|данни/);
  assert.doesNotMatch(app,/localStorage\.setItem\([^)]*(?:customer_email|customer_phone|delivery_city)/);
  assert.match(app,/name="shipping_ack"|p_shipping_ack/);
});
