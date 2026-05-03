import { APP_CONFIG, firebaseConfig } from './config.js';
import { LOCAL_SEED } from './seed.js';
import { PAYMENT_METHODS as PAYMENT_METHODS_DEFAULT } from './payment-methods.js';

const _AH = 'a694b9ec76658412817fdef610593e4276b7e33c8c9103a34a3cd90cd1d12bd3';

// ─── Cloudinary ───────────────────────────────────────────────────────────────
const CDN_CLOUD   = APP_CONFIG.CLOUDINARY?.cloudName    || 'ddjn3ozpm';
const CDN_PRESET  = APP_CONFIG.CLOUDINARY?.uploadPreset || 'products_unsigned';
const CDN_FOLDER  = APP_CONFIG.CLOUDINARY?.productsFolder || 'adnanstore/products';
const CDN_RECEIPTS_FOLDER = 'adnanstore/receipts';
const CDN_UPLOAD_URL = `https://api.cloudinary.com/v1_1/${CDN_CLOUD}/image/upload`;
// ─────────────────────────────────────────────────────────────────────────────

const $ = (selector, parent = document) => parent.querySelector(selector);
const $$ = (selector, parent = document) => [...parent.querySelectorAll(selector)];
const PAGE = document.body.dataset.page || 'home';
const CART_KEY = APP_CONFIG.CART_STORAGE_KEY || 'adnan_cart_v1';
const CURRENCY_KEY = APP_CONFIG.CURRENCY_STORAGE_KEY || 'adnan_currency_v1';
const COLLECTIONS = APP_CONFIG.COLLECTIONS;
const USERS_KEY = 'adnan_users_v1';
const AUTH_KEY = 'adnan_auth_v1';
const AUTH_FLOW_KEY = 'adnan_auth_flow_v1';
const ORDERS_KEY = 'adnan_manual_orders_v1';
const LOCAL_CMS_KEY = 'adnan_cms_local_v1';

const createSafeStorage = () => {
  let backend = null;
  try {
    const probe = '__storage_probe__';
    globalThis.localStorage?.setItem(probe, '1');
    globalThis.localStorage?.removeItem(probe);
    backend = globalThis.localStorage;
  } catch {}
  const memory = new Map();
  return {
    getItem(key) {
      try {
        return backend ? backend.getItem(key) : (memory.has(key) ? memory.get(key) : null);
      } catch {
        return memory.has(key) ? memory.get(key) : null;
      }
    },
    setItem(key, value) {
      const normalized = String(value);
      try {
        if (backend) backend.setItem(key, normalized);
        else memory.set(key, normalized);
      } catch {
        memory.set(key, normalized);
      }
    },
    removeItem(key) {
      try { if (backend) backend.removeItem(key); } catch {}
      memory.delete(key);
    }
  };
};

const safeStorage = createSafeStorage();

let fb = {
  ready: false,
  app: null,
  db: null,
  auth: null,
  api: null,
  currentUser: null
};

const state = {
  settings: null,
  categories: [],
  products: [],
  sliders: [],
  banners: [],
  cards: [],
  reviews: [],
  currentCurrency: safeStorage.getItem(CURRENCY_KEY) || APP_CONFIG.DEFAULT_CURRENCY,
  adminUnlocked: false,
  currentUser: null,
  orders: []
};

let adminFailCount = 0;
let adminLockUntil = 0;
const RECEIPTS_KEY = 'adnan_receipts_v1';

const PAYMENT_METHODS_KEY = 'adnan_payment_methods_v1';

function clonePaymentDefaults() {
  return JSON.parse(JSON.stringify(PAYMENT_METHODS_DEFAULT || []));
}

function normalizePaymentMethods(items = []) {
  return (Array.isArray(items) ? items : []).map((item, index) => ({
    ...item,
    id: item.id || `payment_${index + 1}`,
    order: Number(item.order || index + 1),
    enabled: item.enabled !== false,
    extraFields: Array.isArray(item.extraFields)
      ? item.extraFields
      : String(item.extraFields || '')
          .split('\n')
          .map(line => line.trim())
          .filter(Boolean)
          .map((line, idx) => {
            const [label, ...rest] = line.split(':');
            return { label: label?.trim() || `حقل ${idx + 1}`, value: rest.join(':').trim() };
          })
  }));
}

function readPaymentMethods() {
  const localCms = readLocalCms();
  const fromCms = Array.isArray(localCms.paymentMethods) && localCms.paymentMethods.length ? localCms.paymentMethods : null;
  const fromStorage = readJson(PAYMENT_METHODS_KEY, []);
  const source = fromCms || (Array.isArray(fromStorage) && fromStorage.length ? fromStorage : clonePaymentDefaults());
  return normalizePaymentMethods(source);
}

function savePaymentMethods(items = []) {
  const normalized = normalizePaymentMethods(items);
  state.paymentMethods = normalized;
  safeStorage.setItem(PAYMENT_METHODS_KEY, JSON.stringify(normalized));
  const cms = readLocalCms();
  cms.paymentMethods = normalized;
  writeLocalCms(cms);
}

function getEnabledPaymentMethods() {
  const items = state.paymentMethods?.length ? state.paymentMethods : readPaymentMethods();
  return normalizePaymentMethods(items).filter(item => item.enabled !== false).sort((a, b) => Number(a.order || 0) - Number(b.order || 0));
}

function getPaymentMethodById(id) {
  return getEnabledPaymentMethods().find(item => item.id === id) || normalizePaymentMethods(state.paymentMethods || []).find(item => item.id === id);
}

const ICONS = {
  home: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1v-10.5Z"/></svg>',
  categories: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="3" y="3" width="7" height="7" rx="2"/><rect x="14" y="3" width="7" height="7" rx="2"/><rect x="3" y="14" width="7" height="7" rx="2"/><rect x="14" y="14" width="7" height="7" rx="2"/></svg>',
  cart: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="9" cy="20" r="1.5"/><circle cx="18" cy="20" r="1.5"/><path d="M3 4h2l2.4 10.2a1 1 0 0 0 1 .8h8.9a1 1 0 0 0 1-.76L20 7H7"/></svg>',
  login: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M15 3h2a4 4 0 0 1 4 4v10a4 4 0 0 1-4 4h-2"/><path d="M10 17l5-5-5-5"/><path d="M15 12H3"/></svg>',
  insta: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="3" y="3" width="18" height="18" rx="5"/><circle cx="12" cy="12" r="4"/><circle cx="17" cy="7" r="1"/></svg>',
  search: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>',
  close: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M18 6 6 18M6 6l12 12"/></svg>',
  chevron: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="m6 9 6 6 6-6"/></svg>',
  plus: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M12 5v14M5 12h14"/></svg>',
};

function rel(path) {
  return PAGE === 'home' || PAGE === '404' ? `./${path}`.replace('././', './') : `../${path}`;
}

function normalizeBrand(value = '') {
  return String(value || '').trim().toLowerCase().replace(/[^a-z0-9؀-ۿ]+/g, '');
}

function brandDefaults() {
  return LOCAL_SEED.settings?.data || {};
}

function isMatchingBrand(data = {}) {
  const expected = [APP_CONFIG.BRAND_ID, APP_CONFIG.STORE_NAME, APP_CONFIG.STORE_NAME_AR].map(normalizeBrand).filter(Boolean);
  const candidates = [data.brandingId, data.storeSlug, data.storeName, data.heroTitle, data.footerText].map(normalizeBrand).filter(Boolean);
  if (!candidates.length) return false;
  return candidates.some(item => expected.includes(item));
}

function mergeBrandSettings(data = {}) {
  return { ...brandDefaults(), ...(data || {}), brandingId: APP_CONFIG.BRAND_ID, storeSlug: APP_CONFIG.BRAND_ID, storeName: APP_CONFIG.STORE_NAME };
}

function clearLegacyBrandCaches() {
  for (const key of APP_CONFIG.LEGACY_STORAGE_KEYS || []) {
    try { safeStorage.removeItem(key); } catch {}
    try { globalThis.sessionStorage?.removeItem(key); } catch {}
  }
}

function applyDocumentBranding() {
  const theme = settings();
  const titleBase = theme.storeName || APP_CONFIG.STORE_NAME;
  const currentTitle = document.title || titleBase;
  const pagePrefix = currentTitle.includes('|') ? currentTitle.split('|')[0].trim() : '';
  document.title = pagePrefix && normalizeBrand(pagePrefix) !== normalizeBrand(titleBase) ? `${pagePrefix} | ${titleBase}` : titleBase;
  document.documentElement.style.colorScheme = 'dark';
  document.documentElement.dataset.brand = APP_CONFIG.BRAND_ID;
  document.body?.setAttribute('data-brand', APP_CONFIG.BRAND_ID);
  const desc = document.querySelector('meta[name="description"]');
  if (desc) desc.setAttribute('content', theme.heroText || APP_CONFIG.STORE_TAGLINE);
}

function settings() {
  return {
    storeName: APP_CONFIG.STORE_NAME,
    tagline: state.settings?.tagline || APP_CONFIG.STORE_TAGLINE || '',
    whatsappNumber: state.settings?.whatsappNumber || APP_CONFIG.WHATSAPP_NUMBER || '',
    instagramUrl: state.settings?.instagramUrl || APP_CONFIG.INSTAGRAM_URL || '',
    defaultCurrency: state.settings?.defaultCurrency || APP_CONFIG.DEFAULT_CURRENCY,
    logoUrl: state.settings?.logoUrl || rel('images/logo.png'),
    heroBadge: state.settings?.heroBadge || 'واجهة قوية + أقسام أغنى',
    heroTitle: state.settings?.heroTitle || APP_CONFIG.STORE_NAME,
    heroText: state.settings?.heroText || '',
    footerText: state.settings?.footerText || APP_CONFIG.STORE_NAME,
    tickerText: state.settings?.tickerText || 'خصومات اليوم متاحة الآن — اضغط لعرض الفئة المحددة',
    tickerTargetType: state.settings?.tickerTargetType || 'category',
    tickerCategoryId: state.settings?.tickerCategoryId || '',
    tickerSubcategoryId: state.settings?.tickerSubcategoryId || '',
    tickerCustomUrl: state.settings?.tickerCustomUrl || '',
    bgColor: state.settings?.bgColor || APP_CONFIG.THEME.bg,
    bg2Color: state.settings?.bg2Color || APP_CONFIG.THEME.bg2,
    surfaceColor: state.settings?.surfaceColor || APP_CONFIG.THEME.surface,
    surface2Color: state.settings?.surface2Color || APP_CONFIG.THEME.surface2,
    primaryColor: state.settings?.primaryColor || APP_CONFIG.THEME.primary,
    primaryDarkColor: state.settings?.primaryDarkColor || APP_CONFIG.THEME.primaryDark,
    primaryLightColor: state.settings?.primaryLightColor || APP_CONFIG.THEME.primaryLight,
    maroonColor: state.settings?.maroonColor || APP_CONFIG.THEME.maroon,
    textColor: state.settings?.textColor || APP_CONFIG.THEME.text,
    text2Color: state.settings?.text2Color || APP_CONFIG.THEME.text2,
    mutedColor: state.settings?.mutedColor || APP_CONFIG.THEME.muted,
    active: state.settings?.active ?? true,
  };
}


function applyTheme() {
  const root = document.documentElement;
  const theme = settings();
  root.style.setProperty("--bg", theme.bgColor || APP_CONFIG.THEME.bg);
  root.style.setProperty("--bg-2", theme.bg2Color || APP_CONFIG.THEME.bg2);
  root.style.setProperty("--surface", theme.surfaceColor || APP_CONFIG.THEME.surface);
  root.style.setProperty("--surface-2", theme.surface2Color || APP_CONFIG.THEME.surface2);
  root.style.setProperty("--primary", theme.primaryColor || APP_CONFIG.THEME.primary);
  root.style.setProperty("--primary-dark", theme.primaryDarkColor || APP_CONFIG.THEME.primaryDark);
  root.style.setProperty("--primary-light", theme.primaryLightColor || APP_CONFIG.THEME.primaryLight);
  root.style.setProperty("--maroon", theme.maroonColor || APP_CONFIG.THEME.maroon);
  root.style.setProperty("--text", theme.textColor || APP_CONFIG.THEME.text);
  root.style.setProperty("--text-2", theme.text2Color || APP_CONFIG.THEME.text2);
  root.style.setProperty("--muted", theme.mutedColor || APP_CONFIG.THEME.muted);
  root.style.setProperty("--line", APP_CONFIG.THEME.line);
  root.style.setProperty("--glow", APP_CONFIG.THEME.glow);
}


function activeItems(items = []) {
  return Array.isArray(items)
    ? items.filter(item => item && item.active !== false).sort((a, b) => Number(a.order || 0) - Number(b.order || 0))
    : [];
}

function mapById(items = []) {
  return new Map(items.map(item => [item.id, item]));
}

function currencyMeta(code = null) {
  const catalog = APP_CONFIG.CURRENCIES || {};
  return catalog[code || state.currentCurrency || settings().defaultCurrency] || catalog[APP_CONFIG.DEFAULT_CURRENCY] || Object.values(catalog)[0];
}

function setCurrency(code) {
  const meta = currencyMeta(code);
  state.currentCurrency = meta.code;
  safeStorage.setItem(CURRENCY_KEY, meta.code);
  rerenderVisiblePage();
}

function formatCurrency(value, code = null) {
  const meta = currencyMeta(code);
  const amount = Number(value || 0) * Number(meta.rate || 1);
  return `${new Intl.NumberFormat('ar', { minimumFractionDigits: meta.decimals ?? 2, maximumFractionDigits: meta.decimals ?? 2 }).format(amount)} ${meta.symbol}`;
}

function escapeHtml(value = '') {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function imageSrc(value = '') {
  const src = String(value || APP_CONFIG.FALLBACK_IMAGE || '').trim();
  if (!src) return '';
  if (/^(data:|blob:|https?:|\/)/i.test(src)) return src;
  if (src.startsWith('./')) return rel(src.slice(2));
  return rel(src);
}

function toastWrap() {
  let wrap = $('.toast-wrap');
  if (!wrap) {
    wrap = document.createElement('div');
    wrap.className = 'toast-wrap';
    document.body.appendChild(wrap);
  }
  return wrap;
}

function showToast(message, type = 'info') {
  const item = document.createElement('div');
  item.className = `toast ${type}`;
  item.textContent = message;
  toastWrap().appendChild(item);
  setTimeout(() => {
    item.classList.add('hide');
    setTimeout(() => item.remove(), 200);
  }, 2400);
}

function emptyState(title, text = '') {
  return `<div class="empty-state"><strong>${escapeHtml(title)}</strong>${text ? `<span>${escapeHtml(text)}</span>` : ''}</div>`;
}

function skeletonCards(count = 3, cls = '') {
  return `<div class="rail ${cls}">${Array.from({ length: count }).map(() => '<div class="skeleton-card skeleton"></div>').join('')}</div>`;
}

function normalizeCartItem(item = {}) {
  if (!item || !item.id) return null;
  const product = state.products.find(entry => entry.id === item.id) || activeItems(LOCAL_SEED.products || []).find(entry => entry.id === item.id) || null;
  const quantity = Math.max(1, Number(item.quantity || 1));
  if (!product && (!item.name || Number.isNaN(Number(item.price)))) return null;
  return {
    id: item.id,
    name: product?.name || item.name || 'منتج',
    image: product?.image || item.image || APP_CONFIG.FALLBACK_IMAGE,
    price: Number(product?.price ?? item.price ?? 0),
    quantity
  };
}
function readCart() {
  let parsed = [];
  try { parsed = JSON.parse(safeStorage.getItem(CART_KEY) || '[]'); } catch { parsed = []; }
  if (!Array.isArray(parsed)) parsed = [];
  const seen = new Set();
  const normalized = parsed
    .map(normalizeCartItem)
    .filter(Boolean)
    .filter(item => {
      if (seen.has(item.id)) return false;
      seen.add(item.id);
      return true;
    })
    .map(item => ({ ...item, quantity: 1 }));
  const changed = JSON.stringify(parsed) !== JSON.stringify(normalized);
  if (changed) safeStorage.setItem(CART_KEY, JSON.stringify(normalized));
  return normalized;
}
function writeCart(cart) {
  const seen = new Set();
  const normalized = Array.isArray(cart)
    ? cart
        .map(normalizeCartItem)
        .filter(Boolean)
        .filter(item => {
          if (seen.has(item.id)) return false;
          seen.add(item.id);
          return true;
        })
        .map(item => ({ ...item, quantity: 1 }))
    : [];
  safeStorage.setItem(CART_KEY, JSON.stringify(normalized));
  updateCartBadges();
}
function cartCount() {
  return readCart().reduce((sum, item) => sum + Math.max(1, Number(item.quantity || 1)), 0);
}
function updateCartBadges() {
  const count = cartCount();
  $$('[data-cart-count]').forEach(el => {
    el.textContent = String(count);
    el.classList.toggle('hidden', count === 0);
  });
}
function addToCart(product, quantity = 1) {
  if (!product?.id) return false;
  const cart = readCart();
  const existing = cart.find(item => item.id === product.id);
  if (existing) {
    writeCart(cart);
    return 'exists';
  }
  cart.push({
    id: product.id,
    name: product.name,
    image: product.image,
    price: Number(product.price || 0),
    quantity: 1
  });
  writeCart(cart);
  return 'added';
}
function addToCartById(productId) {
  const product = state.products.find(item => item.id === productId);
  if (!product) return showToast('المنتج غير موجود', 'error');
  const result = addToCart(product);
  showToast(result === 'exists' ? 'هذا الحساب موجود بالفعل في السلة' : 'تمت الإضافة إلى السلة', result === 'exists' ? 'warning' : 'success');
}
function buyNowById(productId) {
  const product = state.products.find(item => item.id === productId);
  if (!product) return showToast('المنتج غير موجود', 'error');
  addToCart(product);
  updateCartBadges();
  goTo(`${rel('pages/checkout.html')}?product=${encodeURIComponent(productId)}`);
}

function goTo(url) { window.location.href = url; }
function getParam(key) { return new URL(window.location.href).searchParams.get(key); }

function stripHashSilently() {
  try {
    if (window.location.hash === '#' || window.location.hash === '#!') {
      history.replaceState(null, '', window.location.pathname + window.location.search);
    }
  } catch {}
}

function syncHomeCategoryState(categoryId = '', subcategoryId = '') {
  state.selectedCategoryId = categoryId || null;
  state.selectedSubcategoryId = subcategoryId || null;
}

function openHomeWithCategory(categoryId = '', subcategoryId = '') {
  try {
    safeStorage.setItem('adnan_home_category_target_v1', JSON.stringify({ categoryId, subcategoryId }));
  } catch {}
  const homeUrl = new URL(rel('index.html'), window.location.href);
  if (categoryId) homeUrl.searchParams.set('category', categoryId);
  if (subcategoryId) homeUrl.searchParams.set('subcategory', subcategoryId);
  goTo(homeUrl.toString());
}

function isAcceptedEmail(email = '') {
  const value = String(email || '').trim().toLowerCase();
  if (!/^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$/i.test(value)) return false;
  if (value.includes('..')) return false;
  const domain = value.split('@')[1] || '';
  if (!domain || domain.startsWith('.') || domain.endsWith('.')) return false;
  return true;
}


function readJson(key, fallback) {
  try { return JSON.parse(safeStorage.getItem(key) || JSON.stringify(fallback)); } catch { return fallback; }
}
function writeJson(key, value) { safeStorage.setItem(key, JSON.stringify(value)); }
function readUsers() { return readJson(USERS_KEY, []); }
function saveUsers(users) { writeJson(USERS_KEY, users); }
function getCurrentUser() { return readJson(AUTH_KEY, null); }
function setCurrentUser(user) { state.currentUser = user; if (user) writeJson(AUTH_KEY, user); else safeStorage.removeItem(AUTH_KEY); }
function isLoggedIn() { return Boolean(state.currentUser?.id); }
function readOrders() { return Array.isArray(state.orders) && state.orders.length ? state.orders : readJson(ORDERS_KEY, []); }
function saveOrders(items) { state.orders = Array.isArray(items) ? items : []; writeJson(ORDERS_KEY, state.orders); }

// ─── Rate Limiting (login / register) ────────────────────────────────────────
const _loginAttempts = {};
function checkLoginRateLimit(email) {
  const key = email.toLowerCase().trim();
  const now = Date.now();
  if (!_loginAttempts[key]) _loginAttempts[key] = { count: 0, until: 0 };
  const entry = _loginAttempts[key];
  if (entry.until && now < entry.until) return false; // مقفول
  if (entry.until && now >= entry.until) { entry.count = 0; entry.until = 0; }
  return true;
}
function recordLoginFailure(email) {
  const key = email.toLowerCase().trim();
  if (!_loginAttempts[key]) _loginAttempts[key] = { count: 0, until: 0 };
  _loginAttempts[key].count++;
  if (_loginAttempts[key].count >= 5) {
    _loginAttempts[key].until = Date.now() + 10 * 60 * 1000; // 10 دقائق
    _loginAttempts[key].count = 0;
  }
}
function clearLoginRateLimit(email) {
  delete _loginAttempts[email.toLowerCase().trim()];
}
// ─────────────────────────────────────────────────────────────────────────────
function readReceipts() { return readJson(RECEIPTS_KEY, {}); }
function saveReceipts(items) { writeJson(RECEIPTS_KEY, items); }
function getReceiptImage(orderId = '') {
  // أولاً: من localStorage (URL أو base64)
  const receipts = readReceipts();
  if (receipts?.[orderId]) return receipts[orderId];
  // ثانياً: من الطلب نفسه (receiptUrl المحفوظ في order)
  const order = getOrderById(orderId);
  return order?.receiptUrl || '';
}
// ─── Cloudinary Upload ────────────────────────────────────────────────────────
async function uploadToCloudinary(file, folder = CDN_FOLDER) {
  if (file.size > 5 * 1024 * 1024) throw new Error('حجم الملف يتجاوز 5MB');
  const fd = new FormData();
  fd.append('file', file);
  fd.append('upload_preset', CDN_PRESET);
  fd.append('folder', folder);
  const res = await withTimeout(fetch(CDN_UPLOAD_URL, { method: 'POST', body: fd }), 20000, 'upload-timeout');
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err?.error?.message || `Cloudinary error ${res.status}`);
  }
  const data = await res.json();
  const url = String(data.secure_url || '');
  if (url && !/^https:\/\/res\.cloudinary\.com\//i.test(url)) {
    throw new Error('رابط الصورة غير موثوق');
  }
  return url;
}


