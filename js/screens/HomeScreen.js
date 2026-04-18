// ============================================================
// MAHFOOZ — HomeScreen.js
// Mushaf-first. Living ayah. Real progress data.
// ============================================================
import { t } from '../core/i18n.js';
import { getStats, getDueCount, getNextAyahForSurah } from '../services/ProgressService.js';

// ── Load daily gem from JSON ──────────────────────────────────
let _gems = null;
async function loadGems() {
  if (_gems) return _gems;
  try {
    const res = await fetch('js/data/daily-gems.json');
    _gems = await res.json();
  } catch { _gems = []; }
  return _gems;
}

function getDailyGem(gems, lang) {
  if (!gems || gems.length === 0) return '';
  const day = new Date().getDate();
  const gem = gems[day % gems.length];
  return gem?.[lang] || gem?.en || '';
}

// ── Get current session position from progress ───────────────
function getCurrentPosition(lang) {
  // Find the last surah/ayah the student was working on
  const surahNum = parseInt(localStorage.getItem('mahfooz_current_surah') || '112');
  const ayahNum  = parseInt(localStorage.getItem('mahfooz_current_ayah')  || '1');

  // Try to get surah name from cached surahs data
  const surahsRaw = localStorage.getItem('mahfooz_surahs_cache');
  let surahName = { en: 'Al-Ikhlas', hi: 'अल-इख़लास', ur: 'الاخلاص' };
  if (surahsRaw) {
    try {
      const surahs = JSON.parse(surahsRaw);
      const s = surahs.find(x => x.num === surahNum);
      if (s) surahName = { en: s.name_en, hi: s.name_hi, ur: s.name_ur };
    } catch { /* use default */ }
  }
  // Compute next unsealed ayah for Continue navigation
  // We need total ayat — try surahsCache, fall back to ayahNum itself
  let totalAyat = ayahNum; // safe minimum
  if (surahsRaw) {
    try {
      const surahs = JSON.parse(surahsRaw);
      const s = surahs.find(x => x.num === surahNum);
      if (s?.ayat) totalAyat = s.ayat;
    } catch { /* use fallback */ }
  }
  const nextAyahNum = getNextAyahForSurah(surahNum, totalAyat);

  return { surahNum, ayahNum, nextAyahNum, surahName, totalAyat };
}

// ── Build living word display ─────────────────────────────────
function buildLivingWords(arabicText, surahNum, ayahNum) {
  const text = arabicText
    .replace(/\u06DD[\u0660-\u0669\u06F0-\u06F9]*/g, '')
    .replace(/[\u06DF\u06D6-\u06DC\u065A\u06E9]+$/g, '')
    .trim();
  const words = text.split(/\s+/).filter(Boolean);
  return words.map((word, idx) => `<span
    class="q-word"
    onclick="window._mahfooz?.onWordTap(${idx},'${encodeURIComponent(word)}',${surahNum},${ayahNum})"
    oncontextmenu="event.preventDefault();window._mahfooz?.onWordLongPress(${idx},'${encodeURIComponent(word)}',${surahNum},${ayahNum})"
    onmousedown="window._mhfzLpStart(${idx},'${encodeURIComponent(word)}',${surahNum},${ayahNum},this)"
    onmouseup="window._mhfzLpCancel()"
    onmouseleave="window._mhfzLpCancel()"
    ontouchstart="window._mhfzLpStart(${idx},'${encodeURIComponent(word)}',${surahNum},${ayahNum},this)"
    ontouchend="window._mhfzLpCancel()"
    ontouchmove="window._mhfzLpCancel()"
  >${word}</span>`).join(' ');
}

