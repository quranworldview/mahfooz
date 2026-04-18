// ============================================================
// MAHFOOZ — TajweedText.js  v2.0
// Tajweed color layer — API-first, static map fallback.
//
// DATA SOURCE PRIORITY:
//   1. alquran.cloud tajweed API  — full 114-surah coverage
//   2. tajweed-map.json           — static seed (25 Tier-1 annotations)
//
// API ENDPOINT:
//   GET https://api.alquran.cloud/v1/ayah/{surah}:{ayah}/quran-tajweed
//   Returns text with inline bracket notation: [code[chars]
//   e.g. قُلْ هُوَ [h:8078[ٱ]للَّهُ أَحَ[q[د]ٌ
//
// API CODE → ruleId MAPPING:
//   q  → qalqalah        n  → ghunnah
//   l  → lshams          p  → idghaam
//   s  → ikhfa           w  → madd_connected
//   x  → madd_separated  h  → (hamza wasl — skip, no rule card)
//   sl → ikhfa_shafawi   lh → lshams (lam in Allah)
//   4/2/m → madd_natural
//
// WORD MATCHING:
//   API text is a single string. We strip bracket notation, split
//   into words, and match tajweed codes to session word positions
//   by index (with alignment fallback for count mismatches).
//
// DISCOVERY:
//   buildTajweedAyah() sets window._mahfoozNewDiscoveries for
//   SessionScreen to read and display renderDiscoveryFlash() cards.
// ============================================================

import { addDiscoveredRule } from '../screens/TajweedScreen.js';

// ── CSS class map ─────────────────────────────────────────────
const RULE_CLASS = {
  ghunnah:        'tj-g',
  ikhfa:          'tj-i',
  ikhfa_shafawi:  'tj-i',
  idghaam:        'tj-d',
  iqlab:          'tj-q',
  izhar:          'tj-z',
  qalqalah:       'tj-k',
  madd:           'tj-m',
  madd_natural:   'tj-m',
  madd_connected: 'tj-m',
  madd_separated: 'tj-m',
  lshams:         'tj-l',
  lqamar:         'tj-z',
};

// ── API code → ruleId ─────────────────────────────────────────
const API_CODE_TO_RULE = {
  'q':  'qalqalah',
  'n':  'ghunnah',
  'l':  'lshams',
  'p':  'idghaam',
  's':  'ikhfa',
  'w':  'madd_connected',
  'x':  'madd_separated',
  'sl': 'ikhfa_shafawi',
  'lh': 'lshams',
  '4':  'madd_natural',
  '2':  'madd_natural',
  'm':  'madd_natural',
  // 'h' (hamza wasl) — intentionally omitted, no rule teaching value
};

// ── Caches ────────────────────────────────────────────────────
let _tajweedApiCache = {};  // "surahNum:ayahNum" → ruleId[] | null
let _mapCache        = null;
let _rulesCache      = null;

// ── Load static tajweed-map.json ─────────────────────────────
async function getTajweedMap() {
  if (_mapCache) return _mapCache;
  try {
    const res = await fetch('js/data/tajweed-map.json');
    _mapCache = await res.json();
  } catch (_) { _mapCache = {}; }
  return _mapCache;
}

// ── Load tajweed-rules.json indexed by id ────────────────────
async function getRules() {
  if (_rulesCache) return _rulesCache;
  try {
    const res = await fetch('js/data/tajweed-rules.json');
    const arr = await res.json();
    _rulesCache = {};
    for (const r of arr) _rulesCache[r.id] = r;
  } catch (_) { _rulesCache = {}; }
  return _rulesCache;
}

// ── Strip Arabic diacritics ───────────────────────────────────
function _stripDiacritics(s) {
  return s.replace(/[\u064B-\u065F\u0610-\u061A\u06D6-\u06DC\u06DF-\u06E8\u06EA-\u06ED\u0670]/g, '');
}