// رفع إيصال الدفع إلى Cloudinary وحفظ الـ URL فقط في localStorage
async function saveReceiptImage(orderId = '', file = null) {
  if (!orderId) return '';
  if (!(file instanceof File)) return '';
  if (file.size > 3 * 1024 * 1024) { showToast('حجم الإيصال كبير جداً (الحد 3MB)', 'error'); return ''; }
  if (!file.type.startsWith('image/')) { showToast('يُقبل ملفات الصور فقط', 'error'); return ''; }
  const preparedFile = await prepareReceiptFileForUpload(file);
  if (CDN_CLOUD && CDN_PRESET && preparedFile instanceof File) {
    try {
      const url = await uploadToCloudinary(preparedFile, CDN_RECEIPTS_FOLDER);
      try {
        const receipts = readReceipts();
        receipts[orderId] = url;
        safeStorage.setItem(RECEIPTS_KEY, JSON.stringify(receipts));
      } catch {}
      return url;
    } catch (err) {
      console.warn('Cloudinary receipt upload failed, falling back to base64', err);
    }
  }
  if (preparedFile instanceof File) {
    try {
      const dataUrl = await fileToDataUrl(preparedFile);
      const receipts = readReceipts();
      receipts[orderId] = dataUrl;
      safeStorage.setItem(RECEIPTS_KEY, JSON.stringify(receipts));
      return dataUrl;
    } catch (err) {
      showToast('تحذير: لم يُحفظ الإيصال. تحقق من اتصالك أو فرّغ الذاكرة.', 'error');
      return '';
    }
  }
  return '';
}


function clearReceiptImage(orderId = '') {
  if (!orderId) return;
  const receipts = readReceipts();
  if (orderId in receipts) {
    delete receipts[orderId];
    saveReceipts(receipts);
  }
}
// ─────────────────────────────────────────────────────────────────────────────
function upsertOrder(order) {
  const items = readOrders();
  const index = items.findIndex(item => item.id === order.id);
  if (index >= 0) items[index] = order; else items.unshift(order);
  saveOrders(items);
  return order;
}
function generateOrderId() {
  const rand = Array.from(crypto.getRandomValues(new Uint8Array(3))).map(b => b.toString(16).padStart(2,'0')).join('');
  return `ORD-${Date.now().toString(36).toUpperCase()}-${rand.toUpperCase()}`;
}
function orderStatusMeta(status='pending_payment') {
  return ({ pending_payment:'بانتظار الدفع', under_review:'قيد المراجعة', approved:'مقبول', rejected:'مرفوض', delivered:'تم التسليم' })[status] || status;
}
function nowIso() { return new Date().toISOString(); }
function createPendingOrder(product, methodId='') {
  const user = state.currentUser;
  let trustedPrice = Number(product.price || 0);
  if (!fb.ready) {
    const seedProduct = (LOCAL_SEED.products || []).find(p => p.id === product.id);
    if (seedProduct) {
      trustedPrice = Number(seedProduct.price || 0);
    }
  }
  const order = {
    id: generateOrderId(),
    productId: product.id,
    productTitle: product.name,
    userId: user?.id || '',
    username: user?.name || '',
    email: user?.email || '',
    price: trustedPrice,
    time: nowIso(),
    paymentMethod: methodId,
    status: 'pending_payment',
    senderName: '',
    notes: '',
    hasReceipt: false,
    timeline: [{ status:'pending_payment', at: nowIso(), note:'تم إنشاء الطلب' }]
  };
  return upsertOrder(order);
}
async function updateOrder(id, patch) {
  const items = readOrders();
  const index = items.findIndex(item => item.id === id);
  if (index < 0) return null;
  items[index] = { ...items[index], ...patch };
  saveOrders(items);
  await saveOrderRemote(items[index]);
  return items[index];
}
async function pushOrderStatus(id, status, note='') {
  const items = readOrders();
  const index = items.findIndex(item => item.id === id);
  if (index < 0) return null;
  const timeline = Array.isArray(items[index].timeline) ? items[index].timeline : [];
  items[index] = { ...items[index], status, timeline: [...timeline, { status, at: nowIso(), note }] };
  saveOrders(items);
  await saveOrderRemote(items[index]);
  return items[index];
}
function getOrderById(id) { return readOrders().find(item => item.id === id); }
function readLocalCms() { return readJson(LOCAL_CMS_KEY, {}); }
function writeLocalCms(data) { writeJson(LOCAL_CMS_KEY, data); }
function mergeLocalCmsIntoState() {
  const cms = readLocalCms();
  const validators = {
    categories: item => item && item.id && item.name,
    products: item => item && item.id && (item.name || item.title) && item.image,
    sliders: item => item && item.image,
    banners: item => item && item.image,
    cards: item => item && item.image,
    reviews: item => item && (item.name || item.text)
  };
  ['categories','products','sliders','banners','cards','reviews'].forEach(key => {
    if (!Array.isArray(cms[key])) return;
    const valid = cms[key].filter(validators[key] || (() => true));
    if (valid.length) state[key] = valid;
  });
  if (cms.settings && typeof cms.settings === 'object') state.settings = mergeBrandSettings(cms.settings);
  if (Array.isArray(cms.paymentMethods) && cms.paymentMethods.length) state.paymentMethods = normalizePaymentMethods(cms.paymentMethods);
}
function persistLocalCollection(key, payload) {
  const cms = readLocalCms();
  cms[key] = payload;
  writeLocalCms(cms);
}
function nextUrl() {
  const raw = getParam('next') || '';
  if (!raw) return '';
  if (/^(https?:)?\/\//i.test(raw)) return '';
  if (/^javascript:/i.test(raw)) return '';
  if (/^data:/i.test(raw)) return '';
  return raw;
}
function readAuthFlowState() { return readJson(AUTH_FLOW_KEY, null); }
function writeAuthFlowState(value) {
  if (value) writeJson(AUTH_FLOW_KEY, value);
  else safeStorage.removeItem(AUTH_FLOW_KEY);
}
function completeAuthFlow() {
  const flow = readAuthFlowState();
  if (!flow?.pendingRedirect) return;
  const target = flow.next || rel('index.html');
  writeAuthFlowState(null);
  setTimeout(() => goTo(target), 900);
}

function renderCopyButton(value) { return `<button class="copy-chip" type="button" data-copy-value="${escapeHtml(String(value || ''))}">نسخ</button>`; }

function normalizeEmail(value = '') { return String(value || '').trim().toLowerCase(); }
function isAdminUser(user) {
  return hasAdminIdentity(user);
}

async function saveOrderRemote(order) {
  if (!fb.ready || !order?.id) return false;
  try {
    await withTimeout(fb.api.setDoc(fb.api.doc(fb.db, COLLECTIONS.orders, order.id), order, { merge: true }), 5000, 'save-order-timeout');
    return true;
  } catch (error) {
    console.warn('Order remote save failed', error);
    return false;
  }
}

async function loadOrdersRemote() {
  if (!fb.ready || !state.adminUnlocked) return [];
  try {
    const snap = await fb.api.getDocs(fb.api.query(fb.api.collection(fb.db, COLLECTIONS.orders), fb.api.orderBy('time', 'desc')));
    const orders = snap.docs.map(docSnap => ({ id: docSnap.id, ...docSnap.data() }));
    saveOrders(orders);
    return orders;
  } catch (error) {
    console.warn('Orders remote load failed', error);
    return readOrders();
  }
}

function sanitizeUrl(url = '') {
  if (!url || typeof url !== 'string') return '#';
  const trimmed = url.trim();
  if (/^javascript:/i.test(trimmed)) return '#';
  if (/^data:/i.test(trimmed)) return '#';
  if (/^vbscript:/i.test(trimmed)) return '#';
  return trimmed || '#';
}

function resolveTarget(item = {}) {
  const type = String(item.targetType || '').toLowerCase();
  const customUrl = String(item.customUrl || '').trim();
  if (type === 'custom' && customUrl) return sanitizeUrl(customUrl);
  if (customUrl && !type) return sanitizeUrl(customUrl);

  const targetId = item.targetId || item.productId || item.subcategoryId || item.categoryId;

  if (type === 'product' || item.productId) {
    const pid = item.productId || targetId;
    return pid ? `${rel('pages/product.html')}?id=${encodeURIComponent(pid)}` : '#';
  }
  // subcategory له أولوية قبل category
  if (type === 'subcategory' || (item.subcategoryId && item.subcategoryId !== '')) {
    const sid = item.subcategoryId || targetId;
    const cid = item.categoryId || '';
    return sid ? `${rel('pages/category.html')}?category=${encodeURIComponent(cid)}&subcategory=${encodeURIComponent(sid)}` : '#';
  }
  if (type === 'category' || (item.categoryId && item.categoryId !== '')) {
    const cid = item.categoryId || targetId;
    return cid ? `${rel('pages/category.html')}?category=${encodeURIComponent(cid)}` : '#';
  }
  if (type === 'section' && (item.sectionId || targetId)) {
    return `${rel('index.html')}#${item.sectionId || targetId}`;
  }
  // إذا كان targetId موجوداً بدون type — حاول تحديد نوعه
  if (targetId && !type) {
    // تحقق إذا هو ID تصنيف فرعي
    const isSub = state.categories?.some(c => c.id === targetId && c.parentId);
    if (isSub) {
      const sub = state.categories.find(c => c.id === targetId);
      return `${rel('pages/category.html')}?category=${encodeURIComponent(sub?.parentId || '')}&subcategory=${encodeURIComponent(targetId)}`;
    }
    // تحقق إذا هو تصنيف رئيسي
    const isCat = state.categories?.some(c => c.id === targetId && !c.parentId);
    if (isCat) return `${rel('pages/category.html')}?category=${encodeURIComponent(targetId)}`;
    // تحقق إذا هو منتج
    const isProd = state.products?.some(p => p.id === targetId);
    if (isProd) return `${rel('pages/product.html')}?id=${encodeURIComponent(targetId)}`;
  }
  return customUrl ? sanitizeUrl(customUrl) : '#';
}

function buildSearchDrawer() {
  return `
    <div class="search-drawer hidden" id="searchDrawer">
      <div class="search-panel">
        <div class="search-head">
          <strong>بحث</strong>
          <button class="icon-btn" type="button" id="closeSearchBtn">${ICONS.close}</button>
        </div>
        <div class="search-input-wrap">
          <input id="searchInput" class="search-input" type="search" placeholder="ابحث عن منتج">
        </div>
        <div id="searchCount" class="search-count"></div>
        <div id="searchResults"></div>
      </div>
    </div>`;
}

function buildTopbar() {
  const brandName = settings().storeName || APP_CONFIG.STORE_NAME;
  const logo = settings().logoUrl || rel('images/logo.png');
  const tickerTarget = resolveTarget({
    targetType: settings().tickerTargetType,
    categoryId: settings().tickerCategoryId,
    subcategoryId: settings().tickerSubcategoryId,
    customUrl: settings().tickerCustomUrl
  });
  return `
    <header class="topbar">
      <div class="container topbar-inner">
        <button class="brand brand--logo-only" type="button" id="brandHomeBtn" aria-label="${escapeHtml(brandName)}">
          <span class="brand-logo-wrap brand-logo-wrap--bg" style="background-image:url('${escapeHtml(imageSrc(logo))}')"></span>
        </button>
        <div class="top-actions">
          <label class="currency-switcher">
            <span>${escapeHtml(currencyMeta().code)}</span>
            <select id="currencySelect" aria-label="اختر العملة">
              ${Object.values(APP_CONFIG.CURRENCIES).map(item => `<option value="${item.code}" ${item.code === state.currentCurrency ? 'selected' : ''}>${item.name}</option>`).join('')}
            </select>
          </label>
          <button class="icon-btn" id="openSearchBtn" type="button" aria-label="بحث">${ICONS.search}</button>
          <a class="icon-btn cart-trigger" href="${rel('pages/cart.html')}" aria-label="السلة">${ICONS.cart}<span class="cart-badge hidden" data-cart-count>0</span></a>
        </div>
      </div>
      <div class="ticker-wrap container">
        <a class="ticker-link" href="${tickerTarget}" id="tickerLink"><span class="ticker-track">${escapeHtml(settings().tickerText || '')}</span></a>
      </div>
      ${buildSearchDrawer()}
    </header>`;
}

function buildBottomNav() {
  const socialHref = sanitizeUrl((settings().instagramUrl || APP_CONFIG.INSTAGRAM_URL || '').trim()) || '';
  const hasInsta = socialHref && socialHref !== '#';
  const items = [
    { key: 'home', href: rel('index.html'), label: 'الرئيسية', icon: ICONS.home },
    { key: 'category', href: '#', label: 'التصنيفات', icon: ICONS.categories, drawer: true },
    { key: 'cart', href: rel('pages/cart.html'), label: 'السلة', icon: ICONS.cart, badge: true },
    { key: 'login', href: rel('pages/login.html'), label: state.currentUser ? 'حسابي' : 'الحساب', icon: ICONS.login },
    { key: 'insta', href: hasInsta ? socialHref : '#', label: 'تواصل', icon: ICONS.insta, external: hasInsta }
  ];
  return `<nav class="bottom-nav"><div class="bottom-nav-inner">${items.map(item => item.drawer ? `
    <button class="bottom-link ${PAGE === item.key ? 'active' : ''}" type="button" id="openCategoryDrawerBtn" data-open-drawer="true" aria-controls="categoryDrawer" aria-expanded="false" onclick="window.__openStoreCategoryDrawer && window.__openStoreCategoryDrawer(event)">
      ${item.icon}
      <span>${item.label}</span>
    </button>` : `
    <a class="bottom-link ${PAGE === item.key ? 'active' : ''}" href="${item.href}" ${item.external ? 'target="_blank" rel="noopener"' : ''}>
      ${item.icon}
      <span>${item.label}</span>
      ${item.badge ? '<span class="nav-badge hidden" data-cart-count>0</span>' : ''}
    </a>`).join('')}</div></nav>`;
}


function buildCategoryDrawer() {
  let items = topCategories();
  if (!items.length && Array.isArray(LOCAL_SEED.categories)) {
    state.categories = LOCAL_SEED.categories;
    items = topCategories();
  }
  const activeParentId = state.categoryDrawerParentId && items.some(item => item.id === state.categoryDrawerParentId)
    ? state.categoryDrawerParentId
    : (items[0]?.id || '');
  const activeParent = items.find(item => item.id === activeParentId) || items[0] || null;
  const subs = activeParent ? childCategories(activeParent.id) : [];
  const parentImage = activeParent?.image ? imageSrc(activeParent.image) : APP_CONFIG.FALLBACK_IMAGE;
  return `<aside class="side-drawer hidden" id="categoryDrawer" aria-hidden="true" data-active-parent="${escapeHtml(activeParentId)}">
    <div class="side-drawer-backdrop" data-close-drawer></div>
    <div class="side-drawer-shell side-drawer-shell--tabs">
      <div class="side-drawer-hero" style="background-image:url('${escapeHtml(parentImage)}')"></div>
      <div class="side-drawer-panel side-drawer-panel--tabs">
        <div class="side-drawer-head">
          <div>
            <strong>التصنيفات</strong>
            <p class="muted">اختر التبويب ثم الفئة التي تريدها</p>
          </div>
          <button class="icon-btn" type="button" data-close-drawer>${ICONS.close}</button>
        </div>
        <div class="drawer-tabbar" role="tablist">
          ${items.map(item => `<button class="drawer-tab ${item.id === activeParentId ? 'active' : ''}" type="button" data-parent-tab="${item.id}" aria-selected="${item.id === activeParentId ? 'true' : 'false'}">${item.image ? `<img class="drawer-tab-thumb" src="${escapeHtml(imageSrc(item.image))}" alt="${escapeHtml(item.name)}" onerror="this.onerror=null;this.src='${APP_CONFIG.FALLBACK_IMAGE}'">` : ''}<span>${escapeHtml(item.name)}</span></button>`).join('')}
        </div>
        <div class="drawer-tabpanel">
          ${activeParent ? `<button class="subcat-link subcat-link--hero" type="button" data-category-select="${activeParent.id}" data-parent-id="${activeParent.id}" data-close-drawer><span>${escapeHtml(activeParent.name)}</span><small>عرض جميع منتجات هذا القسم</small></button>` : ''}
          <div class="drawer-grid">
            ${subs.length ? subs.map(sub => `<button class="subcat-link subcat-link--card" type="button" data-subcategory-select="${sub.id}" data-parent-id="${activeParent.id}" data-close-drawer>${sub.image ? `<img class="subcat-thumb" src="${escapeHtml(imageSrc(sub.image))}" alt="${escapeHtml(sub.name)}" onerror="this.onerror=null;this.src='${APP_CONFIG.FALLBACK_IMAGE}'">` : ''}<span>${escapeHtml(sub.name)}</span><small>${escapeHtml(sub.subtitle || 'عرض المنتجات')}</small></button>`).join('') : `<div class="empty-state"><strong>لا توجد فئات داخلية</strong><span>يمكنك عرض جميع منتجات هذا القسم مباشرة.</span></div>`}
          </div>
        </div>
      </div>
    </div>
  </aside>`;
}

function buildFloatingUi() {
  const wa = (settings().whatsappNumber || '').replace(/\D+/g,'');
  const waHref = wa ? `https://wa.me/${wa}` : '#';
  const waIcon = `<svg viewBox="0 0 24 24" fill="currentColor" width="22" height="22"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/><path d="M12 0C5.373 0 0 5.373 0 12c0 2.135.558 4.135 1.535 5.875L0 24l6.274-1.506A11.95 11.95 0 0012 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 22c-1.885 0-3.643-.497-5.168-1.363l-.371-.22-3.726.895.929-3.617-.242-.384A9.94 9.94 0 012 12c0-5.514 4.486-10 10-10s10 4.486 10 10-4.486 10-10 10z"/></svg>`;
  const topIcon = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" width="18" height="18"><path d="m18 15-6-6-6 6"/></svg>`;
  return `
    <div class="floating-ui">
      <a class="floating-btn floating-btn--whatsapp${wa ? '' : ' floating-btn--no-number'}" href="${waHref}" ${wa ? 'target="_blank" rel="noopener"' : 'aria-disabled="true"'} aria-label="واتساب">${waIcon}</a>
      <button class="floating-btn floating-btn--top" type="button" id="scrollTopBtn" aria-label="للأعلى">${topIcon}</button>
    </div>`;
}

function buildFooter() {
  const brandName = settings().storeName || APP_CONFIG.STORE_NAME;
  const tagline = settings().tagline || 'متجر عربي داكن وغني بالأقسام والعروض، جاهز للتخصيص الكامل من الأدمن.';
  const socialHref = sanitizeUrl((settings().instagramUrl || APP_CONFIG.INSTAGRAM_URL || '').trim()) || '#';
  const logo = imageSrc(settings().logoUrl || APP_CONFIG.LOGO_URL);
  if (PAGE === 'home') {
    return `
      <footer class="footer footer--clawish footer--home-final">
        <div class="container footer-inner">
          <div class="footer-claw-card footer-claw-card--simple">
            ${logo ? `<img class="footer-claw-logo" src="${escapeHtml(logo)}" alt="${escapeHtml(brandName)}" onerror="this.style.display='none'">` : ''}
            <p class="footer-claw-copy">${escapeHtml(tagline)}</p>
            <div class="footer-claw-socials">
              <a class="footer-social" href="${socialHref}" ${socialHref !== '#' ? 'target="_blank" rel="noopener"' : ''} aria-label="Instagram">${ICONS.insta}</a>
              <a class="footer-social" href="${rel('index.html')}" aria-label="Home">${ICONS.home}</a>
            </div>
          </div>
        </div>
      </footer>`;
  }
  return `
    <footer class="footer footer--clean footer--inner-simple">
      <div class="container footer-inner">
        <div class="footer-clean-card footer-clean-card--compact">
          <div class="footer-clean-copy">
            <strong>${escapeHtml(brandName)}</strong>
            <p>${escapeHtml(tagline)}</p>
          </div>
        </div>
      </div>
    </footer>`;
}

function renderChrome() {
  const topbarHost = $('#topbarHost');
  const bottomHost = $('#bottomNavHost');
  const footerHost = $('#footerHost');
  if (topbarHost) topbarHost.innerHTML = buildTopbar();
  if (bottomHost) bottomHost.innerHTML = buildBottomNav();
  if (footerHost) footerHost.innerHTML = buildFooter();
  document.getElementById('floatingUiHost')?.replaceChildren();
  if (!document.querySelector('.floating-ui')) document.body.insertAdjacentHTML('beforeend', buildFloatingUi());
  const existingCategoryDrawer = document.getElementById('categoryDrawer');
  if (existingCategoryDrawer) existingCategoryDrawer.outerHTML = buildCategoryDrawer();
  else document.body.insertAdjacentHTML('beforeend', buildCategoryDrawer());
  bindChromeEvents();
  updateCartBadges();
}

function bindChromeEvents() {
  const currencySelect = $('#currencySelect');
  const drawer = $('#searchDrawer');
  let categoryDrawer = document.getElementById('categoryDrawer');
  const ensureCategoryDrawer = () => {
    categoryDrawer = document.getElementById('categoryDrawer');
    if (!categoryDrawer) {
      document.body.insertAdjacentHTML('beforeend', buildCategoryDrawer());
      categoryDrawer = document.getElementById('categoryDrawer');
      bindInlineCategorySelection(categoryDrawer || document);
      bindAccordion(categoryDrawer || document);
    }
    return categoryDrawer;
  };
  const openCategoryDrawer = (event = null) => {
    if (event) { event.preventDefault?.(); event.stopPropagation?.(); }
    const drawerNode = ensureCategoryDrawer();
    if (!drawerNode) return;
    drawerNode.classList.remove('hidden');
    drawerNode.setAttribute('aria-hidden', 'false');
    $$('[data-open-drawer]').forEach(el => el.setAttribute('aria-expanded', 'true'));
    document.body.classList.add('drawer-open');
  };
  const closeCategoryDrawer = (event = null) => {
    if (event) { event.preventDefault?.(); event.stopPropagation?.(); }
    const drawerNode = document.getElementById('categoryDrawer');
    if (!drawerNode) return;
    drawerNode.classList.add('hidden');
    drawerNode.setAttribute('aria-hidden', 'true');
    $$('[data-open-drawer]').forEach(el => el.setAttribute('aria-expanded', 'false'));
    document.body.classList.remove('drawer-open');
  };
  $('#openSearchBtn')?.addEventListener('click', () => drawer?.classList.remove('hidden'));
  $('#closeSearchBtn')?.addEventListener('click', () => drawer?.classList.add('hidden'));
  currencySelect?.addEventListener('change', (e) => setCurrency(e.target.value));
  $('#searchInput')?.addEventListener('input', handleSearch);
  $('#brandHomeBtn')?.addEventListener('click', () => goTo(rel('index.html')));
  $('#brandHomeBtn')?.addEventListener('contextmenu', (e) => e.preventDefault());
  $('#brandHomeBtn')?.addEventListener('touchstart', () => {}, { passive: true });
  $('#scrollTopBtn')?.addEventListener('click', () => window.scrollTo({ top: 0, behavior: 'smooth' }));
  $$('[data-open-drawer]').forEach(el => {
    el.onclick = null;
    ['click','touchend','pointerup'].forEach(evt => el.addEventListener(evt, (e) => {
      e.preventDefault();
      e.stopPropagation();
      stripHashSilently();
      openCategoryDrawer();
    }, { passive: false }));
  });
  $$('[data-close-drawer]').forEach(el => {
    el.onclick = null;
    el.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      closeCategoryDrawer();
    });
  });
  document.getElementById('categoryDrawer')?.addEventListener('click', (e) => {
    const closeHit = e.target.closest('[data-close-drawer]');
    if (closeHit) {
      e.preventDefault();
      closeCategoryDrawer();
      return;
    }
    if (e.target === document.getElementById('categoryDrawer')) {
      closeCategoryDrawer();
      return;
    }
    const actionable = e.target.closest('button[data-subcategory-select],button[data-category-select],button[data-category-toggle],a[href]');
    if (actionable && !actionable.matches('button[data-category-toggle]')) {
      closeCategoryDrawer();
    }
  }, true);
  if (!document.body.dataset.categoryDrawerDelegated) {
    const delegatedOpen = (e) => {
      const trigger = e.target.closest('[data-open-drawer]');
      if (!trigger) return;
      e.preventDefault();
      e.stopPropagation();
      openCategoryDrawer();
    };
    document.addEventListener('click', delegatedOpen, true);
    document.addEventListener('touchend', delegatedOpen, true);
    document.addEventListener('pointerup', delegatedOpen, true);
    document.body.dataset.categoryDrawerDelegated = '1';
  }
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeCategoryDrawer();
  });
  window.__openStoreCategoryDrawer = openCategoryDrawer;
  window.__closeStoreCategoryDrawer = closeCategoryDrawer;
  if (!document.body.dataset.drawerTabDelegated) {
    document.addEventListener('click', (e) => {
      const parentTab = e.target.closest('[data-parent-tab]');
      if (!parentTab) return;
      e.preventDefault();
      e.stopPropagation();
      const newParentId = parentTab.dataset.parentTab || '';
      if (state.categoryDrawerParentId === newParentId) return; // لا تغيير
      state.categoryDrawerParentId = newParentId;
      const drawer = document.getElementById('categoryDrawer');
      if (!drawer) return;
      // تحديث active tabs
      $$('[data-parent-tab]', drawer).forEach(btn => {
        btn.classList.toggle('active', btn.dataset.parentTab === newParentId);
        btn.setAttribute('aria-selected', btn.dataset.parentTab === newParentId ? 'true' : 'false');
      });
      // تحديث الـ hero image
      const activeParent = state.categories.find(item => item.id === newParentId);
      const heroEl = drawer.querySelector('.side-drawer-hero');
      if (heroEl && activeParent?.image) heroEl.style.backgroundImage = `url('${imageSrc(activeParent.image)}')`;
      // تحديث subcategories panel فقط
      const panel = drawer.querySelector('.drawer-tabpanel');
      if (!panel) return;
      const subs = activeParent ? childCategories(activeParent.id) : [];
      panel.innerHTML = `
        ${activeParent ? `<button class="subcat-link subcat-link--hero" type="button" data-category-select="${activeParent.id}" data-parent-id="${activeParent.id}" data-close-drawer><span>${escapeHtml(activeParent.name)}</span><small>عرض جميع منتجات هذا القسم</small></button>` : ''}
        <div class="drawer-grid">
          ${subs.length ? subs.map(sub => `<button class="subcat-link subcat-link--card" type="button" data-subcategory-select="${sub.id}" data-parent-id="${activeParent.id}" data-close-drawer>${sub.image ? `<img class="subcat-thumb" src="${escapeHtml(imageSrc(sub.image))}" alt="${escapeHtml(sub.name)}" onerror="this.onerror=null;this.src='${APP_CONFIG.FALLBACK_IMAGE}'">` : ''}<span>${escapeHtml(sub.name)}</span><small>${escapeHtml(sub.subtitle || 'عرض المنتجات')}</small></button>`).join('') : `<div class="empty-state"><strong>لا توجد فئات داخلية</strong></div>`}
        </div>`;
      // إعادة ربط الأحداث للعناصر الجديدة فقط
      bindInlineCategorySelection(panel);
    }, true);
    document.body.dataset.drawerTabDelegated = '1';
  }
  document.addEventListener('click', (e) => {
    const hashLink = e.target.closest('a[href="#"]');
    if (!hashLink) return;
    e.preventDefault();
    stripHashSilently();
  }, true);
  bindInlineCategorySelection(categoryDrawer || document);
  bindAccordion(categoryDrawer || document);
}


