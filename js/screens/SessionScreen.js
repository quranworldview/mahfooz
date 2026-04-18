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
import { fetchSurah, getAudioUrl, getReciter, fetchWordData } from '../services/QuranAPI.js';
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
  _wordData:   null,    // per-word API data: [{position, translation, transliteration, audio_url}]
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
  // Word position is 1-based; API data indexed by (position - 1)
  const apiWord  = S._wordData?.[idx] || null;
  const alifData = _alifLookup(word);

  // Meaning: prefer Alif (trilingual) → fall back to API English
  const meaning = alifData?.meaning?.[lang]
    || alifData?.meaning?.en
    || apiWord?.translation
    || '';

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
          .map(d => renderDiscoveryFlash(d.ruleId, d.ruleName, S.lang))
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
// 1. raw word  2. strip diacritics  3. full normalize  4. normalize + strip ال prefix
function _alifLookup(word) {
  if (!window._alifIndex) return null;
  const idx = window._alifIndex;
  return idx[word]
    || idx[_stripDiacritics(word)]
    || idx[_normalizeArabic(word)]
    || idx[_normalizeArabic(word).replace(/^\u0627\u0644/, '')] // strip ال
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
  const apiWord   = S._wordData?.[wordIdx];
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
