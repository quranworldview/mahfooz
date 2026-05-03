// ============================================================
// MAHFOOZ — QuranAPI.js
// Fetches Qur'anic text and translations from Quran.com v4.
// Audio from everyayah.com.
// Ported and adapted from Iqra's battle-tested quran-api.js.
//
// Confirmed working translation IDs (from Phase 2 Handoff v1.5):
//   English : 20  (Saheeh International)
//   Urdu    : 158 (Dr. Israr Ahmad / Bayan-ul-Quran)
//   Hindi   : 122 (Maulana Azizul Haque al-Umari)
//
// IDs 131 (EN) and 180 (HI) are BROKEN — never use them.
// API returns ONE translation per request — use parallel calls.
// ============================================================

const _cache     = {};   // surah-level ayah cache
const _wordCache = {};   // word-level data cache keyed "surahNum:ayahNum" 

// ── Arabic sanitiser — strip API artifacts ────────────────────
function _sanitise(text) {
  if (!text) return '';
  return text
    .replace(/\u06DD[\u0660-\u0669\u06F0-\u06F9]*/g, '')
    .replace(/[\u06DF\u06D7\u06D8\u06D9\u06DA\u06DB\u06DC\u06DE\u06E0\u06E2\u06E3\u06E4\u06E7\u06E8\u06EA\u06EB\u06EC\u06ED\u0615\u065A\u065B]/g, '')
    .replace(/[\uF500-\uF5FF]/g, '')
    .trim();
}

// ── Fetch Arabic text (Uthmani + IndoPak) ────────────────────
async function _fetchArabic(surahNum) {
  const uthmaniUrl = `https://api.quran.com/api/v4/verses/by_chapter/${surahNum}?language=en&words=false&fields=text_uthmani&per_page=300&page=1`;
  const indopakUrl = `https://api.quran.com/api/v4/quran/verses/indopak_nastaleeq?chapter_number=${surahNum}`;

  const [uthmaniRes, indopakRes] = await Promise.all([
    fetch(uthmaniUrl),
    fetch(indopakUrl).catch(() => null),
  ]);
  if (!uthmaniRes.ok) throw new Error('Quran.com error: ' + uthmaniRes.status);

  const uthmaniData = await uthmaniRes.json();
  const indopakData = (indopakRes?.ok) ? await indopakRes.json() : { verses: [] };

  // Build indopak lookup map
  const ipMap = {};
  (indopakData.verses || []).forEach(v => {
    const n = parseInt((v.verse_key || '').split(':')[1]);
    if (n) ipMap[n] = v.text_indopak_nastaleeq || '';
  });

  const map = {};
  (uthmaniData.verses || []).forEach(v => {
    map[v.verse_number] = {
      uthmani: _sanitise(v.text_uthmani || ''),
      indopak: _sanitise(ipMap[v.verse_number] || v.text_uthmani || ''),
    };
  });
  return map;
}

// ── Fetch one translation ─────────────────────────────────────
async function _fetchTranslation(surahNum, translationId) {
  const url = `https://api.quran.com/api/v4/quran/translations/${translationId}?chapter_number=${surahNum}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Translation ${translationId} error: ${res.status}`);
  const data = await res.json();
  const map = {};
  (data.translations || []).forEach(t => {
    const ayahNum = parseInt((t.verse_key || '').split(':')[1]);
    if (ayahNum) {
      // Strip HTML tags from translations
      map[ayahNum] = (t.text || '').replace(/<[^>]+>/g, '').trim();
    }
  });
  return map;
}

