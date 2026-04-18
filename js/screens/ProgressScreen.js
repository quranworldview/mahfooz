// ============================================================
// MAHFOOZ — ProgressScreen.js
// Full progress view. Stats, surah breakdown, strength map.
// ============================================================
import { t } from '../core/i18n.js';
import { getStats, getSurahProgress, getDueCount, getStreak, getXP } from '../services/ProgressService.js';

let _surahs = null;
async function loadSurahs() {
  if (_surahs) return _surahs;
  const res = await fetch('js/data/surahs.json');
  _surahs = await res.json();
  return _surahs;
}

export async function renderProgressScreen(lang) {
  const surahs  = await loadSurahs();
  const stats   = getStats();
  const pathway = localStorage.getItem('mahfooz_pathway') || 'surah';

  // Find surahs with any progress
  const activeSurahs = surahs.filter(s => {
    const p = getSurahProgress(s.num, s.ayat);
    return p.memorized > 0;
  });

  return `
    <div class="screen active" data-screen="progress"
         style="
                background:var(--bg);overflow:hidden;">

      <div class="topbar">
        <div class="topbar-brand">
          <span style="font-family:var(--font-display);font-size:1rem;
                       color:var(--ink);font-weight:400;">
            ${t('progressTitle', lang)}
          </span>
        </div>
        <button class="menu-btn" onclick="showMenu()">☰</button>
      </div>

      <div class="scroll-area" style="padding-bottom:calc(var(--bottomnav-h)+16px);">

        <!-- Summary stats -->
        <div style="padding:20px 20px 16px;">
          <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:10px;
                      margin-bottom:16px;">
            ${[
              { val: stats.ayat,   label: t('ayatSealed', lang),  icon: '📖' },
              { val: stats.streak, label: t('dayStreak',  lang),  icon: '🔥' },
              { val: stats.xp,     label: 'XP',                   icon: '✦'  },
            ].map(s => `
              <div style="background:var(--bg-elevated);border:1px solid var(--border);
                          border-radius:var(--r-lg);padding:14px 10px;text-align:center;
                          box-shadow:var(--shadow-sm);">
                <div style="font-size:1.125rem;margin-bottom:4px;">${s.icon}</div>
                <div style="font-family:var(--font-display);font-size:1.75rem;
                            font-weight:300;color:var(--gold);line-height:1;
                            margin-bottom:3px;">${s.val}</div>
                <div style="font-size:0.5625rem;color:var(--ink-3);
                            text-transform:uppercase;letter-spacing:0.07em;">
                  ${s.label}
                </div>
              </div>
            `).join('')}
          </div>

          <!-- Due reviews -->
          ${stats.due > 0 ? `
            <div onclick="showScreen('review')"
                 style="background:rgba(212,160,23,0.08);border:1px solid var(--border-gold);
                        border-radius:var(--r-md);padding:12px 16px;cursor:pointer;
                        display:flex;align-items:center;justify-content:space-between;">
              <div style="font-size:0.875rem;color:var(--gold);">
                🔔 ${stats.due} ${lang==='ur'?'آیات دوہرانی ہیں':lang==='hi'?'आयतें दोहरानी हैं':'ayat due for review'}
              </div>
              <div style="color:var(--gold);">→</div>
            </div>
          ` : ''}
        </div>

        <!-- Strength legend -->
        <div style="padding:0 20px 16px;">
          <div class="label" style="margin-bottom:10px;">
            ${lang==='ur'?'طاقت کی علامت':lang==='hi'?'ताक़त की निशानी':'Strength Legend'}
          </div>
          <div style="display:flex;flex-wrap:wrap;gap:6px;">
            ${[
              { cls:'locked', icon:'💚', lbl:t('locked',  lang) },
              { cls:'strong', icon:'🟢', lbl:t('strong',  lang) },
              { cls:'fresh',  icon:'🟡', lbl:t('fresh',   lang) },
              { cls:'review', icon:'🟠', lbl:t('due',     lang) },
              { cls:'fading', icon:'🔴', lbl:t('fading',  lang) },
            ].map(s => `
              <span class="s-badge ${s.cls}">${s.icon} ${s.lbl}</span>
            `).join('')}
          </div>
        </div>

        <!-- Surah progress -->
        ${activeSurahs.length > 0 ? `
          <div style="padding:0 20px 16px;">
            <div class="label" style="margin-bottom:12px;">
              ${lang==='ur'?'آپ کی سورتیں':lang==='hi'?'आपकी सूरहें':'Your Surahs'}
            </div>
            <div style="display:flex;flex-direction:column;gap:8px;">
              ${activeSurahs.map(s => _surahProgressCard(s, lang)).join('')}
            </div>
          </div>
        ` : `
          <div style="padding:0 20px 16px;">
            <div style="background:var(--bg-elevated);border:1px solid var(--border);
                        border-radius:var(--r-lg);padding:20px;text-align:center;">
              <div style="font-size:1.5rem;margin-bottom:8px;">🌱</div>
              <div style="font-size:0.875rem;color:var(--ink-3);">
                ${lang==='ur'?'ابھی کوئی آیت یاد نہیں۔ شروع کریں!':lang==='hi'?'अभी कोई आयत याद नहीं। शुरू करें!':'No ayat memorized yet. Start your journey!'}
              </div>
              <button class="btn btn-primary" onclick="showScreen('memorize')"
                      style="margin-top:14px;max-width:200px;">
                ${t('beginBtn', lang)}
              </button>
            </div>
          </div>
        `}

      </div>

      <!-- Bottom nav -->
      <div class="bottom-nav">
        ${['home','memorize','review','progress'].map((s,i) => `
          <button class="nav-tab ${s==='progress'?'active':''}" onclick="showScreen('${s}')">
            <span class="nav-tab-icon">${['🏠','📖','🔄','📊'][i]}</span>
            <span>${[t('navHome',lang),t('navMemorize',lang),t('navReview',lang),t('navProgress',lang)][i]}</span>
          </button>
        `).join('')}
      </div>
    </div>
  `;
}