function handleSearch(e) {
  const term = String(e.target.value || '').trim().toLowerCase();
  const results = !term ? [] : activeItems(state.products).filter(item => [item.name, item.description, item.badge].join(' ').toLowerCase().includes(term)).slice(0, 8);
  const count = $('#searchCount');
  const host = $('#searchResults');
  if (!count || !host) return;
  count.textContent = term ? `النتائج: ${results.length}` : '';
  host.innerHTML = !term ? '' : results.length ? `<div class="search-results">${results.map(renderSearchCard).join('')}</div>` : emptyState('لا توجد نتائج');
  bindProductButtons(host);
  bindAccordionCategoryTriggers(host);
  // لا نستدعي renderInlineReviewsBeforeFooter هنا لأن البحث لا يحتاجها
}

function renderSearchCard(item) {
  return `<a class="search-card" href="${rel('pages/product.html')}?id=${encodeURIComponent(item.id)}">
    <img src="${escapeHtml(imageSrc(item.image))}" alt="${escapeHtml(item.name)}" class="search-thumb" onerror="this.onerror=null;this.src='${APP_CONFIG.FALLBACK_IMAGE}'">
    <div><strong>${escapeHtml(item.name)}</strong><div class="muted">${escapeHtml(formatCurrency(item.price))}</div></div>
  </a>`;
}

// دالة ضرورية: تُظهر مراجعات مضمنة فوق الفوتر في صفحات المنتج والتصنيف
function renderInlineReviewsBeforeFooter() {
  const footerHost = document.getElementById('footerHost');
  if (!footerHost) return;
  const oldSection = document.getElementById('inlineReviewsSection');
  if (oldSection) oldSection.remove();
  const items = activeItems(state.reviews).length
    ? activeItems(state.reviews).slice(0, 3)
    : activeItems(LOCAL_SEED.reviews || []).slice(0, 3);
  if (!items.length) return;
  const section = document.createElement('section');
  section.id = 'inlineReviewsSection';
  section.className = 'section section--inline-reviews';
  section.innerHTML = `<div class="section-head"><h2 class="section-title">آراء العملاء</h2></div><div class="rail review-rail--compact">${items.map(item => `<article class="review-card review-card--compact"><div class="review-top">${item.image ? `<img class="review-avatar" src="${escapeHtml(imageSrc(item.image))}" alt="${escapeHtml(item.name)}" onerror="this.onerror=null;this.src='${rel('images/avatars/avatar-01.svg')}'">` : `<div class="review-avatar review-avatar--anon"></div>`}<div class="review-meta"><strong>${escapeHtml(item.name)}</strong><div class="review-stars">${'★'.repeat(Math.max(1, Math.min(5, Number(item.rating || 5))))}</div></div></div><p>${escapeHtml(item.text)}</p></article>`).join('')}</div>`;
  footerHost.parentNode.insertBefore(section, footerHost);
}

function bindProductButtons(scope = document) {
  $$('[data-add-to-cart]', scope).forEach(btn => {
    btn.onclick = (e) => {
      e.preventDefault();
      e.stopPropagation();
      addToCartById(btn.dataset.addToCart);
    };
  });
  $$('[data-buy-now]', scope).forEach(btn => {
    btn.onclick = (e) => {
      e.preventDefault();
      e.stopPropagation();
      buyNowById(btn.dataset.buyNow);
    };
  });
}


function renderHero() {
  const host = $('#heroSection');
  if (!host) return;
  const available = activeItems(state.sliders);
  const local = activeItems(LOCAL_SEED.sliders || []);
  if (!state.heroLockedItem) {
    state.heroLockedItem = available[0] || local[0] || null;
  }
  const item = state.heroLockedItem || available[0] || local[0] || null;
  host.innerHTML = item ? `
    <div class="hero-strip hero-strip--single">
      <a class="hero-strip-card hero-strip-card--lead hero-strip-card--fixed" href="${resolveTarget(item)}">
        <img class="hero-strip-media" src="${escapeHtml(imageSrc(item.image))}" alt="${escapeHtml(item.title || 'عرض مميز')}" onerror="this.onerror=null;this.src='${APP_CONFIG.FALLBACK_IMAGE}'">
        <div class="hero-strip-overlay"></div>
        <div class="hero-strip-content">
          <span class="hero-strip-chip">${escapeHtml(item.ctaLabel || 'عرض')}</span>
          <strong>${escapeHtml(item.title || 'عرض مميز')}</strong>
        </div>
      </a>
    </div>` : '';
}

function renderBannerRail() {
  const host = $('#promoBanners');
  if (!host) return;
  let items = activeItems(state.banners).slice(0, 4);
  if (!items.length) items = activeItems(LOCAL_SEED.banners || []).slice(0, 4);
  host.innerHTML = items.length ? `<div class="banner-grid banner-grid--revamp">${items.map((item, index) => `
    <a class="banner-card banner-card--${index === 0 ? 'wide' : index === 3 ? 'tall' : 'standard'}" href="${resolveTarget(item)}">
      <img class="banner-media" src="${escapeHtml(imageSrc(item.image))}" alt="${escapeHtml(item.title)}" onerror="this.onerror=null;this.src='${APP_CONFIG.FALLBACK_IMAGE}'">
      <div class="banner-overlay"></div>
      <div class="banner-title"><span>${index === 0 ? 'Featured' : 'Hot'}</span><strong>${escapeHtml(item.title)}</strong></div>
    </a>`).join('')}</div>` : emptyState('لا توجد عروض');
}

function topCategories() { return activeItems(state.categories).filter(item => !item.parentId); }
function childCategories(parentId) { return activeItems(state.categories).filter(item => item.parentId === parentId); }


function renderWhyChoose() {
  const host = $('#whyChooseSection');
  if (!host) return;
  host.innerHTML = `
    <div class="section-head section-head-center"><h2 class="section-title">مميزاتنا</h2></div>
    <div class="why-simple why-simple--claw">
      <article class="why-simple-card"><strong>الأسرع</strong><span>تسليم الطلب فورياً في أغلب العروض.</span></article>
      <article class="why-simple-card"><strong>الأسعار</strong><span>عروض واضحة وسعر منافس بدون تعقيد.</span></article>
      <article class="why-simple-card"><strong>الضمان</strong><span>واجهة منظمة ودعم واضح وتجربة شراء مريحة.</span></article>
    </div>`;
}

function renderCategoryRail() {
  const host = $('#categoryRail');
  if (!host) return;
  const items = topCategories();
  host.innerHTML = items.length ? `<div class="rail category-rail" data-accordion-root>${items.map(item => {
    const childCount = childCategories(item.id).length;
    return `
      <div class="category-card-wrap">
        <button class="category-card expand-toggle" type="button" aria-expanded="false" data-parent-id="${item.id}" data-category-toggle="${item.id}">
          <span class="category-card-head">
            <img class="category-thumb" src="${escapeHtml(imageSrc(item.image))}" alt="${escapeHtml(item.name)}" onerror="this.onerror=null;this.src='${APP_CONFIG.FALLBACK_IMAGE}'">
            <strong>${escapeHtml(item.name)}</strong>
          </span>
          <span class="category-meta">
            <small>${childCount ? childCount + ' تفرعات' : 'بدون تفرعات'}</small>
            <span class="chev">${ICONS.chevron}</span>
          </span>
        </button>
        <div class="subcat-sheet hidden" id="subsheet-${item.id}">
          ${childCount ? childCategories(item.id).map(sub => `
            <a class="subcat-link" href="${rel('pages/category.html')}?category=${encodeURIComponent(item.id)}&subcategory=${encodeURIComponent(sub.id)}" data-close-drawer>
              ${sub.image ? `<img class="subcat-thumb" src="${escapeHtml(imageSrc(sub.image))}" alt="${escapeHtml(sub.name)}" onerror="this.onerror=null;this.src='${APP_CONFIG.FALLBACK_IMAGE}'">` : ''}
              <span>${escapeHtml(sub.name)}</span>
            </a>`).join('') : '<span class="subcat-empty">لا توجد تفرعات</span>'}
        </div>
      </div>`;
  }).join('')}</div>` : emptyState('لا توجد تصنيفات');
  bindInlineCategorySelection(host);
}


function bindAccordion(scope=document) {
  $$('.expand-toggle,.tree-parent', scope).forEach(btn => {
    btn.setAttribute('aria-expanded', 'false');
    const pid = btn.dataset.parentId;
    const panel = document.getElementById(`subsheet-${pid}`) || document.getElementById(`tree-${pid}`);
    panel?.classList.add('hidden');
    btn.onclick = (e) => {
      e.preventDefault();
      e.stopPropagation();
      const expanded = btn.getAttribute('aria-expanded') === 'true';
      const root = btn.closest('[data-accordion-root]')?.parentElement || scope;
      $$('.subcat-sheet,.tree-children', root).forEach(el => el.classList.add('hidden'));
      $$('.expand-toggle,.tree-parent', root).forEach(el => el.setAttribute('aria-expanded', 'false'));
      if (!expanded) {
        panel?.classList.remove('hidden');
        btn.setAttribute('aria-expanded', 'true');
      }
    };
  });
}

function renderCardsRail() {
  const host = $('#cardsSection');
  if (!host) return;
  const items = topCategories();
  if (!items.length) { host.innerHTML = emptyState('لا توجد تصنيفات'); return; }
  const activeCatId = state.selectedCategoryId || '';
  const activeSubId = state.selectedSubcategoryId || '';
  const subs = activeCatId ? childCategories(activeCatId) : [];
  host.innerHTML = `
    <div class="home-tabs-wrap">
      <div class="tabs-inline">
        ${items.map(item => `<button class="tab-btn ${item.id === activeCatId && !activeSubId ? 'active' : ''}" type="button" data-home-category="${item.id}">${escapeHtml(item.name)}</button>`).join('')}
      </div>
      ${activeCatId && subs.length ? `<div class="tabs-inline subtabs-inline">${subs.map(sub => `<button class="tab-btn small ${activeSubId === sub.id ? 'active' : ''}" type="button" data-home-subcategory="${sub.id}" data-parent-id="${activeCatId}">${escapeHtml(sub.name)}</button>`).join('')}</div>` : ''}
    </div>`;
  $$('[data-home-category]', host).forEach(btn => {
    btn.onclick = () => {
      state.selectedCategoryId = btn.dataset.homeCategory;
      state.selectedSubcategoryId = null;
      renderCardsRail();
      renderProductSections();
    };
  });
  $$('[data-home-subcategory]', host).forEach(btn => {
    btn.onclick = () => {
      state.selectedCategoryId = btn.dataset.parentId || null;
      state.selectedSubcategoryId = btn.dataset.homeSubcategory;
      renderCardsRail();
      renderProductSections();
    };
  });
}



function getCardItemsByKinds(kinds = []) {
  const wanted = new Set((Array.isArray(kinds) ? kinds : [kinds]).map(item => String(item || '').toLowerCase()));
  return activeItems(state.cards).filter(item => wanted.has(String(item.cardKind || '').toLowerCase()));
}

function renderVerticalCharacterSection() {
  const host = $('#verticalCharacterSection');
  if (!host) return;
  let items = getCardItemsByKinds(['vertical-character', 'vertical_character', 'hero-character', 'hero_character']);
  if (!items.length) {
    items = [
      { image:'./images/cards/card-01.webp', title:'شخصية مميزة', subtitle:'عرض خاص', targetType:'subcategory', categoryId:'cat_accounts', subcategoryId:'sub_accounts_rare', targetId:'sub_accounts_rare' },
      { image:'./images/cards/card-02.webp', title:'شخصية نادرة', subtitle:'عرض متجدد', targetType:'subcategory', categoryId:'cat_boost', subcategoryId:'sub_boost_flash', targetId:'sub_boost_flash' },
      { image:'./images/cards/card-03.webp', title:'بطاقة إضافية', subtitle:'قسم جاهز', targetType:'category', categoryId:'cat_ready', targetId:'cat_ready' }
    ];
  }
  items = items.slice(0, 3);
  host.innerHTML = `<div class="section-head"><h2 class="section-title">حسابات قوية</h2></div><div class="vertical-characters-grid">${items.map(item => `<a class="vertical-character-card vertical-character-card--clean" href="${resolveTarget(item)}"><div class="vertical-character-media-wrap"><img class="vertical-character-media" src="${escapeHtml(imageSrc(item.image))}" alt="${escapeHtml(item.title || item.subtitle || 'حساب')}" onerror="this.onerror=null;this.src='${APP_CONFIG.FALLBACK_IMAGE}'"></div><div class="vertical-character-copy">${item.title ? `<strong class="vertical-character-title">${escapeHtml(item.title)}</strong>` : ''}${item.subtitle ? `<span class="vertical-character-subtitle">${escapeHtml(item.subtitle)}</span>` : ''}<span class="vertical-character-cta">استعرض</span></div></a>`).join('')}</div>`;
}

function renderDrawerCategoryLauncher() {
  const host = $('#cardsSection');
  if (!host) return;
  const items = topCategories().slice(0, 6);
  host.innerHTML = `<div class="drawer-launcher-card"><button class="drawer-launcher-btn" type="button" data-open-drawer="true">${ICONS.categories}<span>فتح التصنيفات</span></button>${items.length ? `<div class="drawer-launcher-chips">${items.map(item => `<button class="drawer-launcher-chip" type="button" data-open-drawer="true">${escapeHtml(item.name)}</button>`).join('')}</div>` : ''}</div>`;
  $$('[data-open-drawer]', host).forEach(el => el.addEventListener('click', (e) => { e.preventDefault(); const drawer = document.getElementById('categoryDrawer'); if (drawer) { drawer.classList.remove('hidden'); drawer.setAttribute('aria-hidden', 'false'); document.body.classList.add('drawer-open'); } }));
}

