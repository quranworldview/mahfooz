// ============================================================
// MAHFOOZ — TajweedText.js  v3.0
// Local rule detection — no external API dependency.
//
// STRATEGY (per PDF: "Reach the Goal Via Tajweed Rules"):
//   Detect rules directly from Unicode Arabic text.
//   Deterministic, offline, always correct.
//   API was removed — it was unreliable and misaligned.
//
// RULES DETECTED:
//   ghunnah        — noon/meem with shaddah (مّ / نّ)
//   qalqalah       — letters ق ط ب ج د saakin (sukoon or end-of-ayah)
//   ikhfa          — noon saakin/tanween before ikhfa letters
//   ikhfa_shafawi  — meem saakin before ب
//   idghaam        — noon saakin/tanween before و م ن ي
//   idghaam_meem   — meem saakin before meem (idghaam mutamathelain)
//   iqlab          — noon saakin/tanween before ب
//   madd           — madd letters (ا و ي) before hamza or saakin
//   lshams         — lam before sun letters
//   lqamar         — lam before moon letters (lam-qamar)
//
// STATIC MAP:
//   tajweed-map.json — hand-verified overrides for specific words.
//   Static map always wins over detector for its covered positions.
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
  idghaam_meem:   'tj-d',
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

// ── Unicode constants ─────────────────────────────────────────
const SUKOON   = '\u0652'; // ْ
const SHADDAH  = '\u0651'; // ّ
const FATHA    = '\u064E'; // َ
const KASRA    = '\u0650'; // ِ
const DAMMA    = '\u064F'; // ُ
const TANWEEN_F = '\u064B'; // ً
const TANWEEN_K = '\u064D'; // ٍ
const TANWEEN_D = '\u064C'; // ٌ
const NOON     = '\u0646'; // ن
const MEEM     = '\u0645'; // م
const LAM      = '\u0644'; // ل
const ALEF     = '\u0627'; // ا
const WAW      = '\u0648'; // و
const YA       = '\u064A'; // ي
const HAMZA    = '\u0621'; // ء
const BA       = '\u0628'; // ب

// Qalqalah letters: ق ط ب ج د
const QALQALAH_LETTERS = new Set(['\u0642','\u0637','\u0628','\u062C','\u062F']);

// Ikhfa letters (15 letters — anything not izhar/idghaam/iqlab)
// Izhar letters: ء ه ع ح غ خ
// Idghaam letters: و م ن ي ر ل
// Iqlab: ب
// So ikhfa = everything else
const IZHAR_LETTERS  = new Set(['\u0621','\u0647','\u0639','\u062D','\u063A','\u062E']);
const IDGHAAM_LETTERS = new Set([WAW, MEEM, NOON, YA, '\u0631', LAM]);
const IQLAB_LETTER   = BA;

// Sun letters (lam assimilation): ت ث د ذ ر ز س ش ص ض ط ظ ل ن
const SUN_LETTERS = new Set([
  '\u062A','\u062B','\u062F','\u0630','\u0631','\u0632',
  '\u0633','\u0634','\u0635','\u0636','\u0637','\u0638',
  '\u0644','\u0646'
]);

// Madd letters
const MADD_LETTERS = new Set([ALEF, WAW, YA]);

// ── Unicode helpers ───────────────────────────────────────────
function stripDiacritics(s) {
  return s.replace(/[\u064B-\u065F\u0610-\u061A\u06D6-\u06DC\u06DF-\u06E8\u06EA-\u06ED\u0670]/g, '');
}

function getLetters(word) {
  // Returns array of bare letters (no diacritics)
  return stripDiacritics(word).split('').filter(c => c.trim());
}

function hasSukoon(word, letterIndex) {
  // Check if the character at bare letter position N in the word has sukoon
  // We need to scan the raw word and match diacritic positions
  let count = 0;
  for (let i = 0; i < word.length; i++) {
    const ch = word[i];
    if (/[\u0600-\u06FF]/.test(ch) && !/[\u064B-\u065F\u0670]/.test(ch)) {
      if (count === letterIndex) {
        // Check if next chars include sukoon
        let j = i + 1;
        while (j < word.length && /[\u064B-\u065F\u0670]/.test(word[j])) {
          if (word[j] === SUKOON) return true;
          j++;
        }
        return false;
      }
      count++;
    }
  }
  return false;
}

function hasShaddah(word, letterIndex) {
  let count = 0;
  for (let i = 0; i < word.length; i++) {
    const ch = word[i];
    if (/[\u0600-\u06FF]/.test(ch) && !/[\u064B-\u065F\u0670]/.test(ch)) {
      if (count === letterIndex) {
        let j = i + 1;
        while (j < word.length && /[\u064B-\u065F\u0670]/.test(word[j])) {
          if (word[j] === SHADDAH) return true;
          j++;
        }
        return false;
      }
      count++;
    }
  }
  return false;
}

