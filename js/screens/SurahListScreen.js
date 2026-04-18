// ============================================================
// MAHFOOZ — SurahListScreen.js
// Option B: All surahs / all 30 juz — fully open.
// Surah pathway: Recommended → By Tier → Full sequence (1-114)
// Juz pathway: Juz 1→30 correct order, all named, collapsible
// ============================================================
import { t } from '../core/i18n.js';
import { getSurahProgress, getNextAyahForSurah } from '../services/ProgressService.js';

let _surahs = null;

async function loadSurahs() {
  if (_surahs) return _surahs;
  const res = await fetch('js/data/surahs.json');
  _surahs = await res.json();
  window._surahsCache = _surahs;
  localStorage.setItem('mahfooz_surahs_cache', JSON.stringify(_surahs));
  return _surahs;
}

export async function renderSurahListScreen(lang) {
  const surahs  = await loadSurahs();
  const pathway = localStorage.getItem('mahfooz_pathway') || 'surah';
  return pathway === 'juz'
    ? _renderJuzPathway(surahs, lang)
    : _renderSurahPathway(surahs, lang);
}

// ── All 30 Juz names ──────────────────────────────────────────
const JUZ_NAMES = {
   1: "Alif Lam Meem",        2: "Sayaqool",
   3: "Tilkal Rusul",         4: "Lan Tana Loo",
   5: "Wal Mohsanat",         6: "La Yuhibbullah",
   7: "Wa Iza Samiu",         8: "Wa Lau Annana",
   9: "Qalal Malao",         10: "Wa A'lamu",
  11: "Ya'tazeroon",         12: "Wa Mamin Da'abba",
  13: "Wa Ma Ubrioo",        14: "Rubama",
  15: "Subhanallazi",        16: "Qal Alam",
  17: "Iqtaraba",            18: "Qad Aflaha",
  19: "Wa Qalallazina",      20: "Amman Khalaq",
  21: "Utlu Ma Oohiya",      22: "Wa Manyaqnut",
  23: "Wa Mali",             24: "Faman Azlam",
  25: "Elahe Yuruddu",       26: "Ha Meem",
  27: "Qala Fama Khatbukum", 28: "Qad Sami Allah",
  29: "Tabarak Allazi",      30: "Amma",
};

// ── Shared topbar ─────────────────────────────────────────────
function _listTopbar(lang, pathway) {
  const isJuz = pathway === 'juz';
  return `
    <div class="topbar">
      <div class="topbar-brand">
        <button onclick="showScreen('home')"
                style="background:none;border:none;cursor:pointer;
                       color:var(--ink-3);font-size:1.25rem;
                       display:flex;align-items:center;gap:8px;padding:0;">←</button>
        <span style="font-family:var(--font-display);font-size:1rem;
                     color:var(--ink);font-weight:400;">${t('navMemorize', lang)}</span>
      </div>
      <div class="topbar-right" style="display:flex;align-items:center;gap:8px;">
        <!-- Inline pathway toggle -->
        <div style="display:flex;border:1px solid var(--border-mid);
                    border-radius:var(--r-pill);overflow:hidden;background:var(--bg-surface);">
          <button onclick="switchPathway('surah')"
                  style="padding:5px 10px;border:none;font-size:0.6875rem;font-weight:600;
                         cursor:pointer;font-family:var(--font-body);letter-spacing:0.03em;
                         background:${!isJuz?'var(--gold)':'transparent'};
                         color:${!isJuz?'var(--bg)':'var(--ink-3)'};
                         transition:all var(--t-fast) var(--ease);">
            🌸 ${lang==='ur'?'سورہ':lang==='hi'?'सूरह':'Surah'}
          </button>
          <button onclick="switchPathway('juz')"
                  style="padding:5px 10px;border:none;font-size:0.6875rem;font-weight:600;
                         cursor:pointer;font-family:var(--font-body);letter-spacing:0.03em;
                         background:${isJuz?'var(--gold)':'transparent'};
                         color:${isJuz?'var(--bg)':'var(--ink-3)'};
                         transition:all var(--t-fast) var(--ease);">
            📚 ${lang==='ur'?'جزء':lang==='hi'?'जुज़':'Juz'}
          </button>
        </div>
        <button class="menu-btn" onclick="showMenu()">☰</button>
      </div>
    </div>
  `;
}