function _surahProgressCard(surah, lang) {
  const prog = getSurahProgress(surah.num, surah.ayat);
  const pct  = prog.pct;
  const name = surah[`name_${lang}`] || surah.name_en;

  return `
    <div style="background:var(--bg-elevated);border:1px solid var(--border);
                border-radius:var(--r-lg);padding:16px 18px;
                box-shadow:var(--shadow-sm);position:relative;overflow:hidden;">

      <!-- Progress bar at bottom -->
      <div style="position:absolute;bottom:0;left:0;width:${pct}%;height:2px;
                  background:linear-gradient(90deg,var(--crimson),var(--gold));"></div>

      <div style="display:flex;align-items:center;gap:12px;">
        <div class="arabic" style="font-size:20px;color:var(--ink-arabic);
                                    line-height:1.8;flex-shrink:0;">${surah.name_ar}</div>
        <div style="flex:1;">
          <div style="font-family:var(--font-display);font-size:0.9375rem;
                      color:var(--ink);margin-bottom:4px;">${name}</div>
          <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;">
            <div style="height:4px;background:var(--border-mid);border-radius:2px;
                        width:80px;flex-shrink:0;overflow:hidden;">
              <div style="height:100%;width:${pct}%;
                          background:linear-gradient(90deg,var(--crimson),var(--gold));
                          transition:width 0.5s ease;"></div>
            </div>
            <span style="font-size:0.6875rem;color:var(--ink-3);">
              ${prog.memorized}/${surah.ayat}
            </span>
            ${prog.locked > 0 ? `
              <span class="s-badge locked" style="font-size:0.5625rem;">
                💚 ${prog.locked} ${t('locked', lang)}
              </span>
            ` : ''}
          </div>
        </div>
        <button onclick="startSurah(${surah.num})"
                style="background:none;border:1px solid var(--border-mid);
                       border-radius:var(--r-sm);padding:6px 10px;
                       color:var(--ink-3);font-size:0.75rem;cursor:pointer;
                       flex-shrink:0;transition:all var(--t-fast) var(--ease);">
          ${lang==='ur'?'جاری':lang==='hi'?'जारी':'Continue'}
        </button>
      </div>
    </div>
  `;
}
