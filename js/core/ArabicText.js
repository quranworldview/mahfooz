// ============================================================
// MAHFOOZ — ArabicText.js
// The living word system. Every ayah is rendered word by word.
// Every word is tappable, alive, explorable.
//
// Script model (identical to Iqra):
//   data-script="indopak" → IndoPak font + arabic_indopak text
//   data-script="uthmani" → KFGQPC font + arabic text
//
// Sanitiser ported directly from Iqra — battle-tested.
// ============================================================

// ── Sanitiser — strip artifacts from API text ─────────────────
export function sanitise(text) {
  if (!text) return '';
  return text
    .replace(/\u06DD[\u0660-\u0669\u06F0-\u06F9]*/g, '')            // ayah ornament U+06DD + digits
    .replace(/[\u06DF\u06D7\u06D8\u06D9\u06DA\u06DB\u06DC\u06DE\u06E0\u06E2\u06E3\u06E4\u06E7\u06E8\u06EA\u06EB\u06EC\u06ED\u0615\u065A\u065B]/g, '') // waqf marks
    .replace(/[\uF500-\uF5FF]/g, '')                                   // PUA glyphs
    .trim();
}

// ── Pick correct text string based on current script ──────────
export function getAyahText(ayah) {
  const script = document.documentElement.getAttribute('data-script') || 'indopak';
  const text = (script === 'indopak' && ayah.arabic_indopak)
    ? ayah.arabic_indopak
    : ayah.arabic || '';
  return sanitise(text);
}

// ── Arabic-Indic numeral conversion ───────────────────────────
export function toArabicNum(n) {
  return String(n).replace(/[0-9]/g, d => String.fromCharCode(0x0660 + parseInt(d)));
}

// ── Split ayah text into words ────────────────────────────────
// Returns array of word strings (RTL-aware split on whitespace).
// Preserves harakaat (diacritics) with each word.
// Quranic annotation marks that appear as standalone space-delimited tokens
// in Indo-Pak Nastaleeq text (pause marks, sajdah signs, hizb markers etc).
// These are NOT words — they must be excluded from word count and WBW lookup.
// Unicode ranges:
//   U+0600–U+0605  Arabic number signs
//   U+0610–U+061A  Arabic extended (tatweel etc)
//   U+06D6–U+06DC  Small high Quranic symbols (ۖ ۗ ۘ ۙ ۚ ۛ ۜ)
//   U+06DE–U+06E4  Rub el hizb, Quranic marks
//   U+06E7–U+06E8  Quranic marks
//   U+06E9         Place of sajdah (۩)
//   U+06EA–U+06ED  Quranic marks
//   U+08D4–U+08FF  Extended Arabic supplement
const _QURAN_MARK_ONLY = /^[\u0600-\u0605\u0610-\u061A\u06D6-\u06DC\u06DE-\u06E4\u06E7-\u06E9\u06EA-\u06ED\u08D4-\u08FF]+$/;

export function splitWords(arabicText) {
  return arabicText
    .trim()
    .split(/\s+/)
    .filter(w => w.length > 0 && !_QURAN_MARK_ONLY.test(w));
}

