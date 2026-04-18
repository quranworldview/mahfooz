// ============================================================
// MAHFOOZ — ProgressService.js
// All progress tracking in localStorage for prototype phase.
// Firestore wiring = drop-in replacement later.
//
// Spaced repetition schedule:
//   Strength 1 (fresh)    → review next day
//   Strength 2            → review in 3 days
//   Strength 3            → review in 7 days
//   Strength 4            → review in 21 days
//   Strength 5 (locked)   → review in 60 days
//
// Any failed review resets strength to 1.
// ============================================================

const KEY = {
  AYAH:    (s, a) => `mahfooz_ayah_${s}_${a}`,
  STREAK:  'mahfooz_streak',
  LAST:    'mahfooz_last_session',
  XP:      'mahfooz_xp',
  COUNT:   'mahfooz_ayat_count',
  PATHWAY:  'mahfooz_pathway',
  MISTAKE:  (s, a, w) => `mahfooz_mistake_${s}_${a}_${w}`,
};

const REVIEW_DAYS = { 1: 1, 2: 3, 3: 7, 4: 21, 5: 60 };

// ── Helpers ───────────────────────────────────────────────────
function today() {
  return new Date().toISOString().split('T')[0]; // 'YYYY-MM-DD'
}

function addDays(days) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().split('T')[0];
}

function daysBetween(dateStr) {
  const now  = new Date();
  const then = new Date(dateStr);
  return Math.floor((now - then) / 86400000);
}

// ── Ayah progress ─────────────────────────────────────────────
export function getAyahProgress(surahNum, ayahNum) {
  const raw = localStorage.getItem(KEY.AYAH(surahNum, ayahNum));
  if (!raw) return null;
  try { return JSON.parse(raw); } catch { return null; }
}

export function saveAyahProgress(surahNum, ayahNum, data) {
  localStorage.setItem(KEY.AYAH(surahNum, ayahNum), JSON.stringify(data));
}

// Called when student seals an ayah for the first time
export function sealAyah(surahNum, ayahNum, pathway) {
  const existing = getAyahProgress(surahNum, ayahNum);
  const strength = existing ? Math.min(existing.strength + 1, 5) : 1;
  const progress = {
    surah_number:  surahNum,
    ayah_number:   ayahNum,
    pathway:       pathway || localStorage.getItem(KEY.PATHWAY) || 'surah',
    status:        strength >= 5 ? 'locked' : 'memorized',
    strength,
    sealed_at:     existing?.sealed_at || new Date().toISOString(),
    last_reviewed: new Date().toISOString(),
    next_review:   addDays(REVIEW_DAYS[strength] || 1),
    review_count:  existing ? existing.review_count + 1 : 0,
    session_count: existing ? existing.session_count + 1 : 1,
  };
  saveAyahProgress(surahNum, ayahNum, progress);

  // If this is new, increment count
  if (!existing) {
    const count = parseInt(localStorage.getItem(KEY.COUNT) || '0') + 1;
    localStorage.setItem(KEY.COUNT, String(count));
  }

  return progress;
}

// Called after a review session
export function reviewAyah(surahNum, ayahNum, passed) {
  const existing = getAyahProgress(surahNum, ayahNum);
  if (!existing) return;

  const newStrength = passed
    ? Math.min(existing.strength + 1, 5)
    : 1; // failed → reset

  const updated = {
    ...existing,
    strength:      newStrength,
    status:        newStrength >= 5 ? 'locked' : 'memorized',
    last_reviewed: new Date().toISOString(),
    next_review:   addDays(REVIEW_DAYS[newStrength] || 1),
    review_count:  existing.review_count + 1,
  };
  saveAyahProgress(surahNum, ayahNum, updated);
  return updated;
}

// ── Strength label + class ────────────────────────────────────
export function getStrengthClass(progress) {
  if (!progress) return '';
  if (progress.strength >= 5) return 'strength-locked';
  if (progress.strength >= 3) return 'strength-strong';
  // Check if overdue
  const daysUntil = daysBetween(progress.next_review) * -1; // negative = future
  if (daysUntil < -3) return 'strength-fading';
  if (daysUntil < 0)  return 'strength-review';
  return 'strength-fresh';
}

export function getStrengthBadgeClass(progress) {
  if (!progress) return 'fresh';
  if (progress.strength >= 5) return 'locked';
  const days = daysBetween(progress.next_review) * -1;
  if (days < -3) return 'fading';
  if (days < 0)  return 'review';
  if (progress.strength >= 3) return 'strong';
  return 'fresh';
}