// ── SURAH PATHWAY ─────────────────────────────────────────────
function _renderSurahPathway(surahs, lang) {
  const tier1    = surahs.filter(s => s.tier === 1);
  const tier2    = surahs.filter(s => s.tier === 2);
  const allSorted = [...surahs].sort((a, b) => a.num - b.num);

  // View toggle: 'recommended' | 'sequence'
  const view = localStorage.getItem('mahfooz_surah_view') || 'recommended';

  const viewBtnStyle = (active) =>
    `padding:5px 12px;border:1px solid ${active?'var(--border-gold)':'var(--border-mid)'};
     border-radius:var(--r-pill);font-size:0.6875rem;font-weight:${active?'600':'400'};
     background:${active?'var(--gold-dim)':'var(--bg-surface)'};
     color:${active?'var(--gold)':'var(--ink-3)'};cursor:pointer;
     font-family:var(--font-body);transition:all var(--t-fast) var(--ease);`;

  return `
    <div class="screen active" data-screen="memorize"
         style="background:var(--bg);overflow:hidden;">
      ${_listTopbar(lang, 'surah')}
      <div class="scroll-area" style="padding-bottom:calc(var(--bottomnav-h)+16px);">

        <!-- View toggle -->
        <div style="padding:14px 20px 8px;display:flex;align-items:center;
                    justify-content:space-between;">
          <div style="font-size:0.8125rem;color:var(--ink-3);">${t('surahDesc', lang)}</div>
          <div style="display:flex;gap:6px;">
            <button onclick="setSurahView('recommended')"
                    style="${viewBtnStyle(view==='recommended')}">
              ⭐ ${lang==='ur'?'تجویز':lang==='hi'?'सुझाव':'Guide'}
            </button>
            <button onclick="setSurahView('sequence')"
                    style="${viewBtnStyle(view==='sequence')}">
              # ${lang==='ur'?'ترتیب':lang==='hi'?'क्रम':'1→114'}
            </button>
          </div>
        </div>

        ${view === 'sequence' ? `
          <!-- Full sequence 1-114 -->
          <div style="padding:0 20px 8px;">
            <div style="display:flex;flex-direction:column;gap:7px;">
              ${allSorted.map(s => _surahCard(s, lang)).join('')}
            </div>
          </div>
        ` : `
          <!-- Recommended tiers -->
          ${_renderTierSection(tier1,
            lang==='ur'?'پہلے قدم':lang==='hi'?'पहले क़दम':'First Wings',
            lang==='ur'?'چھوٹی، طاقتور — شروع کے لیے بہترین':lang==='hi'?'छोटी, ताक़तवर — शुरुआत के लिए बेहतरीन':'Short, powerful — recommended to start',
            lang==='ur'?'⭐ تجویز شدہ':lang==='hi'?'⭐ बेहतरीन शुरुआत':'⭐ Recommended',
            lang)}
          ${_renderTierSection(tier2,
            lang==='ur'?'بڑھتے ہوئے':lang==='hi'?'बढ़ते हुए':'Growing',
            lang==='ur'?'اپنی بنیاد مضبوط کریں':lang==='hi'?'अपनी बुनियाद मज़बूत करें':'Build your foundation',
            null, lang)}
          <div style="padding:0 20px 8px;">
            <div style="font-family:var(--font-display);font-size:0.9375rem;
                        color:var(--ink);margin-bottom:6px;padding-top:8px;">
              ${lang==='ur'?'تمام سورتیں':lang==='hi'?'सभी सूरहें':'All Surahs'}
            </div>
            <div style="font-size:0.75rem;color:var(--ink-3);margin-bottom:10px;">
              ${lang==='ur'?'کوئی بھی سورہ چنیں — پورا قرآن آپ کا منتظر ہے'
                :lang==='hi'?'कोई भी सूरह चुनें — पूरा क़ुरआन आपका इंतज़ार कर रहा है'
                :'Choose any surah — the whole Qur\'an awaits'}
            </div>
            <div style="display:flex;flex-direction:column;gap:7px;">
              ${allSorted.map(s => _surahCard(s, lang)).join('')}
            </div>
          </div>
        `}

      </div>
      ${_bottomNav(lang, 'memorize')}
    </div>
  `;
}

