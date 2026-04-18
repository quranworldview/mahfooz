// ============================================================
// MAHFOOZ — MenuSheet.js
// The single bottom sheet for ALL settings and features.
// Theme · Script · Text sizes · Reciter · Language
// My Reflections · Pathway · Sign Out
// ============================================================
import { t } from '../core/i18n.js';
import { RECITER_NAMES, getReciter, setReciter } from '../services/QuranAPI.js';
import {
  getTheme, applyTheme,
  getScript, applyScript,
  getQuranSize, applyQuranSize, stepQuranSize,
  getTransSize, applyTransSize,
  getTextSize, applyTextSize,
} from '../core/theme.js';

export function renderMenuSheet(lang) {
  const theme      = getTheme();
  const script     = getScript();
  const quranSize  = getQuranSize();
  const transSize  = getTransSize();
  const textSize   = getTextSize();
  const pathway    = localStorage.getItem('mahfooz_pathway') || 'surah';
  const reciter    = getReciter();
  const name       = localStorage.getItem('mahfooz_user_name') || '—';

  const themeOpts = [
    { val:'system', icon:'💻', lbl:t('themeSys',  lang) },
    { val:'dark',   icon:'🌙', lbl:t('themeDark', lang) },
    { val:'light',  icon:'☀️', lbl:t('themeLight',lang) },
  ];

  const sizes = ['xs','sm','md','lg','xl','2xl'];
  const sizeLabels = { xs:'XS', sm:'S', md:'M', lg:'L', xl:'XL', '2xl':'2XL' };

  const pathLabel = pathway==='juz'
    ? t('juzPath', lang)
    : t('surahPath', lang);

  return `
    <!-- Overlay -->
    <div class="sheet-overlay" id="menu-overlay" onclick="closeMenu()"></div>

    <!-- Sheet -->
    <div class="sheet" id="menu-sheet">
      <div class="sheet-handle"></div>

      <!-- Header — user identity -->
      <div style="display:flex;align-items:center;gap:12px;
                  padding:16px 20px 12px;border-bottom:1px solid var(--border);">
        <div style="width:40px;height:40px;border-radius:12px;overflow:hidden;
                    border:1px solid var(--border-gold);flex-shrink:0;">
          <img class="mahfooz-logo" src="icons/logo-dark.png" alt=""
               style="width:100%;height:100%;object-fit:cover;">
        </div>
        <div>
          <div style="font-size:1rem;font-weight:500;color:var(--ink);">${name}</div>
          <div style="font-size:0.75rem;color:var(--ink-3);">${t('navHome', lang)} · Mahfooz</div>
        </div>
        <button onclick="closeMenu()"
                style="margin-left:auto;width:32px;height:32px;border-radius:8px;
                       border:1px solid var(--border);background:var(--bg-surface);
                       color:var(--ink-3);font-size:1rem;display:flex;
                       align-items:center;justify-content:center;cursor:pointer;">✕</button>
      </div>

      <div class="sheet-body">

        <!-- ── THEME ── -->
        <div class="sheet-section">
          <div class="sheet-section-label">${t('theme', lang)}</div>
          <div style="display:flex;gap:8px;">
            ${themeOpts.map(opt => `
              <button onclick="setMenuTheme('${opt.val}')"
                      id="theme-opt-${opt.val}"
                      style="flex:1;padding:10px 6px;border-radius:var(--r-md);
                             border:1px solid ${theme===opt.val?'var(--border-gold-strong)':'var(--border-mid)'};
                             background:${theme===opt.val?'var(--gold-dim)':'var(--bg-surface)'};
                             color:${theme===opt.val?'var(--gold)':'var(--ink-3)'};
                             font-family:var(--font-body);font-size:0.8125rem;
                             font-weight:500;cursor:pointer;text-align:center;
                             transition:all var(--t-fast) var(--ease);">
                <div style="font-size:1.25rem;margin-bottom:4px;">${opt.icon}</div>
                ${opt.lbl}
              </button>
            `).join('')}
          </div>
        </div>

        <!-- ── ARABIC SCRIPT ── -->
        <div class="sheet-section">
          <div class="sheet-section-label">${t('script', lang)}</div>
          <div style="display:flex;gap:8px;">
            ${[{v:'indopak',l:t('indopak',lang)},{v:'uthmani',l:t('uthmani',lang)}].map(s=>`
              <button onclick="setMenuScript('${s.v}')"
                      id="script-opt-${s.v}"
                      style="flex:1;padding:12px;border-radius:var(--r-md);
                             border:1px solid ${script===s.v?'var(--border-gold-strong)':'var(--border-mid)'};
                             background:${script===s.v?'var(--gold-dim)':'var(--bg-surface)'};
                             color:${script===s.v?'var(--gold)':'var(--ink-3)'};
                             font-family:var(--font-body);font-size:0.875rem;
                             font-weight:500;cursor:pointer;
                             transition:all var(--t-fast) var(--ease);">
                ${s.l}
              </button>
            `).join('')}
          </div>
          <!-- Live preview -->
          <div style="margin-top:10px;background:var(--bg-surface);border:1px solid var(--border);
                      border-radius:var(--r-md);padding:12px;text-align:center;">
            <div class="ayah-arabic" lang="ar" dir="rtl"
                 id="script-preview"
                 style="font-size:22px;text-align:center;line-height:2.2;">
              بِسْمِ ٱللَّهِ ٱلرَّحْمَٰنِ ٱلرَّحِيمِ
            </div>
          </div>
        </div>

        <!-- ── QUR'AN TEXT SIZE ── -->
        <div class="sheet-section">
          <div class="sheet-section-label" style="margin-bottom:8px;">
            ${t('quranSize', lang)}
          </div>
          <div class="size-picker">
            ${sizes.map(sz => `
              <button class="size-pill ${quranSize===sz?'active':''}"
                      id="qsz-${sz}"
                      onclick="setMenuQuranSize('${sz}')"
                      style="font-size:${sz==='xs'?'10px':sz==='sm'?'11px':sz==='md'?'12px':sz==='lg'?'13px':sz==='xl'?'14px':'15px'}">
                ${sizeLabels[sz]}
              </button>
            `).join('')}
          </div>
        </div>

        <!-- ── TRANSLATION SIZE ── -->
        <div class="sheet-section">
          <div class="sheet-section-label" style="margin-bottom:8px;">
            ${t('transSize', lang)}
          </div>
          <div class="size-picker">
            ${sizes.map(sz => `
              <button class="size-pill ${transSize===sz?'active':''}"
                      id="tsz-${sz}"
                      onclick="setMenuTransSize('${sz}')">
                ${sizeLabels[sz]}
              </button>
            `).join('')}
          </div>
        </div>

        <!-- ── LANGUAGE ── -->
        <div class="sheet-section">
          <div class="sheet-section-label">${t('language', lang)}</div>
          <div style="display:flex;gap:8px;">
            ${[{c:'en',l:'English'},{c:'hi',l:'हिंदी'},{c:'ur',l:'اردو'}].map(ln=>`
              <button onclick="setLang('${ln.c}');closeMenu();"
                      style="flex:1;padding:11px;border-radius:var(--r-md);
                             border:1px solid ${lang===ln.c?'var(--border-gold-strong)':'var(--border-mid)'};
                             background:${lang===ln.c?'var(--gold-dim)':'var(--bg-surface)'};
                             color:${lang===ln.c?'var(--gold)':'var(--ink-3)'};
                             font-family:${ln.c==='ur'?'var(--font-urdu)':ln.c==='hi'?'var(--font-hindi)':'var(--font-body)'};
                             font-size:0.9375rem;font-weight:500;cursor:pointer;
                             transition:all var(--t-fast) var(--ease);">
                ${ln.l}
              </button>
            `).join('')}
          </div>
        </div>

        <!-- ── RECITER ── -->
        <div class="sheet-section">
          <div class="sheet-section-label">
            ${lang==='ur'?'قاری':lang==='hi'?'क़ारी':'Reciter'}
          </div>
          <div style="display:flex;flex-direction:column;gap:6px;">
            ${Object.entries(RECITER_NAMES).map(([id, names]) => `
              <button onclick="setMenuReciter('${id}')"
                      id="reciter-opt-${id}"
                      style="width:100%;padding:11px 14px;border-radius:var(--r-md);
                             border:1px solid ${reciter===id?'var(--border-gold-strong)':'var(--border-mid)'};
                             background:${reciter===id?'var(--gold-dim)':'var(--bg-surface)'};
                             color:${reciter===id?'var(--gold)':'var(--ink-3)'};
                             font-family:var(--font-body);font-size:0.875rem;
                             font-weight:${reciter===id?'600':'400'};
                             cursor:pointer;text-align:left;
                             display:flex;align-items:center;justify-content:space-between;
                             transition:all var(--t-fast) var(--ease);">
                <span>${names[lang] || names.en}</span>
                ${reciter===id ? `<span style="font-size:0.75rem;opacity:0.8;">
                  ${lang==='ur'?'منتخب':lang==='hi'?'चुना हुआ':'Selected'} ✓
                </span>` : ''}
              </button>
            `).join('')}
          </div>
          <div style="margin-top:8px;font-size:0.6875rem;color:var(--ink-3);
                      font-style:italic;line-height:1.5;">
            ${lang==='ur'?'الحصری — حفظ کے لیے بہترین (سست اور واضح)'
              :lang==='hi'?'अल-हुसारी — हिफ़्ज़ के लिए बेहतरीन (धीमे और स्पष्ट)'
              :'Al-Husary recommended for hifz — slow and clear'}
          </div>
        </div>

        <!-- ── MY REFLECTIONS ── -->
        <div class="sheet-section">
          <div class="sheet-section-label">${t('myReflections', lang)}</div>
          <div class="sheet-row" onclick="showScreen('reflections');closeMenu();">
            <span class="sheet-row-label">✍ ${t('myReflections', lang)}</span>
            <span class="sheet-row-value">→</span>
          </div>
        </div>

        <!-- ── PATHWAY ── -->
        <div class="sheet-section">
          <div class="sheet-section-label">${t('pathway', lang)}</div>
          <div style="display:flex;gap:8px;">
            ${[
              { val:'surah', icon:'🌸', label:t('surahPath', lang) },
              { val:'juz',   icon:'📚', label:t('juzPath',   lang) },
            ].map(opt => `
              <button onclick="switchPathway('${opt.val}');closeMenu();"
                      style="flex:1;padding:12px 8px;border-radius:var(--r-md);
                             border:1px solid ${pathway===opt.val?'var(--border-gold-strong)':'var(--border-mid)'};
                             background:${pathway===opt.val?'var(--gold-dim)':'var(--bg-surface)'};
                             color:${pathway===opt.val?'var(--gold)':'var(--ink-3)'};
                             font-family:var(--font-body);font-size:0.8125rem;
                             font-weight:${pathway===opt.val?'600':'400'};
                             cursor:pointer;text-align:center;
                             transition:all var(--t-fast) var(--ease);">
                <div style="font-size:1.25rem;margin-bottom:4px;">${opt.icon}</div>
                ${opt.label}
              </button>
            `).join('')}
          </div>
        </div>

        <!-- ── SIGN OUT ── -->
        <button onclick="handleSignOut()"
                style="width:100%;padding:14px;border-radius:var(--r-md);
                       border:1.5px solid var(--wrong-border);background:none;
                       color:var(--wrong-text);font-family:var(--font-body);
                       font-size:0.9375rem;font-weight:500;cursor:pointer;
                       transition:all var(--t-fast) var(--ease);text-align:center;"
                onmouseover="this.style.background='var(--wrong-bg)'"
                onmouseout="this.style.background='none'">
          ${t('signOut', lang)}
        </button>

      </div><!-- end sheet-body -->
    </div><!-- end sheet -->
  `;
}

