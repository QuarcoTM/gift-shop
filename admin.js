import { config } from "./site-config.js";
import { CAMPAIGNS } from "./campaigns.js";

/* Store operations use only the public publishable key. Authorization is enforced
   by Supabase Auth + database/storage RLS; never by hiding interface elements. */
const base = String(config.supabaseUrl || "").replace(/\/+$/, "");
const key = String(config.supabasePublishableKey || "");
const STORE_KEY = "sabrano_admin_session_v1";
const $ = (selector) => document.querySelector(selector);
const money = (amount) => new Intl.NumberFormat("bg-BG", { style: "currency", currency: "EUR" }).format(Number(amount) || 0);
const number = (value) => new Intl.NumberFormat("bg-BG").format(value || 0);
const date = (value) => value ? new Intl.DateTimeFormat("bg-BG", { day: "2-digit", month: "short", year: "numeric" }).format(new Date(value)) : "—";
const escapes = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
const esc = (value) => String(value ?? "").replace(/[&<>"']/g, (c) => escapes[c]);
const statuses = { pending: "Нова", confirmed: "Потвърдена", preparing: "Подготовка", shipped: "Изпратена", delivered: "Доставена", cancelled: "Отказана" };
const pages = { dashboard: "Общ преглед", products: "Продукти", categories: "Колекции", orders: "Поръчки", analytics: "Статистика", campaigns: "Празнична визия", settings: "Настройки" };
const state = { session: null, categories: [], products: [], images: [], orders: [], orderItems: [], dailyStats: [], pageStats: [], campaign: "christmas", view: "dashboard", search: "", productFilter: "all", busy: false };
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
    "gift_shop_settings?select=id,active_campaign&id=eq.main&limit=1"
  ];
  const [categories, products, images, orders, orderItems, dailyStats, pageStats, shopSettings] = await Promise.all(requests.map((path) => rest(path)));
  state.categories = categories || [];
  state.products = products || [];
  state.images = images || [];
  state.orders = orders || [];
  state.orderItems = orderItems || [];
  state.dailyStats = dailyStats || [];
  state.pageStats = pageStats || [];
  state.campaign = shopSettings?.[0]?.active_campaign || "christmas";
  $("#nav-product-count").textContent = number(products.length);
  $("#nav-order-count").textContent = number(orders.filter((item) => item.status === "pending").length);
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
function badge(text, kind = "") {
  return '<span class="status-tag ' + esc(kind) + '">' + esc(text) + "</span>";
}
function blank(icon, title, content, action = "") {
  return '<div class="empty-space"><span class="empty-icon" aria-hidden="true">' + icon + '</span><h3>' + esc(title) +
    '</h3><p>' + esc(content) + '</p>' + action + "</div>";
}
function metric(title, value, note, icon, alert = false) {
  return '<div class="metric-card' + (alert ? " alert" : "") + '"><div class="metric-head"><span class="metric-title">' + esc(title) +
    '</span><span class="metric-symbol">' + icon + '</span></div><strong>' + esc(value) + '</strong><small>' + esc(note) + "</small></div>";
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
    '<button class="quick-action" type="button" data-action="new-product"><span class="quick-icon">＋</span><span><strong>Нов подаръчен комплект</strong><small>Добави информация, цена и снимки</small></span><span class="quick-chevron">›</span></button>' +
    '<button class="quick-action" type="button" data-action="new-category"><span class="quick-icon">▤</span><span><strong>Нова колекция</strong><small>Организирай асортимента по поводи</small></span><span class="quick-chevron">›</span></button>' +
    '<button class="quick-action" type="button" data-view="products"><span class="quick-icon">▦</span><span><strong>Управление на наличности</strong><small>Следи наличните и публикуваните артикули</small></span><span class="quick-chevron">›</span></button>' +
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
function orders() {
  let html = heading("ПРОДАЖБИ", "Поръчки", "Преглеждай заявките и отбелязвай етапа на изпълнение. Приемането на онлайн поръчки предстои.");
  html += '<section class="data-panel">';
  if (!state.orders.length) html += blank("▧", "Все още няма поръчки", "Тук ще следиш клиентите, доставката, сумите и статуса след активиране на поръчките.");
  else {
    html += '<div class="table-scroll"><table class="data-table"><thead><tr><th>ПОРЪЧКА</th><th>КЛИЕНТ</th><th>ДАТА</th><th>СУМА</th><th>СТАТУС</th><th></th></tr></thead><tbody>';
    html += state.orders.map((o) => '<tr><td><strong>#' + esc(String(o.id).slice(0, 8).toUpperCase()) +
      '</strong></td><td>' + esc(o.customer_name) + '</td><td>' + esc(date(o.created_at)) + '</td><td>' +
      esc(money(o.total_eur)) + '</td><td>' + badge(statuses[o.status] || o.status, o.status) +
      '</td><td><button class="table-action" type="button" data-order="' + esc(o.id) + '">Отвори</button></td></tr>').join("");
    html += '</tbody></table></div><div class="table-bottom"><span>' + number(state.orders.length) + ' поръчки</span><span>Сортирани по дата</span></div>';
  }
  return html + "</section>";
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
    easter:"Пролетно настроение и великденски подаръци.",
    valentine:"Нежни акценти за подаръци с обич.",
    womens_day:"Подаръци за нея и благодарност.",
    martenitsa:"Светла пролетна кампания за Баба Марта.",
    everyday:"Универсален облик без конкретен празник."
  };
  let html = heading("ВИЗИЯ НА МАГАЗИНА", "Празнични кампании", "Избери кампания и я активирай с един бутон. Обновяват се празничните текстове, акценти и връзки в целия публичен магазин.");
  html += '<div class="campaign-grid">' +
    Object.entries(CAMPAIGNS).map(([key,c]) => {
      const active = key === state.campaign;
      return '<article class="campaign-card campaign-' + esc(key) + (active?' is-active':'') + '">' +
        '<div class="campaign-preview"><span class="campaign-preview-logo">събрано.</span><span class="campaign-preview-mark">' + esc(c.mark) +
        '</span><small>' + esc(c.eyebrow) + '</small></div><div class="campaign-card-body"><div class="campaign-title-row"><h2>' +
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
    toast("Активирана е кампания „" + CAMPAIGNS[key].label + "“.");
  } catch(error) {toast(readableError(error));}
  finally {wait(false);}
}
function settings() {
  const email = state.session?.user?.email || "—";
  return heading("ПРЕДПОЧИТАНИЯ", "Настройки", "Основна информация за управлението и сигурността на магазина.") +
    '<div class="settings-grid"><article class="settings-card"><span class="overline">АДМИНИСТРАТОР</span><h3>Достъп до панела</h3><p>Вписан профил: <strong>' +
    esc(email) + '</strong>. Достъпът се проверява в Supabase и се ограничава от правила на базата данни.</p></article>' +
    '<article class="settings-card"><span class="overline">КАТАЛОГ</span><h3>Снимки и продукти</h3><p>Снимките се съхраняват в отделно хранилище за магазина. Непубликуваните продукти не се виждат от посетителите.</p></article>' +
    '<article class="settings-card"><span class="overline">ПОРЪЧКИ</span><h3>Онлайн финализиране</h3><p>Все още е <strong>неактивно</strong>. Предстоят сървърна валидация на цени и наличности, доставка и плащане.</p></article>' +
    '<article class="settings-card"><span class="overline">СИСТЕМА</span><h3>Supabase</h3><p>Данните за магазина се управляват в отделен проект. <a href="https://supabase.com/dashboard/project/ycsjfsoijafepgslzzlz" rel="noopener" target="_blank">Отвори техническото табло</a>.</p></article></div>';
}
function render() {
  $("#breadcrumb-current").textContent = pages[state.view];
  document.querySelectorAll("[data-view].nav-item").forEach((item) => item.classList.toggle("active", item.dataset.view === state.view));
  const content = { dashboard, products, categories, orders, analytics, campaigns: campaignsView, settings }[state.view]();
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
    esc(p?.description || "") + '</textarea></div><div class="field-grid">' +
    formInput("Цена (€)", "price_eur", p?.price_eur ?? "", "number", true, "0.00") +
    formInput("Налични бройки", "stock_quantity", p?.stock_quantity ?? 0, "number", true, "0") + '</div>' +
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
function openOrder(id) {
  const o = state.orders.find((item) => item.id === id);
  if (!o) return;
  const items = state.orderItems.filter((item) => item.order_id === id);
  const statusOpts = Object.entries(statuses).map(([value,label]) => '<option value="' + value + '"' +
    (value === o.status ? " selected" : "") + '>' + label + '</option>').join("");
  const html = '<div class="field-grid"><div class="field"><label>Клиент</label><p>' + esc(o.customer_name) +
    '</p></div><div class="field"><label>Дата</label><p>' + esc(date(o.created_at)) + '</p></div>' +
    '<div class="field"><label>Телефон</label><p>' + esc(o.customer_phone) + '</p></div>' +
    '<div class="field"><label>Имейл</label><p>' + esc(o.customer_email || "—") + '</p></div></div>' +
    '<div class="note-box"><strong>Доставка:</strong> ' + esc([o.delivery_method, o.delivery_city, o.delivery_address].filter(Boolean).join(", ") || "Не е посочена") +
    (o.customer_note ? '<p style="margin:9px 0 0">Бележка: ' + esc(o.customer_note) + '</p>' : "") + '</div>' +
    '<section class="panel"><div class="panel-header"><h3 class="panel-title">Артикули</h3></div>' +
    (items.length ? items.map((item) => '<div class="list-row"><div class="row-main"><strong>' +
      esc(item.product_name) + '</strong><small>' + esc(item.quantity + " × " + money(item.unit_price_eur)) +
      '</small></div><strong>' + esc(money(item.quantity * item.unit_price_eur)) + '</strong></div>').join("") :
      '<div class="list-row">Няма данни за артикули.</div>') +
    '</section><div class="table-bottom"><span>Обща сума</span><strong>' + esc(money(o.total_eur)) + '</strong></div>' +
    '<form id="edit-form" data-kind="order" data-id="' + esc(o.id) + '"><div class="field"><label for="field-status">Статус</label><select id="field-status" name="status">' +
    statusOpts + '</select></div>' + dialogActions() + "</form>";
  dialog("Поръчка #" + String(o.id).slice(0,8).toUpperCase(), "ПОРЪЧКИ / ДЕТАЙЛИ", html);
}
async function saveForm(form) {
  if (state.busy) return;
  wait(true);
  const kind = form.dataset.kind, id = form.dataset.id, f = new FormData(form);
  try {
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
        price_eur: amount, stock_quantity: stock, is_published: publish };
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
    } else if (kind === "order") {
      const status = String(f.get("status") || "");
      if (!statuses[status]) throw Error("Невалиден статус.");
      await rest("gift_orders?id=eq." + encodeURIComponent(id), "PATCH", { status });
      $("#editor-dialog").close(); await loadAll(); render(); toast("Статусът е обновен.");
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
  if (button.dataset.view) return setView(button.dataset.view);
  if (button.dataset.editProduct) return openProduct(button.dataset.editProduct);
  if (button.dataset.editCategory) return openCategory(button.dataset.editCategory);
  if (button.dataset.order) return openOrder(button.dataset.order);
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
  if (event.target.matches("form[data-kind]")) { event.preventDefault(); saveForm(event.target); }
});
document.addEventListener("change", (event) => {
  if (event.target.id === "product-filter") {
    state.productFilter = event.target.value;
    $("#products-data-panel").innerHTML = productList();
  } else if (event.target.id === "image-file") {
    const form = $("#edit-form");
    if (form?.dataset.kind === "product" && form.dataset.id) uploadImage(form.dataset.id, event.target.files?.[0]);
  }
});
document.addEventListener("input", (event) => {
  if (event.target.id === "product-search") {
    state.search = event.target.value;
    $("#products-data-panel").innerHTML = productList();
  }
});
start();
