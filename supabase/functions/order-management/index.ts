// "събрано." — secure guest order management; bearer = unpredictable checkout UUID.
// Never expose server keys in the browser. Public endpoint does not return contact details.
// Transactional emails require RESEND_API_KEY + ORDER_MAIL_FROM for a verified domain.
// Checkout must remain disabled until email configuration and legal merchant data are complete.
const BASE = String(Deno.env.get("SUPABASE_URL") || "").replace(/\/+$/,"");
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ||
  (()=>{try{return JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS")||"{}").default||""}catch{return ""}})();
const EMAIL_KEY = Deno.env.get("RESEND_API_KEY") || "";
const EMAIL_FROM = Deno.env.get("ORDER_MAIL_FROM") || "";
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
async function byNumberEmail(orderCode:string,email:string):Promise<Order|null>{
  const number=Number(orderCode.replace(/^SBR-/i,""));
  if(!Number.isSafeInteger(number)||number<1)return null;
  const rows=await db("gift_orders?select="+ORDER_FIELDS+"&order_number=eq."+number+
    "&customer_email=eq."+encodeURIComponent(email)+"&limit=1");
  return Array.isArray(rows)?rows[0]||null:null;
}
async function itemsFor(order:Order){
  const items=await db("gift_order_items?select=product_name,quantity,unit_price_eur&order_id=eq."+
    encodeURIComponent(order.id)+"&order=created_at.asc&limit=50");
  return Array.isArray(items)?items:[];
}
const emailConfigured=()=>Boolean(EMAIL_KEY&&EMAIL_FROM&&EMAIL_FROM.includes("@"));
async function email(to:string,subject:string,html:string):Promise<boolean>{
  if(!emailConfigured()||!to)return false;
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
      const orderCode=clean(payload?.order_code,30);
      const customerEmail=clean(payload?.email,254).toLowerCase();
      if(!/^SBR-[0-9]{1,12}$/i.test(orderCode)||!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(customerEmail))
        return respond({error:"Попълни номер на поръчка и имейл."},400);
      const order=await byNumberEmail(orderCode,customerEmail);
      if(order&&emailConfigured()){
        const cutoff=new Date(Date.now()-10*60*1000).toISOString();
        const allowed=await db("gift_orders?id=eq."+order.id+
          "&or=(link_email_last_sent_at.is.null,link_email_last_sent_at.lt."+cutoff+")"+
          "&select=id","PATCH",{link_email_last_sent_at:new Date().toISOString()},true);
        if(allowed?.length)await email(order.customer_email,"Управление на поръчка "+code(order),
          emailLayout(order,"Твоят личен линк","<p>Отвори страницата, за да видиш поръчката и възможните действия.</p>"));
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