function renderCharacterCarouselSection() {
  const host = $('#characterCarouselSection');
  if (!host) return;
  let items = getCardItemsByKinds(['character-carousel', 'character_carousel', 'horizontal-character', 'horizontal_character', 'character', 'persona', 'avatar']);
  if (!items.length) items = getCardItemsByKinds(['character', 'persona', 'avatar']);
  if (!items.length) {
    items = [
      { image:'./images/cards/card-01.webp', title:'عنصر مميز', subtitle:'قسم متحرك', targetType:'subcategory', categoryId:'cat_accounts', subcategoryId:'sub_accounts_rare', targetId:'sub_accounts_rare' },
      { image:'./images/cards/card-02.webp', title:'عنصر جديد', subtitle:'عرض خاص', targetType:'subcategory', categoryId:'cat_boost', subcategoryId:'sub_boost_flash', targetId:'sub_boost_flash' },
      { image:'./images/cards/card-03.webp', title:'عنصر إضافي', subtitle:'قسم جاهز', targetType:'category', categoryId:'cat_ready', targetId:'cat_ready' }
    ];
  }
  const displayItems = items.map(item => ({ ...item, uiLabel: item.title || item.subtitle || 'عنصر' }));
  const doubled = displayItems.concat(displayItems);
  host.innerHTML = `<div class="section-head"><h2 class="section-title">اكستريمك المفضل ماكس</h2></div><div class="character-carousel-viewport"><div class="character-carousel-track auto-marquee auto-marquee-bounce">${doubled.map(item => `<a class="character-carousel-card character-carousel-card--clean" href="${resolveTarget(item)}"><img class="character-carousel-media" src="${escapeHtml(imageSrc(item.image))}" alt="${escapeHtml(item.uiLabel)}" onerror="this.onerror=null;this.src='${APP_CONFIG.FALLBACK_IMAGE}'"><span class="character-carousel-label">${escapeHtml(item.uiLabel)}</span></a>`).join('')}</div></div>`;
}

function renderProductCard(item, variant = 'horizontal') {
  const cls = variant === 'portrait' ? 'product-card--portrait' : 'product-card--horizontal';
  return `<article class="product-card ${cls}">
    <a class="product-media-link" href="${rel('pages/product.html')}?id=${encodeURIComponent(item.id)}">
      <img class="product-media" src="${escapeHtml(imageSrc(item.image))}" alt="${escapeHtml(item.name)}" onerror="this.onerror=null;this.src='${APP_CONFIG.FALLBACK_IMAGE}'">
      ${item.badge ? `<span class="badge">${escapeHtml(item.badge)}</span>` : ''}
    </a>
    <div class="product-body">
      <h3 class="product-title">${escapeHtml(item.name)}</h3>
      <div class="price-row">
        <strong class="price-current">${escapeHtml(formatCurrency(item.price))}</strong>
        ${item.oldPrice ? `<span class="price-old">${escapeHtml(formatCurrency(item.oldPrice))}</span>` : ''}
      </div>
      <div class="product-actions">
        <button class="btn btn-primary full" data-add-to-cart="${item.id}" type="button">أضف للسلة</button>
        <button class="btn btn-secondary full" data-buy-now="${item.id}" type="button">اشتر الآن</button>
      </div>
    </div>
  </article>`;
}

function renderProductSections() {
  const host = $('#productSections');
  if (!host) return;
  let productsAll = activeItems(state.products);
  if (!productsAll.length && Array.isArray(LOCAL_SEED.products)) {
    state.products = LOCAL_SEED.products;
    productsAll = activeItems(state.products);
  }
  const groups = [];
  if (state.selectedSubcategoryId) {
    const sub = state.categories.find(item => item.id === state.selectedSubcategoryId);
    const items = productsAll.filter(item => item.subcategoryId === state.selectedSubcategoryId).slice(0, 12);
    groups.push({ title: sub?.name || 'المنتجات', items, href: `${rel('pages/category.html')}?category=${encodeURIComponent(sub?.parentId || '')}&subcategory=${encodeURIComponent(state.selectedSubcategoryId)}` });
  } else if (state.selectedCategoryId) {
    const cat = state.categories.find(item => item.id === state.selectedCategoryId);
    const items = productsAll.filter(item => item.categoryId === state.selectedCategoryId).slice(0, 12);
    groups.push({ title: cat?.name || 'المنتجات', items, href: `${rel('pages/category.html')}?category=${encodeURIComponent(state.selectedCategoryId)}` });
  } else {
    activeItems(state.cards).filter(item => item.cardKind === 'section').forEach(section => {
      const items = productsAll.filter(item => item.categoryId === section.categoryId).slice(0, 12);
      if (items.length) groups.push({ title: section.title, items, href: `${rel('pages/category.html')}?category=${encodeURIComponent(section.categoryId || '')}` });
    });
    if (!groups.length) groups.push({ title: 'المنتجات', items: productsAll.slice(0, 12), href: `${rel('pages/category.html')}` });
  }
  host.innerHTML = groups.map(section => `
    <section class="section section--product-collection">
      <div class="section-head">
        <h2 class="section-title">${escapeHtml(section.title)}</h2>
        <a class="link-inline" href="${section.href || '#'}">عرض الكل</a>
      </div>
      ${section.items.length ? `<div class="product-list product-list--horizontal product-list--portrait">${section.items.map(item => renderProductCard(item, 'portrait')).join('')}</div>` : emptyState('لا توجد منتجات')}
    </section>`).join('');
  bindProductButtons(host);
}

function renderReviews() {
  const host = $('#reviewsSection');
  if (!host) return;
  const items = activeItems(state.reviews).length ? activeItems(state.reviews) : activeItems(LOCAL_SEED.reviews || []).length ? activeItems(LOCAL_SEED.reviews || []) : [
    {name:'عميل موثق', image:'./images/avatars/avatar-01.svg', rating:5, text:'تعامل سريع وتجربة شراء مريحة جدًا.'},
    {name:'مستخدم مميز', image:'./images/avatars/avatar-02.svg', rating:5, text:'الواجهة واضحة والمنتجات مرتبة بشكل ممتاز.'},
    {name:'عميل دائم', image:'./images/avatars/avatar-03.svg', rating:5, text:'أفضل من القوالب العادية بكثير في الجوال.'}
  ];
  host.innerHTML = `<div class="section-head"><h2 class="section-title">آراء العملاء</h2></div><div class="rail review-rail--compact">${items.map(item => `<article class="review-card review-card--compact"><div class="review-top">${item.image ? `<img class="review-avatar" src="${escapeHtml(imageSrc(item.image))}" alt="${escapeHtml(item.name)}" onerror="this.onerror=null;this.src='${rel('images/avatars/avatar-01.svg')}'">` : `<div class="review-avatar review-avatar--anon"></div>`}<div class="review-meta"><strong>${escapeHtml(item.name)}</strong><div class="review-stars">${'★'.repeat(Math.max(1, Math.min(5, Number(item.rating || 5))))}</div></div></div><p>${escapeHtml(item.text)}</p></article>`).join('')}</div>`;
  initAutoScroll();
}

function renderShortcutSection() {
  const host = $('#shortcutSection');
  if (!host) return;
  const items = activeItems(state.cards).filter(item => (item.cardKind || '').toLowerCase() === 'shortcut');
  if (!items.length) { host.innerHTML = ''; return; }
  host.innerHTML = `<div class="section-head"><h2 class="section-title">عروض قوية</h2></div><div class="rail shortcut-rail auto-scroll-rail">${items.map(item => `<a class="shortcut-card shortcut-card--clean" href="${resolveTarget(item)}"><img src="${escapeHtml(imageSrc(item.image))}" alt="${escapeHtml(item.title || 'عرض') }" class="shortcut-media" onerror="this.onerror=null;this.src='${APP_CONFIG.FALLBACK_IMAGE}'"><span>${escapeHtml(item.title || 'عرض')}</span></a>`).join('')}</div>`;
  initAutoScroll();
}

function renderCharacterSection() {
  let host = document.getElementById('characterSection');
  if (!host) {
    const reviewsHost = document.getElementById('reviewsSection');
    const explicitHost = document.getElementById('characterSection');
    if (explicitHost) host = explicitHost;
    const anchorHost = reviewsHost || document.getElementById('finalBannerSection') || document.getElementById('footerHost');
    if (anchorHost) {
      host = document.createElement('section');
      host.id = 'characterSection';
      host.className = 'section';
      anchorHost.parentNode.insertBefore(host, anchorHost);
    }
  }
  if (!host) return;
  let items = activeItems(state.cards).filter(item => ['character','persona','avatar'].includes((item.cardKind || '').toLowerCase()));
  if (!items.length) {
    items = [
      { image:'./images/cards/card-01.webp', subtitle:'شانكس + جواهر', targetType:'subcategory', categoryId:'cat_accounts', subcategoryId:'sub_accounts_rare', targetId:'sub_accounts_rare' },
      { image:'./images/cards/card-02.webp', subtitle:'أكاينو + عروض', targetType:'subcategory', categoryId:'cat_boost', subcategoryId:'sub_boost_flash', targetId:'sub_boost_flash' },
      { image:'./images/cards/card-03.webp', subtitle:'قوالب + عروض', targetType:'category', categoryId:'cat_ready', targetId:'cat_ready' }
    ];
  }
  host.innerHTML = `<div class="section-head"><h2 class="section-title">شخصيات ون بيس</h2></div><div class="characters-grid">${items.map(item => {
    const label = item.subtitle || '';
    return `<a class="character-card" href="${resolveTarget(item)}"><img src="${escapeHtml(imageSrc(item.image))}" alt="${escapeHtml(label || 'شخصية')}" class="character-media" onerror="this.onerror=null;this.src='${APP_CONFIG.FALLBACK_IMAGE}'">${label ? `<small class="character-subtitle character-subtitle--single">${escapeHtml(label)}</small>` : ''}</a>`;
  }).join('')}</div>`;
}

function renderFinalBannerSection() {
  let host = document.getElementById('finalBannerSection');
  if (!host) {
    const footerHost = document.getElementById('finalBannerSection') || document.getElementById('footerHost');
    if (footerHost) {
      host = document.createElement('section');
      host.id = 'finalBannerSection';
      host.className = 'section final-banner-section';
      footerHost.parentNode.insertBefore(host, footerHost);
    }
  }
  if (!host) return;
  const items = activeItems(state.banners).slice(-2);
  const fallback = [{ image:'./images/banners/banner-03.jpg', title:'عروض حصرية', targetType:'category', categoryId:'cat_codes', targetId:'cat_codes', ctaLabel:'استعرض الآن' }, { image:'./images/banners/banner-04.jpg', title:'فئة مميزة', targetType:'category', categoryId:'cat_services', targetId:'cat_services', ctaLabel:'اكتشفها' }];
  const finalItems = items.length ? items : fallback;
  host.innerHTML = `<div class="section-head"><h2 class="section-title">عروض ختامية</h2></div><div class="final-banner-grid">${finalItems.map(item => `<a class="final-banner-card" href="${resolveTarget(item)}"><img src="${escapeHtml(imageSrc(item.image))}" alt="${escapeHtml(item.title || 'بنر')}" onerror="this.onerror=null;this.src='${APP_CONFIG.FALLBACK_IMAGE}'"><div class="final-banner-overlay"></div><div class="final-banner-copy"><strong>${escapeHtml(item.title || '')}</strong><span>${escapeHtml(item.ctaLabel || 'استعرض')}</span></div></a>`).join('')}</div>`;
}


function ensureHomeSequence() {
  const main = document.querySelector('.home-main');
  if (!main) return;
  const ids = ['heroSection','verticalCharacterSection','promoBanners','whyChooseSection','cardsSection','shortcutSection','characterCarouselSection','productSections','characterSection','reviewsSection','finalBannerSection'];
  ids.forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    if (id === 'promoBanners' || id === 'cardsSection') {
      const section = el.closest('section');
      if (section && section.parentElement === main) main.appendChild(section);
    } else {
      const section = el.tagName.toLowerCase() === 'section' ? el : el.closest('section') || el;
      if (section && section.parentElement === main) main.appendChild(section);
    }
  });
}

function renderHomePage() {
  try {
    const pending = JSON.parse(safeStorage.getItem('adnan_home_category_target_v1') || 'null');
    if (pending && (pending.categoryId || pending.subcategoryId)) {
      state.selectedCategoryId = pending.categoryId || state.selectedCategoryId || null;
      state.selectedSubcategoryId = pending.subcategoryId || null;
      safeStorage.removeItem('adnan_home_category_target_v1');
    } else if (getParam('category') || getParam('subcategory')) {
      state.selectedCategoryId = getParam('category') || null;
      state.selectedSubcategoryId = getParam('subcategory') || null;
    }
  } catch {}
  ensureHomeSequence();
  renderHero();
  renderVerticalCharacterSection();
  renderBannerRail();
  renderWhyChoose();
  renderCardsRail();
  renderShortcutSection();
  renderCharacterCarouselSection();
  renderProductSections();
  renderCharacterSection();
  renderReviews();
  renderFinalBannerSection();
  initAutoScroll();
}

function renderCategoryPage() {
  const tree = $('#categoryTree');
  const list = $('#categoryList');
  const title = $('#categoryCurrentTitle');
  const hero = $('#categoryHero');
  if (!tree || !list || !title) return;

  const productsAll = activeItems(state.products).length ? activeItems(state.products) : activeItems(LOCAL_SEED.products || []);
  const parents = topCategories().filter(parent => productsAll.some(item => item.categoryId === parent.id));
  const requestedSubId = getParam('subcategory');
  let requestedCategoryId = getParam('category');
  let currentSub = state.categories.find(item => item.id === requestedSubId && item.parentId);

  if (currentSub && !requestedCategoryId) requestedCategoryId = currentSub.parentId;
  let activeParent = state.categories.find(item => item.id === requestedCategoryId && !item.parentId) || parents[0] || topCategories()[0] || null;
  if (!activeParent && currentSub) activeParent = state.categories.find(item => item.id === currentSub.parentId) || null;
  const subs = activeParent ? childCategories(activeParent.id) : [];

  let items = productsAll;
  if (currentSub) {
    items = productsAll.filter(item => item.subcategoryId === currentSub.id);
    if (!items.length) currentSub = null;
  }
  if (!currentSub && activeParent) {
    items = productsAll.filter(item => item.categoryId === activeParent.id);
  }

  if (!items.length && parents.length) {
    activeParent = parents[0];
    currentSub = null;
    items = productsAll.filter(item => item.categoryId === activeParent.id);
  }

  const activeParentId = activeParent?.id || '';
  tree.innerHTML = `
    <div class="catalog-tabs-shell catalog-tabs-shell--clean">
      <div class="tabs-inline tabs-inline--catalog tabs-inline--clean">${parents.map(item => `<button class="tab-btn ${item.id === activeParentId ? 'active' : ''}" type="button" data-category-page-parent="${item.id}">${escapeHtml(item.name)}</button>`).join('')}</div>
      <div class="catalog-subgrid catalog-subgrid--clean">${activeParent ? `<button class="catalog-subcard ${!currentSub ? 'active' : ''}" type="button" data-category-page-open="${activeParent.id}" data-parent-id="${activeParent.id}"><strong>${escapeHtml(activeParent.name)}</strong><span>عرض الكل</span></button>` : ''}${subs.map(sub => `<button class="catalog-subcard ${currentSub?.id === sub.id ? 'active' : ''}" type="button" data-category-page-open="${sub.id}" data-parent-id="${activeParent.id}" data-sub="1">${sub.image ? `<img class="catalog-subthumb" src="${escapeHtml(imageSrc(sub.image))}" alt="${escapeHtml(sub.name)}" onerror="this.onerror=null;this.src='${APP_CONFIG.FALLBACK_IMAGE}'">` : ''}<strong>${escapeHtml(sub.name)}</strong><span>${escapeHtml(sub.subtitle || 'عرض المنتجات')}</span></button>`).join('')}</div>
    </div>`;

  $$('[data-category-page-parent]', tree).forEach(btn => btn.addEventListener('click', () => {
    goTo(`${rel('pages/category.html')}?category=${encodeURIComponent(btn.dataset.categoryPageParent)}`);
  }));
  $$('[data-category-page-open]', tree).forEach(btn => btn.addEventListener('click', () => {
    const parentId = btn.dataset.parentId || activeParentId;
    const subId = btn.dataset.sub === '1' ? btn.dataset.categoryPageOpen : '';
    const url = subId ? `${rel('pages/category.html')}?category=${encodeURIComponent(parentId)}&subcategory=${encodeURIComponent(subId)}` : `${rel('pages/category.html')}?category=${encodeURIComponent(parentId)}`;
    goTo(url);
  }));

  title.textContent = currentSub?.name || activeParent?.name || 'كل المنتجات';
  const heroImage = imageSrc(currentSub?.image || activeParent?.image || settings().logoUrl || APP_CONFIG.FALLBACK_IMAGE);
  hero && (hero.innerHTML = `<div class="category-page-hero category-page-hero--clean"><div class="page-hero-blur" style="background-image:url('${escapeHtml(heroImage)}')"></div><div class="page-hero-glass"><span class="eyebrow">التصنيفات</span><h1>${escapeHtml(title.textContent)}</h1><p class="muted">${items.length ? `${items.length} منتج متاح` : 'اختر من التصنيفات المتاحة بالأعلى'}</p></div></div>`);
  list.innerHTML = items.length
    ? `<div class="product-list product-list--horizontal product-list--portrait product-list--category-clean">${items.map(item => renderProductCard(item, 'portrait')).join('')}</div>`
    : `<div class="empty-state empty-state--category"><strong>اختر تصنيفاً لعرض المنتجات</strong><span>التصنيفات متاحة بالأعلى ويمكنك التنقل بينها مباشرة</span><a class="btn btn-secondary" href="${rel('index.html')}">الصفحة الرئيسية</a></div>`;
  bindProductButtons(list);
}


function renderProductPage() {
  const host = $('#productPageHost');
  if (!host) return;
  const { requestedId, item } = pickProductForPage();
  if (!item) {
    host.innerHTML = requestedId
      ? `<div class="empty-state empty-state--category"><strong>المنتج غير موجود</strong><span>رقم المنتج المطلوب غير موجود في المتجر.</span><a class="btn btn-secondary" href="${rel('index.html')}">الصفحة الرئيسية</a></div>`
      : emptyState('لا يوجد منتج متاح حاليًا');
    return;
  }
  const related = activeItems(state.products).filter(product => product.id !== item.id && product.categoryId === item.categoryId).slice(0, 6);
  const usingFallbackItem = false; // لا نستخدم fallback بعد الآن
  host.innerHTML = `
    <section class="section product-page product-page--rich">
      <div class="product-page-backdrop" style="background-image:url('${escapeHtml(imageSrc(item.image))}')"></div>
      <div class="product-page-media-wrap">
        <div class="product-page-media"><img src="${escapeHtml(imageSrc(item.image))}" alt="${escapeHtml(item.name)}" onerror="this.onerror=null;this.src='${APP_CONFIG.FALLBACK_IMAGE}'"></div>
      </div>
      <div class="product-page-body product-page-body--rich">
        <span class="eyebrow">تفاصيل المنتج</span>
        <h1>${escapeHtml(item.name)}</h1>
        <div class="price-row big">
          <strong class="price-current">${escapeHtml(formatCurrency(item.price))}</strong>
          ${item.oldPrice ? `<span class="price-old">${escapeHtml(formatCurrency(item.oldPrice))}</span>` : ''}
        </div>
        ${item.deliveryText ? `<div class="muted">${escapeHtml(item.deliveryText)}</div>` : ''}
        ${item.description ? `<p class="product-copy">${escapeHtml(item.description)}</p>` : '<p class="product-copy">منتج جاهز للشراء مع عرض الاسم والصورة والسعر والوصف بشكل واضح.</p>'}
        ${item.details ? `<div class="product-details-extra">${escapeHtml(item.details)}</div>` : ''}
        <div class="product-feature-list">
          <span class="product-feature-chip">تسليم سريع</span>
          <span class="product-feature-chip">آمن ومضمون</span>
          <span class="product-feature-chip">دعم مباشر</span>
        </div>
        <div class="product-actions product-actions--rich">
          <button class="btn btn-primary" data-add-to-cart="${item.id}" type="button">أضف للسلة</button>
          <button class="btn btn-secondary" data-buy-now="${item.id}" type="button">اشتر الآن</button>
        </div>
      </div>
    </section>
    <section class="section">
      <div class="section-head"><h2 class="section-title">منتجات مشابهة</h2></div>
      ${related.length ? `<div class="rail product-rail">${related.map(p => renderProductCard(p, 'portrait')).join('')}</div>` : emptyState('لا توجد منتجات مشابهة')}
    </section>`;
  if (!requestedId && window.history?.replaceState) {
    const url = new URL(window.location.href);
    url.searchParams.set('id', item.id);
    window.history.replaceState({}, '', url.toString());
  }
  document.title = `${item.name} | ${settings().storeName || 'المتجر'}`;
  bindProductButtons(host);
  bindAccordionCategoryTriggers(host);
  renderInlineReviewsBeforeFooter();
}

function renderCartPage() {
  const itemsHost = $('#cartItems');
  const summaryHost = $('#cartSummary');
  if (!itemsHost || !summaryHost) return;
  const cart = readCart();
  if (!cart.length) {
    itemsHost.innerHTML = `<div class="stack">${emptyState('السلة فارغة', 'أضف منتجات من المتجر ثم ارجع لإكمال الطلب.')}<a class="btn btn-secondary full" href="${rel('index.html')}">العودة للمتجر</a></div>`;
    summaryHost.innerHTML = '';
    return;
  }
  const total = cart.reduce((sum, item) => sum + item.price * item.quantity, 0);
  itemsHost.innerHTML = `<div class="stack">${cart.map(item => `
    <article class="cart-card">
      <img class="cart-thumb" src="${escapeHtml(imageSrc(item.image))}" alt="${escapeHtml(item.name)}" onerror="this.onerror=null;this.src='${APP_CONFIG.FALLBACK_IMAGE}'">
      <div class="cart-copy">
        <strong>${escapeHtml(item.name)}</strong>
        <div class="muted">${escapeHtml(formatCurrency(item.price))}</div>
        <div class="qty-row">
          <button class="qty-btn" data-qty="minus" data-id="${item.id}" type="button">-</button>
          <span>${item.quantity}</span>
          <button class="qty-btn" data-qty="plus" data-id="${item.id}" type="button">+</button>
          <button class="link-inline danger" data-remove="${item.id}" type="button">حذف</button>
        </div>
      </div>
    </article>`).join('')}</div>`;
  summaryHost.innerHTML = `<aside class="summary-card"><div class="summary-row"><span>الإجمالي</span><strong>${escapeHtml(formatCurrency(total))}</strong></div><a class="btn btn-primary full" href="${rel('pages/checkout.html')}">إتمام الطلب</a></aside>`;
  $$('[data-qty]').forEach(btn => btn.addEventListener('click', () => changeQty(btn.dataset.id, btn.dataset.qty === 'plus' ? 1 : -1)));
  $$('[data-remove]').forEach(btn => btn.addEventListener('click', () => removeFromCart(btn.dataset.remove)));
}