function hasTanween(word) {
  return word.includes(TANWEEN_F) || word.includes(TANWEEN_K) || word.includes(TANWEEN_D);
}

function firstLetter(word) {
  const stripped = stripDiacritics(word);
  for (const ch of stripped) {
    if (/[\u0621-\u06FF]/.test(ch)) return ch;
  }
  return '';
}

function lastBareLetter(word) {
  const stripped = stripDiacritics(word);
  for (let i = stripped.length - 1; i >= 0; i--) {
    if (/[\u0621-\u06FF]/.test(stripped[i])) return stripped[i];
  }
  return '';
}

// ── Core rule detector ────────────────────────────────────────
// Detects the most prominent tajweed rule for a given word,
// considering the word that follows it (for noon/meem rules).
// Priority order: lam rules FIRST to avoid ghunnah false positives
// on words like الرَّحْمَن where shaddah is on the following letter.
function detectRule(word, nextWord) {
  const letters      = getLetters(word);
  const strippedWord = stripDiacritics(word);

  // ── 1. LAM rules — FIRST to avoid false ghunnah ──────────
  if (strippedWord.startsWith(ALEF + LAM) || strippedWord.startsWith('\u0622' + LAM)) {
    const letterAfterAl = letters.length > 2 ? letters[2] : '';
    if (letterAfterAl && SUN_LETTERS.has(letterAfterAl))  return 'lshams';
    if (letterAfterAl && !SUN_LETTERS.has(letterAfterAl)) return 'lqamar';
  }

  // ── 2. GHUNNAH — noon or meem WITH shaddah on that letter ─
  for (let i = 0; i < letters.length; i++) {
    if ((letters[i] === NOON || letters[i] === MEEM) && hasShaddah(word, i)) {
      return 'ghunnah';
    }
  }

  // ── 3. QALQALAH — qalqalah letter with sukoon ───────────
  // Two valid cases per PDF:
  // a) Qalqalah letter has explicit sukoon (middle of word)
  //    e.g. يَجْعَل — jeem with sukoon
  // b) Qalqalah letter is the LAST letter of the word (end-stop)
  //    e.g. قُلْ — qaf is last, reader applies sukoon on stop
  //    NOTE: must not fire when qalqalah letter has a haraka (not last)
  //    e.g. بِسْمِ — ba has kasra, not last letter → no qalqalah
  for (let i = 0; i < letters.length; i++) {
    if (QALQALAH_LETTERS.has(letters[i])) {
      const isLast    = i === letters.length - 1;
      const hasSukn   = hasSukoon(word, i);
      if (hasSukn || isLast) return 'qalqalah';
    }
  }

  // ── 4. NOON SAAKIN / TANWEEN rules ───────────────────────
  // Does this word end with noon saakin or tanween?
  const lastLetter = lastBareLetter(word);
  const wordHasTanween = hasTanween(word);
  const endsWithNoonSaakin = (lastLetter === NOON) &&
    (hasSukoon(word, letters.length - 1));

  if ((endsWithNoonSaakin || wordHasTanween) && nextWord) {
    const nextFirst = firstLetter(nextWord);
    if (nextFirst) {
      // Iqlab: before ب
      if (nextFirst === IQLAB_LETTER) return 'iqlab';
      // Izhar: before throat letters
      if (IZHAR_LETTERS.has(nextFirst)) return 'izhar';
      // Idghaam: before و م ن ي ر ل
      if (IDGHAAM_LETTERS.has(nextFirst)) return 'idghaam';
      // Ikhfa: before all other letters (15 letters)
      if (!IZHAR_LETTERS.has(nextFirst) &&
          !IDGHAAM_LETTERS.has(nextFirst) &&
          nextFirst !== IQLAB_LETTER) return 'ikhfa';
    }
  }

  // ── 5. MEEM SAAKIN rules ─────────────────────────────────
  const endsWithMeemSaakin = (lastLetter === MEEM) &&
    (hasSukoon(word, letters.length - 1));

  if (endsWithMeemSaakin && nextWord) {
    const nextFirst = firstLetter(nextWord);
    if (nextFirst === BA)   return 'ikhfa_shafawi';
    if (nextFirst === MEEM) return 'idghaam_meem';
    // izhar shafawi — clear meem — not highlighted (too common, low teaching value)
  }

  // ── 6. MADD ──────────────────────────────────────────────
  // Detect madd letter followed by hamza or saakin
  for (let i = 0; i < letters.length - 1; i++) {
    if (MADD_LETTERS.has(letters[i])) {
      const next = letters[i + 1];
      if (next === HAMZA || hasSukoon(word, i + 1)) {
        return next === HAMZA ? 'madd_connected' : 'madd_natural';
      }
    }
  }
  // Madd at end of word followed by hamza at start of next word
  if (MADD_LETTERS.has(lastLetter) && nextWord && firstLetter(nextWord) === HAMZA) {
    return 'madd_separated';
  }

  return null; // no rule detected
}

