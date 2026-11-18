import { config } from "./site-config.js";

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => Array.from(document.querySelectorAll(selector));
const money = new Intl.NumberFormat("bg-BG", { style: "currency", currency: "EUR" });
const STORAGE_CART = "sabrano_cart_v1";
const STORAGE_FAV = "sabrano_favorites_v1";

const editorial = [
  { id: "editorial-christmas", title: "Малки коледни изненади", group: "koleda", kicker: "За Коледа", text: "Подаръци, които започват с усмивка.", image: "https://images.unsplash.com/photo-1549465220-1a8b9238cd48?auto=format&fit=crop&w=750&q=80" },
  { id: "editorial-moments", title: "За първите спомени", group: "bebe", kicker: "За бебе", text: "Нежни жестове за големите начала.", image: "https://images.unsplash.com/photo-1515488042361-ee00e0ddd4e4?auto=format&fit=crop&w=750&q=80" },
  { id: "editorial-family", title: "Радост в малките неща", group: "povodi", kicker: "За поводи", text: "За онези дни, които си струва да помним.", image: "https://images.unsplash.com/photo-1512909006721-3d6018887383?auto=format&fit=crop&w=750&q=80" },
  { id: "editorial-season", title: "Празник с отношение", group: "koleda", kicker: "Празнично", text: "Повече внимание във всеки детайл.", image: "https://images.unsplash.com/photo-1513201099705-a9746e1e201f?auto=format&fit=crop&w=750&q=80" }
];

function readSaved(key, fallback) {
  try {
    const data = JSON.parse(localStorage.getItem(key));
    return Array.isArray(data) ? data : fallback;
  } catch {
    return fallback;
  }
}
function save(key, data) {
  try { localStorage.setItem(key, JSON.stringify(data)); }
  catch { /* Site remains usable when storage is unavailable. */ }
}
function escapeHTML(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  })[char]);
}
function imageUrl(value) {
  if (typeof value !== "string") return "";
  try {
    const url = new URL(value, location.href);
    if (url.protocol !== "https:" && url.origin !== location.origin) return "";
    return url.href;
  } catch { return ""; }
}
function textContains(source, term) {
  return String(source || "").toLocaleLowerCase("bg").includes(term.toLocaleLowerCase("bg"));
}
function groupFor(product) {
  const slug = String(product.category?.slug || "").toLowerCase();
  const name = String(product.category?.name || "").toLowerCase();
  const text = slug + " " + name + " " + product.name.toLowerCase();
  if (/колед|christmas|xmas|koled/.test(text)) return "koleda";
  if (/беб|newborn|baby|bebe|погача/.test(text)) return "bebe";
  return "povodi";
}
function categoryName(group) {
  return ({ koleda: "Коледа", bebe: "За бебе", povodi: "За поводи" })[group] || "Подаръци";
}

const state = {
  products: [],
  categories: [],
  filter: "all",
  favorites: new Set(readSaved(STORAGE_FAV, []).filter((item) => typeof item === "string")),
  cart: readSaved(STORAGE_CART, [])
    .filter((item) => item && typeof item.id === "string" && Number.isInteger(item.qty) && item.qty > 0)
    .slice(0, 100)
};
let toastTimer;

