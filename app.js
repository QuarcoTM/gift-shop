import { gallery, wireGallery, initOffer } from "./store-ui.js";
import { config } from "./site-config.js";
import { initSiteFeatures } from "./site-features.js?v=20261121-live";
import { CAMPAIGNS } from "./campaigns.js?v=20261119-new-year";
import { allowsStorage } from "./cookie-consent.js?v=20261119-brand-guard";
import { initOfficePicker } from "./office-picker.js?v=20261118-o";

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => Array.from(document.querySelectorAll(selector));
const page = document.body.dataset.page || "home";
const params = new URLSearchParams(window.location.search);
const priceFormatter = new Intl.NumberFormat("bg-BG", { style: "currency", currency: "EUR" });
const CART_KEY = "zausmivka_cart_v1";
const FAVORITES_KEY = "zausmivka_favorites_v1";
const groups = {
  koleda: { label: "Коледа", title: "Коледа с <em>повече сърце.</em>", subtitle: "Празнични подаръци за незабравими моменти." },
  bebe: { label: "За бебе", title: "За най-малките <em>с обич.</em>", subtitle: "Нежни подаръци за първите специални моменти." },
  deca: { label: "За деца", title: "Големи усмивки <em>за малките.</em>", subtitle: "Подаръчни комплекти за детски празници и радостни поводи." },
  povodi: { label: "За поводи", title: "Понякога <em>просто така.</em>", subtitle: "Красиви жестове за специалните хора." }
};
const validFilter = (value) => typeof value === "string" && /^[a-z0-9-]{1,100}$/.test(value) ? value : "all";
const data = {
  categories: [],
  products: [],
  filter: validFilter(params.get("category") || (params.get("favorites") === "1" ? "favorites" : "all")),
  budget: "", catalogState: "loading",
  search: params.get("q") || "",
  favorites: new Set((allowsStorage("functional") ? loadSaved(FAVORITES_KEY) : []).filter((x) => typeof x === "string")),
  cart: (allowsStorage("necessary") ? loadSaved(CART_KEY) : []).filter((x) => x && typeof x.id === "string" && Number.isInteger(x.qty) && x.qty > 0).slice(0, 100)
};