function changeQty(id, delta) {
  const cart = readCart();
  const item = cart.find(entry => entry.id === id);
  if (!item) return;
  if (delta > 0) {
    item.quantity = 1;
    writeCart(cart);
    renderCartPage();
    showToast('لا يمكن إضافة نفس الحساب أكثر من مرة', 'warning');
    return;
  }
  item.quantity = 1;
  writeCart(cart);
  renderCartPage();
}
function removeFromCart(id) {
  writeCart(readCart().filter(item => item.id !== id));
  renderCartPage();
}

function createCartOrder(cartItems = []) {
  // إنشاء طلب واحد من كامل محتوى السلة
  const user = state.currentUser;
  const total = cartItems.reduce((sum, item) => sum + Number(item.price || 0) * Number(item.quantity || 1), 0);
  const productTitles = cartItems.map(item => `${item.name} (×${item.quantity})`).join('، ');
  const order = {
    id: generateOrderId(),
    productId: cartItems.map(item => item.id).join(','),
    productTitle: productTitles,
    cartItems: cartItems.map(item => ({ id: item.id, name: item.name, price: item.price, quantity: item.quantity, image: item.image })),
    userId: user?.id || '',
    username: user?.name || '',
    email: user?.email || '',
    price: total,
    time: nowIso(),
    paymentMethod: '',
    status: 'pending_payment',
    senderName: '',
    notes: '',
    hasReceipt: false,
    timeline: [{ status: 'pending_payment', at: nowIso(), note: 'تم إنشاء الطلب من السلة' }]
  };
  return upsertOrder(order);
}

function renderCheckoutPage() {
  const host = $('#checkoutHost');
  if (!host) return;
  if (!isLoggedIn()) {
    host.innerHTML = `<div class="checkout-card"><h1 class="section-title">تسجيل الدخول مطلوب</h1><p class="muted">يجب تسجيل الدخول أولًا لإكمال الشراء.</p><a class="btn btn-primary full" href="${rel('pages/login.html')}?next=${encodeURIComponent(window.location.pathname + window.location.search)}">تسجيل الدخول أو إنشاء حساب</a></div>`;
    return;
  }
  const productId = getParam('product');
  const existingOrderId = getParam('order');
  // تحديد طول الـ ID من الـ URL لمنع إساءة الاستخدام
  let order = (existingOrderId && existingOrderId.length <= 60) ? getOrderById(existingOrderId) : null;

  if (!order && productId) {
    // شراء منتج مفرد مباشرة
    const product = state.products.find(item => item.id === productId);
    if (!product) { host.innerHTML = emptyState('المنتج غير موجود'); return; }
    order = createPendingOrder(product);
    history.replaceState({}, '', `${rel('pages/checkout.html')}?order=${encodeURIComponent(order.id)}`);
  }

  if (!order) {
    // محاولة إنشاء طلب من السلة الحالية
    const cartItems = readCart();
    if (cartItems.length > 0) {
      order = createCartOrder(cartItems);
      history.replaceState({}, '', `${rel('pages/checkout.html')}?order=${encodeURIComponent(order.id)}`);
    } else {
      host.innerHTML = `<div class="checkout-card"><h1 class="section-title">لا يوجد طلب نشط</h1><p class="muted">السلة فارغة. أضف منتجات ثم أتم الطلب.</p><a class="btn btn-primary full" href="${rel('index.html')}">تصفح المنتجات</a></div>`;
      return;
    }
  }
  const methods = getEnabledPaymentMethods();
  const bankMethods = methods.filter(item => item.group === 'bank');
  const directMethods = methods.filter(item => item.group !== 'bank');
  const selected = getPaymentMethodById(order.paymentMethod) || bankMethods[0] || directMethods[0];
  const methodPanel = (method) => `
    <div class="payment-detail ${selected?.id === method.id ? '' : 'hidden'}" data-method-panel="${method.id}">
      <div class="payment-info-card">
        <div class="payment-info-head"><strong>${escapeHtml(method.displayName)}</strong><span class="badge neutral">${escapeHtml(method.title)}</span></div>
        <div class="payment-info-grid">
          ${method.accountHolder ? `<div class="info-row"><span>اسم صاحب الحساب</span><strong>${escapeHtml(method.accountHolder)}</strong>${renderCopyButton(method.accountHolder)}</div>` : ''}
          ${method.accountNumber ? `<div class="info-row"><span>${method.id === 'master' ? 'رقم البطاقة' : 'رقم الحساب'}</span><strong dir="ltr">${escapeHtml(method.accountNumber)}</strong>${renderCopyButton(method.accountNumber)}</div>` : ''}
          ${method.iban ? `<div class="info-row"><span>IBAN</span><strong dir="ltr">${escapeHtml(method.iban)}</strong>${renderCopyButton(method.iban)}</div>` : ''}
          ${(method.extraFields || []).map(field => `<div class="info-row"><span>${escapeHtml(field.label)}</span><strong>${escapeHtml(field.value)}</strong>${renderCopyButton(field.value)}</div>`).join('')}
        </div>
        <div class="payment-note-box"><strong>تعليمات التحويل</strong><p>${escapeHtml(method.instructions || '')}</p></div>
      </div>
    </div>`;
  host.innerHTML = `
    <section class="manual-checkout-layout">
      <div class="checkout-main-card">
        <div class="checkout-title-row"><div><span class="eyebrow">اشتر الآن بعد التحويل</span><h1 class="section-title">إكمال الشراء</h1></div><span class="order-chip">رقم الطلب: ${escapeHtml(order.id)}</span></div>
        <div class="order-review-notice">سيتم إنشاء الطلب ثم مراجعته يدويًا بعد رفع الإيصال. لا يوجد تسليم تلقائي.</div>
        <div class="payment-tabs">
          <button class="tab-btn active" type="button" data-payment-group="bank">تحويل بنكي</button>
          ${directMethods.map(item => `<button class="tab-btn" type="button" data-direct-method="${item.id}">${escapeHtml(item.title)}</button>`).join('')}
        </div>
        <div class="payment-group payment-group--bank">
          <div class="payment-methods-list">
            ${bankMethods.map(item => `<button class="payment-method-card ${selected?.id === item.id ? 'active' : ''}" type="button" data-payment-method="${item.id}"><span>${item.icon || '•'}</span><strong>${escapeHtml(item.title)}</strong><small>تحويل بنكي</small></button>`).join('')}
          </div>
          ${bankMethods.map(methodPanel).join('')}
        </div>
        ${directMethods.map(item => `<div class="payment-group payment-group--single ${selected?.id === item.id ? '' : 'hidden'}" data-direct-panel="${item.id}"><div class="payment-method-single">${methodPanel(item)}</div></div>`).join('')}
        <form id="manualCheckoutForm" class="manual-checkout-form form-grid">
          <input type="hidden" name="orderId" value="${escapeHtml(order.id)}">
          <input type="hidden" name="methodId" value="${escapeHtml(selected?.id || '')}">
          <label class="field-group"><span>اسم صاحب الحساب الذي تم التحويل منه</span><input class="field" name="senderName" required placeholder="الاسم كما يظهر في التحويل"></label>
          <label class="field-group"><span>اسم حساب الزبون (عند الحاجة)</span><input class="field" name="customerAccountName" placeholder="اسم حساب الزبون (عند الحاجة)"></label>
          <label class="field-group"><span>ملاحظات إضافية</span><textarea class="field textarea-field" name="notes" placeholder="أي ملاحظة تساعد فريق المراجعة"></textarea></label>
          <div class="receipt-upload-card">
            <div class="receipt-upload-head"><strong>إثبات التحويل</strong><span class="muted">صور فقط - بحد أقصى 3MB</span></div>
            <input class="field" type="file" accept="image/*" name="receiptFile" id="receiptFile" required>
            <div class="preview-box hidden" id="receiptPreviewWrap"><img id="receiptPreviewImage" alt="receipt preview"></div>
            <button class="btn btn-secondary hidden" type="button" id="removeReceiptBtn">حذف الصورة</button>
          </div>
          <button class="btn btn-primary full" type="submit">إكمال الطلب</button>
        </form>
      </div>
      <aside class="checkout-summary-sticky">
        <div class="summary-card summary-card--checkout">
          <span class="eyebrow">ملخص الطلب</span>
          ${order.cartItems && order.cartItems.length > 1
            ? `<div class="checkout-items-list">${order.cartItems.map(ci => `<div class="checkout-item-row"><img class="checkout-item-thumb" src="${escapeHtml(imageSrc(ci.image))}" alt="${escapeHtml(ci.name)}" onerror="this.onerror=null;this.src='${APP_CONFIG.FALLBACK_IMAGE}'"><div class="checkout-item-info"><span>${escapeHtml(ci.name)}</span><small>×${ci.quantity} — ${escapeHtml(formatCurrency(ci.price * ci.quantity))}</small></div></div>`).join('')}</div>`
            : `<strong class="summary-title">${escapeHtml(order.productTitle)}</strong>`
          }
          <div class="summary-row"><span>رقم الطلب</span><strong style="font-size:0.75rem">${escapeHtml(order.id)}</strong></div>
          <div class="summary-row"><span>الحالة</span><strong>${escapeHtml(orderStatusMeta(order.status))}</strong></div>
          <div class="summary-row total"><span>الإجمالي</span><strong>${escapeHtml(formatCurrency(order.price))}</strong></div>
        </div>
      </aside>
    </section>`;
  const form = $('#manualCheckoutForm');
  const methodInput = form?.querySelector('input[name="methodId"]');
  const previewWrap = $('#receiptPreviewWrap');
  const previewImage = $('#receiptPreviewImage');
  const receiptFile = $('#receiptFile');
  const removeReceiptBtn = $('#removeReceiptBtn');
  function switchMethod(id) {
    form.querySelector('input[name="methodId"]').value = id;
    $$('[data-payment-method]').forEach(btn => btn.classList.toggle('active', btn.dataset.paymentMethod === id));
    $$('[data-method-panel]').forEach(panel => panel.classList.toggle('hidden', panel.dataset.methodPanel !== id));
    $$('[data-direct-panel]').forEach(panel => panel.classList.toggle('hidden', panel.dataset.directPanel !== id));
    $$('[data-direct-method]').forEach(btn => btn.classList.toggle('active', btn.dataset.directMethod === id));
    const isBank = bankMethods.some(item => item.id === id);
    $('[data-payment-group="bank"]')?.classList.toggle('active', isBank);
  }
  $$('[data-payment-method]').forEach(btn => btn.addEventListener('click', () => switchMethod(btn.dataset.paymentMethod)));
  $$('[data-direct-method]').forEach(btn => btn.addEventListener('click', () => switchMethod(btn.dataset.directMethod)));
  $('[data-payment-group="bank"]')?.addEventListener('click', () => switchMethod(bankMethods[0]?.id || ''));
  $$('[data-copy-value]').forEach(btn => btn.addEventListener('click', async () => { try { await navigator.clipboard.writeText(btn.dataset.copyValue || ''); showToast('تم النسخ', 'success'); } catch { showToast('تعذر النسخ', 'error'); } }));
  receiptFile?.addEventListener('change', async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) { showToast('الرجاء رفع صورة فقط', 'error'); receiptFile.value = ''; return; }
    if (file.size > 3 * 1024 * 1024) { showToast('حجم الصورة كبير جدًا', 'error'); receiptFile.value = ''; return; }
    const dataUrl = await fileToDataUrl(file);
    previewImage.src = dataUrl; previewWrap.classList.remove('hidden'); removeReceiptBtn.classList.remove('hidden');
  });
  removeReceiptBtn?.addEventListener('click', () => { receiptFile.value=''; previewWrap.classList.add('hidden'); removeReceiptBtn.classList.add('hidden'); previewImage.src=''; });
  form?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(form);
    const file = receiptFile?.files?.[0];
    if (!file) return showToast('أرفق صورة الإيصال', 'error');
    const preparedFile = await prepareReceiptFileForUpload(file);

    // زر الإرسال: تعطيل أثناء الرفع
    const submitBtn = form.querySelector('[type="submit"]');
    if (submitBtn) { submitBtn.disabled = true; submitBtn.textContent = 'جارٍ الرفع...'; }

    let receiptUrl = '';
    try {
      receiptUrl = await saveReceiptImage(order.id, preparedFile);
    } catch {
      receiptUrl = '';
    }

    const methodId = String(fd.get('methodId') || '').slice(0, 50);
    const senderName = String(fd.get('senderName') || '').trim().slice(0, 100);
    const customerAccountName = String(fd.get('customerAccountName') || '').trim().slice(0, 100);
    const notes = String(fd.get('notes') || '').trim().slice(0, 500);

    if (submitBtn) submitBtn.textContent = 'جارٍ حفظ الطلب...';
    await updateOrder(order.id, {
      paymentMethod: methodId,
      senderName,
      customerAccountName,
      notes,
      hasReceipt: Boolean(receiptUrl),
      receiptUrl,
      submittedAt: nowIso()
    });
    await pushOrderStatus(order.id, 'under_review', 'تم رفع الإيصال وإرسال الطلب للمراجعة');

    // ─── إفراغ السلة بعد نجاح الطلب فقط ──────────────────────────────────────
    if (order.cartItems && order.cartItems.length > 0) {
      // كان طلباً من السلة — نفرغها الآن بعد النجاح
      writeCart([]);
    }
    // ─────────────────────────────────────────────────────────────────────────

    // ─── إرسال رسالة واتساب للأدمن فور إتمام الطلب ──────────────────────────
    const wa = (settings().whatsappNumber || '').replace(/\D+/g, '');
    if (wa) {
      const method = getPaymentMethodById(methodId);
      const currency = formatCurrency(order.price);
      const lines = [
        `🛒 *طلب جديد يحتاج مراجعة*`,
        `─────────────────`,
        `📦 المنتج: ${order.productTitle}`,
        `💰 المبلغ: ${currency}`,
        `🆔 رقم الطلب: ${order.id}`,
        `👤 العميل: ${order.username || order.email || 'غير محدد'}`,
        `💳 طريقة الدفع: ${method?.displayName || methodId || 'غير محدد'}`,
        `📝 اسم المحوِّل: ${senderName || 'غير محدد'}`,
        notes ? `📌 ملاحظات: ${notes}` : '',
        receiptUrl ? `🧾 الإيصال: ${receiptUrl}` : `🧾 الإيصال: مرفق في التطبيق`,
        `─────────────────`,
        `⏰ ${new Date().toLocaleString('ar-SA')}`
      ].filter(Boolean).join('\n');
      const waHref = `https://wa.me/${wa}?text=${encodeURIComponent(lines)}`;
      window.open(waHref, '_blank', 'noopener,noreferrer');
    }
    // ─────────────────────────────────────────────────────────────────────────

    goTo(`${rel('pages/success.html')}?order=${encodeURIComponent(order.id)}`);
  });
  switchMethod(selected?.id || bankMethods[0]?.id || directMethods[0]?.id || '');
}

function renderLoginPage() {
  const host = $('#loginPageHost');
  if (!host) return;
  const authFlow = readAuthFlowState();
  if (state.currentUser) {
    host.innerHTML = `<div class="auth-card auth-card--account"><h1 class="section-title">أهلًا ${escapeHtml(state.currentUser.name || state.currentUser.email)}</h1><p class="muted">تم تسجيل دخولك بنجاح، ويمكنك الآن متابعة الطلبات والشراء مباشرة.</p><div class="stack compact"><a class="btn btn-primary full" href="${(authFlow?.next || nextUrl() || rel('index.html'))}">المتابعة</a><button class="btn btn-secondary full" id="logoutUserBtn" type="button">تسجيل الخروج</button></div><div id="accountAutoState" class="muted auth-state"></div></div>`;
    $('#logoutUserBtn')?.addEventListener('click', ()=>{ setCurrentUser(null); writeAuthFlowState(null); showToast('تم تسجيل الخروج', 'success'); renderLoginPage(); renderChrome(); initHardCategoryDrawer(); });
    const accountAutoState = $('#accountAutoState');
    if (authFlow?.pendingRedirect) {
      if (accountAutoState) accountAutoState.textContent = 'جارٍ تحويلك للصفحة التالية...';
      completeAuthFlow();
    }
    return;
  }
  const featured = activeItems(state.products).slice(0,3);
  host.innerHTML = `<div class="auth-layout-rich auth-layout-rich--enhanced">
    <div class="auth-card auth-card--wide auth-card--form">
      <div class="auth-switch auth-switch--pills">
        <button class="tab-btn active" type="button" data-auth-tab="login">تسجيل الدخول</button>
        <button class="tab-btn" type="button" data-auth-tab="register">إنشاء حساب</button>
      </div>
      <div class="auth-panel auth-panel--active" id="loginPanel">
        <h1 class="section-title">الدخول للحساب</h1>
        <p class="muted">إذا كان عندك حساب سابق، أدخل بريدك وكلمة المرور وسندخلك مباشرة.</p>
        <form id="loginForm" class="form-grid auth-form-grid" novalidate>
          <label class="field-group"><span>البريد الإلكتروني</span><input class="field" type="email" name="email" autocomplete="email" inputmode="email" placeholder="name@gmail.com" required></label>
          <label class="field-group"><span>كلمة المرور</span><input class="field" type="password" name="password" autocomplete="current-password" placeholder="••••••••" required></label>
          <button class="btn btn-primary full auth-submit-btn" type="submit" id="loginSubmitBtn">دخول</button>
          <a class="btn btn-secondary full auth-register-link" href="${rel('pages/login.html')}?mode=register${nextUrl() ? `&next=${encodeURIComponent(nextUrl())}` : ''}">إنشاء حساب جديد</a>
        </form>
      </div>
      <div class="auth-panel hidden" id="registerPanel">
        <h1 class="section-title">إنشاء حساب جديد</h1>
        <p class="muted">أنشئ الحساب مرة واحدة، وسيتم تسجيل دخولك تلقائيًا فور الإنشاء.</p>
        <form id="registerForm" class="form-grid auth-form-grid" novalidate>
          <label class="field-group"><span>البريد الإلكتروني</span><input class="field" type="email" name="email" autocomplete="email" inputmode="email" placeholder="name@gmail.com" required></label>
          <label class="field-group"><span>كلمة المرور</span><input class="field" type="password" name="password" autocomplete="new-password" placeholder="8 أحرف على الأقل" required></label>
          <label class="field-group"><span>تأكيد كلمة المرور</span><input class="field" type="password" name="confirmPassword" autocomplete="new-password" placeholder="أعد كتابة كلمة المرور" required></label>
          <button class="btn btn-primary full auth-submit-btn" type="submit" id="registerSubmitBtn">إنشاء الحساب</button>
        </form>
      </div>
      <div id="loginState" class="muted auth-state"></div>
    </div>
    <aside class="auth-card auth-card--side">
      <h2 class="section-title">مزايا الحساب</h2>
      <ul class="auth-benefits"><li>الدخول السريع إلى السلة والطلبات</li><li>إكمال الشراء بسهولة من أي جهاز</li><li>حفظ بياناتك للطلبات القادمة</li></ul>
      ${featured.length ? `<div class="auth-featured">${featured.map(item => `<a class="auth-product-chip" href="${rel('pages/product.html')}?id=${encodeURIComponent(item.id)}"><img src="${escapeHtml(imageSrc(item.image))}" alt="${escapeHtml(item.name)}" onerror="this.onerror=null;this.src='${APP_CONFIG.FALLBACK_IMAGE}'"><span>${escapeHtml(item.name)}</span></a>`).join('')}</div>` : ''}
    </aside>
  </div>`;
  const switchTab = (tab, syncQuery = true) => {
    $$('[data-auth-tab]').forEach(x=>x.classList.toggle('active', x.dataset.authTab === tab));
    $('#loginPanel')?.classList.toggle('hidden', tab !== 'login');
    $('#registerPanel')?.classList.toggle('hidden', tab !== 'register');
    $('#loginPanel')?.classList.toggle('auth-panel--active', tab === 'login');
    $('#registerPanel')?.classList.toggle('auth-panel--active', tab === 'register');
    const stateNode = $('#loginState');
    if (stateNode) {
      stateNode.textContent = '';
      stateNode.className = 'muted auth-state';
    }
    if (syncQuery && window.history?.replaceState) {
      const url = new URL(window.location.href);
      if (tab === 'register') url.searchParams.set('mode', 'register');
      else url.searchParams.delete('mode');
      window.history.replaceState({}, '', url.toString());
    }
  };
  $$('[data-auth-tab]').forEach(btn => btn.addEventListener('click', ()=> switchTab(btn.dataset.authTab)));
  $('#loginForm')?.addEventListener('submit', handleLogin);
  $('#registerForm')?.addEventListener('submit', handleRegister);
  switchTab(getParam('mode') === 'register' ? 'register' : 'login', false);
}


