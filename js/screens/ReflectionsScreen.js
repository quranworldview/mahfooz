// ============================================================
// MAHFOOZ — ReflectionsScreen.js
// Student's personal reflection history.
// Shows all submitted reflections with ayah, status, body.
// ============================================================
import { t } from '../core/i18n.js';

export function renderReflectionsScreen(lang) {
  const raw = localStorage.getItem('mahfooz_reflections') || '{}';
  let reflections = [];
  try {
    const obj = JSON.parse(raw);
    reflections = Object.values(obj).sort((a, b) =>
      new Date(b.submitted_at) - new Date(a.submitted_at)
    );
  } catch { reflections = []; }

  return `
    <div class="screen active" data-screen="reflections"
         style="background:var(--bg);">

      <div class="topbar">
        <div class="topbar-brand">
          <button onclick="showScreen('home')"
                  style="background:none;border:none;cursor:pointer;
                         color:var(--ink-3);font-size:1.25rem;padding:0;">←</button>
          <span style="font-family:var(--font-display);font-size:1rem;
                       color:var(--ink);font-weight:400;">${t('myReflections', lang)}</span>
        </div>
        <button class="menu-btn" onclick="showMenu()">☰</button>
      </div>

      <div class="scroll-area" style="padding-bottom:calc(var(--bottomnav-h)+16px);">

        ${reflections.length === 0 ? `
          <div style="padding:48px 24px;text-align:center;">
            <div style="font-size:2.5rem;margin-bottom:16px;">✍️</div>
            <div style="font-family:var(--font-display);font-size:1.25rem;
                        color:var(--ink);margin-bottom:8px;">${t('noReflections', lang)}</div>
            <div style="font-size:0.875rem;color:var(--ink-3);margin-bottom:24px;">
              ${lang==='ur'?'کسی آیت پر ✍ بٹن دبائیں':lang==='hi'?'किसी आयत पर ✍ बटन दबाएं':'Tap ✍ on any ayah to write your first reflection.'}
            </div>
            <button class="btn btn-primary" onclick="showScreen('memorize')"
                    style="max-width:240px;">
              ${t('navMemorize', lang)} →
            </button>
          </div>
        ` : `
          <div style="padding:16px 20px 8px;">
            <div class="label" style="margin-bottom:4px;">${reflections.length}
              ${lang==='ur'?'خیالات':lang==='hi'?'ख़यालात':'reflections'}
            </div>
          </div>
          <div style="padding:0 20px;display:flex;flex-direction:column;gap:10px;">
            ${reflections.map(r => _renderReflectionCard(r, lang)).join('')}
          </div>
        `}

      </div>

      <!-- Bottom nav -->
      <div class="bottom-nav">
        ${['home','memorize','review','progress'].map((s,i) => `
          <button class="nav-tab" onclick="showScreen('${s}')">
            <span class="nav-tab-icon">${['🏠','📖','🔄','📊'][i]}</span>
            <span>${[t('navHome',lang),t('navMemorize',lang),t('navReview',lang),t('navProgress',lang)][i]}</span>
          </button>
        `).join('')}
      </div>
    </div>
  `;
}

function _renderReflectionCard(r, lang) {
  const surahName = r.surah_name?.[lang] || r.surah_name?.en || `Surah ${r.surah}`;
  const date = r.submitted_at
    ? new Date(r.submitted_at).toLocaleDateString(
        lang === 'ur' ? 'ur-PK' : lang === 'hi' ? 'hi-IN' : 'en-US',
        { day:'numeric', month:'short', year:'numeric' }
      )
    : '';
  const statusLabel = r.status === 'approved'
    ? `<span class="s-badge locked">✓ ${t('approvedBadge', lang)}</span>`
    : `<span class="s-badge fresh">${t('pendingBadge', lang)}</span>`;

  return `
    <div style="background:var(--bg-elevated);border:1px solid var(--border);
                border-radius:var(--r-lg);padding:16px 18px;box-shadow:var(--shadow-sm);">

      <!-- Ayah reference -->
      <div style="display:flex;align-items:center;justify-content:space-between;
                  margin-bottom:10px;">
        <div style="display:flex;align-items:center;gap:8px;">
          <div class="arabic" style="font-size:15px;color:var(--ink-3);">
            ${r.surah}:${r.ayah}
          </div>
          <div style="font-size:0.75rem;color:var(--ink-3);">${surahName}</div>
        </div>
        ${statusLabel}
      </div>

      <!-- Reflection body -->
      <div style="font-size:0.9375rem;color:var(--ink);line-height:1.7;
                  margin-bottom:10px;${lang==='ur'?'direction:rtl;text-align:right;':''}">
        ${r.body || ''}
      </div>

      <!-- Date + visibility -->
      <div style="display:flex;align-items:center;justify-content:space-between;">
        <div style="font-size:0.6875rem;color:var(--ink-3);">${date}</div>
        <div style="font-size:0.6875rem;color:var(--ink-3);">
          ${r.published_as === 'anonymous'
            ? (lang==='ur'?'گمنام':lang==='hi'?'बेनाम':'Anonymous')
            : (lang==='ur'?'نام کے ساتھ':lang==='hi'?'नाम के साथ':'Named')}
        </div>
      </div>
    </div>
  `;
}