// ── Parse alquran.cloud bracket notation ─────────────────────
// Input:  raw API string with [code[chars] markers
// Output: array of ruleId|null — one entry per whitespace-split word
//
// Strategy:
//   1. Find all [code[chars] markers and note the chars they tag.
//   2. Strip all markers from text → clean Arabic.
//   3. Split clean text into words.
//   4. For each marker's chars, find which clean word contains them
//      and assign the ruleId to that word index.
function _parseApiText(apiText) {
  const RE = /\[([a-z0-9:]+)\[([^\]]*)\]/g;

  // Collect markers: { code, chars (inside brackets) }
  const markers = [];
  let m;
  while ((m = RE.exec(apiText)) !== null) {
    const code = m[1].split(':')[0]; // strip ':XXXX' hamza suffix
    if (API_CODE_TO_RULE[code]) {
      markers.push({ ruleId: API_CODE_TO_RULE[code], chars: m[2] });
    }
  }

  // Strip bracket notation → clean Arabic text
  const clean = apiText
    .replace(/\[[a-z0-9:]+\[([^\]]*)\]/g, '$1')
    .replace(/\]/g, '')
    .replace(/\s+/g, ' ')
    .trim();

  const cleanWords = clean.split(/\s+/).filter(Boolean);
  const wordRules  = new Array(cleanWords.length).fill(null);

  // Match each marker's chars to a word position
  for (const { ruleId, chars } of markers) {
    if (!chars.trim()) continue;
    const targetStripped = _stripDiacritics(chars).replace(/\s/g, '');
    if (!targetStripped) continue;

    for (let i = 0; i < cleanWords.length; i++) {
      const wordStripped = _stripDiacritics(cleanWords[i]);
      if (wordStripped.includes(targetStripped) ||
          targetStripped.includes(wordStripped.slice(0, 2))) {
        if (!wordRules[i]) wordRules[i] = ruleId; // first rule wins per word
        break;
      }
    }
  }

  return wordRules; // ruleId[] indexed by word position
}

// ── Fetch + parse from alquran.cloud API ─────────────────────
// Returns ruleId[] (same length as API's word count) or null on failure.
async function _fetchTajweedApi(surahNum, ayahNum) {
  const key = `${surahNum}:${ayahNum}`;
  if (key in _tajweedApiCache) return _tajweedApiCache[key];

  try {
    const url = `https://api.alquran.cloud/v1/ayah/${surahNum}:${ayahNum}/quran-tajweed`;
    const res  = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = await res.json();
    if (json.code !== 200 || !json.data?.text) throw new Error('Bad response');

    const rules = _parseApiText(json.data.text);
    _tajweedApiCache[key] = rules;
    return rules;

  } catch (_) {
    _tajweedApiCache[key] = null; // don't retry
    return null;
  }
}

// ── Align API rule array to session word count ────────────────
// API may split words differently (Basmalah, end markers, etc).
// Simple index-based alignment — takes first N rules for N session words.
function _alignRules(apiRules, sessionWords) {
  if (!apiRules) return new Array(sessionWords.length).fill(null);
  if (apiRules.length === sessionWords.length) return apiRules;

  // Truncate or pad to match session word count
  const result = new Array(sessionWords.length).fill(null);
  for (let i = 0; i < Math.min(sessionWords.length, apiRules.length); i++) {
    result[i] = apiRules[i] || null;
  }
  return result;
}

// ── Core export: annotate words with tajweed data ─────────────
// Returns array of objects, one per word:
// { word, idx, ruleId, cssClass, ruleName, oneLiner, source }
export async function applyTajweedToWords(surahNum, ayahNum, words) {
  const rules = await getRules();

  // 1. Try live API first
  const apiRules = await _fetchTajweedApi(surahNum, ayahNum);
  const aligned  = _alignRules(apiRules, words);

  // 2. For positions still null, check static map fallback
  const needsMap = aligned.some(r => r === null);
  const staticMap = needsMap ? await getTajweedMap() : null;

  return words.map((word, idx) => {
    let ruleId = aligned[idx] || null;
    let source = ruleId ? 'api' : null;

    if (!ruleId && staticMap) {
      const mapKey = `${surahNum}:${ayahNum}:${idx + 1}`; // map is 1-based
      ruleId = staticMap[mapKey] || null;
      if (ruleId) source = 'map';
    }

    const rule = ruleId ? rules[ruleId] : null;
    return {
      word,
      idx,
      ruleId,
      cssClass: ruleId ? (RULE_CLASS[ruleId] || null) : null,
      ruleName: rule ? rule.name      : null,
      oneLiner: rule ? rule.one_liner : null,
      source,
    };
  });
}

