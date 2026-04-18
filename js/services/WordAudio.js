// ============================================================
// MAHFOOZ — WordAudio.js
// Word-by-word audio using audio.qurancdn.com
//
// Correct URL format (confirmed from Quran.com source):
//   https://audio.qurancdn.com/wbw/{surah}_{ayah:003}_{word:003}.mp3
//
// Rules:
//   - surah: NOT zero-padded  (112, not 0112)
//   - ayah:  zero-padded to 3 (001, 002 ...)
//   - word:  zero-padded to 3 (001, 002 ...)
//   - NO reciter subfolder — the path is just wbw/{s}_{a}_{w}.mp3
//
// Full ayah audio from everyayah.com (CORS confirmed working).
// ============================================================

let _wordAudio = null;   // single Audio element for word clips
let _ayahAudio = null;   // single Audio element for full ayah

function wordUrl(surahNum, ayahNum, wordPos) {
  // All three components zero-padded to 3 digits (confirmed: 078_001_001, 112_001_001)
  const s = String(surahNum).padStart(3, '0');
  const a = String(ayahNum).padStart(3, '0');
  const w = String(wordPos).padStart(3, '0');
  return `https://audio.qurancdn.com/wbw/${s}_${a}_${w}.mp3`;
}

// Map reciter key → everyayah.com folder name
const RECITER_FOLDERS = {
  afasy:    'Alafasy_128kbps',
  husary:   'Husary_128kbps',
  sudais:   'Abdul_Basit_Murattal_192kbps',
  minshawi: 'Minshawy_128kbps',
};

function ayahUrl(surahNum, ayahNum) {
  const key    = localStorage.getItem('mahfooz_reciter') || 'husary';
  const folder = RECITER_FOLDERS[key] || RECITER_FOLDERS.husary;
  const s = String(surahNum).padStart(3, '0');
  const a = String(ayahNum).padStart(3, '0');
  return `https://everyayah.com/data/${folder}/${s}${a}.mp3`;
}

// ── Play word from a direct URL (from API audio_url field) ──────
export function playWordFromUrl(url, { onStart, onEnd } = {}) {
  if (_wordAudio && !_wordAudio.paused) {
    _wordAudio.pause();
    _wordAudio.currentTime = 0;
  }
  if (!_wordAudio) _wordAudio = new Audio();
  _wordAudio.src = url;
  _wordAudio.oncanplay = null;
  _wordAudio.onended   = () => onEnd?.();
  _wordAudio.onerror   = () => onEnd?.();
  const p = _wordAudio.play();
  if (p) { onStart?.(); p.catch(() => onEnd?.()); }
}

// ── Play a single word ────────────────────────────────────────
// wordPos is 1-indexed position of the word within the ayah.
export function playWord(surahNum, ayahNum, wordPos, { onStart, onEnd } = {}) {
  // Stop any running word audio
  if (_wordAudio && !_wordAudio.paused) {
    _wordAudio.pause();
    _wordAudio.currentTime = 0;
  }

  if (!_wordAudio) _wordAudio = new Audio();
  _wordAudio.src = wordUrl(surahNum, ayahNum, wordPos);

  _wordAudio.oncanplay = null;
  _wordAudio.onended   = () => onEnd?.();
  _wordAudio.onerror   = () => onEnd?.();

  const p = _wordAudio.play();
  if (p) {
    onStart?.();
    p.catch(() => onEnd?.());
  }
}

// ── Play full ayah ────────────────────────────────────────────
export function playAyah(surahNum, ayahNum, { onStart, onEnd } = {}) {
  if (_ayahAudio && !_ayahAudio.paused) {
    _ayahAudio.pause();
    onEnd?.();
    return;
  }

  if (!_ayahAudio) _ayahAudio = new Audio();
  _ayahAudio.src = ayahUrl(surahNum, ayahNum);
  _ayahAudio.currentTime = 0;
  _ayahAudio.onended = () => onEnd?.();
  _ayahAudio.onerror = () => onEnd?.();

  const p = _ayahAudio.play();
  if (p) {
    onStart?.();
    p.catch(() => onEnd?.());
  }
}

// ── Stop everything ───────────────────────────────────────────
export function stopAudio() {
  if (_wordAudio && !_wordAudio.paused) _wordAudio.pause();
  if (_ayahAudio && !_ayahAudio.paused) _ayahAudio.pause();
}

// ── Preload ───────────────────────────────────────────────────
export function preloadAyah(surahNum, ayahNum) {
  if (!_ayahAudio) _ayahAudio = new Audio();
  _ayahAudio.src = ayahUrl(surahNum, ayahNum);
  _ayahAudio.preload = 'auto';
  _ayahAudio.load();
}
