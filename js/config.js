const runtimeConfig = globalThis.__APP_RUNTIME_CONFIG__ || {};
const runtimeEnv = String(globalThis.__APP_ENV__ || runtimeConfig.env || 'production').trim().toLowerCase();

const FIREBASE_CONFIG_BY_ENV = {
  staging: {
    apiKey: '',
    authDomain: '',
    projectId: '',
    storageBucket: '',
    messagingSenderId: '',
    appId: ''
  },
  production: {
    apiKey: 'AIzaSyAfnIL6PbhgHJ8JW70r-Y92MUPMISc9InU',
    authDomain: 'adninopbr.firebaseapp.com',
    projectId: 'adninopbr',
    storageBucket: 'adninopbr.firebasestorage.app',
    messagingSenderId: '548690112370',
    appId: '1:548690112370:web:5c5ad5baa72885a7ff37eb'
  }
};

const resolvedFirebaseConfig = {
  ...(FIREBASE_CONFIG_BY_ENV[runtimeEnv] || FIREBASE_CONFIG_BY_ENV.production),
  ...(runtimeConfig.firebase || {})
};

export const firebaseConfig = resolvedFirebaseConfig;

const runtimeAppConfig = runtimeConfig.app || {};

export const APP_CONFIG = {
  BRAND_ID: 'adnan-store',
  STORE_NAME: 'متجر عدنان',
  STORE_NAME_AR: 'متجر عدنان',
  STORE_TAGLINE: 'نسخة مبسطة تعمل على Firebase المجاني مع Cloudinary لصور المنتجات',
  WHATSAPP_NUMBER: '',
  SUPPORT_EMAIL: '',
  DEFAULT_CURRENCY: 'SAR',
  CART_STORAGE_KEY: 'adnan_cart_v2',
  CURRENCY_STORAGE_KEY: 'adnan_currency_v1',
  INSTAGRAM_URL: '',
  LOGO_URL: './images/logo.png',
  FALLBACK_IMAGE: './images/cards/card-01.webp',
  SETTINGS_DOC_ID: 'store',
  USE_REMOTE_CONTENT: true,
  ALLOW_REMOTE_BRANDING_OVERRIDE: false,
  RUNTIME_ENV: runtimeEnv,
  API_BASE_PATH: '',
  ADMIN_EMAILS: ['admin@example.com', 'yutabota1@gmail.com'],
  ADMIN_UIDS: ['REPLACE_WITH_ADMIN_UID', '3xUhwe2gHXRFvAxebWO4lDoYRHt2'],
  // مفاتيح localStorage القديمة التي يجب مسحها عند التحديث
  LEGACY_STORAGE_KEYS: ['kiido_cart_v4', 'kiido_selected_currency', 'kiido_admin_gate', 'vault_cart_v1', 'adnan_cart_v1'],
  CLOUDINARY: {
    cloudName: runtimeConfig.cloudinary?.cloudName || 'ddjn3ozpm',
    uploadPreset: runtimeConfig.cloudinary?.uploadPreset || 'products_unsigned',
    productsFolder: runtimeConfig.cloudinary?.productsFolder || 'adnanstore/products'
  },
  THEME: {
    bg: '#0D0E12',
    bg2: '#15171C',
    surface: '#1C1F26',
    surface2: '#242830',
    primary: '#D6A86A',
    primaryDark: '#8F5F2A',
    primaryLight: '#F5E3C8',
    maroon: '#3B2748',
    text: '#F8F6F2',
    text2: '#D7DCEA',
    muted: '#95A0B8',
    line: 'rgba(242,228,205,0.12)',
    glow: 'rgba(200,160,107,0.22)'
  },
  COLLECTIONS: {
    products: 'products',
    categories: 'categories',
    sliders: 'sliders',
    banners: 'banners',
    cards: 'cards',
    reviews: 'reviews',
    settings: 'settings',
    orders: 'orders',
    paymentMethods: 'paymentMethods',
    cmsContent: 'cmsContent',
    userRoles: 'userRoles',
    users: 'users'
  },
  CURRENCIES: {
    SAR: { code: 'SAR', symbol: 'ر.س', name: 'ريال سعودي', rate: 1, decimals: 2 },
    AED: { code: 'AED', symbol: 'د.إ', name: 'درهم إماراتي', rate: 0.98, decimals: 2 },
    USD: { code: 'USD', symbol: '$', name: 'دولار أمريكي', rate: 0.27, decimals: 2 },
    EUR: { code: 'EUR', symbol: '€', name: 'يورو', rate: 0.25, decimals: 2 },
    KWD: { code: 'KWD', symbol: 'د.ك', name: 'دينار كويتي', rate: 0.082, decimals: 3 },
    QAR: { code: 'QAR', symbol: 'ر.ق', name: 'ريال قطري', rate: 0.97, decimals: 2 },
    BHD: { code: 'BHD', symbol: 'د.ب', name: 'دينار بحريني', rate: 0.10, decimals: 3 },
    OMR: { code: 'OMR', symbol: 'ر.ع', name: 'ريال عماني', rate: 0.10, decimals: 3 },
    JOD: { code: 'JOD', symbol: 'د.أ', name: 'دينار أردني', rate: 0.19, decimals: 3 },
    EGP: { code: 'EGP', symbol: 'ج.م', name: 'جنيه مصري', rate: 13.10, decimals: 2 },
    TRY: { code: 'TRY', symbol: '₺', name: 'ليرة تركية', rate: 10.35, decimals: 2 },
    MAD: { code: 'MAD', symbol: 'د.م', name: 'درهم مغربي', rate: 2.68, decimals: 2 }
  },
  ...runtimeAppConfig
};

export const DEFAULT_THEME_COLORS = {
  bg: '#0D0E12',
  bgAlt: '#0E1118',
  surface: '#1C1F26',
  surface2: '#242830',
  card: '#141924',
  cardStrong: '#222A3B',
  line: 'rgba(242,228,205,0.12)',
  lineStrong: 'rgba(242,228,205,0.22)',
  text: '#F8F6F2',
  muted: '#95A0B8',
  primary: '#D6A86A',
  primaryStrong: '#8F663E',
  badge: '#F2E4CD'
};

export const RUNTIME_CONFIG_HELP = {
  env: runtimeEnv,
  requiresProductionFirebaseConfig: !resolvedFirebaseConfig.projectId,
  requiresCloudinaryPreset: !APP_CONFIG.CLOUDINARY.uploadPreset
};