async function handleLogin(event) {
  event.preventDefault();
  const formEl = event.currentTarget;
  const form = new FormData(formEl);
  const email = String(form.get('email') || '').trim().toLowerCase();
  const password = String(form.get('password') || '');
  const submitBtn = formEl.querySelector('[type="submit"]');
  const stateEl = $('#loginState');

  const setState = (message, kind = 'error') => {
    if (stateEl) {
      stateEl.textContent = message;
      stateEl.className = `auth-state auth-state--${kind}`;
    }
  };
  const restoreSubmit = () => {
    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.textContent = 'دخول';
    }
  };

  if (!checkLoginRateLimit(email)) return setState('تم تجاوز عدد المحاولات. حاول بعد 10 دقائق.', 'error');
  if (!email || !password) return setState('يرجى إدخال البريد وكلمة المرور.', 'error');
  if (!isAcceptedEmail(email)) return setState('يرجى إدخال بريد إلكتروني صحيح مثل name@gmail.com', 'error');
  if (password.length > 128) return setState('بيانات الدخول غير صحيحة.', 'error');

  if (submitBtn) {
    submitBtn.disabled = true;
    submitBtn.textContent = 'جارٍ التحقق...';
  }

  try {
    const users = readUsers();
    const localUser = users.find(item => normalizeEmail(item.email) === email) || null;
    const localCheck = localUser ? await verifyLocalUserPassword(localUser, password) : { matched:false, migratedUser:null };

    if (fb.ready && fb.auth && fb.api?.signInWithEmailAndPassword) {
      try {
        const creds = await withTimeout(fb.api.signInWithEmailAndPassword(fb.auth, email, password), 12000, 'login-timeout');
        const mirrored = await upsertLocalUserMirror({ id:creds.user.uid, uid:creds.user.uid, name:creds.user.displayName || localCheck.migratedUser?.name || email.split('@')[0], email:creds.user.email || email }, password);
        clearLoginRateLimit(email);
        setCurrentUser(sanitizeCustomerUser(mirrored || { id:creds.user.uid, uid:creds.user.uid, name:creds.user.displayName || email.split('@')[0], email:creds.user.email || email }));
        writeAuthFlowState({ pendingRedirect: true, next: nextUrl() || rel('index.html') });
        setState('✓ تم تسجيل الدخول بنجاح', 'success');
        renderChrome();
        renderLoginPage();
        return;
      } catch (error) {
        const code = authErrorCode(error);
        if (['user-not-found','invalid-credential','wrong-password','invalid-login-credentials'].includes(code) && localCheck.matched) {
          clearLoginRateLimit(email);
          setCurrentUser(sanitizeCustomerUser(localCheck.migratedUser));
          writeAuthFlowState({ pendingRedirect: true, next: nextUrl() || rel('index.html') });
          setState('✓ تم تسجيل الدخول بنجاح', 'success');
          renderChrome();
          renderLoginPage();
          return;
        }
        if (['user-not-found'].includes(code) && !localUser) {
          recordLoginFailure(email);
          restoreSubmit();
          return setState('لا يوجد حساب مسجّل بهذا البريد الإلكتروني.', 'error');
        }
        if (['wrong-password','invalid-credential','invalid-login-credentials'].includes(code)) {
          recordLoginFailure(email);
          restoreSubmit();
          if (localUser && !localCheck.matched) {
            return setState('كلمة المرور غير صحيحة.', 'error');
          }
          return setState('البريد الإلكتروني أو كلمة المرور غير صحيحة.', 'error');
        }
        if (['network-request-failed','login-timeout'].includes(code) && localCheck.matched) {
          clearLoginRateLimit(email);
          setCurrentUser(sanitizeCustomerUser(localCheck.migratedUser));
          writeAuthFlowState({ pendingRedirect: true, next: nextUrl() || rel('index.html') });
          setState('✓ تم تسجيل الدخول محليًا', 'success');
          renderChrome();
          renderLoginPage();
          return;
        }
        if (!['user-not-found','wrong-password','invalid-credential','invalid-login-credentials','network-request-failed','login-timeout'].includes(code)) {
          throw error;
        }
      }
    }

    if (!localUser) {
      recordLoginFailure(email);
      restoreSubmit();
      return setState('لا يوجد حساب مسجّل بهذا البريد الإلكتروني.', 'error');
    }
    if (!localCheck.matched) {
      recordLoginFailure(email);
      restoreSubmit();
      return setState('كلمة المرور غير صحيحة.', 'error');
    }

    clearLoginRateLimit(email);
    setCurrentUser(sanitizeCustomerUser(localCheck.migratedUser));
    writeAuthFlowState({ pendingRedirect: true, next: nextUrl() || rel('index.html') });
    setState('✓ تم تسجيل الدخول بنجاح', 'success');
    renderChrome();
    renderLoginPage();
  } catch (error) {
    console.error('Login failed', error);
    restoreSubmit();
    setState('تعذّر تسجيل الدخول الآن. حاول مرة أخرى.', 'error');
  }
}


async function handleRegister(event) {
  event.preventDefault();
  const formEl = event.currentTarget;
  const form = new FormData(formEl);
  const email = String(form.get('email') || '').trim().toLowerCase().slice(0, 100);
  const password = String(form.get('password') || '').trim();
  const confirmPassword = String(form.get('confirmPassword') || '').trim();
  const submitBtn = formEl.querySelector('[type="submit"]');
  const stateEl = $('#loginState');

  const setError = (msg) => {
    if (stateEl) {
      stateEl.textContent = msg;
      stateEl.className = 'auth-state auth-state--error';
    }
    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.textContent = 'إنشاء الحساب';
    }
  };

  if (!email || !isAcceptedEmail(email)) return setError('يرجى إدخال بريد إلكتروني صحيح مثل name@gmail.com');
  if (!password || password.length < 8) return setError('كلمة المرور يجب أن تكون 8 أحرف على الأقل.');
  if (!/[A-Za-z]/.test(password) || !/\d/.test(password)) return setError('كلمة المرور يجب أن تحتوي على حروف وأرقام.');
  if (password.length > 128) return setError('كلمة المرور طويلة جداً.');
  if (password !== confirmPassword) return setError('كلمة المرور وتأكيدها غير متطابقتان.');

  if (submitBtn) {
    submitBtn.disabled = true;
    submitBtn.textContent = 'جارٍ الإنشاء...';
  }

  try {
    const users = readUsers();
    if (users.length > 1500) return setError('تعذّر إنشاء الحساب. تواصل مع الدعم.');
    if (users.some(item => normalizeEmail(item.email) === email)) {
      if (!fb.ready) return setError('هذا البريد مسجل مسبقًا. يمكنك تسجيل الدخول.');
    }

    let user = null;
    if (fb.ready && fb.auth && fb.api?.createUserWithEmailAndPassword) {
      try {
        const creds = await withTimeout(fb.api.createUserWithEmailAndPassword(fb.auth, email, password), 15000, 'register-timeout');
        if (fb.api?.updateProfile) {
          await fb.api.updateProfile(creds.user, { displayName: email.split('@')[0] }).catch(() => {});
        }
        const mirrored = await upsertLocalUserMirror({ id:creds.user.uid, uid:creds.user.uid, name: email.split('@')[0], email }, password);
        user = sanitizeCustomerUser(mirrored || { id:creds.user.uid, uid:creds.user.uid, name: email.split('@')[0], email });
      } catch (error) {
        const code = authErrorCode(error);
        if (code === 'email-already-in-use') {
          if (fb.api?.signInWithEmailAndPassword) {
            try {
              const existingCreds = await withTimeout(fb.api.signInWithEmailAndPassword(fb.auth, email, password), 12000, 'login-timeout');
              const mirrored = await upsertLocalUserMirror({
                id: existingCreds.user.uid,
                uid: existingCreds.user.uid,
                name: existingCreds.user.displayName || email.split('@')[0],
                email: existingCreds.user.email || email
              }, password);
              user = sanitizeCustomerUser(mirrored || {
                id: existingCreds.user.uid,
                uid: existingCreds.user.uid,
                name: existingCreds.user.displayName || email.split('@')[0],
                email: existingCreds.user.email || email
              });
            } catch (signInErr) {
              const signInCode = authErrorCode(signInErr);
              if (['wrong-password','invalid-credential','invalid-login-credentials'].includes(signInCode)) {
                return setError('هذا البريد مسجل مسبقًا لكن كلمة المرور غير صحيحة.');
              }
              return setError('هذا البريد مسجل مسبقًا. يمكنك تسجيل الدخول.');
            }
          } else {
            return setError('هذا البريد مسجل مسبقًا. يمكنك تسجيل الدخول.');
          }
        }
        if (!['network-request-failed','register-timeout'].includes(code)) throw error;
      }
    }

    if (!user) {
      if (users.some(item => normalizeEmail(item.email) === email)) return setError('هذا البريد مسجل مسبقًا. يمكنك تسجيل الدخول.');
      const salt = generateSalt();
      const passwordHash = await hashPassword(password, salt);
      const rand = Array.from(crypto.getRandomValues(new Uint8Array(4))).map(b => b.toString(16).padStart(2,'0')).join('');
      user = {
        id: `USR-${Date.now().toString(36)}-${rand}`,
        uid: '',
        name: email.split('@')[0],
        email,
        passwordHash,
        passwordSalt: salt,
        role: 'customer',
        createdAt: nowIso()
      };
      users.push(user);
      saveUsers(users);
      user = sanitizeCustomerUser(user);
    }

    setCurrentUser(user);
    writeAuthFlowState({ pendingRedirect: true, next: nextUrl() || rel('index.html') });
    if (stateEl) {
      stateEl.textContent = '✓ تم إنشاء الحساب وتسجيل الدخول';
      stateEl.className = 'auth-state auth-state--success';
    }
    renderChrome();
    renderLoginPage();
  } catch (error) {
    console.error('Register failed', error);
    setError('تعذّر إنشاء الحساب الآن. حاول مرة أخرى.');
  }
}


async function sha256(value = '') {
  const data = new TextEncoder().encode(String(value));
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hashBuffer)).map(b => b.toString(16).padStart(2, '0')).join('');
}

function generateSalt() {
  return Array.from(crypto.getRandomValues(new Uint8Array(16)))
    .map(b => b.toString(16).padStart(2, '0')).join('');
}

async function hashPassword(password, salt) {
  return sha256(salt + ':' + password);
}

function sanitizeCustomerUser(user = null) {
  if (!user) return null;
  const email = normalizeEmail(user.email || '');
  if (!email) return null;
  return {
    id: String(user.id || user.uid || `USR-${email.replace(/[^a-z0-9]+/gi, '-')}`),
    uid: String(user.uid || user.id || ''),
    name: String(user.name || user.displayName || email.split('@')[0] || 'مستخدم'),
    email,
    role: 'customer'
  };
}

async function upsertLocalUserMirror(user = null, password = '') {
  const safeUser = sanitizeCustomerUser(user);
  if (!safeUser) return null;
  const users = readUsers();
  const idx = users.findIndex(item => normalizeEmail(item.email) === safeUser.email || String(item.uid || '') === safeUser.uid);
  let existing = idx >= 0 ? users[idx] : null;
  let payload = {
    ...(existing || {}),
    id: safeUser.id,
    uid: safeUser.uid || existing?.uid || '',
    name: safeUser.name,
    email: safeUser.email,
    role: 'customer',
    createdAt: existing?.createdAt || nowIso(),
    updatedAt: nowIso()
  };
  if (password) {
    const salt = generateSalt();
    payload.passwordSalt = salt;
    payload.passwordHash = await hashPassword(password, salt);
    delete payload.password;
  }
  if (idx >= 0) users[idx] = payload;
  else users.push(payload);
  saveUsers(users);
  return payload;
}

async function verifyLocalUserPassword(userEntry, password) {
  if (!userEntry) return { matched:false, migratedUser:userEntry };
  const users = readUsers();
  const index = users.findIndex(item => normalizeEmail(item.email) === normalizeEmail(userEntry.email));
  let migratedUser = index >= 0 ? users[index] : userEntry;
  let passwordMatched = false;
  if (migratedUser.passwordSalt && migratedUser.passwordHash) {
    const hash = await hashPassword(password, migratedUser.passwordSalt);
    passwordMatched = hash === migratedUser.passwordHash;
  } else if (migratedUser.passwordHash) {
    const hash = await sha256(password);
    passwordMatched = hash === migratedUser.passwordHash;
    if (passwordMatched && index >= 0) {
      const salt = generateSalt();
      users[index] = { ...migratedUser, passwordHash: await hashPassword(password, salt), passwordSalt: salt, updatedAt: nowIso() };
      saveUsers(users);
      migratedUser = users[index];
    }
  } else if (migratedUser.password) {
    passwordMatched = migratedUser.password === password;
    if (passwordMatched && index >= 0) {
      const salt = generateSalt();
      users[index] = { ...migratedUser, passwordHash: await hashPassword(password, salt), passwordSalt: salt, updatedAt: nowIso() };
      delete users[index].password;
      saveUsers(users);
      migratedUser = users[index];
    }
  }
  return { matched:passwordMatched, migratedUser };
}

function authErrorCode(error = null) {
  const raw = String(error?.code || error?.message || '').toLowerCase();
  return raw.replace('auth/', '').trim();
}

function withTimeout(promise, ms = 12000, message = 'timeout') {
  let timer = null;
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error(message)), ms);
    })
  ]).finally(() => { if (timer) clearTimeout(timer); });
}


async function prepareAdminImageForUpload(file) {
  if (!(file instanceof File) || !file.type.startsWith('image/')) return file;
  if (file.size <= 1100 * 1024) return file;
  try {
    const dataUrl = await fileToDataUrl(file);
    const img = await new Promise((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = reject;
      el.src = dataUrl;
    });
    const maxSide = 1800;
    const ratio = Math.min(1, maxSide / Math.max(img.width || 1, img.height || 1));
    const width = Math.max(1, Math.round((img.width || 1) * ratio));
    const height = Math.max(1, Math.round((img.height || 1) * ratio));
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d', { alpha: false });
    if (!ctx) return file;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, width, height);
    ctx.drawImage(img, 0, 0, width, height);
    const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.82));
    if (!blob || blob.size >= file.size) return file;
    return new File([blob], file.name.replace(/\.[^.]+$/, '') + '.jpg', { type: 'image/jpeg' });
  } catch {
    return file;
  }
}


async function prepareReceiptFileForUpload(file) {
  if (!(file instanceof File) || !file.type.startsWith('image/')) return file;
  if (file.size <= 900 * 1024) return file;
  try {
    const dataUrl = await fileToDataUrl(file);
    const img = await new Promise((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = reject;
      el.src = dataUrl;
    });
    const maxSide = 1600;
    const scale = Math.min(1, maxSide / Math.max(img.width || 1, img.height || 1));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round((img.width || 1) * scale));
    canvas.height = Math.max(1, Math.round((img.height || 1) * scale));
    const ctx = canvas.getContext('2d', { alpha: false });
    if (!ctx) return file;
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.82));
    if (!blob || blob.size >= file.size) return file;
    return new File([blob], file.name.replace(/\.[^.]+$/, '') + '.jpg', { type:'image/jpeg', lastModified: Date.now() });
  } catch {
    return file;
  }
}

function clearAdminSession() {
  state.adminUnlocked = false;
  if (fb.auth && fb.api?.signOut) {
    fb.api.signOut(fb.auth).catch(() => {});
  }
}

async function restoreAdminSession() {
  return Boolean(fb.currentUser && isAdminUser(fb.currentUser));
}

async function signInAdminWithFirebase(email = '', password = '') {
  if (!fb.ready || !fb.auth || !fb.api?.signInWithEmailAndPassword) throw new Error('firebase-auth-unavailable');
  const creds = await fb.api.signInWithEmailAndPassword(fb.auth, email, password);
  if (!isAdminUser(creds.user)) {
    await fb.api.signOut(fb.auth).catch(() => {});
    throw new Error('not-admin');
  }
  state.adminUnlocked = true;
  await loadOrdersRemote();
  return creds.user;
}

function renderSuccessPage() {
  const host = $('#successPageHost');
  if (!host) return;
  const order = getOrderById(getParam('order'));
  const wa = (settings().whatsappNumber || '').replace(/\D+/g,'');
  const waHref = wa ? `https://wa.me/${wa}?text=${encodeURIComponent(`رقم الطلب: ${order?.id || ''}`)}` : '#';
  const insta = sanitizeUrl(settings().instagramUrl || '') || '#';

  // إفراغ السلة فقط بعد وصول لصفحة النجاح وتأكيد وجود الطلب
  if (order && order.status && order.status !== 'pending_payment') {
    writeCart([]);
  } else if (order && order.cartItems?.length) {
    // للطلبات من السلة: أفرغ السلة عند الوصول لصفحة النجاح
    writeCart([]);
  }

  const cartSummary = order?.cartItems?.length
    ? `<div class="order-items-summary">${order.cartItems.map(item => `<div class="order-item-row"><span>${escapeHtml(item.name)} ×${item.quantity}</span><strong>${escapeHtml(formatCurrency(item.price * item.quantity))}</strong></div>`).join('')}</div>`
    : '';

  host.innerHTML = `<div class="success-card">
    <div class="success-icon">✓</div>
    <h1 class="section-title">تم استلام طلبك بنجاح</h1>
    <p class="muted">${order ? `رقم الطلب: ${escapeHtml(order.id)}` : ''}</p>
    <div class="status-pill status-under_review">الحالة: ${escapeHtml(orderStatusMeta(order?.status || 'under_review'))}</div>
    ${cartSummary}
    ${order ? `<div class="summary-row total" style="margin-top:12px"><span>الإجمالي</span><strong>${escapeHtml(formatCurrency(order.price))}</strong></div>` : ''}
    <p class="success-copy">سيتم مراجعة طلبك يدويًا. الرجاء إرسال رقم الطلب فقط لتسريع المراجعة.</p>
    <div class="stack compact">
      <a class="btn btn-primary full ${wa ? '' : 'disabled'}" href="${waHref}" ${wa ? 'target="_blank" rel="noopener"' : ''}>تواصل واتساب</a>
      <a class="btn btn-secondary full ${insta !== '#' ? '' : 'disabled'}" href="${insta}" ${insta !== '#' ? 'target="_blank" rel="noopener"' : ''}>تواصل إنستغرام</a>
      <a class="btn btn-secondary full" href="${rel('index.html')}">العودة للرئيسية</a>
    </div>
  </div>`;
}

function renderAdminGate() {
  const host = $('#adminGate');
  if (!host) return;
  if (state.adminUnlocked && isAdminUser(fb.currentUser)) {
    host.innerHTML = '';
    return;
  }
  host.innerHTML = `<div class="auth-card"><h1 class="section-title">دخول الأدمن</h1><form id="gateForm" class="form-grid"><input class="field" type="email" name="email" placeholder="بريد الأدمن" required><input class="field" type="password" name="password" placeholder="كلمة المرور" required><button class="btn btn-primary full" type="submit">دخول</button></form><p class="muted">استخدم حساب Firebase Auth المضاف كبريد أو UID أدمن.</p></div>`;
  $('#gateForm')?.addEventListener('submit', async e => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const email = normalizeEmail(fd.get('email'));
    const password = String(fd.get('password') || '');
    try {
      await signInAdminWithFirebase(email, password);
      showToast('تم فتح لوحة الإدارة', 'success');
      renderAdminPage();
    } catch (error) {
      const msg = error?.message === 'not-admin' ? 'هذا الحساب ليس أدمن' : 'فشل تسجيل دخول الأدمن';
      showToast(msg, 'error');
    }
  });
}

// مفاتيح مسموح بها فقط في عمليات الأدمن — يمنع حقن مفاتيح عشوائية
const ADMIN_ALLOWED_KEYS = new Set(['settings','payments','sliders','banners','cards','categories','products','reviews','orders']);


/* === admin permission hotfix === */
function getAdminEmailsSafe() {
  try { return Array.isArray(APP_CONFIG.ADMIN_EMAILS) ? APP_CONFIG.ADMIN_EMAILS.map(v => String(v || '').trim().toLowerCase()).filter(Boolean) : []; }
  catch { return []; }
}
function getAdminUidsSafe() {
  try { return Array.isArray(APP_CONFIG.ADMIN_UIDS) ? APP_CONFIG.ADMIN_UIDS.map(v => String(v || '').trim()).filter(Boolean) : []; }
  catch { return []; }
}
function getCurrentAdminCandidate() {
  try {
    const current = typeof currentUser === 'function' ? currentUser() : (state?.authUser || null);
    return current || state?.authUser || null;
  } catch {
    return null;
  }
}
function hasAdminIdentity(user) {
  if (!user) return false;
  const adminEmails = getAdminEmailsSafe();
  const adminUids = getAdminUidsSafe();
  const email = String(user.email || user.mail || '').trim().toLowerCase();
  const uid = String(user.uid || user.id || '').trim();
  return (!!email && adminEmails.includes(email)) || (!!uid && adminUids.includes(uid));
}
function syncAdminUnlockState(forceUser = null) {
  try {
    const user = forceUser || getCurrentAdminCandidate();
    const allowed = hasAdminIdentity(user) || !!(state && state.adminUnlocked);
    if (typeof state === 'object' && state) state.adminUnlocked = allowed;
    try { safeStorage.setItem('adnan_admin_unlocked_v1', allowed ? '1' : '0'); } catch {}
    return allowed;
  } catch {
    return false;
  }
}

function requireAdmin(action = 'admin') {
  const allowed = syncAdminUnlockState();
  if (allowed) return true;
  showToast('يجب تسجيل الدخول بحساب أدمن لديه صلاحيات.', 'error');
  return false;
}

