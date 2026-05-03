// ============================================================
// MAHFOOZ — SessionScreen.js v3.5 — BUILD 20260413
// The 5-stage memorization engine.
//
// Stage 1 — CONTEXT  : Gem card — why this ayah matters
// Stage 2 — LISTEN   : Full ayah audio, living word display
// Stage 3 — LEARN    : Word by word, Alif badges, Tajweed
// Stage 4 — PRACTICE : Gradual reveal → Fill blank → Listen & Repeat
// Stage 5 — SEAL     : XP, review scheduled, reflection prompt
// ============================================================
import { t }                              from '../core/i18n.js';
import { fetchSurah, getAudioUrl, getReciter, fetchWordData, getWbwMeaning } from '../services/QuranAPI.js';
import { sealAyah, addXP, updateStreak, XP, getAyahProgress, recordMistake, getMistakes } from '../services/ProgressService.js';
import { lookupWord }                     from '../core/ArabicText.js';
import { playWord, playWordFromUrl, playAyah, stopAudio, preloadAyah } from '../services/WordAudio.js';
import { applyTajweedToWords, buildTajweedAyah, buildLearnContextBar, renderTajweedBadge, renderDiscoveryFlash } from '../core/TajweedText.js';

// ── Session state ─────────────────────────────────────────────
let S = {
  surahNum:   0,
  ayahNum:    0,
  surahData:  null,
  ayah:       null,
  lang:       'hi',
  stage:      0,
  words:      [],
  wordIdx:    0,
  practiceIdx:0,
  xpEarned:   0,
  _revealIdx:  undefined,
  _blankIdx:   undefined,
  _wordData:   null,    // per-word API data: {position: {translation, transliteration, audio_url}} — position-keyed map
  _repTarget:  7,       // chosen rep count — default 7
  _repDone:    0,       // completed reps this session
  _repPhase:   'pick',  // 'pick' | 'reciting'
  _chainPhase:    null,    // null | 'reciting' | 'done' — Chunk & Chain state
  _chainRevealed: false,    // whether full ayah text is revealed in chain card
};

const STAGES = ['context','listen','learn','practice','seal'];
const TOTAL_STEPS = 5;

// ── Entry point ───────────────────────────────────────────────
// Called by app.js setLang — updates lang in-place without resetting stage
export function updateSessionLang(lang) {
  S.lang = lang;
  // Only re-render if session is currently active on screen
  if (document.getElementById('sess-body')) {
    _renderStage();
  }
}

export async function renderSessionScreen(lang) {
  // Pull session params set by SurahListScreen
  const params = window._session || { surahNum: 112, ayahNum: 1 };
  S.surahNum  = params.surahNum;
  S.ayahNum   = params.ayahNum;
  S.surahData = params.surahData;
  S.lang      = lang;
  S.stage     = 0;
  S.wordIdx   = 0;
  S.practiceIdx = 0;
  S.xpEarned  = 0;
  S._chainPhase    = null;
  S._chainRevealed = false;
  stopAudio();

  // Shell — content filled by _renderStage
  const shell = `
    <div class="screen active" data-screen="session"
         style="
                background:var(--bg);overflow:hidden;">

      <!-- Session bar -->
      <div class="session-bar">
        <button class="session-close" onclick="exitSession()">✕</button>
        <div class="session-progress-bar">
          <div class="session-progress-fill" id="sess-prog" style="width:0%"></div>
        </div>
        <div class="session-xp" id="sess-xp">+0 XP</div>
      </div>

      <!-- Stage content -->
      <div id="sess-body" class="scroll-area" style="flex:1;padding:0;">
        <div style="display:flex;align-items:center;justify-content:center;
                    min-height:200px;color:var(--ink-3);font-size:0.875rem;">
          ${t('loading', lang)}
        </div>
      </div>

    </div>
  `;

  // Fetch ayah data then render first stage
  setTimeout(async () => {
    try {
      const ayahs = await fetchSurah(S.surahNum);
      S.ayah  = ayahs.find(a => a.num === S.ayahNum);
      if (!S.ayah) throw new Error('Ayah not found');

      // Add surah name to ayah for reference
      S.ayah.surah_name = {
        en: S.surahData?.name_en || `Surah ${S.surahNum}`,
        hi: S.surahData?.name_hi || `सूरह ${S.surahNum}`,
        ur: S.surahData?.name_ur || `سورہ ${S.surahNum}`,
      };

      // Split words
      const text = _getAyahText(S.ayah);
      S.words = text.trim().split(/\s+/).filter(Boolean);

      // Pre-fetch word-level data (translation + audio URLs) from API
      S._wordData = null;
      fetchWordData(S.surahNum, S.ayahNum)
        .then(words => { S._wordData = words; })
        .catch(() => { S._wordData = null; });

      // Pre-fetch tajweed annotations for this ayah (async, non-blocking)
      S._tajweed = null;
      applyTajweedToWords(S.surahNum, S.ayahNum, S.words)
        .then(annotated => { S._tajweed = annotated; })
        .catch(() => { S._tajweed = null; });

      // Preload audio and timings for this ayah
      preloadAyah(S.surahNum, S.ayahNum);

      _renderStage();
      _initSwipe();
    } catch (err) {
      const body = document.getElementById('sess-body');
      if (body) body.innerHTML = `
        <div style="padding:32px 24px;text-align:center;">
          <div style="font-size:2rem;margin-bottom:12px;">⚠️</div>
          <div style="color:var(--ink-3);font-size:0.875rem;margin-bottom:20px;">
            ${t('error', lang)}
          </div>
          <button class="btn btn-secondary" onclick="exitSession()" style="width:auto;padding:10px 24px;">
            ← ${t('navHome', lang)}
          </button>
        </div>
      `;
    }
  }, 50);

  return shell;
}

// ── Get correct Arabic text ───────────────────────────────────
function _getAyahText(ayah) {
  const script = document.documentElement.getAttribute('data-script') || 'indopak';
  const raw = (script === 'indopak' && ayah.arabic_indopak) ? ayah.arabic_indopak : ayah.arabic;
  return raw
    .replace(/\u06DD[\u0660-\u0669\u06F0-\u06F9]*/g, '')
    .replace(/[\u06DF\u06D6-\u06DC\u065A\u06E9]+$/g, '')
    .trim();
}

// ── Progress bar ─────────────────────────────────────────────
function _updateProgress() {
  const fill = document.getElementById('sess-prog');
  if (fill) fill.style.width = `${((S.stage + 1) / TOTAL_STEPS) * 100}%`;
  const xpEl = document.getElementById('sess-xp');
  if (xpEl) xpEl.textContent = `+${S.xpEarned} XP`;
}

// ── Render current stage ──────────────────────────────────────
function _renderStage() {
  _updateProgress();
  const body = document.getElementById('sess-body');
  if (!body) return;
  body.scrollTop = 0;

  const renderers = [
    _renderContext,
    _renderListen,
    _renderLearn,
    _renderPractice,
    _renderSeal,
  ];
  body.innerHTML = (renderers[S.stage] || _renderContext)();

  // Hydrate tajweed colors in Listen stage (async, runs after innerHTML set)
  if (S.stage === 1) _hydrateTajweedWords();
}

// ── STAGE 1 — CONTEXT ─────────────────────────────────────────
function _renderContext() {
  const lang = S.lang;
  const surahName = S.ayah.surah_name?.[lang] || S.ayah.surah_name?.en || '';
  const gem = _getContextGem(S.surahNum, S.ayahNum, lang);

  return `
    <div style="padding:20px 20px 100px;" class="stagger">

      <div class="stage-label">✨ ${t('stageContext', lang)}</div>

      <!-- Surah name -->
      <div style="text-align:center;margin-bottom:20px;">
        <div class="arabic" style="font-size:28px;color:var(--gold);
                                    line-height:1.8;margin-bottom:4px;">
          ${S.surahData?.name_ar || ''}
        </div>
        <div style="font-family:var(--font-display);font-size:1.25rem;
                    color:var(--ink);">${surahName}</div>
        <div style="font-size:0.75rem;color:var(--ink-3);margin-top:4px;">
          ${S.surahData?.ayat || ''} ${lang==='ur'?'آیات':lang==='hi'?'आयतें':'ayat'} ·
          ${lang==='ur'?'جزء':lang==='hi'?'जुज़':'Juz'} ${S.surahData?.juz || ''}
        </div>
      </div>

      <!-- Gem card -->
      <div class="gem-card" style="margin-bottom:16px;">
        <div class="gem-type">✨ ${gem.type}</div>
        <div class="gem-text">${gem.text}</div>
      </div>

      <!-- Ayah preview — static, full -->
      <div style="background:var(--bg-elevated);border:1px solid var(--border-gold);
                  border-radius:var(--r-lg);padding:20px;margin-bottom:16px;
                  text-align:right;">
        <div class="ayah-arabic" lang="ar" dir="rtl"
             style="margin-bottom:10px;text-align:right;">
          ${_getAyahText(S.ayah)}
        </div>
        <div style="font-family:var(--font-display);font-size:0.875rem;
                    font-style:italic;color:var(--ink-3);
                    ${lang==='ur'?'text-align:right;direction:rtl;':''}">
          ${S.ayah[`translation_${lang}`] || S.ayah.translation_en}
        </div>
      </div>

      <!-- CTA -->
      <button class="btn btn-primary" onclick="sessNext()">
        ${t('stageListen', lang)} →
      </button>
    </div>
  `;
}

// ── STAGE 2 — LISTEN ─────────────────────────────────────────
function _renderListen() {
  const lang = S.lang;

  return `
    <div style="padding:20px 20px 100px;">

      <div class="stage-label">🎧 ${t('stageListen', lang)}</div>

      <!-- Living ayah — word by word, tappable -->
      <div style="background:var(--bg-elevated);border:1px solid var(--border-gold);
                  border-radius:var(--r-lg);padding:24px 20px 18px;
                  margin-bottom:16px;text-align:center;">

        <div class="ayah-arabic" lang="ar" dir="rtl"
             style="margin-bottom:14px;line-height:2.8;text-align:right;"
             id="tj-ayah-words">
          ${_buildLivingWords()}
        </div>

        <div style="font-family:var(--font-display);font-size:0.875rem;
                    font-style:italic;color:var(--ink-3);line-height:1.7;
                    ${lang==='ur'?'text-align:right;direction:rtl;':''}">
          ${S.ayah[`translation_${lang}`] || S.ayah.translation_en}
        </div>

        <div style="margin-top:12px;font-size:0.6875rem;color:var(--ink-3);
                    font-style:italic;">
          ${t('tapWord', lang)}
        </div>

        <!-- Discovery flash — filled async by _hydrateTajweedWords -->
        <div id="tj-discovery-flash"></div>

      </div>

      <!-- Audio controls -->
      <div style="display:flex;gap:10px;margin-bottom:16px;">
        <button id="play-btn" onclick="sessPlayAudio()"
                style="flex:1;padding:14px;border-radius:var(--r-md);
                       border:1px solid var(--border-gold);background:var(--gold-dim);
                       color:var(--gold);font-family:var(--font-body);font-size:0.9375rem;
                       font-weight:500;cursor:pointer;transition:all var(--t-fast) var(--ease);
                       display:flex;align-items:center;justify-content:center;gap:8px;">
          ▶ ${t('stageListen', lang)}
        </button>
        <button onclick="sessPlayAudio()"
                style="width:48px;padding:14px;border-radius:var(--r-md);
                       border:1px solid var(--border-mid);background:var(--bg-elevated);
                       color:var(--ink-3);cursor:pointer;font-size:1.125rem;
                       transition:all var(--t-fast) var(--ease);"
                title="${t('listenAgain', lang)}">↺</button>
      </div>

      <button class="btn btn-primary" onclick="sessNext()">
        ${t('stageLearn', lang)} →
      </button>
      <button class="btn btn-ghost" style="text-align:center;color:var(--ink-3);margin-top:6px;"
              onclick="sessPlayAudio()">
        ${t('listenAgain', lang)}
      </button>
    </div>
  `;
}