// ── Main render (async to load gems) ─────────────────────────
export async function renderHomeScreen(lang, userName) {
  const gems    = await loadGems();
  const stats   = getStats();
  const due     = getDueCount();
  const pathway = localStorage.getItem('mahfooz_pathway') || 'surah';
  const pos     = getCurrentPosition(lang);
  const gem     = getDailyGem(gems, lang);
  const name    = userName ||
    (lang==='ur' ? 'طالب علم' : lang==='hi' ? 'स्टूडेंट' : 'Student');

  // Cached ayah text (set when sessions complete)
  const cachedArabic = localStorage.getItem(`mahfooz_ayah_text_${pos.surahNum}_${pos.ayahNum}`)
    || 'قُلْ هُوَ ٱللَّهُ أَحَدٌ';
  const cachedTrans = localStorage.getItem(`mahfooz_ayah_trans_${pos.surahNum}_${pos.ayahNum}_${lang}`)
    || (lang==='ur'?'کہو: وہ اللہ ایک ہے۔':lang==='hi'?'कहो: वो अल्लाह एक है।':'Say: He is Allah, the One.');

  const surahLabel = pos.surahName[lang] || pos.surahName.en;
  const pathLabel  = pathway === 'juz'
    ? t('juzPath', lang) : t('surahPath', lang);

  // Update sidebar stats
  window.updateSidebarStats?.();

  return `
    <div class="screen active" data-screen="home" style="background:var(--bg);">

      <!-- Topbar -->
      <div class="topbar">
        <div class="topbar-brand">
          <div class="topbar-logo">
            <img class="mahfooz-logo" src="icons/logo-dark.png" alt="Mahfooz">
          </div>
          <div class="arabic" style="font-size:18px;color:var(--gold);">محفوظ</div>
        </div>
        <div class="topbar-right">
          <div class="lang-pills">
            <button class="lang-pill ${lang==='en'?'active':''}" onclick="setLang('en')">EN</button>
            <button class="lang-pill ${lang==='hi'?'active':''}" onclick="setLang('hi')">HI</button>
            <button class="lang-pill ${lang==='ur'?'active':''}" onclick="setLang('ur')">UR</button>
          </div>
          <button class="menu-btn" onclick="showMenu()">☰</button>
        </div>
      </div>

      <div class="scroll-area" style="padding-bottom:calc(var(--bottomnav-h)+16px);">

        <!-- Greeting -->
        <div style="padding:20px 20px 0;" class="stagger">
          <div style="font-size:0.8125rem;color:var(--ink-3);">${t('greeting', lang)},</div>
          <div style="font-family:var(--font-display);font-size:1.5rem;
                      font-weight:400;color:var(--ink);margin-top:2px;">${name}</div>
        </div>

        <!-- Stats row (mobile — desktop shows in right sidebar) -->
        <div class="home-stats-mobile stagger"
             style="display:flex;gap:0;background:var(--bg-elevated);
                    border:1px solid var(--border);border-radius:var(--r-lg);
                    overflow:hidden;box-shadow:var(--shadow-sm);
                    margin:16px 20px 0;">
          ${[
            { val: stats.ayat,   label: t('ayatSealed', lang), icon: '📖' },
            { val: stats.streak, label: t('dayStreak', lang),  icon: '🔥' },
            { val: stats.xp,     label: 'XP',                  icon: '✦'  },
          ].map((s, i) => `
            <div style="flex:1;padding:12px 10px;text-align:center;
                        ${i<2?'border-right:1px solid var(--border);':''}">
              <div style="font-size:1rem;margin-bottom:3px;">${s.icon}</div>
              <div style="font-family:var(--font-display);font-size:1.375rem;
                          font-weight:300;color:var(--gold);line-height:1;
                          margin-bottom:2px;">${s.val}</div>
              <div style="font-size:0.5rem;color:var(--ink-3);
                          text-transform:uppercase;letter-spacing:0.07em;">${s.label}</div>
            </div>
          `).join('')}
        </div>

        <!-- Review due banner -->
        ${due > 0 ? `
          <div onclick="showScreen('review')"
               style="margin:12px 20px 0;background:var(--gold-dim);
                      border:1px solid var(--border-gold);border-radius:var(--r-md);
                      padding:11px 16px;cursor:pointer;
                      display:flex;align-items:center;justify-content:space-between;">
            <div style="font-size:0.875rem;color:var(--gold);">
              🔔 ${due} ${lang==='ur'?'آیات دوہرانی ہیں':lang==='hi'?'आयतें दोहरानी हैं':'ayat due for review'}
            </div>
            <div style="color:var(--gold);">→</div>
          </div>
        ` : ''}

        <!-- Living Ayah — the heart of the home screen -->
        <div style="padding:${due>0?'12px':'16px'} 0 0;">
          <div style="display:flex;align-items:center;justify-content:space-between;
                      padding:0 20px 10px;">
            <div class="label">${t('dailyMission', lang)}</div>
            <div style="font-size:0.75rem;color:var(--ink-3);">
              ${surahLabel} · ${lang==='ur'?'آیت':lang==='hi'?'आयत':'Ayah'} ${pos.ayahNum}
              ${pos.nextAyahNum !== null && pos.nextAyahNum > pos.ayahNum ? `
                <span style="margin-left:6px;color:var(--gold);">
                  → ${pos.nextAyahNum} ${lang==='ur'?'آگے':lang==='hi'?'आगे':'next'}
                </span>` : ''}
            </div>
          </div>

          <div class="ayah-block active-ayah strength-fresh" style="margin:0;">
            <div class="ayah-arabic" lang="ar" dir="rtl">
              ${buildLivingWords(cachedArabic, pos.surahNum, pos.ayahNum)}
            </div>
            <div class="ayah-translation ${lang==='ur'?'translation-ur':lang==='hi'?'translation-hi':''}">
              ${cachedTrans}
            </div>
            <div style="font-size:0.6875rem;color:var(--ink-3);font-style:italic;
                        margin-bottom:12px;">
              ${t('tapWord', lang)}
            </div>
            <div class="ayah-footer">
              <div class="ayah-num-badge">${pos.ayahNum}</div>
              <div class="ayah-actions">
                <button class="ayah-action-btn"
                        onclick="playAyahAudio(${pos.ayahNum},${pos.surahNum})"
                        title="${t('stageListen', lang)}">▶</button>
                <button class="ayah-action-btn"
                        onclick="openReflection(${pos.surahNum},${pos.ayahNum},null)"
                        title="${t('reflectionBtn', lang)}">✍</button>
                <button class="ayah-action-btn"
                        onclick="startSurah(${pos.surahNum})"
                        title="${t('navMemorize', lang)}">📖</button>
              </div>
            </div>
          </div>

          <div style="padding:12px 20px 0;">
            <button class="btn btn-primary"
                    onclick="${pos.nextAyahNum === null ? `showScreen('memorize')` : `startSurah(${pos.surahNum})`}">
              ${pos.nextAyahNum === null
                ? (lang==='ur'?'اگلی سورہ شروع کریں →':lang==='hi'?'अगली सूरह शुरू करें →':'Begin Next Surah →')
                : `${t('continueBtn', lang)} · ${surahLabel} · ${lang==='ur'?'آیت':lang==='hi'?'आयत':'Ayah'} ${pos.nextAyahNum}`
              }
            </button>
          </div>
        </div>

        <!-- Gem of the Day -->
        ${gem ? `
          <div style="padding:20px 20px 0;">
            <div class="label" style="margin-bottom:10px;">${t('gemOfDay', lang)}</div>
            <div class="gem-card lift" onclick="">
              <div class="gem-type">✨ ${t('gemOfDay', lang)}</div>
              <div class="gem-text">${gem}</div>
            </div>
          </div>
        ` : ''}

        <!-- Your Journey -->
        <div style="padding:20px 20px 0;">
          <div style="display:flex;align-items:center;justify-content:space-between;
                      margin-bottom:10px;">
            <div class="label">${t('yourProgress', lang)}</div>
            <button onclick="showScreen('progress')"
                    style="font-size:0.75rem;color:var(--gold);background:none;
                           border:none;cursor:pointer;">
              ${lang==='ur'?'سب دیکھیں':lang==='hi'?'सब देखें':'See all'} →
            </button>
          </div>
          <div style="background:var(--bg-elevated);border:1px solid var(--border);
                      border-radius:var(--r-lg);padding:14px 16px;box-shadow:var(--shadow-sm);">
            <div style="font-size:0.8125rem;color:var(--ink-3);margin-bottom:8px;">
              ${pathLabel}
            </div>
            <div style="display:flex;gap:6px;flex-wrap:wrap;">
              <span class="s-badge locked">💚 ${stats.ayat} ${t('locked', lang)}</span>
              ${due > 0 ? `<span class="s-badge review">🟠 ${due} ${t('due', lang)}</span>` : ''}
            </div>
          </div>
        </div>

        <!-- Quick access -->
        <div style="padding:16px 20px 8px;display:flex;gap:10px;">
          ${[
            { icon:'📖', label: pos.nextAyahNum === null ? (lang==='ur'?'اگلی سورہ':lang==='hi'?'अगली सूरह':'Next Surah') : `${t('continueBtn', lang)} ${pos.nextAyahNum}`, act: pos.nextAyahNum === null ? `showScreen('memorize')` : `startSurah(${pos.surahNum})` },
            { icon:'🔄', label:t('reviewBtn', lang),     act:`showScreen('review')`        },
            { icon:'🎨', label:t('tajweedGems', lang),   act:`showScreen('tajweed')`       },
          ].map(a => `
            <button onclick="${a.act}"
                    style="flex:1;background:var(--bg-elevated);border:1px solid var(--border);
                           border-radius:var(--r-md);padding:12px 6px;cursor:pointer;
                           font-family:var(--font-body);font-size:0.5625rem;
                           color:var(--ink-3);text-align:center;box-shadow:var(--shadow-sm);
                           transition:var(--transition);text-transform:uppercase;
                           letter-spacing:0.04em;">
              <div style="font-size:1.25rem;margin-bottom:5px;">${a.icon}</div>
              ${a.label}
            </button>
          `).join('')}
        </div>

      </div><!-- end scroll-area -->

      <!-- Bottom navigation -->
      <div class="bottom-nav">
        ${[
          { id:'home',     icon:'🏠', lbl:t('navHome',lang),     screen:'home'     },
          { id:'memorize', icon:'📖', lbl:t('navMemorize',lang), screen:'memorize' },
          { id:'review',   icon:'🔄', lbl:t('navReview',lang),   screen:'review'   },
          { id:'progress', icon:'📊', lbl:t('navProgress',lang), screen:'progress' },
        ].map(tab => `
          <button class="nav-tab ${tab.id==='home'?'active':''}"
                  onclick="showScreen('${tab.screen}')">
            <span class="nav-tab-icon">${tab.icon}</span>
            <span>${tab.lbl}</span>
          </button>
        `).join('')}
      </div>

    </div>
  `;
}

// ── Ayah audio ────────────────────────────────────────────────
let _homeAudio = null;
window.playAyahAudio = function(ayahNum, surahNum) {
  const s = String(surahNum).padStart(3,'0');
  const a = String(ayahNum).padStart(3,'0');
  const url = `https://everyayah.com/data/Alafasy_128kbps/${s}${a}.mp3`;
  if (_homeAudio && !_homeAudio.paused) { _homeAudio.pause(); return; }
  if (!_homeAudio) _homeAudio = new Audio();
  _homeAudio.src = url;
  _homeAudio.play().catch(() => {});
};
