import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const read = (name) => readFileSync(new URL("../"+name,import.meta.url),"utf8");

test("customers can manage a guest order using one personal link",()=>{
  const html=read("order/index.html"), js=read("order-management.js");
  assert.match(html,/id="order-card"/);
  assert.match(html,/id="order-cancel-dialog"/);
  assert.match(html,/id="order-withdraw-form"/);
  assert.match(html,/id="order-find-form"/);
  assert.match(js,/location\.hash\.match/);
  assert.match(js,/action,token/);
  assert.match(js,/call\("status"\)/);
  assert.match(js,/call\("cancel"\)/);
  assert.match(js,/call\("withdraw"/);
  assert.match(js,/call\("request_link"/);
  assert.doesNotMatch(js,/SERVICE_ROLE_KEY|RESEND_API_KEY|ORDER_MAIL_FROM/);
});

test("lost order number recovery needs only email and sends one protected list",()=>{
  const html=read("order/index.html"), js=read("order-management.js");
  const backend=read("supabase/functions/order-management/index.ts");
  assert.match(html,/name="email" type="email"/);
  assert.doesNotMatch(html,/name="order_code"/);
  assert.match(html,/Изпрати номерата на поръчките/);
  assert.match(js,/call\("request_link",\{email:/);
  assert.doesNotMatch(js,/form\.get\("order_code"\)/);
  assert.match(backend,/async function byCustomerEmail\(email:string\)/);
  assert.match(backend,/customer_email=eq\./);
  assert.match(backend,/function recoveryEmail\(orders:Order\[\]\):string/);
  assert.match(backend,/orders\.map\(\(order\)=>/);
  assert.match(backend,/escapeHtml\(code\(order\)\)/);
  assert.match(backend,/manageUrl\(order\.request_key\)/);
  assert.match(backend,/email\(customerEmail,"Твоите номера на поръчки/);
  assert.match(backend,/link_email_last_sent_at/);
  assert.match(backend,/return respond\(\{ok:true,mail_available:emailConfigured\(\)\}\)/);
  assert.doesNotMatch(backend,/byNumberEmail/);
  assert.doesNotMatch(backend,/payload\?\.order_code/);
});

test("SMTP integration for hosting uses TLS 465 and private server-side credentials",()=>{
  const backend=read("supabase/functions/order-management/index.ts");
  assert.match(backend,/npm:nodemailer@10\.6\.0/);
  assert.match(backend,/SMTP_PORT===465/);
  assert.match(backend,/secure:true/);
  assert.match(backend,/SMTP_PASSWORD/);
  const client=read("order-management.js");
  assert.doesNotMatch(client,/SMTP_PASSWORD|SMTP_USERNAME|RESEND_API_KEY/);
});

test("checkout exposes a private link and asks server to send an email without claiming success",()=>{
  const html=read("cart/index.html"), js=read("app.js");
  assert.match(html,/id="checkout-manage-link"/);
  assert.match(html,/id="checkout-email-result"/);
  assert.match(js,/managementToken=checkoutRequestKey/);
  assert.match(js,/action:"receipt",token:managementToken/);
  assert.match(js,/result\.email_sent/);
  assert.match(js,/Автоматичните имейли още не са активни/);
});

test("order-management backend only permits pre-dispatch cancellation, tracks withdrawal",()=>{
  const backend=read("supabase/functions/order-management/index.ts");
  const sql=read("sql/gift-order-management.sql");
  assert.match(backend,/request_key=eq\./);
  assert.match(backend,/\["pending","confirmed","preparing"\]/);
  assert.match(backend,/\["shipped","delivered"\]/);
  assert.match(backend,/withdrawal_requested_at/);
  assert.match(backend,/emailConfigured\(\)/);
  assert.match(backend,/RESEND_API_KEY/);
  assert.match(backend,/ORDER_MAIL_FROM/);
  assert.match(backend,/Access-Control-Allow-Origin/);
  assert.match(backend,/SHOP_URL\+"order\/#token="/);
  assert.match(sql,/if old\.status in \('shipped','delivered'\)/);
  assert.match(sql,/stock_quantity=p\.stock_quantity\+i\.quantity/);
});

test("admin exposes a searchable order queue, waybills and return requests",()=>{
  const admin=read("admin.js");
  const html=read("admin/index.html");
  assert.match(admin,/id="order-search"/);
  assert.match(admin,/id="order-filter"/);
  assert.match(admin,/data-order-action/);
  assert.match(admin,/data-order-copy/);
  assert.match(admin,/orderSearch:/);
  assert.match(admin,/orderFilter:/);
  assert.match(admin,/Заявено връщане/);
  assert.match(admin,/withdrawal_ack_email_sent_at/);
  for(const action of ["quote","confirm","prepare","ship","deliver","cancel",
    "correct_waybill","return_transit","return_received","restore_stock","return_refunded"]){
    assert.ok(admin.includes('"' + action + '"'),"Missing admin action "+action);
  }
  assert.match(admin,/rpc\/gift_admin_order_action/);
  assert.doesNotMatch(admin,/rest\("gift_orders\?id=eq\." \+ encodeURIComponent\(id\), "PATCH", \{ status \}\)/);
  assert.match(html,/admin\.js\?v=20261119-stickerfix/);
  assert.match(html,/admin\.css\?v=20261119-brand/);
});

test("server guards admin access, stock and sequential fulfillment",()=>{
  const sql=read("sql/gift-admin-orders.sql");
  assert.match(sql,/where a\.user_id = \(select auth\.uid\(\)\) and a\.is_active = true/);
  assert.match(sql,/p_expected_updated_at/);
  assert.match(sql,/for update/);
  assert.match(sql,/v\.status <> 'pending'/);
  assert.match(sql,/v\.shipping_quote_pending/);
  assert.match(sql,/v\.status <> 'preparing'/);
  assert.match(sql,/when 'ship' then/);
  assert.match(sql,/when 'return_received' then/);
  assert.match(sql,/when 'return_refunded' then/);
  assert.match(sql,/p_confirmed_with_customer is distinct from true/);
  assert.match(sql,/return_stock_restored_at is not null/);
  assert.match(sql,/revoke update\(status\) on public\.gift_orders from authenticated/);
  assert.match(sql,/from public,anon,authenticated/);
  assert.match(sql,/to authenticated/);
});

test("waybill appears on the private customer order page after dispatch",()=>{
  const html=read("order/index.html");
  const js=read("order-management.js");
  const backend=read("supabase/functions/order-management/index.ts");
  assert.match(html,/id="order-waybill"/);
  assert.match(js,/order\.waybill_number/);
  assert.match(backend,/waybill_number:order\.waybill_number/);
});

test("the public footer exposes withdrawal link from every storefront page",()=>{
  for(const p of ["index.html","about/index.html","bulk/index.html","cart/index.html",
    "collection/index.html","collections/index.html","products/index.html",
    "product/index.html","cookies/index.html","privacy/index.html","contact/index.html"]){
    assert.match(read(p),/href="\.\/order\/">Отказ и връщане<\/a>/,"Missing public withdrawal link in "+p);
  }
});