// ── Review due ────────────────────────────────────────────────
export function getDueAyat() {
  const due = [];
  const todayStr = today();
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (!key?.startsWith('mahfooz_ayah_')) continue;
    try {
      const p = JSON.parse(localStorage.getItem(key));
      if (p && p.next_review && p.next_review <= todayStr) {
        due.push(p);
      }
    } catch { /* skip */ }
  }
  return due.sort((a, b) => a.next_review.localeCompare(b.next_review));
}

export function getDueCount() {
  return getDueAyat().length;
}

// ── Surah completion ──────────────────────────────────────────
export function getSurahProgress(surahNum, totalAyat) {
  let memorized = 0, locked = 0;
  for (let a = 1; a <= totalAyat; a++) {
    const p = getAyahProgress(surahNum, a);
    if (!p) continue;
    memorized++;
    if (p.strength >= 5) locked++;
  }
  return { memorized, locked, total: totalAyat,
           pct: Math.round((memorized / totalAyat) * 100) };
}

// ── XP ────────────────────────────────────────────────────────
export function addXP(amount) {
  const current = parseInt(localStorage.getItem(KEY.XP) || '0');
  const next = current + amount;
  localStorage.setItem(KEY.XP, String(next));
  return next;
}

export function getXP() {
  return parseInt(localStorage.getItem(KEY.XP) || '0');
}

// ── Streak ────────────────────────────────────────────────────
export function updateStreak() {
  const last    = localStorage.getItem(KEY.LAST) || '';
  const todayStr = today();
  if (last === todayStr) return getStreak(); // already counted today

  const streak = getStreak();
  const yesterday = addDays(-1);
  const newStreak = (last === yesterday) ? streak + 1 : 1;

  localStorage.setItem(KEY.STREAK, String(newStreak));
  localStorage.setItem(KEY.LAST, todayStr);
  return newStreak;
}

export function getStreak() {
  return parseInt(localStorage.getItem(KEY.STREAK) || '0');
}

// ── Full stats snapshot ───────────────────────────────────────
export function getStats() {
  return {
    streak: getStreak(),
    xp:     getXP(),
    ayat:   parseInt(localStorage.getItem(KEY.COUNT) || '0'),
    due:    getDueCount(),
  };
}

// ── XP table ─────────────────────────────────────────────────
// ── Next ayah to learn for a surah ───────────────────────────
// Scans sealed ayah keys for this surah and returns the first
// ayah that has no progress record — i.e. the next one to learn.
// Returns 1 if nothing sealed yet, totalAyat if all sealed.
export function getNextAyahForSurah(surahNum, totalAyat) {
  for (let a = 1; a <= totalAyat; a++) {
    const progress = getAyahProgress(surahNum, a);
    if (!progress) return a; // first unsealed ayah
  }
  return null; // all sealed — surah complete
}

// ── Mistake tracking (for heatmap) ───────────────────────────
// Called from checkBlank in SessionScreen when a fill-blank answer is wrong.
// Key: mahfooz_mistake_{surah}_{ayah}_{wordIdx}  →  count (integer)
export function recordMistake(surahNum, ayahNum, wordIdx) {
  const k   = KEY.MISTAKE(surahNum, ayahNum, wordIdx);
  const cur = parseInt(localStorage.getItem(k) || '0');
  localStorage.setItem(k, String(cur + 1));
}

// Returns { wordIdx (0-based): mistakeCount } for all words in an ayah.
// Words with no mistakes are omitted.
export function getMistakes(surahNum, ayahNum) {
  const result = {};
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    const prefix = `mahfooz_mistake_${surahNum}_${ayahNum}_`;
    if (key && key.startsWith(prefix)) {
      const wordIdx = parseInt(key.slice(prefix.length));
      const count   = parseInt(localStorage.getItem(key) || '0');
      if (!isNaN(wordIdx) && count > 0) result[wordIdx] = count;
    }
  }
  return result;
}

export const XP = {
  SEAL_AYAH:         40,
  REVIEW_AYAH:       10,
  DISCOVER_TAJWEED:  25,
  LOCK_AYAH:         50,   // strength 5
  COMPLETE_SURAH:   200,
  COMPLETE_JUZ:     500,
  STREAK_7:          75,
  CHAIN_BONUS:         5,   // bonus XP for completing Chunk & Chain
};
