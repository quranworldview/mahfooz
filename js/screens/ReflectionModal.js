// ============================================================
// MAHFOOZ — ReflectionModal.js
// Ayah-specific reflection. Aligns exactly with Dashboard schema.
//
// document ID format: mahfooz_{uid}_{surahNum}_{ayahNum}
// app_source: 'mahfooz'
// stage: 3
// body field (not text — Iqra's historical quirk only)
// lens: absent (Miftah only)
// ============================================================
import { t } from '../core/i18n.js';
import { sanitise } from '../core/ArabicText.js';

// Stub progress until Firestore is wired
function getUID() { return localStorage.getItem('mahfooz_uid') || 'local_user'; }
function getName() { return localStorage.getItem('mahfooz_user_name') || 'Anonymous'; }

export function renderReflectionModal(surahNum, ayahNum, ayahData, lang) {
  const arabicText = sanitise(ayahData?.arabic || '');
  const translation = ayahData?.[`translation_${lang}`] || ayahData?.translation_en || '';
  const surahName = ayahData?.surah_name || { en: `Surah ${surahNum}`, hi: `सूरह ${surahNum}`, ur: `سورہ ${surahNum}` };

  return `
    <div class="sheet-overlay" id="reflection-overlay" onclick="closeReflection()"></div>
    <div class="sheet" id="reflection-sheet" style="max-height:90vh;"
         onclick="event.stopPropagation()">
      <div class="sheet-handle"></div>
      <div style="font-family:var(--font-display);font-size:1.25rem;font-weight:400;
                  color:var(--ink);padding:14px 20px 10px;border-bottom:1px solid var(--border);">
        ${t('reflectionTitle', lang)}
      </div>

      <div style="padding:16px 20px;overflow-y:auto;max-height:calc(90vh - 60px);">

        <!-- Ayah preview -->
        <div class="reflection-ayah-preview">
          ${arabicText ? `
            <div class="reflection-ayah-text" lang="ar" dir="rtl">${arabicText}</div>
          ` : ''}
          <div style="font-size:0.75rem;color:var(--ink-3);font-style:italic;
                      ${lang==='ur'?'text-align:right;':''}">
            ${translation}
          </div>
          <div style="font-size:0.6875rem;color:var(--ink-3);opacity:0.7;margin-top:4px;
                      ${lang==='ur'?'text-align:right;':''};letter-spacing:0.06em;text-transform:uppercase;">
            ${surahName[lang] || surahName.en} · ${lang==='ur'?'آیت':lang==='hi'?'आयत':'Ayah'} ${ayahNum}
          </div>
        </div>

        <!-- Reflection input -->
        <textarea class="reflection-input" id="reflection-body"
                  placeholder="${t('reflectionHint', lang)}"
                  rows="4"
                  ${lang==='ur'?'dir="rtl" style="text-align:right;"':''}></textarea>

        <!-- Visibility -->
        <div class="visibility-row">
          <button class="visibility-btn active" id="vis-named"
                  onclick="setVisibility('named')">
            👤 ${t('publishNamed', lang)}
          </button>
          <button class="visibility-btn" id="vis-anon"
                  onclick="setVisibility('anon')">
            🕵️ ${t('publishAnon', lang)}
          </button>
        </div>

        <!-- Submit / Cancel -->
        <button class="btn btn-primary" onclick="submitReflection(${surahNum},${ayahNum},'${encodeURIComponent(JSON.stringify(surahName))}')"
                style="margin-bottom:10px;">
          ${t('reflectionSubmit', lang)}
        </button>
        <button class="btn btn-ghost" onclick="closeReflection()"
                style="text-align:center;color:var(--ink-3);">
          ${t('reflectionCancel', lang)}
        </button>

      </div>
    </div>
  `;
}

// ── Handlers ──────────────────────────────────────────────────
let _visibility = 'named';

window.setVisibility = function(v) {
  _visibility = v;
  document.getElementById('vis-named')?.classList.toggle('active', v === 'named');
  document.getElementById('vis-anon')?.classList.toggle('active',  v === 'anon');
};

window.submitReflection = function(surahNum, ayahNum, surahNameEncoded) {
  const body = document.getElementById('reflection-body')?.value?.trim();
  if (!body) return;

  const lang      = document.documentElement.getAttribute('data-lang') || 'hi';
  const uid       = getUID();
  const name      = getName();
  const surahName = JSON.parse(decodeURIComponent(surahNameEncoded));
  const docId     = `mahfooz_${uid}_${surahNum}_${ayahNum}`;

  // Build reflection object — aligned exactly with Dashboard schema
  const reflection = {
    uid,
    author_name:    name,
    title:          `${surahName.en || 'Reflection'} · Ayah ${ayahNum}`,
    body,                           // body, not text
    surah:          surahNum,
    ayah:           ayahNum,
    surah_name:     surahName,
    theme_tags:     [],
    stage:          3,              // Mahfooz = Stage 3
    app_source:     'mahfooz',
    language:       lang,
    published_as:   _visibility === 'named' ? 'named' : 'anonymous',
    status:         'pending',
    submitted_at:   new Date().toISOString(),
    blog_post_id:   null,
    library_gem_id: null,
    // lens and lens_name intentionally absent (Miftah only)
  };

  // Phase 1: save to localStorage
  // Phase 2: write to user_reflections/{docId} in Firestore
  const saved = JSON.parse(localStorage.getItem('mahfooz_reflections') || '{}');
  saved[docId] = reflection;
  localStorage.setItem('mahfooz_reflections', JSON.stringify(saved));

  closeReflection();

  // Show brief confirmation
  const toast = document.createElement('div');
  toast.style.cssText = `
    position:fixed;bottom:calc(var(--bottomnav-h)+20px);left:50%;
    transform:translateX(-50%);
    background:var(--bg-elevated);border:1px solid var(--border-gold);
    border-radius:var(--r-pill);padding:10px 20px;
    font-size:0.875rem;color:var(--gold);z-index:400;
    box-shadow:var(--shadow-md);
    animation:slideUp 0.3s var(--ease-spring);
    white-space:nowrap;
  `;
  toast.textContent = lang==='ur'?'شکریہ ✓':lang==='hi'?'शुक्रिया ✓':'Submitted ✓';
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 2500);
};

export function closeReflection() {
  document.getElementById('reflection-overlay')?.remove();
  document.getElementById('reflection-sheet')?.remove();
}
window.closeReflection = closeReflection;

// ── Open reflection modal ─────────────────────────────────────
export function openReflection(surahNum, ayahNum, ayahData) {
  closeReflection();
  const lang = document.documentElement.getAttribute('data-lang') || 'hi';
  document.body.insertAdjacentHTML('beforeend',
    renderReflectionModal(surahNum, ayahNum, ayahData || {}, lang));
}
window.openReflection = openReflection;