// ── Window handlers — called from sheet buttons ───────────────
window.setMenuTheme = function(mode) {
  applyTheme(mode);
  // Update button states
  ['system','dark','light'].forEach(m => {
    const btn = document.getElementById(`theme-opt-${m}`);
    if (!btn) return;
    const active = m === mode;
    btn.style.borderColor = active ? 'var(--border-gold-strong)' : 'var(--border-mid)';
    btn.style.background  = active ? 'var(--gold-dim)'           : 'var(--bg-surface)';
    btn.style.color       = active ? 'var(--gold)'               : 'var(--ink-3)';
  });
};

window.setMenuScript = function(script) {
  applyScript(script);
  ['indopak','uthmani'].forEach(s => {
    const btn = document.getElementById(`script-opt-${s}`);
    if (!btn) return;
    const active = s === script;
    btn.style.borderColor = active ? 'var(--border-gold-strong)' : 'var(--border-mid)';
    btn.style.background  = active ? 'var(--gold-dim)'           : 'var(--bg-surface)';
    btn.style.color       = active ? 'var(--gold)'               : 'var(--ink-3)';
  });
};

window.setMenuQuranSize = function(size) {
  applyQuranSize(size);
  document.querySelectorAll('[id^="qsz-"]').forEach(btn => {
    const active = btn.id === `qsz-${size}`;
    btn.classList.toggle('active', active);
  });
};

