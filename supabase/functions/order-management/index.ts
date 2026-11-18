import nodemailer from "npm:nodemailer@10.6.0";
// "събрано." — secure guest order management; bearer = unpredictable checkout UUID.
// Never expose server keys in the browser. Public endpoint does not return contact details.
// Transactional emails use Jump.bg SMTP over TLS/465 when configured; Resend is optional fallback.
// Checkout must remain disabled until email configuration and legal merchant data are complete.
const BASE = String(Deno.env.get("SUPABASE_URL") || "").replace(/\/+$/,"");
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ||
  (()=>{try{return JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS")||"{}").default||""}catch{return ""}})();
const EMAIL_KEY = Deno.env.get("RESEND_API_KEY") || "";
const EMAIL_FROM = Deno.env.get("ORDER_MAIL_FROM") || "";
const SMTP_HOST = Deno.env.get("SMTP_HOSTNAME") || "";
const SMTP_PORT = Number(Deno.env.get("SMTP_PORT") || "465");
const SMTP_USERNAME = Deno.env.get("SMTP_USERNAME") || "";
const SMTP_PASSWORD = Deno.env.get("SMTP_PASSWORD") || "";
const SMTP_FROM = Deno.env.get("SMTP_FROM") || "";
const smtpConfigured=()=>Boolean(SMTP_HOST&&SMTP_PORT===465&&SMTP_USERNAME&&SMTP_PASSWORD&&SMTP_FROM.includes("@"));
const SHOP_URL = "https://quarcotm.github.io/gift-shop/";
const ALLOWED_ORIGIN = "https://quarcotm.github.io";
const CORS = {
  "Access-Control-Allow-Origin":ALLOWED_ORIGIN,
  "Access-Control-Allow-Methods":"POST,OPTIONS",
  "Access-Control-Allow-Headers":"content-type,apikey",
  "Access-Control-Max-Age":"3600",
  "Content-Type":"application/json; charset=utf-8",
  "Cache-Control":"no-store, private",
  "X-Content-Type-Options":"nosniff",
  "Vary":"Origin"
};
type Order = {
  id:string; order_number:number; customer_email:string; customer_name:string;
  request_key:string; status:string; created_at:string;
  delivery_city:string; delivery_courier:string; delivery_address:string;
  subtotal_eur:number; shipping_eur:number; shipping_quote_pending:boolean;
  withdrawal_requested_at:string|null; withdrawal_note:string|null;
  delivered_at:string|null; receipt_email_sent_at:string|null;
  receipt_email_attempted_at:string|null; withdrawal_ack_email_sent_at:string|null;
  link_email_last_sent_at:string|null;
};
const ORDER_FIELDS = "id,order_number,customer_email,customer_name,request_key,status,created_at,delivery_city,delivery_courier,delivery_address,subtotal_eur,shipping_eur,shipping_quote_pending,withdrawal_requested_at,withdrawal_note,delivered_at,receipt_email_sent_at,receipt_email_attempted_at,withdrawal_ack_email_sent_at,link_email_last_sent_at";
function respond(value:unknown,status=200){return new Response(JSON.stringify(value),{status,headers:CORS})}
function validToken(value:unknown):value is string{
  return typeof value==="string"&&/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(value);
}
function clean(value:unknown,max=600){return typeof value==="string"?value.trim().slice(0,max):""}
function code(order:Order){return "SBR-"+String(order.order_number).padStart(6,"0")}
function manageUrl(token:string){return SHOP_URL+"order/#token="+encodeURIComponent(token)}
function escapeHtml(value:unknown){return String(value??"").replace(/[&<>"']/g,ch=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[ch]||ch))}
function formattedDate(value:string){return new Date(value).toLocaleString("bg-BG",{timeZone:"Europe/Sofia",dateStyle:"medium",timeStyle:"short"}).replace(/\.$/,"")}
async function db(path:string,method="GET",body:unknown=null,returnRows=false):Promise<any>{
  if(!BASE || !SERVICE_KEY)throw Error("Server configuration unavailable");
  const response=await fetch(BASE+"/rest/v1/"+path,{
    method,
    headers:{
      "apikey":SERVICE_KEY,
      "Authorization":"Bearer "+SERVICE_KEY,
      "Content-Type":"application/json",
      "Accept":"application/json",
      ...(returnRows?{"Prefer":"return=representation"}:{})
    },
    ...(body===null?{}:{body:JSON.stringify(body)}),
    cache:"no-store"
  });
  const result=await response.json().catch(()=>null);
  if(!response.ok)throw Error("Database operation failed: "+response.status);
  return result;
}
async function findOrder(token:string):Promise<Order|null>{
  const rows=await db("gift_orders?select="+ORDER_FIELDS+"&request_key=eq."+encodeURIComponent(token)+"&limit=1");
  return Array.isArray(rows)?rows[0]||null:null;
}
async function byCustomerEmail(email:string):Promise<Order[]>{
  // Do not return order details to the visitor. Details leave only through the verified mailbox.
  const rows=await db("gift_orders?select="+ORDER_FIELDS+
    "&customer_email=eq."+encodeURIComponent(email)+
    "&order=created_at.desc&limit=25");
  return Array.isArray(rows)?rows:[];
}
async function itemsFor(order:Order){
  const items=await db("gift_order_items?select=product_name,quantity,unit_price_eur&order_id=eq."+
    encodeURIComponent(order.id)+"&order=created_at.asc&limit=50");
  return Array.isArray(items)?items:[];
}
const emailConfigured=()=>smtpConfigured()||Boolean(EMAIL_KEY&&EMAIL_FROM.includes("@"));
async function email(to:string,subject:string,html:string):Promise<boolean>{
  if(!emailConfigured()||!to)return false;
  if(smtpConfigured()){
    try{
      const transport=nodemailer.createTransport({
        host:SMTP_HOST,port:SMTP_PORT,secure:true,
        auth:{user:SMTP_USERNAME,pass:SMTP_PASSWORD},
        connectionTimeout:10000,greetingTimeout:10000,socketTimeout:14000,
        disableFileAccess:true,disableUrlAccess:true,
        tls:{minVersion:"TLSv1.2"}
      });
      const result=await transport.sendMail({
        from:SMTP_FROM,to,subject,html
      });
      return Array.isArray(result.accepted)&&result.accepted.length>0;
    }catch(error){console.error("SMTP mail delivery failed",String(error));return false}
  }
  const response=await fetch("https://api.resend.com/emails",{
    method:"POST",
    headers:{"Authorization":"Bearer "+EMAIL_KEY,"Content-Type":"application/json"},
    body:JSON.stringify({from:EMAIL_FROM,to:[to],subject,html}),
    signal:AbortSignal.timeout(12000)
  });
  if(!response.ok){console.error("Email delivery failed",response.status);return false}
  return true;
}
function emailLayout(order:Order,title:string,body:string){
  const url=manageUrl(order.request_key);
  return '<!doctype html><html lang="bg"><meta charset="UTF-8">'+
    '<body style="font-family:Arial,sans-serif;line-height:1.6;color:#263a2d;max-width:600px;margin:auto;padding:24px">'+
    '<h1 style="font-weight:500">събрано.</h1><h2>'+escapeHtml(title)+'</h2>'+
    '<p>Поръчка <strong>'+escapeHtml(code(order))+'</strong></p>'+body+
    '<p style="margin:28px 0"><a href="'+escapeHtml(url)+'" style="background:#293e35;color:#fff;padding:14px 19px;text-decoration:none;border-radius:4px">Управление на поръчката</a></p>'+
    '<p style="font-size:12px;color:#667268">Този личен линк дава достъп до поръчката ти. Не го споделяй с други хора.</p>'+
    '</body></html>';
}
function recoveryEmail(orders:Order[]):string{
  const entries=orders.map((order)=>{
    const url=escapeHtml(manageUrl(order.request_key));
    return '<li style="margin-bottom:17px"><strong>'+escapeHtml(code(order))+
      '</strong> · '+escapeHtml(new Date(order.created_at).toLocaleDateString("bg-BG",{timeZone:"Europe/Sofia"}))+
      '<div><a href="'+url+'" style="color:#263a2d;text-decoration:underline">Управление на тази поръчка</a></div></li>';
  }).join("");
  return '<!doctype html><html lang="bg"><meta charset="UTF-8">'+
    '<body style="font-family:Arial,sans-serif;line-height:1.6;color:#263a2d;max-width:600px;margin:auto;padding:24px">'+
    '<h1 style="font-weight:500">събрано.</h1><h2>Твоите номера на поръчки</h2>'+
    '<p>Получихме заявка за възстановяване на достъпа до поръчките, направени с този имейл адрес.</p>'+
    '<p>По-долу са последните '+orders.length+' поръчки и личните линкове за всяка от тях:</p>'+
    '<ul style="padding-left:22px">'+entries+'</ul>'+
    '<p style="font-size:12px;color:#667268">Линковете дават достъп до съответната поръчка. Не ги споделяй.</p>'+
    '<p style="font-size:12px;color:#667268">Ако не си поискал това писмо, можеш да го пренебрегнеш. Поръчките не са променени.</p>'+
    '</body></html>';
}
async function receipt(order:Order):Promise<boolean>{
  if(order.receipt_email_sent_at)return true;
  if(!emailConfigured())return false;
  // Best-effort throttle against repeated requests made with the secret link.
  const cutoff=new Date(Date.now()-5*60*1000).toISOString();
  const attempt=await db("gift_orders?id=eq."+order.id+
    "&receipt_email_sent_at=is.null&or=(receipt_email_attempted_at.is.null,receipt_email_attempted_at.lt."+cutoff+")"+
    "&select=id","PATCH",{receipt_email_attempted_at:new Date().toISOString()},true);
  if(!attempt?.length)return false;
  const body="<p>Получихме твоята заявка за подарък.</p>"+
    "<p>Стойност на продуктите: <strong>"+Number(order.subtotal_eur||0).toFixed(2)+" €</strong>.</p>"+
    "<p>Цената на куриерската доставка предстои да бъде уточнена с теб преди изпращането.</p>";
  const sent=await email(order.customer_email,"Получихме заявка "+code(order),
    emailLayout(order,"Получихме твоята заявка",body));
  if(sent)await db("gift_orders?id=eq."+order.id,"PATCH",{receipt_email_sent_at:new Date().toISOString()});
  return sent;
}
async function acknowledge(order:Order,kind:"cancel"|"withdraw"):Promise<boolean>{
  if(!emailConfigured())return false;
  if(kind==="withdraw"&&order.withdrawal_ack_email_sent_at)return true;
  const details=kind==="cancel"
    ? "<p>Поръчката е анулирана преди изпращане. Не е извършено онлайн плащане.</p>"
    : "<p>Получихме изявлението ти за отказ от договор, подадено на "+
      escapeHtml(formattedDate(order.withdrawal_requested_at||new Date().toISOString()))+
      ".</p><p>Ще се свържем с теб за връщането на стоката и възстановяването на дължимите суми.</p>";
  const ok=await email(order.customer_email,
    (kind==="cancel"?"Анулирана поръчка ":"Получен отказ от договор ")+code(order),
    emailLayout(order,kind==="cancel"?"Поръчката е анулирана":"Получихме заявката за връщане",details));
  if(ok && kind==="withdraw")
    await db("gift_orders?id=eq."+order.id,"PATCH",{withdrawal_ack_email_sent_at:new Date().toISOString()});
  return ok;
}
async function view(order:Order){
  const products=await itemsFor(order);
  return {
    order_code:code(order),status:order.status,created_at:order.created_at,
    products,subtotal_eur:order.subtotal_eur,shipping_eur:order.shipping_eur,
    shipping_quote_pending:order.shipping_quote_pending,
    courier:order.delivery_courier,city:order.delivery_city,
    delivery_address:order.delivery_address,
    delivered_at:order.delivered_at,
    withdrawal_requested_at:order.withdrawal_requested_at,
    withdrawal_note:order.withdrawal_note||"",
    can_cancel:["pending","confirmed","preparing"].includes(order.status),
    can_withdraw:["shipped","delivered"].includes(order.status)&&!order.withdrawal_requested_at
  };
}
Deno.serve(async(request:Request):Promise<Response>=>{
  if(request.method==="OPTIONS")return new Response(null,{status:204,headers:CORS});
  if(request.method!=="POST")return respond({error:"Method not allowed"},405);
  const origin=request.headers.get("origin");
  if(origin&&origin!==ALLOWED_ORIGIN)return respond({error:"Forbidden"},403);
  try{
    const payload=await request.json();
    const action=String(payload?.action||"");
    if(action==="request_link"){
      const customerEmail=clean(payload?.email,254).toLowerCase();
      if(!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(customerEmail))
        return respond({error:"Попълни валиден имейл адрес."},400);
      // Identical response for known and unknown customers: never enumerate accounts.
      // The mail provider is not yet configured; fail closed without claiming delivery.
      if(emailConfigured()){
        const orders=await byCustomerEmail(customerEmail);
        if(orders.length){
          // A single email contains the order numbers and private management links.
          // Cooldown is tied to the oldest record among the newest 25 orders.
          const throttleOrder=orders[orders.length-1];
          const cutoff=new Date(Date.now()-15*60*1000).toISOString();
          const allowed=await db("gift_orders?id=eq."+throttleOrder.id+
            "&or=(link_email_last_sent_at.is.null,link_email_last_sent_at.lt."+cutoff+")"+
            "&select=id","PATCH",{link_email_last_sent_at:new Date().toISOString()},true);
          if(allowed?.length){
            await email(customerEmail,"Твоите номера на поръчки | събрано.",recoveryEmail(orders));
          }
        }
      }
      return respond({ok:true,mail_available:emailConfigured()});
    }
    if(!validToken(payload?.token))return respond({error:"Невалиден линк към поръчката."},400);
    const order=await findOrder(payload.token);
    if(!order)return respond({error:"Поръчката не е намерена или линкът е невалиден."},404);
    if(action==="status"){
      // If a legally important withdrawal acknowledgment previously failed, retry.
      if(order.withdrawal_requested_at&&!order.withdrawal_ack_email_sent_at&&emailConfigured())
        await acknowledge(order,"withdraw").catch(e=>console.error("Acknowledgment retry",String(e)));
      return respond({ok:true,order:await view(order)});
    }
    if(action==="receipt"){
      const sent=await receipt(order);
      return respond({ok:true,email_sent:sent,mail_available:emailConfigured()});
    }
    if(action==="cancel"){
      if(!["pending","confirmed","preparing"].includes(order.status))
        return respond({error:"Пратката вече е изпратена. Използвай заявката за връщане."},409);
      const changed=await db("gift_orders?id=eq."+order.id+
        "&status=in.(pending,confirmed,preparing)&select="+ORDER_FIELDS,"PATCH",{status:"cancelled"},true);
      if(!changed?.length)return respond({error:"Статусът се промени. Обнови страницата."},409);
      const canceled=changed[0] as Order;
      const sent=await acknowledge(canceled,"cancel").catch(e=>{console.error("Cancel email",String(e));return false});
      return respond({ok:true,email_sent:sent,order:await view(canceled)});
    }
    if(action==="withdraw"){
      if(!["shipped","delivered"].includes(order.status))
        return respond({error:"Използвай отказ от поръчката преди изпращане."},409);
      if(order.withdrawal_requested_at)
        return respond({ok:true,already_requested:true,order:await view(order)});
      const note=clean(payload?.note,600);
      const changed=await db("gift_orders?id=eq."+order.id+
        "&status=in.(shipped,delivered)&withdrawal_requested_at=is.null&select="+ORDER_FIELDS,
        "PATCH",{withdrawal_requested_at:new Date().toISOString(),withdrawal_note:note},true);
      if(!changed?.length)return respond({error:"Статусът се промени. Обнови страницата."},409);
      const updated=changed[0] as Order;
      const sent=await acknowledge(updated,"withdraw").catch(e=>{console.error("Withdrawal email",String(e));return false});
      return respond({ok:true,email_sent:sent,order:await view(updated)});
    }
    return respond({error:"Непознато действие."},400);
  }catch(error){
    console.error("Order management error",String(error));
    return respond({error:"Възникна технически проблем. Опитай отново."},500);
  }
});