// ── JUZ PATHWAY ───────────────────────────────────────────────
// All 30 Juz, correct order 1→30, all named, collapsible.
function _renderJuzPathway(surahs, lang) {
  // Group surahs by juz
  const juzMap = {};
  for (const s of surahs) {
    if (!juzMap[s.juz]) juzMap[s.juz] = [];
    juzMap[s.juz].push(s);
  }
  for (const j in juzMap) {
    juzMap[j].sort((a, b) => a.num - b.num);
  }

  // Correct order: Juz 1 → 30
  const juzOrder = Array.from({length: 30}, (_, i) => i + 1);

  return `
    <div class="screen active" data-screen="memorize"
         style="background:var(--bg);overflow:hidden;">
      ${_listTopbar(lang, 'juz')}
      <div class="scroll-area" style="padding-bottom:calc(var(--bottomnav-h)+16px);">

        <div style="padding:16px 20px 8px;">
          <div class="label" style="margin-bottom:4px;">${t('juzPath', lang)}</div>
          <div style="font-size:0.8125rem;color:var(--ink-3);">
            ${lang==='ur'?'جزء 1 سے 30 تک — تمام قرآن'
              :lang==='hi'?'जुज़ 1 से 30 तक — पूरा क़ुरआन'
              :'All 30 Juz — the complete Qur\'an'}
          </div>
        </div>

        ${juzOrder.map(j => {
          const jSurahs  = juzMap[j] || [];
          const juzName  = JUZ_NAMES[j] || '';
          const count    = jSurahs.length;
          const totalAyat = jSurahs.reduce((sum, s) => sum + s.ayat, 0);
          const memorized = jSurahs.reduce((sum, s) => {
            return sum + getSurahProgress(s.num, s.ayat).memorized;
          }, 0);
          const pct = totalAyat > 0 ? Math.round((memorized / totalAyat) * 100) : 0;
          // Default open: none (student chooses)
          const isOpen = false;

          return `
            <div style="padding:3px 20px;">
              <!-- Juz header -->
              <div onclick="toggleJuz(${j})"
                   style="display:flex;align-items:center;justify-content:space-between;
                          padding:13px 16px;background:var(--bg-elevated);
                          border:1px solid var(--border);border-radius:var(--r-lg);
                          cursor:pointer;position:relative;overflow:hidden;">
                ${pct > 0 ? `
                  <div style="position:absolute;bottom:0;left:0;width:${pct}%;height:2px;
                              background:linear-gradient(90deg,var(--crimson),var(--gold));
                              opacity:0.5;"></div>
                ` : ''}
                <div style="display:flex;align-items:center;gap:12px;">
                  <!-- Juz number badge -->
                  <div style="width:32px;height:32px;border-radius:8px;
                              border:1px solid var(--border-gold);background:var(--bg-surface);
                              display:flex;align-items:center;justify-content:center;
                              font-size:0.75rem;font-weight:700;color:var(--gold);flex-shrink:0;">
                    ${j}
                  </div>
                  <div>
                    <div style="font-family:var(--font-display);font-size:0.9375rem;
                                color:var(--ink);font-weight:400;">
                      ${lang==='ur'?'جزء':lang==='hi'?'जुज़':'Juz'} ${j}
                      <span style="font-size:0.8125rem;color:var(--ink-3);font-style:italic;
                                   margin-left:6px;">${juzName}</span>
                    </div>
                    <div style="font-size:0.6875rem;color:var(--ink-3);margin-top:1px;">
                      ${count} ${lang==='ur'?'سورتیں':lang==='hi'?'सूरहें':'surahs'}
                      · ${totalAyat} ${lang==='ur'?'آیات':lang==='hi'?'आयتें':'ayat'}
                      ${pct > 0 ? `· <span style="color:var(--gold);">${pct}% ${lang==='ur'?'حفظ':lang==='hi'?'याद':'done'}</span>` : ''}
                    </div>
                  </div>
                </div>
                <span id="juz-chevron-${j}"
                      style="color:var(--ink-3);font-size:1rem;font-weight:300;
                             transition:transform 0.2s ease;
                             transform:rotate(${isOpen?'90':'0'}deg);">›</span>
              </div>

              <!-- Surah list -->
              <div id="juz-body-${j}"
                   style="display:${isOpen?'flex':'none'};flex-direction:column;
                          gap:6px;padding:6px 0 4px;">
                ${jSurahs.map(s => _surahCard(s, lang)).join('')}
              </div>
            </div>
          `;
        }).join('')}

      </div>
      ${_bottomNav(lang, 'memorize')}
    </div>
  `;
}

// ── Tier section ──────────────────────────────────────────────
function _renderTierSection(surahs, label, desc, badge, lang) {
  return `
    <div style="padding:4px 20px;">
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px;flex-wrap:wrap;">
        <div style="font-family:var(--font-display);font-size:1rem;
                    color:var(--ink);">${label}</div>
        ${badge ? `<span style="background:var(--gold-dim);border:1px solid var(--border-gold);
                               border-radius:var(--r-pill);padding:2px 8px;
                               font-size:0.625rem;color:var(--gold);font-weight:600;">
                     ${badge}</span>` : ''}
        <div style="font-size:0.75rem;color:var(--ink-3);">${desc}</div>
      </div>
      <div style="display:flex;flex-direction:column;gap:7px;">
        ${surahs.map(s => _surahCard(s, lang)).join('')}
      </div>
    </div>
  `;
}