// ── STAGE 3 — LEARN ──────────────────────────────────────────
function _renderLearn() {
  const lang  = S.lang;
  const words = S.words;
  const idx   = S.wordIdx;
  const word  = words[idx] || '';

  const prevBtn = idx > 0 ? `
    <button class="btn btn-secondary" onclick="sessWordBack()"
            style="padding:12px;">← ${t('prevWord', lang)}</button>
  ` : `<div></div>`;

  const isLast = idx === words.length - 1;
  const nextBtn = isLast ? `
    <button class="btn btn-primary" onclick="sessNext()">
      ${t('stagePractice', lang)} →
    </button>
  ` : `
    <button class="btn btn-primary" onclick="sessWordNext()">
      ${t('nextWord', lang)} →
    </button>
  `;

  return `
    <div style="padding:20px 20px 100px;">

      <div class="stage-label">📖 ${t('stageLearn', lang)}</div>

      <!-- Word counter -->
      <div style="display:flex;align-items:center;justify-content:space-between;
                  margin-bottom:16px;">
        <div style="font-size:0.75rem;color:var(--ink-3);">
          ${lang==='ur'?'لفظ':lang==='hi'?'लफ़्ज़':'Word'} ${idx + 1} / ${words.length}
        </div>
        <div style="display:flex;gap:4px;">
          ${words.map((_, i) => `
            <div style="width:${i===idx?'16px':'6px'};height:6px;border-radius:3px;
                        background:${i===idx?'var(--gold)':i<idx?'var(--border-gold)':'var(--border-mid)'};
                        transition:all 0.2s ease;"></div>
          `).join('')}
        </div>
      </div>

      <!-- Full ayah context — highlight current word + tajweed colors -->
      <div style="background:var(--bg-elevated);border:1px solid var(--border);
                  border-radius:var(--r-lg);padding:16px 18px;margin-bottom:16px;
                  text-align:right;">
        <div class="ayah-arabic" lang="ar" dir="rtl"
             style="font-size:24px;line-height:2.4;text-align:right;">
          ${S._tajweed
            ? buildLearnContextBar(S._tajweed, idx)
            : words.map((w, i) => `<span style="
                color:${i===idx?'var(--gold)':'var(--ink-arabic)'};
                font-weight:${i===idx?'700':'400'};
                background:${i===idx?'var(--gold-dim)':'transparent'};
                border-radius:3px;padding:0 2px;
                transition:all 0.2s ease;">${w}</span>`).join(' ')}
        </div>
      </div>

      <!-- Word card — lookup data shown here -->
      <div id="word-card-area" style="margin-bottom:16px;">
        ${_renderWordCard(word, idx, lang)}
      </div>

      <!-- Nav buttons -->
      <div style="display:flex;flex-direction:column;gap:8px;">
        ${nextBtn}
        ${prevBtn}
      </div>
    </div>
  `;
}

function _renderWordCard(word, idx, lang) {
  // S._wordData is a position-keyed map {position: wordObj} from fetchWordData.
  // idx is 0-based (word index in S.words[] from splitWords).
  // WBW and quran.com both use 1-based position matching the Uthmani word order.
  // We look up by (idx + 1) as the canonical position — this matches both WBW
  // keys and quran.com position numbers for the vast majority of ayat.
  const pos      = idx + 1;                            // 1-based position
  const apiWord  = S._wordData?.[pos] || null;         // position-keyed lookup
  const alifData = _alifLookup(word);

  // Meaning priority:
  // 1. Alif-index (trilingual, curated) — best, 211 key words
  // 2. WBW JSON (Dr. Farhat Hashmi hi/ur) — full Quran, 77,429 entries
  // 3. quran.com API word translation — English only, last resort
  let meaning = alifData?.meaning?.[lang] || alifData?.meaning?.en || '';
  if (!meaning) {
    if (lang === 'en') {
      meaning = apiWord?.translation || '';
    } else {
      // WBW key uses same 1-based position as splitWords index
      meaning = getWbwMeaning(S.surahNum, S.ayahNum, pos, lang) || '';
      // Final fallback: English from API
      if (!meaning) meaning = apiWord?.translation || '';
    }
  }

  // Transliteration: Alif first, then API
  const translit = alifData?.transliteration || apiWord?.transliteration || '';

  const root   = alifData?.root   || '';
  const lesson = alifData?.lesson || null;

  return `
    <div style="background:var(--bg-elevated);border:1px solid var(--border-gold);
                border-radius:var(--r-xl);padding:24px 20px;text-align:center;
                box-shadow:var(--shadow-md);animation:wordPop 0.3s var(--ease-spring);">

      <!-- The word big -->
      <div class="arabic" style="font-size:52px;color:var(--gold);line-height:1.5;
                                  margin-bottom:2px;" lang="ar">${word}</div>

      <!-- Transliteration -->
      ${translit ? `
        <div style="font-size:0.8125rem;color:var(--ink-3);font-style:italic;
                    margin-bottom:10px;letter-spacing:0.02em;">${translit}</div>
      ` : ''}

      <!-- Meaning -->
      ${meaning ? `
        <div style="font-family:var(--font-display);font-size:1.25rem;
                    color:var(--ink);margin-bottom:12px;">${meaning}</div>
      ` : `
        <div style="font-size:0.875rem;color:var(--ink-3);margin-bottom:12px;">
          ${lang==='ur'?'قرآنی لفظ':lang==='hi'?'क़ुरआनी लफ़्ज़':'Qur\'anic word'}
        </div>
      `}

      ${root || lesson ? `
        <div style="display:flex;gap:6px;justify-content:center;flex-wrap:wrap;margin-bottom:14px;">
          ${root ? `
            <span style="background:var(--bg-surface);border:1px solid var(--border-mid);
                         border-radius:var(--r-pill);padding:3px 10px;
                         font-size:0.6875rem;color:var(--ink-3);">
              ${lang==='ur'?'جڑ':lang==='hi'?'जड़':'Root'}:
              <span class="arabic" style="font-size:14px;margin-right:4px;">${root}</span>
            </span>
          ` : ''}
          ${lesson ? `
            <span style="background:var(--gold-dim);border:1px solid var(--border-gold);
                         border-radius:var(--r-pill);padding:3px 10px;
                         font-size:0.6875rem;color:var(--gold);">
              ✨ ${t('fromAlif', lang)} · ${t('lesson', lang)} ${lesson}
            </span>
          ` : ''}
        </div>
      ` : ''}

      <!-- Tajweed badge — shown if this word has an annotation -->
      ${S._tajweed?.[idx] ? renderTajweedBadge(S._tajweed[idx], lang) : ''}

      <!-- Audio -->
      <button onclick="sessPlayWordAudio(${idx})"
              style="width:100%;padding:10px;border-radius:var(--r-md);
                     border:1px solid var(--border-gold);background:var(--gold-dim);
                     color:var(--gold);font-family:var(--font-body);font-size:0.875rem;
                     cursor:pointer;transition:all var(--t-fast) var(--ease);">
        ▶ ${t('playWord', lang)}
      </button>
    </div>
  `;
}

// ── STAGE 4 — PRACTICE ───────────────────────────────────────
function _renderPractice() {
  const techniques = [_practiceReveal, _practiceFillBlank, _practiceFirstLetter, _practiceRep, _practiceListenRepeat];
  return (techniques[S.practiceIdx] || _practiceReveal)();
}

// Practice A — Gradual Reveal (blur-based)
function _practiceReveal() {
  const lang = S.lang;
  const words = S.words;
  if (S._revealIdx === undefined) S._revealIdx = 0;
  const shown = S._revealIdx;

  return `
    <div style="padding:20px 20px 100px;">
      <div class="stage-label">✏️ ${t('stagePractice', lang)} · 1/5</div>

      <div style="font-family:var(--font-display);font-size:1rem;color:var(--ink);
                  margin-bottom:16px;">
        ${lang==='ur'?'آہستہ آہستہ یاد کریں':lang==='hi'?'धीरे-धीरे याद करें':'Reveal word by word'}
      </div>

      <!-- Ayah with blur-based progressive reveal -->
      <div style="background:var(--bg-elevated);border:1px solid var(--border-gold);
                  border-radius:var(--r-lg);padding:24px 20px;margin-bottom:20px;">
        <div class="ayah-arabic" lang="ar" dir="rtl"
             id="reveal-ayah"
             style="font-size:clamp(20px,4vw,28px);line-height:2.8;text-align:right;">
          ${words.map((w, i) => `
            <span class="practice-word ${i < shown ? 'revealed' : 'hidden'}"
                  data-word-i="${i}"
                  ${i >= shown ? `onclick="revealNext()"` : ''}>
              ${w}
            </span>
          `).join(' ')}
        </div>
      </div>

      <div style="display:flex;flex-direction:column;gap:8px;">
        ${shown < words.length ? `
          <button class="btn btn-primary" onclick="revealNext()">
            ${lang==='ur'?'اگلا لفظ':lang==='hi'?'अगला लफ़्ज़':'Reveal next word'} →
          </button>
        ` : `
          <button class="btn btn-primary" onclick="sessPracticeNext()">
            ${lang==='ur'?'اگلا مشق':lang==='hi'?'अगली मश्क़':'Next practice'} →
          </button>
        `}
        <button class="btn btn-ghost" style="text-align:center;color:var(--ink-3);"
                onclick="sessPlayAudio()">
          ▶ ${t('listenAgain', lang)}
        </button>
      </div>
    </div>
  `;
}

// Practice B — Fill the Blank
function _practiceFillBlank() {
  const lang  = S.lang;
  const words = S.words;
  // Pick random word to blank (not first or last for difficulty)
  if (S._blankIdx === undefined) {
    S._blankIdx = Math.floor(words.length / 2);
    S._blankAnswered = false;
  }
  const blankIdx = S._blankIdx;

  // Build distractors from nearby words or Alif index
  const correct = words[blankIdx];
  const options = _buildOptions(correct, words, blankIdx);

  return `
    <div style="padding:20px 20px 100px;">
      <div class="stage-label">🎯 ${t('stagePractice', lang)} · 2/5</div>

      <div style="font-family:var(--font-display);font-size:1rem;color:var(--ink);
                  margin-bottom:16px;">
        ${lang==='ur'?'خالی جگہ بھریں':lang==='hi'?'ख़ाली जगह भरें':'Fill in the missing word'}
      </div>

      <!-- Ayah with blank -->
      <div style="background:var(--bg-elevated);border:1px solid var(--border-gold);
                  border-radius:var(--r-lg);padding:20px;margin-bottom:20px;text-align:right;">
        <div class="ayah-arabic" lang="ar" dir="rtl"
             style="font-size:clamp(20px,4vw,28px);line-height:2.4;text-align:right;">
          ${words.map((w, i) => i === blankIdx
            ? `<span id="blank-slot" class="blank-slot"></span>`
            : `<span>${w}</span>`
          ).join(' ')}
        </div>
      </div>

      <!-- Options grid -->
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:16px;">
        ${options.map(opt => `
          <button onclick="checkBlank('${encodeURIComponent(opt)}','${encodeURIComponent(correct)}')"
                  class="choice-btn"
                  style="font-family:var(--font-arabic);font-size:28px;direction:rtl;
                         line-height:1.6;padding:16px 10px;"
                  lang="ar">
            ${opt}
          </button>
        `).join('')}
      </div>

      <div id="blank-feedback"></div>
    </div>
  `;
}

// Practice E — First-Letter Cue
// Show only the first Arabic letter of each word as a hint.
// Student recites the full word from memory, then taps to confirm.
// All words tapped → Continue unlocks.
function _practiceFirstLetter() {
  const lang  = S.lang;
  const words = S.words;

  // _flRevealed: Set of word indices the student has confirmed
  if (!S._flRevealed) S._flRevealed = new Set();
  const revealed = S._flRevealed;
  const allDone  = revealed.size >= words.length;

  return `
    <div style="padding:20px 20px 100px;">
      <div class="stage-label">🔤 ${t('stagePractice', lang)} · 3/5</div>

      <div style="font-family:var(--font-display);font-size:1rem;color:var(--ink);
                  margin-bottom:6px;">
        ${lang==='ur'?'پہلے حرف سے یاد کریں'
          :lang==='hi'?'पहले हर्फ़ से याद करें'
          :'Recall each word from its first letter'}
      </div>
      <div style="font-size:0.8125rem;color:var(--ink-3);margin-bottom:16px;line-height:1.6;">
        ${lang==='ur'?'دل میں پڑھیں، پھر لفظ دیکھنے کے لیے ٹیپ کریں'
          :lang==='hi'?'मन में पढ़ें, फिर लफ़्ज़ देखने के लिए टैप करें'
          :'Recite in your mind, then tap to reveal'}
      </div>

      <!-- Ayah with first-letter hints -->
      <div style="background:var(--bg-elevated);border:1px solid var(--border-gold);
                  border-radius:var(--r-lg);padding:24px 16px;margin-bottom:20px;">
        <div class="ayah-arabic" lang="ar" dir="rtl"
             style="font-size:clamp(22px,5vw,32px);line-height:3;text-align:right;
                    display:flex;flex-wrap:wrap;gap:6px;justify-content:flex-end;
                    align-items:center;">
          ${words.map((w, i) => {
            const firstLetter = _getFirstLetter(w);
            const isRevealed  = revealed.has(i);
            if (isRevealed) {
              return `<span style="color:var(--ink-arabic);transition:all 0.25s ease;"
                           class="q-word">${w}</span>`;
            }
            return `
              <span onclick="flReveal(${i})"
                    style="display:inline-flex;flex-direction:column;align-items:center;
                           cursor:pointer;min-width:1.8em;text-align:center;
                           transition:all 0.2s ease;"
                    title="${lang==='ur'?'ٹیپ کریں':lang==='hi'?'टैप करें':'tap to reveal'}">
                <span style="color:var(--gold);font-size:0.9em;line-height:1;
                             border-bottom:1.5px dashed var(--border-gold);
                             padding-bottom:2px;">${firstLetter}</span>
                <span style="font-size:0.35em;color:var(--ink-3);
                             margin-top:3px;letter-spacing:0.05em;">
                  ···
                </span>
              </span>
            `;
          }).join('')}
        </div>
      </div>

      <!-- Progress dots -->
      <div style="display:flex;justify-content:center;gap:5px;margin-bottom:20px;">
        ${words.map((_, i) => `
          <div style="width:7px;height:7px;border-radius:50%;
                      background:${revealed.has(i) ? 'var(--gold)' : 'var(--border-mid)'};
                      transition:background 0.25s ease;"></div>
        `).join('')}
      </div>

      <div style="display:flex;flex-direction:column;gap:8px;">
        ${allDone ? `
          <button class="btn btn-primary" onclick="sessPracticeNext()"
                  style="animation:fadeIn 0.3s ease;">
            ${lang==='ur'?'اگلا مشق':lang==='hi'?'अगली मश्क़':'Next practice'} →
          </button>
        ` : `
          <button class="btn btn-secondary" onclick="flRevealAll()"
                  style="font-size:0.8125rem;">
            ${lang==='ur'?'سب ظاہر کریں':lang==='hi'?'सब दिखाएं':'Reveal all'}
          </button>
        `}
        <button class="btn btn-ghost" style="text-align:center;color:var(--ink-3);"
                onclick="sessPlayAudio()">
          ▶ ${t('listenAgain', lang)}
        </button>
      </div>
    </div>
  `;
}

// Extract first base Arabic letter from a word (skip leading diacritics)
function _getFirstLetter(word) {
  for (const ch of word) {
    const cp = ch.codePointAt(0);
    // Arabic letter range U+0600–U+06FF, also includes alef wasla U+0671
    if ((cp >= 0x0600 && cp <= 0x06FF) && !_isDiacritic(cp)) {
      return ch;
    }
  }
  return word[0] || '؟';
}

function _isDiacritic(cp) {
  // Tashkeel / harakat / quranic marks
  return (cp >= 0x064B && cp <= 0x065F) ||
         (cp >= 0x0610 && cp <= 0x061A) ||
         (cp >= 0x06D6 && cp <= 0x06DC) ||
         (cp >= 0x06DF && cp <= 0x06E8) ||
         (cp >= 0x06EA && cp <= 0x06ED) ||
         cp === 0x0670;
}

// Practice C — Listen & Repeat
function _practiceListenRepeat() {
  const lang = S.lang;
  return `
    <div style="padding:20px 20px 100px;">
      <div class="stage-label">🎧 ${t('stagePractice', lang)} · 5/5</div>

      <div style="font-family:var(--font-display);font-size:1rem;color:var(--ink);
                  margin-bottom:20px;">
        ${lang==='ur'?'سنیں اور دہرائیں':lang==='hi'?'सुनें और दोहराएं':'Listen, then recite from memory'}
      </div>

      <!-- Covered ayah — revealed on demand -->
      <div style="background:var(--bg-elevated);border:1px solid var(--border-gold);
                  border-radius:var(--r-lg);padding:24px 20px;margin-bottom:16px;
                  text-align:right;min-height:120px;position:relative;">

        <div id="lr-cover"
             style="position:absolute;inset:0;border-radius:var(--r-lg);
                    background:var(--bg-elevated);display:flex;
                    align-items:center;justify-content:center;
                    cursor:pointer;border:1px solid var(--border-gold);"
             onclick="lrReveal()">
          <div style="text-align:center;">
            <div style="font-size:1.5rem;margin-bottom:8px;">👁️</div>
            <div style="font-size:0.8125rem;color:var(--ink-3);">
              ${lang==='ur'?'آیت دیکھنے کے لیے ٹیپ کریں':lang==='hi'?'आयत देखने के लिए टैप करें':'Tap to reveal ayah'}
            </div>
          </div>
        </div>

        <div class="ayah-arabic" lang="ar" dir="rtl"
             style="font-size:clamp(20px,4vw,28px);line-height:2.4;text-align:right;">
          ${_getAyahText(S.ayah)}
        </div>
      </div>

      <!-- Controls -->
      <div style="display:flex;gap:10px;margin-bottom:16px;">
        <button onclick="sessPlayAudio()"
                style="flex:1;padding:14px;border-radius:var(--r-md);
                       border:1px solid var(--border-gold);background:var(--gold-dim);
                       color:var(--gold);font-family:var(--font-body);
                       font-size:0.9375rem;cursor:pointer;">
          ▶ ${t('listenAgain', lang)}
        </button>
      </div>

      <button class="btn btn-primary" onclick="sessPracticeNext()">
        ${lang==='ur'?'آخری مرحلہ':lang==='hi'?'आख़िरी पड़ाव':'Final test'} →
      </button>
      <button class="btn btn-ghost" style="text-align:center;color:var(--ink-3);margin-top:6px;"
              onclick="sessPlayAudio()">
        ${t('listenAgain', lang)}
      </button>
    </div>
  `;
}

// ── PRACTICE D — Repetition Counter ─────────────────────────
// Classical hifz method: recite the ayah N times, counting each
// repetition. Bead ring fills gold as reps complete.
// Flow: 'pick' phase → student selects count → 'reciting' phase
//       → each rep: listen + recite + tap ✓ → ring fills → seal unlocks
function _practiceRep() {
  const lang   = S.lang;
  const phase  = S._repPhase;
  const target = S._repTarget;
  const done   = S._repDone;

  // ── Phase 1: Pick rep count ───────────────────────────────
  if (phase === 'pick') {
    const opts = [3, 5, 7, 10];
    return `
      <div style="padding:20px 20px 100px;">
        <div class="stage-label">🔁 ${t('repModeTitle', lang)}</div>
        <div style="font-size:0.6875rem;color:var(--ink-3);margin-bottom:16px;">4/5</div>

        <div style="font-family:var(--font-display);font-size:1.0625rem;
                    color:var(--ink);margin-bottom:6px;font-weight:500;">
          ${lang==='ur'?'جتنی بار دہرائیں، اتنا پکا ہوگا':lang==='hi'?'जितना दोहराएं, उतना पक्का होगा':'Drill it until it sits in your chest'}
        </div>
        <div style="font-size:0.875rem;color:var(--ink-3);margin-bottom:28px;
                    line-height:1.6;">
          ${t('repPickPrompt', lang)}
        </div>

        <!-- Rep count selector — pill buttons -->
        <div style="display:flex;gap:10px;justify-content:center;
                    flex-wrap:wrap;margin-bottom:32px;">
          ${opts.map(n => `
            <button
              onclick="repSetTarget(${n})"
              class="rep-count-btn ${n === target ? 'rep-count-active' : ''}"
              data-count="${n}">
              <span class="rep-count-num">${n}</span>
              <span class="rep-count-label">${t('repTimes', lang)}</span>
            </button>
          `).join('')}
        </div>

        <!-- Ayah preview -->
        <div style="background:var(--bg-elevated);border:1px solid var(--border-gold);
                    border-radius:var(--r-lg);padding:20px;margin-bottom:24px;
                    text-align:right;">
          <div class="ayah-arabic" lang="ar" dir="rtl"
               style="font-size:clamp(20px,4vw,26px);line-height:2.4;text-align:right;">
            ${_getAyahText(S.ayah)}
          </div>
        </div>

        <button class="btn btn-primary" onclick="repBegin()">
          ${t('repStart', lang)} →
        </button>
        <button class="btn btn-ghost" style="text-align:center;color:var(--ink-3);
                margin-top:8px;" onclick="sessPlayAudio()">
          ▶ ${t('listenAgain', lang)}
        </button>
      </div>
    `;
  }

  // ── Phase 2: Reciting — bead ring + controls ──────────────
  const allDone  = done >= target;
  const beads    = _buildBeadRing(done, target);
  const repLabel = `${done} / ${target}`;

  return `
    <div style="padding:20px 20px 100px;">
      <div class="stage-label">🔁 ${t('repModeTitle', lang)}</div>
        <div style="font-size:0.6875rem;color:var(--ink-3);margin-bottom:16px;">4/5</div>

      <!-- Bead ring + counter -->
      <div style="display:flex;flex-direction:column;align-items:center;
                  margin-bottom:24px;">

        <div class="bead-ring-wrap" aria-label="${repLabel} ${t('repCount', lang)}">
          ${beads}
        </div>

        <div style="margin-top:12px;font-family:var(--font-display);
                    font-size:2rem;color:${allDone ? 'var(--gold)' : 'var(--ink)'};
                    font-weight:400;transition:color 0.3s ease;">
          ${done}<span style="font-size:1.125rem;color:var(--ink-3);margin:0 4px;">/</span>${target}
        </div>
        <div style="font-size:0.75rem;color:var(--ink-3);letter-spacing:0.04em;
                    text-transform:uppercase;margin-top:2px;">
          ${t('repCount', lang)}
        </div>
      </div>

      <!-- Ayah display -->
      <div style="background:var(--bg-elevated);border:1px solid var(--border-gold);
                  border-radius:var(--r-lg);padding:20px;margin-bottom:20px;
                  text-align:right;">
        <div class="ayah-arabic" lang="ar" dir="rtl"
             style="font-size:clamp(20px,4vw,26px);line-height:2.4;text-align:right;">
          ${_getAyahText(S.ayah)}
        </div>
      </div>

      <!-- Controls -->
      <div style="display:flex;gap:10px;margin-bottom:12px;">
        <button onclick="sessPlayAudio()"
                style="flex:1;padding:13px;border-radius:var(--r-md);
                       border:1px solid var(--border-gold);background:var(--gold-dim);
                       color:var(--gold);font-family:var(--font-body);
                       font-size:0.9375rem;cursor:pointer;">
          ▶ ${t('listenAgain', lang)}
        </button>
      </div>

      ${allDone ? `
        <!-- All reps done — seal unlocks -->
        <div style="background:var(--gold-dim);border:1px solid var(--border-gold-strong);
                    border-radius:var(--r-md);padding:12px 16px;
                    margin-bottom:12px;text-align:center;
                    animation:fadeIn 0.4s ease;">
          <div style="font-size:0.8125rem;color:var(--gold);font-weight:600;
                      margin-bottom:4px;">
            ${t('repComplete', lang)} ✓
          </div>
        </div>
        <button class="btn btn-primary" onclick="sessPracticeNext()"
                style="animation:xpPop 0.4s var(--ease-spring);">
          ${t('repSeal', lang)} →
        </button>
        <button class="btn btn-ghost"
                style="text-align:center;color:var(--ink-3);margin-top:8px;"
                onclick="repAddOne()">
          ${t('repAgain', lang)}
        </button>
      ` : `
        <!-- Reciting — tap ✓ after each recitation -->
        <button class="btn btn-primary rep-confirm-btn"
                onclick="repConfirm()"
                style="font-size:1.125rem;padding:16px;">
          ✓ &nbsp;${lang==='ur'?'پڑھ لیا':lang==='hi'?'पढ़ लिया':'Recited'}
        </button>
        <div style="text-align:center;margin-top:10px;font-size:0.75rem;
                    color:var(--ink-3);">
          ${lang==='ur'?'آیت پڑھ کر ✓ دبائیں'
            : lang==='hi'?'आयत पढ़ें, फिर ✓ दबाएं'
            : 'Recite the ayah, then tap ✓'}
        </div>
      `}
    </div>
  `;
}

// Builds a bead ring SVG — arced dots, filled gold up to `done` count
function _buildBeadRing(done, total) {
  const R = 72;          // ring radius
  const CX = 90, CY = 90;
  const beadR = 7;
  const cap   = Math.min(total, 14); // max 14 beads shown regardless of rep count
  const step  = (2 * Math.PI) / cap;
  const startAngle = -Math.PI / 2; // 12 o'clock

  let beads = '';
  for (let i = 0; i < cap; i++) {
    const angle  = startAngle + i * step;
    const x      = CX + R * Math.cos(angle);
    const y      = CY + R * Math.sin(angle);
    // Scale done into cap positions
    const filled = i < Math.round((done / total) * cap);
    const color  = filled ? 'var(--gold)' : 'var(--border-mid)';
    const r      = filled ? beadR + 1 : beadR;
    beads += `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${r}"
      fill="${color}" style="transition:all 0.35s ease;" />`;
  }

  // Centre text: rep number
  const displayNum = done > 0 ? done : '';
  return `
    <svg class="bead-ring" width="180" height="180" viewBox="0 0 180 180"
         xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <!-- Track ring -->
      <circle cx="${CX}" cy="${CY}" r="${R}"
        fill="none" stroke="var(--border-mid)" stroke-width="1.5"
        stroke-dasharray="4 6" />
      ${beads}
    </svg>
  `;
}


// ── MISTAKE HEATMAP ───────────────────────────────────────────
// Renders the current ayah's words with heat tinting based on
// how many times each word was missed in Fill-the-Blank.
//
// Heat scale (mistake count → visual treatment):
//   0 → normal ink color
//   1 → soft amber tint + light underline
//   2 → warm orange + medium underline
//   3+ → red-amber + bold underline + slight scale
//
// Shown in the Seal stage only when at least one mistake exists.
function _renderHeatmap(lang) {
  const mistakes = getMistakes(S.surahNum, S.ayahNum);
  const hasAny   = Object.keys(mistakes).length > 0;
  if (!hasAny) return ''; // nothing to show — clean run

  const maxCount = Math.max(...Object.values(mistakes));

  const wordSpans = S.words.map((word, idx) => {
    const count = mistakes[idx] || 0;
    if (count === 0) {
      return `<span style="color:var(--ink-arabic);">${word}</span>`;
    }

    // Heat intensity 0–1
    const heat = Math.min(count / Math.max(maxCount, 3), 1);

    // Interpolate: amber (1 mistake) → red-orange (3+ mistakes)
    // Using CSS custom props isn't possible inline with dynamic values,
    // so we use hardcoded heat palette that works on both light/dark.
    let color, borderBottom, transform;
    if (count === 1) {
      color        = '#d4a017';        // amber
      borderBottom = '2px solid #d4a01766';
      transform    = '';
    } else if (count === 2) {
      color        = '#e07b2a';        // orange
      borderBottom = '2px solid #e07b2a99';
      transform    = '';
    } else {
      color        = '#c94040';        // red
      borderBottom = '2.5px solid #c94040bb';
      transform    = 'scale(1.06)';
    }

    // Badge: show mistake count as a small superscript
    const badge = `<sup style="font-size:0.45em;vertical-align:super;
                               opacity:0.8;font-family:var(--font-body);
                               font-weight:700;">${count}</sup>`;

    return `<span style="color:${color};border-bottom:${borderBottom};
                          display:inline-block;transform:${transform};
                          transition:all 0.2s ease;padding-bottom:1px;"
                  title="${count} ${lang==='ur'?'غلطی':lang==='hi'?'ग़लती':'mistake'}${count>1?'s':''}"
            >${word}${badge}</span>`;
  });

  return `
    <div style="background:var(--bg-elevated);
                border:1px solid var(--border-mid);
                border-radius:var(--r-md);
                padding:14px 16px;margin-bottom:12px;">

      <!-- Header -->
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:10px;">
        <span style="font-size:1rem;">🌡</span>
        <div>
          <div style="font-size:0.6875rem;color:var(--ink-2);font-weight:600;
                      letter-spacing:0.05em;text-transform:uppercase;">
            ${lang==='ur'?'غلطیوں کا نقشہ':lang==='hi'?'ग़लतियों का नक़्शा':'Mistake Heatmap'}
          </div>
          <div style="font-size:0.75rem;color:var(--ink-3);">
            ${lang==='ur'?'لال = زیادہ غلطیاں، سنہری = کم':
              lang==='hi'?'लाल = ज़्यादा ग़लती, सुनहरा = कम':
              'Red = more mistakes · Amber = fewer'}
          </div>
        </div>
      </div>

      <!-- Ayah with heat tinting -->
      <div class="ayah-arabic" lang="ar" dir="rtl"
           style="font-size:clamp(20px,4vw,28px);line-height:2.6;
                  text-align:right;display:flex;flex-wrap:wrap;
                  gap:4px 8px;justify-content:flex-end;align-items:baseline;">
        ${wordSpans.join(' ')}
      </div>

      <!-- Legend -->
      <div style="display:flex;gap:12px;justify-content:flex-end;
                  margin-top:10px;flex-wrap:wrap;">
        ${[...new Set(Object.values(mistakes))].sort().map(n => {
          const col = n===1?'#d4a017':n===2?'#e07b2a':'#c94040';
          const label = n===1
            ? (lang==='ur'?'1 غلطی':lang==='hi'?'1 ग़लती':'1 mistake')
            : (lang==='ur'?`${n} غلطیاں`:lang==='hi'?`${n} ग़लतियाँ`:`${n} mistakes`);
          return `<span style="font-size:0.6875rem;color:${col};
                               display:flex;align-items:center;gap:4px;">
                    <span style="display:inline-block;width:8px;height:8px;
                                 border-radius:50%;background:${col};"></span>
                    ${label}
                  </span>`;
        }).join('')}
      </div>
    </div>
  `;
}

// ── CHUNK & CHAIN ─────────────────────────────────────────────
// After sealing ayah N (where N ≥ 2), challenge the student to
// recite the full run: ayah 1 → ayah N from memory.
//
// We display first-letter cues for each ayah in sequence,
// separated by a thin divider. The student recites mentally,
// then taps ✓ to confirm and earn bonus XP.
//
// Ayah texts are pulled from localStorage (cached there by _renderSeal).
// Falls back to "·····" if an earlier ayah text isn't cached yet.
//
// Called inline from _renderSeal — pure render function, no side effects.
function _renderChainCard(lang) {
  const surahNum  = S.surahNum;
  const upToAyah  = S.ayahNum;
  const revealed  = S._chainRevealed;

  // Build rows for ayahs 1 → upToAyah
  const rows = [];
  for (let a = 1; a <= upToAyah; a++) {
    const text  = localStorage.getItem(`mahfooz_ayah_text_${surahNum}_${a}`) || '';
    const words = text.trim().split(/\s+/).filter(Boolean);

    if (!words.length) {
      rows.push(`
        <div style="display:flex;align-items:baseline;gap:6px;
                    flex-wrap:wrap;justify-content:flex-end;
                    opacity:0.35;font-size:0.75rem;color:var(--ink-3);">
          <span style="min-width:1.4em;text-align:center;">${a}</span>
          <span style="letter-spacing:0.2em;">·····</span>
        </div>`);
    } else if (revealed) {
      // Full Arabic text
      rows.push(`
        <div style="display:flex;align-items:baseline;gap:8px;
                    flex-wrap:wrap;justify-content:flex-end;">
          <span style="font-size:0.625rem;color:var(--ink-3);
                       min-width:1.4em;text-align:center;flex-shrink:0;">${a}</span>
          <div class="ayah-arabic" lang="ar" dir="rtl"
               style="font-size:clamp(20px,4vw,28px);line-height:2.4;
                      text-align:right;color:var(--ink-arabic);flex:1;">
            ${words.join(' ')}
          </div>
        </div>`);
    } else {
      // First-letter cues
      const cues = words.map(w => _getFirstLetter(w)).join(' ');
      rows.push(`
        <div style="display:flex;align-items:baseline;gap:8px;
                    flex-wrap:wrap;justify-content:flex-end;">
          <span style="font-size:0.625rem;color:var(--ink-3);
                       min-width:1.4em;text-align:center;flex-shrink:0;">${a}</span>
          <div class="ayah-arabic" lang="ar" dir="rtl"
               style="font-size:clamp(18px,3.5vw,24px);line-height:2.2;
                      text-align:right;color:var(--gold);
                      letter-spacing:0.12em;flex:1;">
            ${cues}
          </div>
        </div>`);
    }

    if (a < upToAyah) {
      rows.push(`<div style="border-top:1px solid var(--border-mid);margin:2px 0;"></div>`);
    }
  }

  return `
    <div style="background:var(--bg-elevated);
                border:1px solid var(--border-gold);
                border-radius:var(--r-lg);
                padding:16px 18px;margin-bottom:4px;">

      <!-- Header -->
      <div style="display:flex;align-items:center;justify-content:space-between;
                  margin-bottom:12px;">
        <div>
          <div style="font-size:0.6875rem;color:var(--gold);font-weight:600;
                      letter-spacing:0.06em;text-transform:uppercase;margin-bottom:2px;">
            🔗 ${lang==='ur'?'سلسلہ تلاوت':lang==='hi'?'चेन तिलावत':'Chunk & Chain'}
          </div>
          <div style="font-size:0.8125rem;color:var(--ink-3);line-height:1.5;">
            ${lang==='ur'
              ? `آیت 1 سے ${upToAyah} تک مسلسل پڑھیں`
              : lang==='hi'
              ? `आयत 1 से ${upToAyah} तक एक साथ पढ़ें`
              : `Recite ayah 1 through ${upToAyah} in one run`}
          </div>
        </div>
        <div style="font-size:0.75rem;color:var(--gold);font-weight:600;
                    background:var(--gold-dim);border-radius:var(--r-pill);
                    padding:4px 10px;white-space:nowrap;">
          +${XP.CHAIN_BONUS || 5} XP
        </div>
      </div>

      <!-- Ayah rows -->
      <div style="display:flex;flex-direction:column;gap:6px;margin-bottom:10px;">
        ${rows.join('')}
      </div>

      <!-- Reveal / hide toggle -->
      <div style="text-align:center;margin-bottom:14px;">
        <button onclick="chainToggleReveal()"
                style="font-size:0.8125rem;color:var(--gold);
                       background:transparent;border:1px solid var(--border-gold);
                       border-radius:var(--r-pill);padding:5px 16px;
                       font-family:var(--font-body);cursor:pointer;">
          ${revealed
            ? (lang==='ur'?'🔤 اشارے دکھائیں':lang==='hi'?'🔤 संकेत दिखाएं':'🔤 Show cues')
            : (lang==='ur'?'👁 پوری آیت دیکھیں':lang==='hi'?'👁 पूरी आयत देखें':'👁 Reveal full text')}
        </button>
      </div>

      <!-- Instruction -->
      <div style="font-size:0.75rem;color:var(--ink-3);text-align:center;
                  margin-bottom:14px;line-height:1.6;">
        ${revealed
          ? (lang==='ur'?'آیت پڑھیں، پھر ✓ دبائیں'
             :lang==='hi'?'आयत पढ़ें, फिर ✓ दबाएं'
             :'Read the ayah, then tap ✓')
          : (lang==='ur'?'ہر آیت کے پہلے حروف دیے ہیں۔ پوری آیت دل میں پڑھیں، پھر ✓ دبائیں'
             :lang==='hi'?'हर आयत के पहले हर्फ़ दिए हैं। मन में पढ़ें, फिर ✓ दबाएं'
             :'First letters given as cues. Recite in your mind, then tap ✓')}
      </div>

      <!-- Action buttons -->
      <div style="display:flex;gap:8px;">
        <button class="btn btn-primary" onclick="chainConfirm()"
                style="flex:1;font-size:1rem;padding:14px;">
          ✓ &nbsp;${lang==='ur'?'پڑھ لیا':lang==='hi'?'पढ़ लिया':'Done reciting'}
        </button>
        <button onclick="chainSkip()"
                style="padding:14px 16px;border-radius:var(--r-md);
                       border:1px solid var(--border-mid);
                       background:transparent;color:var(--ink-3);
                       font-family:var(--font-body);font-size:0.8125rem;
                       cursor:pointer;">
          ${lang==='ur'?'چھوڑیں':lang==='hi'?'छोड़ें':'Skip'}
        </button>
      </div>
    </div>
  `;
}

