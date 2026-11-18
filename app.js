import { config } from "./site-config.js";

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => Array.from(document.querySelectorAll(selector));
const page = document.body.dataset.page || "home";
const params = new URLSearchParams(window.location.search);
const priceFormatter = new Intl.NumberFormat("bg-BG", { style: "currency", currency: "EUR" });
const CART_KEY = "sabrano_cart_v1";
const FAVORITES_KEY = "sabrano_favorites_v1";
const groups = {
  koleda: { label: "Коледа", title: "Коледа с <em>повече сърце.</em>", subtitle: "Малки празнични изненади, подбрани с внимание." },
  bebe: { label: "За бебе", title: "За най-малките <em>с обич.</em>", subtitle: "Нежни подаръци за първите специални моменти." },
  deca: { label: "За деца", title: "Големи усмивки <em>за малките.</em>", subtitle: "Подаръчни комплекти за детски празници и радостни поводи." },
  povodi: { label: "За поводи", title: "Понякога <em>просто така.</em>", subtitle: "Красиви жестове за специалните хора." }
};
const validFilter = (value) => value in groups || value === "all" || value === "favorites" ? value : "all";
const data = {
  categories: [],
  products: [],
  filter: validFilter(params.get("category") || (params.get("favorites") === "1" ? "favorites" : "all")),
  search: params.get("q") || "",
  favorites: new Set(loadSaved(FAVORITES_KEY).filter((x) => typeof x === "string")),
  cart: loadSaved(CART_KEY).filter((x) => x && typeof x.id === "string" && Number.isInteger(x.qty) && x.qty > 0).slice(0, 100)
};

