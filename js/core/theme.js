// ============================================================
// MAHFOOZ — theme.js
// Manages: System/Dark/Light theme
//          IndoPak/Uthmani script switching
//          Qur'anic text size (independent, 6 steps like Iqra)
//          Translation text size (independent, 6 steps)
//          UI text size (normal/large/xlarge)
//          Logo swap on theme change
//
// localStorage keys (QWV-shared prefix):
//   qwv_theme       → 'system'|'dark'|'light'   (default: 'system')
//   qwv_script      → 'indopak'|'uthmani'        (default: 'indopak')
//   qwv_quran_size  → 'xs'|'sm'|'md'|'lg'|'xl'|'2xl' (default: 'md')
//   qwv_trans_size  → 'xs'|'sm'|'md'|'lg'|'xl'|'2xl' (default: 'md')
//   qwv_text_size   → 'normal'|'large'|'xlarge'  (default: 'normal')
// ============================================================

const K = {
  THEME:      'qwv_theme',
  SCRIPT:     'qwv_script',
  QURAN_SIZE: 'qwv_quran_size',
  TRANS_SIZE: 'qwv_trans_size',
  TEXT_SIZE:  'qwv_text_size',
};

const QURAN_SIZES = ['xs','sm','md','lg','xl','2xl'];
const TRANS_SIZES = ['xs','sm','md','lg','xl','2xl'];
const TEXT_SIZES  = ['normal','large','xlarge'];

// ── Loaders ───────────────────────────────────────────────────
export const loadTheme      = () => localStorage.getItem(K.THEME)      || 'system';
export const loadScript     = () => localStorage.getItem(K.SCRIPT)     || 'indopak';
export const loadQuranSize  = () => localStorage.getItem(K.QURAN_SIZE) || 'md';
export const loadTransSize  = () => localStorage.getItem(K.TRANS_SIZE) || 'md';
export const loadTextSize   = () => localStorage.getItem(K.TEXT_SIZE)  || 'normal';

// ── Resolve system → actual ───────────────────────────────────
function resolve(mode) {
  if (mode !== 'system') return mode;
  return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
}

// ── Logo swap ─────────────────────────────────────────────────
function swapLogo(mode) {
  const isDark = resolve(mode) === 'dark';
  const src = isDark ? 'icons/logo-dark.png' : 'icons/logo-light.png';
  document.querySelectorAll('.mahfooz-logo').forEach(img => { img.src = src; });
}

// ── Theme ─────────────────────────────────────────────────────
export function applyTheme(mode) {
  const resolved = resolve(mode);
  document.documentElement.setAttribute('data-theme', resolved);
  localStorage.setItem(K.THEME, mode);
  swapLogo(mode);
}
export const getTheme  = loadTheme;
export function isDark() {
  return document.documentElement.getAttribute('data-theme') === 'dark';
}

// ── Script ────────────────────────────────────────────────────
export function applyScript(script) {
  document.documentElement.setAttribute('data-script', script);
  localStorage.setItem(K.SCRIPT, script);
  // Re-render active ayah text if session is live
  if (window._mahfooz?.onScriptChange) window._mahfooz.onScriptChange(script);
}
export const getScript = loadScript;

// ── Qur'anic text size ────────────────────────────────────────
export function applyQuranSize(size) {
  if (!QURAN_SIZES.includes(size)) size = 'md';
  document.documentElement.setAttribute('data-quran-size', size);
  localStorage.setItem(K.QURAN_SIZE, size);
}
export const getQuranSize = loadQuranSize;

export function stepQuranSize(dir) {
  const idx  = QURAN_SIZES.indexOf(loadQuranSize());
  const next = QURAN_SIZES[Math.max(0, Math.min(QURAN_SIZES.length - 1, idx + dir))];
  applyQuranSize(next);
  return next;
}

// ── Translation size ──────────────────────────────────────────
export function applyTransSize(size) {
  if (!TRANS_SIZES.includes(size)) size = 'md';
  document.documentElement.setAttribute('data-trans-size', size);
  localStorage.setItem(K.TRANS_SIZE, size);
}
export const getTransSize = loadTransSize;

// ── UI text size ──────────────────────────────────────────────
export function applyTextSize(size) {
  if (!TEXT_SIZES.includes(size)) size = 'normal';
  const html = document.documentElement;
  size === 'normal' ? delete html.dataset.textSize : (html.dataset.textSize = size);
  localStorage.setItem(K.TEXT_SIZE, size);
}
export const getTextSize = loadTextSize;

// ── Init — call once on boot ──────────────────────────────────
export function initTheme() {
  applyTheme(loadTheme());
  applyScript(loadScript());
  applyQuranSize(loadQuranSize());
  applyTransSize(loadTransSize());
  applyTextSize(loadTextSize());

  // OS theme change listener
  window.matchMedia('(prefers-color-scheme: light)').addEventListener('change', () => {
    if (loadTheme() === 'system') applyTheme('system');
  });
}