// ── STAGE 5 — SEAL ────────────────────────────────────────────
function _renderSeal() {
  const lang = S.lang;

  // Award XP and update progress
  const progress = sealAyah(S.surahNum, S.ayahNum, 'surah');
  const xpGained = progress.review_count === 0 ? XP.SEAL_AYAH : XP.REVIEW_AYAH;
  S.xpEarned += xpGained;
  addXP(xpGained);
  updateStreak();

  // Cache current position for HomeScreen living ayah display.
  // We write the SEALED ayah here — the living ayah card shows what was just memorised.
  // Navigation (Continue / startSurah) uses getNextAyahForSurah() separately.
  localStorage.setItem('mahfooz_current_surah', String(S.surahNum));
  localStorage.setItem('mahfooz_current_ayah',  String(S.ayahNum));
  const arabicText = _getAyahText(S.ayah);
  localStorage.setItem(`mahfooz_ayah_text_${S.surahNum}_${S.ayahNum}`, arabicText);
  ['en','hi','ur'].forEach(l => {
    const tr = S.ayah[`translation_${l}`] || '';
    if (tr) localStorage.setItem(`mahfooz_ayah_trans_${S.surahNum}_${S.ayahNum}_${l}`, tr);
  });
  // Cache surahs data for HomeScreen name lookup
  if (!localStorage.getItem('mahfooz_surahs_cache') && window._surahsCache) {
    localStorage.setItem('mahfooz_surahs_cache', JSON.stringify(window._surahsCache));
  }
  // Update sidebar stats
  window.updateSidebarStats?.();
  _updateProgress();

  const surahName = S.ayah.surah_name?.[lang] || '';

  return `
    <div style="padding:24px 20px 100px;display:flex;flex-direction:column;
                align-items:center;text-align:center;">

      <!-- Seal animation -->
      <div style="width:80px;height:80px;border-radius:50%;
                  border:2px solid var(--gold);background:var(--gold-dim);
                  display:flex;align-items:center;justify-content:center;
                  font-size:2.5rem;margin-bottom:20px;
                  animation:sealPulse 2s ease-in-out infinite;">
        ✓
      </div>

      <div style="font-family:var(--font-display);font-size:1.75rem;font-weight:400;
                  color:var(--ink);margin-bottom:8px;">
        ${t('sealTitle', lang)}
      </div>

      <div style="font-size:0.9375rem;color:var(--ink-3);line-height:1.7;
                  max-width:280px;margin-bottom:24px;">
        ${t('sealMessage', lang)}
      </div>

      <!-- XP badge -->
      <div style="display:inline-flex;align-items:center;gap:8px;
                  background:var(--gold-dim);border:1px solid var(--border-gold-strong);
                  border-radius:var(--r-pill);padding:8px 20px;margin-bottom:24px;
                  animation:xpPop 0.5s var(--ease-spring);">
        <span style="color:var(--gold);font-size:1.125rem;">✦</span>
        <span style="font-family:var(--font-display);font-size:1.25rem;color:var(--gold);
                     font-weight:400;">+${xpGained} XP</span>
      </div>

      <!-- Sealed ayah -->
      <div style="background:var(--bg-elevated);border:1px solid var(--border-gold);
                  border-radius:var(--r-lg);padding:20px;width:100%;
                  margin-bottom:20px;text-align:right;">
        <div class="ayah-arabic" lang="ar" dir="rtl"
             style="font-size:22px;line-height:2.2;text-align:right;margin-bottom:8px;">
          ${_getAyahText(S.ayah)}
        </div>
        <div style="font-size:0.75rem;color:var(--ink-3);
                    ${lang==='ur'?'text-align:right;':''}">
          ${surahName}
        </div>
      </div>

      <!-- Mistake Heatmap — shown only when mistakes exist -->
      ${_renderHeatmap(lang)}

      <!-- Chunk & Chain + Next ayah or reflect -->
      <div style="width:100%;display:flex;flex-direction:column;gap:10px;">

        ${/* ── Chunk & Chain — only when there are previous ayahs to chain */ ''}
        ${S.ayahNum >= 2 && S._chainPhase !== 'done' ? _renderChainCard(lang) : ''}

        ${/* ── Bonus XP flash after chain completion */ ''}
        ${S._chainPhase === 'done' ? `
          <div style="background:var(--gold-dim);border:1px solid var(--border-gold-strong);
                      border-radius:var(--r-md);padding:10px 16px;
                      display:flex;align-items:center;justify-content:center;gap:8px;
                      animation:xpPop 0.4s var(--ease-spring);">
            <span style="color:var(--gold);font-size:1rem;">🔗</span>
            <span style="font-family:var(--font-display);color:var(--gold);font-size:1rem;">
              +${XP.CHAIN_BONUS || 5} XP &nbsp;·&nbsp;
              ${lang==='ur'?'سلسلہ مکمل':lang==='hi'?'चेन मुकम्मल':'Chain complete'}
            </span>
          </div>
        ` : ''}

        ${S.ayahNum < (S.surahData?.ayat || 1) ? `
          <button class="btn btn-primary"
                  ${S.ayahNum >= 2 && S._chainPhase !== 'done' ? 'style="display:none;"' : ''}
                  id="next-ayah-btn"
                  onclick="sessNextAyah()">
            ${lang==='ur'?'اگلی آیت':lang==='hi'?'अगली आयत':'Next Ayah'} →
          </button>
        ` : `
          <button class="btn btn-primary"
                  ${S.ayahNum >= 2 && S._chainPhase !== 'done' ? 'style="display:none;"' : ''}
                  id="next-ayah-btn"
                  onclick="sessSurahComplete()">
            ${lang==='ur'?'سورہ مکمل! 🎉':lang==='hi'?'सूरह मुकम्मल! 🎉':'Surah Complete! 🎉'}
          </button>
        `}

        <button class="btn btn-secondary"
                onclick="openReflection(${S.surahNum},${S.ayahNum},${JSON.stringify(S.ayah).replace(/'/g,'\\x27')});exitSession();">
          ✍ ${t('reflectionBtn', lang)}
        </button>

        <button class="btn btn-ghost" style="text-align:center;color:var(--ink-3);"
                onclick="showScreen('home')">
          ${t('navHome', lang)}
        </button>
      </div>
    </div>
  `;
}

// ── Swipe Navigation ─────────────────────────────────────────
// Left swipe  → advance (sessNext / sessWordNext depending on stage)
// Right swipe → exit prompt (on stage 0) or go back (Learn word-back)
// Rules:
//   • Min 50px horizontal delta, must be more horizontal than vertical
//   • Ignored if touch started on a .q-word (long-press handler owns those)
//   • Ignored if user is scrolling vertically (dy > dx after 10px)
//   • Exit swipe shows a 2s toast confirm — second right-swipe within 2s exits

let _exitPrimed = false;
let _exitPrimedTimer = null;

function _initSwipe() {
  const body = document.getElementById('sess-body');
  if (!body) return;

  let x0 = 0, y0 = 0, onWord = false, cancelled = false;

  body.addEventListener('touchstart', e => {
    const t = e.touches[0];
    x0 = t.clientX;
    y0 = t.clientY;
    cancelled = false;
    // Don't hijack touches that start on Arabic words (long-press owns them)
    onWord = !!e.target.closest('.q-word');
  }, { passive: true });

  body.addEventListener('touchmove', e => {
    if (cancelled || onWord) return;
    const dx = Math.abs(e.touches[0].clientX - x0);
    const dy = Math.abs(e.touches[0].clientY - y0);
    // If clearly scrolling vertically, cancel swipe detection
    if (dy > dx && dy > 10) cancelled = true;
  }, { passive: true });

  body.addEventListener('touchend', e => {
    if (cancelled || onWord) return;
    const dx = e.changedTouches[0].clientX - x0;
    const dy = e.changedTouches[0].clientY - y0;
    const adx = Math.abs(dx), ady = Math.abs(dy);

    // Must be primarily horizontal and at least 50px
    if (adx < 50 || ady > adx) return;

    if (dx < 0) {
      // ── Left swipe → advance ──────────────────────────────
      if (S.stage === 1) {
        // Learn stage: swipe through words
        window.sessWordNext();
      } else if (S.stage === 2) {
        // Practice: advance technique
        window.sessPracticeNext();
      } else if (S.stage < 4) {
        // Listen (0), Seal (3) — go to next stage
        window.sessNext();
      }
      // Stage 4 (Reflect) — no swipe action, user fills the form
    } else {
      // ── Right swipe → back / exit ─────────────────────────
      if (S.stage === 1 && S.wordIdx > 0) {
        // Learn stage: go back a word
        window.sessWordBack();
      } else if (S.stage === 0 || S.stage >= 3) {
        // On Listen or Seal+ — prime exit, second swipe exits
        if (_exitPrimed) {
          clearTimeout(_exitPrimedTimer);
          _exitPrimed = false;
          window.exitSession();
        } else {
          _exitPrimed = true;
          _showSwipeToast(S.lang);
          _exitPrimedTimer = setTimeout(() => { _exitPrimed = false; }, 2000);
        }
      }
    }
  }, { passive: true });
}

function _showSwipeToast(lang) {
  const msg = lang === 'ur' ? 'باہر جانے کے لیے دوبارہ سوائپ کریں ←'
             : lang === 'hi' ? 'बाहर जाने के लिए दोबारा स्वाइप करें ←'
             : 'Swipe right again to exit ←';
  let toast = document.getElementById('sess-swipe-toast');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'sess-swipe-toast';
    toast.style.cssText = `
      position:fixed;bottom:90px;left:50%;transform:translateX(-50%);
      background:var(--bg-overlay);border:1px solid var(--border);
      border-radius:var(--r-pill);padding:10px 20px;
      font-size:0.8125rem;color:var(--ink-2);
      z-index:999;pointer-events:none;
      animation:fadeInUp 0.2s ease;
      white-space:nowrap;
      backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px);
    `;
    document.body.appendChild(toast);
  }
  toast.textContent = msg;
  toast.style.display = 'block';
  setTimeout(() => { if (toast) toast.style.display = 'none'; }, 2000);
}

// ── Surah Completion ──────────────────────────────────────────

// Called when the last ayah of a surah is sealed and the user taps the
// "Surah Complete" button. Awards COMPLETE_SURAH XP then shows the dua screen.
window.sessSurahComplete = function() {
  addXP(XP.COMPLETE_SURAH);
  S.xpEarned += XP.COMPLETE_SURAH;
  const body = document.getElementById('sess-body');
  if (body) {
    body.scrollTop = 0;
    body.innerHTML = _renderSurahComplete();
  }
};

function _renderSurahComplete() {
  const lang = S.lang;
  const surahName = S.surahData?.name_ar || '';
  const surahNameLatin = S.surahData?.[`name_${lang}`] || S.surahData?.name_en || '';

  // Dua for hifz — trilingual
  const duaAr   = 'اللَّهُمَّ ارْزُقْنِي حِفْظَ كِتَابِكَ';
  const duaTrans = lang === 'ur'
    ? 'اے اللہ! مجھے اپنی کتاب حفظ کرنے کی توفیق عطا فرما'
    : lang === 'hi'
    ? 'ऐ अल्लाह! मुझे अपनी किताब हिफ़्ज़ करने की तौफ़ीक़ अता फ़रमा'
    : 'O Allah, bless me with the memorisation of Your Book';

  const duaTranslit = 'Allāhumma-rzuqnī ḥifẓa kitābik';

  const heading = lang === 'ur'
    ? `${surahNameLatin || surahName} مکمل`
    : lang === 'hi'
    ? `${surahNameLatin} मुकम्मल`
    : `${surahNameLatin} Complete`;

  const subText = lang === 'ur'
    ? 'آپ نے یہ سورہ یاد کر لی۔ اللہ آپ کو ثابت رکھے۔'
    : lang === 'hi'
    ? 'आपने यह सूरह हिफ़्ज़ कर ली। अल्लाह आपको पक्का रखे।'
    : 'You have memorised this surah. May Allah keep it firm in your heart.';

  const xpLabel = lang === 'ur'
    ? 'سورہ مکمل'
    : lang === 'hi'
    ? 'सूरह मुकम्मल'
    : 'Surah Complete';

  const nextLabel = lang === 'ur'
    ? 'اگلی سورہ شروع کریں →'
    : lang === 'hi'
    ? 'अगली सूरह शुरू करें →'
    : 'Begin Next Surah →';

  const homeLabel = t('navHome', lang);

  return `
    <div style="padding:32px 20px 100px;display:flex;flex-direction:column;
                align-items:center;text-align:center;animation:fadeInUp 0.4s ease;">

      <!-- Star burst icon -->
      <div style="font-size:3.5rem;margin-bottom:16px;
                  animation:sealPulse 2.5s ease-in-out infinite;">
        🌟
      </div>

      <!-- Surah name in Arabic calligraphy style -->
      <div class="ayah-arabic" lang="ar" dir="rtl"
           style="font-size:2rem;line-height:1.8;color:var(--gold);
                  margin-bottom:6px;">
        ${surahName}
      </div>

      <!-- Heading -->
      <div style="font-family:var(--font-display);font-size:1.6rem;font-weight:400;
                  color:var(--ink);margin-bottom:8px;
                  ${lang==='ur'?'direction:rtl;':''}">
        ${heading}
      </div>

      <!-- Sub-text -->
      <div style="font-size:0.9375rem;color:var(--ink-3);line-height:1.7;
                  max-width:290px;margin-bottom:28px;
                  ${lang==='ur'?'direction:rtl;text-align:right;':''}">
        ${subText}
      </div>

      <!-- XP badge — COMPLETE_SURAH reward -->
      <div style="display:inline-flex;align-items:center;gap:8px;
                  background:var(--gold-dim);border:1px solid var(--border-gold-strong);
                  border-radius:var(--r-pill);padding:10px 24px;margin-bottom:28px;
                  animation:xpPop 0.5s var(--ease-spring);">
        <span style="color:var(--gold);font-size:1.25rem;">✦</span>
        <span style="font-family:var(--font-display);font-size:1.375rem;color:var(--gold);
                     font-weight:400;">+${XP.COMPLETE_SURAH} XP</span>
        <span style="font-size:0.8125rem;color:var(--gold-muted, var(--gold));
                     opacity:0.8;">· ${xpLabel}</span>
      </div>

      <!-- Dua card -->
      <div style="background:var(--bg-elevated);border:1px solid var(--border-gold);
                  border-radius:var(--r-lg);padding:24px 20px;width:100%;
                  margin-bottom:24px;">

        <div style="font-size:0.75rem;text-transform:uppercase;letter-spacing:0.08em;
                    color:var(--ink-3);margin-bottom:14px;">
          ${lang==='ur'?'حفظ کی دعا':lang==='hi'?'हिफ़्ज़ की दुआ':'Dua for Hifz'}
        </div>

        <!-- Arabic dua -->
        <div class="ayah-arabic" lang="ar" dir="rtl"
             style="font-size:1.5rem;line-height:2.1;text-align:center;
                    color:var(--ink);margin-bottom:10px;">
          ${duaAr}
        </div>

        <!-- Transliteration — shown for EN and HI only -->
        ${lang !== 'ur' ? `
        <div style="font-size:0.8125rem;color:var(--ink-3);font-style:italic;
                    margin-bottom:10px;line-height:1.6;">
          ${duaTranslit}
        </div>
        ` : ''}

        <!-- Translation -->
        <div style="font-size:0.9375rem;color:var(--ink-2);line-height:1.7;
                    ${lang==='ur'?'direction:rtl;text-align:right;':''}">
          ${duaTrans}
        </div>
      </div>

      <!-- CTA buttons -->
      <div style="width:100%;display:flex;flex-direction:column;gap:10px;">
        <button class="btn btn-primary" onclick="showScreen('memorize')">
          ${nextLabel}
        </button>
        <button class="btn btn-ghost" style="text-align:center;color:var(--ink-3);"
                onclick="showScreen('home')">
          ${homeLabel}
        </button>
      </div>

    </div>
  `;
}

// ── Helpers ───────────────────────────────────────────────────

// Hydrates the #tj-ayah-words container in the Listen stage with tajweed colors.
// Called by _renderStage() after innerHTML is set, so the DOM node exists.
// Strategy: if S._tajweed is already resolved, swap immediately.
// If it's still loading (first time), wait up to 600ms then swap.
async function _hydrateTajweedWords() {
  const container = document.getElementById('tj-ayah-words');
  if (!container) return;

  // If pre-fetch hasn't resolved yet, wait a beat
  if (!S._tajweed) {
    await new Promise(r => setTimeout(r, 300));
  }
  // Still null → no annotations for this ayah; leave plain text
  if (!S._tajweed) return;
  // Guard: user may have navigated away while we waited
  if (!document.getElementById('tj-ayah-words')) return;

  try {
    // buildTajweedAyah sets window._mahfoozNewDiscoveries as a side effect
    const html = await buildTajweedAyah(S.surahNum, S.ayahNum, S.words);
    const el = document.getElementById('tj-ayah-words');
    if (!el) return;
    el.innerHTML = html;

    // ── Discovery flash ───────────────────────────────────────
    // If any tajweed rules were seen for the first time in this ayah,
    // show a brief flash card below the ayah for each new discovery.
    const discoveries = window._mahfoozNewDiscoveries || [];
    if (discoveries.length > 0) {
      const flashContainer = document.getElementById('tj-discovery-flash');
      if (flashContainer) {
        flashContainer.innerHTML = discoveries
          .map(d => renderDiscoveryFlash({ ruleId: d.ruleId, ruleName: d.ruleName }))
          .join('');
        // Auto-dismiss after 4 seconds
        setTimeout(() => {
          if (flashContainer) flashContainer.innerHTML = '';
        }, 4000);
      }
    }
    window._mahfoozNewDiscoveries = [];
  } catch (_) { /* silent — plain words already showing */ }
}

function _buildLivingWords() {
  return S.words.map((word, idx) => `
    <span class="q-word" data-idx="${idx}"
          onclick="window._mahfooz?.onWordTap(${idx},'${encodeURIComponent(word)}',${S.surahNum},${S.ayahNum})"
          oncontextmenu="event.preventDefault();window._mahfooz?.onWordLongPress(${idx},'${encodeURIComponent(word)}',${S.surahNum},${S.ayahNum})"
          onmousedown="window._mhfzLpStart(${idx},'${encodeURIComponent(word)}',${S.surahNum},${S.ayahNum},this)"
          onmouseup="window._mhfzLpCancel()"
          onmouseleave="window._mhfzLpCancel()"
          ontouchstart="window._mhfzLpStart(${idx},'${encodeURIComponent(word)}',${S.surahNum},${S.ayahNum},this)"
          ontouchend="window._mhfzLpCancel()"
          ontouchmove="window._mhfzLpCancel()">
      ${word}
    </span>
  `).join(' ');
}

function _stripDiacritics(s) {
  return s.replace(/[\u064B-\u065F\u0610-\u061A\u06D6-\u06DC\u06DF-\u06E8\u06EA-\u06ED\u0670]/g, '');
}

// Full normalization for alif-index lookup:
// strips diacritics + normalizes alef variants + alef maqsura + ta marbuta
function _normalizeArabic(s) {
  s = _stripDiacritics(s);
  s = s.replace(/[\u0625\u0623\u0622\u0671]/g, '\u0627'); // إأآٱ → ا
  s = s.replace(/\u0649/g, '\u064A');                        // ى → ي
  s = s.replace(/\u0629/g, '\u0647');                        // ة → ه
  s = s.replace(/\u0624/g, '\u0648');                        // ؤ → و
  s = s.replace(/\u0626/g, '\u064A');                        // ئ → ي
  return s;
}

// Alif-index lookup with progressive fallback:
// 1. raw word  2. strip diacritics  3. full normalize
// NOTE: ال-strip fallback removed — causes false matches
// e.g. الملك (sovereignty) wrongly matching ملك → مَلَك (angel)
function _alifLookup(word) {
  if (!window._alifIndex) return null;
  const idx = window._alifIndex;
  return idx[word]
    || idx[_stripDiacritics(word)]
    || idx[_normalizeArabic(word)]
    || null;
}

function _buildOptions(correct, words, blankIdx) {
  const opts = new Set([correct]);
  // Add adjacent words as distractors
  for (let i = 0; i < words.length && opts.size < 4; i++) {
    if (i !== blankIdx) opts.add(words[i]);
  }
  return [...opts].sort(() => Math.random() - 0.5);
}