function loadSaved(key) {
  try { const value = JSON.parse(localStorage.getItem(key)); return Array.isArray(value) ? value : []; }
  catch { return []; }
}
function save(key, items) {
  const category = key === FAVORITES_KEY ? "functional" : "necessary";
  if (!allowsStorage(category)) return; // Never persist before the visitor chooses.
  try { localStorage.setItem(key, JSON.stringify(items)); }
  catch { /* Browser storage may be disabled. */ }
}
function escapeHTML(value) {
  return String(value ?? "").replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  })[c]);
}
function imageURL(url) {
  if (typeof url !== "string" || !url.trim()) return "";
  try {
    const value = new URL(url, location.href);
    return value.protocol === "https:" || value.origin === location.origin ? value.href : "";
  } catch { return ""; }
}
function photo(url, alt, loading = "lazy") {
  const src = imageURL(url);
  return src
    ? '<img loading="' + loading + '" src="' + escapeHTML(src) + '" alt="' + escapeHTML(alt) + '" />'
    : '<div class="photo-unavailable" role="img" aria-label="Снимка предстои"><span>♡</span></div>';
}
function price(value) { return priceFormatter.format(Number(value)); }
function productById(id) { return data.products.find((product) => product.id === id); }
function productPhoto(product) { return product.images.find((item) => imageURL(item.image_url))?.image_url || ""; }
function productGroup(product) {
  if (product.category?.slug && !groups[product.category.slug]) return product.category.slug;
  const content = ((product.category?.slug || "") + " " + (product.category?.name || "") + " " + product.name).toLowerCase();
  if (/колед|koled|christmas|xmas/.test(content)) return "koleda";
  if (/беб|baby|bebe|newborn|погача/.test(content)) return "bebe";
  if (/дете|деца|детски|kids|child|deca/.test(content)) return "deca";
  return /^[a-z0-9-]+$/.test(product.category?.slug || "") ? product.category.slug : "povodi";
}
function groupInfo(slug) {
  if (groups[slug]) return groups[slug];
  const category = data.categories.find((item) => item.slug === slug);
  if (!category) return groups.povodi;
  return { label: category.name, title: escapeHTML(category.name), subtitle: category.description || "Подаръци за специални моменти." };
}
function notify(message) {
  const el = $("#toast");
  if (!el) return;
  el.textContent = message;
  el.classList.add("is-visible");
  clearTimeout(notify.timer);
  notify.timer = setTimeout(() => el.classList.remove("is-visible"), 2600);
}
function updateCounters() {
  const count = data.cart.reduce((sum, item) => sum + item.qty, 0);
  const cart = $("#cart-count"), favorites = $("#favorite-count");
  if (cart) { cart.textContent = String(count); cart.hidden = count === 0; }
  if (favorites) { favorites.textContent = String(data.favorites.size); favorites.hidden = data.favorites.size === 0; }
}
function syncCart() {
  data.cart = data.cart.filter((entry) => {
    const item = productById(entry.id);
    if (!item) return false;
    entry.qty = Math.min(entry.qty, item.stock_quantity);
    return entry.qty > 0;
  });
  save(CART_KEY, data.cart);
  updateCounters();
}
// Carry the current selection to the cart when browser storage is unavailable.
function cartDestination() {
  if (allowsStorage("necessary") && JSON.stringify(loadSaved(CART_KEY)) === JSON.stringify(data.cart)) return "./cart/";
  const selection = data.cart.map(entry => entry.id + ":" + entry.qty).join(",");
  return "./cart/#selection=" + encodeURIComponent(selection);
}
if (page === "cart" && location.hash.startsWith("#selection=")) {
  const selection = new URLSearchParams(location.hash.slice(1)).get("selection") || "";
  history.replaceState(history.state, "", location.pathname + location.search);
  if (!data.cart.length && selection.length <= 5800) {
    const lines = new Map();
    for (const line of selection.split(",").slice(0,100)) {
      const match = /^([0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}):([1-9]\d{0,9})$/i.exec(line);
      if (match) lines.set(match[1],Number(match[2]));
    }
    data.cart = [...lines].map(([id,qty]) => ({id,qty}));
  }
}
function showAddedGift(item, quantity) {
  let panel = $("#added-gift");
  if (!panel) {
    panel = document.createElement("dialog");
    panel.id = "added-gift";
    panel.className = "added-gift";
    panel.setAttribute("aria-labelledby","added-title");
    panel.innerHTML = '<h2 id="added-title">Добавено в количката</h2>' +
      '<div class="added-line"><div class="added-photo"></div><div><strong data-added-name></strong><p data-added-quantity></p></div></div>' +
      '<p class="added-total"><span>Продукти в количката</span><strong data-added-total></strong></p>' +
      '<a class="button button-dark" data-open-cart href="./cart/">Към количката</a>' +
      '<button type="button" class="added-continue">Продължи с избора</button>';
    document.body.append(panel);
    panel.querySelector(".added-continue").addEventListener("click", () => panel.close());
    panel.addEventListener("click", event => {
      if (event.target !== panel) return;
      const rect=panel.getBoundingClientRect();
      if (event.clientX<rect.left || event.clientX>rect.right || event.clientY<rect.top || event.clientY>rect.bottom) panel.close();
    });
  }
  panel.querySelector(".added-photo").innerHTML=photo(productPhoto(item), "", "eager");
  panel.querySelector("[data-added-name]").textContent=item.name;
  panel.querySelector("[data-added-quantity]").textContent=quantity+" бр. × "+price(item.price_eur);
  panel.querySelector("[data-added-total]").textContent=price(cartSubtotal());
  panel.querySelector("[data-open-cart]").setAttribute("href",cartDestination());
  if (!panel.open) panel.showModal();
}
function addToCart(id) {
  const item = productById(id);
  if (!item || item.stock_quantity <= 0) { notify("Продуктът не е наличен."); return; }
  const existing = data.cart.find((entry) => entry.id === id);
  if (existing && existing.qty >= item.stock_quantity) { notify("Няма повече налични бройки."); return; }
  if (existing) existing.qty++;
  else data.cart.push({ id, qty: 1 });
  save(CART_KEY, data.cart);
  updateCounters();
  showAddedGift(item, existing ? existing.qty : 1);
  if (page === "cart") renderCart();
}
function changeQty(id, change) {
  const item = data.cart.find((entry) => entry.id === id);
  const product = productById(id);
  if (!item || !product) return;
  item.qty = Math.min(product.stock_quantity, Math.max(0, item.qty + change));
  data.cart = data.cart.filter((entry) => entry.qty > 0);
  save(CART_KEY, data.cart);
  updateCounters();
  renderCart();
}
function removeFromCart(id) {
  data.cart = data.cart.filter((entry) => entry.id !== id);
  save(CART_KEY, data.cart);
  updateCounters();
  renderCart();
}
function toggleFavorite(id) {
  if (!productById(id)) return;
  if (data.favorites.has(id)) data.favorites.delete(id);
  else data.favorites.add(id);
  save(FAVORITES_KEY, [...data.favorites]);
  updateCounters();
  renderCatalog();
  if (page === "product") renderProduct();
}
function catalogProducts() {
  let items = [...data.products];
  if (page === "collection") items = items.filter((item) => item.group === data.filter);
  else if (page !== "home" && data.filter !== "all") {
    items = items.filter((item) => data.filter === "favorites" ? data.favorites.has(item.id) : item.group === data.filter);
  }
  if (data.search.trim()) {
    const term = data.search.trim().toLocaleLowerCase("bg-BG");
    items = items.filter((item) =>
      [item.name, item.description, item.contents, item.category?.name].some((value) => String(value || "").toLocaleLowerCase("bg-BG").includes(term))
    );
  }
  if (page==="home") return items.filter(p=>p.featured_slot && p.stock_quantity>0).sort((a,b)=>a.featured_slot-b.featured_slot).slice(0,4);
  if (data.budget) {
    const [low,high]=data.budget.split("|").map(Number);
    items=items.filter(p=>p.price_eur>=low && p.price_eur<=high);
  }
  return items;
}
let publishedProducts=new Set();
const productLink=id=>publishedProducts.has(id) ? "./p/"+encodeURIComponent(id)+"/" : "./product/?id="+encodeURIComponent(id);
function setupShare(wrapper,item) {
  if(!publishedProducts.has(item.id) && !document.body.dataset.productId)return;
  const button=document.createElement("button");
  button.className="text-link";button.type="button";button.textContent="Сподели комплекта";
  const url=new URL("./p/"+encodeURIComponent(item.id)+"/",document.baseURI).href;
  button.onclick=async()=>{
    try{
      if(navigator.share) await navigator.share({title:item.name,url});
      else {await navigator.clipboard.writeText(url);notify("Линкът е копиран.")}
    }catch(error){if(error.name!=="AbortError")window.prompt("Линк към комплекта",url)}
  };
  wrapper.querySelector(".product-page-buttons").append(button);
}
function productCard(item) {
  const liked = data.favorites.has(item.id);
  return '<article class="product-card">' +
    '<a href="' + productLink(item.id) + '" class="product-image-link" aria-label="Виж ' + escapeHTML(item.name) + '">' +
      '<div class="product-image-wrap">' + photo(productPhoto(item), item.name) +
        '<span class="product-tag">' + escapeHTML(groupInfo(item.group).label) + '</span></div></a>' +
      '<button class="favorite-button' + (liked ? ' is-liked' : '') + '" type="button" data-favorite="' + escapeHTML(item.id) + '" aria-label="' + (liked ? "Премахни от любими" : "Добави в любими") + '">' +
        '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20.5 8.5c0 4.4-8.5 10.2-8.5 10.2S3.5 12.9 3.5 8.5a4.5 4.5 0 0 1 8.5-2 4.5 4.5 0 0 1 8.5 2Z"/></svg></button>' +
    '<div class="product-info">' +
      '<h3 class="product-title"><a href="' + productLink(item.id) + '">' + escapeHTML(item.name) + '</a></h3>' +
      (item.contents ? '<p class="gift-summary">'+escapeHTML(item.contents.split(/\n+/).join(" · "))+'</p>' : '') +
      '<div class="product-row"><strong class="price">' + escapeHTML(price(item.price_eur)) + '</strong>' +
      '<button class="product-cta" type="button" data-add="' + escapeHTML(item.id) + '"' + (item.stock_quantity > 0 ? "" : " disabled") + '>' +
        (item.stock_quantity > 0 ? "Добави +": "Изчерпан") + '</button></div></div></article>';
}
function renderCatalog() {
  const grid = $("#product-grid");
  if (!grid) return;
  const items = catalogProducts();
  $$("[data-filter]").forEach((btn) => btn.classList.toggle("is-active", btn.dataset.filter === data.filter));
  const counter = $("#catalog-count");
  if (counter) counter.textContent = page === "home" ? "" : items.length + (items.length === 1 ? " подарък" : " подаръка");
  if (page === "home") {
    const section = $(".home-products-section");
    if (section) section.hidden = items.length === 0;
    if (!items.length) return;
  }
  if (!items.length) {
    let title="Тук скоро ще откриеш подаръци.",action='<a class="text-link" href="./collections/">Виж колекциите</a>';
    if(data.catalogState==="loading"){title="Зареждаме подаръците…";action=""}
    else if(data.catalogState==="error"){title="Подаръците не се заредиха.";action='<button class="text-link" data-retry>Опитай отново</button>'}
    else if(data.search.trim() || data.budget){title="Няма резултати";action='<button class="text-link" data-clear>Изчисти търсенето и бюджета</button>'}
    else if(data.filter==="favorites"){title="Още нямаш любими подаръци.";action='<a class="text-link" href="./products/">Разгледай подаръците</a>'}
    grid.innerHTML='<div class="catalog-empty"><h3>'+title+'</h3>'+action+'</div>';
    return;
  }
  grid.innerHTML = items.map(productCard).join("");
  $$("[data-filter]").forEach((btn) => btn.classList.toggle("is-active", btn.dataset.filter === data.filter));
}
function configureMerchandising() {
  const story=$("#packed-story");
  if(story){
    const packed=[...data.products].sort((a,b)=>(a.featured_slot||5)-(b.featured_slot||5)).find(p=>imageURL(p.packed_photo) && p.images.some(im=>im.image_url===p.packed_photo));
    story.hidden=!packed;
    if(packed){story.querySelector("img").src=packed.packed_photo;story.querySelector("a").href=productLink(packed.id)}
  }
  const select=$("#budget-filter");
  if(!select)return;
  const prices=[...new Set(data.products.map(p=>p.price_eur))].sort((a,b)=>a-b);
  const count=Math.min(3,prices.length);
  const options=[];
  for(let i=0;i<count;i++){
    const low=prices[Math.floor(i*prices.length/count)],high=prices[Math.floor((i+1)*prices.length/count)-1];
    options.push('<option value="'+low+'|'+high+'">'+(low===high?price(low):price(low)+' – '+price(high))+'</option>');
  }
  select.innerHTML='<option value="">Всички цени</option>'+options.join("");
  select.value=data.budget;if(select.value!==data.budget)data.budget="";
  select.parentElement.hidden=count<2;
  select.onchange=()=>{data.budget=select.value;renderCatalog()};
}
function renderCustomCategories() {
  const campaign = CAMPAIGNS[document.documentElement.dataset.campaign];
  const featuredSlug = campaign && campaign.slug !== "povodi" ? campaign.slug : "";
  const filters = $(".catalog-filters");
  if (filters) {
    // Keep every catalog category visible, including holidays without products.
    // The holiday only changes which category is promoted next to "Всички".
    const buttons = new Map(Array.from(filters.querySelectorAll("button[data-filter]"))
      .map(button => [button.dataset.filter, button]));
    const allButton = buttons.get("all");
    const slugs = [...new Set([
      ...data.categories.map(category => category.slug),
      ...Array.from(buttons.keys()).filter(slug => slug !== "all")
    ])].filter(slug => slug !== "all");
    const sorted = featuredSlug && slugs.includes(featuredSlug)
      ? [featuredSlug, ...slugs.filter(slug => slug !== featuredSlug)]
      : slugs;
    const ordered = [];
    if (allButton) ordered.push(allButton);
    for (const slug of sorted) {
      let button = buttons.get(slug);
      if (!button) {
        button = document.createElement("button");
        button.className = "filter-button dynamic-filter";
        button.type = "button";
        button.dataset.filter = slug;
      }
      const category = data.categories.find(item => item.slug === slug);
      if (category) button.textContent = category.name;
      button.classList.toggle("is-featured", slug === featuredSlug);
      button.classList.toggle("is-active", slug === data.filter);
      ordered.push(button);
    }
    filters.replaceChildren(...ordered);
  }
  if (page === "collections") {
    const grid = $(".collections-grid");
    if (!grid) return;
    grid.querySelectorAll(".collection-card-custom").forEach(node => node.remove());
    // The large tile is reserved for the current holiday; show the other
    // holidays as separate permanent cards, even while their catalogs are empty.
    const staticSlugs = new Set(["bebe", "deca", "povodi"]);
    const holidayCampaigns = Object.values(CAMPAIGNS).filter(item => item.slug !== "povodi");
    const anchor = grid.querySelector(".collection-card:not(.collection-card-large)");
    const everydayCard = grid.querySelector('.collection-card[href*="category=povodi"]:not(.collection-card-large)');
    if (everydayCard) everydayCard.hidden = campaign?.slug === "povodi";
    for (const category of data.categories) {
      if (category.slug === featuredSlug || staticSlugs.has(category.slug)) continue;
      const season = holidayCampaigns.find(item => item.slug === category.slug);
      const link = document.createElement("a");
      link.href = "./collection/?category=" + encodeURIComponent(category.slug);
      link.className = "collection-card collection-card-custom";
      const image = document.createElement("img");
      image.src = season?.image || "./assets/images/occasions.webp";
      image.alt = "Подаръци за " + category.name;
      image.loading = "lazy";
      const shade = document.createElement("span");
      shade.className = "collection-shade";
      const label = document.createElement("span");
      label.className = "collection-number";
      label.textContent = season ? "празнична колекция" : "колекция";
      const title = document.createElement("span");
      title.className = "collection-title";
      title.textContent = category.name;
      link.append(image, shade, label, title);
      grid.insertBefore(link, anchor);
    }
  }
}
function renderCollectionHeading() {
  if (page !== "collection") return;
  data.filter = validFilter(params.get("category") || "all");
  const group = groups[data.filter] || (data.categories.some((item) => item.slug === data.filter) ? groupInfo(data.filter) : null);
  const title = $("#collection-title"), description = $("#collection-description"), eyebrow = $("#collection-overline");
  if (!group) {
    if (title) title.textContent = "Всички подаръци";
    if (description) description.textContent = "Открий нашите колекции.";
    return;
  }
  if (title) title.innerHTML = group.title;
  if (description) description.textContent = group.subtitle;
  if (eyebrow) eyebrow.textContent = group.label;
  document.title = group.label + " | За усмивка.";
}
function renderProduct() {
  if (page !== "product") return;
  const wrapper = $("#product-page-content");
  if (!wrapper) return;
  const item = productById(document.body.dataset.productId || params.get("id"));
  if (!item && data.catalogState!=="ready") {
    wrapper.textContent=data.catalogState==="error"?"Не успяхме да заредим комплекта. Обнови страницата.":"Зареждаме комплекта…";
    return;
  }
  if (!item) {
    wrapper.innerHTML = '<div class="catalog-empty"><h2>Не открихме този подарък.</h2><p>Разгледай останалите предложения.</p><a class="button button-dark" href="./products/">Всички подаръци <span aria-hidden="true"></span></a></div>';
    return;
  }
  document.title = item.name + " | За усмивка.";
  const liked = data.favorites.has(item.id);
  wrapper.innerHTML = gallery(item.images.filter(im=>imageURL(im.image_url)),item.name,escapeHTML,photo) +
    '<div class="product-page-details"><span class="eyebrow">' + escapeHTML(groupInfo(item.group).label) + '</span>' +
      '<h1>' + escapeHTML(item.name) + '</h1><p class="product-page-description">' + escapeHTML(item.description || "Подаръчен комплект за специален повод.") + '</p>' +
      (item.contents ? '<h2 class="gift-contents-title">Какво има в кутията</h2><ul>'+item.contents.split(/\n+/).filter(Boolean).map(line=>'<li>'+escapeHTML(line)+'</li>').join("")+'</ul>':'')+
      '<div class="product-page-price">' + escapeHTML(price(item.price_eur)) + '</div>' +
      '<div class="product-page-buttons"><button type="button" class="button button-dark" data-add="' + escapeHTML(item.id) + '"' + (item.stock_quantity > 0 ? "" : " disabled") + '>' +
        (item.stock_quantity > 0 ? "Добави в количката" : "Временно изчерпан") + ' <span aria-hidden="true"></span></button>' +
        '<button type="button" class="detail-favorite' + (liked ? " is-liked" : "") + '" data-favorite="' + escapeHTML(item.id) + '">' +
        (liked ? "♥ В любими" : "♡ Добави в любими") + '</button></div>' +
      '<div class="product-page-footnote">Готов за подаряване.</div>' +
    '</div>';
  wireGallery(wrapper);
  setupShare(wrapper,item);
}
function renderCart() {
  if (page !== "cart") return;
  const grid = $("#cart-page-items"), totalField = $("#cart-page-total");
  if (!grid || !totalField) return;
  const total = data.cart.reduce((sum, entry) => {
    const item = productById(entry.id);
    return sum + (item ? item.price_eur * entry.qty : 0);
  }, 0);
  totalField.textContent = price(total);
  checkoutAction();
  if (!data.cart.length) {
    grid.innerHTML = '<div class="catalog-empty"><span class="catalog-empty-mark" aria-hidden="true">♡</span><h2>Количката е празна.</h2><p>Избери подарък от колекциите.</p><a class="button button-dark" href="./products/">Виж подаръците <span aria-hidden="true"></span></a></div>';
    return;
  }
  grid.innerHTML = data.cart.map((entry) => {
    const item = productById(entry.id);
    if (!item) return "";
    return '<article class="cart-page-line"><a href="' + productLink(item.id) + '" class="cart-line-image">' + photo(productPhoto(item), item.name) + '</a>' +
      '<div><a class="cart-line-name" href="' + productLink(item.id) + '">' + escapeHTML(item.name) + '</a>' +
        '<span class="cart-line-price">' + escapeHTML(price(item.price_eur * entry.qty)) + '</span>' +
        '<div class="cart-line-controls"><button class="qty-button" type="button" data-qty="-1" data-id="' + escapeHTML(item.id) + '" aria-label="Намали">−</button>' +
        '<span>' + entry.qty + '</span><button class="qty-button" type="button" data-qty="1" data-id="' + escapeHTML(item.id) + '" aria-label="Увеличи">+</button>' +
        '<button class="cart-remove" type="button" data-remove="' + escapeHTML(item.id) + '">Премахни</button></div></div></article>';
  }).join("");
}
// Guest checkout is a secure server-side order request, not a client-side write
// to gift_orders. Prices, stock and order numbers are assigned by Supabase.
let checkoutEnabled = false;
let checkoutBusy = false;
let checkoutRequestKey = null;
function cartSubtotal() {
  return Math.round(data.cart.reduce((sum,entry)=>{
    const item=productById(entry.id);
    return sum+(item ? item.price_eur*entry.qty : 0);
  },0)*100)/100;
}
function checkoutAction() {
  if (page !== "cart") return;
  const button = $("#checkout-button"), status = $("#checkout-status");
  if (!button || !status) return;
  const validCart = data.cart.length>0 && data.cart.every((entry)=>
    productById(entry.id)?.stock_quantity >= entry.qty && entry.qty>0);
  button.disabled = checkoutBusy || (checkoutEnabled && !validCart);
  button.textContent = checkoutEnabled ? "Продължи към поръчка" : "Преглед на формата";
  const submit=$("#checkout-submit");
  if (submit) {
    submit.disabled = !checkoutEnabled || !validCart || checkoutBusy;
    if (!checkoutBusy) submit.textContent = checkoutEnabled ? "Изпрати заявката" : "Приемането на заявки не е активно";
  }
  if (!checkoutEnabled) status.textContent="Можеш да разгледаш формата. Реални заявки ще се приемат след финализиране на данните за търговеца и доставките.";
  else if (!validCart) status.textContent="Избери наличен продукт, за да продължиш.";
  else status.textContent="Заявката е без регистрация. Доставката се уточнява преди изпращане.";
}
function checkoutError(message) {
  const element = $("#checkout-error");
  if (!element) return;
  element.textContent = message || "";
  element.hidden = !message;
}
function checkoutReview() {
  const target=$("#checkout-review-lines");
  if (!target) return;
  target.innerHTML=data.cart.map((entry)=>{
    const product=productById(entry.id);
    if (!product) return "";
    return '<div class="checkout-review-line"><span>'+escapeHTML(entry.qty+" × "+product.name)+'</span><strong>'+
      escapeHTML(price(product.price_eur*entry.qty))+'</strong></div>';
  }).join("");
  const total=$("#checkout-review-total");
  if (total) total.textContent=price(cartSubtotal());
}
async function checkoutStatus() {
  if (page!=="cart") return;
  try {
    const rows=await publicTable("gift_shop_settings?select=checkout_enabled&id=eq.main&limit=1");
    checkoutEnabled=rows[0]?.checkout_enabled===true;
  } catch(error) {
    console.warn("Checkout setting unavailable:",error);
    checkoutEnabled=false; // fail closed; never accept orders with unknown status
  }
  checkoutAction();
}
function setupCheckout() {
  if (page!=="cart") return;
  const start=$("#checkout-button"), form=$("#checkout-form"), panel=$("#checkout-panel");
  if (!start||!form||!panel) return;
  start.addEventListener("click",()=>{
    if (checkoutBusy || (checkoutEnabled && !data.cart.length)) return;
    checkoutReview(); checkoutError("");
    panel.hidden=false;
    panel.scrollIntoView({block:"start",behavior:"smooth"});
  });
  $("#checkout-back")?.addEventListener("click",()=>{
    panel.hidden=true;
    $(".cart-page")?.scrollIntoView({block:"start",behavior:"smooth"});
  });
  initOfficePicker(form);
  form.addEventListener("submit",async(event)=>{
    event.preventDefault();
    if (checkoutBusy || !checkoutEnabled) return;
    checkoutError("");
    // A hidden field catches basic form-filling bots without affecting normal users.
    if (String(form.elements.company_website?.value || "").trim()) {
      checkoutError("Заявката не може да бъде изпратена.");
      return;
    }
    if (!form.checkValidity()) {form.reportValidity();return;}
    if (form.elements.delivery_type.value==="office" &&
        !String(form.elements.delivery_location.value||"").trim()) {
      checkoutError("Избери офис на куриера от списъка.");
      document.getElementById("checkout-office-picker")?.focus();
      return;
    }
    if (!data.cart.length || !data.cart.every(entry=>productById(entry.id)?.stock_quantity>=entry.qty)){
      checkoutError("Количката се промени. Провери продуктите преди изпращане.");return;
    }
    checkoutBusy=true;
    const button=$("#checkout-submit");
    if (button) {button.disabled=true;button.textContent="Изпращане…";}
    checkoutAction();
    if (!checkoutRequestKey) checkoutRequestKey=crypto.randomUUID();
    const formData=new FormData(form);
    const payload={
      p_request_key:checkoutRequestKey,
      p_customer_name:String(formData.get("customer_name")||"").trim(),
      p_customer_phone:String(formData.get("customer_phone")||"").trim(),
      p_customer_email:String(formData.get("customer_email")||"").trim(),
      p_courier:String(formData.get("courier")||""),
      p_delivery_type:String(formData.get("delivery_type")||""),
      p_delivery_city:String(formData.get("delivery_city")||"").trim(),
      p_delivery_location:String(formData.get("delivery_location")||"").trim(),
      p_customer_note:String(formData.get("customer_note")||"").trim(),
      p_items:data.cart.map(entry=>({id:entry.id,qty:entry.qty})),
      p_shipping_ack:formData.get("shipping_ack")==="on",
      p_expected_subtotal:cartSubtotal()
    };
    try {
      const response=await fetch(config.supabaseUrl.replace(/\/+$/,"")+"/rest/v1/rpc/gift_submit_order",{
        method:"POST",
        headers:{apikey:config.supabasePublishableKey,"Content-Type":"application/json",Accept:"application/json"},
        body:JSON.stringify(payload),
        cache:"no-store"
      });
      const value=await response.json().catch(()=>null);
      if (!response.ok || !value?.order_code) {
        const message=String(value?.message||"Поръчката не беше записана. Опитай отново.");
        throw Error(message.slice(0,220));
      }
      $("#checkout-order-code").textContent=value.order_code;
      const managementToken=checkoutRequestKey;
      const managementLink=new URL("./order/#token="+encodeURIComponent(managementToken),document.baseURI).href;
      const manage=$("#checkout-manage");
      const manageAnchor=$("#checkout-manage-link");
      if(manageAnchor)manageAnchor.href=managementLink;
      if(manage)manage.hidden=false;
      const emailResult=$("#checkout-email-result");
      if(emailResult)emailResult.textContent="Проверяваме изпращането на имейла…";
      data.cart=[];
      save(CART_KEY,[]);
      checkoutRequestKey=null;
      panel.hidden=true;
      $(".cart-page").hidden=true;
      $("#checkout-success").hidden=false;
      updateCounters();
      $("#checkout-success").scrollIntoView({block:"start",behavior:"smooth"});
      // The customer can always use the personal link even when mail is not configured.
      // Never claim an email was delivered before the server confirms success.
      fetch(config.supabaseUrl.replace(/\/+$/,"")+"/functions/v1/order-management",{
        method:"POST",headers:{"Content-Type":"application/json"},
        body:JSON.stringify({action:"receipt",token:managementToken}),cache:"no-store"
      }).then(response=>response.json()).then(result=>{
        if(emailResult)emailResult.textContent=result.email_sent
          ?"Изпратихме потвърждение с личния линк на имейла ти."
          :"Автоматичните имейли още не са активни. Запази линка по-горе.";
      }).catch(()=>{
        if(emailResult)emailResult.textContent="Не успяхме да потвърдим изпращането на имейла. Запази личния линк.";
      });
    } catch(error) {
      checkoutError(String(error?.message||"Възникна проблем. Опитай отново.").slice(0,220));
      // Keep the same request key for safe network retries / idempotency.
      if (/Цената|Наличност|продукти/i.test(String(error?.message))) loadCatalog().catch(()=>{});
    } finally {
      checkoutBusy=false;
      if (button) {button.disabled=false;button.textContent="Изпрати заявката";}
      checkoutAction();
    }
  });
  checkoutStatus();
}

