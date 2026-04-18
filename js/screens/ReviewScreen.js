// ============================================================
// MAHFOOZ — ReviewScreen.js
// Daily review session. Shows due ayat by bucket.
// ============================================================
import { t } from '../core/i18n.js';
import { getDueAyat, reviewAyah, addXP, XP } from '../services/ProgressService.js';
import { fetchAyah, getAudioUrl, getReciter } from '../services/QuranAPI.js';

let _dueAyat  = [];
let _idx      = 0;
let _audio    = null;
let _surahMap = null;

async function getSurahName(surahNum, lang) {
  if (!_surahMap) {
    try {
      const res = await fetch('js/data/surahs.json');
      const arr = await res.json();
      _surahMap = {};
      arr.forEach(s => { _surahMap[s.num] = s; });
    } catch { _surahMap = {}; }
  }
  const s = _surahMap[surahNum];
  return s ? (s[`name_${lang}`] || s.name_en) : `Surah ${surahNum}`;
}

export async function renderReviewScreen(lang) {
  _dueAyat = getDueAyat();
  _idx     = 0;

  if (_dueAyat.length === 0) {
    return _emptyReview(lang);
  }

  return _shell(lang);
}

function _shell(lang) {
  return `
    <div class="screen active" data-screen="review"
         style="
                background:var(--bg);overflow:hidden;">
      <div class="session-bar">
        <button class="session-close" onclick="showScreen('home')">✕</button>
        <div class="session-progress-bar">
          <div class="session-progress-fill" id="rev-prog" style="width:0%"></div>
        </div>
        <div class="session-xp" id="rev-count">
          ${_idx + 1} / ${_dueAyat.length}
        </div>
      </div>
      <div id="rev-body" class="scroll-area" style="flex:1;padding:0;">
        <div style="display:flex;align-items:center;justify-content:center;min-height:200px;
                    color:var(--ink-3);font-size:0.875rem;">${t('loading', lang)}</div>
      </div>
      <div class="bottom-nav">
        ${_bottomNav(lang)}
      </div>
    </div>
  `;
}

// Load and render review card after shell is in DOM
window._loadReviewCard = async function(lang) {
  if (_idx >= _dueAyat.length) {
    _renderComplete(lang);
    return;
  }
  const item = _dueAyat[_idx];
  const ayah = await fetchAyah(item.surah_number, item.ayah_number).catch(() => null);
  const surahName = await getSurahName(item.surah_number, lang);
  _renderCard(ayah, item, surahName, lang);
};

function _renderCard(ayah, item, surahName, lang) {
  const body = document.getElementById('rev-body');
  const prog = document.getElementById('rev-prog');
  const cnt  = document.getElementById('rev-count');
  if (!body) return;

  if (prog) prog.style.width = `${((_idx + 1) / _dueAyat.length) * 100}%`;
  if (cnt)  cnt.textContent  = `${_idx + 1} / ${_dueAyat.length}`;

  const arabicText = ayah ? (
    document.documentElement.getAttribute('data-script') === 'uthmani'
      ? ayah.arabic : (ayah.arabic_indopak || ayah.arabic)
  ) : '';

  const translation = ayah
    ? (ayah[`translation_${lang}`] || ayah.translation_en || '')
    : '';

  body.innerHTML = `
    <div style="padding:20px 20px 20px;">

      <div style="display:flex;align-items:center;gap:8px;margin-bottom:16px;">
        <div class="s-badge ${item.strength>=4?'strong':item.strength>=2?'fresh':'review'}">
          ${lang==='ur'?'طاقت':lang==='hi'?'ताक़त':'Strength'} ${item.strength}/5
        </div>
        <div style="font-size:0.75rem;color:var(--ink-3);">${surahName} · ${item.ayah_number}</div>
      </div>

      <!-- Ayah display -->
      <div style="background:var(--bg-elevated);border:1px solid var(--border-gold);
                  border-radius:var(--r-lg);padding:24px 20px;margin-bottom:16px;
                  text-align:right;">
        <div class="ayah-arabic" lang="ar" dir="rtl"
             style="font-size:clamp(22px,4vw,32px);line-height:2.4;
                    text-align:right;margin-bottom:12px;">
          ${arabicText}
        </div>
        <div style="font-family:var(--font-display);font-size:0.875rem;
                    font-style:italic;color:var(--ink-3);
                    ${lang==='ur'?'text-align:right;direction:rtl;':''}">
          ${translation}
        </div>
      </div>

      <!-- Audio -->
      <button id="rev-audio-btn"
              onclick="revPlayAudio(${item.surah_number},${item.ayah_number})"
              style="width:100%;padding:12px;border-radius:var(--r-md);
                     border:1px solid var(--border-gold);background:var(--gold-dim);
                     color:var(--gold);font-family:var(--font-body);
                     font-size:0.875rem;cursor:pointer;margin-bottom:20px;">
        ▶ ${t('stageListen', lang)}
      </button>

      <!-- Self-assess -->
      <div style="font-family:var(--font-display);font-size:1rem;color:var(--ink);
                  margin-bottom:12px;text-align:center;">
        ${lang==='ur'?'کیا آپ کو یہ آیت یاد ہے؟':lang==='hi'?'क्या ये आयत याद है?':'Do you remember this ayah?'}
      </div>

      <div style="display:flex;gap:10px;">
        <button class="btn btn-secondary" onclick="revAnswer(false,'${lang}')"
                style="flex:1;border-color:var(--wrong-border);color:var(--wrong-text);">
          ${lang==='ur'?'نہیں، دوبارہ':lang==='hi'?'नहीं, दोबारा':'Not yet'}
        </button>
        <button class="btn btn-primary" onclick="revAnswer(true,'${lang}')"
                style="flex:1;">
          ${lang==='ur'?'ہاں! ✓':lang==='hi'?'हाँ! ✓':'Yes! ✓'}
        </button>
      </div>
    </div>
  `;
}