function _getContextGem(surahNum, ayahNum, lang) {
  const gems = {
    78: {
      type: lang==='ur'?'خبردار':lang==='hi'?'चेतावनी':'Warning',
      text: {
        en: "An-Naba opens with a question the disbelievers argued about — the Day of Resurrection. Allah answers it in 40 ayat of vivid, undeniable imagery.",
        hi: "अन-नबा एक सवाल से शुरू होती है जिस पर काफ़िर बहस करते थे — क़यामत का दिन। अल्लाह ने 40 आयतों में इसका जवाब साफ़ तस्वीरों में दिया।",
        ur: "النبأ ایک سوال سے شروع ہوتی ہے جس پر کافر بحث کرتے تھے — قیامت کا دن۔ اللہ نے 40 آیات میں واضح تصویروں سے جواب دیا۔",
      }
    },
    79: {
      type: lang==='ur'?'آخرت':lang==='hi'?'आख़िरत':'Hereafter',
      text: {
        en: "An-Nazi'at describes the angels who pull out souls at death — some with violent force, some with gentle ease. Your ending depends on how you lived.",
        hi: "अन-नाज़िआत उन फ़रिश्तों का बयान करती है जो मौत पर रूह खींचते हैं — कुछ सख़्ती से, कुछ नरमी से। आपका अंजाम आपकी ज़िंदगी पर निर्भर है।",
        ur: "النازعات ان فرشتوں کا بیان کرتی ہے جو موت پر روح کھینچتے ہیں — کچھ سختی سے، کچھ نرمی سے۔ آپ کا انجام آپ کی زندگی پر منحصر ہے۔",
      }
    },
    80: {
      type: lang==='ur'?'سبق':lang==='hi'?'सबक़':'Lesson',
      text: {
        en: "'Abasa — Allah gently corrected the Prophet ﷺ for turning away from a blind man. Even the best of creation was held to the highest standard of humility.",
        hi: "अबस — अल्लाह ने नबी ﷺ को नरमी से नसीहत की जब वो एक अंधे शख़्स से मुँह फेर गए। मख़्लूक़ात में सबसे बेहतर को भी इन्किसारी के सबसे ऊँचे मेयार पर परखा गया।",
        ur: "عبس — اللہ نے نبی ﷺ کو نرمی سے نصیحت کی جب وہ ایک نابینا سے منہ پھیر گئے۔ مخلوقات میں سب سے بہتر کو بھی انکساری کے اعلیٰ معیار پر پرکھا گیا۔",
      }
    },
    81: {
      type: lang==='ur'?'قیامت':lang==='hi'?'क़यामत':'End Times',
      text: {
        en: "At-Takwir paints the moment the universe folds — the sun darkens, stars fall, mountains vanish. Then comes the only question that matters: what did you send forward?",
        hi: "अत-तकवीर उस लम्हे की तस्वीर खींचती है जब कायनात लपेट दी जाएगी — सूरज बुझेगा, तारे गिरेंगे, पहाड़ उड़ेंगे। फिर बस एक सवाल: तुमने आगे क्या भेजा?",
        ur: "التکویر اس لمحے کی تصویر کھینچتی ہے جب کائنات لپیٹ دی جائے گی — سورج بجھے گا، تارے گریں گے، پہاڑ اڑیں گے۔ پھر بس ایک سوال: تم نے آگے کیا بھیجا؟",
      }
    },
    82: {
      type: lang==='ur'?'محاسبہ':lang==='hi'?'हिसाब':'Reckoning',
      text: {
        en: "Al-Infitar asks: what deceived you about your generous Lord? Every soul will see its record — nothing hidden, nothing lost.",
        hi: "अल-इंफ़ितार सवाल करती है: किस चीज़ ने तुम्हें अपने करीम रब के बारे में धोखे में डाला? हर रूह अपना आमाल नामा देखेगी — कुछ छुपा नहीं, कुछ खोया नहीं।",
        ur: "الانفطار سوال کرتی ہے: کس چیز نے تمہیں اپنے کریم رب کے بارے میں دھوکے میں ڈالا؟ ہر روح اپنا اعمال نامہ دیکھے گی — کچھ چھپا نہیں، کچھ کھویا نہیں۔",
      }
    },
    83: {
      type: lang==='ur'?'انصاف':lang==='hi'?'इंसाफ़':'Justice',
      text: {
        en: "Al-Mutaffifin condemns those who cheat in trade — taking full measure for themselves, giving less to others. Allah sees every transaction, big or small.",
        hi: "अल-मुतफ़्फ़िफ़ीन उन लोगों की मज़म्मत करती है जो तिजारत में धोखा देते हैं — ख़ुद पूरा लेते हैं, दूसरों को कम देते हैं। अल्लाह हर लेन-देन देख रहा है।",
        ur: "المطففین ان لوگوں کی مذمت کرتی ہے جو تجارت میں دھوکہ دیتے ہیں — خود پورا لیتے ہیں، دوسروں کو کم دیتے ہیں۔ اللہ ہر لین دین دیکھ رہا ہے۔",
      }
    },
    84: {
      type: lang==='ur'?'یقین':lang==='hi'?'यक़ीन':'Certainty',
      text: {
        en: "Al-Inshiqaq — the sky will split open, obeying its Lord. The surah ends with a promise: those who believe and do good will receive a reward that never ends.",
        hi: "अल-इंशिक़ाक़ — आसमान फट जाएगा, अपने रब का हुक्म मानते हुए। सूरह इस वादे पर ख़त्म होती है: ईमान वाले और नेक अमल करने वाले बेशुमार अज्र पाएंगे।",
        ur: "الانشقاق — آسمان پھٹ جائے گا، اپنے رب کا حکم مانتے ہوئے۔ سورہ اس وعدے پر ختم ہوتی ہے: ایمان والے اور نیک عمل کرنے والے بے شمار اجر پائیں گے۔",
      }
    },
    85: {
      type: lang==='ur'?'ثبات':lang==='hi'?'सब्र':'Steadfastness',
      text: {
        en: "Al-Buruj — the People of the Trench were burned alive for their faith, yet Allah honoured them forever. Persecution does not erase truth.",
        hi: "अल-बुरूज — खाई वालों को उनके ईमान की वजह से ज़िंदा जलाया गया, लेकिन अल्लाह ने उन्हें हमेशा के लिए सम्मानित किया। ज़ुल्म सच को मिटा नहीं सकता।",
        ur: "البروج — خندق والوں کو ان کے ایمان کی وجہ سے زندہ جلایا گیا، مگر اللہ نے انہیں ہمیشہ کے لیے سرفراز کیا۔ ظلم سچ کو مٹا نہیں سکتا۔",
      }
    },
    86: {
      type: lang==='ur'?'قدرت':lang==='hi'?'क़ुदरत':'Power',
      text: {
        en: "At-Tariq — the piercing star. Allah swears by it to remind us: every soul has a guardian watching over it. You are never truly alone.",
        hi: "अत-तारिक़ — चमकता तारा। अल्लाह उसकी क़सम खाता है हमें याद दिलाने के लिए: हर रूह पर एक निगहबान है। आप कभी अकेले नहीं हैं।",
        ur: "الطارق — چمکتا تارہ۔ اللہ اس کی قسم کھاتا ہے ہمیں یاد دلانے کے لیے: ہر روح پر ایک نگہبان ہے۔ آپ کبھی اکیلے نہیں ہیں۔",
      }
    },
    87: {
      type: lang==='ur'?'تسبیح':lang==='hi'?'तसबीह':'Glorification',
      text: {
        en: "Al-A'la — 'Glorify the name of your Lord, the Most High.' The Prophet ﷺ loved this surah and recited it in Jumu'ah and Eid prayers.",
        hi: "अल-आला — 'अपने सबसे ऊँचे रब के नाम की तसबीह करो।' नबी ﷺ इस सूरह को बहुत पसंद करते थे और जुमे और ईद की नमाज़ में पढ़ते थे।",
        ur: "الاعلیٰ — 'اپنے سب سے بلند رب کے نام کی تسبیح کرو۔' نبی ﷺ اس سورہ کو بہت پسند کرتے تھے اور جمعہ اور عید کی نماز میں پڑھتے تھے۔",
      }
    },
    88: {
      type: lang==='ur'?'یاددہانی':lang==='hi'?'याददिहानी':'Reminder',
      text: {
        en: "Al-Ghashiyah — the Overwhelming Event. On that Day, faces will be either downcast or radiant. Allah asks: do they not look at the camel, the sky, the mountains, the earth?",
        hi: "अल-ग़ाशियह — छा जाने वाली घटना। उस दिन कुछ चेहरे ज़लील होंगे, कुछ चमकते हुए। अल्लाह सवाल करता है: क्या वो ऊँट, आसमान, पहाड़, ज़मीन नहीं देखते?",
        ur: "الغاشیہ — چھا جانے والا واقعہ۔ اس دن کچھ چہرے ذلیل ہوں گے، کچھ چمکتے ہوئے۔ اللہ سوال کرتا ہے: کیا وہ اونٹ، آسمان، پہاڑ، زمین نہیں دیکھتے؟",
      }
    },
    89: {
      type: lang==='ur'?'تاریخ':lang==='hi'?'तारीख़':'History',
      text: {
        en: "Al-Fajr — Allah swears by the dawn and the ten nights. Then He recounts 'Ad, Thamud, and Pharaoh — the mighty who were destroyed. Power without gratitude ends the same way.",
        hi: "अल-फ़ज्र — अल्लाह फ़ज्र और दस रातों की क़सम खाता है। फिर 'आद, समूद और फ़िरऔन का ज़िक्र — वो ताक़तवर जो तबाह हो गए। शुक्रगुज़ारी के बिना ताक़त का एक ही अंजाम होता है।",
        ur: "الفجر — اللہ فجر اور دس راتوں کی قسم کھاتا ہے۔ پھر عاد، ثمود اور فرعون کا ذکر — وہ طاقتور جو تباہ ہو گئے۔ شکرگزاری کے بغیر طاقت کا ایک ہی انجام ہوتا ہے۔",
      }
    },
    90: {
      type: lang==='ur'?'آزمائش':lang==='hi'?'आज़माइश':'Trial',
      text: {
        en: "Al-Balad — Allah swears by the city of Makkah. We were created into hardship. But the righteous path is clear: free the slave, feed the hungry, be among those who believe and urge patience.",
        hi: "अल-बलद — अल्लाह मक्का शहर की क़सम खाता है। हमें मशक़्क़त में पैदा किया गया। लेकिन नेक राह साफ़ है: गर्दन आज़ाद करो, भूखे को खाना खिलाओ, ईमान वालों में से बनो।",
        ur: "البلد — اللہ مکہ شہر کی قسم کھاتا ہے۔ ہمیں مشقت میں پیدا کیا گیا۔ مگر نیک راہ واضح ہے: گردن آزاد کرو، بھوکے کو کھانا کھلاؤ، ایمان والوں میں سے بنو۔",
      }
    },
    91: {
      type: lang==='ur'?'روح':lang==='hi'?'रूह':'Soul',
      text: {
        en: "Ash-Shams — Allah swears by the sun, the moon, the day, the night, the sky, the earth — then by the soul itself. He who purifies it succeeds. He who corrupts it fails.",
        hi: "अश-शम्स — अल्लाह सूरज, चाँद, दिन, रात, आसमान, ज़मीन की क़सम खाता है — फिर ख़ुद रूह की। जिसने उसे पाक किया कामयाब हुआ। जिसने उसे आलूदा किया नाकाम हुआ।",
        ur: "الشمس — اللہ سورج، چاند، دن، رات، آسمان، زمین کی قسم کھاتا ہے — پھر خود روح کی۔ جس نے اسے پاک کیا کامیاب ہوا۔ جس نے اسے آلودہ کیا ناکام ہوا۔",
      }
    },
    92: {
      type: lang==='ur'?'سخاوت':lang==='hi'?'सख़ावत':'Generosity',
      text: {
        en: "Al-Layl — two opposite paths. One who gives, fears Allah, and believes in goodness — Allah will ease his way. Generosity is not just charity; it is the path itself.",
        hi: "अल-लैल — दो उलटी राहें। जो देता है, अल्लाह से डरता है, और भलाई में यक़ीन रखता है — अल्लाह उसके लिए राह आसान कर देगा। सख़ावत सिर्फ़ ख़ैरात नहीं, यह ख़ुद राह है।",
        ur: "اللیل — دو الٹی راہیں۔ جو دیتا ہے، اللہ سے ڈرتا ہے، اور بھلائی میں یقین رکھتا ہے — اللہ اس کے لیے راہ آسان کر دے گا۔ سخاوت صرف خیرات نہیں، یہ خود راہ ہے۔",
      }
    },
    93: {
      type: lang==='ur'?'تسلی':lang==='hi'?'तसल्ली':'Comfort',
      text: {
        en: "Ad-Duha was revealed after a painful pause in revelation when the Prophet ﷺ feared Allah had abandoned him. Allah said: your Lord has not forsaken you. He never has, and He never will.",
        hi: "अद-दुहा वही के एक दर्दनाक रुकाव के बाद नाज़िल हुई जब नबी ﷺ डरे कि अल्लाह ने उन्हें छोड़ दिया। अल्लाह ने कहा: आपके रब ने आपको नहीं छोड़ा। उसने कभी नहीं छोड़ा और कभी नहीं छोड़ेगा।",
        ur: "الضحیٰ وحی کے ایک دردناک وقفے کے بعد نازل ہوئی جب نبی ﷺ ڈرے کہ اللہ نے انہیں چھوڑ دیا۔ اللہ نے کہا: آپ کے رب نے آپ کو نہیں چھوڑا۔ اس نے کبھی نہیں چھوڑا اور کبھی نہیں چھوڑے گا۔",
      }
    },
    94: {
      type: lang==='ur'?'راحت':lang==='hi'?'राहत':'Relief',
      text: {
        en: "Al-Inshirah — 'With hardship comes ease.' Allah says it twice. Not after hardship — with it. Every difficulty carries its relief inside it.",
        hi: "अल-इंशिराह — 'मुश्किल के साथ आसानी है।' अल्लाह ने इसे दो बार कहा। मुश्किल के बाद नहीं — उसके साथ। हर तकलीफ़ के अंदर उसकी राहत है।",
        ur: "الانشراح — 'مشکل کے ساتھ آسانی ہے۔' اللہ نے اسے دو بار کہا۔ مشکل کے بعد نہیں — اس کے ساتھ۔ ہر تکلیف کے اندر اس کی راحت ہے۔",
      }
    },
    95: {
      type: lang==='ur'?'انسان':lang==='hi'?'इंसान':'Humanity',
      text: {
        en: "At-Tin — We created the human being in the finest form. Then We reduced him to the lowest — except those who believe and do good. Your choices determine which category you fall into.",
        hi: "अत-तीन — हमने इंसान को बेहतरीन सूरत में बनाया। फिर उसे सबसे नीचे गिरा दिया — सिवाय उनके जो ईमान लाए और नेक अमल किए। आपके चुनाव तय करते हैं आप किस ख़ाने में हैं।",
        ur: "التین — ہم نے انسان کو بہترین صورت میں بنایا۔ پھر اسے سب سے نیچے گرا دیا — سوائے ان کے جو ایمان لائے اور نیک عمل کیے۔ آپ کے انتخاب طے کرتے ہیں آپ کس خانے میں ہیں۔",
      }
    },
    96: {
      type: lang==='ur'?'آغاز':lang==='hi'?'आग़ाज़':'Beginning',
      text: {
        en: "Al-'Alaq — the very first revelation. 'Read, in the name of your Lord who created.' The Qur'an began with a command to learn. Knowledge is an act of worship.",
        hi: "अल-अलक़ — पहली वही। 'पढ़ो, अपने उस रब के नाम से जिसने पैदा किया।' क़ुरआन की शुरुआत सीखने के हुक्म से हुई। इल्म इबादत है।",
        ur: "العلق — پہلی وحی۔ 'پڑھو، اپنے اس رب کے نام سے جس نے پیدا کیا۔' قرآن کی شروعات سیکھنے کے حکم سے ہوئی۔ علم عبادت ہے۔",
      }
    },
    97: {
      type: lang==='ur'?'عظمت':lang==='hi'?'अज़मत':'Greatness',
      text: {
        en: "Al-Qadr — Laylat ul-Qadr is better than a thousand months. The Qur'an descended on this night. The angels descend. Peace reigns until the rise of dawn.",
        hi: "अल-क़द्र — लैलतुल-क़द्र हज़ार महीनों से बेहतर है। इसी रात क़ुरआन नाज़िल हुआ। फ़रिश्ते उतरते हैं। फ़ज्र की रोशनी तक सलामती छाई रहती है।",
        ur: "القدر — لیلۃ القدر ہزار مہینوں سے بہتر ہے۔ اسی رات قرآن نازل ہوا۔ فرشتے اترتے ہیں۔ فجر کی روشنی تک سلامتی چھائی رہتی ہے۔",
      }
    },
    98: {
      type: lang==='ur'?'وضاحت':lang==='hi'?'वज़ाहत':'Clarity',
      text: {
        en: "Al-Bayyinah — a clear proof came to them, yet those who disbelieved among the People of the Book did not leave their ways until it arrived. The best of creation are those who believe and do righteous deeds.",
        hi: "अल-बय्यिनह — उनके पास साफ़ दलील आई, फिर भी अहले-किताब में से जो काफ़िर थे वो अपनी राह नहीं छोड़ते थे जब तक वो न आई। बेहतरीन मख़्लूक़ वो हैं जो ईमान लाए और नेक अमल करें।",
        ur: "البینہ — ان کے پاس واضح دلیل آئی، پھر بھی اہلِ کتاب میں سے جو کافر تھے وہ اپنی راہ نہیں چھوڑتے تھے جب تک وہ نہ آئی۔ بہترین مخلوق وہ ہیں جو ایمان لائے اور نیک عمل کریں۔",
      }
    },
    99: {
      type: lang==='ur'?'حساب':lang==='hi'?'हिसाब':'Account',
      text: {
        en: "Az-Zilzal — the earth will be shaken and will reveal all it has witnessed. Then: whoever did an atom's weight of good will see it. Whoever did an atom's weight of evil will see it.",
        hi: "अज़-ज़िल्ज़ाल — ज़मीन को हिलाया जाएगा और वो सब ज़ाहिर कर देगी जो उसने देखा। फिर: जिसने ज़र्रे बराबर नेकी की वो देखेगा। जिसने ज़र्रे बराबर बुराई की वो देखेगा।",
        ur: "الزلزلہ — زمین کو ہلایا جائے گا اور وہ سب ظاہر کر دے گی جو اس نے دیکھا۔ پھر: جس نے ذرہ برابر نیکی کی وہ دیکھے گا۔ جس نے ذرہ برابر برائی کی وہ دیکھے گا۔",
      }
    },
    100: {
      type: lang==='ur'?'غفلت':lang==='hi'?'ग़फ़लत':'Heedlessness',
      text: {
        en: "Al-'Adiyat — the charging warhorses, snorting and sparking. Allah swears by their loyalty — then contrasts it with ungrateful man, devoted to wealth and heedless of his Lord.",
        hi: "अल-आदियात — दौड़ते घोड़े, हाँफते और चिंगारियाँ उड़ाते हुए। अल्लाह उनकी वफ़ादारी की क़सम खाता है — फिर उसे नाशुक्रे इंसान से मिलाता है, जो माल का दीवाना और अपने रब से ग़ाफ़िल है।",
        ur: "العادیات — دوڑتے گھوڑے، ہانپتے اور چنگاریاں اڑاتے ہوئے۔ اللہ ان کی وفاداری کی قسم کھاتا ہے — پھر اسے ناشکرے انسان سے ملاتا ہے، جو مال کا دیوانہ اور اپنے رب سے غافل ہے۔",
      }
    },
    101: {
      type: lang==='ur'?'میزان':lang==='hi'?'मीज़ान':'Scale',
      text: {
        en: "Al-Qari'ah — the Striking Calamity. Deeds are weighed on a scale. Heavy scales mean a life of bliss. Light scales mean a plunging fall. Every deed, however small, is being recorded now.",
        hi: "अल-क़ारिआ — खटखटाने वाली मुसीबत। आमाल तराज़ू पर तोले जाएंगे। भारी पलड़ा खुशहाल ज़िंदगी है। हल्का पलड़ा गहरी खाई है। हर अमल, चाहे कितना छोटा, अभी दर्ज हो रहा है।",
        ur: "القارعہ — کھٹکھٹانے والی مصیبت۔ اعمال ترازو میں تولے جائیں گے۔ بھاری پلڑا خوشحال زندگی ہے۔ ہلکا پلڑا گہری کھائی ہے۔ ہر عمل، چاہے کتنا چھوٹا، ابھی درج ہو رہا ہے۔",
      }
    },
    102: {
      type: lang==='ur'?'دنیا':lang==='hi'?'दुनिया':'Worldliness',
      text: {
        en: "At-Takathur — competing for more and more distracted you until you visited the graves. On that Day you will be questioned about every blessing you enjoyed. Less distraction, more gratitude.",
        hi: "अत-तकासुर — ज़्यादा से ज़्यादा जमा करने की होड़ ने तुम्हें ग़ाफ़िल रखा यहाँ तक कि तुम क़ब्रें देखने लगे। उस दिन तुमसे हर नेमत के बारे में पूछा जाएगा। कम ग़फ़लत, ज़्यादा शुक्र।",
        ur: "التکاثر — زیادہ سے زیادہ جمع کرنے کی ہوڑ نے تمہیں غافل رکھا یہاں تک کہ تم قبریں دیکھنے لگے۔ اس دن تم سے ہر نعمت کے بارے میں پوچھا جائے گا۔ کم غفلت، زیادہ شکر۔",
      }
    },
    104: {
      type: lang==='ur'?'خبردار':lang==='hi'?'चेतावनी':'Warning',
      text: {
        en: "Al-Humazah — woe to every scorner and mocker who amasses wealth and counts it, thinking it will make him immortal. Wealth without gratitude is a fire that consumes its owner.",
        hi: "अल-हुमज़ह — तबाही है हर उस शख़्स के लिए जो तान मारता और मज़ाक़ उड़ाता है, माल जमा करता और गिनता है, सोचता है यह उसे हमेशा ज़िंदा रखेगा। शुक्रगुज़ारी के बिना माल अपने मालिक को जलाने वाली आग है।",
        ur: "الہمزہ — تباہی ہے ہر اس شخص کے لیے جو طعنہ مارتا اور مذاق اڑاتا ہے، مال جمع کرتا اور گنتا ہے، سمجھتا ہے یہ اسے ہمیشہ زندہ رکھے گا۔ شکرگزاری کے بغیر مال اپنے مالک کو جلانے والی آگ ہے۔",
      }
    },
    105: {
      type: lang==='ur'?'تاریخ':lang==='hi'?'तारीख़':'History',
      text: {
        en: "Al-Fil — the Year of the Elephant. Abraha marched on the Ka'bah with his army. Allah sent birds with stones of baked clay. The army was destroyed. The Ka'bah stood. It still stands.",
        hi: "अल-फ़ील — हाथी का साल। अबरहा अपनी फ़ौज के साथ काबे पर चढ़ाई की। अल्लाह ने अबाबील पक्षी भेजे पकी मिट्टी के पत्थरों के साथ। फ़ौज तबाह हो गई। काबा खड़ा रहा। आज भी खड़ा है।",
        ur: "الفیل — ہاتھی کا سال۔ ابرہہ اپنی فوج کے ساتھ کعبہ پر چڑھائی کی۔ اللہ نے ابابیل پرندے بھیجے پکی مٹی کے پتھروں کے ساتھ۔ فوج تباہ ہو گئی۔ کعبہ کھڑا رہا۔ آج بھی کھڑا ہے۔",
      }
    },
    106: {
      type: lang==='ur'?'شکر':lang==='hi'?'शुक्र':'Gratitude',
      text: {
        en: "Quraysh — Allah reminds them of two gifts: safe journeys for trade in winter and summer, and security in Makkah. His response: worship only this Lord who fed you and gave you safety.",
        hi: "क़ुरैश — अल्लाह उन्हें दो नेमतें याद दिलाता है: सर्दी और गर्मी के तिजारती सफ़रों में अमान, और मक्के में सुरक्षा। उसका जवाब: बस इसी रब की इबादत करो जिसने खिलाया और अमान दी।",
        ur: "قریش — اللہ انہیں دو نعمتیں یاد دلاتا ہے: سردی اور گرمی کے تجارتی سفروں میں امان، اور مکہ میں حفاظت۔ اس کا جواب: بس اسی رب کی عبادت کرو جس نے کھلایا اور امان دی۔",
      }
    },
    107: {
      type: lang==='ur'?'اخلاص':lang==='hi'?'इख़लास':'Sincerity',
      text: {
        en: "Al-Ma'un — do you see the one who denies the faith? He drives away the orphan and neglects feeding the poor — yet he prays, with heedlessness and showing off. Faith without compassion is hollow.",
        hi: "अल-माऊन — क्या तुमने उसे देखा जो दीन को झुठलाता है? वो यतीम को धक्का देता और मिस्कीन को खाना देने की परवाह नहीं करता — लेकिन नमाज़ पढ़ता है ग़फ़लत और दिखावे के साथ। हमदर्दी के बिना ईमान खोखला है।",
        ur: "الماعون — کیا تم نے اسے دیکھا جو دین کو جھٹلاتا ہے؟ وہ یتیم کو دھکا دیتا اور مسکین کو کھانا دینے کی پرواہ نہیں کرتا — لیکن نماز پڑھتا ہے غفلت اور دکھاوے کے ساتھ۔ ہمدردی کے بغیر ایمان کھوکھلا ہے۔",
      }
    },
    109: {
      type: lang==='ur'?'اصول':lang==='hi'?'उसूल':'Principle',
      text: {
        en: "Al-Kafirun — a surah of clear, respectful separation. 'To you your religion, and to me mine.' The Prophet ﷺ called it the surah of disavowal from shirk. Read it before sleeping — it is a protection.",
        hi: "अल-काफ़िरून — साफ़ और अदबदार जुदाई की सूरह। 'तुम्हारे लिए तुम्हारा दीन, मेरे लिए मेरा।' नबी ﷺ ने इसे शिर्क से बरात की सूरह कहा। सोने से पहले पढ़ें — यह हिफ़ाज़त है।",
        ur: "الکافرون — واضح اور ادبدار جدائی کی سورہ۔ 'تمہارے لیے تمہارا دین، میرے لیے میرا۔' نبی ﷺ نے اسے شرک سے براءت کی سورہ کہا۔ سونے سے پہلے پڑھیں — یہ حفاظت ہے۔",
      }
    },
    110: {
      type: lang==='ur'?'الوداع':lang==='hi'?'विदाई':'Farewell',
      text: {
        en: "An-Nasr — when Allah's help comes and people enter the faith in multitudes, know the mission is complete. The Prophet ﷺ wept when this surah was revealed — he knew it signalled his departure.",
        hi: "अन-नस्र — जब अल्लाह की मदद आ जाए और लोग जौक़-दर-जौक़ दीन में दाख़िल हों, जान लो काम मुकम्मल है। इस सूरह के नाज़िल होने पर नबी ﷺ रो पड़े — उन्हें मालूम था यह उनकी रुख़सती का इशारा है।",
        ur: "النصر — جب اللہ کی مدد آ جائے اور لوگ جوق در جوق دین میں داخل ہوں، جان لو کام مکمل ہے۔ اس سورہ کے نازل ہونے پر نبی ﷺ رو پڑے — انہیں معلوم تھا یہ ان کی رخصتی کا اشارہ ہے۔",
      }
    },
    111: {
      type: lang==='ur'?'انتباہ':lang==='hi'?'परिणाम':'Consequence',
      text: {
        en: "Al-Masad — Abu Lahab, the Prophet's ﷺ own uncle, mocked him relentlessly. Allah named him in the Qur'an with his fate sealed. Truth outlasts all opposition.",
        hi: "अल-मसद — अबू लहब, नबी ﷺ के चाचा, मसलसल उनका मज़ाक़ उड़ाते रहे। अल्लाह ने उन्हें क़ुरआन में नाम लेकर — उनकी तक़दीर के साथ — बयान किया। सच हर दुश्मनी से लंबा जीता है।",
        ur: "المسد — ابو لہب، نبی ﷺ کے چچا، مسلسل ان کا مذاق اڑاتے رہے۔ اللہ نے انہیں قرآن میں نام لے کر — ان کی تقدیر کے ساتھ — بیان کیا۔ سچ ہر دشمنی سے زیادہ جیتا ہے۔",
      }
    },
    112: {
      type: lang==='ur'?'معجزہ':lang==='hi'?'मोजिज़ा':'Miracle',
      text: {
        en: "Al-Ikhlas — just 4 ayat — the Prophet ﷺ said it equals one-third of the Qur'an in reward.",
        hi: "सूरह इख़लास — सिर्फ़ 4 आयतें — नबी ﷺ ने फ़रमाया इसका सवाब पूरे क़ुरआन के एक तिहाई के बराबर है।",
        ur: "سورہ اخلاص — صرف 4 آیات — نبی ﷺ نے فرمایا اس کا ثواب قرآن کے ایک تہائی کے برابر ہے۔",
      }
    },
    113: {
      type: lang==='ur'?'تحفظ':lang==='hi'?'हिफ़ाज़त':'Protection',
      text: {
        en: "Al-Falaq and An-Nas — the two 'shield surahs' — the Prophet ﷺ recited them every night before sleeping.",
        hi: "अल-फ़लक़ और अन-नास — दो 'हिफ़ाज़त की सूरहें' — नबी ﷺ हर रात सोने से पहले इन्हें पढ़ते थे।",
        ur: "الفلق اور الناس — دو 'حفاظتی سورتیں' — نبی ﷺ ہر رات سونے سے پہلے انہیں پڑھتے تھے۔",
      }
    },
    114: {
      type: lang==='ur'?'تحفظ':lang==='hi'?'हिफ़ाज़त':'Protection',
      text: {
        en: "An-Nas — seeking refuge in Allah from the whisperings of evil — a du'a for every moment of the day.",
        hi: "अन-नास — बुराई के वसवसों से अल्लाह की पनाह माँगना — हर पल की दुआ।",
        ur: "الناس — برائی کے وسوسوں سے اللہ کی پناہ مانگنا — ہر لمحے کی دعا۔",
      }
    },
    25: {
      type: lang==='ur'?'معیار':lang==='hi'?'मेयार':'Standard',
      text: {
        en: "Al-Furqan means 'the Criterion' — the ability to tell truth from falsehood. It describes the 'Ibad ar-Rahman, the servants of the Most Merciful: they walk humbly, respond to ignorance with peace, and spend the night in prayer. A portrait of the ideal Muslim.",
        hi: "अल-फ़ुरक़ान का मतलब है 'कसौटी' — हक़ और बातिल में फ़र्क़ करने की सलाहियत। इसमें 'इबाद-उर-रहमान की तस्वीर है: आहिस्ता चलते हैं, जहालत पर सलामती से जवाब देते हैं, रात इबादत में गुज़ारते हैं। एक मुकम्मल मोमिन की तस्वीर।",
        ur: "الفرقان کا مطلب ہے 'کسوٹی' — حق اور باطل میں فرق کرنے کی صلاحیت۔ اس میں عبادالرحمٰن کی تصویر ہے: آہستہ چلتے ہیں، جہالت پر سلامتی سے جواب دیتے ہیں، رات عبادت میں گزارتے ہیں۔ ایک مکمل مومن کی تصویر۔",
      }
    },
    26: {
      type: lang==='ur'?'دعوت':lang==='hi'?'दावत':'Invitation',
      text: {
        en: "Ash-Shu'ara repeats the phrase 'And your Lord — He is the Mighty, the Merciful' eight times after each prophet's story. Power and mercy, together, again and again — as if Allah is saying: every rejection of His messengers was met not with destruction alone, but with continued mercy.",
        hi: "अश-शुअरा में हर नबी की कहानी के बाद 'और तुम्हारा रब — वही ज़बरदस्त, मेहरबान है' आठ बार दोहराया गया है। क़ुव्वत और रहमत, साथ-साथ, बार-बार — जैसे अल्लाह कह रहे हों: उनके पैग़म्बरों की हर नाफ़रमानी के बाद भी रहमत जारी रही।",
        ur: "الشعراء میں ہر نبی کی کہانی کے بعد 'اور تمہارا رب — وہی زبردست، مہربان ہے' آٹھ بار دہرایا گیا ہے۔ قوت اور رحمت، ساتھ ساتھ، بار بار — جیسے اللہ کہہ رہے ہوں: ان کے پیغمبروں کی ہر نافرمانی کے بعد بھی رحمت جاری رہی۔",
      }
    },
    27: {
      type: lang==='ur'?'حکمت':lang==='hi'?'हिकमत':'Wisdom',
      text: {
        en: "An-Naml contains the story of Sulayman ﷺ and the Queen of Saba — and the ant that warned her colony before his army arrived. The ant's words made Sulayman ﷺ smile and thank Allah. In this surah, a tiny insect teaches a prophet gratitude.",
        hi: "अन-नम्ल में सुलैमान ﷺ और मलिका-ए-सबा की कहानी है — और वो चींटी जिसने अपनी बस्ती को उनकी फ़ौज से पहले ख़बरदार किया। चींटी के बोल सुनकर सुलैमान ﷺ मुस्कुराए और अल्लाह का शुक्र किया। इस सूरह में एक छोटे से कीड़े ने एक नबी को शुक्र सिखाया।",
        ur: "النمل میں سلیمان ﷺ اور ملکہ سبا کی کہانی ہے — اور وہ چیونٹی جس نے اپنی بستی کو ان کی فوج سے پہلے خبردار کیا۔ چیونٹی کی باتیں سن کر سلیمان ﷺ مسکرائے اور اللہ کا شکر کیا۔ اس سورہ میں ایک چھوٹے سے کیڑے نے ایک نبی کو شکر سکھایا۔",
      }
    },
    28: {
      type: lang==='ur'?'توکل':lang==='hi'?'तवक्कुल':'Trust',
      text: {
        en: "Al-Qasas tells the full story of Musa ﷺ — from the basket on the Nile to the parting of the sea. His mother was told to cast her infant into the river and was promised he would return. The most terrifying act of trust became the greatest act of deliverance.",
        hi: "अल-क़सस में मूसा ﷺ की पूरी दास्तान है — नील में टोकरी से लेकर समंदर के चिरने तक। उनकी माँ को हुक्म हुआ बच्चे को नदी में डाल दो और वादा हुआ कि वो वापस आएगा। तवक्कुल का सबसे डरावना लम्हा सबसे बड़ी नजात बन गया।",
        ur: "القصص میں موسیٰ ﷺ کی پوری داستان ہے — نیل میں ٹوکری سے لے کر سمندر کے چرنے تک۔ ان کی ماں کو حکم ہوا بچے کو دریا میں ڈال دو اور وعدہ ہوا کہ وہ واپس آئے گا۔ توکل کا سب سے ڈراؤنا لمحہ سب سے بڑی نجات بن گیا۔",
      }
    },
    29: {
      type: lang==='ur'?'آزمائش':lang==='hi'?'आज़माइश':'Trial',
      text: {
        en: "Al-Ankabut opens with a stunning declaration: 'Do people think they will be left alone because they say we believe, and will not be tested?' Faith without trial is just a claim. The spider's web — seemingly strong, actually the weakest of homes — is the surah's central metaphor for false security.",
        hi: "अल-अनकबूत एक ज़बरदस्त ऐलान से खुलती है: 'क्या लोग समझते हैं कि बस 'हम ईमान लाए' कहने से उन्हें छोड़ दिया जाएगा और आज़माया नहीं जाएगा?' बिना आज़माइश का ईमान सिर्फ़ दावा है। मकड़ी का जाला — जो देखने में मज़बूत पर असल में सबसे कमज़ोर घर है — इस सूरह की मरकज़ी तस्वीर है।",
        ur: "العنکبوت ایک زبردست اعلان سے کھلتی ہے: 'کیا لوگ سمجھتے ہیں کہ بس ہم ایمان لائے کہنے سے انہیں چھوڑ دیا جائے گا اور آزمایا نہیں جائے گا؟' بغیر آزمائش کا ایمان صرف دعویٰ ہے۔ مکڑی کا جالا — جو دیکھنے میں مضبوط پر اصل میں سب سے کمزور گھر ہے — اس سورہ کی مرکزی تصویر ہے۔",
      }
    },
    30: {
      type: lang==='ur'?'پیشگوئی':lang==='hi'?'पेशगोई':'Prophecy',
      text: {
        en: "Ar-Rum opens with a historical prophecy: the Romans have been defeated, but within 3–9 years they will be victorious again. The Muslims in Makkah were mocked for believing this impossible prediction — and it came true exactly on the day of Badr. The Qur'an predicted news before it happened.",
        hi: "अर-रूम एक तारीख़ी पेशीनगोई से खुलती है: रोम हार गए हैं, लेकिन 3-9 साल में फिर जीतेंगे। मक्के में मुसलमानों का मज़ाक़ उड़ाया गया — और यह ठीक बद्र के दिन सच हो गया। क़ुरआन ने ख़बर होने से पहले ख़बर दी।",
        ur: "الروم ایک تاریخی پیشین گوئی سے کھلتی ہے: روم ہار گئے ہیں، لیکن 3-9 سال میں پھر جیتیں گے۔ مکے میں مسلمانوں کا مذاق اڑایا گیا — اور یہ ٹھیک بدر کے دن سچ ہو گیا۔ قرآن نے خبر ہونے سے پہلے خبر دی۔",
      }
    },
    31: {
      type: lang==='ur'?'حکمت':lang==='hi'?'हिकमत':'Wisdom',
      text: {
        en: "Luqman is a man mentioned in the Qur'an who was not a prophet — just a wise man given hikma by Allah. His advice to his son spans three ayat: don't associate partners with Allah, be good to your parents, establish prayer, and don't walk arrogantly on the earth. Timeless parenting in ten lines.",
        hi: "लुक़मान क़ुरआन में ज़िक्र होने वाले एक ऐसे इंसान हैं जो नबी नहीं थे — बस अल्लाह का दिया हुआ हिकमत वाले एक बुज़ुर्ग। उनकी बेटे को नसीहत तीन आयतों में है: शिर्क मत करो, माँ-बाप के साथ अच्छे रहो, नमाज़ पढ़ो, ज़मीन पर अकड़ कर मत चलो। दस सतरों में लाज़वाल तर्बियत।",
        ur: "لقمان قرآن میں ذکر ہونے والے ایک ایسے انسان ہیں جو نبی نہیں تھے — بس اللہ کی دی ہوئی حکمت والے ایک بزرگ۔ ان کی بیٹے کو نصیحت تین آیات میں ہے: شرک مت کرو، ماں باپ کے ساتھ اچھے رہو، نماز پڑھو، زمین پر اکڑ کر مت چلو۔ دس سطروں میں لازوال تربیت۔",
      }
    },
    32: {
      type: lang==='ur'?'تدبر':lang==='hi'?'तदब्बुर':'Reflection',
      text: {
        en: "As-Sajdah contains one of the most beautiful descriptions of creation in the Qur'an: how Allah fashioned the human being from clay, breathed His spirit into him, and gave him hearing, sight, and hearts. It is a surah of prostration — the natural response when you truly grasp who made you.",
        hi: "अस-सज्दा में क़ुरआन की सबसे ख़ूबसूरत तख़्लीक़ की तस्वीरों में से एक है: कैसे अल्लाह ने इंसान को मिट्टी से बनाया, उसमें अपनी रूह फूँकी, और उसे सुनना, देखना और दिल दिए। यह सजदे की सूरह है — वो फ़ितरी जवाब जब सच में समझ आए कि किसने बनाया।",
        ur: "السجدہ میں قرآن کی سب سے خوبصورت تخلیق کی تصویروں میں سے ایک ہے: کیسے اللہ نے انسان کو مٹی سے بنایا، اس میں اپنی روح پھونکی، اور اسے سننا، دیکھنا اور دل دیے۔ یہ سجدے کی سورہ ہے — وہ فطری جواب جب سچ میں سمجھ آئے کہ کس نے بنایا۔",
      }
    },
    33: {
      type: lang==='ur'?'امانت':lang==='hi'?'अमानत':'Trust',
      text: {
        en: "Al-Ahzab contains the famous ayah of the Amanah — the trust that the heavens, the earth, and the mountains refused to carry, and mankind accepted. It also contains the command of salawat upon the Prophet ﷺ: 'Indeed, Allah and His angels send blessings upon the Prophet.'",
        hi: "अल-अहज़ाब में अमानत की मशहूर आयत है — वो अमानत जिसे आसमानों, ज़मीन और पहाड़ों ने उठाने से इनकार किया, और इंसान ने क़ुबूल किया। इसमें नबी ﷺ पर दरूद का हुक्म भी है: 'बेशक अल्लाह और उसके फ़रिश्ते नबी पर दरूद भेजते हैं।'",
        ur: "الاحزاب میں امانت کی مشہور آیت ہے — وہ امانت جسے آسمانوں، زمین اور پہاڑوں نے اٹھانے سے انکار کیا، اور انسان نے قبول کیا۔ اس میں نبی ﷺ پر درود کا حکم بھی ہے: 'بے شک اللہ اور اس کے فرشتے نبی پر درود بھیجتے ہیں۔'",
      }
    },
    34: {
      type: lang==='ur'?'شکر':lang==='hi'?'शुक्र':'Gratitude',
      text: {
        en: "Saba tells the story of two grateful kingdoms — Saba and the family of Dawud ﷺ — and what happened when gratitude turned to arrogance. The people of Saba were destroyed by a flood after abandoning Allah's blessings. Their lush gardens became bitter thorns. Ingratitude is never just personal — it reshapes the world around you.",
        hi: "सबा दो शुक्रगुज़ार सल्तनतों की कहानी कहती है — सबा और दाऊद ﷺ का ख़ानदान — और जब शुक्र घमंड में बदल गया तो क्या हुआ। सबा के लोग अल्लाह की नेमतें छोड़ने के बाद सैलाब से तबाह हो गए। उनके हरे-भरे बाग़ कड़वे काँटों में बदल गए।",
        ur: "سبا دو شکرگزار سلطنتوں کی کہانی کہتی ہے — سبا اور داؤد ﷺ کا خاندان — اور جب شکر غرور میں بدل گیا تو کیا ہوا۔ سبا کے لوگ اللہ کی نعمتیں چھوڑنے کے بعد سیلاب سے تباہ ہو گئے۔ ان کے سرسبز باغ کڑوے کانٹوں میں بدل گئے۔",
      }
    },
    35: {
      type: lang==='ur'?'تخلیق':lang==='hi'?'तख़्लीक़':'Creation',
      text: {
        en: "Fatir opens with Allah describing Himself as the Creator of angels with two, three, or four wings — and then says He adds to creation whatever He wills. The universe is not static; Allah is continuously creating, expanding, and willing new things into existence. We live inside an ongoing act of creation.",
        hi: "फ़ातिर में अल्लाह ख़ुद को दो, तीन या चार पंखों वाले फ़रिश्ते बनाने वाले के तौर पर बयान करते हैं — फिर फ़रमाते हैं जो चाहे तख़्लीक़ में बढ़ाता है। कायनात जड़ नहीं है — अल्लाह लगातार बना रहे हैं। हम एक जारी तख़्लीक़ के अंदर जी रहे हैं।",
        ur: "فاطر میں اللہ خود کو دو، تین یا چار پروں والے فرشتے بنانے والے کے طور پر بیان کرتے ہیں — پھر فرماتے ہیں جو چاہے تخلیق میں بڑھاتا ہے۔ کائنات جامد نہیں ہے — اللہ مسلسل بنا رہے ہیں۔ ہم ایک جاری تخلیق کے اندر جی رہے ہیں۔",
      }
    },
    36: {
      type: lang==='ur'?'قلب':lang==='hi'?'क़ल्ब':'Heart',
      text: {
        en: "Ya-Sin is called 'the heart of the Qur'an' by the Prophet ﷺ. He said: 'Everything has a heart, and the heart of the Qur'an is Ya-Sin.' Recited for the dying, for barakah, for the dead. It ends with the most powerful argument for resurrection: the One who created you from nothing can certainly bring you back.",
        hi: "या-सीन को नबी ﷺ ने 'क़ुरआन का दिल' कहा। आपने फ़रमाया: 'हर चीज़ का एक दिल होता है, और क़ुरआन का दिल या-सीन है।' मरने वालों के पास, बरकत के लिए, मुर्दों के लिए पढ़ी जाती है। और क़यामत की सबसे ज़बरदस्त दलील पर ख़त्म होती है: जिसने तुम्हें अदम से बनाया, वो ज़रूर वापस ला सकता है।",
        ur: "یٰسین کو نبی ﷺ نے 'قرآن کا دل' کہا۔ آپ نے فرمایا: 'ہر چیز کا ایک دل ہوتا ہے، اور قرآن کا دل یٰسین ہے۔' مرنے والوں کے پاس، برکت کے لیے، مردوں کے لیے پڑھی جاتی ہے۔ اور قیامت کی سب سے زبردست دلیل پر ختم ہوتی ہے: جس نے تمہیں عدم سے بنایا، وہ ضرور واپس لا سکتا ہے۔",
      }
    },
    37: {
      type: lang==='ur'?'قربانی':lang==='hi'?'क़ुर्बानी':'Sacrifice',
      text: {
        en: "As-Saffat contains the full story of Ibrahim ﷺ's willingness to sacrifice his son — and the moment Allah called out 'O Ibrahim, you have fulfilled the vision.' The knife did not cut. Obedience was complete before the act was complete. Allah tests the intention, not just the action.",
        hi: "अस-साफ़्फ़ात में इब्राहीम ﷺ के बेटे की क़ुर्बानी का पूरा वाक़िया है — और वो लम्हा जब अल्लाह ने आवाज़ दी: 'ऐ इब्राहीम, तुमने ख़्वाब सच कर दिखाया।' छुरी नहीं चली। अमल पूरा होने से पहले फ़रमाँबरदारी मुकम्मल हो गई। अल्लाह नीयत को परखता है, सिर्फ़ अमल को नहीं।",
        ur: "الصافات میں ابراہیم ﷺ کے بیٹے کی قربانی کا پورا واقعہ ہے — اور وہ لمحہ جب اللہ نے آواز دی: 'اے ابراہیم، تم نے خواب سچ کر دکھایا۔' چھری نہیں چلی۔ عمل پورا ہونے سے پہلے فرمانبرداری مکمل ہو گئی۔ اللہ نیت کو پرکھتا ہے، صرف عمل کو نہیں۔",
      }
    },
    38: {
      type: lang==='ur'?'توبہ':lang==='hi'?'तौबा':'Repentance',
      text: {
        en: "Sad contains Dawud ﷺ's story of judgment and immediate tawbah — he wept so much in prostration that it became a sunnah to prostrate at that ayah. It also contains Iblis's declaration: 'I will mislead them all — except Your sincere servants.' The exception is the entire point.",
        hi: "साद में दाऊद ﷺ के फ़ैसले और फ़ौरी तौबा की कहानी है — वो इतना रोए कि उस आयत पर सजदा करना सुन्नत बन गया। इसमें इबलीस का ऐलान भी है: 'मैं इन सबको बहकाऊँगा — सिवाए तेरे मुख़लिस बंदों के।' यह इस्तिस्ना ही असल बात है।",
        ur: "صٓ میں داؤد ﷺ کے فیصلے اور فوری توبہ کی کہانی ہے — وہ اتنا روئے کہ اس آیت پر سجدہ کرنا سنت بن گیا۔ اس میں ابلیس کا اعلان بھی ہے: 'میں ان سب کو بہکاؤں گا — سوائے تیرے مخلص بندوں کے۔' یہ استثناء ہی اصل بات ہے۔",
      }
    },
    39: {
      type: lang==='ur'?'اخلاص':lang==='hi'?'इख़लास':'Sincerity',
      text: {
        en: "Az-Zumar means 'the Groups' — referring to how people will be driven to Hell or Paradise in groups on the Day of Judgment. But its most powerful ayah is a call to sincerity: 'Say: O My servants who have transgressed against themselves — do not despair of the mercy of Allah. Indeed, Allah forgives all sins.'",
        hi: "अज़-ज़ुमर का मतलब है 'गिरोह' — क़यामत के दिन लोगों के जहन्नम या जन्नत की तरफ़ झुंड-झुंड हाँके जाने का ज़िक्र है। लेकिन इसकी सबसे ज़बरदस्त आयत है: 'कहो: ऐ मेरे वो बंदो जिन्होंने अपनी जानों पर ज़ुल्म किया — अल्लाह की रहमत से ना-उम्मीद मत हो। बेशक अल्लाह सारे गुनाह माफ़ करता है।'",
        ur: "الزمر کا مطلب ہے 'گروہ' — قیامت کے دن لوگوں کے جہنم یا جنت کی طرف گروہ گروہ ہانکے جانے کا ذکر ہے۔ لیکن اس کی سب سے زبردست آیت ہے: 'کہو: اے میرے وہ بندو جنہوں نے اپنی جانوں پر ظلم کیا — اللہ کی رحمت سے ناامید مت ہو۔ بے شک اللہ سارے گناہ معاف کرتا ہے۔'",
      }
    },
    40: {
      type: lang==='ur'?'دعا':lang==='hi'?'दुआ':'Supplication',
      text: {
        en: "Ghafir — the Forgiver — opens with two of Allah's most beautiful names: Al-Ghafir and Al-Qabbal — the One who forgives sins and accepts repentance. The surah introduces the Believer of Pharaoh's court, an anonymous man who risked his life to speak truth to power and defend Musa ﷺ.",
        hi: "ग़ाफ़िर — माफ़ करने वाला — अल्लाह के दो ख़ूबसूरत नामों से खुलती है: अल-ग़ाफ़िर और अल-क़ब्बाल — गुनाह माफ़ करने वाला और तौबा क़ुबूल करने वाला। इसमें फ़िरऔन के दरबार के मोमिन का ज़िक्र है — एक गुमनाम शख़्स जिसने जान की बाज़ी लगाकर मूसा ﷺ की हिमायत में हक़ बोला।",
        ur: "غافر — معاف کرنے والا — اللہ کے دو خوبصورت ناموں سے کھلتی ہے: الغافر اور القبال — گناہ معاف کرنے والا اور توبہ قبول کرنے والا۔ اس میں فرعون کے دربار کے مومن کا ذکر ہے — ایک گمنام شخص جس نے جان کی بازی لگا کر موسیٰ ﷺ کی حمایت میں حق بولا۔",
      }
    },
    41: {
      type: lang==='ur'?'معجزہ':lang==='hi'?'मोजिज़ा':'Miracle',
      text: {
        en: "Fussilat contains a prophecy that stuns scientists to this day: 'We will show them Our signs in the horizons and within themselves until it becomes clear to them that it is the truth.' The expansion of the universe, the structure of DNA, the patterns of the cosmos — all discovered centuries after this ayah.",
        hi: "फ़ुस्सिलत में एक पेशीनगोई है जो आज भी साइंसदानों को हैरान करती है: 'हम उन्हें आफ़ाक़ में और ख़ुद उनमें अपनी निशानियाँ दिखाएंगे जब तक यह साफ़ न हो जाए कि यही हक़ है।' कायनात का फैलना, DNA की बनावट, कॉसमॉस के नक़्श — सब इस आयत के सदियों बाद दरयाफ़्त हुए।",
        ur: "فصلت میں ایک پیشین گوئی ہے جو آج بھی سائنسدانوں کو حیران کرتی ہے: 'ہم انہیں آفاق میں اور خود ان میں اپنی نشانیاں دکھائیں گے یہاں تک کہ واضح ہو جائے کہ یہی حق ہے۔' کائنات کا پھیلنا، DNA کی بناوٹ، کاسموس کے نقش — سب اس آیت کے صدیوں بعد دریافت ہوئے۔",
      }
    },
    42: {
      type: lang==='ur'?'وحی':lang==='hi'?'वह्य':'Revelation',
      text: {
        en: "Ash-Shura contains a profound ayah about how Allah communicates: 'It is not for a human being that Allah should speak to him except through revelation, or from behind a veil, or by sending a messenger.' Even the greatest prophets never heard Allah directly — such is His transcendence.",
        hi: "अश-शूरा में वह्य के बारे में एक गहरी आयत है: 'किसी इंसान के लिए यह नहीं कि अल्लाह उससे सीधे बात करे — मगर वह्य के ज़रिए, या पर्दे के पीछे से, या कोई रसूल भेजकर।' बड़े से बड़े नबी ने भी अल्लाह की आवाज़ सीधे नहीं सुनी — यही उसकी शान है।",
        ur: "الشوریٰ میں وحی کے بارے میں ایک گہری آیت ہے: 'کسی انسان کے لیے یہ نہیں کہ اللہ اس سے سیدھے بات کرے — مگر وحی کے ذریعے، یا پردے کے پیچھے سے، یا کوئی رسول بھیج کر۔' بڑے سے بڑے نبی نے بھی اللہ کی آواز سیدھی نہیں سنی — یہی اس کی شان ہے۔",
      }
    },
    43: {
      type: lang==='ur'?'قدر':lang==='hi'?'क़द्र':'Value',
      text: {
        en: "Az-Zukhruf means 'ornaments of gold' — and the surah argues that material wealth is the lowest form of honour. It tells us that if it were not for the risk of all mankind turning to disbelief, Allah would have given every disbeliever silver roofs and golden staircases. Dunya is too cheap for that to mean anything.",
        hi: "अज़-ज़ुख़्रुफ़ का मतलब है 'सोने के ज़ेवरात' — और यह सूरह दलील देती है कि माली दौलत सम्मान की सबसे कमतर क़िस्म है। बताती है कि अगर सारी इंसानियत के कुफ़्र में पड़ने का ख़तरा न होता तो अल्लाह हर काफ़िर को चाँदी की छतें और सोने की सीढ़ियाँ देता। दुनिया इसके लिए बहुत सस्ती है।",
        ur: "الزخرف کا مطلب ہے 'سونے کے زیورات' — اور یہ سورہ دلیل دیتی ہے کہ مالی دولت عزت کی سب سے کمتر قسم ہے۔ بتاتی ہے کہ اگر ساری انسانیت کے کفر میں پڑنے کا خطرہ نہ ہوتا تو اللہ ہر کافر کو چاندی کی چھتیں اور سونے کی سیڑھیاں دیتا۔ دنیا اس کے لیے بہت سستی ہے۔",
      }
    },
    44: {
      type: lang==='ur'?'لیلۃ المبارکۃ':lang==='hi'?'मुबारक रात':'Blessed Night',
      text: {
        en: "Ad-Dukhan contains a reference to 'the blessed night' in which every wise matter is decreed — widely understood to be Laylat al-Qadr. The surah warns the people of Pharaoh as a mirror: a people who were shown sign after sign, then drowned. The smoke (dukhan) of the Day of Judgment is its central image.",
        hi: "अद-दुख़ान में 'मुबारक रात' का ज़िक्र है जिसमें हर हिकमत भरा मामला तय किया जाता है — जिसे आमतौर पर लैलत-उल-क़द्र माना जाता है। सूरह फ़िरऔन की क़ौम को आईना दिखाती है: वो लोग जिन्हें एक के बाद एक निशानी दिखाई गई, फिर डुबो दिए गए।",
        ur: "الدخان میں 'مبارک رات' کا ذکر ہے جس میں ہر حکمت بھرا معاملہ طے کیا جاتا ہے — جسے عموماً لیلۃ القدر سمجھا جاتا ہے۔ سورہ فرعون کی قوم کو آئینہ دکھاتی ہے: وہ لوگ جنہیں ایک کے بعد ایک نشانی دکھائی گئی، پھر ڈبو دیے گئے۔",
      }
    },
    45: {
      type: lang==='ur'?'نشانی':lang==='hi'?'निशानी':'Sign',
      text: {
        en: "Al-Jathiyah means 'kneeling' — every nation will be called to kneel before Allah on the Day of Judgment, and their book of deeds will be presented to them. The surah challenges those who deny the signs in creation: the ships on the sea, the cattle, the rain, the rotation of night and day — all are proofs, if you reflect.",
        hi: "अल-जासियह का मतलब है 'घुटने टेकना' — क़यामत के दिन हर उम्मत को अल्लाह के सामने घुटने टेकने के लिए बुलाया जाएगा और उन्हें उनका आमालनामा दिखाया जाएगा। सूरह उनसे सवाल करती है जो तख़्लीक़ की निशानियाँ नकारते हैं: समंदर की कश्तियाँ, मवेशी, बारिश, रात-दिन का बदलाव।",
        ur: "الجاثیہ کا مطلب ہے 'گھٹنے ٹیکنا' — قیامت کے دن ہر امت کو اللہ کے سامنے گھٹنے ٹیکنے کے لیے بلایا جائے گا اور انہیں ان کا اعمالنامہ دکھایا جائے گا۔ سورہ ان سے سوال کرتی ہے جو تخلیق کی نشانیوں سے انکار کرتے ہیں: سمندر کی کشتیاں، مویشی، بارش، رات دن کا بدلاؤ۔",
      }
    },
    46: {
      type: lang==='ur'?'دعوت':lang==='hi'?'दावत':'Calling',
      text: {
        en: "Al-Ahqaf tells the story of a group of jinn who heard the Qur'an being recited in the desert and immediately believed — saying 'we have heard a wondrous recitation that guides to the right path.' Before many humans accepted Islam, the jinn were moved to faith by simply listening.",
        hi: "अल-अहक़ाफ़ में जिन्नों के उस गिरोह की कहानी है जिन्होंने रेगिस्तान में क़ुरआन की तिलावत सुनी और फ़ौरन ईमान ले आए — कहा: 'हमने एक हैरतअंगेज़ तिलावत सुनी जो सीधे रास्ते की तरफ़ रहनुमाई करती है।' कई इंसानों के इस्लाम लाने से पहले जिन्न सिर्फ़ सुनने से ईमान ले आए।",
        ur: "الاحقاف میں جنوں کے اس گروہ کی کہانی ہے جنہوں نے صحرا میں قرآن کی تلاوت سنی اور فوراً ایمان لے آئے — کہا: 'ہم نے ایک حیرت انگیز تلاوت سنی جو سیدھے راستے کی طرف رہنمائی کرتی ہے۔' کئی انسانوں کے اسلام لانے سے پہلے جن صرف سننے سے ایمان لے آئے۔",
      }
    },
    47: {
      type: lang==='ur'?'جہاد':lang==='hi'?'जिहाद':'Striving',
      text: {
        en: "Muhammad ﷺ — the only surah named directly after the Prophet ﷺ — was revealed during the most intense period of conflict in Madinah. It asks: 'Will you not fight in the cause of Allah and for the oppressed?' It defines true loss not as death in battle, but as wasted deeds on the Day of Judgment.",
        hi: "मुहम्मद ﷺ — एकमात्र सूरह जो सीधे नबी ﷺ के नाम पर है — मदीने में सबसे तनाव भरे दौर में नाज़िल हुई। पूछती है: 'क्या तुम अल्लाह की राह में और मज़लूमों के लिए नहीं लड़ोगे?' असली नुक़सान को मैदान में मौत नहीं, बल्कि क़यामत के दिन बर्बाद अमल बताती है।",
        ur: "محمد ﷺ — واحد سورہ جو سیدھے نبی ﷺ کے نام پر ہے — مدینے میں سب سے تناؤ بھرے دور میں نازل ہوئی۔ پوچھتی ہے: 'کیا تم اللہ کی راہ میں اور مظلوموں کے لیے نہیں لڑو گے؟' اصلی نقصان کو میدان میں موت نہیں، بلکہ قیامت کے دن برباد اعمال بتاتی ہے۔",
      }
    },
    48: {
      type: lang==='ur'?'فتح':lang==='hi'?'फ़तह':'Victory',
      text: {
        en: "Al-Fath was revealed after Hudaybiyyah — a treaty the companions saw as a defeat. The Prophet ﷺ called it 'the greatest of victories.' Two years later it led directly to the conquest of Makkah. What looks like a loss in Allah's plan is often the setup for the greatest opening.",
        hi: "अल-फ़त्ह हुदैबिया के बाद नाज़िल हुई — एक समझौता जिसे सहाबा ने शिकस्त समझा। नबी ﷺ ने इसे 'सबसे बड़ी फ़तह' कहा। दो साल बाद यह सीधे मक्के की फ़तह का सबब बना। अल्लाह के मंसूबे में जो हार जैसा लगता है वो अक्सर सबसे बड़े दरवाज़े का मुक़द्दमा होता है।",
        ur: "الفتح حدیبیہ کے بعد نازل ہوئی — ایک معاہدہ جسے صحابہ نے شکست سمجھا۔ نبی ﷺ نے اسے 'سب سے بڑی فتح' کہا۔ دو سال بعد یہ سیدھے مکے کی فتح کا سبب بنا۔ اللہ کے منصوبے میں جو شکست جیسا لگتا ہے وہ اکثر سب سے بڑے دروازے کا مقدمہ ہوتا ہے۔",
      }
    },
    49: {
      type: lang==='ur'?'ادب':lang==='hi'?'अदब':'Etiquette',
      text: {
        en: "Al-Hujurat is the surah of social manners — don't raise your voice above the Prophet's ﷺ, verify news before acting on it, don't mock each other, don't spy, don't backbite. It ends with the most precise definition of true faith: Islam is what you say, Iman is what enters your heart.",
        hi: "अल-हुजुरात सामाजिक अदब की सूरह है — नबी ﷺ की आवाज़ से ऊँचे मत बोलो, ख़बर को जाँचे बिना मत मानो, एक दूसरे का मज़ाक़ मत उड़ाओ, जासूसी मत करो, ग़ीबत मत करो। और ख़त्म होती है ईमान की सबसे सटीक तारीफ़ पर: इस्लाम वो है जो ज़ुबान पर है, ईमान वो है जो दिल में उतरे।",
        ur: "الحجرات سماجی ادب کی سورہ ہے — نبی ﷺ کی آواز سے اونچا مت بولو، خبر کو جانچے بغیر مت مانو، ایک دوسرے کا مذاق مت اڑاؤ، جاسوسی مت کرو، غیبت مت کرو۔ اور ختم ہوتی ہے ایمان کی سب سے درست تعریف پر: اسلام وہ ہے جو زبان پر ہے، ایمان وہ ہے جو دل میں اترے۔",
      }
    },
    50: {
      type: lang==='ur'?'قربت':lang==='hi'?'क़ुर्बत':'Nearness',
      text: {
        en: "Qaf opens with Allah swearing by the Qur'an itself — and then reminds us: 'We are closer to him than his jugular vein.' Not distant, not absent — Allah is nearer to you than your own pulse. The Prophet ﷺ would recite this surah every Friday in the khutbah.",
        hi: "क़ाफ़ में अल्लाह ख़ुद क़ुरआन की क़सम खाकर याद दिलाता है: 'हम उसकी शह-रग से भी ज़्यादा क़रीब हैं।' दूर नहीं, ग़ायब नहीं — अल्लाह तुम्हारी अपनी नब्ज़ से भी क़रीब है। नबी ﷺ हर जुमे के ख़ुतबे में यही सूरह पढ़ते थे।",
        ur: "قٓ میں اللہ خود قرآن کی قسم کھا کر یاد دلاتا ہے: 'ہم اس کی شہ رگ سے بھی زیادہ قریب ہیں۔' دور نہیں، غائب نہیں — اللہ تمہاری اپنی نبض سے بھی قریب ہے۔ نبی ﷺ ہر جمعے کے خطبے میں یہی سورہ پڑھتے تھے۔",
      }
    },
    51: {
      type: lang==='ur'?'یقین':lang==='hi'?'यक़ीन':'Certainty',
      text: {
        en: "Adh-Dhariyat contains the most direct statement of purpose in the Qur'an: 'I did not create the jinn and mankind except to worship Me.' Not to succeed, not to accumulate, not to be remembered — just to know and worship Allah. Everything else is detail.",
        hi: "अज़-ज़ारियात में क़ुरआन का सबसे सीधा बयान-ए-मक़सद है: 'मैंने जिन्न और इंसान को सिर्फ़ इसलिए बनाया कि वो मेरी इबादत करें।' कामयाबी के लिए नहीं, जमा करने के लिए नहीं, याद रहने के लिए नहीं — बस अल्लाह को जानो और उसकी इबादत करो। बाक़ी सब तफ़सील है।",
        ur: "الذاریات میں قرآن کا سب سے سیدھا بیانِ مقصد ہے: 'میں نے جن اور انسان کو صرف اس لیے بنایا کہ وہ میری عبادت کریں۔' کامیابی کے لیے نہیں، جمع کرنے کے لیے نہیں، یاد رہنے کے لیے نہیں — بس اللہ کو جانو اور اس کی عبادت کرو۔ باقی سب تفصیل ہے۔",
      }
    },
    52: {
      type: lang==='ur'?'وعدہ':lang==='hi'?'वादा':'Promise',
      text: {
        en: "At-Tur contains an ayah that broke the polytheists of Makkah: 'Were they created by nothing, or are they themselves the creators?' The argument is airtight — something cannot come from nothing, and nothing creates itself. This logic alone stopped Jubayr ibn Mut'im in his tracks and planted the seed of his Islam.",
        hi: "अत-तूर में एक ऐसी आयत है जिसने मक्के के मुश्रिकों को तोड़ दिया: 'क्या उन्हें बिना किसी के बनाया गया, या वो ख़ुद अपने ख़ालिक़ हैं?' दलील पुख़्ता है — कुछ बिना किसी के नहीं बन सकता, और कोई ख़ुद को नहीं बनाता। इसी मंतिक़ ने जुबैर इब्न मुतइम को रोक दिया और उनके इस्लाम का बीज बोया।",
        ur: "الطور میں ایک ایسی آیت ہے جس نے مکے کے مشرکوں کو توڑ دیا: 'کیا انہیں بغیر کسی کے بنایا گیا، یا وہ خود اپنے خالق ہیں؟' دلیل پختہ ہے — کچھ بغیر کسی کے نہیں بن سکتا، اور کوئی خود کو نہیں بناتا۔ اسی منطق نے جبیر بن مطعم کو روک دیا اور ان کے اسلام کا بیج بویا۔",
      }
    },
    53: {
      type: lang==='ur'?'مشاہدہ':lang==='hi'?'मुशाहदा':'Witnessing',
      text: {
        en: "An-Najm describes the Prophet's ﷺ direct encounter with Jibreel ﷺ at Sidrat al-Muntaha — the lote tree at the boundary of creation, beyond which no creature passes. It is the closest any human being has ever been to the divine threshold. When this surah was first recited, every person present — Muslim and disbeliever alike — fell into sajdah.",
        hi: "अन-नज्म में नबी ﷺ की जिब्रील ﷺ से सिद्रत-उल-मुन्तहा पर सीधी मुलाक़ात का बयान है — तख़्लीक़ की सरहद पर वो बेरी का दरख़्त जिसके आगे कोई मख़्लूक़ नहीं जाती। किसी इंसान का अल्लाह की दहलीज़ के इतने क़रीब कभी नहीं हुआ। जब यह सूरह पहली बार पढ़ी गई तो हर शख़्स — मुसलमान और काफ़िर — सजदे में गिर गया।",
        ur: "النجم میں نبی ﷺ کی جبریل ﷺ سے سدرۃ المنتہیٰ پر سیدھی ملاقات کا بیان ہے — تخلیق کی سرحد پر وہ بیری کا درخت جس کے آگے کوئی مخلوق نہیں جاتی۔ کسی انسان کا اللہ کی دہلیز کے اتنا قریب کبھی نہیں ہوا۔ جب یہ سورہ پہلی بار پڑھی گئی تو ہر شخص — مسلمان اور کافر — سجدے میں گر گیا۔",
      }
    },
    54: {
      type: lang==='ur'?'تنبیہ':lang==='hi'?'तंबीह':'Warning',
      text: {
        en: "Al-Qamar repeats four times: 'And We have certainly made the Qur'an easy for remembrance — so is there any who will remember?' Four times, as if Allah is knocking on the door of human hearts again and again. You are memorizing the book that was designed to be memorized.",
        hi: "अल-क़मर में चार बार दोहराया गया है: 'और हमने क़ुरआन को याद करने के लिए आसान बना दिया — तो क्या कोई है जो याद करे?' चार बार — जैसे अल्लाह बार-बार इंसानी दिलों का दरवाज़ा खटखटा रहे हों। तुम उस किताब को याद कर रहे हो जिसे याद करने के लिए बनाया गया था।",
        ur: "القمر میں چار بار دہرایا گیا ہے: 'اور ہم نے قرآن کو یاد کرنے کے لیے آسان بنا دیا — تو کیا کوئی ہے جو یاد کرے؟' چار بار — جیسے اللہ بار بار انسانی دلوں کا دروازہ کھٹکھٹا رہے ہوں۔ تم اس کتاب کو یاد کر رہے ہو جسے یاد کرنے کے لیے بنایا گیا تھا۔",
      }
    },
    55: {
      type: lang==='ur'?'نعمت':lang==='hi'?'नेमत':'Blessing',
      text: {
        en: "Ar-Rahman asks 'Which of the favours of your Lord will you deny?' — 31 times. Each repetition lands on a different blessing: creation, the Qur'an, the balance of the cosmos, fruits, seas, the two Easts and two Wests. It is the most rhythmic surah in the Qur'an — meant to be felt, not just read.",
        hi: "अर-रहमान में 'तो तुम दोनों अपने रब की किन-किन नेमतों को झुठलाओगे?' — 31 बार पूछा गया है। हर बार एक अलग नेमत पर: तख़्लीक़, क़ुरआन, कायनात का तुलान, फल, समंदर, दो पूरब और दो पश्चिम। यह क़ुरआन की सबसे संगीतात्मक सूरह है — सिर्फ़ पढ़ने के लिए नहीं, महसूस करने के लिए।",
        ur: "الرحمٰن میں 'تو تم دونوں اپنے رب کی کن کن نعمتوں کو جھٹلاؤ گے؟' — 31 بار پوچھا گیا ہے۔ ہر بار ایک الگ نعمت پر: تخلیق، قرآن، کائنات کا توازن، پھل، سمندر، دو مشرق اور دو مغرب۔ یہ قرآن کی سب سے موسیقی والی سورہ ہے — صرف پڑھنے کے لیے نہیں، محسوس کرنے کے لیے۔",
      }
    },
    56: {
      type: lang==='ur'?'آخرت':lang==='hi'?'आख़िरत':'Hereafter',
      text: {
        en: "Al-Waqi'ah divides all of humanity into three groups on the Day of Judgment: the Foremost (As-Sabiqun), the People of the Right, and the People of the Left. The Prophet ﷺ said: 'Whoever recites Al-Waqi'ah every night will never be afflicted by poverty.' A surah about the next life — that protects this one.",
        hi: "अल-वाक़िआ क़यामत के दिन तमाम इंसानों को तीन गिरोहों में बाँटती है: सबक़त लेने वाले, दाएँ वाले, और बाएँ वाले। नबी ﷺ ने फ़रमाया: 'जो हर रात अल-वाक़िआ पढ़े, उसे कभी फ़ाक़ा नहीं आएगा।' आख़िरत की सूरह — जो दुनिया की हिफ़ाज़त करती है।",
        ur: "الواقعہ قیامت کے دن تمام انسانوں کو تین گروہوں میں بانٹتی ہے: سبقت لینے والے، دائیں والے، اور بائیں والے۔ نبی ﷺ نے فرمایا: 'جو ہر رات الواقعہ پڑھے، اسے کبھی فاقہ نہیں آئے گا۔' آخرت کی سورہ — جو دنیا کی حفاظت کرتی ہے۔",
      }
    },
    57: {
      type: lang==='ur'?'دنیا':lang==='hi'?'दुनिया':'World',
      text: {
        en: "Al-Hadid contains the most vivid description of dunya in the Qur'an: 'Know that the life of this world is but amusement, play, adornment, boasting among yourselves, and competition in wealth and children — like rain whose resulting plant growth pleases the tillers, then it dries and you see it turn yellow, then it becomes debris.' Five stages — and then nothing.",
        hi: "अल-हदीद में दुनिया की सबसे ज़िंदा तस्वीर है: 'जान लो कि दुनिया की ज़िंदगी बस खेल, तमाशा, ज़ीनत, आपस में फ़ख़्र, और माल व औलाद में एक दूसरे से आगे बढ़ने की कोशिश है — जैसे बारिश जिसकी उगाई फ़सल किसानों को ख़ुश करती है, फिर सूखती है, पीली पड़ती है, फिर चूरा बन जाती है।' पाँच मंज़िलें — फिर कुछ नहीं।",
        ur: "الحدید میں دنیا کی سب سے زندہ تصویر ہے: 'جان لو کہ دنیا کی زندگی بس کھیل، تماشا، زینت، آپس میں فخر، اور مال و اولاد میں ایک دوسرے سے آگے بڑھنے کی کوشش ہے — جیسے بارش جس کی اگائی فصل کسانوں کو خوش کرتی ہے، پھر سوکھتی ہے، پیلی پڑتی ہے، پھر چورا بن جاتی ہے۔' پانچ منزلیں — پھر کچھ نہیں۔",
      }
    },
    58: {
      type: lang==='ur'?'انصاف':lang==='hi'?'इंसाफ़':'Justice',
      text: {
        en: "Al-Mujadila — 'the Woman Who Argues' — was revealed because of Khawlah bint Tha'labah, who came to the Prophet ﷺ crying about an unjust divorce custom. Allah heard her and revealed an entire surah to address her complaint. No one who brings their pain to Allah is too small to be heard.",
        hi: "अल-मुजादिला — 'बहस करने वाली औरत' — ख़ौला बिन्त सअलबा की वजह से नाज़िल हुई जो नबी ﷺ के पास रोते हुए आई थीं, एक ज़ालिम तलाक़ की रस्म की शिकायत लेकर। अल्लाह ने उन्हें सुना और उनकी फ़रियाद के जवाब में पूरी एक सूरह नाज़िल की। जो भी अपना दर्द अल्लाह के पास लाए, वो सुना जाता है।",
        ur: "المجادلہ — 'بحث کرنے والی عورت' — خولہ بنت ثعلبہ کی وجہ سے نازل ہوئی جو نبی ﷺ کے پاس روتے ہوئے آئی تھیں، ایک ظالم طلاق کی رسم کی شکایت لے کر۔ اللہ نے انہیں سنا اور ان کی فریاد کے جواب میں پوری ایک سورہ نازل کی۔ جو بھی اپنا درد اللہ کے پاس لائے، وہ سنا جاتا ہے۔",
      }
    },
    59: {
      type: lang==='ur'?'تدبر':lang==='hi'?'तदब्बुर':'Reflection',
      text: {
        en: "Al-Hashr ends with the most concentrated list of Allah's beautiful names in the Qur'an — seven in three ayat: Al-Malik, Al-Quddus, As-Salam, Al-Mu'min, Al-Muhaymin, Al-Aziz, Al-Jabbar, Al-Mutakabbir. The Prophet ﷺ said whoever recites its last three ayat in the morning, 70,000 angels pray for them until evening.",
        hi: "अल-हश्र के आख़िर में क़ुरआन में अल्लाह के ख़ूबसूरत नामों की सबसे मुरक्कज़ फ़ेहरिस्त है — तीन आयतों में सात नाम। नबी ﷺ ने फ़रमाया जो सुबह इसकी आख़िरी तीन आयतें पढ़े, 70,000 फ़रिश्ते शाम तक उसके लिए दुआ करते हैं।",
        ur: "الحشر کے آخر میں قرآن میں اللہ کے خوبصورت ناموں کی سب سے مرکوز فہرست ہے — تین آیات میں سات نام۔ نبی ﷺ نے فرمایا جو صبح اس کی آخری تین آیات پڑھے، 70,000 فرشتے شام تک اس کے لیے دعا کرتے ہیں۔",
      }
    },
    60: {
      type: lang==='ur'?'وفاداری':lang==='hi'?'वफ़ादारी':'Loyalty',
      text: {
        en: "Al-Mumtahanah was revealed about the test of loyalty — specifically when Hatib ibn Abi Balta'ah leaked military plans to the Quraysh. Yet the Prophet ﷺ forgave him because of Badr. The surah establishes that ties of faith run deeper than ties of blood — but also that sincere regret can restore what was broken.",
        hi: "अल-मुम्तहना वफ़ादारी के इम्तिहान के बारे में नाज़िल हुई — ख़ास तौर पर जब हातिब इब्न अबी बलताआ ने क़ुरैश को फ़ौजी राज़ बताए। लेकिन नबी ﷺ ने बद्र की वजह से उन्हें माफ़ कर दिया। यह सूरह बताती है कि ईमान का रिश्ता ख़ून से गहरा है — लेकिन सच्ची तौबा टूटे को जोड़ सकती है।",
        ur: "الممتحنہ وفاداری کے امتحان کے بارے میں نازل ہوئی — خاص طور پر جب حاطب بن ابی بلتعہ نے قریش کو فوجی راز بتائے۔ لیکن نبی ﷺ نے بدر کی وجہ سے انہیں معاف کر دیا۔ یہ سورہ بتاتی ہے کہ ایمان کا رشتہ خون سے گہرا ہے — لیکن سچی توبہ ٹوٹے کو جوڑ سکتی ہے۔",
      }
    },
    61: {
      type: lang==='ur'?'بشارت':lang==='hi'?'बुशारत':'Glad Tidings',
      text: {
        en: "As-Saf contains the prophecy of Isa ﷺ: 'And giving good tidings of a messenger to come after me whose name is Ahmad.' The name Ahmad is a form of Muhammad ﷺ — a prophecy inside the Qur'an, from one prophet about another, across centuries. Truth confirms itself.",
        hi: "अस-साफ़ में ईसा ﷺ की पेशीनगोई है: 'और मेरे बाद आने वाले एक रसूल की बुशारत दे रहा हूँ जिनका नाम अहमद है।' अहमद, मुहम्मद ﷺ का एक रूप है — एक नबी से दूसरे के बारे में, सदियों के फ़ासले पर। हक़ ख़ुद अपनी तसदीक़ करता है।",
        ur: "الصف میں عیسیٰ ﷺ کی پیشین گوئی ہے: 'اور میرے بعد آنے والے ایک رسول کی بشارت دے رہا ہوں جن کا نام احمد ہے۔' احمد، محمد ﷺ کی ایک شکل ہے — ایک نبی سے دوسرے کے بارے میں، صدیوں کے فاصلے پر۔ حق خود اپنی تصدیق کرتا ہے۔",
      }
    },
    62: {
      type: lang==='ur'?'جمعہ':lang==='hi'?'जुमा':'Friday',
      text: {
        en: "Al-Jumu'ah contains the only direct Qur'anic command to drop everything for Friday prayer: 'O you who believe, when the call to prayer is made on Friday — hasten to the remembrance of Allah and leave trade.' The best hour of the best day of the week belongs to Allah.",
        hi: "अल-जुमुआ में जुमे की नमाज़ के लिए सब कुछ छोड़ने का क़ुरआन का एकमात्र सीधा हुक्म है: 'ऐ ईमान वालो, जब जुमे के दिन नमाज़ की अज़ान हो — अल्लाह की याद की तरफ़ दौड़ो और ख़रीद-फ़रोख़्त छोड़ दो।' हफ़्ते के बेहतरीन दिन का बेहतरीन वक़्त अल्लाह के लिए है।",
        ur: "الجمعہ میں جمعے کی نماز کے لیے سب کچھ چھوڑنے کا قرآن کا واحد سیدھا حکم ہے: 'اے ایمان والو، جب جمعے کے دن نماز کی اذان ہو — اللہ کی یاد کی طرف دوڑو اور خرید و فروخت چھوڑ دو۔' ہفتے کے بہترین دن کا بہترین وقت اللہ کے لیے ہے۔",
      }
    },
    63: {
      type: lang==='ur'?'نفاق':lang==='hi'?'निफ़ाक़':'Hypocrisy',
      text: {
        en: "Al-Munafiqun exposes the hypocrites of Madinah with surgical precision — their smooth tongues, hollow hearts, and fear of losing status. The most haunting ayah: 'When you see them, their appearance pleases you; when they speak, you listen — but they are like propped-up planks of wood.' Beautiful outside, empty within.",
        hi: "अल-मुनाफ़िक़ून मदीने के मुनाफ़िक़ों को बिल्कुल साफ़ तरीक़े से बेनक़ाब करती है — चिकनी ज़ुबान, खोखले दिल, मक़ाम खोने का डर। सबसे हौलनाक आयत: 'जब तुम उन्हें देखो तो उनका जिस्म पसंद आए, जब बोलें तो सुनो — लेकिन वो खड़े किए हुए लकड़ी के शहतीरों जैसे हैं।' बाहर से ख़ूबसूरत, अंदर से खोखले।",
        ur: "المنافقون مدینے کے منافقوں کو بالکل واضح طریقے سے بے نقاب کرتی ہے — چکنی زبان، کھوکھلے دل، مقام کھونے کا ڈر۔ سب سے ہولناک آیت: 'جب تم انہیں دیکھو تو ان کا جسم پسند آئے، جب بولیں تو سنو — لیکن وہ کھڑے کیے ہوئے لکڑی کے شہتیروں جیسے ہیں۔' باہر سے خوبصورت، اندر سے کھوکھلے۔",
      }
    },
    64: {
      type: lang==='ur'?'امتحان':lang==='hi'?'इम्तिहान':'Test',
      text: {
        en: "At-Taghabun means 'mutual loss and gain' — the Day when it becomes clear who truly won and who truly lost in this life. It contains a profound reminder: 'No calamity strikes except by the permission of Allah. And whoever believes in Allah — He will guide his heart.' The test and the compass come from the same source.",
        hi: "अत-तग़ाबुन का मतलब है 'आपसी नफ़े-नुक़सान' — वो दिन जब साफ़ हो जाएगा कि दुनिया में किसने सच में जीता और किसने हारा। इसमें एक गहरी याददेहानी है: 'कोई मुसीबत अल्लाह की इजाज़त के बिना नहीं आती। और जो अल्लाह पर ईमान रखे — वो उसके दिल की रहनुमाई करता है।' इम्तिहान और कम्पास एक ही ज़रिए से आते हैं।",
        ur: "التغابن کا مطلب ہے 'آپسی نفع نقصان' — وہ دن جب واضح ہو جائے گا کہ دنیا میں کس نے سچ میں جیتا اور کس نے ہارا۔ اس میں ایک گہری یاددہانی ہے: 'کوئی مصیبت اللہ کی اجازت کے بغیر نہیں آتی۔ اور جو اللہ پر ایمان رکھے — وہ اس کے دل کی رہنمائی کرتا ہے۔' امتحان اور کمپاس ایک ہی ذریعے سے آتے ہیں۔",
      }
    },
    65: {
      type: lang==='ur'?'آسانی':lang==='hi'?'आसानी':'Ease',
      text: {
        en: "At-Talaq contains one of the most repeated promises of relief in the Qur'an: 'And whoever fears Allah — He will make for him a way out, and will provide for him from where he does not expect.' Twice in two consecutive ayat. As if Allah knew we would need to hear it more than once.",
        hi: "अत-तलाक़ में राहत का एक वादा है जो क़ुरआन में सबसे ज़्यादा दोहराया गया: 'और जो अल्लाह से डरे — वो उसके लिए निकलने का रास्ता बना देता है, और उसे वहाँ से रोज़ी देता है जहाँ से उसे गुमान भी नहीं।' दो लगातार आयतों में दो बार। जैसे अल्लाह जानता था कि हमें एक से ज़्यादा बार सुनने की ज़रूरत होगी।",
        ur: "الطلاق میں راحت کا ایک وعدہ ہے جو قرآن میں سب سے زیادہ دہرایا گیا: 'اور جو اللہ سے ڈرے — وہ اس کے لیے نکلنے کا راستہ بنا دیتا ہے، اور اسے وہاں سے رزق دیتا ہے جہاں سے اسے گمان بھی نہیں۔' دو لگاتار آیات میں دو بار۔ جیسے اللہ جانتا تھا کہ ہمیں ایک سے زیادہ بار سننے کی ضرورت ہوگی۔",
      }
    },
    66: {
      type: lang==='ur'?'توبہ':lang==='hi'?'तौबा':'Repentance',
      text: {
        en: "At-Tahrim addresses even the wives of the Prophet ﷺ with accountability — no one is exempt from Allah's standard. But it also contains the most beautiful du'a for believers: 'Our Lord, perfect for us our light and forgive us. Indeed, You are over all things competent.' Ask for nur — and the completion of it.",
        hi: "अत-तहरीम नबी ﷺ की बीवियों को भी जवाबदेही की याद दिलाती है — अल्लाह के मेयार से कोई मुस्तसना नहीं। लेकिन इसमें मोमिनों के लिए सबसे ख़ूबसूरत दुआ भी है: 'ऐ हमारे रब, हमारा नूर मुकम्मल कर और हमें माफ़ कर। बेशक तू हर चीज़ पर क़ादिर है।' नूर माँगो — और उसकी तकमील।",
        ur: "التحریم نبی ﷺ کی بیویوں کو بھی جوابدہی کی یاد دلاتی ہے — اللہ کے معیار سے کوئی مستثنیٰ نہیں۔ لیکن اس میں مومنوں کے لیے سب سے خوبصورت دعا بھی ہے: 'اے ہمارے رب، ہمارا نور مکمل کر اور ہمیں معاف کر۔ بے شک تو ہر چیز پر قادر ہے۔' نور مانگو — اور اس کی تکمیل۔",
      }
    },
    67: {
      type: lang==='ur'?'ملکوت':lang==='hi'?'मुल्क':'Dominion',
      text: {
        en: "Al-Mulk — Tabarakallah — is the surah the Prophet ﷺ called 'the preventer': it will intercede for its companion in the grave and protect them from punishment. Thirty ayat. The scholars called it 'Al-Mani'ah' — the shield. Recite it every night and let it walk with you into your grave.",
        hi: "अल-मुल्क — तबारकल्लाह — वो सूरह है जिसे नबी ﷺ ने 'रोकने वाली' कहा: यह क़ब्र में अपने साथी की सिफ़ारिश करेगी और उसे अज़ाब से बचाएगी। तीस आयतें। उलमा ने इसे 'अल-मानिआ' — ढाल — कहा। हर रात पढ़ो और इसे अपने साथ क़ब्र में ले जाओ।",
        ur: "الملک — تبارک اللہ — وہ سورہ ہے جسے نبی ﷺ نے 'روکنے والی' کہا: یہ قبر میں اپنے ساتھی کی سفارش کرے گی اور اسے عذاب سے بچائے گی۔ تیس آیات۔ علماء نے اسے 'المانعہ' — ڈھال — کہا۔ ہر رات پڑھو اور اسے اپنے ساتھ قبر میں لے جاؤ۔",
      }
    },
    68: {
      type: lang==='ur'?'اخلاق':lang==='hi'?'अख़लाक़':'Character',
      text: {
        en: "Al-Qalam opens with one of the greatest honours given to the Prophet ﷺ in the Qur'an: 'And indeed, you are of a great moral character.' Allah Himself is testifying to his character. The surah was revealed early in Makkah, when the Prophet ﷺ was being mocked and called mad — Allah's response was: your character is the proof.",
        hi: "अल-क़लम में नबी ﷺ को क़ुरआन की सबसे बड़ी इज़्ज़तों में से एक दी गई है: 'और बेशक तुम बहुत बड़े अख़लाक़ पर हो।' अल्लाह ख़ुद उनके किरदार की गवाही दे रहा है। यह सूरह मक्के के शुरुआती दौर में नाज़िल हुई जब नबी ﷺ को पागल कहा जा रहा था — अल्लाह का जवाब था: तुम्हारा अख़लाक़ ही दलील है।",
        ur: "القلم میں نبی ﷺ کو قرآن کی سب سے بڑی عزتوں میں سے ایک دی گئی ہے: 'اور بے شک تم بہت بڑے اخلاق پر ہو۔' اللہ خود ان کے کردار کی گواہی دے رہا ہے۔ یہ سورہ مکے کے ابتدائی دور میں نازل ہوئی جب نبی ﷺ کو پاگل کہا جا رہا تھا — اللہ کا جواب تھا: تمہارا اخلاق ہی دلیل ہے۔",
      }
    },
    69: {
      type: lang==='ur'?'حقیقت':lang==='hi'?'हक़ीक़त':'Reality',
      text: {
        en: "Al-Haqqah — the Inevitable Reality — opens by asking three times: 'What is the Inevitable Reality? And what will make you realise what it is?' Then it shows: Ad, Thamud, Pharaoh — nations that thought their power was permanent. On that Day, even the sky will split and the mountains will vanish like dust.",
        hi: "अल-हाक़्क़ा — अटल हक़ीक़त — तीन बार पूछकर खुलती है: 'अल-हाक़्क़ा क्या है? और तुम्हें क्या बताएगा कि यह क्या है?' फिर दिखाती है: आद, समूद, फ़िरऔन — वो क़ौमें जिन्होंने सोचा उनकी ताक़त हमेशा रहेगी। उस दिन आसमान भी फट जाएगा और पहाड़ धूल हो जाएंगे।",
        ur: "الحاقہ — اٹل حقیقت — تین بار پوچھ کر کھلتی ہے: 'الحاقہ کیا ہے؟ اور تمہیں کیا بتائے گا کہ یہ کیا ہے؟' پھر دکھاتی ہے: عاد، ثمود، فرعون — وہ قومیں جنہوں نے سوچا ان کی طاقت ہمیشہ رہے گی۔ اس دن آسمان بھی پھٹ جائے گا اور پہاڑ دھول ہو جائیں گے۔",
      }
    },
    70: {
      type: lang==='ur'?'صبر':lang==='hi'?'सब्र':'Patience',
      text: {
        en: "Al-Ma'arij — the Ascending Stairways — describes the angels ascending to Allah in a day of fifty thousand years. Yet for the believer who is patient, the Day of Judgment will pass like the afternoon prayer. Patience does not shorten time — it transforms your experience of it.",
        hi: "अल-मआरिज — ऊपर जाने वाली सीढ़ियाँ — फ़रिश्तों के पचास हज़ार साल के एक दिन में अल्लाह की तरफ़ चढ़ाई का बयान करती है। लेकिन सब्र करने वाले मोमिन के लिए क़यामत का दिन अस्र की नमाज़ जैसा गुज़र जाएगा। सब्र वक़्त को छोटा नहीं करता — वो तुम्हारा तजुर्बा बदल देता है।",
        ur: "المعارج — اوپر جانے والی سیڑھیاں — فرشتوں کے پچاس ہزار سال کے ایک دن میں اللہ کی طرف چڑھائی کا بیان کرتی ہے۔ لیکن صبر کرنے والے مومن کے لیے قیامت کا دن عصر کی نماز جیسا گزر جائے گا۔ صبر وقت کو چھوٹا نہیں کرتا — وہ تمہارا تجربہ بدل دیتا ہے۔",
      }
    },
    71: {
      type: lang==='ur'?'استغفار':lang==='hi'?'इस्तिग़फ़ार':'Forgiveness',
      text: {
        en: "Nuh is the story of 950 years of da'wah — public and private, night and day — and fewer than 80 accepted. But Nuh ﷺ never stopped. He taught his people: 'Seek forgiveness from your Lord — He will send rain upon you abundantly, and give you increase in wealth and children.' Istighfar unlocks provision.",
        hi: "नूह 950 साल की दावत की कहानी है — खुली और ख़ानगी, रात और दिन — और 80 से कम ने क़ुबूल किया। लेकिन नूह ﷺ रुके नहीं। उन्होंने लोगों को सिखाया: 'अपने रब से बख़्शिश माँगो — वो तुम पर खुल कर बारिश भेजेगा, और माल व औलाद में इज़ाफ़ा करेगा।' इस्तिग़फ़ार रोज़ी का दरवाज़ा खोलता है।",
        ur: "نوح 950 سال کی دعوت کی کہانی ہے — کھلی اور خانگی، رات اور دن — اور 80 سے کم نے قبول کیا۔ لیکن نوح ﷺ رکے نہیں۔ انہوں نے لوگوں کو سکھایا: 'اپنے رب سے بخشش مانگو — وہ تم پر کھل کر بارش بھیجے گا، اور مال و اولاد میں اضافہ کرے گا۔' استغفار رزق کا دروازہ کھولتا ہے۔",
      }
    },
    72: {
      type: lang==='ur'?'ایمان':lang==='hi'?'ईमान':'Faith',
      text: {
        en: "Al-Jinn tells us that a group of jinn listened to the Qur'an in secret and returned to their people as believers and callers to Islam. They said: 'It guides to the right course, and we have believed in it.' The Qur'an is so powerful that even beings we cannot see have accepted its truth.",
        hi: "अल-जिन्न बताती है कि जिन्नों के एक गिरोह ने चुपके से क़ुरआन सुना और अपनी क़ौम के पास मोमिन और दाई बनकर वापस गए। उन्होंने कहा: 'यह सीधे रास्ते की रहनुमाई करता है, और हम इस पर ईमान ले आए।' क़ुरआन इतना ताक़तवर है कि जिन्हें हम देख नहीं सकते उन्होंने भी इसकी सच्चाई मान ली।",
        ur: "الجن بتاتی ہے کہ جنوں کے ایک گروہ نے چپکے سے قرآن سنا اور اپنی قوم کے پاس مومن اور داعی بن کر واپس گئے۔ انہوں نے کہا: 'یہ سیدھے راستے کی رہنمائی کرتا ہے، اور ہم اس پر ایمان لے آئے۔' قرآن اتنا طاقتور ہے کہ جنہیں ہم دیکھ نہیں سکتے انہوں نے بھی اس کی سچائی مان لی۔",
      }
    },
    73: {
      type: lang==='ur'?'تیاری':lang==='hi'?'तैयारी':'Preparation',
      text: {
        en: "Al-Muzzammil — the Enshrouded One — was revealed when the Prophet ﷺ was wrapped in his cloak. Allah's first command was not to go preach, but to stand in the night: 'Rise for prayer in the night.' Before the mission comes the formation. The one who would carry the Qur'an to the world first had to fill himself with it in the dark.",
        hi: "अल-मुज़म्मिल — चादर में लिपटा हुआ — तब नाज़िल हुई जब नबी ﷺ अपनी चादर में लिपटे हुए थे। अल्लाह का पहला हुक्म तब्लीग़ का नहीं था, बल्कि रात में खड़े रहने का था: 'रात में नमाज़ के लिए उठो।' मिशन से पहले तर्बियत आती है। जो क़ुरआन को दुनिया तक पहुँचाने वाले थे, उन्हें पहले अंधेरे में ख़ुद को उससे भरना था।",
        ur: "المزمل — چادر میں لپٹا ہوا — تب نازل ہوئی جب نبی ﷺ اپنی چادر میں لپٹے ہوئے تھے۔ اللہ کا پہلا حکم تبلیغ کا نہیں تھا، بلکہ رات میں کھڑے رہنے کا تھا: 'رات میں نماز کے لیے اٹھو۔' مشن سے پہلے تربیت آتی ہے۔ جو قرآن کو دنیا تک پہنچانے والے تھے، انہیں پہلے اندھیرے میں خود کو اس سے بھرنا تھا۔",
      }
    },
    74: {
      type: lang==='ur'?'آغاز':lang==='hi'?'आग़ाज़':'Beginning',
      text: {
        en: "Al-Muddaththir — the Covered One — contains the first open command of da'wah: 'Arise and warn!' The private phase of Islam had ended. The Prophet ﷺ was now told to stand up publicly. It also describes Saqar — Hell — in stark terms. The warning is real. The caller must feel its weight.",
        hi: "अल-मुद्दस्सिर — ओढ़ने वाले — में दावत का पहला खुला हुक्म है: 'उठो और ख़बरदार करो!' इस्लाम का ख़ानगी दौर ख़त्म हो गया था। नबी ﷺ को अब खुल कर खड़े होने का हुक्म हुआ। इसमें सक़र — जहन्नम — का भी बेलाग बयान है। चेतावनी सच्ची है। दावत देने वाले को इसका बोझ महसूस होना चाहिए।",
        ur: "المدثر — اوڑھنے والے — میں دعوت کا پہلا کھلا حکم ہے: 'اٹھو اور خبردار کرو!' اسلام کا خانگی دور ختم ہو گیا تھا۔ نبی ﷺ کو اب کھل کر کھڑے ہونے کا حکم ہوا۔ اس میں سقر — جہنم — کا بھی بے لاگ بیان ہے۔ تنبیہ سچی ہے۔ داعی کو اس کا بوجھ محسوس ہونا چاہیے۔",
      }
    },
    75: {
      type: lang==='ur'?'حساب':lang==='hi'?'हिसाब':'Reckoning',
      text: {
        en: "Al-Qiyamah tells us that on the Day of Resurrection, man will be a witness against himself — even if he presents his excuses. And it asks: 'Does man think that We will not assemble his bones?' Then: 'Yes — We are able to proportion even his fingertips.' Even your fingerprints are a proof of Allah's power of restoration.",
        hi: "अल-क़ियामह बताती है कि क़यामत के दिन इंसान ख़ुद अपने ख़िलाफ़ गवाह होगा — चाहे वो कितने भी उज़्र पेश करे। और पूछती है: 'क्या इंसान समझता है कि हम उसकी हड्डियाँ जमा नहीं कर सकते?' फिर: 'हाँ — हम उसकी उँगलियों के पोर तक दुरुस्त करने में माहिर हैं।' यहाँ तक कि तुम्हारे फ़िंगरप्रिंट अल्लाह की क़ुदरत की दलील हैं।",
        ur: "القیامہ بتاتی ہے کہ قیامت کے دن انسان خود اپنے خلاف گواہ ہوگا — چاہے وہ کتنے بھی عذر پیش کرے۔ اور پوچھتی ہے: 'کیا انسان سمجھتا ہے کہ ہم اس کی ہڈیاں جمع نہیں کر سکتے؟' پھر: 'ہاں — ہم اس کی انگلیوں کے پور تک درست کرنے میں ماہر ہیں۔' یہاں تک کہ تمہارے فنگرپرنٹ اللہ کی قدرت کی دلیل ہیں۔",
      }
    },
    76: {
      type: lang==='ur'?'جنت':lang==='hi'?'जन्नत':'Paradise',
      text: {
        en: "Al-Insan paints the most vivid picture of Paradise in the Qur'an: green gardens, flowing rivers, silk and brocade, a ginger-spiced drink from the spring of Salsabil. And the most intimate reward of all: 'And their Lord will give them to drink a purifying drink.' Even the flavour of Jannah is described.",
        hi: "अल-इंसान क़ुरआन में जन्नत की सबसे ज़िंदा तस्वीर खींचती है: हरे बाग़, बहते दरिया, रेशम और दीबाज, सलसबील के चश्मे की ज़ंजबील वाली मशरूब। और सबसे क़रीबी इनाम: 'और उनका रब उन्हें पाक मशरूब पिलाएगा।' जन्नत का ज़ायक़ा भी बयान है।",
        ur: "الانسان قرآن میں جنت کی سب سے زندہ تصویر کھینچتی ہے: ہرے باغ، بہتے دریا، ریشم اور دیباج، سلسبیل کے چشمے کی زنجبیل والی مشروب۔ اور سب سے قریبی انعام: 'اور ان کا رب انہیں پاک مشروب پلائے گا۔' جنت کا ذائقہ بھی بیان ہے۔",
      }
    },
    77: {
      type: lang==='ur'?'تنبیہ':lang==='hi'?'तंबीह':'Warning',
      text: {
        en: "Al-Mursalat repeats 'Woe that Day to the deniers' ten times — like ten hammer blows, one after another. Each time it follows a different scene: the winds, the Day of Separation, the destruction of nations. Ten warnings. Ten chances to reflect. The Qur'an never gives up on the human heart.",
        hi: "अल-मुर्सलात में 'उस दिन झुठलाने वालों के लिए तबाही है' दस बार दोहराया गया — दस हथौड़े की चोटें, एक के बाद एक। हर बार एक अलग मंज़र के बाद: हवाएँ, फ़ैसले का दिन, क़ौमों की हलाकत। दस चेतावनियाँ। दस मौक़े सोचने के। क़ुरआन इंसानी दिल से कभी नहीं थकता।",
        ur: "المرسلات میں 'اس دن جھٹلانے والوں کے لیے تباہی ہے' دس بار دہرایا گیا — دس ہتھوڑے کی چوٹیں، ایک کے بعد ایک۔ ہر بار ایک الگ منظر کے بعد: ہوائیں، فیصلے کا دن، قوموں کی ہلاکت۔ دس تنبیہات۔ دس مواقع سوچنے کے۔ قرآن انسانی دل سے کبھی نہیں تھکتا۔",
      }
    },
    10: {
      type: lang==='ur'?'اطمینان':lang==='hi'?'इत्मीनान':'Reassurance',
      text: {
        en: "Yunus opens with a profound truth: the Prophet ﷺ himself was told to say 'I have no power to harm or benefit myself.' Even the greatest human being was completely dependent on Allah. That is not weakness — it is the highest station.",
        hi: "यूनुस एक गहरी सच्चाई से खुलती है: नबी ﷺ से ख़ुद कहलवाया गया कि 'मुझे अपने नफ़े-नुक़सान का कोई इख़्तियार नहीं।' इंसानों में सबसे अज़ीम हस्ती भी पूरी तरह अल्लाह पर मुनहसर थी। यह कमज़ोरी नहीं — यही सबसे बड़ा मक़ाम है।",
        ur: "یونس ایک گہری سچائی سے کھلتی ہے: نبی ﷺ سے خود کہلوایا گیا کہ 'مجھے اپنے نفع نقصان کا کوئی اختیار نہیں۔' انسانوں میں سب سے عظیم ہستی بھی پوری طرح اللہ پر منحصر تھی۔ یہ کمزوری نہیں — یہی سب سے بڑا مقام ہے۔",
      }
    },
    11: {
      type: lang==='ur'?'صبر':lang==='hi'?'सब्र':'Patience',
      text: {
        en: "Surah Hud shook the Prophet ﷺ so much that he said: 'Hud and its sisters have made my hair turn grey.' It contains the story of Nuh's 950 years of preaching — and only 80 believers. Steadfastness is not measured by results.",
        hi: "सूरह हूद ने नबी ﷺ को इतना हिला दिया कि आपने फ़रमाया: 'हूद और उस जैसी सूरहों ने मेरे बाल सफ़ेद कर दिए।' इसमें नूह के 950 साल की दावत की कहानी है — और सिर्फ़ 80 ईमानवाले। इस्तिक़ामत का पैमाना नतीजे नहीं होते।",
        ur: "سورہ ہود نے نبی ﷺ کو اتنا ہلا دیا کہ آپ نے فرمایا: 'ہود اور اس جیسی سورتوں نے میرے بال سفید کر دیے۔' اس میں نوح کے 950 سال کی دعوت کی کہانی ہے — اور صرف 80 ایماندار۔ استقامت کا پیمانہ نتائج نہیں ہوتے۔",
      }
    },
    12: {
      type: lang==='ur'?'بہترین قصہ':lang==='hi'?'बेहतरीन क़िस्सा':'Best of Stories',
      text: {
        en: "Allah calls the story of Yusuf 'the best of stories' — betrayal, slavery, prison, power, and forgiveness all in one surah. The Prophet ﷺ recited it to the Ansar on the night of Hijrah. It is a complete manual on how to carry pain with dignity.",
        hi: "अल्लाह ने यूसुफ़ की कहानी को 'बेहतरीन क़िस्सा' कहा — धोखा, ग़ुलामी, क़ैद, हुकूमत, और माफ़ी — सब एक सूरह में। नबी ﷺ ने हिजरत की रात अनसार को यही सुनाई। यह तकलीफ़ को वक़ार से उठाने का मुकम्मल दस्तूर है।",
        ur: "اللہ نے یوسف کی کہانی کو 'بہترین قصہ' کہا — دھوکہ، غلامی، قید، حکومت، اور معافی — سب ایک سورہ میں۔ نبی ﷺ نے ہجرت کی رات انصار کو یہی سنائی۔ یہ تکلیف کو وقار سے اٹھانے کا مکمل دستور ہے۔",
      }
    },
    13: {
      type: lang==='ur'?'تسبیح':lang==='hi'?'तस्बीह':'Glorification',
      text: {
        en: "Ar-Ra'd contains one of the most quoted ayat in the Qur'an: 'Verily, with the remembrance of Allah do hearts find rest.' It was revealed in a time of mockery and disbelief — a reminder that inner peace is not dependent on outer acceptance.",
        hi: "अर-रअद में क़ुरआन की सबसे ज़्यादा उद्धृत आयतों में से एक है: 'बेशक अल्लाह की याद से ही दिलों को सुकून मिलता है।' यह मज़ाक़ और इनकार के दौर में नाज़िल हुई — याद दिलाती है कि अंदर का सुकून बाहर की क़ुबूलियत पर नहीं टिका।",
        ur: "الرعد میں قرآن کی سب سے زیادہ حوالہ دی جانے والی آیات میں سے ایک ہے: 'بے شک اللہ کی یاد سے ہی دلوں کو سکون ملتا ہے۔' یہ مذاق اور انکار کے دور میں نازل ہوئی — یاد دلاتی ہے کہ اندر کا سکون باہر کی قبولیت پر نہیں ٹکا۔",
      }
    },
    14: {
      type: lang==='ur'?'شکر':lang==='hi'?'शुक्र':'Gratitude',
      text: {
        en: "Ibrahim contains a stunning ayah: 'If you are grateful, I will surely increase you.' Allah is promising more — not just in blessings, but in capacity to receive them. Gratitude is not just manners; it is a growth mechanism built into creation.",
        hi: "इब्राहीम में एक हैरतअंगेज़ आयत है: 'अगर तुम शुक्र करोगे तो मैं तुम्हें और ज़्यादा दूँगा।' अल्लाह ज़्यादती का वादा कर रहे हैं — सिर्फ़ नेमतों में नहीं, बल्कि उन्हें समेटने की सलाहियत में भी। शुक्र सिर्फ़ अदब नहीं — यह कायनात में बनाया गया निज़ाम-ए-तरक़्क़ी है।",
        ur: "ابراہیم میں ایک حیرت انگیز آیت ہے: 'اگر تم شکر کرو گے تو میں تمہیں اور زیادہ دوں گا۔' اللہ زیادتی کا وعدہ کر رہے ہیں — صرف نعمتوں میں نہیں، بلکہ انہیں سمیٹنے کی صلاحیت میں بھی۔ شکر صرف ادب نہیں — یہ کائنات میں بنایا گیا نظامِ ترقی ہے۔",
      }
    },
    15: {
      type: lang==='ur'?'حفاظت':lang==='hi'?'हिफ़ाज़त':'Preservation',
      text: {
        en: "Al-Hijr contains Allah's direct promise: 'Indeed, it is We who sent down the Reminder, and indeed, We will be its guardian.' No book in history has been preserved like the Qur'an — across 1,400 years, millions of memorizers, zero contradictions.",
        hi: "अल-हिज्र में अल्लाह का सीधा वादा है: 'बेशक हमने ही ज़िक्र नाज़िल किया और हम ही इसके निगहबान हैं।' तारीख़ में कोई किताब क़ुरआन जैसी महफ़ूज़ नहीं — 1,400 साल, लाखों हाफ़िज़, कोई इख़्तिलाफ़ नहीं।",
        ur: "الحجر میں اللہ کا براہ راست وعدہ ہے: 'بے شک ہم نے ہی ذکر نازل کیا اور ہم ہی اس کے نگہبان ہیں۔' تاریخ میں کوئی کتاب قرآن جیسی محفوظ نہیں — 1,400 سال، لاکھوں حافظ، کوئی اختلاف نہیں۔",
      }
    },
    16: {
      type: lang==='ur'?'نعمت':lang==='hi'?'नेमत':'Blessing',
      text: {
        en: "An-Nahl is called 'Surah of Blessings' — it lists honey, milk, ships, cattle, fruits, and rain as signs of Allah. The bee is singled out: it receives divine inspiration (wahy), builds with precision, and produces healing. Small creatures carry immense wisdom.",
        hi: "अन-नह्ल को 'नेमतों की सूरह' कहते हैं — इसमें शहद, दूध, कश्तियाँ, मवेशी, फल और बारिश को अल्लाह की निशानियाँ बताया गया। मधुमक्खी को ख़ास तौर पर ज़िक्र किया: उसे अल्लाह की वह्य आती है, वो हिकमत से बनाती है, और शिफ़ा देती है।",
        ur: "النحل کو 'نعمتوں کی سورہ' کہتے ہیں — اس میں شہد، دودھ، کشتیاں، مویشی، پھل اور بارش کو اللہ کی نشانیاں بتایا گیا۔ شہد کی مکھی کو خاص طور پر ذکر کیا: اسے اللہ کی وحی آتی ہے، وہ حکمت سے بناتی ہے، اور شفا دیتی ہے۔",
      }
    },
    17: {
      type: lang==='ur'?'معراج':lang==='hi'?'मेराज':'Ascension',
      text: {
        en: "Al-Isra opens with the night journey — from Makkah to Jerusalem in one night, then to the heavens. It also contains the 17 commandments of Islam: honor parents, don't be wasteful, don't be arrogant. The miracle and the morality come in the same surah.",
        hi: "अल-इसरा इसराए-मेराज से खुलती है — एक रात में मक्के से बैत-उल-मक़दिस, फिर आसमानों तक। इसमें इस्लाम की 17 बुनियादी हिदायतें भी हैं: माँ-बाप की इज़्ज़त, फ़ुज़ूलख़र्ची से बचो, घमंड मत करो। मोजिज़ा और अख़लाक़ एक ही सूरह में।",
        ur: "الاسراء اسراء و معراج سے کھلتی ہے — ایک رات میں مکے سے بیت المقدس، پھر آسمانوں تک۔ اس میں اسلام کی 17 بنیادی ہدایات بھی ہیں: ماں باپ کی عزت، فضول خرچی سے بچو، غرور مت کرو۔ معجزہ اور اخلاق ایک ہی سورہ میں۔",
      }
    },
    18: {
      type: lang==='ur'?'حفاظت':lang==='hi'?'हिफ़ाज़त':'Protection',
      text: {
        en: "Al-Kahf is the Friday surah — recited every week as a shield against Dajjal. Its four stories (the Sleepers, Khidr, Dhul-Qarnayn, the Two Gardens) all share one theme: true wealth is faith, not gold. The last ten ayat protect from the greatest trial of the end times.",
        hi: "अल-कहफ़ जुमे की सूरह है — हर हफ़्ते दज्जाल से बचाव के लिए पढ़ी जाती है। इसके चार क़िस्से (अस्हाब-ए-कहफ़, ख़िज्र, ज़ुलक़रनैन, दो बाग़ों वाला) सब एक ही सबक़ पर हैं: असली दौलत ईमान है, सोना नहीं।",
        ur: "الکہف جمعے کی سورہ ہے — ہر ہفتے دجال سے بچاؤ کے لیے پڑھی جاتی ہے۔ اس کے چار قصے (اصحابِ کہف، خضر، ذوالقرنین، دو باغوں والا) سب ایک ہی سبق پر ہیں: اصلی دولت ایمان ہے، سونا نہیں۔",
      }
    },
    19: {
      type: lang==='ur'?'رحمت':lang==='hi'?'रहमत':'Mercy',
      text: {
        en: "Maryam is the only surah named after a woman — and she is the only woman named by name in the Qur'an. When the Abyssinian king Negus heard its opening ayat about Yahya and Isa, he wept until his beard was wet and said: 'The difference between what you say and what we say is no more than this' — and drew a line on the ground.",
        hi: "मरयम एकमात्र सूरह है जिसका नाम एक औरत पर है — और वो क़ुरआन में नाम से ज़िक्र होने वाली एकमात्र औरत हैं। जब हबशा के बादशाह नजाशी ने याह्या और ईसा के बारे में इसकी शुरुआती आयतें सुनीं तो वो इतना रोए कि दाढ़ी भीग गई।",
        ur: "مریم واحد سورہ ہے جس کا نام ایک عورت پر ہے — اور وہ قرآن میں نام سے ذکر ہونے والی واحد عورت ہیں۔ جب حبشہ کے بادشاہ نجاشی نے یحییٰ اور عیسیٰ کے بارے میں اس کی ابتدائی آیات سنیں تو وہ اتنا روئے کہ داڑھی بھیگ گئی۔",
      }
    },
    20: {
      type: lang==='ur'?'تسلی':lang==='hi'?'तसल्ली':'Comfort',
      text: {
        en: "Ta-Ha was revealed when the Prophet ﷺ was exhausted from night worship. Allah opens with: 'We have not sent down the Qur'an to distress you.' Umar ibn al-Khattab heard this surah being recited and it broke his heart — leading directly to his Islam.",
        hi: "ता-हा तब नाज़िल हुई जब नबी ﷺ रात की इबादत से थक गए थे। अल्लाह शुरू में फ़रमाते हैं: 'हमने क़ुरआन तुम पर इसलिए नहीं उतारा कि तुम तकलीफ़ में पड़ो।' उमर इब्न ख़त्ताब ने यही सूरह सुनी — और यही उनके इस्लाम का सबब बनी।",
        ur: "طٰہٰ تب نازل ہوئی جب نبی ﷺ رات کی عبادت سے تھک گئے تھے۔ اللہ شروع میں فرماتے ہیں: 'ہم نے قرآن تم پر اس لیے نہیں اتارا کہ تم تکلیف میں پڑو۔' عمر بن خطاب نے یہی سورہ سنی — اور یہی ان کے اسلام کا سبب بنی۔",
      }
    },
    21: {
      type: lang==='ur'?'قربت':lang==='hi'?'क़ुर्बत':'Nearness',
      text: {
        en: "Al-Anbiya lists 16 prophets in one surah — from Ibrahim to Dhul-Kifl. All of them cried out to Allah in moments of desperation and were answered. The surah ends with a promise: 'The earth shall be inherited by My righteous servants.'",
        hi: "अल-अंबिया एक सूरह में 16 नबियों का ज़िक्र करती है — इब्राहीम से लेकर ज़ुल-किफ़्ल तक। सबने मुसीबत के लम्हों में अल्लाह को पुकारा और जवाब पाया। सूरह इस वादे पर ख़त्म होती है: 'ज़मीन के वारिस मेरे नेक बंदे होंगे।'",
        ur: "الانبیاء ایک سورہ میں 16 نبیوں کا ذکر کرتی ہے — ابراہیم سے لے کر ذوالکفل تک۔ سب نے مصیبت کے لمحوں میں اللہ کو پکارا اور جواب پایا۔ سورہ اس وعدے پر ختم ہوتی ہے: 'زمین کے وارث میرے نیک بندے ہوں گے۔'",
      }
    },
    22: {
      type: lang==='ur'?'عظمت':lang==='hi'?'अज़मत':'Greatness',
      text: {
        en: "Al-Hajj contains the only ayah in the Qur'an where Allah commands both the Prophet ﷺ and the believers to make sujood — making it one of the obligatory prostration verses. It also paints the scene of the Day of Judgment so vividly that 'every nursing mother will forget her infant.'",
        hi: "अल-हज्ज में एकमात्र ऐसी आयत है जहाँ अल्लाह नबी ﷺ और मोमिनीन दोनों को सजदे का हुक्म देते हैं। इसमें क़यामत का मंज़र इतना साफ़ खींचा है कि 'हर दूध पिलाने वाली माँ अपने बच्चे को भूल जाएगी।'",
        ur: "الحج میں واحد ایسی آیت ہے جہاں اللہ نبی ﷺ اور مومنین دونوں کو سجدے کا حکم دیتے ہیں۔ اس میں قیامت کا منظر اتنا واضح کھینچا ہے کہ 'ہر دودھ پلانے والی ماں اپنے بچے کو بھول جائے گی۔'",
      }
    },
    23: {
      type: lang==='ur'?'کامیابی':lang==='hi'?'कामयाबी':'Success',
      text: {
        en: "Al-Mu'minun opens with ten qualities of the successful believers — beginning with khushu' in salah and ending with guarding one's chastity. The Prophet ﷺ said these ayat were more beloved to him than everything the sun rises over. A complete blueprint for a life of falah.",
        hi: "अल-मोमिनून कामयाब मोमिनों की दस सिफ़तों से खुलती है — नमाज़ में ख़ुशू से शुरू होकर पाकदामनी पर ख़त्म। नबी ﷺ ने फ़रमाया ये आयतें उन्हें सूरज की रोशनी में आने वाली हर चीज़ से ज़्यादा पसंद हैं। फ़लाह की पूरी नक़्शे-राह।",
        ur: "المومنون کامیاب مومنوں کی دس صفات سے کھلتی ہے — نماز میں خشوع سے شروع ہو کر پاکدامنی پر ختم۔ نبی ﷺ نے فرمایا یہ آیات انہیں سورج کی روشنی میں آنے والی ہر چیز سے زیادہ پسند ہیں۔ فلاح کا مکمل نقشۂ راہ۔",
      }
    },
    24: {
      type: lang==='ur'?'نور':lang==='hi'?'नूर':'Light',
      text: {
        en: "An-Nur contains the famous Ayat an-Nur — 'Allah is the Light of the heavens and the earth.' It also legislated hijab, established protocols for accusations of adultery, and cleared A'isha ؓ of slander through direct revelation. Divine light and divine justice in one surah.",
        hi: "अन-नूर में मशहूर आयत-उन-नूर है — 'अल्लाह आसमानों और ज़मीन का नूर है।' इसमें हिजाब का हुक्म, बदकारी के इल्ज़ाम के अहकाम, और वह्य के ज़रिए हज़रत आयशा ؓ की बेगुनाही भी है। एक ही सूरह में इलाही नूर और इलाही इंसाफ़।",
        ur: "النور میں مشہور آیۃ النور ہے — 'اللہ آسمانوں اور زمین کا نور ہے۔' اس میں حجاب کا حکم، بدکاری کے الزام کے احکام، اور وحی کے ذریعے حضرت عائشہ ؓ کی بے گناہی بھی ہے۔ ایک ہی سورہ میں الٰہی نور اور الٰہی انصاف۔",
      }
    },
    2: {
      type: lang==='ur'?'عظمت':lang==='hi'?'अज़मत':'Greatness',
      text: {
        en: "Al-Baqarah is the longest surah in the Qur'an — 286 ayat. The Prophet ﷺ said it contains the greatest ayah ever revealed: Ayat al-Kursi. Reciting it in your home keeps Shaytan away for three days.",
        hi: "अल-बक़रह क़ुरआन की सबसे लंबी सूरह है — 286 आयतें। नबी ﷺ ने फ़रमाया इसमें सबसे अज़ीम आयत है: आयत-उल-कुर्सी। घर में इसकी तिलावत तीन दिन तक शैतान को दूर रखती है।",
        ur: "البقرہ قرآن کی سب سے لمبی سورہ ہے — 286 آیات۔ نبی ﷺ نے فرمایا اس میں سب سے عظیم آیت ہے: آیۃ الکرسی۔ گھر میں اس کی تلاوت تین دن تک شیطان کو دور رکھتی ہے۔",
      }
    },
    3: {
      type: lang==='ur'?'قیامت':lang==='hi'?'क़यामत':'Intercession',
      text: {
        en: "Al Imran and Al-Baqarah are called 'the two lights' (Az-Zahrawain) by the Prophet ﷺ — they will come on the Day of Judgment like two clouds or flocks of birds shading their companion.",
        hi: "आल इमरान और अल-बक़रह को नबी ﷺ ने 'दो नूर' (अज़-ज़हरावैन) कहा — क़यामत के दिन वो दो बादलों या परिंदों के झुंड की तरह अपने साथी पर साया करेंगी।",
        ur: "آل عمران اور البقرہ کو نبی ﷺ نے 'دو نور' (الزہراوین) کہا — قیامت کے دن وہ دو بادلوں یا پرندوں کے جھنڈ کی طرح اپنے ساتھی پر سایہ کریں گی۔",
      }
    },
    4: {
      type: lang==='ur'?'انصاف':lang==='hi'?'इंसाफ़':'Justice',
      text: {
        en: "An-Nisa was revealed in Madinah and transformed society — giving women inheritance rights, legal protections, and dignity at a time when the world buried daughters alive. Allah legislated justice 1,400 years before modern rights movements.",
        hi: "अन-निसा मदीने में नाज़िल हुई और उसने समाज को बदल दिया — औरतों को विरासत का हक़, क़ानूनी हिफ़ाज़त और इज़्ज़त दी, उस वक़्त जब दुनिया बेटियों को ज़िंदा दफ़न करती थी।",
        ur: "النساء مدینے میں نازل ہوئی اور اس نے معاشرے کو بدل دیا — عورتوں کو وراثت کا حق، قانونی تحفظ اور عزت دی، اس وقت جب دنیا بیٹیوں کو زندہ دفن کرتی تھی۔",
      }
    },
    5: {
      type: lang==='ur'?'عہد':lang==='hi'?'अहद':'Covenant',
      text: {
        en: "Al-Ma'idah was one of the last surahs revealed — containing the ayah: 'Today I have perfected your religion for you.' The final revelation came not with rules, but with completion and gratitude.",
        hi: "अल-माइदा आख़िरी नाज़िल होने वाली सूरहों में से है — इसमें वो आयत है: 'आज मैंने तुम्हारे लिए तुम्हारा दीन मुकम्मल कर दिया।' आख़िरी वह्य अहकाम से नहीं, तकमील और शुक्र से आई।",
        ur: "المائدہ آخری نازل ہونے والی سورتوں میں سے ہے — اس میں وہ آیت ہے: 'آج میں نے تمہارے لیے تمہارا دین مکمل کر دیا۔' آخری وحی احکام سے نہیں، تکمیل اور شکر سے آئی۔",
      }
    },
    6: {
      type: lang==='ur'?'توحید':lang==='hi'?'तौहीद':'Oneness',
      text: {
        en: "Al-An'am was revealed in one night in Makkah — all 165 ayat descended together, accompanied by 70,000 angels. It is a towering argument for the Oneness of Allah against the polytheism of Arabia.",
        hi: "अल-अनआम मक्के में एक ही रात में नाज़िल हुई — तमाम 165 आयतें एक साथ, 70,000 फ़रिश्तों के साथ। ये अरब के शिर्क के ख़िलाफ़ अल्लाह की वहदानियत की ज़बरदस्त दलील है।",
        ur: "الانعام مکے میں ایک ہی رات میں نازل ہوئی — تمام 165 آیات ایک ساتھ، 70,000 فرشتوں کے ساتھ۔ یہ عرب کے شرک کے خلاف اللہ کی وحدانیت کی زبردست دلیل ہے۔",
      }
    },
    7: {
      type: lang==='ur'?'تاریخ':lang==='hi'?'तारीख़':'History',
      text: {
        en: "Al-A'raf tells the full story of Adam, Iblis, Nuh, Hud, Salih, Lut, and Musa — nation after nation that was given a chance and refused. It is a warning written in the ink of history.",
        hi: "अल-आराफ़ में आदम, इबलीस, नूह, हूद, सालेह, लूत और मूसा की पूरी कहानियाँ हैं — एक के बाद एक क़ौमें जिन्हें मौक़ा दिया गया और उन्होंने इनकार किया। यह तारीख़ की स्याही से लिखी गई चेतावनी है।",
        ur: "الاعراف میں آدم، ابلیس، نوح، ہود، صالح، لوط اور موسیٰ کی پوری کہانیاں ہیں — ایک کے بعد ایک قومیں جنہیں موقع دیا گیا اور انہوں نے انکار کیا۔ یہ تاریخ کی سیاہی سے لکھی گئی تنبیہ ہے۔",
      }
    },
    8: {
      type: lang==='ur'?'غیبی مدد':lang==='hi'?'ग़ैबी मदद':'Divine Aid',
      text: {
        en: "Al-Anfal was revealed after Badr — the first great battle of Islam. 313 poorly-armed believers defeated 1,000 soldiers. Allah sent angels to fight alongside them. This surah documents the miracle.",
        hi: "अल-अनफ़ाल बद्र के बाद नाज़िल हुई — इस्लाम की पहली बड़ी जंग। 313 कम-हथियारबंद मोमिन 1,000 सिपाहियों पर ग़ालिब आए। अल्लाह ने उनके साथ लड़ने के लिए फ़रिश्ते भेजे। यह सूरह उस मोजिज़े की दस्तावेज़ है।",
        ur: "الانفال بدر کے بعد نازل ہوئی — اسلام کی پہلی بڑی جنگ۔ 313 کم ہتھیار بند مومن 1,000 سپاہیوں پر غالب آئے۔ اللہ نے ان کے ساتھ لڑنے کے لیے فرشتے بھیجے۔ یہ سورہ اس معجزے کی دستاویز ہے۔",
      }
    },
    9: {
      type: lang==='ur'?'براءت':lang==='hi'?'बेज़ारी':'Disavowal',
      text: {
        en: "At-Tawbah is the only surah without Bismillah at its start — scholars say it opens with a declaration of war against hypocrisy, so there was no room for mercy in its opening. It ends, however, with the most tender description of the Prophet ﷺ.",
        hi: "अत-तौबह एकमात्र सूरह है जिसकी शुरुआत बिस्मिल्लाह से नहीं होती — उलमा कहते हैं ये मुनाफ़िक़त के ख़िलाफ़ जंग के ऐलान से खुलती है, इसलिए शुरुआत में रहमत की गुंजाइश नहीं थी। लेकिन ख़त्म होती है नबी ﷺ की सबसे मुहब्बत भरी तारीफ़ से।",
        ur: "التوبہ واحد سورہ ہے جس کی شروعات بسم اللہ سے نہیں ہوتی — علماء کہتے ہیں یہ منافقت کے خلاف اعلانِ جنگ سے کھلتی ہے، اس لیے شروع میں رحمت کی گنجائش نہیں تھی۔ لیکن ختم ہوتی ہے نبی ﷺ کی سب سے محبت بھری تعریف سے۔",
      }
    },
    1: {
      type: lang==='ur'?'معجزہ':lang==='hi'?'मोजिज़ा':'Miracle',
      text: {
        en: "Al-Fatiha is recited at least 17 times every day in salah. You already carry the most repeated text in human history.",
        hi: "सूरह फ़ातिहा नमाज़ में हर दिन कम से कम 17 बार पढ़ी जाती है। आप पहले से इंसानी तारीख़ का सबसे ज़्यादा दोहराया जाने वाला मतन दिल में रखते हैं।",
        ur: "سورہ فاتحہ نماز میں ہر روز کم از کم 17 بار پڑھی جاتی ہے۔ آپ پہلے سے انسانی تاریخ کا سب سے زیادہ دہرایا جانے والا متن دل میں رکھتے ہیں۔",
      }
    },
    103: {
      type: lang==='ur'?'حکمت':lang==='hi'?'हिकमत':'Wisdom',
      text: {
        en: "Imam Al-Shafi'i said: 'If people pondered only Surah Al-Asr, it would be enough for them.' — just 3 ayat, entire human guidance.",
        hi: "इमाम शाफ़िई ने कहा: 'अगर लोग सिर्फ़ सूरह अल-अस्र पर ग़ौर करें, तो यही उनके लिए काफ़ी है।' — सिर्फ़ 3 आयतें, पूरी इंसानी रहनुमाई।",
        ur: "امام شافعی نے کہا: 'اگر لوگ صرف سورہ عصر پر غور کریں تو یہی ان کے لیے کافی ہے۔' — صرف 3 آیات، پوری انسانی رہنمائی۔",
      }
    },
    108: {
      type: lang==='ur'?'بشارت':lang==='hi'?'ख़ुशख़बरी':'Good News',
      text: {
        en: "Al-Kawthar — 3 ayat — revealed as consolation to the Prophet ﷺ when his enemies mocked him. His name lives forever; theirs are forgotten.",
        hi: "अल-कौसर — 3 आयतें — नबी ﷺ को तसल्ली में नाज़िल हुई जब दुश्मनों ने मज़ाक़ उड़ाया। उनका नाम क़यामत तक ज़िंदा है; दुश्मनों के नाम भुला दिए गए।",
        ur: "الکوثر — 3 آیات — نبی ﷺ کو تسلی کے طور پر نازل ہوئی جب دشمنوں نے مذاق اڑایا۔ ان کا نام قیامت تک زندہ ہے؛ دشمنوں کے نام بھلا دیے گئے۔",
      }
    },
  };

  const gem = gems[surahNum];
  if (gem) return { type: gem.type, text: gem.text[lang] || gem.text.en };

  // Default gem
  return {
    type: lang==='ur'?'قرآن':lang==='hi'?'क़ुरआन':'Qur\'an',
    text: lang==='ur'
      ? 'آپ اللہ کے کلام کو محفوظ کر رہے ہیں — وہی الفاظ جو 1400 سال پہلے نازل ہوئے۔'
      : lang==='hi'
      ? 'आप अल्लाह के कलाम को महफ़ूज़ कर रहे हैं — वही अल्फ़ाज़ जो 1400 साल पहले नाज़िल हुए।'
      : 'You are preserving the words of Allah — the exact same words revealed 1,400 years ago.',
  };
}