// ── Render ayah as word-by-word interactive HTML ──────────────
// Single tap  → instant audio play  (onWordTap)
// Long press  → full info popup     (onWordLongPress)
// Right click → full info popup     (onWordLongPress)
export function renderLivingAyah(ayah, options = {}) {
  const {
    surahNum   = 0,
    ayahNum    = ayah.num || 0,
    showMarker = true,
    extraClass = '',
  } = options;

  const text  = getAyahText(ayah);
  const words = splitWords(text);

  const wordsHTML = words
    .map((word, idx) => `<span
      class="q-word"
      data-idx="${idx}"
      data-word="${encodeURIComponent(word)}"
      data-surah="${surahNum}"
      data-ayah="${ayahNum}"
      onclick="window._mahfooz?.onWordTap(${idx},'${encodeURIComponent(word)}',${surahNum},${ayahNum})"
      oncontextmenu="event.preventDefault();window._mahfooz?.onWordLongPress(${idx},'${encodeURIComponent(word)}',${surahNum},${ayahNum})"
      onmousedown="window._mhfzLpStart(${idx},'${encodeURIComponent(word)}',${surahNum},${ayahNum},this)"
      onmouseup="window._mhfzLpCancel()"
      onmouseleave="window._mhfzLpCancel()"
      ontouchstart="window._mhfzLpStart(${idx},'${encodeURIComponent(word)}',${surahNum},${ayahNum},this)"
      ontouchend="window._mhfzLpCancel()"
      ontouchmove="window._mhfzLpCancel()"
    >${word}</span>`)
    .join(' ');

  const marker = showMarker
    ? `<span class="ayah-end-marker" aria-hidden="true" style="font-family:'KFGQPC',serif;font-size:0.7em;color:var(--gold);margin-right:4px;vertical-align:middle;">${toArabicNum(ayahNum)}</span>`
    : '';

  return `<span class="ayah-arabic ${extraClass}" lang="ar" dir="rtl">${wordsHTML}${marker}</span>`;
}

// ── Render simple static ayah (no word interaction) ───────────
// Used in reflection preview, gem cards, onboarding.
export function renderStaticAyah(arabicText, sizePx = 24) {
  const clean = sanitise(arabicText);
  return `<div class="ayah-arabic" lang="ar" dir="rtl"
    style="font-size:${sizePx}px; text-align:right;">${clean}</div>`;
}

// ── Render Arabic UI word (Amiri, NOT Qur'anic font) ──────────
// For single words in labels, headers, gem cards.
export function renderArabicUI(text, sizePx = 28) {
  return `<span class="arabic" style="font-size:${sizePx}px;" lang="ar" dir="rtl">${text}</span>`;
}

// ── Render Bismillah ──────────────────────────────────────────
export function renderBismillah() {
  return `<div class="bismillah" lang="ar" dir="rtl">
    بِسْمِ ٱللَّهِ ٱلرَّحْمَٰنِ ٱلرَّحِيمِ
  </div>`;
}

// ── Build word popup data ─────────────────────────────────────
// Given a word string, looks up metadata from:
//   1. Alif bridge index (client-side JSON)
//   2. Tajweed map (if loaded)
//   3. Basic root/frequency data (future: per-word JSON)
// Returns a data object for the popup to render.
export async function lookupWord(wordText, surahNum, ayahNum) {
  const decoded = decodeURIComponent(wordText);

  // Strip diacritics + normalize alef variants for lookup matching
  const bare = decoded
    .replace(/[\u064B-\u065F\u0610-\u061A\u06D6-\u06DC\u06DF-\u06E8\u06EA-\u06ED\u0670]/g, '')
    .replace(/[\u0625\u0623\u0622\u0671]/g, '\u0627')  // إأآٱ → ا
    .replace(/\u0649/g, '\u064A')                         // ى → ي
    .replace(/\u0629/g, '\u0647');                        // ة → ه
  // Also try stripping ال prefix
  const bareNoAl = bare.replace(/^\u0627\u0644/, '');

  const result = {
    arabic:         decoded,
    bare:           bare,
    transliteration: '',
    meaning:        {},
    root:           '',
    frequency:      null,
    alifLesson:     null,
    tajweedRule:    null,
  };

  // ── Alif bridge lookup ──────────────────────────────────────
  try {
    const alifIndex = await getAlifIndex();
    const hit = alifIndex[decoded] || alifIndex[bare] || alifIndex[bareNoAl];
    if (hit) {
      result.transliteration = hit.transliteration || '';
      result.meaning         = hit.meaning || {};
      result.root            = hit.root || '';
      result.frequency       = hit.frequency || null;
      result.alifLesson      = hit.lesson || null;
    }
  } catch (_) { /* Alif index not loaded yet — silent */ }

  return result;
}

// ── Alif index cache ──────────────────────────────────────────
let _alifCache = null;
async function getAlifIndex() {
  if (_alifCache) return _alifCache;
  try {
    const res = await fetch('js/data/alif-index.json');
    _alifCache = await res.json();
    return _alifCache;
  } catch (_) {
    return {};
  }
}
