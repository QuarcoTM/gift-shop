import { config } from "./site-config.js";
const api=config.supabaseUrl.replace(/\/+$/,"")+"/functions/v1/order-management";
const $=(selector)=>document.querySelector(selector);
const money=(value)=>new Intl.NumberFormat("bg-BG",{style:"currency",currency:"EUR"}).format(Number(value)||0);
const labels={pending:"Нова",confirmed:"Потвърдена",preparing:"Подготвя се",shipped:"Изпратена",delivered:"Доставена",cancelled:"Отказана"};
const token=decodeURIComponent((location.hash.match(/^#token=([^&]+)/)||[])[1]||"");
let busy=false;
async function call(action,fields={}){
  const response=await fetch(api,{
    method:"POST",headers:{"Content-Type":"application/json"},
    body:JSON.stringify({action,token,...fields}),cache:"no-store",referrerPolicy:"no-referrer"
  });
  const result=await response.json().catch(()=>({}));
  if(!response.ok)throw Error(result.error||"Неуспешна заявка.");
  return result;
}
function message(text){$("#order-error").textContent=text;$("#order-error").hidden=!text}
function revealOrder(data){
  const order=data.order;
  $("#order-loading").hidden=true;
  $("#order-find").hidden=true;
  $("#order-card").hidden=false;
  $("#order-number").textContent=order.order_code;
  $("#order-status").textContent=labels[order.status]||order.status;
  $("#order-created").textContent="Направена на "+new Date(order.created_at).toLocaleDateString("bg-BG");
  const products=$("#order-products");products.replaceChildren();
  for(const item of order.products||[]){
    const row=document.createElement("div");row.className="order-manager-line";
    const title=document.createElement("span");title.textContent=item.quantity+" × "+item.product_name;
    const total=document.createElement("strong");total.textContent=money(item.quantity*item.unit_price_eur);
    row.append(title,total);products.append(row);
  }
  $("#order-products-total").textContent=money(order.subtotal_eur);
  $("#order-shipping").textContent=order.shipping_quote_pending?"Предстои уточняване":money(order.shipping_eur);
  $("#order-total-row").hidden=Boolean(order.shipping_quote_pending);
  $("#order-total").textContent=money(Number(order.subtotal_eur)+Number(order.shipping_eur));
  const courier=order.courier==="speedy"?"Спиди":order.courier==="econt"?"Еконт":"Куриер";
  $("#order-delivery").textContent="Доставка: "+courier+", "+(order.city||"")+" — "+(order.delivery_address||"");
  $("#order-cancel-box").hidden=!order.can_cancel;
  $("#order-withdraw-form").hidden=!order.can_withdraw;
  const done=$("#order-final-message");
  done.hidden=true;
  if(order.status==="cancelled"){done.textContent="Поръчката е анулирана.";done.hidden=false}
  else if(order.withdrawal_requested_at){
    done.textContent="Получихме заявката ти за връщане на "+new Date(order.withdrawal_requested_at).toLocaleString("bg-BG").replace(/\.$/,"")+". Ще получиш указания за връщането.";
    done.hidden=false;
  }else if(!order.can_cancel&&!order.can_withdraw){
    done.textContent="За тази поръчка няма налично действие в момента.";done.hidden=false;
  }
}
async function reload(){
  $("#order-loading").hidden=false;
  try{revealOrder(await call("status"));message("")}
  catch(error){$("#order-loading").hidden=true;$("#order-card").hidden=true;$("#order-find").hidden=false;message(error.message)}
}
function setBusy(value){
  busy=value;
  for(const button of document.querySelectorAll(".order-manager-button, #order-cancel-confirm"))button.disabled=value;
}
$("#order-cancel").addEventListener("click",()=>{if(!busy)$("#order-cancel-dialog").showModal()});
$("#order-cancel-back").addEventListener("click",()=>$("#order-cancel-dialog").close());
$("#order-cancel-confirm").addEventListener("click",async()=>{
  if(busy)return;
  setBusy(true);
  try{
    const r=await call("cancel");
    $("#order-cancel-dialog").close();
    revealOrder(r);message("");
    if(!r.email_sent)message("Отказът е записан, но автоматичният имейл за потвърждение не е изпратен.");
  }catch(error){$("#order-cancel-dialog").close();message(error.message)}
  finally{setBusy(false)}
});
$("#order-withdraw-form").addEventListener("submit",async(event)=>{
  event.preventDefault();
  if(busy)return;
  setBusy(true);
  try{
    const r=await call("withdraw",{note:$("#order-withdraw-note").value});
    revealOrder(r);message("");
    if(!r.email_sent)message("Отказът е записан с дата и час, но имейлът за потвърждение още не е изпратен.");
  }catch(error){message(error.message)}
  finally{setBusy(false)}
});
$("#order-find-form").addEventListener("submit",async(event)=>{
  event.preventDefault();
  if(busy)return;
  setBusy(true);
  const form=new FormData(event.currentTarget);
  const result=$("#order-find-result");
  try{
    const r=await call("request_link",{email:String(form.get("email")||"").trim()});
    result.textContent=r.mail_available
      ?"Ако има поръчки към този имейл, ще получиш писмо с номерата им и личните линкове за управление."
      :"Изпращането на имейли още не е активирано. Формата ще работи, след като настроим пощата на магазина.";
    result.hidden=false;
  }catch(error){result.textContent=error.message;result.hidden=false}
  finally{setBusy(false)}
});
if(token){reload()}else{$("#order-loading").hidden=true;$("#order-find").hidden=false}