// ── Fallback: AlQuran.cloud ───────────────────────────────────
async function _fetchFallback(surahNum) {
  const editions = ['quran-uthmani', 'en.sahih', 'ur.jalandhry', 'hi.hindi'];
  const results = await Promise.all(
    editions.map(ed =>
      fetch(`https://api.alquran.cloud/v1/surah/${surahNum}/${ed}`)
        .then(r => r.ok ? r.json() : null)
        .catch(() => null)
    )
  );
  const [arData, enData, urData, hiData] = results;
  const toMap = data => {
    const m = {};
    (data?.data?.ayahs || []).forEach(a => { m[a.numberInSurah] = a.text || ''; });
    return m;
  };
  const arMap = toMap(arData);
  const enMap = toMap(enData);
  const urMap = toMap(urData);
  const hiMap = toMap(hiData);

  return Object.keys(arMap).map(num => {
    const n = parseInt(num);
    return {
      num: n,
      arabic:         _sanitise(arMap[n] || ''),
      arabic_indopak: _sanitise(arMap[n] || ''),
      translation_en: enMap[n] || '',
      translation_ur: urMap[n] || '',
      translation_hi: hiMap[n] || '',
    };
  }).sort((a, b) => a.num - b.num);
}

// ── Primary fetch ─────────────────────────────────────────────
async function _fetchPrimary(surahNum) {
  const [arabicMap, enMap, urMap, hiMap] = await Promise.all([
    _fetchArabic(surahNum),
    _fetchTranslation(surahNum, 20),   // EN — Saheeh International
    _fetchTranslation(surahNum, 158),  // UR — Dr. Israr Ahmad
    _fetchTranslation(surahNum, 122),  // HI — Maulana Azizul Haque
  ]);

  return Object.keys(arabicMap).map(num => {
    const n  = parseInt(num);
    const ar = arabicMap[n] || {};
    return {
      num:            n,
      arabic:         ar.uthmani || '',
      arabic_indopak: ar.indopak || '',
      translation_en: enMap[n]   || '',
      translation_ur: urMap[n]   || '',
      translation_hi: hiMap[n]   || '',
    };
  }).sort((a, b) => a.num - b.num);
}

// ── Public: fetch surah ───────────────────────────────────────
export async function fetchSurah(surahNum) {
  if (_cache[surahNum]) return _cache[surahNum];

  let ayahs;
  try {
    ayahs = await _fetchPrimary(surahNum);
  } catch (err) {
    console.warn('[QuranAPI] Primary failed, trying fallback:', err.message);
    try {
      ayahs = await _fetchFallback(surahNum);
    } catch (err2) {
      throw new Error('Could not load Surah ' + surahNum + '. Please check your connection.');
    }
  }

  _cache[surahNum] = ayahs;
  return ayahs;
}

// ── Public: fetch single ayah ─────────────────────────────────
export async function fetchAyah(surahNum, ayahNum) {
  const ayahs = await fetchSurah(surahNum);
  return ayahs.find(a => a.num === ayahNum) || null;
}

// ── Public: audio URL ─────────────────────────────────────────
export function getAudioUrl(surahNum, ayahNum, reciter) {
  const folder = RECITERS[reciter] || RECITERS['afasy'];
  const s = String(surahNum).padStart(3, '0');
  const a = String(ayahNum).padStart(3, '0');
  return `https://everyayah.com/data/${folder}/${s}${a}.mp3`;
}

// ── Public: prefetch next surah ───────────────────────────────
export function prefetch(surahNum) {
  if (surahNum >= 1 && surahNum <= 114 && !_cache[surahNum]) {
    fetchSurah(surahNum).catch(() => {});
  }
}

// ── WBW Hindi/Urdu static data (from legacy.quranwbw.com) ──────
// Loaded once, cached globally. Keys: "surah:ayah:position" (1-based)
// Built by running: node build-wbw.js  (in the QWV tools repo)
let _wbwHi = null;
let _wbwUr = null;

async function _loadWbwData() {
  if (_wbwHi && _wbwUr) return;
  try {
    const [hi, ur] = await Promise.all([
      fetch('js/data/wbw-hi.json').then(r => r.ok ? r.json() : {}),
      fetch('js/data/wbw-ur.json').then(r => r.ok ? r.json() : {}),
    ]);
    _wbwHi = hi;
    _wbwUr = ur;
  } catch (_) {
    _wbwHi = {};
    _wbwUr = {};
  }
}