function loadSaved(key) {
  try { const value = JSON.parse(localStorage.getItem(key)); return Array.isArray(value) ? value : []; }
  catch { return []; }
}
function save(key, items) {
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
    : '<div class="photo-unavailable" role="img" aria-label="Снимка предстои"><span>✳</span></div>';
}
function price(value) { return priceFormatter.format(Number(value)); }
function productById(id) { return data.products.find((product) => product.id === id); }
function productPhoto(product) { return product.images.find((item) => imageURL(item.image_url))?.image_url || ""; }
function productGroup(product) {
  const content = ((product.category?.slug || "") + " " + (product.category?.name || "") + " " + product.name).toLowerCase();
  if (/колед|koled|christmas|xmas/.test(content)) return "koleda";
  if (/беб|baby|bebe|newborn|погача/.test(content)) return "bebe";
  if (/дете|деца|детски|kids|child|deca/.test(content)) return "deca";
  return "povodi";
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
function addToCart(id) {
  const item = productById(id);
  if (!item || item.stock_quantity <= 0) { notify("Продуктът не е наличен."); return; }
  const existing = data.cart.find((entry) => entry.id === id);
  if (existing && existing.qty >= item.stock_quantity) { notify("Няма повече налични бройки."); return; }
  if (existing) existing.qty++;
  else data.cart.push({ id, qty: 1 });
  save(CART_KEY, data.cart);
  updateCounters();
  notify("Подаръкът е добавен в количката.");
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
      [item.name, item.description, item.category?.name].some((value) => String(value || "").toLocaleLowerCase("bg-BG").includes(term))
    );
  }
  return page === "home" ? items.slice(0, 4) : items;
}
function productCard(item) {
  const liked = data.favorites.has(item.id);
  return '<article class="product-card">' +
    '<a href="./product.html?id=' + encodeURIComponent(item.id) + '" class="product-image-link" aria-label="Виж ' + escapeHTML(item.name) + '">' +
      '<div class="product-image-wrap">' + photo(productPhoto(item), item.name) +
        '<span class="product-tag">' + escapeHTML(groups[item.group].label) + '</span></div></a>' +
      '<button class="favorite-button' + (liked ? ' is-liked' : '') + '" type="button" data-favorite="' + escapeHTML(item.id) + '" aria-label="' + (liked ? "Премахни от любими" : "Добави в любими") + '">' +
        '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20.5 8.5c0 4.4-8.5 10.2-8.5 10.2S3.5 12.9 3.5 8.5a4.5 4.5 0 0 1 8.5-2 4.5 4.5 0 0 1 8.5 2Z"/></svg></button>' +
    '<div class="product-info"><div class="product-kicker">' + escapeHTML(groups[item.group].label) + '</div>' +
      '<h3 class="product-title"><a href="./product.html?id=' + encodeURIComponent(item.id) + '">' + escapeHTML(item.name) + '</a></h3>' +
      '<div class="product-row"><strong class="price">' + escapeHTML(price(item.price_eur)) + '</strong>' +
      '<button class="product-cta" type="button" data-add="' + escapeHTML(item.id) + '"' + (item.stock_quantity > 0 ? "" : " disabled") + '>' +
        (item.stock_quantity > 0 ? "Добави +": "Изчерпан") + '</button></div></div></article>';
}
function renderCatalog() {
  const grid = $("#product-grid");
  if (!grid) return;
  const items = catalogProducts();
  $("[data-filter]").forEach((btn) => btn.classList.toggle("is-active", btn.dataset.filter === data.filter));
  const counter = $("#catalog-count");
  if (counter) counter.textContent = page === "home" ? "" : items.length + (items.length === 1 ? " подарък" : " подаръка");
  if (page === "home" && !items.length) {
    const section = $(".home-products-section");
    if (section) section.hidden = true;
    return;
  }
  if (!items.length) {
    grid.innerHTML = '<div class="catalog-empty"><span class="catalog-empty-mark" aria-hidden="true">✳</span><h3>Тук скоро ще има подаръци.</h3>' +
      '<p>Разгледай останалите колекции.</p><a class="button button-dark" href="./collections.html">Виж колекциите <span aria-hidden="true">↗</span></a></div>';
    return;
  }
  grid.innerHTML = items.map(productCard).join("");
  $$("[data-filter]").forEach((btn) => btn.classList.toggle("is-active", btn.dataset.filter === data.filter));
}
function renderCollectionHeading() {
  if (page !== "collection") return;
  data.filter = validFilter(params.get("category") || "all");
  const group = groups[data.filter];
  const title = $("#collection-title"), description = $("#collection-description"), eyebrow = $("#collection-overline");
  if (!group) {
    if (title) title.textContent = "Всички подаръци";
    if (description) description.textContent = "Открий нашите колекции.";
    return;
  }
  if (title) title.innerHTML = group.title;
  if (description) description.textContent = group.subtitle;
  if (eyebrow) eyebrow.textContent = group.label;
  document.title = group.label + " | събрано.";
}
function renderProduct() {
  if (page !== "product") return;
  const wrapper = $("#product-page-content");
  if (!wrapper) return;
  const item = productById(params.get("id"));
  if (!item) {
    wrapper.innerHTML = '<div class="catalog-empty"><h2>Не открихме този подарък.</h2><p>Разгледай останалите предложения.</p><a class="button button-dark" href="./products.html">Всички подаръци <span aria-hidden="true">↗</span></a></div>';
    return;
  }
  document.title = item.name + " | събрано.";
  const liked = data.favorites.has(item.id);
  wrapper.innerHTML = '<div class="product-page-photo">' + photo(productPhoto(item), item.name, "eager") + '</div>' +
    '<div class="product-page-details"><span class="eyebrow">' + escapeHTML(groups[item.group].label) + '</span>' +
      '<h1>' + escapeHTML(item.name) + '</h1><p class="product-page-description">' + escapeHTML(item.description || "Красиво подбран подаръчен комплект.") + '</p>' +
      '<div class="product-page-price">' + escapeHTML(price(item.price_eur)) + '</div>' +
      '<div class="product-page-buttons"><button type="button" class="button button-dark" data-add="' + escapeHTML(item.id) + '"' + (item.stock_quantity > 0 ? "" : " disabled") + '>' +
        (item.stock_quantity > 0 ? "Добави в количката" : "Временно изчерпан") + ' <span aria-hidden="true">↗</span></button>' +
        '<button type="button" class="detail-favorite' + (liked ? " is-liked" : "") + '" data-favorite="' + escapeHTML(item.id) + '">' +
        (liked ? "♥ В любими" : "♡ Добави в любими") + '</button></div>' +
      '<div class="product-page-footnote">Готов за подаряване. Доставката и плащането ще бъдат активирани при откриването на магазина.</div>' +
    '</div>';
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
  if (!data.cart.length) {
    grid.innerHTML = '<div class="catalog-empty"><span class="catalog-empty-mark" aria-hidden="true">♡</span><h2>Количката е празна.</h2><p>Избери подарък от колекциите.</p><a class="button button-dark" href="./products.html">Виж подаръците <span aria-hidden="true">↗</span></a></div>';
    return;
  }
  grid.innerHTML = data.cart.map((entry) => {
    const item = productById(entry.id);
    if (!item) return "";
    return '<article class="cart-page-line"><a href="./product.html?id=' + encodeURIComponent(item.id) + '" class="cart-line-image">' + photo(productPhoto(item), item.name) + '</a>' +
      '<div><a class="cart-line-name" href="./product.html?id=' + encodeURIComponent(item.id) + '">' + escapeHTML(item.name) + '</a>' +
        '<span class="cart-line-price">' + escapeHTML(price(item.price_eur * entry.qty)) + '</span>' +
        '<div class="cart-line-controls"><button class="qty-button" type="button" data-qty="-1" data-id="' + escapeHTML(item.id) + '" aria-label="Намали">−</button>' +
        '<span>' + entry.qty + '</span><button class="qty-button" type="button" data-qty="1" data-id="' + escapeHTML(item.id) + '" aria-label="Увеличи">+</button>' +
        '<button class="cart-remove" type="button" data-remove="' + escapeHTML(item.id) + '">Премахни</button></div></div></article>';
  }).join("");
}
function configureContact() {
  const email = String(config.contactEmail || "").trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return;
  const link = $("#public-email");
  if (!link) return;
  link.href = "mailto:" + email;
  link.textContent = email;
  link.hidden = false;
  const hint = $("#contact-coming");
  if (hint) hint.hidden = true;
}
function initUI() {
  $("#current-year").textContent = String(new Date().getFullYear());
  configureContact();
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
async function loadCatalog() {
  if (!config.supabaseUrl || !config.supabasePublishableKey) return;
  try {
    const [categories, products, images] = await Promise.all([
      publicTable("gift_categories?select=id,name,slug&is_active=eq.true&order=sort_order.asc"),
      publicTable("gift_products?select=id,name,slug,description,price_eur,stock_quantity,category_id,is_published&is_published=eq.true&order=created_at.desc&limit=100"),
      publicTable("gift_product_images?select=id,product_id,image_url,alt_text,sort_order&order=sort_order.asc&limit=500")
    ]);
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
        stock_quantity: Math.max(0, Number(item.stock_quantity) || 0),
        images: imagesById.get(item.id) || [],
        category: catById.get(item.category_id) || null
      };
      product.group = productGroup(product);
      return product;
    });
    syncCart();
  } catch (error) {
    console.error("Store catalog:", error);
    // Do not erase saved cart entries when the catalog is temporarily offline.
    updateCounters();
  }
  renderCatalog();
  renderCart();
  renderProduct();
}
initUI();
loadCatalog();