// ── Window handlers ───────────────────────────────────────────
window.sessNext = function() {
  stopAudio();
  if (S.stage < TOTAL_STEPS - 1) {
    S.stage++;
    S._revealIdx  = 0;
    S._blankIdx   = undefined;
    S._blankAnswered = false;
    S._repDone    = 0;
    S._repPhase   = 'pick';
    S._flRevealed = new Set();
    _renderStage();
  }
};

window.sessWordNext = function() {
  if (S.wordIdx < S.words.length - 1) {
    S.wordIdx++;
    _renderStage();
  }
};

window.sessWordBack = function() {
  if (S.wordIdx > 0) {
    S.wordIdx--;
    _renderStage();
  }
};

window.sessPracticeNext = function() {
  if (S.practiceIdx < 4) {
    S.practiceIdx++;
    S._revealIdx  = 0;
    S._blankIdx   = undefined;
    S._repDone    = 0;
    S._repPhase   = 'pick';
    S._flRevealed = new Set();
    _renderStage();
  } else {
    window.sessNext();
  }
};

window.flReveal = function(idx) {
  if (!S._flRevealed) S._flRevealed = new Set();
  S._flRevealed.add(idx);
  // Always re-render: simple, reliable, no fragile DOM surgery.
  // The stage is fast to render and the transition feels snappy.
  _renderStage();
};