function configureContact(value=config.contactEmail) {
  const email = String(value || "").trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return;
  const block=$("[data-contact-address]");
  if(block){block.hidden=false;block.innerHTML='<a href="mailto:'+escapeHTML(email)+'">'+escapeHTML(email)+'</a>'}
  const link = $("#public-email");
  if (!link) return;
  link.href = "mailto:" + email;
  link.textContent = email;
  link.hidden = false;
  const hint = $("#contact-coming");
  if (hint) hint.hidden = true;
}
function initUI() {
  // The <base> element on clean directory URLs changes fragment resolution.
  // Keep the accessible skip link on the current page, including its query.
  const skip = $(".skip-link");
  if (skip) {
    skip.addEventListener("click", (event) => {
      const destination = $("#content");
      if (!destination) return;
      event.preventDefault();
      destination.setAttribute("tabindex", "-1");
      destination.focus({ preventScroll: true });
      destination.scrollIntoView({ block: "start", behavior: "auto" });
    });
  }
  $("#current-year").textContent = String(new Date().getFullYear());
  configureContact();
  publicTable("gift_shop_settings?select=contact_email&id=eq.main").then(rows=>configureContact(rows[0]?.contact_email)).catch(()=>{});
  initOffer(config);
  const menuButton = $(".menu-trigger"), mobileMenu = $("#mobile-nav");
  if (menuButton && mobileMenu) {
    menuButton.addEventListener("click", () => {
      mobileMenu.hidden = !mobileMenu.hidden;
      menuButton.setAttribute("aria-expanded", String(!mobileMenu.hidden));
    });
    mobileMenu.addEventListener("click", (event) => {
      if (!event.target.closest("a")) return;
      mobileMenu.hidden = true;
      menuButton.setAttribute("aria-expanded", "false");
    });
  }
  if (page === "collection") renderCollectionHeading();
  if (page === "products") {
    const search = $("#catalog-search");
    if (search) {
      search.value = data.search;
      search.addEventListener("input", () => {
        data.search = search.value;
        renderCatalog();
      });
      if (params.get("search") === "1") search.focus();
    }
  }
  document.addEventListener("click", (event) => {
    if(event.target.closest("[data-retry]")){loadCatalog();return}
    if(event.target.closest("[data-clear]")){data.search="";data.budget="";if($("#catalog-search"))$("#catalog-search").value="";if($("#budget-filter"))$("#budget-filter").value="";renderCatalog();return}
    const add = event.target.closest("[data-add]");
    if (add) return addToCart(add.dataset.add);
    const favorite = event.target.closest("[data-favorite]");
    if (favorite) return toggleFavorite(favorite.dataset.favorite);
    const filter = event.target.closest("[data-filter]");
    if (filter) {
      data.filter = validFilter(filter.dataset.filter);
      renderCatalog();
      return;
    }
    const qty = event.target.closest("[data-qty]");
    if (qty) return changeQty(qty.dataset.id, Number(qty.dataset.qty));
    const remove = event.target.closest("[data-remove]");
    if (remove) return removeFromCart(remove.dataset.remove);
  });
  renderCollectionHeading();
  updateCounters();
  setupCheckout();
}