// ── Build HTML for LISTEN stage ───────────────────────────────
// Returns colored .q-word span string.
// Side effect: sets window._mahfoozNewDiscoveries for SessionScreen.
export async function buildTajweedAyah(surahNum, ayahNum, words, opts = {}) {
  const annotated = await applyTajweedToWords(surahNum, ayahNum, words);

  // Track discoveries — expose newly found rules for SessionScreen
  const newDiscoveries = [];
  for (const w of annotated) {
    if (w.ruleId) {
      const isNew = addDiscoveredRule(w.ruleId);
      if (isNew) newDiscoveries.push({ ruleId: w.ruleId, ruleName: w.ruleName });
    }
  }
  window._mahfoozNewDiscoveries = newDiscoveries;

  return annotated.map(({ word, idx, ruleId, cssClass }) => {
    const tjClass  = cssClass ? ` ${cssClass}` : '';
    const ruleAttr = ruleId   ? ` data-rule="${ruleId}"` : '';
    const encoded  = encodeURIComponent(word);
    return `<span
      class="q-word${tjClass}"
      data-idx="${idx}"
      data-word="${encoded}"
      data-surah="${surahNum}"
      data-ayah="${ayahNum}"${ruleAttr}
      onclick="window._mahfooz?.onWordTap(${idx},'${encoded}',${surahNum},${ayahNum})"
      oncontextmenu="event.preventDefault();window._mahfooz?.onWordLongPress(${idx},'${encoded}',${surahNum},${ayahNum})"
      onmousedown="window._mhfzLpStart(${idx},'${encoded}',${surahNum},${ayahNum},this)"
      onmouseup="window._mhfzLpCancel()"
      onmouseleave="window._mhfzLpCancel()"
      ontouchstart="window._mhfzLpStart(${idx},'${encoded}',${surahNum},${ayahNum},this)"
      ontouchend="window._mhfzLpCancel()"
      ontouchmove="window._mhfzLpCancel()"
    >${word}</span>`;
  }).join(' ');
}

// ── Build colored context bar for LEARN stage ─────────────────
export function buildLearnContextBar(annotated, currentIdx) {
  return annotated.map(({ word, idx, cssClass }) => {
    const isCurrent = idx === currentIdx;
    const tjClass   = (!isCurrent && cssClass) ? ` ${cssClass}` : '';
    const style = isCurrent
      ? 'color:var(--gold);font-weight:700;background:var(--gold-dim);border-radius:3px;padding:0 2px;transition:all 0.2s ease;'
      : 'transition:all 0.2s ease;padding:0 2px;';
    return `<span class="q-word${tjClass}" style="${style}">${word}</span>`;
  }).join(' ');
}

// ── Tajweed badge for LEARN stage word card ───────────────────
export function renderTajweedBadge(annotatedWord, lang) {
  if (!annotatedWord?.ruleId) return '';
  const { cssClass, ruleName, oneLiner } = annotatedWord;
  const name     = ruleName?.[lang] || ruleName?.en || '';
  const oneliner = oneLiner?.[lang] || oneLiner?.en || '';
  return `
    <div class="tajweed-badge ${cssClass || ''}"
         style="display:inline-flex;align-items:center;gap:6px;
                margin-top:8px;padding:6px 12px;
                border-radius:var(--r-sm);border:1px solid currentColor;
                opacity:0.85;font-size:0.75rem;">
      <span style="font-size:0.8125rem;font-weight:600;">${name}</span>
      <span style="opacity:0.7;">·</span>
      <span style="font-style:italic;">${oneliner}</span>
    </div>
  `;
}

// ── Discovery flash card ──────────────────────────────────────
// Shown by SessionScreen when a tajweed rule is discovered for the first time.
export function renderDiscoveryFlash(ruleId, ruleName, lang) {
  const name = ruleName?.[lang] || ruleName?.en || ruleId;
  return `
    <div class="tajweed-discovery-flash"
         style="background:var(--bg-elevated);border:1px solid var(--border-gold);
                border-radius:var(--r-md);padding:10px 16px;margin-top:10px;
                display:flex;align-items:center;gap:10px;
                animation:fadeIn 0.3s ease;">
      <span style="font-size:1.25rem;">✨</span>
      <div>
        <div style="font-size:0.6875rem;color:var(--gold);font-weight:600;
                    letter-spacing:0.05em;text-transform:uppercase;">
          ${lang==='ur'?'نئی دریافت':lang==='hi'?'नई खोज':'New Discovery'}
        </div>
        <div style="font-size:0.875rem;color:var(--ink-1);font-weight:500;">${name}</div>
      </div>
    </div>
  `;
}