function _renderComplete(lang) {
  const body = document.getElementById('rev-body');
  if (!body) return;
  body.innerHTML = `
    <div style="padding:32px 24px;display:flex;flex-direction:column;
                align-items:center;text-align:center;">
      <div style="font-size:3rem;margin-bottom:16px;">✅</div>
      <div style="font-family:var(--font-display);font-size:1.75rem;
                  color:var(--ink);margin-bottom:8px;">${t('reviewDone', lang)}</div>
      <div style="font-size:0.9375rem;color:var(--ink-3);margin-bottom:28px;">
        ${lang==='ur'?`آپ نے ${_dueAyat.length} آیات دہرائیں`:lang==='hi'?`${_dueAyat.length} आयतें दोहराईं`:`Reviewed ${_dueAyat.length} ayat`}
      </div>
      <button class="btn btn-primary" onclick="showScreen('home')" style="max-width:280px;">
        ${t('navHome', lang)}
      </button>
    </div>
  `;
}

function _emptyReview(lang) {
  return `
    <div class="screen active" data-screen="review"
         style="background:var(--bg);">
      <div class="topbar">
        <div class="topbar-brand">
          <button onclick="showScreen('home')"
                  style="background:none;border:none;cursor:pointer;color:var(--ink-3);font-size:1.25rem;">←</button>
          <span style="font-family:var(--font-display);font-size:1rem;color:var(--ink);">
            ${t('reviewTitle', lang)}
          </span>
        </div>
        <button class="menu-btn" onclick="showMenu()">☰</button>
      </div>
      <div style="flex:1;display:flex;flex-direction:column;align-items:center;
                  justify-content:center;padding:32px 24px;text-align:center;">
        <div style="font-size:3rem;margin-bottom:16px;">🌿</div>
        <div style="font-family:var(--font-display);font-size:1.5rem;color:var(--ink);margin-bottom:8px;">
          ${t('nothingDue', lang)}
        </div>
        <div style="font-size:0.9375rem;color:var(--ink-3);margin-bottom:28px;">
          ${lang==='ur'?'آج کوئی مراجعت نہیں۔ کل دوبارہ چیک کریں۔':lang==='hi'?'आज कोई मुराजात नहीं। कल दोबारा चेक करें।':'No reviews due today. Check back tomorrow.'}
        </div>
        <button class="btn btn-primary" onclick="showScreen('memorize')" style="max-width:280px;">
          ${t('navMemorize', lang)} →
        </button>
      </div>
      <div class="bottom-nav">${_bottomNav(lang)}</div>
    </div>
  `;
}

function _bottomNav(lang) {
  return ['home','memorize','review','progress'].map((s,i) => `
    <button class="nav-tab ${s==='review'?'active':''}" onclick="showScreen('${s}')">
      <span class="nav-tab-icon">${['🏠','📖','🔄','📊'][i]}</span>
      <span>${[t('navHome',lang),t('navMemorize',lang),t('navReview',lang),t('navProgress',lang)][i]}</span>
    </button>
  `).join('');
}

window.revAnswer = function(passed, lang) {
  const item = _dueAyat[_idx];
  if (item) {
    reviewAyah(item.surah_number, item.ayah_number, passed);
    if (passed) addXP(XP.REVIEW_AYAH);
  }
  _idx++;
  if (_audio) { _audio.pause(); _audio.onended = null; _audio.onerror = null; _audio = null; }
  window._loadReviewCard(lang);
};

window.revPlayAudio = function(surahNum, ayahNum) {
  const url = getAudioUrl(surahNum, ayahNum, getReciter());
  const btn = document.getElementById('rev-audio-btn');

  const setPlaying = (playing) => {
    if (!btn) return;
    const lang = document.documentElement.getAttribute('data-lang') || 'en';
    const listenLabel = lang==='ur' ? 'سنیں' : lang==='hi' ? 'सुनें' : 'Listen';
    const stopLabel   = lang==='ur' ? 'روکیں' : lang==='hi' ? 'रोकें' : 'Stop';
    btn.textContent = playing ? `⏹ ${stopLabel}` : `▶ ${listenLabel}`;
  };

  // Toggle: if already playing, pause
  if (_audio && !_audio.paused) {
    _audio.pause();
    setPlaying(false);
    return;
  }

  if (!_audio) _audio = new Audio();
  _audio.src = url;
  _audio.onended = () => setPlaying(false);
  _audio.onerror = () => setPlaying(false);
  _audio.play().then(() => setPlaying(true)).catch(() => setPlaying(false));
};