// ── Surah card ────────────────────────────────────────────────
function _surahCard(surah, lang) {
  const prog = getSurahProgress(surah.num, surah.ayat);
  const pct  = prog.pct;
  const name = surah[`name_${lang}`] || surah.name_en;

  let statusHTML = '';
  if (prog.memorized === 0) {
    statusHTML = `<span style="font-size:0.6875rem;color:var(--ink-3);">
      ${surah.ayat} ${lang==='ur'?'آیات':lang==='hi'?'आयतें':'ayat'}</span>`;
  } else if (prog.locked === surah.ayat) {
    statusHTML = `<span class="s-badge locked">💚 ${lang==='ur'?'مکمل':lang==='hi'?'पूरी':'Complete'}</span>`;
  } else {
    statusHTML = `<span class="s-badge fresh">${prog.memorized}/${surah.ayat}</span>`;
  }

  return `
    <div class="lift" onclick="startSurah(${surah.num})"
         style="background:var(--bg-elevated);border:1px solid var(--border);
                border-radius:var(--r-lg);padding:13px 16px;cursor:pointer;
                box-shadow:var(--shadow-sm);position:relative;overflow:hidden;">
      ${pct > 0 ? `
        <div style="position:absolute;bottom:0;left:0;width:${pct}%;height:2px;
                    background:linear-gradient(90deg,var(--crimson),var(--gold));
                    opacity:0.6;"></div>` : ''}
      <div style="display:flex;align-items:center;gap:12px;">
        <div style="width:32px;height:32px;border-radius:50%;
                    border:1px solid var(--border-gold);background:var(--bg-surface);
                    display:flex;align-items:center;justify-content:center;
                    font-size:11px;font-weight:700;color:var(--gold);flex-shrink:0;">
          ${surah.num}
        </div>
        <div style="flex:1;min-width:0;">
          <div style="display:flex;align-items:center;gap:8px;margin-bottom:2px;">
            <div class="arabic" style="font-size:17px;color:var(--ink-arabic);
                                       line-height:1.6;">${surah.name_ar}</div>
            <div style="font-family:var(--font-display);font-size:0.875rem;
                        color:var(--ink);">${name}</div>
          </div>
          ${statusHTML}
        </div>
        <div style="color:var(--ink-3);font-size:0.875rem;flex-shrink:0;">›</div>
      </div>
    </div>
  `;
}

// ── Bottom nav ────────────────────────────────────────────────
function _bottomNav(lang, active) {
  return `
    <div class="bottom-nav">
      ${[
        { id:'home',     icon:'🏠', lbl:t('navHome',lang),     screen:'home'     },
        { id:'memorize', icon:'📖', lbl:t('navMemorize',lang), screen:'memorize' },
        { id:'review',   icon:'🔄', lbl:t('navReview',lang),   screen:'review'   },
        { id:'progress', icon:'📊', lbl:t('navProgress',lang), screen:'progress' },
      ].map(tab => `
        <button class="nav-tab ${tab.id===active?'active':''}"
                onclick="showScreen('${tab.screen}')">
          <span class="nav-tab-icon">${tab.icon}</span>
          <span>${tab.lbl}</span>
        </button>
      `).join('')}
    </div>
  `;
}

// ── Window handlers ───────────────────────────────────────────
window.startSurah = function(surahNum) {
  const surah = (_surahs || []).find(s => s.num === surahNum);
  if (!surah) return;
  // Resume at the first unsealed ayah — not always 1
  const totalAyat = surah.ayat || 1;
  const ayahNum   = getNextAyahForSurah(surahNum, totalAyat);
  window._session = { surahNum, ayahNum, surahData: surah };
  showScreen('session');
};

// Switch pathway inline — no welcome screen needed
window.switchPathway = function(pathway) {
  localStorage.setItem('mahfooz_pathway', pathway);
  window.APP && (window.APP.pathway = pathway);
  showScreen('memorize');
};

// Toggle surah view: recommended ↔ sequence
window.setSurahView = function(view) {
  localStorage.setItem('mahfooz_surah_view', view);
  showScreen('memorize');
};

// Toggle juz expand/collapse
window.toggleJuz = function(j) {
  const body    = document.getElementById(`juz-body-${j}`);
  const chevron = document.getElementById(`juz-chevron-${j}`);
  if (!body) return;
  const isOpen = body.style.display !== 'none';
  body.style.display = isOpen ? 'none' : 'flex';
  if (chevron) chevron.style.transform = isOpen ? 'rotate(0deg)' : 'rotate(90deg)';
};