window.flRevealAll = function() {
  if (!S._flRevealed) S._flRevealed = new Set();
  S.words.forEach((_, i) => S._flRevealed.add(i));
  _renderStage();
};

window.chainConfirm = function() {
  S._chainPhase    = 'done';
  S._chainRevealed = false; // hide on confirm
  // Award chain bonus XP
  const bonus = XP.CHAIN_BONUS || 5;
  addXP(bonus);
  S.xpEarned += bonus;
  // Update XP display in session bar
  const xpEl = document.getElementById('sess-xp');
  if (xpEl) xpEl.textContent = `+${S.xpEarned} XP`;
  _renderStage();
};

window.chainToggleReveal = function() {
  S._chainRevealed = !S._chainRevealed;
  _renderStage();
};

window.chainSkip = function() {
  S._chainPhase    = 'done';
  S._chainRevealed = false;
  _renderStage();
};

window.revealNext = function() {
  if (S._revealIdx === undefined) S._revealIdx = 0;
  const idx = S._revealIdx;

  // Animate the specific word in-place — no full re-render
  const spans = document.querySelectorAll('#reveal-ayah .practice-word');
  if (spans[idx]) {
    spans[idx].classList.remove('hidden');
    spans[idx].classList.add('revealed');
    spans[idx].removeAttribute('onclick');
    // Remove onclick from next hidden word to handle tap
    if (spans[idx + 1]) {
      spans[idx + 1].setAttribute('onclick', 'revealNext()');
    }
  }

  S._revealIdx++;

  // If all revealed, swap button
  if (S._revealIdx >= S.words.length) {
    const btn = document.querySelector('#reveal-ayah')
      ?.closest('div')?.nextElementSibling?.querySelector('button');
    // Re-render just the button area
    const btnContainer = document.querySelector('.reveal-btn-area');
    if (btnContainer) {
      btnContainer.innerHTML = `
        <button class="btn btn-primary" onclick="sessPracticeNext()">
          ${S.lang==='ur'?'اگلا مشق':S.lang==='hi'?'अगली मश्क़':'Next practice'} →
        </button>
      `;
    }
    // Full re-render only needed when button state changes
    _renderStage();
  }
};