// ── Caches ────────────────────────────────────────────────────
let _mapCache   = null;
let _rulesCache = null;

async function getTajweedMap() {
  if (_mapCache) return _mapCache;
  try {
    const res = await fetch('js/data/tajweed-map.json');
    _mapCache = await res.json();
  } catch (_) { _mapCache = {}; }
  return _mapCache;
}

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

// ── Core export: annotate words with tajweed data ─────────────
// Returns array of objects, one per word:
// { word, idx, ruleId, cssClass, ruleName, oneLiner, source }
export async function applyTajweedToWords(surahNum, ayahNum, words) {
  const [rules, staticMap] = await Promise.all([getRules(), getTajweedMap()]);

  return words.map((word, idx) => {
    // 1. Static map always wins — hand-verified
    const mapKey = `${surahNum}:${ayahNum}:${idx + 1}`; // map is 1-based
    let ruleId = staticMap[mapKey] || null;
    let source = ruleId ? 'map' : null;

    // 2. Local detector
    if (!ruleId) {
      const nextWord = words[idx + 1] || null;
      ruleId = detectRule(word, nextWord);
      if (ruleId) source = 'detector';
    }

    const rule = ruleId ? rules[ruleId] : null;
    return {
      word,
      idx,
      ruleId,
      cssClass: ruleId ? (RULE_CLASS[ruleId] || null) : null,
      ruleName: rule ? rule.name      : null,   // {en,hi,ur} object
      oneLiner: rule ? rule.one_liner : null,   // {en,hi,ur} object
      source,
    };
  });
}

// ── Build HTML for LISTEN stage ───────────────────────────────
export async function buildTajweedAyah(surahNum, ayahNum, words, opts = {}) {
  const annotated = await applyTajweedToWords(surahNum, ayahNum, words);

  const newDiscoveries = [];
  for (const w of annotated) {
    if (w.ruleId) {
      const isNew = addDiscoveredRule(w.ruleId);
      if (isNew) newDiscoveries.push({ ruleId: w.ruleId, ruleName: w.ruleName }); // ruleName is {en,hi,ur}
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

// ── Render tajweed badge for word card ────────────────────────
export function renderTajweedBadge(annotatedWord, lang) {
  if (!annotatedWord?.ruleId || !annotatedWord?.ruleName) return '';
  const cls      = RULE_CLASS[annotatedWord.ruleId] || '';
  // ruleName and oneLiner are {en,hi,ur} objects — extract the right language
  const rn       = annotatedWord.ruleName;
  const ol       = annotatedWord.oneLiner;
  const name     = (typeof rn === 'object') ? (rn?.[lang] || rn?.en || '') : (rn || '');
  const oneLiner = (typeof ol === 'object') ? (ol?.[lang] || ol?.en || '') : (ol || '');
  return `
    <div style="display:flex;align-items:flex-start;gap:8px;
                background:var(--bg-surface);border:1px solid var(--border);
                border-radius:var(--r-md);padding:8px 12px;
                margin-bottom:12px;text-align:left;">
      <span class="tj-badge ${cls}" style="flex-shrink:0;margin-top:2px;">${name}</span>
      <span style="font-size:0.75rem;color:var(--ink-3);line-height:1.5;font-style:italic;">
        ${oneLiner}
      </span>
    </div>`;
}

// ── Render discovery flash ────────────────────────────────────
export function renderDiscoveryFlash(discovery) {
  if (!discovery) return '';
  return `
    <div style="background:var(--gold-dim);border:1px solid var(--border-gold);
                border-radius:var(--r-md);padding:10px 14px;margin-bottom:8px;
                display:flex;align-items:center;gap:10px;animation:wordPop 0.3s var(--ease-spring);">
      <span style="font-size:1.25rem;">✨</span>
      <div>
        <div style="font-size:0.75rem;font-weight:600;color:var(--gold);text-transform:uppercase;
                    letter-spacing:0.08em;margin-bottom:2px;">New Tajweed Rule</div>
        <div style="font-size:0.875rem;color:var(--ink);">${typeof discovery.ruleName === 'object' ? (discovery.ruleName?.en || '') : (discovery.ruleName || '')}</div>
      </div>
    </div>`;
}
