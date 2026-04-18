// ============================================================
// MAHFOOZ — TajweedScreen.js
// The Tajweed Gems collection.
// Shows discovered rules richly, locked rules as silhouettes.
// ============================================================
import { t } from '../core/i18n.js';

let _rules = null;

async function loadRules() {
  if (_rules) return _rules;
  const res = await fetch('js/data/tajweed-rules.json');
  _rules = await res.json();
  return _rules;
}

function getDiscovered() {
  const raw = localStorage.getItem('mahfooz_tajweed_discovered') || '[]';
  try { return JSON.parse(raw); } catch { return []; }
}

export function addDiscoveredRule(ruleId) {
  const discovered = getDiscovered();
  if (!discovered.includes(ruleId)) {
    discovered.push(ruleId);
    localStorage.setItem('mahfooz_tajweed_discovered', JSON.stringify(discovered));
    return true; // newly discovered
  }
  return false;
}

export async function renderTajweedScreen(lang) {
  const rules      = await loadRules();
  const discovered = getDiscovered();
  const dCount     = discovered.length;
  const total      = rules.length;

  return `
    <div class="screen active" data-screen="tajweed"
         style="background:var(--bg);">

      <div class="topbar">
        <div class="topbar-brand">
          <button onclick="showScreen('home')"
                  style="background:none;border:none;cursor:pointer;
                         color:var(--ink-3);font-size:1.25rem;padding:0;">←</button>
          <span style="font-family:var(--font-display);font-size:1rem;
                       color:var(--ink);font-weight:400;">${t('tajweedGems', lang)}</span>
        </div>
        <button class="menu-btn" onclick="showMenu()">☰</button>
      </div>

      <div class="scroll-area" style="padding-bottom:calc(var(--bottomnav-h)+16px);">

        <!-- Header -->
        <div style="padding:20px 20px 16px;text-align:center;">
          <div style="font-size:2.5rem;margin-bottom:10px;">🎨</div>
          <div style="font-family:var(--font-display);font-size:1.375rem;
                      color:var(--ink);margin-bottom:6px;">
            ${t('tajweedTitle', lang)}
          </div>
          <div style="font-size:0.875rem;color:var(--ink-3);">
            <span style="color:var(--gold);font-weight:600;">${dCount}</span>
            ${lang==='ur'?'دریافت شدہ':lang==='hi'?'खोजे गए':'discovered'}
            &nbsp;·&nbsp;
            <span style="color:var(--ink-3);">${total - dCount} ${t('toDiscover', lang)}</span>
          </div>

          <!-- Progress bar -->
          <div style="margin:14px auto 0;max-width:200px;height:4px;
                      background:var(--border-mid);border-radius:2px;overflow:hidden;">
            <div style="height:100%;width:${Math.round((dCount/total)*100)}%;
                        background:linear-gradient(90deg,var(--crimson),var(--gold));
                        transition:width 0.5s ease;"></div>
          </div>
        </div>

        <!-- Rules list -->
        <div style="padding:0 20px 16px;display:flex;flex-direction:column;gap:10px;">
          ${rules.map(rule => _renderRuleCard(rule, discovered.includes(rule.id), lang)).join('')}
        </div>

      </div>

      <!-- Bottom nav -->
      <div class="bottom-nav">
        ${['home','memorize','review','progress'].map((s,i) => `
          <button class="nav-tab ${s==='tajweed'?'active':''}" onclick="showScreen('${s}')">
            <span class="nav-tab-icon">${['🏠','📖','🔄','📊'][i]}</span>
            <span>${[t('navHome',lang),t('navMemorize',lang),t('navReview',lang),t('navProgress',lang)][i]}</span>
          </button>
        `).join('')}
      </div>
    </div>
  `;
}

function _renderRuleCard(rule, isDiscovered, lang) {
  const name      = rule.name?.[lang]      || rule.name?.en      || '';
  const oneLiner  = rule.one_liner?.[lang] || rule.one_liner?.en || '';
  const exNote    = rule.example_note?.[lang] || rule.example_note?.en || '';

  if (!isDiscovered) {
    return `
      <div style="background:var(--bg-elevated);border:1px solid var(--border);
                  border-radius:var(--r-lg);padding:16px 18px;
                  opacity:0.5;position:relative;overflow:hidden;">
        <div style="display:flex;align-items:center;gap:12px;">
          <div style="width:10px;height:10px;border-radius:50%;
                      background:var(--border-mid);flex-shrink:0;"></div>
          <div>
            <div style="font-family:var(--font-display);font-size:1rem;
                        color:var(--ink-3);">${t('ruleNotYet', lang)}</div>
            <div style="font-size:0.75rem;color:var(--ink-3);margin-top:2px;">
              ${lang==='ur'?'حفظ کرتے وقت دریافت ہوگا':lang==='hi'?'याद करते वक़्त मिलेगा':'Discover it while memorizing'}
            </div>
          </div>
          <div style="margin-left:auto;font-size:1rem;color:var(--border-mid);">🔒</div>
        </div>
      </div>
    `;
  }

  return `
    <div style="background:var(--bg-elevated);border:1px solid var(--border-gold);
                border-radius:var(--r-lg);padding:18px 18px 16px;
                box-shadow:var(--shadow-sm);position:relative;overflow:hidden;">

      <!-- Color accent top bar -->
      <div style="position:absolute;top:0;left:0;right:0;height:3px;
                  background:${rule.color || 'var(--gold)'};opacity:0.8;"></div>

      <!-- Rule header -->
      <div style="display:flex;align-items:flex-start;gap:12px;margin-bottom:12px;">
        <div style="width:12px;height:12px;border-radius:50%;
                    background:${rule.color || 'var(--gold)'};
                    flex-shrink:0;margin-top:5px;
                    box-shadow:0 0 6px ${rule.color || 'var(--gold)'}44;"></div>
        <div>
          <div style="font-family:var(--font-display);font-size:1.0625rem;
                      color:var(--ink);margin-bottom:4px;">${name}</div>
          <div style="font-size:0.8125rem;color:var(--ink-3);line-height:1.6;">
            ${oneLiner}
          </div>
        </div>
      </div>

      <!-- Example -->
      <div style="background:var(--bg-surface);border:1px solid var(--border);
                  border-radius:var(--r-md);padding:12px 14px;">
        <div style="font-family:var(--font-arabic);font-size:26px;
                    direction:rtl;text-align:right;line-height:2;
                    color:${rule.color || 'var(--gold)'};margin-bottom:6px;"
             lang="ar">
          ${rule.example_arabic || ''}
        </div>
        <div style="font-size:0.75rem;color:var(--ink-3);font-style:italic;">
          ${exNote}
        </div>
      </div>
    </div>
  `;
}
