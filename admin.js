import { createStockPanel } from "./admin-stock.js";
import { config } from "./site-config.js";
import { CAMPAIGNS } from "./campaigns.js?v=20261119-new-year";

/* Store operations use only the public publishable key. Authorization is enforced
   by Supabase Auth + database/storage RLS; never by hiding interface elements. */
const base = String(config.supabaseUrl || "").replace(/\/+$/, "");
const key = String(config.supabasePublishableKey || "");
const STORE_KEY = "zausmivka_admin_session_v1";
const $ = (selector) => document.querySelector(selector);
const money = (amount) => new Intl.NumberFormat("bg-BG", { style: "currency", currency: "EUR" }).format(Number(amount) || 0);
const number = (value) => new Intl.NumberFormat("bg-BG").format(value || 0);
const date = (value) => value ? new Intl.DateTimeFormat("bg-BG", { day: "2-digit", month: "short", year: "numeric" }).format(new Date(value)) : "—";
const escapes = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
const esc = (value) => String(value ?? "").replace(/[&<>"']/g, (c) => escapes[c]);
const statuses = { pending: "Нова", confirmed: "Потвърдена", preparing: "Подготовка", shipped: "Изпратена", delivered: "Доставена", cancelled: "Отказана" };
const pages = { stock:"Компоненти", inquiries:"Запитвания", dashboard: "Общ преглед", products: "Продукти", categories: "Колекции", orders: "Поръчки", analytics: "Статистика", campaigns: "Празнична визия", branding: "Бранд материали", settings: "Настройки" };
const state = { publishedCampaign:null, components:[], recipes:[], inquiries:[], contactEmail:"", session: null, categories: [], products: [], images: [], orders: [], orderItems: [], dailyStats: [], pageStats: [], campaign: "christmas", checkoutEnabled: false, view: "dashboard", search: "", productFilter: "all", orderSearch: "", orderFilter: "all", busy: false };
let toastTimer = null;

function safeImage(url) {
  try {
    const parsed = new URL(String(url || ""));
    return parsed.protocol === "https:" ? esc(parsed.href) : "";
  } catch { return ""; }
}
function photo(product) {
  const item = state.images.filter((image) => image.product_id === product.id).sort((a, b) => a.sort_order - b.sort_order)[0];
  return item ? safeImage(item.image_url) : "";
}
function imageThumb(product) {
  const src = photo(product);
  return '<span class="thumb">' + (src ? '<img src="' + src + '" alt="" loading="lazy" />' : "◇") + "</span>";
}
function readableError(error) {
  const text = String(error?.message || error || "Неизвестна грешка");
  if (/JWT|token.*expired|unauthorized|401/i.test(text)) return "Сесията е изтекла. Влез отново.";
  if (/gift_featured_slot/i.test(text)) return "Тази позиция на началната е заета. Първо освободи позицията от другия комплект.";
  if (/duplicate key|23505/i.test(text)) return "Този идентификатор вече съществува. Използвай друг.";
  if (/foreign key|23503/i.test(text)) return "Записът се използва от други данни и не може да бъде изтрит.";
  return text.slice(0, 220);
}
function toast(text) {
  const el = $("#toast");
  el.textContent = text;
  el.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove("show"), 3400);
}
function wait(on) {
  state.busy = on;
  document.querySelectorAll("[data-busy]").forEach((item) => { item.disabled = on; });
}

function saveSession(session) {
  state.session = session;
  try { sessionStorage.setItem(STORE_KEY, JSON.stringify(session)); }
  catch { /* Private browsing can disable storage. */ }
}
function clearSession() {
  state.session = null;
  try { sessionStorage.removeItem(STORE_KEY); } catch { /* ignore */ }
}
async function tokenRequest(grant, payload) {
  const response = await fetch(base + "/auth/v1/token?grant_type=" + grant, {
    method: "POST",
    headers: { apikey: key, "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok || !result.access_token || !result.refresh_token) {
    throw Error(result.msg || result.error_description || result.message || "Невалидни данни за вход.");
  }
  saveSession({
    access_token: result.access_token,
    refresh_token: result.refresh_token,
    user: result.user || state.session?.user || null,
    expires_at: Date.now() + (Number(result.expires_in) || 3600) * 1000
  });
  return result;
}
async function refresh() {
  if (!state.session?.refresh_token) throw Error("Няма активна сесия.");
  return tokenRequest("refresh_token", { refresh_token: state.session.refresh_token });
}
async function rest(path, method = "GET", payload = undefined, retry = true) {
  if (!state.session?.access_token) throw Error("Няма активна сесия.");
  if (Date.now() > state.session.expires_at - 45000) await refresh();
  const response = await fetch(base + "/rest/v1/" + path, {
    method,
    headers: {
      apikey: key, Authorization: "Bearer " + state.session.access_token,
      Accept: "application/json", "Content-Type": "application/json",
      ...(method === "POST" || method === "PATCH" ? { Prefer: "return=representation" } : {})
    },
    ...(payload === undefined ? {} : { body: JSON.stringify(payload) }),
    cache: "no-store"
  });
  if (response.status === 401 && retry) { await refresh(); return rest(path, method, payload, false); }
  const value = await response.json().catch(() => null);
  if (!response.ok) throw Error(value?.message || value?.hint || "Заявката не беше изпълнена (" + response.status + ").");
  return value;
}
async function authorize() {
  const rows = await rest("gift_admins?select=user_id,is_active&limit=1");
  if (!Array.isArray(rows) || rows.length !== 1 || rows[0].is_active !== true) {
    throw Error("Профилът няма права за администриране.");
  }
}
function showLogin(error = "") {
  $("#boot-screen").hidden = true;
  $("#admin-root").hidden = true;
  $("#login-screen").hidden = false;
  $("#login-error").textContent = error;
  $("#login-error").hidden = !error;
}
function showWorkspace() {
  $("#boot-screen").hidden = true;
  $("#login-screen").hidden = true;
  $("#admin-root").hidden = false;
  const email = state.session?.user?.email || "Администратор";
  $("#sidebar-email").textContent = email;
  const initial = email.slice(0, 1).toLocaleUpperCase("bg-BG");
  $("#sidebar-initial").textContent = initial;
  $("#header-initial").textContent = initial;
  $("#footer-year").textContent = String(new Date().getFullYear());
}
async function signOut(message = "") {
  const access = state.session?.access_token;
  clearSession();
  if (access) {
    fetch(base + "/auth/v1/logout", {
      method: "POST", headers: { apikey: key, Authorization: "Bearer " + access }
    }).catch(() => {});
  }
  showLogin(message);
  $("#login-password").value = "";
}
async function loadAll() {
  const requests = [
    "gift_categories?select=*&order=sort_order.asc,name.asc&limit=500",
    "gift_products?select=*&order=created_at.desc&limit=1000",
    "gift_product_images?select=*&order=sort_order.asc&limit=2000",
    "gift_orders?select=*&order=created_at.desc&limit=500",
    "gift_order_items?select=*&order=created_at.desc&limit=2000",
    "gift_daily_analytics?select=day,pageviews,unique_sessions&order=day.desc&limit=90",
    "gift_page_analytics?select=day,page_path,pageviews,unique_sessions&order=day.desc&limit=700",
    "gift_shop_settings?select=id,active_campaign,checkout_enabled,contact_email&id=eq.main&limit=1",
    "gift_components?select=*&order=name","gift_recipes?select=*","gift_inquiries?select=*&order=created_at.desc&limit=500"
  ];
  const [categories, products, images, orders, orderItems, dailyStats, pageStats, shopSettings, components, recipes, inquiries] = await Promise.all(requests.map((path) => rest(path)));
  Object.assign(state,{components,recipes,inquiries,contactEmail:shopSettings?.[0]?.contact_email||""});
  state.categories = categories || [];
  state.products = products || [];
  state.images = images || [];
  state.orders = orders || [];
  state.orderItems = orderItems || [];
  state.dailyStats = dailyStats || [];
  state.pageStats = pageStats || [];
  state.campaign = shopSettings?.[0]?.active_campaign || "christmas";
  try {
    const response=await fetch(new URL("./store-publication.json",document.baseURI),{cache:"no-cache"});
    state.publishedCampaign=response.ok ? (await response.json()).campaign : null;
  } catch {state.publishedCampaign=null}
  state.checkoutEnabled = shopSettings?.[0]?.checkout_enabled===true;
  $("#nav-product-count").textContent = number(products.length);
  $("#nav-order-count").textContent = number(orders.filter((item) => item.status === "pending" || returnNeedsAction(item)).length);
}
async function reload() {
  wait(true);
  try { await loadAll(); render(); }
  catch (error) { toast(readableError(error)); }
  finally { wait(false); }
}
function heading(label, title, description, action = "") {
  return '<div class="page-header"><div><span class="overline">' + esc(label) +
    '</span><h1>' + esc(title) + '</h1><p>' + esc(description) +
    '</p></div>' + action + "</div>";
}
function primary(label, action) {
  return '<button type="button" class="primary-button" data-action="' + esc(action) + '">' + esc(label) + " <span aria-hidden=\"true\">＋</span></button>";
}
const ICON_SHAPES = {
  package:'<path d="m12 3-9 5 9 5 9-5-9-5Z"/><path d="M3 8v9l9 5 9-5V8M12 13v9"/>',
  check:'<circle cx="12" cy="12" r="9"/><path d="m8 12 3 3 5-6"/>',
  alert:'<path d="m12 3 10 18H2L12 3Z"/><path d="M12 9v4m0 4h.01"/>',
  layers:'<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>',
  chart:'<path d="M3 3v18h18"/><path d="M7 15v-4m5 4V7m5 8V5"/>',
  users:'<circle cx="8" cy="8" r="3"/><path d="M2 20v-2a6 6 0 0 1 12 0v2"/><path d="M16 5a3 3 0 0 1 0 6m2 3c3 0 4 2 4 5v1"/>',
  bag:'<path d="M6 7h12l1 13H5L6 7Z"/><path d="M9 9V6a3 3 0 0 1 6 0v3"/>',
  gift:'<rect x="3" y="8" width="18" height="13" rx="2"/><path d="M12 8v13M3 13h18"/><path d="M12 8S6 8 6 5.5a2.5 2.5 0 0 1 5-1C11.5 5.6 12 8 12 8Zm0 0s6 0 6-2.5a2.5 2.5 0 0 0-5-1C12.5 5.6 12 8 12 8Z"/>',
  plus:'<path d="M12 5v14M5 12h14"/>'
};
function uiIcon(kind) {
  const aliases = {"▦":"package","◉":"check","◈":"alert","▤":"layers","◫":"chart","▥":"users","▧":"bag","◇":"gift","⌁":"chart","＋":"plus"};
  const shape = ICON_SHAPES[aliases[kind] || kind];
  return shape ? '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + shape + '</svg>' : esc(kind);
}
function badge(text, kind = "") {
  return '<span class="status-tag ' + esc(kind) + '">' + esc(text) + "</span>";
}
function blank(icon, title, content, action = "") {
  return '<div class="empty-space"><span class="empty-icon" aria-hidden="true">' + uiIcon(icon) + '</span><h3>' + esc(title) +
    '</h3><p>' + esc(content) + '</p>' + action + "</div>";
}
function metric(title, value, note, icon, alert = false) {
  return '<div class="metric-card' + (alert ? " alert" : "") + '"><div class="metric-head"><span class="metric-title">' + esc(title) +
    '</span><span class="metric-symbol">' + uiIcon(icon) + '</span></div><strong>' + esc(value) + '</strong><small>' + esc(note) + "</small></div>";
}
function localDay() {
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Sofia", year:"numeric", month:"2-digit", day:"2-digit" }).formatToParts(new Date());
  const value = Object.fromEntries(parts.filter((item) => item.type !== "literal").map((item) => [item.type, item.value]));
  return value.year + "-" + value.month + "-" + value.day;
}
function trafficFor(day) {
  return state.dailyStats.find((row) => row.day === day) || { day, unique_sessions:0, pageviews:0 };
}
function dailyDates(days = 14) {
  const end = new Date(localDay() + "T12:00:00Z");
  return Array.from({ length:days }, (_,i) => {
    const date = new Date(end);
    date.setUTCDate(date.getUTCDate() - (days-i-1));
    return date.toISOString().slice(0,10);
  });
}
function dashboard() {
  const active = state.products.filter((p) => p.is_published);
  const low = state.products.filter((p) => p.stock_quantity <= 3 && p.is_published);
  const pending = state.orders.filter((o) => o.status === "pending");
  const recent = state.orders.slice(0, 5);
  let html = heading("ТАБЛО ЗА УПРАВЛЕНИЕ", "Добре дошъл в студиото.", "Всичко важно за магазина, подредено на едно място.", primary("Добави продукт", "new-product"));
  html += '<section class="metric-grid" aria-label="Обобщена статистика">' +
    metric("Всички продукти", number(state.products.length), "Включително черновите", "▦") +
    metric("Публикувани", number(active.length), "Видими в магазина", "◉") +
    metric("Ниски наличности", number(low.length), "3 или по-малко броя", "◈", low.length > 0) +
    metric("Нови поръчки", number(pending.length), "Очакват обработка", "▤", pending.length > 0) + "</section>";
  const today = trafficFor(localDay());
  const recent7 = dailyDates(7).map(trafficFor);
  html += '<div class="traffic-summary"><div><small>ПОСЕЩЕНИЯ ДНЕС</small><strong>' +
    number(today.unique_sessions) + '</strong><span>Уникални сесии с разрешена статистика</span></div><div><small>ОТВАРЯНИЯ ДНЕС</small><strong>' +
    number(today.pageviews) + '</strong><span>Прегледани страници</span></div><div><small>ПОСЛЕДНИ 7 ДНИ</small><strong>' +
    number(recent7.reduce((sum,row)=>sum+Number(row.unique_sessions || 0),0)) +
    '</strong><span>Сесии по дни (не отделни хора)</span></div><button class="traffic-link" type="button" data-view="analytics">Подробна статистика <span>→</span></button></div>';
  html += '<div class="content-grid"><section class="panel"><div class="panel-header"><div><h2 class="panel-title">Последни поръчки</h2><p class="panel-subtitle">Актуално състояние на заявките</p></div><button type="button" class="link-button" data-view="orders">Всички поръчки</button></div>';
  html += recent.length ? recent.map((o) => '<button type="button" class="list-row" data-order="' + esc(o.id) +
    '"><span class="thumb">▧</span><span class="row-main"><strong>' + esc(o.customer_name) + '</strong><small>' + esc(date(o.created_at)) +
    ' · ' + esc(statuses[o.status] || o.status) + '</small></span><span class="row-end">' + esc(money(o.total_eur)) +
    '</span><span class="row-arrow">›</span></button>').join("") :
    blank("▧", "Все още няма поръчки", "Когато активираме приемането на поръчки, те ще се появяват тук.");
  html += '</section><section class="panel"><div class="panel-header"><div><h2 class="panel-title">Бързи действия</h2><p class="panel-subtitle">Най-често използваните инструменти</p></div></div><div class="quick-actions">' +
    '<button class="quick-action" type="button" data-action="new-product"><span class="quick-icon">' + uiIcon("plus") + '</span><span><strong>Нов подаръчен комплект</strong><small>Добави информация, цена и снимки</small></span><span class="quick-chevron">›</span></button>' +
    '<button class="quick-action" type="button" data-action="new-category"><span class="quick-icon">' + uiIcon("layers") + '</span><span><strong>Нова колекция</strong><small>Организирай асортимента по поводи</small></span><span class="quick-chevron">›</span></button>' +
    '<button class="quick-action" type="button" data-view="products"><span class="quick-icon">' + uiIcon("package") + '</span><span><strong>Управление на наличности</strong><small>Следи наличните и публикуваните артикули</small></span><span class="quick-chevron">›</span></button>' +
    "</div></section></div>";
  if (!state.categories.length) html += '<div class="note-box"><strong>Първа стъпка:</strong> Създай колекция, преди да добавиш първия продукт. Продуктите остават скрити, докато не ги публикуваш.</div>';
  return html;
}
function productRow(p) {
  const category = state.categories.find((c) => c.id === p.category_id);
  const published = p.is_published;
  return '<tr><td><div class="product-cell">' + imageThumb(p) + '<span><strong>' + esc(p.name) +
    '</strong><small>' + esc(p.slug) + '</small></span></div></td><td>' + esc(category?.name || "Без колекция") +
    '</td><td><strong>' + esc(money(p.price_eur)) + '</strong></td><td>' +
    (p.stock_quantity === 0 ? badge("Изчерпан", "out") : esc(number(p.stock_quantity) + " бр.")) +
    '</td><td>' + badge(published ? "Публикуван" : "Чернова", published ? "" : "draft") +
    '</td><td><div class="table-actions"><button class="table-action" type="button" data-edit-product="' + esc(p.id) +
    '">Редактирай</button></div></td></tr>';
}
function productList() {
  const filtered = state.products.filter((p) => {
    const text = [p.name, p.slug, state.categories.find((c) => c.id === p.category_id)?.name || ""].join(" ").toLocaleLowerCase("bg-BG");
    const query = state.search.toLocaleLowerCase("bg-BG").trim();
    return text.includes(query) && (state.productFilter === "all" || (state.productFilter === "published" ? p.is_published : !p.is_published));
  });
  return '<div id="products-table-content">' + (filtered.length ? '<div class="table-scroll"><table class="data-table"><thead><tr><th>ПРОДУКТ</th><th>КОЛЕКЦИЯ</th><th>ЦЕНА</th><th>НАЛИЧНОСТ</th><th>СТАТУС</th><th></th></tr></thead><tbody>' +
    filtered.map(productRow).join("") + '</tbody></table></div>' :
    blank("◇", "Няма намерени продукти", "Промени филтрите или добави първия подаръчен комплект.",
      !state.products.length ? primary("Добави продукт", "new-product") : "")) +
    '<div class="table-bottom"><span>' + esc(number(filtered.length)) + ' от ' + esc(number(state.products.length)) +
    ' продукта</span><span>Актуални данни</span></div></div>';
}
function products() {
  return heading("КАТАЛОГ", "Всички продукти", "Цени, снимки, наличности и публикуване — в един изглед.", primary("Нов продукт", "new-product")) +
    '<div class="table-tools"><label class="search-box"><span>⌕</span><input type="search" id="product-search" placeholder="Търси по име, колекция или код..." value="' +
    esc(state.search) + '" aria-label="Търси продукти" /></label><select class="filter-select" id="product-filter" aria-label="Филтър по статус">' +
    '<option value="all"' + (state.productFilter === "all" ? " selected" : "") + '>Всички статуси</option>' +
    '<option value="published"' + (state.productFilter === "published" ? " selected" : "") + '>Публикувани</option>' +
    '<option value="draft"' + (state.productFilter === "draft" ? " selected" : "") + '>Чернови</option></select></div>' +
    '<section class="data-panel" id="products-data-panel">' + productList() + "</section>";
}
function categories() {
  let html = heading("ОРГАНИЗАЦИЯ", "Колекции", "Подреди подаръците по повод. Скритите колекции не се показват публично.", primary("Нова колекция", "new-category"));
  html += '<section class="data-panel">';
  if (!state.categories.length) {
    html += blank("▤", "Няма създадени колекции", "Добави първата колекция, за да започнеш да организираш продуктите.", primary("Нова колекция", "new-category"));
  } else {
    html += '<div class="table-scroll"><table class="data-table"><thead><tr><th>КОЛЕКЦИЯ</th><th>КОД</th><th>ПРОДУКТИ</th><th>СТАТУС</th><th></th></tr></thead><tbody>';
    html += state.categories.map((c) => '<tr><td><strong>' + esc(c.name) + '</strong><small>' + esc(c.description || "Без описание") +
      '</small></td><td>' + esc(c.slug) + '</td><td>' + number(state.products.filter((p) => p.category_id === c.id).length) +
      '</td><td>' + badge(c.is_active ? "Активна" : "Скрита", c.is_active ? "" : "draft") +
      '</td><td><div class="table-actions"><button type="button" class="table-action" data-edit-category="' + esc(c.id) +
      '">Редактирай</button></div></td></tr>').join("");
    html += '</tbody></table></div><div class="table-bottom"><span>' + number(state.categories.length) + ' колекции</span><span>Промените се запазват в магазина</span></div>';
  }
  return html + "</section>";
}
function orderCode(o) {
  return o.order_number ? "ZU-" + String(o.order_number).padStart(6, "0") : "#" + String(o.id).slice(0,8).toUpperCase();
}
function returnLabel(o) {
  if (!o.withdrawal_requested_at) return "";
  if (o.return_refunded_at) return "Сумата е върната";
  if (o.return_received_at) return "Получено връщане";
  if (o.return_in_transit_at) return "Пратка за връщане";
  return "Заявено връщане";
}
function returnNeedsAction(o) {
  return o.withdrawal_requested_at && !o.return_refunded_at;
}
function normalizedOrderSearch(value) {
  return String(value || "").toLocaleLowerCase("bg-BG").normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "").replace(/[\s\-+()]/g, "");
}
function filteredOrders() {
  const query=normalizedOrderSearch(state.orderSearch);
  return state.orders.filter(o=>{
    const filter=state.orderFilter;
    const fits=filter==="all" || (filter==="returns" && returnNeedsAction(o)) ||
      (filter==="attention" && (o.status==="pending" || returnNeedsAction(o))) ||
      (o.status===filter);
    if (!fits) return false;
    const haystack=normalizedOrderSearch([orderCode(o),o.customer_name,o.customer_phone,
      o.customer_email,o.delivery_city,o.waybill_number,o.delivery_address].join(" "));
    return !query || haystack.includes(query);
  });
}
function orderList() {
  const filtered=filteredOrders();
  return (filtered.length ?
    '<div class="table-scroll"><table class="data-table order-table"><thead><tr>' +
    '<th>ПОРЪЧКА</th><th>КЛИЕНТ</th><th>ДОСТАВКА</th><th>СУМА ЗА ПРОДУКТИ</th><th>СТАТУС</th><th></th>' +
    '</tr></thead><tbody>' + filtered.map(o=>
      '<tr><td><strong>' + esc(orderCode(o)) + '</strong><small>' + esc(date(o.created_at)) + '</small></td>' +
      '<td><strong>' + esc(o.customer_name) + '</strong><small>' + esc(o.customer_phone) + '</small><small>' + esc(o.customer_email || "—") + '</small></td>' +
      '<td>' + esc(o.delivery_courier==="econt" ? "Еконт" : o.delivery_courier==="speedy" ? "Спиди" : "Куриер") +
      '<small>' + esc(o.delivery_city || "—") + (o.waybill_number ? ' · ' + esc(o.waybill_number) : '') + '</small></td>' +
      '<td><strong>' + esc(money(o.subtotal_eur)) + '</strong><small>' + (o.shipping_quote_pending ? 'Доставка: неуточнена' :
      'Доставка: ' + esc(money(o.shipping_eur))) + '</small></td>' +
      '<td>' + badge(statuses[o.status] || o.status, o.status) +
      (o.withdrawal_requested_at ? '<small class="order-return-flag">' + esc(returnLabel(o)) + '</small>' : '') +
      '</td><td><button class="table-action" type="button" data-order="' + esc(o.id) +
      '">Отвори</button></td></tr>').join("") +
    '</tbody></table></div>' :
    blank("▧", state.orders.length ? "Няма съвпадащи поръчки" : "Все още няма поръчки",
      state.orders.length ? "Промени търсенето или филтъра." :
      "Когато активираме приемането на заявки, поръчките ще се появяват тук.")) +
    '<div class="table-bottom"><span>' + esc(number(filtered.length)) +
    ' от ' + esc(number(state.orders.length)) +
    ' поръчки</span><span>Сортирани от най-новите</span></div>';
}
function orders() {
  const newOrders=state.orders.filter(o=>o.status==="pending").length;
  const inProgress=state.orders.filter(o=>o.status==="confirmed" || o.status==="preparing").length;
  const onTheWay=state.orders.filter(o=>o.status==="shipped").length;
  const returns=state.orders.filter(returnNeedsAction).length;
  return heading("ПРОДАЖБИ", "Поръчки", "Проверявай заявките, потвърждавай цената с клиента и обработвай доставка и връщане.") +
    '<section class="metric-grid order-metrics" aria-label="Обобщение на поръчките">' +
    metric("Нови заявки",number(newOrders),"Очакват обработка","▤",newOrders>0) +
    metric("За подготовка",number(inProgress),"Потвърдени / подготвят се","▦") +
    metric("Изпратени",number(onTheWay),"Пътуват към получателя","◉") +
    metric("Заявки за връщане",number(returns),"Очакват действие","◈",returns>0) +
    '</section>' +
    '<div class="table-tools"><label class="search-box"><span>⌕</span>' +
    '<input type="search" id="order-search" placeholder="Номер, име, телефон, имейл или товарителница..." value="' +
    esc(state.orderSearch) + '" aria-label="Търси поръчки" /></label>' +
    '<select class="filter-select" id="order-filter" aria-label="Филтър на поръчките">' +
    [['all',"Всички"],['attention',"За действие"],['pending',"Нови"],['confirmed',"Потвърдени"],
    ['preparing',"Подготовка"],['shipped',"Изпратени"],['delivered',"Доставени"],
    ['returns',"За връщане"],['cancelled',"Отказани"]].map(([value,label])=>
    '<option value="' + value + '"' + (state.orderFilter===value ? ' selected' : '') +
    '>' + label + '</option>').join("") + '</select>' +
    '<button type="button" class="secondary-button order-refresh" data-action="refresh-orders">Обнови</button></div>' +
    '<section class="data-panel" id="orders-data-panel">' + orderList() + '</section>';
}
function analytics() {
  const days = dailyDates(14);
  const rows = days.map(trafficFor);
  const totalSessions = rows.reduce((sum,row)=>sum + Number(row.unique_sessions || 0),0);
  const totalViews = rows.reduce((sum,row)=>sum + Number(row.pageviews || 0),0);
  const max = Math.max(1,...rows.map((row)=>Number(row.unique_sessions || 0)));
  const today = trafficFor(localDay());
  let html = heading("ДАННИ ЗА ПОСЕЩЕНИЯТА", "Статистика", "Дневни посещения по българско време. Отчитат се само сесиите на посетители, разрешили статистика.");
  html += '<div class="metric-grid">' +
    metric("Сесии днес",number(today.unique_sessions),"Прието съгласие","◉") +
    metric("Преглеждания днес",number(today.pageviews),"Отворени страници","◫") +
    metric("Сесии за 14 дни",number(totalSessions),"Сбор по дни","▥") +
    metric("Преглеждания за 14 дни",number(totalViews),"Общо зареждания","▦") + '</div>';
  html += '<section class="panel analytics-panel"><div class="panel-header"><div><h2 class="panel-title">Посещения през последните 14 дни</h2><p class="panel-subtitle">Уникални сесии на ден</p></div><span class="analytics-period">ПО ДНИ</span></div>';
  html += '<div class="daily-chart" role="img" aria-label="Сесии по дни">' + rows.map((row,i)=>{
    const visitors = Number(row.unique_sessions || 0);
    const height = Math.max(visitors ? 8:2,Math.round(visitors/max*100));
    return '<div class="chart-column"><div class="chart-value">' + number(visitors) +
      '</div><div class="chart-track"><div class="chart-bar' + (i===rows.length-1?' current':'') +
      '" style="height:' + height + '%"></div></div><span class="chart-day">' +
      esc(row.day.slice(8,10) + "." + row.day.slice(5,7)) + '</span></div>';
  }).join("") + '</div></section>';
  html += '<div class="content-grid traffic-detail"><section class="panel"><div class="panel-header"><div><h2 class="panel-title">Дневна разбивка</h2><p class="panel-subtitle">Последни 14 календарни дни</p></div></div><div class="table-scroll"><table class="data-table"><thead><tr><th>ДАТА</th><th>СЕСИИ</th><th>ПРЕГЛЕЖДАНИЯ</th></tr></thead><tbody>' +
    rows.slice().reverse().map((row)=>'<tr><td><strong>' + esc(row.day) +
    '</strong></td><td>' + number(row.unique_sessions) +
    '</td><td>' + number(row.pageviews) + '</td></tr>').join('') +
    '</tbody></table></div></section>';
  const cutoff = dailyDates(30)[0];
  const pageMap = new Map();
  const pageNames = {"/":"Начална страница","/products/":"Всички подаръци","/collections/":"Колекции","/collection/":"Отделна колекция","/product/":"Продукт","/cart/":"Количка","/about/":"За нас","/bulk/":"За събития","/contact/":"Контакти"};
  for(const item of state.pageStats) {
    if(item.day < cutoff) continue;
    const key = item.page_path;
    pageMap.set(key, (pageMap.get(key)||0)+Number(item.pageviews||0));
  }
  const popular = [...pageMap.entries()].sort((a,b)=>b[1]-a[1]).slice(0,8);
  html += '<section class="panel"><div class="panel-header"><div><h2 class="panel-title">Най-посещавани страници</h2><p class="panel-subtitle">Последни 30 дни · преглеждания</p></div></div>' +
    (popular.length ? popular.map(([path,views],i)=>
      '<div class="popular-row"><span class="popular-rank">' + String(i+1).padStart(2,"0") +
      '</span><div><strong>'+esc(pageNames[path]||path)+'</strong><small>'+esc(path)+'</small></div><span>'+number(views)+'</span></div>'
    ).join('') : blank("⌁","Все още няма посещения","Статистиката ще започне да се попълва след като посетителите дадат съгласие.")) +
    '</section></div>';
  html += '<p class="analytics-disclaimer">Стойностите са от момента на включване на аналитиката, не са исторически данни. „Уникални сесии“ не означава точен брой отделни хора. Посетителите без съгласие не се броят; автоматичният трафик също може да повлияе.</p>';
  return html;
}
function campaignsView() {
  const descriptions = {
    christmas:"Топла коледна атмосфера и празнична колекция.",
    new_year:"Подаръци за посрещането на Нова година и новогодишно настроение.",
    easter:"Пролетно настроение и великденски подаръци.",
    valentine:"Нежни акценти за подаръци с обич.",
    womens_day:"Подаръци за нея и благодарност.",
    martenitsa:"Светла пролетна кампания за Баба Марта.",
    everyday:"Универсален облик без конкретен празник."
  };
  let html = heading("ВИЗИЯ НА МАГАЗИНА", "Празнични кампании", "Избери кампания и я активирай с един бутон. Обновяват се празничните текстове, акценти и връзки в целия публичен магазин.");
  const published=CAMPAIGNS[state.publishedCampaign]?.label;
  const status=state.campaign===state.publishedCampaign?"Публикувана в магазина.":published?"В магазина още се вижда „"+published+"“. Предстои автоматично публикуване.":"Публикуваната визия не е потвърдена.";
  html += '<div class="campaign-live-preview"><div><strong>Избрана визия · '+esc(CAMPAIGNS[state.campaign]?.label)+'</strong><small>'+esc(status)+'</small></div><a href="./?campaign='+encodeURIComponent(state.campaign)+'" target="_blank" rel="noopener">Преглед на избраната визия ↗</a></div>';
  html += '<div class="campaign-grid">' +
    Object.entries(CAMPAIGNS).map(([key,c]) => {
      const active = key === state.campaign;
      return '<article class="campaign-card campaign-' + esc(key) + (active?' is-active':'') + '">' +
        '<div class="campaign-preview"><img src="' + esc(c.image) + '" alt="" loading="lazy" /><span class="campaign-preview-logo">За усмивка.</span><small>' + esc(c.eyebrow) + '</small></div><div class="campaign-card-body"><div class="campaign-title-row"><h2>' +
        esc(c.label) + '</h2>' + (active?badge("Активна"):'')+'</div><p>' + esc(descriptions[key]) +
        '</p><button type="button" data-campaign-key="' + esc(key) + '" data-busy class="' + (active?'secondary-button':'primary-button') +
        '" '+(active?'disabled':'')+'>' + (active?'Текуща визия':'Активирай тази визия')+'</button></div></article>';
    }).join("") + '</div><p class="campaign-note">Промяната не изтрива продукти и колекции. Всеки празник използва собствена категория; за да се появят продукти в нея, добави ги в съответната колекция. Коледните снимки не се използват за другите кампании.</p>';
  return html;
}
async function activateCampaign(key) {
  if (!Object.hasOwn(CAMPAIGNS,key) || state.campaign === key || state.busy) return;
  wait(true);
  try {
    const updated = await rest("gift_shop_settings?id=eq.main","PATCH", {active_campaign:key,updated_at:new Date().toISOString()});
    if (!Array.isArray(updated) || updated.length !== 1 || updated[0].active_campaign !== key) {
      throw Error("Промяната не беше потвърдена от базата.");
    }
    await loadAll();
    render();
    try {
      if (typeof BroadcastChannel !== "undefined") {
        const channel = new BroadcastChannel("zausmivka-campaign-updates-v1");
        channel.postMessage({ type: "campaign-changed", key });
        channel.close();
      }
    } catch (error) { console.warn("Campaign live preview:", error); }
    toast("Запазена е кампания „" + CAMPAIGNS[key].label + "“. Новата статична визия се публикува автоматично при следващата синхронизация.");
  } catch(error) {toast(readableError(error));}
  finally {wait(false);}
}
function branding() {
  return heading("БРАНД", "Лога и материали", "Двата одобрени варианта на логото „За усмивка.“. Файловете се пазят в сайта и са достъпни за сваляне по всяко време.") +
    '<div class="brand-assets-grid">' +
    '<article class="brand-asset-card"><div class="brand-asset-visual"><img class="brand-asset-horizontal" src="./assets/brand/za-usmivka-main.avif" alt="Основно хоризонтално лого За усмивка." width="1415" height="415" /></div>' +
    '<div class="brand-asset-info"><span class="overline">ОСНОВНО ЛОГО · №4</span><h2>За сайта и комуникацията</h2><p>Хоризонталното лого се използва в горното меню и във футъра. PNG файлът е с прозрачен фон.</p>' +
    '<a class="primary-button brand-download" href="./assets/brand/za-usmivka-main.png" download="za-usmivka-main.png">Свали основното лого (PNG)</a></div></article>' +
    '<article class="brand-asset-card"><div class="brand-asset-visual"><img class="brand-asset-sticker" src="./assets/brand/za-usmivka-sticker-print.png" alt="Пълно кръгло лого За усмивка. за стикери на кутии" width="1254" height="1254" loading="eager" decoding="async" /></div>' +
    '<div class="brand-asset-info"><span class="overline">ЛОГО ЗА ОПАКОВКИ · №3</span><h2>Кръгъл стикер за кутиите</h2><p>Пълен PNG с прозрачен фон, 1254 × 1254 px, за кръгли лепенки, опаковки и картички.</p>' +
    '<a class="primary-button brand-download" href="./assets/brand/za-usmivka-sticker-print.png" download="za-usmivka-sticker.png">Свали стикера (PNG)</a></div></article>' +
    '</div><p class="brand-asset-note">При поръчка на стикери изпрати PNG файла на печатницата и уточни желания диаметър и дали да има бял печат / подложка. Оригиналното изображение в сайта не се променя при избор на празнична визия.</p>';
}

function settings() {
  const email = state.session?.user?.email || "—";
  return heading("ПРЕДПОЧИТАНИЯ", "Настройки", "Основна информация за управлението и сигурността на магазина.") +
    '<div class="settings-grid"><article class="settings-card"><h3>Публичен имейл</h3><p>'+esc(state.contactEmail||"Все още не е въведен.")+'</p><button class="secondary-button" data-action="edit-contact">Редактирай</button></article><article class="settings-card"><span class="overline">АДМИНИСТРАТОР</span><h3>Достъп до панела</h3><p>Вписан профил: <strong>' +
    esc(email) + '</strong>. Достъпът се проверява в Supabase и се ограничава от правила на базата данни.</p></article>' +
    '<article class="settings-card"><span class="overline">КАТАЛОГ</span><h3>Снимки и продукти</h3><p>Снимките се съхраняват в отделно хранилище за магазина. Непубликуваните продукти не се виждат от посетителите.</p></article>' +
    '<article class="settings-card"><span class="overline">ПОРЪЧКИ</span><h3>Приемане на заявки</h3><p>Статус: <strong>' + (state.checkoutEnabled ? 'Активно' : 'Неактивно') + '</strong>. Сървърната проверка на цена и наличност, резервация на бройки и наложен платеж са изградени. Приемането остава изключено до публикуване на данните за търговеца и условията за доставка. Потвърждение по имейл се изпраща при настроена служебна поща.</p></article>' +
    '<article class="settings-card"><span class="overline">СИСТЕМА</span><h3>Supabase</h3><p>Данните за магазина се управляват в отделен проект. <a href="https://supabase.com/dashboard/project/ycsjfsoijafepgslzzlz" rel="noopener" target="_blank">Отвори техническото табло</a>.</p></article></div>';
}
const stockPanel=createStockPanel({state,esc,money,formInput,dialog,dialogActions,heading,rest});
function render() {
  $("#breadcrumb-current").textContent = pages[state.view];
  document.querySelectorAll("[data-view].nav-item").forEach((item) => item.classList.toggle("active", item.dataset.view === state.view));
  const content = {stock:stockPanel.stock,inquiries:stockPanel.inquiries, dashboard, products, categories, orders, analytics, campaigns: campaignsView, branding, settings }[state.view]();
  $("#workspace-content").innerHTML = content;
}
function closeMenu() {
  $("#sidebar").classList.remove("mobile-open");
  $("#sidebar-shade").hidden = true;
  $("#mobile-menu-button").setAttribute("aria-expanded", "false");
}
function setView(view) {
  if (!pages[view]) return;
  state.view = view;
  closeMenu();
  render();
  window.scrollTo({ top: 0, behavior: "instant" });
}
function slugify(value) {
  const map = { а:"a", б:"b", в:"v", г:"g", д:"d", е:"e", ж:"zh", з:"z", и:"i", й:"y", к:"k", л:"l", м:"m", н:"n", о:"o", п:"p", р:"r", с:"s", т:"t", у:"u", ф:"f", х:"h", ц:"ts", ч:"ch", ш:"sh", щ:"sht", ъ:"a", ь:"y", ю:"yu", я:"ya" };
  return String(value || "").toLocaleLowerCase("bg-BG").split("").map((ch) => map[ch] || ch).join("")
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 90);
}
function formInput(label, name, value, type = "text", required = false, placeholder = "") {
  return '<div class="field"><label for="field-' + esc(name) + '">' + esc(label) + '</label><input id="field-' + esc(name) +
    '" name="' + esc(name) + '" type="' + esc(type) + '" value="' + esc(value ?? "") +
    '" placeholder="' + esc(placeholder) + '"' + (required ? " required" : "") +
    (type === "number" ? ' min="0" step="any"' : ' maxlength="180"') + ' /></div>';
}
function dialog(title, overline, content) {
  $("#dialog-overline").textContent = overline;
  $("#dialog-title").textContent = title;
  $("#dialog-body").innerHTML = content;
  if (!$("#editor-dialog").open) $("#editor-dialog").showModal();
}
function dialogActions() {
  return '<div class="dialog-actions"><button type="button" class="secondary-button" data-action="close-dialog">Отказ</button><button class="primary-button" type="submit" data-busy>Запази промените</button></div>';
}
function productImages(product) {
  if (!product) return '<div class="note-box">Запази новия продукт като чернова, след което ще можеш да добавиш неговите снимки.</div>';
  const images = state.images.filter((image) => image.product_id === product.id).sort((a,b) => a.sort_order-b.sort_order);
  return '<section class="image-manager"><h3>Снимки на продукта</h3><p>JPEG, PNG или WebP · до 8 MB на снимка. Първата снимка е основна.</p>' +
    '<div class="image-list">' + images.map((im, index) => '<div class="image-tile"><img src="' + safeImage(im.image_url) +
      '" alt="' + esc(im.alt_text || product.name) + '" />' +
      (index === 0 ? '<span class="image-primary">ОСНОВНА</span>' :
      '<button type="button" class="image-make-primary" data-main-image="' + esc(im.id) + '">Основна</button>') +
      '<button type="button" class="image-remove" title="Премахни снимката" aria-label="Премахни снимката" data-remove-image="' +
      esc(im.id) + '">×</button></div>').join("") +
    '<button type="button" class="image-add" data-action="upload-image" data-product-id="' + esc(product.id) +
    '"><span>＋</span>Добави снимка</button></div><input id="image-file" type="file" accept="image/jpeg,image/png,image/webp" hidden /></section>';
}
function openProduct(id = null) {
  const p = state.products.find((item) => item.id === id) || null;
  const options = state.categories.map((c) => '<option value="' + esc(c.id) + '"' +
    (p?.category_id === c.id ? " selected" : "") + '>' + esc(c.name) + (c.is_active ? "" : " (скрита)") + "</option>").join("");
  let html = '<form id="edit-form" data-kind="product" data-id="' + esc(p?.id || "") + '">' +
    formInput("Име на комплекта", "name", p?.name || "", "text", true, "Напр. Коледна прегръдка") +
    formInput("Идентификатор (URL)", "slug", p?.slug || "", "text", true, "koledna-pregradka") +
    '<div class="field"><label for="field-category">Колекция</label><select id="field-category" name="category_id" required><option value="">Избери колекция</option>' +
    options + '</select>' + (!state.categories.length ? '<small>Първо създай колекция в раздел „Колекции“.</small>' : '') + '</div>' +
    '<div class="field"><label for="field-description">Описание</label><textarea id="field-description" name="description" maxlength="3500" placeholder="Какво съдържа комплектът?">' +
    esc(p?.description || "") + '</textarea></div>' +
    '<div class="field"><label>Какво има в кутията<textarea name="contents" maxlength="2000" placeholder="Един артикул и брой на ред">'+esc(p?.contents||"")+'</textarea></label></div>'+
    '<div class="field"><label>Позиция на началната страница<select name="featured_slot"><option value="">Без позиция</option>'+[1,2,3,4].map(n=>'<option value="'+n+'" '+(p?.featured_slot===n?'selected':'')+'>'+n+'</option>').join("")+'</select></label></div>'+
    '<div class="field"><label>Снимка „Как пристига подаръкът“<select name="packed_photo"><option value="">Без снимка</option>'+state.images.filter(im=>im.product_id===id).map((im,i)=>'<option value="'+esc(im.image_url)+'" '+(im.image_url===p?.packed_photo?'selected':'')+'>Снимка '+(i+1)+'</option>').join("")+'</select></label></div><div class="field-grid">'  +
    formInput("Цена (€)", "price_eur", p?.price_eur ?? "", "number", true, "0.00") +
    formInput("Бройки за продажба (до наличните компоненти)", "stock_quantity", p?.stock_quantity ?? 0, "number", true, "0") + '</div>' +
    '<label class="switch-row"><span><strong>Публикуван продукт</strong><small>' +
    (p && state.images.some((image) => image.product_id === p.id) ? "Видим за посетителите, когато е включено" : "Добави снимка, за да активираш публикуване") +
    '</small></span><input type="checkbox" name="is_published"' +
    (p?.is_published ? " checked" : "") + (p && state.images.some((image) => image.product_id === p.id) ? "" : " disabled") +
    ' /></label>' + productImages(p) + dialogActions() + "</form>";
  dialog(p ? "Редактиране на продукта" : "Нов подаръчен комплект", p ? "КАТАЛОГ / РЕДАКТИРАНЕ" : "КАТАЛОГ / ДОБАВЯНЕ", html);
  const name = $("#field-name"), slug = $("#field-slug");
  if (!p) name.addEventListener("input", () => { if (!slug.dataset.edited) slug.value = slugify(name.value); });
  slug.addEventListener("input", () => { slug.dataset.edited = "true"; });
}
function openCategory(id = null) {
  const c = state.categories.find((item) => item.id === id) || null;
  const html = '<form id="edit-form" data-kind="category" data-id="' + esc(c?.id || "") + '">' +
    formInput("Име на колекция", "name", c?.name || "", "text", true, "Напр. За Коледа") +
    formInput("Идентификатор", "slug", c?.slug || "", "text", true, "koleda") +
    '<div class="field"><label for="field-description">Описание</label><textarea id="field-description" name="description" maxlength="2000">' +
    esc(c?.description || "") + '</textarea></div>' +
    formInput("Ред на показване", "sort_order", c?.sort_order ?? 0, "number", true) +
    '<label class="switch-row"><span><strong>Активна колекция</strong><small>Неактивните колекции са скрити от публичния каталог</small></span><input type="checkbox" name="is_active"' +
    (c?.is_active !== false ? " checked" : "") + ' /></label>' + dialogActions() + "</form>";
  dialog(c ? "Редактиране на колекция" : "Нова колекция", "КОЛЕКЦИИ", html);
  if (!c) $("#field-name").addEventListener("input", () => { if (!$("#field-slug").dataset.edited) $("#field-slug").value = slugify($("#field-name").value); });
  $("#field-slug").addEventListener("input", () => { $("#field-slug").dataset.edited = "true"; });
}
function orderActionForm(o,action,label,content="",explanation="",danger=false) {
  return '<form class="order-action-form" data-order-action="' + esc(action) +
    '" data-order-id="' + esc(o.id) + '">' +
    (explanation ? '<p class="order-action-hint">' + esc(explanation) + '</p>' : '') +
    content + '<button type="submit" data-busy class="' +
    (danger ? 'secondary-button order-danger' : 'primary-button') + '">' +
    esc(label) + '</button></form>';
}
function orderStep(o) {
  let content='';
  if(o.status==="pending"){
    content+='<h3 class="order-section-title">Цена за доставка</h3>' +
      orderActionForm(o,"quote","Запази цена за доставка",
        '<label class="order-input">Доставка (€), изчислена с куриера' +
        '<input type="number" name="shipping_eur" min="0" max="500" step="0.01" inputmode="decimal" required value="' +
        (o.shipping_quote_pending ? '' : esc(o.shipping_eur)) + '" placeholder="Например 4.90" /></label>',
        "Това е ръчно въведена цена. Не е автоматична тарифа от Еконт или Спиди.");
    if(!o.shipping_quote_pending){
      content+='<h3 class="order-section-title">Потвърждение от клиента</h3>' +
        orderActionForm(o,"confirm","Потвърди поръчката",
          '<label class="order-check"><input type="checkbox" name="confirmed_with_customer" required />' +
          '<span>Уточних с клиента цената на доставката и той прие крайната сума.</span></label>',
          "След потвърждението можеш да подготвиш пратката.");
    }
  }else if(o.status==="confirmed"){
    content+='<h3 class="order-section-title">Подготовка</h3>' +
      orderActionForm(o,"prepare","Започни подготовка","",
        "Поръчката е потвърдена. Подготви подаръчния комплект за изпращане.");
  }else if(o.status==="preparing"){
    content+='<h3 class="order-section-title">Изпращане</h3>' +
      orderActionForm(o,"ship","Отбележи като изпратена",
        '<label class="order-input">Номер на товарителница' +
        '<input type="text" name="waybill_number" minlength="5" maxlength="80" required autocomplete="off" placeholder="Номер от Еконт или Спиди" /></label>',
        "Създай товарителницата при куриера и въведи номера ѝ тук. Сайтът още не я създава автоматично.");
  }else if(o.status==="shipped"||o.status==="delivered"){
    content+='<h3 class="order-section-title">Товарителница</h3>' +
      orderActionForm(o,"correct_waybill","Запази номера",
        '<label class="order-input">Номер на товарителница' +
        '<input type="text" name="waybill_number" minlength="5" maxlength="80" required value="' +
        esc(o.waybill_number || "") + '" /></label>',
        "Можеш да поправиш сгрешен номер, без да променяш статуса.");
    if(o.status==="shipped"){
      content+=orderActionForm(o,"deliver","Отбележи като доставена","",
        "Направи това, след като провериш действителното доставяне при куриера.");
    }
  }
  if(["pending","confirmed","preparing"].includes(o.status)){
    content+='<div class="order-cancel-action"><h3 class="order-section-title">Анулиране</h3>' +
      orderActionForm(o,"cancel","Анулирай поръчката","",
        "Само преди изпращане. Резервираните бройки се връщат в наличност.",true)+'</div>';
  }
  if(o.status==="cancelled")content+='<p class="order-readonly">Поръчката е анулирана. Наличността вече е възстановена.</p>';
  return content;
}
function orderReturnActions(o) {
  if(!o.withdrawal_requested_at)return "";
  let html='<section class="order-return-panel"><h3>Заявено връщане</h3>' +
    '<p><strong>Получено на:</strong> ' + esc(new Date(o.withdrawal_requested_at).toLocaleString("bg-BG")) +
    '</p>' +
    (o.withdrawal_note ? '<p><strong>Съобщение от клиента:</strong> ' + esc(o.withdrawal_note) + '</p>' : '') +
    '<p>Потвърждение по имейл: <strong>' +
    (o.withdrawal_ack_email_sent_at ? 'изпратено' : 'не е потвърдено изпращане') + '</strong></p>';
  if(o.return_in_transit_at)
    html+='<p>Обратно изпращане: ' + esc(date(o.return_in_transit_at)) + '</p>';
  if(o.return_received_at)
    html+='<p>Физически получена: ' + esc(date(o.return_received_at)) + '</p>';
  if(o.return_refunded_at)
    html+='<p>Възстановена сума: ' + esc(date(o.return_refunded_at)) + '</p>';
  if(!o.return_received_at){
    if(!o.return_in_transit_at)
      html+=orderActionForm(o,"return_transit","Отбележи, че пратката се връща");
    html+=orderActionForm(o,"return_received","Отбележи получено връщане",
      '<label class="order-check"><input type="checkbox" name="restore_stock" />' +
      '<span>Проверих артикулите и са годни за повторна продажба — върни бройките в наличност.</span></label>',
      "Отбележи получена пратка само след физическото ѝ пристигане. Наличността се възстановява само при отметка.");
  }else{
    if(!o.return_stock_restored_at)
      html+=orderActionForm(o,"restore_stock","Върни артикулите в наличност",
        '<label class="order-check"><input type="checkbox" name="confirmed_with_customer" required />' +
        '<span>Проверих върнатите артикули и всички са годни за нова продажба.</span></label>',
        "Еднократно действие след физическа проверка.");
    else html+='<p class="order-readonly">Наличността е възстановена на ' +
      esc(date(o.return_stock_restored_at)) + '.</p>';
    if(!o.return_refunded_at)
      html+=orderActionForm(o,"return_refunded","Отбележи възстановена сума",
        '<label class="order-check"><input type="checkbox" name="confirmed_with_customer" required />' +
        '<span>Реално възстанових дължимата сума на клиента.</span></label>',
        "Това е ръчно счетоводно отбелязване — не извършва превод.");
    else html+='<p class="order-readonly">Връщането е приключено — сумата е отбелязана като възстановена.</p>';
  }
  return html+'</section>';
}
function openOrder(id) {
  const o=state.orders.find(item=>item.id===id);
  if(!o)return;
  const items=state.orderItems.filter(item=>item.order_id===id);
  const delivery=[o.delivery_courier==="econt"?"Еконт":o.delivery_courier==="speedy"?"Спиди":o.delivery_courier,
    o.delivery_method?.endsWith("_office")?"До офис":"До адрес",o.delivery_city,o.delivery_address]
    .filter(Boolean).join(", ");
  const html='<div class="order-detail">' +
    '<div class="order-detail-summary"><span>' + badge(statuses[o.status]||o.status,o.status) +
    (o.withdrawal_requested_at ? '<span class="order-return-flag">' + esc(returnLabel(o)) + '</span>' : '') +
    '</span><span>Създадена ' + esc(date(o.created_at)) + '</span></div>' +
    '<div class="field-grid order-customer"><div><strong>Получател</strong><p>' +
    esc(o.customer_name) + '</p></div><div><strong>Телефон</strong><p>' + esc(o.customer_phone) +
    '</p></div><div><strong>Имейл</strong><p>' + esc(o.customer_email||"—") +
    '</p></div><div><strong>Куриер</strong><p>' +
    esc(o.delivery_courier==="econt"?"Еконт":o.delivery_courier==="speedy"?"Спиди":o.delivery_courier||"—") +
    '</p></div></div>' +
    '<div class="note-box order-delivery"><strong>Доставка</strong><p>' + esc(delivery||"Не е посочена") + '</p>' +
    '<button type="button" class="table-action" data-order-copy="' + esc(o.id) +
    '">Копирай данните за доставка</button>' +
    (o.customer_note ? '<p><strong>Бележка:</strong> ' + esc(o.customer_note) + '</p>' : '') +
    '</div>' +
    '<section class="order-products"><h3 class="order-section-title">Продукти</h3>' +
    (items.length?items.map(i=>'<div class="list-row"><div class="row-main"><strong>' +
    esc(i.product_name) + '</strong><small>' + esc(i.quantity + " × " + money(i.unit_price_eur)) +
    '</small></div><strong>' + esc(money(i.quantity*i.unit_price_eur)) + '</strong></div>').join("") :
    '<p>Липсват данни за артикулите.</p>') +
    '</section>' +
    '<div class="order-totals"><div><span>Продукти (наложен платеж)</span><strong>' +
    esc(money(o.subtotal_eur)) + '</strong></div>' +
    '<div><span>Доставка' + (o.shipping_quote_pending?" (неуточнена)":" (отделно при куриера)") +
    '</span><strong>' + (o.shipping_quote_pending?"Предстои":esc(money(o.shipping_eur))) + '</strong></div>' +
    (o.shipping_quote_pending?"":'<div class="order-total-final"><span>Общо за клиента</span><strong>' +
    esc(money(o.total_eur)) + '</strong></div>') +
    '</div>' +
    (o.customer_shipping_confirmed_at ? '<p class="order-readonly">Уточнено с клиента: ' +
       esc(date(o.customer_shipping_confirmed_at)) + '</p>' : '') +
    '<div class="order-steps">' + orderStep(o) + '</div>' +
    orderReturnActions(o) +
    '<p class="order-admin-notice">Статусите се обновяват в базата. Автоматични имейли и товарителници още не се изпращат от този панел.</p></div>';
  dialog("Поръчка "+orderCode(o),"ПОРЪЧКИ / ДЕТАЙЛИ",html);
}
async function submitOrderAction(form) {
  if(state.busy)return;
  const id=form.dataset.orderId,action=form.dataset.orderAction;
  const o=state.orders.find(item=>item.id===id);
  if(!o)return;
  const f=new FormData(form);
  const payload={
    p_order_id:id,p_action:action,p_expected_updated_at:o.updated_at,
    p_confirmed_with_customer:f.get("confirmed_with_customer")==="on",
    p_restore_stock:f.get("restore_stock")==="on"
  };
  if(action==="quote"){
    const input=String(f.get("shipping_eur")||"").trim();
    if(!input) {toast("Въведи цена за доставка.");return}
    payload.p_shipping_eur=Number(input.replace(",","."));
  }
  if(action==="ship"||action==="correct_waybill"){
    payload.p_waybill_number=String(f.get("waybill_number")||"").trim();
  }
  const confirmMessages={
    cancel:"Да анулирам ли поръчката? Резервираните бройки ще се върнат в наличност.",
    ship:"Пратката действително ли е предадена на куриера? Записаният статус ще стане „Изпратена“.",
    deliver:"Проверена ли е реалната доставка на пратката?",
    return_received:payload.p_restore_stock
      ?"Получена и проверена ли е пратката? Бройките ще бъдат върнати в наличност."
      :"Получена ли е физически пратката? Наличността НЯМА да бъде възстановена.",
    restore_stock:"Потвърждаваш ли, че продуктите са годни за продажба? Бройките ще се добавят точно веднъж.",
    return_refunded:"Парите действително ли са възстановени? Това не извършва автоматично плащане."
  };
  if(confirmMessages[action]&&!window.confirm(confirmMessages[action]))return;
  wait(true);
  try{
    await rest("rpc/gift_admin_order_action","POST",payload);
    await loadAll();
    render();
    openOrder(id);
    const success={
      quote:"Цената за доставка е запазена.",confirm:"Поръчката е потвърдена.",
      prepare:"Поръчката е в подготовка.",ship:"Пратката е отбелязана като изпратена.",
      correct_waybill:"Товарителницата е обновена.",deliver:"Пратката е отбелязана като доставена.",
      cancel:"Поръчката е анулирана и наличността е възстановена.",
      return_transit:"Връщането е отбелязано като изпратено обратно.",
      return_received:"Върнатата пратка е отбелязана като получена.",
      restore_stock:"Наличността е възстановена.",return_refunded:"Възстановяването на сумата е отбелязано."
    };
    toast(success[action]||"Поръчката е обновена.");
  }catch(error){
    toast(readableError(error));
  }finally{wait(false)}
}
async function copyOrderDelivery(id){
  const o=state.orders.find(item=>item.id===id);
  if(!o)return;
  const text=[orderCode(o),"Получател: "+o.customer_name,
    "Телефон: "+o.customer_phone,
    "Имейл: "+(o.customer_email||"—"),
    "Куриер: "+(o.delivery_courier==="econt"?"Еконт":"Спиди"),
    "Населено място: "+(o.delivery_city||"—"),
    "Офис/адрес: "+(o.delivery_address||"—"),
    "Продукти (наложен платеж): "+money(o.subtotal_eur),
    "Доставка: "+(o.shipping_quote_pending?"неуточнена":money(o.shipping_eur))].join("\n");
  try{await navigator.clipboard.writeText(text);toast("Данните за доставка са копирани.")}
  catch{toast("Браузърът не позволи копиране.")}
}
async function saveForm(form) {
  if (state.busy) return;
  wait(true);
  const kind = form.dataset.kind, id = form.dataset.id, f = new FormData(form);
  try {
    if(kind==="part"||kind==="recipe"){
      await stockPanel.save(kind,form,f);$("#editor-dialog").close();await loadAll();render();toast("Запазено.");return;
    }
    if(kind==="contact"){
      const rows=await rest("gift_shop_settings?id=eq.main","PATCH",{contact_email:String(f.get("email")||"").trim()});
      if(!rows?.length)throw Error("Промяната не е записана.");
      $("#editor-dialog").close();await loadAll();render();toast("Публичният контакт е обновен.");return;
    }
    if (kind === "product") {
      if (!state.categories.length) throw Error("Първо създай поне една колекция.");
      const name = String(f.get("name") || "").trim(), slug = String(f.get("slug") || "").trim();
      const amount = Number(f.get("price_eur")), stock = Number(f.get("stock_quantity"));
      if (!name || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) throw Error("Попълни име и валиден идентификатор с латински букви.");
      if (!Number.isFinite(amount) || amount < 0 || !Number.isInteger(stock) || stock < 0) throw Error("Цената и наличността трябва да са валидни положителни стойности или нула.");
      const selectedCategory = state.categories.find((c) => c.id === f.get("category_id"));
      if (!selectedCategory) throw Error("Избери валидна колекция.");
      const publish = form.elements.is_published.checked;
      if (publish && (!selectedCategory.is_active || amount <= 0 || !state.images.some((im) => im.product_id === id))) {
        throw Error("За публикуване са нужни активна колекция, цена над 0 € и поне една снимка.");
      }
      const payload = { name, slug, category_id: f.get("category_id"), description: String(f.get("description") || "").trim(),
        price_eur: amount, contents:String(f.get("contents")||"").trim(), featured_slot:Number(f.get("featured_slot"))||null, packed_photo:f.get("packed_photo")||null, is_published: publish,
        ...(!id || state.products.find(p=>p.id===id)?.stock_quantity!==stock ? {stock_quantity:stock}:{}) };
      const result = await rest("gift_products" + (id ? "?id=eq." + encodeURIComponent(id) : ""), id ? "PATCH" : "POST", payload);
      const savedId = id || result?.[0]?.id;
      await loadAll();
      render();
      if (savedId) openProduct(savedId);
      else $("#editor-dialog").close();
      toast(id ? "Продуктът е обновен." : "Продуктът е създаден.");
    } else if (kind === "category") {
      const name = String(f.get("name") || "").trim(), slug = String(f.get("slug") || "").trim();
      if (!name || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) throw Error("Въведи име и идентификатор с латински букви.");
      const order = Number(f.get("sort_order"));
      if (!Number.isInteger(order) || order < 0) throw Error("Редът трябва да е цяло число, не по-малко от нула.");
      const payload = { name, slug, description: String(f.get("description") || "").trim(), sort_order: order, is_active: form.elements.is_active.checked };
      await rest("gift_categories" + (id ? "?id=eq." + encodeURIComponent(id) : ""), id ? "PATCH" : "POST", payload);
      $("#editor-dialog").close(); await loadAll(); render(); toast("Колекцията е запазена.");
    }
  } catch (error) { toast(readableError(error)); }
  finally { wait(false); }
}
async function uploadImage(productId, file) {
  if (!file) return;
  if (!["image/jpeg","image/png","image/webp"].includes(file.type)) { toast("Използвай JPEG, PNG или WebP."); return; }
  if (file.size > 8 * 1024 * 1024) { toast("Максималният размер е 8 MB."); return; }
  if (!state.products.some((item) => item.id === productId)) return;
  if (state.busy) return;
  wait(true);
  const ext = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" }[file.type];
  const path = productId + "/" + crypto.randomUUID() + "." + ext;
  try {
    if (Date.now() > state.session.expires_at - 45000) await refresh();
    const result = await fetch(base + "/storage/v1/object/gift-product-images/" + path, {
      method: "POST",
      headers: { apikey: key, Authorization: "Bearer " + state.session.access_token, "Content-Type": file.type, "x-upsert": "false" },
      body: file
    });
    if (!result.ok) {
      const data = await result.json().catch(() => ({}));
      throw Error(data.message || data.error || "Качването не беше успешно.");
    }
    const images = state.images.filter((item) => item.product_id === productId);
    const image_url = base + "/storage/v1/object/public/gift-product-images/" + path;
    try {
      await rest("gift_product_images", "POST", {
        product_id: productId, image_url, alt_text: state.products.find((p) => p.id === productId)?.name || "Подаръчен комплект",
        sort_order: images.length ? Math.max(...images.map((im) => im.sort_order || 0)) + 1 : 0
      });
    } catch (error) {
      await deleteStoredImage(image_url).catch(() => {});
      throw error;
    }
    await loadAll(); render(); openProduct(productId);
    toast("Снимката е добавена.");
  } catch (error) { toast(readableError(error)); }
  finally { wait(false); }
}
async function deleteStoredImage(imageURL) {
  const prefix = base + "/storage/v1/object/public/gift-product-images/";
  if (!imageURL.startsWith(prefix)) return;
  if (Date.now() > state.session.expires_at - 45000) await refresh();
  const response = await fetch(base + "/storage/v1/object/gift-product-images", {
    method: "DELETE",
    headers: { apikey: key, Authorization: "Bearer " + state.session.access_token, "Content-Type": "application/json" },
    body: JSON.stringify({ prefixes: [imageURL.slice(prefix.length)] })
  });
  if (!response.ok) throw Error("Файлът не можа да бъде изтрит от хранилището.");
  return response;
}
async function makeImagePrimary(id) {
  const image = state.images.find((item) => item.id === id);
  if (!image || state.busy) return;
  const ordered = state.images.filter((item) => item.product_id === image.product_id).sort((a,b) => a.sort_order-b.sort_order);
  const first = ordered[0];
  if (!first || first.id === id) return;
  wait(true);
  try {
    const previousOrder = first.sort_order;
    await rest("gift_product_images?id=eq." + encodeURIComponent(first.id), "PATCH", { sort_order: image.sort_order });
    await rest("gift_product_images?id=eq." + encodeURIComponent(image.id), "PATCH", { sort_order: previousOrder });
    await loadAll(); render(); openProduct(image.product_id); toast("Основната снимка е променена.");
  } catch (error) { toast(readableError(error)); }
  finally { wait(false); }
}
async function removeImage(id) {
  const im = state.images.find((item) => item.id === id);
  if (!im || !window.confirm("Премахване на тази снимка от продукта?")) return;
  if (state.busy) return;
  wait(true);
  try {
    await rest("gift_product_images?id=eq." + encodeURIComponent(id), "DELETE");
    await deleteStoredImage(im.image_url).catch(() => {});
    const remaining = state.images.filter((item) => item.product_id === im.product_id && item.id !== id);
    const current = state.products.find((item) => item.id === im.product_id);
    if (!remaining.length && current?.is_published) {
      await rest("gift_products?id=eq." + encodeURIComponent(current.id), "PATCH", { is_published: false });
    }
    await loadAll(); render(); openProduct(im.product_id);
    toast(remaining.length ? "Снимката е премахната." : "Снимката е премахната. Продуктът остава чернова, докато няма снимка.");
  } catch (error) { toast(readableError(error)); }
  finally { wait(false); }
}
function handleClick(event) {
  const button = event.target.closest("button");
  if (!button) return;
  if(button.dataset.editPart || button.dataset.action==="new-part")return stockPanel.editPart(button.dataset.editPart);
  if(button.dataset.recipe)return stockPanel.editRecipe(button.dataset.recipe);
  if(button.dataset.handleInquiry)return rest("gift_inquiries?id=eq."+button.dataset.handleInquiry,"PATCH",{handled:true}).then(reload).catch(e=>toast(readableError(e)));
  if(button.dataset.action==="edit-contact")return dialog("Публичен контакт","НАСТРОЙКИ",'<form data-kind="contact">'+formInput("Имейл за клиенти","email",state.contactEmail,"email")+dialogActions()+'</form>');
  if (button.dataset.view) return setView(button.dataset.view);
  if (button.dataset.editProduct) return openProduct(button.dataset.editProduct);
  if (button.dataset.editCategory) return openCategory(button.dataset.editCategory);
  if (button.dataset.order) return openOrder(button.dataset.order);
  if (button.dataset.orderCopy) return copyOrderDelivery(button.dataset.orderCopy);
  if (button.dataset.action === "refresh-orders") return reload();
  if (button.dataset.removeImage) return removeImage(button.dataset.removeImage);
  if (button.dataset.mainImage) return makeImagePrimary(button.dataset.mainImage);
  if (button.dataset.campaignKey) return activateCampaign(button.dataset.campaignKey);
  if (button.dataset.action === "new-product") return openProduct();
  if (button.dataset.action === "new-category") return openCategory();
  if (button.dataset.action === "close-dialog") return $("#editor-dialog").close();
  if (button.dataset.action === "upload-image") return $("#image-file")?.click();
}
async function start() {
  try {
    if (!base.startsWith("https://") || !key.startsWith("sb_publishable_")) throw Error("Липсва конфигурацията за магазина.");
    const saved = JSON.parse(sessionStorage.getItem(STORE_KEY) || "null");
    if (!saved?.refresh_token) { showLogin(); return; }
    state.session = saved;
    await refresh();
    await authorize();
    showWorkspace();
    await reload();
  } catch (error) {
    clearSession();
    showLogin(readableError(error));
  }
}
$("#login-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  if (state.busy) return;
  const submit = $("#login-submit");
  submit.disabled = true;
  $("#login-error").hidden = true;
  try {
    await tokenRequest("password", { email: $("#login-email").value.trim(), password: $("#login-password").value });
    await authorize();
    showWorkspace();
    await reload();
  } catch (error) {
    clearSession();
    showLogin(readableError(error));
  } finally { submit.disabled = false; }
});
$("#logout-button").addEventListener("click", () => signOut());
$("#mobile-menu-button").addEventListener("click", () => {
  const opened = !$("#sidebar").classList.contains("mobile-open");
  $("#sidebar").classList.toggle("mobile-open", opened);
  $("#sidebar-shade").hidden = !opened;
  $("#mobile-menu-button").setAttribute("aria-expanded", String(opened));
});
$("#sidebar-shade").addEventListener("click", closeMenu);
$("#dialog-close").addEventListener("click", () => $("#editor-dialog").close());
document.addEventListener("click", handleClick);
$("#editor-dialog").addEventListener("submit", (event) => {
  if (event.target.matches("form[data-order-action]")) { event.preventDefault(); submitOrderAction(event.target); }
  else if (event.target.matches("form[data-kind]")) { event.preventDefault(); saveForm(event.target); }
});
document.addEventListener("change", (event) => {
  if (event.target.id === "order-filter") {
    state.orderFilter = event.target.value;
    $("#orders-data-panel").innerHTML = orderList();
  } else if (event.target.id === "product-filter") {
    state.productFilter = event.target.value;
    $("#products-data-panel").innerHTML = productList();
  } else if (event.target.id === "image-file") {
    const form = $("#edit-form");
    if (form?.dataset.kind === "product" && form.dataset.id) uploadImage(form.dataset.id, event.target.files?.[0]);
  }
});
document.addEventListener("input", (event) => {
  if (event.target.id === "order-search") {
    state.orderSearch = event.target.value;
    $("#orders-data-panel").innerHTML = orderList();
  } else if (event.target.id === "product-search") {
    state.search = event.target.value;
    $("#products-data-panel").innerHTML = productList();
  }
});
start();
