export function gallery(images, name, escape, photo) {
  if (!images.length) return '<div class="product-page-photo">' + photo("", name) + '</div>';
  const slides = images.map((im,i) => '<button type="button" class="gift-slide" data-enlarge="'+i+'" aria-label="Увеличи снимка '+(i+1)+'">'+photo(im.image_url,im.alt_text||name,i ? "lazy":"eager")+'</button>').join("");
  const thumbs = images.length < 2 ? "" : '<div class="gift-thumbs" aria-label="Снимки на комплекта">'+images.map((im,i) =>
    '<button type="button" data-slide="'+i+'" aria-label="Покажи снимка '+(i+1)+'" aria-pressed="'+(i===0)+'">'+photo(im.image_url,im.alt_text||name)+'</button>').join("")+'</div>';
  return '<div class="gift-gallery"><div class="gift-slides">'+slides+'</div>'+thumbs+
    '<dialog class="gift-lightbox" aria-label="'+escape(name)+'"><button type="button" autofocus>Затвори ×</button><img alt="" /></dialog></div>';
}
export function wireGallery(root) {
  const track=root.querySelector(".gift-slides");
  if (!track) return;
  const dialog=root.querySelector("dialog"), buttons=[...root.querySelectorAll("[data-slide]")];
  const selected=()=>Math.round(track.scrollLeft / Math.max(1,track.clientWidth));
  track.addEventListener("scroll",()=>buttons.forEach((b,i)=>b.setAttribute("aria-pressed",String(i===selected()))));
  buttons.forEach((b,i)=>b.addEventListener("click",()=>track.scrollTo({left:track.clientWidth*i})));
  track.addEventListener("click",event=>{
    const img=event.target.closest("button")?.querySelector("img");
    if (!img) return;
    const large=dialog.querySelector("img");large.src=img.src;large.alt=img.alt;
    dialog.showModal();
  });
  dialog.addEventListener("click",e=>{if(e.target===dialog || e.target.closest("button")) dialog.close()});
}
export function initOffer(config) {
  const form=document.querySelector("#offer-form");
  if(!form)return;
  const status=form.querySelector("[role=status]"),submit=form.querySelector("[type=submit]");
  const date=form.elements.needed_on;
  date.min = new Intl.DateTimeFormat("sv-SE",{timeZone:"Europe/Sofia"}).format(new Date());
  let requestKey=null;
  form.addEventListener("input",()=>{requestKey=null;status.textContent=""});
  form.addEventListener("submit",async e=>{
    e.preventDefault();
    if(submit.disabled || !form.reportValidity())return;
    const fields=new FormData(form);
    requestKey ||= crypto.randomUUID();
    submit.disabled=true; status.textContent="Изпращане…";
    try {
      const response=await fetch(config.supabaseUrl+"/rest/v1/rpc/gift_ask_offer",{
        method:"POST",headers:{apikey:config.supabasePublishableKey,"Content-Type":"application/json"},
        body:JSON.stringify({p_id:requestKey,p_quantity:Number(fields.get("quantity")),p_budget:Number(fields.get("budget")),
          p_date:fields.get("needed_on"),p_occasion:fields.get("occasion"),p_contact:fields.get("contact")})});
      if(!response.ok)throw Error((await response.json()).message);
      form.reset(); requestKey=null;status.textContent="Получихме запитването. Ще се свържем с теб за предложението.";
    }catch(error){status.textContent=/[а-я]/i.test(error.message)?error.message:"Запитването не е потвърдено. Опитай отново."}
    finally{submit.disabled=false}
  });
}