function toast(message) {
  const element = $("#toast");
  element.textContent = message;
  element.classList.add("is-visible");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => element.classList.remove("is-visible"), 2600);
}
function decorateImage(element) {
  if (!element) return;
  element.addEventListener("error", () => { element.style.visibility = "hidden"; }, { once: true });
}
function hydrateImages() {
  $$("img").forEach((img) => {
    if (!img.dataset.fallbackAttached) {
      img.dataset.fallbackAttached = "1";
      decorateImage(img);
    }
  });
}
function findProduct(id) { return state.products.find((item) => item.id === id); }
function imageFor(product) {
  const first = (product.images || []).find((img) => imageUrl(img.image_url));
  return first ? imageUrl(first.image_url) : "";
}
function imageTag(url, alt, loading = "lazy") {
  const src = imageUrl(url);
  if (!src) return '<div class="photo-unavailable" aria-label="Снимката предстои"><span>✳</span></div>';
  return '<img src="' + escapeHTML(src) + '" alt="' + escapeHTML(alt) + '" loading="' + loading + '"/>';
}
function renderEditorial() {
  const filtered = editorial.filter((item) => state.filter === "all" || state.filter === item.group);
  if (state.filter === "favorites") {
    $("#product-grid").innerHTML = '<p class="catalog-empty">Все още нямаш запазени подаръци.</p>';
    $("#catalog-count").textContent = "0 избрани";
    return;
  }
  $("#catalog-count").textContent = "Колекцията се подготвя";
  $("#product-grid").innerHTML = filtered.map((item) =>
    '<article class="product-card product-card--editorial">' +
      '<div class="product-image-wrap">' +
        imageTag(item.image, item.title) +
        '<span class="product-tag">Предстои</span>' +
      '</div>' +
      '<div class="product-info">' +
        '<div class="product-kicker">' + escapeHTML(item.kicker) + '</div>' +
        '<h3 class="product-title">' + escapeHTML(item.title) + '</h3>' +
        '<p class="product-caption">' + escapeHTML(item.text) + '</p>' +
      '</div>' +
    '</article>'
  ).join("");
  hydrateImages();
}
function renderCatalog() {
  if (!state.products.length) return renderEditorial();
  let products = state.products.filter((item) => {
    if (state.filter === "favorites") return state.favorites.has(item.id);
    return state.filter === "all" || item.group === state.filter;
  });
  $("#catalog-count").textContent = products.length + (products.length === 1 ? " подарък" : " подаръка");
  if (!products.length) {
    $("#product-grid").innerHTML = '<p class="catalog-empty">' +
      (state.filter === "favorites" ? "Все още нямаш запазени подаръци." : "В тази колекция все още няма подаръци.") +
      '</p>';
    return;
  }
  $("#product-grid").innerHTML = products.map((item) => {
    const liked = state.favorites.has(item.id);
    const available = item.stock_quantity > 0;
    return '<article class="product-card">' +
      '<div class="product-image-wrap">' +
        '<button class="product-image-button" type="button" data-open-product="' + escapeHTML(item.id) + '" aria-label="Виж ' + escapeHTML(item.name) + '">' + imageTag(imageFor(item), item.name) + '</button>' +
        '<span class="product-tag">' + escapeHTML(categoryName(item.group)) + '</span>' +
        '<button class="favorite-button' + (liked ? ' is-liked' : '') + '" type="button" data-favorite="' + escapeHTML(item.id) + '" aria-label="' + (liked ? "Премахни от любими" : "Добави в любими") + '">' +
          '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20.5 8.5c0 4.4-8.5 10.2-8.5 10.2S3.5 12.9 3.5 8.5a4.5 4.5 0 0 1 8.5-2 4.5 4.5 0 0 1 8.5 2Z"/></svg>' +
        '</button>' +
      '</div>' +
      '<div class="product-info">' +
        '<div class="product-kicker">' + escapeHTML(categoryName(item.group)) + '</div>' +
        '<h3 class="product-title"><button type="button" class="product-title-button" data-open-product="' + escapeHTML(item.id) + '">' + escapeHTML(item.name) + '</button></h3>' +
        '<div class="product-row"><strong class="price">' + escapeHTML(money.format(item.price_eur)) + '</strong>' +
          '<button class="product-cta" type="button" data-add="' + escapeHTML(item.id) + '"' + (available ? "" : " disabled") + '>' + (available ? "Добави +" : "Изчерпан") + '</button>' +
        '</div>' +
      '</div>' +
    '</article>';
  }).join("");
  hydrateImages();
}
function setFilter(filter) {
  state.filter = ["all", "koleda", "bebe", "povodi", "favorites"].includes(filter) ? filter : "all";
  $$("[data-filter]").forEach((button) => button.classList.toggle("is-active", button.dataset.filter === state.filter));
  renderCatalog();
}
function updateCounters() {
  const count = state.cart.reduce((total, item) => total + item.qty, 0);
  const favorites = state.favorites.size;
  $("#cart-count").textContent = String(count);
  $("#cart-count").hidden = count === 0;
  $("#favorite-count").textContent = String(favorites);
  $("#favorite-count").hidden = favorites === 0;
}
function toggleFavorite(id) {
  if (!findProduct(id)) return;
  if (state.favorites.has(id)) state.favorites.delete(id);
  else state.favorites.add(id);
  save(STORAGE_FAV, Array.from(state.favorites));
  updateCounters();
  renderCatalog();
  toast(state.favorites.has(id) ? "Добавено в любими." : "Премахнато от любими.");
}
function addCart(id) {
  const product = findProduct(id);
  if (!product || product.stock_quantity <= 0) return;
  const entry = state.cart.find((item) => item.id === id);
  if (entry) {
    if (entry.qty >= product.stock_quantity) {
      toast("Няма повече налични бройки.");
      return;
    }
    entry.qty += 1;
  } else state.cart.push({ id, qty: 1 });
  save(STORAGE_CART, state.cart);
  updateCounters();
  renderCart();
  toast("Добавено в количката.");
}
function changeCartQty(id, delta) {
  const product = findProduct(id);
  const entry = state.cart.find((item) => item.id === id);
  if (!entry || !product) return;
  entry.qty = Math.max(0, Math.min(product.stock_quantity, entry.qty + delta));
  state.cart = state.cart.filter((item) => item.qty > 0);
  save(STORAGE_CART, state.cart);
  updateCounters();
  renderCart();
}
function removeCart(id) {
  state.cart = state.cart.filter((item) => item.id !== id);
  save(STORAGE_CART, state.cart);
  updateCounters();
  renderCart();
}
function renderCart() {
  state.cart = state.cart.filter((item) => findProduct(item.id))
    .map((item) => ({ ...item, qty: Math.min(item.qty, findProduct(item.id).stock_quantity) }))
    .filter((item) => item.qty > 0);
  save(STORAGE_CART, state.cart);
  const list = $("#cart-items");
  const total = state.cart.reduce((sum, item) => sum + findProduct(item.id).price_eur * item.qty, 0);
  $("#cart-total").textContent = money.format(total);
  $("#checkout-button").disabled = true;
  $("#checkout-button").title = "Поръчките ще бъдат активирани при старта на магазина.";
  if (!state.cart.length) {
    list.innerHTML = '<div class="cart-empty"><div class="cart-empty-symbol">♡</div><strong>Тук още е празно.</strong><br>Избери нещо хубаво за подаряване.</div>';
  } else {
    list.innerHTML = state.cart.map((entry) => {
      const item = findProduct(entry.id);
      return '<div class="cart-line">' + imageTag(imageFor(item), item.name) +
        '<div class="cart-line-content"><span class="cart-line-name">' + escapeHTML(item.name) + '</span>' +
        '<span class="cart-line-price">' + escapeHTML(money.format(item.price_eur * entry.qty)) + '</span>' +
        '<div class="cart-line-controls">' +
          '<button type="button" class="qty-button" data-qty="-1" data-id="' + escapeHTML(item.id) + '" aria-label="Намали количество">−</button>' +
          '<span>' + entry.qty + '</span>' +
          '<button type="button" class="qty-button" data-qty="1" data-id="' + escapeHTML(item.id) + '" aria-label="Увеличи количество">+</button>' +
          '<button type="button" class="cart-remove" data-remove="' + escapeHTML(item.id) + '">Премахни</button>' +
        '</div></div></div>';
    }).join("");
  }
  hydrateImages();
  updateCounters();
}
function openCart() { renderCart(); $("#cart-dialog").showModal(); }
function openProduct(id) {
  const item = findProduct(id);
  if (!item) return;
  const available = item.stock_quantity > 0;
  $("#product-dialog-content").innerHTML =
    '<div class="product-detail-layout">' + imageTag(imageFor(item), item.name) +
    '<div class="product-detail-copy"><span class="eyebrow">' + escapeHTML(categoryName(item.group)) + '</span>' +
    '<h2 id="product-dialog-title">' + escapeHTML(item.name) + '</h2>' +
    '<p>' + escapeHTML(item.description || "Подбран подарък за специален повод.") + '</p>' +
    '<div class="price">' + escapeHTML(money.format(item.price_eur)) + '</div>' +
    '<p>' + (available ? "Наличен" : "Временно изчерпан") + '</p>' +
    '<button type="button" class="button button-dark" data-add="' + escapeHTML(item.id) + '"' + (available ? "" : " disabled") + '>Добави в количката <span>↗</span></button>' +
    '</div></div>';
  hydrateImages();
  $("#product-dialog").showModal();
}
function searchCatalog(term) {
  const list = state.products.length ? state.products : editorial;
  if (!term.trim()) return [];
  return list.filter((item) => {
    const content = [item.name || item.title, item.description || item.text, item.group].join(" ");
    return textContains(content, term.trim());
  }).slice(0, 8);
}
function renderSearch() {
  const term = $("#search-input").value;
  const results = searchCatalog(term);
  if (!term.trim()) {
    $("#search-results").innerHTML = '<p>Потърси по повод или вид подарък.</p>';
    return;
  }
  if (!results.length) {
    $("#search-results").innerHTML = '<p>Не открихме подходящи подаръци.</p>';
    return;
  }
  $("#search-results").innerHTML = results.map((item) => {
    const real = Boolean(item.name);
    const title = item.name || item.title;
    return '<button type="button" class="search-result" ' +
      (real ? 'data-open-product="' + escapeHTML(item.id) + '"' : 'data-preview-group="' + escapeHTML(item.group) + '"') + '>' +
      imageTag(real ? imageFor(item) : item.image, title) +
      '<span><strong>' + escapeHTML(title) + '</strong><small>' +
      (real ? escapeHTML(money.format(item.price_eur)) : "Разгледай колекцията") +
      '</small></span></button>';
  }).join("");
  hydrateImages();
}
async function fetchPublic(tableAndQuery) {
  const url = config.supabaseUrl.replace(/\/+$/, "") + "/rest/v1/" + tableAndQuery;
  const response = await fetch(url, {
    headers: { "apikey": config.supabasePublishableKey, "Accept": "application/json" },
    cache: "no-store"
  });
  if (!response.ok) throw new Error("Catalog request failed: " + response.status);
  const data = await response.json();
  if (!Array.isArray(data)) throw new Error("Unexpected catalog data");
  return data;
}
async function loadCatalog() {
  if (!config.supabaseUrl || !config.supabasePublishableKey) {
    renderCatalog();
    return;
  }
  try {
    const [categories, products, images] = await Promise.all([
      fetchPublic("gift_categories?select=id,name,slug&is_active=eq.true&order=sort_order.asc"),
      fetchPublic("gift_products?select=id,name,slug,description,price_eur,stock_quantity,category_id,is_published&is_published=eq.true&order=created_at.desc&limit=60"),
      fetchPublic("gift_product_images?select=id,product_id,image_url,alt_text,sort_order&order=sort_order.asc&limit=250")
    ]);
    const categoryIndex = new Map(categories.map((item) => [item.id, item]));
    const imageIndex = new Map();
    for (const image of images) {
      if (!imageIndex.has(image.product_id)) imageIndex.set(image.product_id, []);
      imageIndex.get(image.product_id).push(image);
    }
    state.categories = categories;
    state.products = products
      .filter((p) => p && typeof p.id === "string" && typeof p.name === "string" && Number.isFinite(Number(p.price_eur)) && Number(p.price_eur) >= 0)
      .map((p) => {
        const category = categoryIndex.get(p.category_id) || null;
        const item = {
          ...p,
          price_eur: Number(p.price_eur),
          stock_quantity: Math.max(0, Number(p.stock_quantity) || 0),
          category,
          images: imageIndex.get(p.id) || []
        };
        item.group = groupFor(item);
        return item;
      });
  } catch (error) {
    console.error("Gift Shop catalog:", error);
  }
  updateCounters();
  renderCatalog();
  renderCart();
}
function configureContact() {
  const email = String(config.contactEmail || "").trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return;
  const link = $("#public-email");
  link.href = "mailto:" + email;
  link.textContent = email;
  link.hidden = false;
  $("#contact-coming").hidden = true;
  $("#bulk-contact").href = "mailto:" + email + "?subject=" + encodeURIComponent("Запитване за подаръци в количество");
}
function toggleMenu() {
  const menu = $("#mobile-nav");
  const expanded = menu.hidden;
  menu.hidden = !expanded;
  $(".menu-trigger").setAttribute("aria-expanded", expanded ? "true" : "false");
}
function closeMenu() {
  $("#mobile-nav").hidden = true;
  $(".menu-trigger").setAttribute("aria-expanded", "false");
}
function initEvents() {
  document.addEventListener("click", (event) => {
    const action = event.target.closest("[data-action]");
    if (action) {
      const type = action.dataset.action;
      if (type === "menu") return toggleMenu();
      if (type === "cart") return openCart();
      if (type === "search") {
        $("#search-dialog").showModal();
        $("#search-input").focus();
        renderSearch();
        return;
      }
      if (type === "favorites") {
        setFilter("favorites");
        $("#products").scrollIntoView({ behavior: "smooth" });
        return;
      }
      if (type === "close-cart") return $("#cart-dialog").close();
      if (type === "close-search") return $("#search-dialog").close();
      if (type === "close-product") return $("#product-dialog").close();
    }
    const add = event.target.closest("[data-add]");
    if (add) return addCart(add.dataset.add);
    const favorite = event.target.closest("[data-favorite]");
    if (favorite) return toggleFavorite(favorite.dataset.favorite);
    const open = event.target.closest("[data-open-product]");
    if (open) {
      if ($("#search-dialog").open) $("#search-dialog").close();
      return openProduct(open.dataset.openProduct);
    }
    const qty = event.target.closest("[data-qty]");
    if (qty) return changeCartQty(qty.dataset.id, Number(qty.dataset.qty));
    const remove = event.target.closest("[data-remove]");
    if (remove) return removeCart(remove.dataset.remove);
    const filter = event.target.closest("[data-filter]");
    if (filter) return setFilter(filter.dataset.filter);
    const category = event.target.closest("[data-category-link]");
    if (category) setFilter(category.dataset.categoryLink);
    const filterLink = event.target.closest("[data-filter-link]");
    if (filterLink) setFilter(filterLink.dataset.filterLink);
    const preview = event.target.closest("[data-preview-group]");
    if (preview) {
      $("#search-dialog").close();
      setFilter(preview.dataset.previewGroup);
      $("#products").scrollIntoView({ behavior: "smooth" });
    }
    if (event.target.closest(".mobile-nav a")) closeMenu();
  });
  $("#search-input").addEventListener("input", renderSearch);
  for (const dialog of $$("dialog")) {
    dialog.addEventListener("click", (event) => {
      if (event.target === dialog) dialog.close();
    });
  }
}
$("#current-year").textContent = String(new Date().getFullYear());
configureContact();
initEvents();
hydrateImages();
renderCatalog();
updateCounters();
loadCatalog();
