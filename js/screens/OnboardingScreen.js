// ============================================================
// MAHFOOZ — OnboardingScreen.js
// 4 slides. Warm. Modern. Not a madrasa.
// Ends with pathway selection → home.
// ============================================================
import { t } from '../core/i18n.js';

let _slide = 0;
const TOTAL = 4;

export function renderOnboardingScreen(lang) {
  _slide = 0;
  return `
    <div class="screen active" data-screen="onboarding"
         style="display:flex; flex-direction:column; min-height:100vh; background:var(--bg);">

      <!-- Progress dots -->
      <div style="display:flex; justify-content:center; gap:8px; padding:20px 20px 0;">
        ${[0,1,2,3].map(i => `
          <div id="ob-dot-${i}" style="
            width:${i===0?'20px':'8px'}; height:8px; border-radius:4px;
            background:${i===0?'var(--gold)':'var(--border-mid)'};
            transition:all 0.3s var(--ease);">
          </div>
        `).join('')}
      </div>

      <!-- Slide area -->
      <div id="ob-slide" style="flex:1; display:flex; flex-direction:column;">
        ${_buildSlide(0, lang)}
      </div>

    </div>
  `;
}

function _buildSlide(idx, lang) {
  const slides = [_slide0, _slide1, _slide2, _slide3];
  return (slides[idx] || _slide0)(lang);
}

// ── Slide 0 — Arrival ────────────────────────────────────────
function _slide0(lang) {
  return `
    <div class="stagger" style="flex:1;display:flex;flex-direction:column;
         align-items:center;justify-content:center;padding:24px 28px;text-align:center;">
      <div style="font-size:3.5rem;margin-bottom:20px;">🤲</div>
      <h2 style="font-family:var(--font-display);font-size:1.875rem;font-weight:400;
                 color:var(--ink);margin-bottom:14px;">${t('ob1Title', lang)}</h2>
      <p style="font-size:0.9375rem;color:var(--ink-3);line-height:1.8;
                max-width:300px;margin-bottom:28px;">${t('ob1Body', lang)}</p>

      <div style="background:var(--bg-elevated);border:1px solid var(--border-gold);
                  border-radius:var(--r-lg);padding:18px 20px;width:100%;">
        <div class="ayah-arabic" lang="ar" dir="rtl"
             style="font-size:24px;text-align:center;margin-bottom:8px;line-height:2.2;">
          وَإِنَّا لَهُۥ لَحَٰفِظُونَ
        </div>
        <div style="font-size:0.75rem;color:var(--ink-3);font-style:italic;text-align:center;">
          "…and indeed, We will be its guardian." — Al-Hijr 15:9
        </div>
      </div>
    </div>
    ${_navBtns(lang, 0)}
  `;
}

// ── Slide 1 — The Miracle ────────────────────────────────────
function _slide1(lang) {
  const stats = [
    { n:'1,400+', l: lang==='ur'?'سال پہلے نازل ہوا':lang==='hi'?'साल पहले नाज़िल':'Years unchanged', icon:'📅' },
    { n:'10M+',   l: lang==='ur'?'حفاظ دنیا میں':lang==='hi'?'हुफ़्फ़ाज़ दुनिया में':'Huffaz worldwide', icon:'🌍' },
    { n:'6,236',  l: lang==='ur'?'آیات قرآن میں':lang==='hi'?'आयात क़ुरआन में':'Ayat in Qur\'an', icon:'📖' },
    { n:'0',      l: lang==='ur'?'حروف بدلے':lang==='hi'?'हर्फ़ बदला':'Letters changed', icon:'✦' },
  ];
  return `
    <div class="stagger" style="flex:1;display:flex;flex-direction:column;
         align-items:center;justify-content:center;padding:24px 24px;text-align:center;">
      <div style="font-size:3rem;margin-bottom:16px;">✨</div>
      <h2 style="font-family:var(--font-display);font-size:1.75rem;font-weight:400;
                 color:var(--ink);margin-bottom:12px;">${t('ob2Title', lang)}</h2>
      <p style="font-size:0.9rem;color:var(--ink-3);line-height:1.8;
                max-width:300px;margin-bottom:24px;">${t('ob2Body', lang)}</p>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;width:100%;">
        ${stats.map(s => `
          <div class="lift" style="background:var(--bg-elevated);border:1px solid var(--border);
                              border-radius:var(--r-md);padding:16px 10px;text-align:center;
                              box-shadow:var(--shadow);">
            <div style="font-size:1.25rem;margin-bottom:6px;">${s.icon}</div>
            <div style="font-family:var(--font-display);font-size:1.75rem;font-weight:300;
                        color:var(--gold);line-height:1;margin-bottom:5px;">${s.n}</div>
            <div style="font-size:0.6rem;color:var(--ink-3);text-transform:uppercase;
                        letter-spacing:0.06em;">${s.l}</div>
          </div>
        `).join('')}
      </div>
    </div>
    ${_navBtns(lang, 1)}
  `;
}