window.lrReveal = function() {
  const cover = document.getElementById('lr-cover');
  if (cover) cover.style.display = 'none';
};

window.checkBlank = function(selectedEnc, correctEnc) {
  const selected = decodeURIComponent(selectedEnc);
  const correct  = decodeURIComponent(correctEnc);
  const isCorrect = selected === correct;

  // Visual feedback on buttons
  document.querySelectorAll('.choice-btn').forEach(btn => {
    const word = decodeURIComponent(btn.getAttribute('onclick').match(/'([^']+)'/)?.[1] || '');
    if (word === correct) btn.classList.add('correct-choice');
    else if (word === selected && !isCorrect) btn.classList.add('wrong-choice');
    btn.disabled = true;
  });

  // Record mistake for heatmap — track the blank word's position
  if (!isCorrect && S._blankIdx !== undefined) {
    recordMistake(S.surahNum, S.ayahNum, S._blankIdx);
  }

  // Reveal the blank slot with animation
  const slot = document.getElementById('blank-slot');
  if (slot) {
    slot.textContent = correct;
    slot.classList.add(isCorrect ? 'filled-correct' : 'filled-correct');
    slot.style.cssText += ';padding:0 6px;font-family:var(--font-arabic);font-size:0.85em;' +
      `color:${isCorrect ? 'var(--correct-text)' : 'var(--correct-text)'}`;
  }

  // Feedback + next button
  const fb = document.getElementById('blank-feedback');
  if (fb) {
    fb.innerHTML = `
      <div class="feedback ${isCorrect?'correct':'wrong'}" style="margin-bottom:12px;">
        ${isCorrect
          ? (S.lang==='ur'?'بہت اچھے! ✓':S.lang==='hi'?'बहुत अच्छे! ✓':'Excellent! ✓')
          : (S.lang==='ur'?'یہ رہا صحیح لفظ':S.lang==='hi'?'सही लफ़्ज़ यह है':'The correct word is shown above')}
      </div>
      <button class="btn btn-primary" onclick="sessPracticeNext()">
        ${S.lang==='ur'?'آگے':S.lang==='hi'?'आगे':'Continue'} →
      </button>
    `;
  }
};