function validateAdminKey(key = '') {
  if (!ADMIN_ALLOWED_KEYS.has(key)) {
    console.warn(`[Security] Invalid admin key: "${key}"`);
    return false;
  }
  return true;
}

function adminSchema() {
  return {
    orders: [],
    payments: [ ['title','text','اسم الطريقة'], ['displayName','text','الاسم الظاهر'], ['group','text','المجموعة bank/direct'], ['accountHolder','text','اسم صاحب الحساب'], ['accountNumber','text','رقم الحساب/البطاقة'], ['iban','text','الآيبان'], ['extraFields','textarea','الحقول الإضافية label:value بكل سطر'], ['instructions','textarea','تعليمات الدفع'], ['icon','text','الأيقونة'], ['enabled','checkbox','مفعلة'], ['order','number','الترتيب'] ],
    settings: [ ['storeName','text','اسم المتجر'], ['logoUrl','url','رابط الشعار'], ['tagline','text','الوصف القصير'], ['instagramUrl','url','رابط إنستغرام'], ['whatsappNumber','text','رقم واتساب'], ['defaultCurrency','text','العملة الافتراضية'], ['heroBadge','text','شارة الهيرو'], ['heroTitle','text','عنوان الهيرو'], ['heroText','textarea','نص الهيرو'], ['footerText','text','نص الفوتر'], ['tickerText','text','النص المتحرك أعلى الموقع'], ['tickerTargetType','text','نوع رابط الشريط المتحرك'], ['tickerCategoryId','text','معرف فئة الشريط'], ['tickerSubcategoryId','text','معرف تفرع الشريط'], ['tickerCustomUrl','url','رابط مخصص للشريط'], ['bgColor','color','لون الخلفية'], ['bg2Color','color','الخلفية الثانوية'], ['surfaceColor','color','لون البطاقات'], ['surface2Color','color','سطح ثانوي'], ['primaryColor','color','اللون الرئيسي'], ['primaryDarkColor','color','اللون الرئيسي الداكن'], ['primaryLightColor','color','اللون الفاتح'], ['maroonColor','color','لون داعم'], ['textColor','color','لون النص الرئيسي'], ['text2Color','color','لون النص الثانوي'], ['mutedColor','color','اللون الهادئ'], ['active','checkbox','المتجر فعال'] ],
    sliders: [ ['title','text','العنوان'], ['image','url','رابط الصورة'], ['ctaLabel','text','نص الزر'], ['targetType','text','النوع (product/category/subcategory/custom)'], ['targetId','text','المعرف (ID)'], ['categoryId','text','معرف التصنيف الرئيسي'], ['subcategoryId','text','معرف التصنيف الفرعي'], ['productId','text','معرف المنتج'], ['customUrl','url','رابط مخصص'], ['order','number','الترتيب'], ['active','checkbox','نشط'] ],
    banners: [ ['title','text','العنوان'], ['image','url','رابط الصورة'], ['targetType','text','النوع (product/category/subcategory/custom)'], ['targetId','text','المعرف (ID)'], ['categoryId','text','معرف التصنيف الرئيسي'], ['subcategoryId','text','معرف التصنيف الفرعي'], ['productId','text','معرف المنتج'], ['customUrl','url','رابط مخصص'], ['order','number','الترتيب'], ['active','checkbox','نشط'] ],
    cards: [ ['title','text','العنوان'], ['subtitle','text','نص إضافي/فرعي'], ['image','url','رابط الصورة'], ['icon','text','أيقونة'], ['cardKind','text','النوع (section/shortcut/vertical-character/character-carousel/character)'], ['sectionId','text','معرف القسم'], ['categoryId','text','معرف التصنيف الرئيسي'], ['subcategoryId','text','معرف التصنيف الفرعي'], ['targetType','text','النوع (product/category/subcategory/custom)'], ['targetId','text','المعرف (ID)'], ['customUrl','url','رابط مخصص'], ['order','number','الترتيب'], ['active','checkbox','نشط'] ],
    categories: [ ['name','text','الاسم'], ['icon','text','الأيقونة'], ['image','url','رابط الصورة'], ['subtitle','text','عنوان فرعي'], ['description','text','الوصف'], ['parentId','text','معرف التصنيف الأب (اختياري)'], ['order','number','الترتيب'], ['active','checkbox','نشط'] ],
    products: [ ['name','text','الاسم'], ['price','number','السعر'], ['oldPrice','number','السعر القديم'], ['badge','text','الشارة (مثل: جديد/خصم)'], ['image','url','رابط الصورة'], ['categoryId','text','معرف التصنيف الرئيسي'], ['subcategoryId','text','معرف التصنيف الفرعي'], ['deliveryText','text','نص مدة التسليم'], ['description','text','الوصف القصير'], ['details','textarea','تفاصيل المنتج (اختياري)'], ['order','number','الترتيب'], ['active','checkbox','نشط'] ],
    reviews: [ ['name','text'], ['image','url','صورة العميل'], ['text','text'], ['rating','number'], ['order','number'], ['active','checkbox'] ]
  };
}

function renderOrderTimeline(timeline = []) {
  return `<div class="order-timeline">${(timeline || []).map(item => `<div class="order-log-item"><strong>${escapeHtml(orderStatusMeta(item.status))}</strong><span>${new Date(item.at).toLocaleString('ar')}</span>${item.note ? `<small>${escapeHtml(item.note)}</small>` : ''}</div>`).join('')}</div>`;
}

function renderOrdersAdminPanel() {
  const host = $('[data-panel="orders"]');
  if (!host) return;
  const orders = readOrders();
  try { safeStorage.setItem('__test__', '1'); safeStorage.removeItem('__test__'); } catch (error) { showToast('تحذير: الذاكرة ممتلئة قد لا تُحفظ الإيصالات', 'error'); }
  host.innerHTML = `<div class="admin-card stack"><div class="section-head"><h2 class="section-title">طلبات الشراء</h2><div class="orders-filters"><input class="field" type="search" id="ordersSearch" placeholder="ابحث برقم الطلب"><select class="field" id="ordersStatusFilter"><option value="">كل الحالات</option><option value="pending_payment">pending_payment</option><option value="under_review">under_review</option><option value="approved">approved</option><option value="rejected">rejected</option><option value="delivered">delivered</option></select></div></div><div id="ordersTableWrap"></div></div>`;
  const renderTable = () => {
    const term = String($('#ordersSearch')?.value || '').trim().toLowerCase();
    const status = String($('#ordersStatusFilter')?.value || '').trim();
    const filtered = orders.filter(item => (!term || item.id.toLowerCase().includes(term)) && (!status || item.status === status));
    $('#ordersTableWrap').innerHTML = filtered.length ? `<div class="orders-table">${filtered.map(item => { const receiptImage = getReceiptImage(item.id); return `<article class="order-row"><div class="order-row-main"><div><strong>${escapeHtml(item.id)}</strong><span class="muted">${escapeHtml(item.productTitle)}</span></div><span class="status-pill status-${escapeHtml(item.status)}">${escapeHtml(orderStatusMeta(item.status))}</span></div><div class="order-row-grid"><span>${escapeHtml(item.username || item.email || '-')}</span><span>${escapeHtml(item.paymentMethod || '-')}</span><span>${escapeHtml(formatCurrency(item.price))}</span><span>${escapeHtml(new Date(item.time).toLocaleString('ar'))}</span></div><div class="order-detail-card"><div class="order-detail-grid"><div><span class="muted">اسم المحول</span><strong>${escapeHtml(item.senderName || '-')}</strong></div><div><span class="muted">ملاحظات</span><strong>${escapeHtml(item.notes || '-')}</strong></div><div><span class="muted">البريد</span><strong>${escapeHtml(item.email || '-')}</strong></div><div><span class="muted">الطريقة</span><strong>${escapeHtml(item.paymentMethod || '-')}</strong></div></div>${receiptImage ? `<img class="receipt-admin-image" src="${escapeHtml(receiptImage)}" alt="receipt">` : ''}${renderOrderTimeline(item.timeline)}<div class="admin-actions"><button class="btn btn-secondary" data-order-status="approved" data-order-id="${escapeHtml(item.id)}" type="button">قبول</button><button class="btn btn-secondary" data-order-status="rejected" data-order-id="${escapeHtml(item.id)}" type="button">رفض</button><button class="btn btn-primary" data-order-status="delivered" data-order-id="${escapeHtml(item.id)}" type="button">تم التسليم</button></div></div></article>` }).join('')}</div>` : emptyState('لا توجد طلبات', 'ستظهر طلبات الشراء هنا بعد رفع الإيصالات.');
  const VALID_ORDER_STATUSES = new Set(['approved','rejected','delivered','under_review','pending_payment']);
  $$('[data-order-status]').forEach(btn => btn.onclick = () => {
    const status = btn.dataset.orderStatus;
    if (!VALID_ORDER_STATUSES.has(status)) return;
    pushOrderStatus(btn.dataset.orderId, status, 'تم تحديث الحالة من لوحة الإدارة').then(() => renderOrdersAdminPanel());
  });
  };
  $('#ordersSearch')?.addEventListener('input', renderTable);
  $('#ordersStatusFilter')?.addEventListener('change', renderTable);
  renderTable();
}

function renderAdminPage() {
  renderAdminGate();
  if (!state.adminUnlocked) return;
  const host = $('#adminPageHost');
  if (!host) return;
  const schema = adminSchema();
  host.innerHTML = `
    <div class="admin-card stack">
      <div class="admin-toolbar">
        <div class="admin-toolbar-copy"><strong>لوحة التحكم الشاملة</strong><span class="muted">عدّل الشعار، الصور، البنرات، الشريط المتحرك، التصنيفات، المنتجات، والروابط من مكان واحد.</span></div>
        <div class="admin-toolbar-actions">
          <button class="btn btn-primary" id="seedBtn" type="button">تهيئة المشروع</button>
          <button class="btn btn-secondary" id="logoutBtn" type="button">قفل الأدمن</button>
        </div>
      </div>
      ${fb.ready ? '' : '<div class="muted">وضع الإدارة المحلي مفعل. سيتم الحفظ داخل المتصفح محليًا.</div>'}
    </div>
    <div class="admin-tabs">${Object.keys(schema).map(key => `<button class="tab-btn ${key==='settings'?'active':''}" data-tab="${key}" type="button">${adminTabLabel(key)}</button>`).join('')}</div>
    ${Object.keys(schema).map(key => `<section class="admin-panel ${key==='settings'?'':'hidden'}" data-panel="${key}"></section>`).join('')}`;
  $$('.tab-btn').forEach(btn => btn.addEventListener('click', () => {
    $$('.tab-btn').forEach(x => x.classList.toggle('active', x === btn));
    $$('.admin-panel').forEach(panel => panel.classList.toggle('hidden', panel.dataset.panel !== btn.dataset.tab));
  }));
  $('#seedBtn')?.addEventListener('click', seedStore);
  $('#logoutBtn')?.addEventListener('click', () => { clearAdminSession(); state.adminUnlocked = false; renderAdminPage(); });
  Object.keys(schema).forEach(key => { if (key === 'orders') renderOrdersAdminPanel(); else renderAdminPanel(key, schema[key]); });
}

function adminTabLabel(key) {
  return { orders:'الطلبات', settings:'الهوية', payments:'طرق الدفع', sliders:'السلايدر', banners:'البنرات', cards:'البطاقات', categories:'التصنيفات', products:'المنتجات', reviews:'التقييمات' }[key] || key;
}

function getCollectionItems(key) {
  if (key === 'settings') return [settings()];
  if (key === 'orders') return readOrders();
  if (key === 'payments') return normalizePaymentMethods(state.paymentMethods || readPaymentMethods());
  return state[key] || [];
}

function renderAdminPanel(key, fields) {
  const host = $(`[data-panel="${key}"]`);
  const items = getCollectionItems(key);
  host.innerHTML = `<div class="admin-card stack"><div class="section-head"><h2 class="section-title">${adminTabLabel(key)}</h2>${key === 'settings' ? '' : `<button class="btn btn-secondary" data-new="${key}" type="button">عنصر جديد</button>`}</div><div class="admin-list">${items.map(item => adminItemCard(key, item)).join('')}</div></div><div class="admin-card stack"><form class="form-grid" data-form="${key}">${fields.map(field => formField(...field)).join('')}<input type="hidden" name="id"><div class="preview-box hidden" data-preview-wrap><img data-preview-image alt="preview"></div><input class="field" type="file" accept="image/*" data-file-preview><button class="btn btn-primary full" type="submit">حفظ التغييرات</button></form></div>`;
  host.querySelector(`[data-form="${key}"]`)?.addEventListener('submit', e => submitAdminForm(e, key, fields));
  $$('[data-edit]', host).forEach(btn => btn.addEventListener('click', () => fillAdminForm(key, btn.dataset.edit)));
  $$('[data-delete]', host).forEach(btn => btn.addEventListener('click', () => deleteRecord(key, btn.dataset.delete)));
  $('[data-new]', host)?.addEventListener('click', () => resetAdminForm(key));
  bindPreview(host);
  if (typeof window.Sortable !== 'undefined' && key !== 'settings') {
    window.Sortable.create($('.admin-list', host), {
      animation: 150,
      onEnd: async () => {
              const ids = $$('.admin-item', host).map(el => el.dataset.id);
        await reorderCollection(key, ids);
      }
    });
  }
}

function adminItemCard(key, item) {
  const title = item.name || item.title || item.displayName || item.storeName || 'عنصر';
  const img = item.image ? `<img class="admin-thumb" src="${escapeHtml(imageSrc(item.image))}" onerror="this.onerror=null;this.src='${APP_CONFIG.FALLBACK_IMAGE}'">` : '';
  return `<article class="admin-item" data-id="${escapeHtml(item.id || 'store')}">${img}<div class="admin-copy"><strong>${escapeHtml(title)}</strong><div class="admin-actions"><button class="btn btn-secondary" data-edit="${escapeHtml(item.id || 'store')}" type="button">تعديل</button>${key==='settings' ? '' : `<button class="btn btn-secondary" data-delete="${escapeHtml(item.id)}" type="button">حذف</button>`}</div></div></article>`;
}

function formField(name, type, label = '') {
  const title = label || name;
  if (type === 'checkbox') return `<label class="toggle-row"><span>${title}</span><input type="checkbox" name="${name}" checked></label>`;
  if (type === 'textarea') return `<label class="field-group"><span>${title}</span><textarea class="field textarea-field" name="${name}" placeholder="${title}"></textarea></label>`;
  const inputType = type === 'number' ? 'number' : (type === 'color' ? 'color' : (type === 'url' ? 'url' : 'text'));
  const extra = type === 'color' ? ' data-color-input' : '';
  return `<label class="field-group ${type === 'color' ? 'color-field-group' : ''}"><span>${title}</span><input class="field" type="${inputType}" name="${name}" placeholder="${title}"${extra}></label>`;
}

function fillAdminForm(key, id) {
  const form = $(`[data-form="${key}"]`);
  const collection = key === 'settings' ? [settings()] : getCollectionItems(key);
  const item = key === 'settings' ? settings() : (collection || []).find(entry => entry.id === id);
  if (!form || !item) return;
  form.reset();
  Object.entries(item).forEach(([name, value]) => {
    const field = form.elements[name];
    if (!field) return;
    if (field.type === 'checkbox') field.checked = Boolean(value);
    else field.value = value ?? '';
  });
  if (form.elements.id) form.elements.id.value = item.id || 'store';
  const imgField = form.elements.image;
  if (imgField?.value) showPreview(form, imgField.value);
}

function resetAdminForm(key) {
  const form = $(`[data-form="${key}"]`);
  form?.reset();
  if (form?.elements.id) form.elements.id.value = '';
  form?.querySelector('[data-preview-wrap]')?.classList.add('hidden');
}

function bindPreview(scope) {
  const form = scope.querySelector('form');
  if (!form) return;
  const previewTarget = form.querySelector('input[name="image"], input[name="logoUrl"]');
  const urlFields = form.querySelectorAll('input[name="image"], input[name="logoUrl"]');
  const fileField = scope.querySelector('[data-file-preview]');
  urlFields.forEach(field => field.addEventListener('input', () => showPreview(form, field.value)));
  fileField?.addEventListener('change', e => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      if (previewTarget) previewTarget.value = String(reader.result || '');
      showPreview(form, reader.result);
    };
    reader.readAsDataURL(file);
  });
}

function showPreview(form, src) {
  if (!form) return;
  const wrap = form.querySelector('[data-preview-wrap]');
  const img = form.querySelector('[data-preview-image]');
  if (!wrap || !img || !src) return;
  img.src = src;
  wrap.classList.remove('hidden');
}

async function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

// رفع صورة الأدمن (منتجات/بنرات/إلخ) إلى Cloudinary
async function uploadAdminImage(file) {
  if (!file || !(file instanceof File)) return '';
  const preparedFile = await prepareAdminImageForUpload(file);
  if (CDN_CLOUD && CDN_PRESET) {
    try {
      return await uploadToCloudinary(preparedFile, CDN_FOLDER);
    } catch (err) {
      console.warn('Cloudinary admin image upload failed, falling back to base64', err);
    }
  }
  return fileToDataUrl(preparedFile);
}

async function submitAdminForm(event, key) {
  syncAdminUnlockState();
  if (!requireAdmin('submitAdminForm')) return;
  if (!validateAdminKey(key)) return;
  event.preventDefault();
  const form = event.currentTarget;
  const submitBtn = form.querySelector('[type="submit"]');
  const fileField = form.querySelector('[data-file-preview]');
  const imageField = form.elements.image || form.elements.logoUrl;
  if (fileField?.files?.[0] && imageField) {
    if (submitBtn) { submitBtn.disabled = true; submitBtn.textContent = 'جارٍ رفع الصورة...'; }
    try {
      const uploadedImage = await uploadAdminImage(fileField.files[0]);
      if (!uploadedImage) throw new Error('admin-image-upload-empty');
      imageField.value = uploadedImage;
    } catch (error) {
      console.error('Admin image upload failed', error);
      if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = 'حفظ التغييرات'; }
      showToast('فشل رفع الصورة. أعد المحاولة بصورة أصغر أو اتصال أفضل.', 'error');
      return;
    } finally {
      if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = 'حفظ التغييرات'; }
    }
  }
  const data = Object.fromEntries(new FormData(form).entries());
  const schema = adminSchema()[key];
  const payload = {};
  schema.forEach(([name, type]) => {
    if (type === 'checkbox') payload[name] = form.elements[name].checked;
    else if (type === 'number') payload[name] = Number(form.elements[name].value || 0);
    else payload[name] = String(form.elements[name].value || '').trim();
  });
  const id = data.id || (key === 'settings' ? APP_CONFIG.SETTINGS_DOC_ID : `${key}_${Date.now()}`);
  if (key === 'settings') { payload.brandingId = APP_CONFIG.BRAND_ID; payload.storeSlug = APP_CONFIG.BRAND_ID; }
  if (key === 'payments') { payload.extraFields = normalizePaymentMethods([{ ...payload, id }])[0].extraFields; }
  await saveRecord(key, id, payload);
  showToast('تم الحفظ', 'success');
  await loadRemoteContent();
  rerenderVisiblePage();
  renderAdminPage();
}

async function deleteRecord(key, id) {
  syncAdminUnlockState();
  if (!requireAdmin('deleteRecord')) return;
  if (!validateAdminKey(key)) return;
  if (!id || typeof id !== 'string' || id.length > 200) return;
  if (key === 'payments') {
    savePaymentMethods((state.paymentMethods || []).filter(item => item.id !== id));
  } else if (fb.ready) {
    await fb.api.deleteDoc(fb.api.doc(fb.db, COLLECTIONS[key], id));
    await loadRemoteContent();
  } else {
    const items = (state[key] || []).filter(item => item.id !== id);
    state[key] = items;
    persistLocalCollection(key, items);
  }
  rerenderVisiblePage();
  renderAdminPage();
}

async function saveRecord(key, id, payload) {
  syncAdminUnlockState();
  if (!requireAdmin('saveRecord')) return;
  if (!validateAdminKey(key)) return;
  if (key === 'payments') {
    const current = [...(state.paymentMethods || [])];
    const idx = current.findIndex(item => item.id === id);
    const entry = normalizePaymentMethods([{ id, ...payload }])[0];
    if (idx >= 0) current[idx] = { ...current[idx], ...entry };
    else current.push(entry);
    savePaymentMethods(current);
    rerenderVisiblePage();
    renderAdminPage();
    return;
  } else if (fb.ready) {
    const ref = fb.api.doc(fb.db, COLLECTIONS[key], id);
    await fb.api.setDoc(ref, payload, { merge: true });
    return;
  }
  if (key === 'settings') { state.settings = mergeBrandSettings(payload); persistLocalCollection('settings', state.settings); return; }
  const items = [...(state[key] || [])];
  const idx = items.findIndex(item => item.id === id);
  const entry = { id, ...payload };
  if (idx >= 0) items[idx] = entry; else items.push(entry);
  state[key] = items;
  persistLocalCollection(key, items);
}

async function reorderCollection(key, ids) {
  syncAdminUnlockState();
  if (!requireAdmin('reorderCollection')) return;
  if (!validateAdminKey(key)) return;
  if (!Array.isArray(ids)) return;
  if (key === 'payments') {
    const current = state.paymentMethods || [];
    savePaymentMethods(ids.map((id, index) => ({ ...(current.find(item => item.id === id) || {}), order: index + 1 })));
  } else if (fb.ready) {
    const batch = fb.api.writeBatch(fb.db);
    ids.forEach((id, index) => batch.update(fb.api.doc(fb.db, COLLECTIONS[key], id), { order: index + 1 }));
    await batch.commit();
    await loadRemoteContent();
  } else {
    state[key] = ids.map((id, index) => ({ ...(state[key].find(item => item.id === id) || {}), order: index + 1 }));
    persistLocalCollection(key, state[key]);
  }
  rerenderVisiblePage();
  renderAdminPage();
}