window.setMenuTransSize = function(size) {
  applyTransSize(size);
  document.querySelectorAll('[id^="tsz-"]').forEach(btn => {
    btn.classList.toggle('active', btn.id === `tsz-${size}`);
  });
};

window.setMenuReciter = function(id) {
  setReciter(id);
  // Update button states in-place — no sheet re-render needed
  Object.keys(RECITERS).forEach(rid => {
    const btn = document.getElementById(`reciter-opt-${rid}`);
    if (!btn) return;
    const active = rid === id;
    btn.style.borderColor  = active ? 'var(--border-gold-strong)' : 'var(--border-mid)';
    btn.style.background   = active ? 'var(--gold-dim)'           : 'var(--bg-surface)';
    btn.style.color        = active ? 'var(--gold)'               : 'var(--ink-3)';
    btn.style.fontWeight   = active ? '600'                       : '400';
    // Update the selected tick inside the button
    const tick = btn.querySelector('span:last-child');
    if (active && !tick?.textContent.includes('✓')) {
      // Add tick
      const t = document.createElement('span');
      t.style.cssText = 'font-size:0.75rem;opacity:0.8;';
      t.textContent = btn.closest('[data-lang]')?.getAttribute('data-lang') === 'ur'
        ? 'منتخب ✓' : btn.closest('[data-lang]')?.getAttribute('data-lang') === 'hi'
        ? 'चुना हुआ ✓' : 'Selected ✓';
      btn.appendChild(t);
    } else if (!active && tick?.textContent.includes('✓')) {
      tick.remove();
    }
  });
};

window.setMenuReciter = function(id) {
  setReciter(id);
  // Update button states in-place — no re-render needed
  ['afasy','husary','sudais','minshawi'].forEach(r => {
    const btn = document.getElementById(`reciter-opt-${r}`);
    if (!btn) return;
    const active = r === id;
    btn.style.borderColor  = active ? 'var(--border-gold-strong)' : 'var(--border-mid)';
    btn.style.background   = active ? 'var(--gold-dim)'           : 'var(--bg-surface)';
    btn.style.color        = active ? 'var(--gold)'               : 'var(--ink-3)';
    btn.style.fontWeight   = active ? '600'                       : '400';
    // Swap checkmark
    const check = btn.querySelector('span:last-child');
    if (active) {
      if (!check || check.textContent !== '✓') {
        const tick = document.createElement('span');
        tick.style.fontSize = '0.75rem';
        tick.textContent = '✓';
        btn.appendChild(tick);
      }
    } else {
      if (check && check.textContent === '✓') check.remove();
    }
  });
};

window.handleSignOut = function() {
  localStorage.clear();
  window.location.reload();
};