// ── Rep mode handlers ─────────────────────────────────────────

// User taps a count button on the pick screen
window.repSetTarget = function(n) {
  S._repTarget = n;
  // Highlight selected button without full re-render
  document.querySelectorAll('.rep-count-btn').forEach(btn => {
    const isSelected = Number(btn.dataset.count) === n;
    btn.classList.toggle('rep-count-active', isSelected);
  });
};

// User taps "Begin" — switch from pick to reciting phase
window.repBegin = function() {
  S._repPhase = 'reciting';
  S._repDone  = 0;
  _renderStage();
};

// User taps ✓ after each recitation — increment counter
window.repConfirm = function() {
  S._repDone++;
  const done   = S._repDone;
  const target = S._repTarget;
  const allDone = done >= target;

  // Animate the bead ring in-place (no full re-render flicker)
  const svg = document.querySelector('.bead-ring');
  if (svg) {
    const cap  = Math.min(target, 14);
    const circles = svg.querySelectorAll('circle:not(:first-child)'); // skip track ring
    const filled  = Math.round((done / target) * cap);
    circles.forEach((c, i) => {
      if (i < filled) {
        c.setAttribute('fill', 'var(--gold)');
        c.setAttribute('r', '8');
      }
    });
  }

  // Update the counter number
  const counter = document.querySelector('.bead-ring-wrap + div');
  if (counter) {
    const spans = counter.querySelectorAll('span');
    // First text node is the done count
    counter.childNodes[0].textContent = done;
  }

  // If all reps done — re-render to show seal button
  if (allDone) {
    // Brief pulse on the ring before re-rendering
    setTimeout(() => _renderStage(), 400);
  } else {
    // Pulse the confirm button as tactile feedback
    const btn = document.querySelector('.rep-confirm-btn');
    if (btn) {
      btn.style.transform = 'scale(0.94)';
      btn.style.opacity   = '0.7';
      setTimeout(() => {
        if (btn) { btn.style.transform = ''; btn.style.opacity = ''; }
      }, 200);
    }
  }
};

// User wants to add one more rep after completing (optional extra)
window.repAddOne = function() {
  S._repDone--;
  _renderStage();
};


window.sessPlayAudio = function() {
  const btn = document.getElementById('play-btn');
  playAyah(S.surahNum, S.ayahNum, {
    onStart: () => { if (btn) btn.textContent = `⏹ ${t('stageListen', S.lang)}`; },
    onEnd:   () => { if (btn) btn.textContent = `▶ ${t('stageListen', S.lang)}`; },
  });
};

window.sessPlayWordAudio = function(wordIdx) {
  // Use audio_url from API if available (already correctly zero-padded)
  // e.g. "wbw/078_001_001.mp3" → prepend CDN base
  // _wordData is now a position-keyed map — look up by 1-based position
  const pos       = wordIdx + 1;
  const apiWord   = S._wordData?.[pos];
  const apiAudioUrl = apiWord?.audio_url
    ? `https://audio.qurancdn.com/${apiWord.audio_url}`
    : null;

  if (apiAudioUrl) {
    playWordFromUrl(apiAudioUrl);
  } else {
    // Fallback: build URL manually (1-based position)
    playWord(S.surahNum, S.ayahNum, wordIdx + 1);
  }
};

window.sessNextAyah = function() {
  stopAudio();
  S._chainPhase    = null;  // reset for next ayah
  S._chainRevealed = false;
  window._session = {
    surahNum:  S.surahNum,
    ayahNum:   S.ayahNum + 1,
    surahData: S.surahData,
  };
  showScreen('session');
};

window.exitSession = function() {
  stopAudio();
  showScreen('home');
};

// Load Alif index into window for word cards
fetch('js/data/alif-index.json')
  .then(r => r.json())
  .then(data => { window._alifIndex = data; })
  .catch(() => { window._alifIndex = {}; });