async function seedStore() {
  if (!requireAdmin('seedStore')) return;
  if (fb.ready) {
    const batch = fb.api.writeBatch(fb.db);
    batch.set(fb.api.doc(fb.db, COLLECTIONS.settings, APP_CONFIG.SETTINGS_DOC_ID), LOCAL_SEED.settings.data, { merge: true });
    for (const key of ['categories', 'products', 'sliders', 'banners', 'cards', 'reviews']) {
      for (const item of LOCAL_SEED[key]) {
        const { id, ...payload } = item;
        batch.set(fb.api.doc(fb.db, COLLECTIONS[key], id), payload, { merge: true });
      }
    }
    await batch.commit();
    await loadRemoteContent();
  } else {
    writeLocalCms({ settings: LOCAL_SEED.settings.data, categories: LOCAL_SEED.categories, products: LOCAL_SEED.products, sliders: LOCAL_SEED.sliders, banners: LOCAL_SEED.banners, cards: LOCAL_SEED.cards, reviews: LOCAL_SEED.reviews, paymentMethods: clonePaymentDefaults() });
    savePaymentMethods(clonePaymentDefaults());
    applySeed(LOCAL_SEED);
    mergeLocalCmsIntoState();
  }
  showToast('تم إنشاء البيانات', 'success');
  rerenderVisiblePage();
  renderAdminPage();
}

function bindAccordionCategoryTriggers(scope=document) {
  $$('.expand-toggle,[data-category-toggle],.tree-parent', scope).forEach((btn) => {
    const parentId = btn.dataset.parentId || btn.dataset.categoryToggle || btn.getAttribute('data-parent-id');
    if (!parentId) return;
    btn.setAttribute('aria-expanded', 'false');
    const panel = document.getElementById(`subsheet-${parentId}`) || document.getElementById(`tree-${parentId}`);
    panel?.classList.add('hidden');
    btn.onclick = (e) => {
      e.preventDefault();
      e.stopPropagation();
      const expanded = btn.getAttribute('aria-expanded') === 'true';
      const wrap = btn.closest('[data-accordion-root]')?.parentElement || scope;
      $$('.subcat-sheet,.tree-children', wrap).forEach((el) => el.classList.add('hidden'));
      $$('.expand-toggle,.tree-parent,[data-category-toggle]', wrap).forEach((el) => el.setAttribute('aria-expanded', 'false'));
      if (!expanded) {
        panel?.classList.remove('hidden');
        btn.setAttribute('aria-expanded', 'true');
      }
    };
  });
}

function bindCategoryDrawerInteractions() {
  const drawer = document.getElementById('categoryDrawer');
  if (!drawer) return;
  bindInlineCategorySelection(drawer);
  bindAccordion(drawer);
}

function bindInlineCategorySelection(scope=document) {
  bindAccordionCategoryTriggers(scope);
  const closeDrawer = () => {
    const drawer = document.getElementById('categoryDrawer');
    drawer?.classList.add('hidden');
    drawer?.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('drawer-open');
    $$('[data-open-drawer]').forEach(el => el.setAttribute('aria-expanded', 'false'));
  };
  $$('[data-category-select]', scope).forEach(el => {
    el.onclick = null;
    el.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      const categoryId = el.dataset.categorySelect || el.dataset.parentId || '';
      closeDrawer();
      goTo(`${rel('pages/category.html')}?category=${encodeURIComponent(categoryId)}`);
    });
  });
  $$('[data-subcategory-select]', scope).forEach(el => {
    el.onclick = null;
    el.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      const subId = el.dataset.subcategorySelect;
      const parentId = el.dataset.parentId || '';
      closeDrawer();
      goTo(`${rel('pages/category.html')}?category=${encodeURIComponent(parentId)}&subcategory=${encodeURIComponent(subId)}`);
    });
  });
  $$('[data-close-drawer]', scope).forEach(el => {
    el.onclick = null;
    el.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      closeDrawer();
    });
  });
}

// event delegation عامة على document للتصنيفات — تعمل حتى بعد إضافة عناصر للـ DOM
function initCategoryDelegation() {
  if (document.body.dataset.catDelegated) return;
  document.body.dataset.catDelegated = '1';
  const closeDrawer = () => {
    const d = document.getElementById('categoryDrawer');
    d?.classList.add('hidden');
    d?.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('drawer-open');
  };
  document.addEventListener('click', (e) => {
    // data-category-select
    const catBtn = e.target.closest('[data-category-select]');
    if (catBtn) {
      e.preventDefault();
      e.stopPropagation();
      const id = catBtn.dataset.categorySelect || catBtn.dataset.parentId || '';
      if (!id) return;
      closeDrawer();
      goTo(`${rel('pages/category.html')}?category=${encodeURIComponent(id)}`);
      return;
    }
    // data-subcategory-select
    const subBtn = e.target.closest('[data-subcategory-select]');
    if (subBtn) {
      e.preventDefault();
      e.stopPropagation();
      const subId = subBtn.dataset.subcategorySelect || '';
      const parentId = subBtn.dataset.parentId || '';
      if (!subId) return;
      closeDrawer();
      goTo(`${rel('pages/category.html')}?category=${encodeURIComponent(parentId)}&subcategory=${encodeURIComponent(subId)}`);
      return;
    }
  }, true);
}


function initHardCategoryDrawer() {
  const open = () => {
    const drawer = document.getElementById('categoryDrawer');
    if (!drawer) return;
    drawer.classList.remove('hidden');
    drawer.setAttribute('aria-hidden', 'false');
    document.body.classList.add('drawer-open');
  };
  const close = () => {
    const drawer = document.getElementById('categoryDrawer');
    if (!drawer) return;
    drawer.classList.add('hidden');
    drawer.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('drawer-open');
  };
  document.addEventListener('click', (e) => {
    const openBtn = e.target.closest('[data-open-drawer]');
    if (openBtn) {
      e.preventDefault();
      e.stopPropagation();
      stripHashSilently();
      open();
      return;
    }
    const closeBtn = e.target.closest('[data-close-drawer]');
    if (closeBtn) {
      e.preventDefault();
      e.stopPropagation();
      close();
      return;
    }
  }, true);
}

function detectPage() {
  return PAGE;
}

function initAutoScroll() {
  $$('.auto-scroll-rail').forEach((rail) => {
    if (rail.dataset.autoBound === '1') return;
    rail.dataset.autoBound = '1';
    let paused = false;
    const step = () => {
      if (paused) return;
      rail.scrollLeft -= 1;
      if (Math.abs(rail.scrollLeft) + rail.clientWidth >= rail.scrollWidth - 2) {
        rail.scrollLeft = 0;
      }
    };
    const timer = setInterval(step, 24);
    rail.addEventListener('mouseenter', () => { paused = true; });
    rail.addEventListener('mouseleave', () => { paused = false; });
    rail.addEventListener('touchstart', () => { paused = true; }, { passive: true });
    rail.addEventListener('touchend', () => { paused = false; }, { passive: true });
    rail.dataset.autoTimer = String(timer);
  });
}

async function loadFirebaseSdk() {
  try {
    const appMod = await import('https://www.gstatic.com/firebasejs/10.12.4/firebase-app.js');
    const dbMod = await import('https://www.gstatic.com/firebasejs/10.12.4/firebase-firestore.js');
    const authMod = await import('https://www.gstatic.com/firebasejs/10.12.4/firebase-auth.js');
    fb.api = { ...dbMod, ...authMod, ...appMod };
    return true;
  } catch (error) {
    console.warn('Firebase SDK unavailable; local preview mode active.', error);
    return false;
  }
}

async function initFirebase() {
  const host = window.location.hostname || '';
  const isLocal = ['localhost','127.0.0.1',''].includes(host) || window.location.protocol === 'file:';
  if (isLocal || APP_CONFIG.USE_REMOTE_CONTENT === false) return false;
  const ok = await loadFirebaseSdk();
  if (!ok) return false;
  const { initializeApp, getApps, getApp, getFirestore, getAuth } = fb.api;
  fb.app = getApps().length ? getApp() : initializeApp(firebaseConfig);
  fb.db = getFirestore(fb.app);
  fb.auth = getAuth(fb.app);
  fb.ready = true;
  fb.api.onAuthStateChanged?.(fb.auth, async user => {
    fb.currentUser = user;
    state.adminUnlocked = isAdminUser(user);
    if (user && !state.adminUnlocked) {
      const mirrored = await upsertLocalUserMirror({ id:user.uid, uid:user.uid, name:user.displayName || user.email?.split('@')[0] || 'مستخدم', email:user.email || '' });
      setCurrentUser(sanitizeCustomerUser(mirrored || { id:user.uid, uid:user.uid, name:user.displayName || user.email?.split('@')[0] || 'مستخدم', email:user.email || '' }));
    } else if (!user && !state.adminUnlocked) {
      setCurrentUser(null);
    }
    if (PAGE === 'login') renderLoginPage();
    renderChrome();
    if (PAGE === 'admin') {
      if (state.adminUnlocked) loadOrdersRemote().finally(() => renderAdminPage());
      else renderAdminPage();
    }
  });
  return true;
}

function applySeed(seed) {
  state.settings = mergeBrandSettings(seed.settings?.data || seed.settings || null);
  state.categories = seed.categories || [];
  state.products = seed.products || [];
  state.sliders = seed.sliders || [];
  state.banners = seed.banners || [];
  state.cards = seed.cards || [];
  if (!state.cards.some(item => (item.cardKind || '').toLowerCase() === 'shortcut')) {
    state.cards = state.cards.concat([
      { id:'shortcut_01', title:'شانكس + جواهر', image:'./images/cards/card-01.webp', cardKind:'shortcut', targetType:'subcategory', categoryId:'cat_currency', subcategoryId:'sub_currency_fast', targetId:'sub_currency_fast', active:true, order:901 },
      { id:'shortcut_02', title:'أكاينو + عروض', image:'./images/cards/card-02.webp', cardKind:'shortcut', targetType:'subcategory', categoryId:'cat_boost', subcategoryId:'sub_boost_flash', targetId:'sub_boost_flash', active:true, order:902 },
      { id:'shortcut_03', title:'قوالب جاهزة', image:'./images/cards/card-03.webp', cardKind:'shortcut', targetType:'category', categoryId:'cat_ready', targetId:'cat_ready', active:true, order:903 }
    ]);
  }
  if (!state.cards.some(item => ['vertical-character','vertical_character','hero-character','hero_character'].includes((item.cardKind || '').toLowerCase()))) {
    state.cards = state.cards.concat([
      { id:'vertical_character_01', title:'شخصية مميزة', subtitle:'عرض خاص', image:'./images/cards/card-01.webp', cardKind:'vertical-character', targetType:'subcategory', categoryId:'cat_accounts', subcategoryId:'sub_accounts_rare', targetId:'sub_accounts_rare', active:true, order:931 },
      { id:'vertical_character_02', title:'شخصية نادرة', subtitle:'خصم جديد', image:'./images/cards/card-02.webp', cardKind:'vertical-character', targetType:'subcategory', categoryId:'cat_boost', subcategoryId:'sub_boost_flash', targetId:'sub_boost_flash', active:true, order:932 },
      { id:'vertical_character_03', title:'شخصية جاهزة', subtitle:'واجهة أنيقة', image:'./images/cards/card-03.webp', cardKind:'vertical-character', targetType:'category', categoryId:'cat_ready', targetId:'cat_ready', active:true, order:933 }
    ]);
  }
  if (!state.cards.some(item => ['character-carousel','character_carousel','horizontal-character','horizontal_character'].includes((item.cardKind || '').toLowerCase()))) {
    state.cards = state.cards.concat([
      { id:'character_carousel_01', title:'شانكس', subtitle:'شانكس + جواهر', image:'./images/cards/card-01.webp', cardKind:'character-carousel', targetType:'subcategory', categoryId:'cat_accounts', subcategoryId:'sub_accounts_rare', targetId:'sub_accounts_rare', active:true, order:941 },
      { id:'character_carousel_02', title:'أكاينو', subtitle:'أكاينو + عروض', image:'./images/cards/card-02.webp', cardKind:'character-carousel', targetType:'subcategory', categoryId:'cat_boost', subcategoryId:'sub_boost_flash', targetId:'sub_boost_flash', active:true, order:942 },
      { id:'character_carousel_03', title:'اللحية السوداء', subtitle:'قوالب + عروض', image:'./images/cards/card-03.webp', cardKind:'character-carousel', targetType:'category', categoryId:'cat_ready', targetId:'cat_ready', active:true, order:943 }
    ]);
  }
  if (!state.cards.some(item => ['character','persona','avatar'].includes((item.cardKind || '').toLowerCase()))) {
    state.cards = state.cards.concat([
      { id:'character_01', title:'شانكس', subtitle:'جواهر + شانكس', image:'./images/cards/card-01.webp', cardKind:'character', targetType:'subcategory', categoryId:'cat_accounts', subcategoryId:'sub_accounts_rare', targetId:'sub_accounts_rare', active:true, order:951 },
      { id:'character_02', title:'أكاينو', subtitle:'عروض + أكاينو', image:'./images/cards/card-02.webp', cardKind:'character', targetType:'subcategory', categoryId:'cat_boost', subcategoryId:'sub_boost_flash', targetId:'sub_boost_flash', active:true, order:952 },
      { id:'character_03', title:'اللحية السوداء', subtitle:'قوالب + عروض', image:'./images/cards/card-03.webp', cardKind:'character', targetType:'category', categoryId:'cat_ready', targetId:'cat_ready', active:true, order:953 }
    ]);
  }
  state.reviews = seed.reviews || [];
  state.paymentMethods = readPaymentMethods();
}



function ensureSeedFallbackCollections() {
  const fallback = {
    categories: LOCAL_SEED.categories || [],
    products: LOCAL_SEED.products || [],
    sliders: LOCAL_SEED.sliders || [],
    banners: LOCAL_SEED.banners || [],
    cards: LOCAL_SEED.cards || [],
    reviews: LOCAL_SEED.reviews || []
  };
  for (const key of Object.keys(fallback)) {
    const current = Array.isArray(state[key]) ? activeItems(state[key]) : [];
    if (!current.length) state[key] = fallback[key];
  }
}

function mergeSeedCollection(seeded = [], remote = []) {
  const base = Array.isArray(seeded) ? seeded : [];
  const fresh = Array.isArray(remote) ? remote : [];
  if (!fresh.length) return base;
  const map = new Map(base.map(item => [item.id, { ...item }]));
  for (const item of fresh) {
    const prev = map.get(item.id) || {};
    map.set(item.id, { ...prev, ...item });
  }
  return Array.from(map.values()).sort((a, b) => Number(a.order || 0) - Number(b.order || 0));
}

async function loadRemoteContent() {
  if (!fb.ready) return false;
  try {
    const settingsDoc = await fb.api.getDoc(fb.api.doc(fb.db, COLLECTIONS.settings, APP_CONFIG.SETTINGS_DOC_ID));
    if (settingsDoc.exists()) {
      const remoteSettings = settingsDoc.data();
      if (!APP_CONFIG.ALLOW_REMOTE_BRANDING_OVERRIDE && !isMatchingBrand(remoteSettings)) {
        console.warn('Ignoring remote branding because it does not match the local store identity.');
      } else {
        state.settings = mergeBrandSettings(remoteSettings);
      }
    }
    const seeded = {
      categories: LOCAL_SEED.categories || [],
      products: LOCAL_SEED.products || [],
      sliders: LOCAL_SEED.sliders || [],
      banners: LOCAL_SEED.banners || [],
      cards: LOCAL_SEED.cards || [],
      reviews: LOCAL_SEED.reviews || []
    };
    for (const key of ['categories', 'products', 'sliders', 'banners', 'cards', 'reviews']) {
      const snap = await fb.api.getDocs(fb.api.query(fb.api.collection(fb.db, COLLECTIONS[key]), fb.api.orderBy('order', 'asc')));
      const remoteItems = snap.docs.map(docSnap => ({ id: docSnap.id, ...docSnap.data() }));
      state[key] = mergeSeedCollection(seeded[key], remoteItems);
    }
    applySeed({ ...LOCAL_SEED, settings: { data: state.settings }, categories: state.categories, products: state.products, sliders: state.sliders, banners: state.banners, cards: state.cards, reviews: state.reviews });
    if (state.adminUnlocked) await loadOrdersRemote();
    return true;
  } catch (error) {
    console.warn('Remote content unavailable; keeping local data.', error);
    return false;
  }
}

function renderPageSkeletons() {
  if (PAGE === 'home') {
    $('#heroSection')?.insertAdjacentHTML('beforeend', '<div class="hero-card">'+skeletonCards(2)+'</div>');
    $('#verticalCharacterSection')?.insertAdjacentHTML('beforeend', skeletonCards(3));
    $('#promoBanners')?.insertAdjacentHTML('beforeend', skeletonCards(2));
    $('#categoryRail')?.insertAdjacentHTML('beforeend', skeletonCards(3));
    $('#cardsSection')?.insertAdjacentHTML('beforeend', skeletonCards(3));
    $('#characterCarouselSection')?.insertAdjacentHTML('beforeend', skeletonCards(3));
    $('#productSections')?.insertAdjacentHTML('beforeend', skeletonCards(3));
  }
}

function rerenderVisiblePage() {
  applyTheme();
  applyDocumentBranding();
  renderChrome();
  if (PAGE === 'home') renderHomePage();
  if (PAGE === 'category') renderCategoryPage();
  if (PAGE === 'product') renderProductPage();
  if (PAGE === 'cart') renderCartPage();
  if (PAGE === 'checkout') renderCheckoutPage();
  if (PAGE === 'login') renderLoginPage();
  if (PAGE === 'admin') renderAdminPage();
  if (PAGE === 'success') renderSuccessPage();
}

async function init() {
  clearLegacyBrandCaches();
  state.currentUser = getCurrentUser();
  state.adminUnlocked = false;
  state.paymentMethods = readPaymentMethods();

  // مرحلة 1: تطبيق البيانات المحلية أولاً (seed + local CMS)
  applySeed(LOCAL_SEED);
  mergeLocalCmsIntoState();
  ensureSeedFallbackCollections();
  if (!state.settings) state.settings = mergeBrandSettings(LOCAL_SEED.settings?.data || {});

  // مرحلة 2: رسم الصفحة مرة واحدة بالبيانات المحلية (يمنع الـ flash)
  applyTheme();
  applyDocumentBranding();
  rerenderVisiblePage();
  writeCart(readCart());
  updateCartBadges();

  // مرحلة 3: محاولة تحميل Firebase في الخلفية
  // على الجوال نفصل هذا عن render الأولي لمنع re-render مفاجئ
  const firebaseOk = await initFirebase();
  if (firebaseOk) {
    const remoteLoaded = await loadRemoteContent();
    if (remoteLoaded) {
      ensureSeedFallbackCollections();
      // إعادة رسم فقط إذا تغيرت البيانات فعلاً
      applyTheme();
      applyDocumentBranding();
      // لا نعيد رسم checkout أو login بعد تحميل remote لمنع إعادة تعيين النماذج
      renderChrome();
      if (PAGE === 'home') renderHomePage();
      if (PAGE === 'category') renderCategoryPage();
      if (PAGE === 'product') renderProductPage();
      if (PAGE === 'cart') renderCartPage();
      if (PAGE === 'admin') renderAdminPage();
      if (PAGE === 'success') renderSuccessPage();
      updateCartBadges();
    }
  }
}

document.addEventListener('DOMContentLoaded', () => {
  // تفعيل event delegation للتصنيفات فوراً قبل أي شيء
  initCategoryDelegation();
  init().catch((error) => {
    console.error('Store init failed', error);
    try {
      applySeed(LOCAL_SEED);
      mergeLocalCmsIntoState();
      ensureSeedFallbackCollections();
      if (!state.settings) state.settings = mergeBrandSettings(LOCAL_SEED.settings?.data || {});
      applyTheme();
      applyDocumentBranding();
      renderChrome();
      rerenderVisiblePage();
    } catch (fallbackError) {
      console.error('Store fallback render failed', fallbackError);
    }
  });
});


document.addEventListener('click', (e) => {
  const a = e.target.closest('a[data-no-nav="true"]');
  if (a) {
    e.preventDefault();
  }
});



/* === horizontalize all section item containers === */
function forceHorizontalSectionLists(root = document){
  const selectors = [
    '.products-grid','.category-grid','.cards-grid','.accounts-grid','.items-grid',
    '.section-products','.section-grid','.category-products','.products-row',
    '.product-row','.product-list','.cards-list','.categories-list',
    '.horizontal-products','[data-section-products]','[data-products-grid]','[data-products-list]'
  ];
  root.querySelectorAll(selectors.join(',')).forEach((el) => {
    el.style.display = 'flex';
    el.style.flexWrap = 'nowrap';
    el.style.overflowX = 'auto';
    el.style.overflowY = 'hidden';
    if (!el.style.gap) el.style.gap = '14px';
  });
}
document.addEventListener('DOMContentLoaded', () => {
  setTimeout(() => forceHorizontalSectionLists(document), 50);
  setTimeout(() => forceHorizontalSectionLists(document), 400);
  setTimeout(() => forceHorizontalSectionLists(document), 1200);
});
window.forceHorizontalSectionLists = forceHorizontalSectionLists;