// ── Slide 2 — Choose Path ────────────────────────────────────
function _slide2(lang) {
  return `
    <div class="stagger" style="flex:1;display:flex;flex-direction:column;padding:20px 20px 0;">
      <h2 style="font-family:var(--font-display);font-size:1.75rem;font-weight:400;
                 color:var(--ink);text-align:center;margin-bottom:6px;">
        ${t('pathwayTitle', lang)}
      </h2>
      <p style="font-size:0.8125rem;color:var(--ink-3);text-align:center;margin-bottom:20px;">
        ${lang==='ur'?'بعد میں بدل سکتے ہیں':lang==='hi'?'बाद में बदल सकते हैं':'You can change this later.'}
      </p>

      <!-- Juz card -->
      <div class="lift" onclick="selectPathway('juz')"
           style="background:var(--bg-elevated);border:1px solid var(--border);
                  border-left:3px solid var(--crimson);border-radius:var(--r-lg);
                  padding:20px;margin-bottom:12px;cursor:pointer;box-shadow:var(--shadow);">
        <div style="display:flex;align-items:flex-start;gap:14px;">
          <span style="font-size:2rem;flex-shrink:0;">📚</span>
          <div>
            <div style="font-family:var(--font-display);font-size:1.125rem;
                        color:var(--ink);margin-bottom:4px;">${t('juzPath', lang)}</div>
            <div style="font-size:0.8125rem;color:var(--ink-3);line-height:1.6;">
              ${t('juzDesc', lang)}
            </div>
            <div style="display:flex;gap:6px;margin-top:10px;flex-wrap:wrap;">
              ${['Juz 30','Juz 29','Juz 28','…'].map(j=>`
                <span style="background:var(--bg-surface);border:1px solid var(--border-mid);
                             border-radius:var(--r-pill);padding:2px 8px;font-size:0.625rem;
                             color:var(--ink-3);">${j}</span>
              `).join('')}
            </div>
          </div>
        </div>
      </div>

      <!-- Surah card -->
      <div class="lift" onclick="selectPathway('surah')"
           style="background:var(--bg-elevated);border:1px solid var(--border);
                  border-left:3px solid var(--gold);border-radius:var(--r-lg);
                  padding:20px;margin-bottom:12px;cursor:pointer;box-shadow:var(--shadow);">
        <div style="display:flex;align-items:flex-start;gap:14px;">
          <span style="font-size:2rem;flex-shrink:0;">🌸</span>
          <div>
            <div style="font-family:var(--font-display);font-size:1.125rem;
                        color:var(--ink);margin-bottom:4px;">${t('surahPath', lang)}</div>
            <div style="font-size:0.8125rem;color:var(--ink-3);line-height:1.6;">
              ${t('surahDesc', lang)}
            </div>
            <div style="display:flex;gap:6px;margin-top:10px;flex-wrap:wrap;">
              ${['Al-Ikhlas','Al-Falaq','An-Nas','Al-Asr'].map(s=>`
                <span style="background:var(--gold-dim);border:1px solid var(--border-gold);
                             border-radius:var(--r-pill);padding:2px 8px;font-size:0.625rem;
                             color:var(--gold);">${s}</span>
              `).join('')}
            </div>
          </div>
        </div>
      </div>

    </div>
    ${_navBtns(lang, 2, true)}
  `;
}

// ── Slide 3 — Ready ───────────────────────────────────────────
function _slide3(lang) {
  return `
    <div class="stagger" style="flex:1;display:flex;flex-direction:column;
         align-items:center;justify-content:center;padding:24px 28px;text-align:center;">
      <div class="arabic" style="font-size:56px;color:var(--gold);line-height:1.5;
                                  margin-bottom:16px;">
        بِسْمِ اللَّهِ
      </div>
      <h2 style="font-family:var(--font-display);font-size:1.75rem;font-weight:400;
                 color:var(--ink);margin-bottom:12px;">${t('ob4Title', lang)}</h2>
      <p style="font-size:0.9rem;color:var(--ink-3);line-height:1.8;max-width:280px;">
        ${t('ob4Body', lang)}
      </p>
    </div>
    ${_navBtns(lang, 3)}
  `;
}

// ── Nav buttons ───────────────────────────────────────────────
function _navBtns(lang, idx, hideNext = false) {
  const isLast = idx === TOTAL - 1;
  return `
    <div style="padding:16px 20px max(24px,env(safe-area-inset-bottom));
                display:flex;flex-direction:column;gap:8px;">
      ${!hideNext ? `
        <button class="btn btn-primary"
                onclick="${isLast?`showScreen('home')`:`obNext(${idx},'${lang}')`}">
          ${isLast ? t('obCTA', lang) : t('next', lang)}
        </button>
      ` : ''}
      ${idx > 0 ? `
        <button class="btn btn-ghost" style="text-align:center;"
                onclick="obBack(${idx},'${lang}')">
          ${t('back', lang)}
        </button>
      ` : ''}
    </div>
  `;
}

// ── Navigation ────────────────────────────────────────────────
function _goTo(idx, lang) {
  _slide = idx;
  // Update dots
  for (let i = 0; i < TOTAL; i++) {
    const d = document.getElementById(`ob-dot-${i}`);
    if (d) {
      d.style.width     = i === idx ? '20px' : '8px';
      d.style.background = i === idx ? 'var(--gold)' : 'var(--border-mid)';
    }
  }
  // Swap slide with fade
  const el = document.getElementById('ob-slide');
  if (!el) return;
  el.style.opacity = '0';
  el.style.transform = 'translateY(8px)';
  setTimeout(() => {
    el.innerHTML = _buildSlide(idx, lang);
    el.style.transition = 'opacity 0.28s var(--ease), transform 0.28s var(--ease)';
    el.style.opacity    = '1';
    el.style.transform  = 'translateY(0)';
  }, 140);
}

export function obNext(idx, lang) { _goTo(Math.min(idx + 1, TOTAL - 1), lang); }
export function obBack(idx, lang) { _goTo(Math.max(idx - 1, 0), lang); }

window.obNext = obNext;
window.obBack = obBack;