async function publicTable(query) {
  const url = config.supabaseUrl.replace(/\/+$/, "") + "/rest/v1/" + query;
  const response = await fetch(url, {
    headers: { apikey: config.supabasePublishableKey, Accept: "application/json" },
    cache: "no-store"
  });
  if (!response.ok) throw new Error("Catalog unavailable: " + response.status);
  const rows = await response.json();
  if (!Array.isArray(rows)) throw new Error("Catalog response invalid");
  return rows;
}
async function catalogRows(query,limit) {
  const separator=query.includes("?")?"&":"?";
  const rows=[];
  for(let offset=0;;offset+=limit){
    const batch=await publicTable(query+separator+"limit="+limit+"&offset="+offset);
    rows.push(...batch);
    if(batch.length<limit)return rows;
  }
}
async function loadCatalog() {
  if (!config.supabaseUrl || !config.supabasePublishableKey) return;
  try {
    const [categories, products, images, capacities, publication] = await Promise.all([
      catalogRows("gift_categories?select=id,name,slug,description&is_active=eq.true&order=sort_order.asc,id.asc",250),
      catalogRows("gift_products?select=id,name,slug,description,price_eur,stock_quantity,category_id,is_published,contents,featured_slot,packed_photo&is_published=eq.true&order=created_at.desc,id.asc",100),
      catalogRows("gift_product_images?select=id,product_id,image_url,alt_text,sort_order&order=sort_order.asc,id.asc",500),
      catalogRows("rpc/gift_store_capacity?order=product_id.asc",500),
      fetch(new URL("./store-publication.json",document.baseURI),{cache:"no-cache"}).then(r=>r.json()).catch(()=>({}))
    ]);
    publishedProducts=new Set(publication.ids||[]);
    const available=new Map(capacities.map(row=>[row.product_id,row.available]));
    data.catalogState="ready";
    const catById = new Map(categories.map((item) => [item.id, item]));
    const imagesById = new Map();
    for (const image of images) {
      if (!imagesById.has(image.product_id)) imagesById.set(image.product_id, []);
      imagesById.get(image.product_id).push(image);
    }
    data.categories = categories;
    data.products = products.filter((item) => item && typeof item.id === "string" && typeof item.name === "string" &&
      Number.isFinite(Number(item.price_eur)) && Number(item.price_eur) >= 0).map((item) => {
      const product = {
        ...item,
        price_eur: Number(item.price_eur),
        stock_quantity: Math.max(0, Number(available.get(item.id) ?? item.stock_quantity) || 0),
        images: imagesById.get(item.id) || [],
        category: catById.get(item.category_id) || null
      };
      product.group = productGroup(product);
      return product;
    });
    configureMerchandising();
    syncCart();
    renderCustomCategories();
    renderCollectionHeading();
  } catch (error) {
    data.catalogState="error";
    console.error("Store catalog:", error);
    // Do not erase saved cart entries when the catalog is temporarily offline.
    updateCounters();
  }
  renderCatalog();
  renderCart();
  checkoutReview();
  checkoutAction();
  renderProduct();
}
window.addEventListener("zausmivka:consentchange", (event) => {
  if (event.detail.necessary) {
    // The cart is functional in memory before a decision and persists only afterwards.
    const stored = loadSaved(CART_KEY).filter((item) =>
      item && typeof item.id === "string" && Number.isInteger(item.qty) && item.qty > 0);
    if (!data.cart.length && stored.length) data.cart = stored.slice(0, 100);
    save(CART_KEY, data.cart);
  }
  if (event.detail.functional) {
    const stored = loadSaved(FAVORITES_KEY).filter((id) => typeof id === "string");
    for (const id of stored) data.favorites.add(id);
    save(FAVORITES_KEY, [...data.favorites]);
  }
  updateCounters();
  renderCart();
  renderCatalog();
});
initUI();
initSiteFeatures({
  onCampaign(campaign) {
    // Everyday mode keeps the default "За поводи" product labels.
    if (campaign.slug !== "povodi") {
      groups[campaign.slug] = {
        label: campaign.label,
        title: campaign.collectionTitle,
        subtitle: campaign.collectionSubtitle
      };
    }
    renderCustomCategories();
    renderCollectionHeading();
    renderCatalog();
    renderProduct();
  }
});
loadCatalog();