export function getWbwMeaning(surahNum, ayahNum, position, lang) {
  // position is 1-based (matches quran.com word position)
  const key = `${surahNum}:${ayahNum}:${position}`;
  if (lang === 'hi') return _wbwHi?.[key] || '';
  if (lang === 'ur') return _wbwUr?.[key] || '';
  return '';
}

// ── Word-level data (translation + transliteration + audio_url) ─
// Fetches from quran.com API v4. Returns array of word objects:
// { position, text_uthmani, translation, transliteration, audio_url, char_type_name }
// Also pre-loads WBW hi/ur data in parallel.
// Only 'word' type entries (not 'end' markers) are meaningful for display.
// Cached per ayah key "surahNum:ayahNum".
export async function fetchWordData(surahNum, ayahNum) {
  const key = `${surahNum}:${ayahNum}`;
  if (_wordCache[key]) return _wordCache[key];

  // Pre-load WBW hi/ur data in parallel (no-op if already loaded)
  _loadWbwData();

  try {
    const url = `https://api.quran.com/api/v4/verses/by_key/${surahNum}:${ayahNum}` +
      `?words=true&word_fields=text_uthmani,transliteration,translation`;
    const res = await fetch(url);
    if (!res.ok) throw new Error('word fetch failed');
    const data = await res.json();

    // Build a position-keyed map (1-based) of word-type entries only.
    // Using a map (not array) means we look up by quran.com position number
    // directly — immune to index/count mismatches with splitWords().
    // End markers (١ ٢ etc.) are excluded — they get no WBW meaning.
    const wordMap = {};
    (data?.verse?.words || [])
      .filter(w => w.char_type_name === 'word')
      .forEach(w => {
        wordMap[w.position] = {
          position:        w.position,
          text_uthmani:    w.text_uthmani || '',
          translation:     w.translation?.text || '',
          transliteration: w.transliteration?.text || '',
          audio_url:       w.audio_url || null,
        };
      });

    _wordCache[key] = wordMap;
    return wordMap;
  } catch (_) {
    return [];
  }
}

// ── Reciters ──────────────────────────────────────────────────
export const RECITERS = {
  afasy:   'Alafasy_128kbps',
  sudais:  'Abdul_Basit_Murattal_192kbps',
  husary:  'Husary_128kbps',         // Best for hifz — slow, clear
  minshawi:'Minshawy_128kbps',
};

export const RECITER_NAMES = {
  afasy:   { en: 'Mishary Al-Afasy',     hi: 'मिशारी अल-अफ़ासी',    ur: 'مشاری الافاسی'      },
  sudais:  { en: 'Abdul Rahman Al-Sudais',hi:'अब्दुर्रहमान अस-सुदैस', ur: 'عبدالرحمن السدیس' },
  husary:  { en: 'Al-Husary (Murattal)', hi: 'अल-हुसारी (मुरत्तल)', ur: 'الحصری (مرتل)'     },
  minshawi:{ en: 'Al-Minshawi',          hi: 'अल-मिनशावी',           ur: 'المنشاوی'           },
};

export function getReciter() {
  return localStorage.getItem('mahfooz_reciter') || 'husary'; // husary default for hifz
}
export function setReciter(id) {
  localStorage.setItem('mahfooz_reciter', id);
}

// ── Word-by-word audio ────────────────────────────────────────
// Uses audio.qurancdn.com — confirmed working format.
// Position is 1-indexed word number within the ayah.
// Reciter keys for word audio (different from full-ayah reciters):
export const WBW_RECITERS = {
  husary:   'khalil_husary_2014',        // Clear, slow — best for hifz
  afasy:    'mishari_rashid_alafasy',    // Popular, melodic
  shatri:   'abu_bakr_ash_shatri',       // Clear pronunciation
};

export function getWordAudioUrl(surahNum, ayahNum, wordPosition) {
  const reciter = WBW_RECITERS.husary;
  const s = String(surahNum).padStart(3, '0');
  const a = String(ayahNum).padStart(3, '0');
  const w = String(wordPosition).padStart(3, '0');
  return `https://audio.qurancdn.com/wbw/${reciter}/${s}_${a}_${w}.mp3`;
}
