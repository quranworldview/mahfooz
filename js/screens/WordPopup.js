// ============================================================
// MAHFOOZ — WordPopup.js
// Word tap → popup with meaning, audio (timestamp-seek), Alif badge
// ============================================================
import { t } from '../core/i18n.js';
import { lookupWord } from '../core/ArabicText.js';
import { playWord, stopAudio } from '../services/WordAudio.js';

export function openWordPopup(idx, wordEncoded, surahNum, ayahNum) {
  closeWordPopup();
  const lang = document.documentElement.getAttribute('data-lang') || 'hi';
  const word = decodeURIComponent(wordEncoded);

  document.body.insertAdjacentHTML('beforeend', `
    <div class="word-popup-overlay" id="wp-overlay" onclick="closeWordPopup()"></div>
    <div class="word-popup" id="wp-popup">
      <div class="popup-word-arabic" lang="ar">${word}</div>
      <div class="popup-transliteration" style="color:var(--ink-3);font-style:italic;">
        ${lang==='ur'?'لوڈ ہو رہا ہے…':lang==='hi'?'लोड हो रहा है…':'Looking up…'}
      </div>
    </div>
  `);

  // Highlight tapped word
  document.querySelectorAll('.q-word').forEach((el, i) => {
    el.classList.toggle('highlighted', i === idx);
  });

  // Play audio immediately on open too
  playWord(surahNum, ayahNum, idx + 1);

  lookupWord(wordEncoded, surahNum, ayahNum).then(data => {
    _renderFull(data, lang, surahNum, ayahNum, idx);
  });
}

function _renderFull(data, lang, surahNum, ayahNum, wordIdx) {
  const popup = document.getElementById('wp-popup');
  if (!popup) return;

  const meaning = data.meaning?.[lang] || data.meaning?.en || '';
  const hasAlif = data.alifLesson !== null;
  const freq    = data.frequency;

  popup.innerHTML = `
    <div class="popup-word-arabic" lang="ar" dir="rtl">${data.arabic}</div>

    ${data.transliteration ? `
      <div class="popup-transliteration">${data.transliteration}</div>
    ` : ''}

    ${meaning ? `
      <div class="popup-meaning">${meaning}</div>
    ` : `
      <div class="popup-meaning" style="color:var(--ink-3);font-size:1rem;">
        ${lang==='ur'?'قرآنی لفظ':lang==='hi'?'क़ुरआनी लफ़्ज़':'Qur\'anic word'}
      </div>
    `}

    <div class="popup-divider"></div>

    <div class="popup-meta">
      ${data.root ? `
        <span class="popup-chip">
          ${lang==='ur'?'جڑ':lang==='hi'?'जड़':'Root'}:
          <span class="arabic" style="font-size:14px;margin-right:3px;">${data.root}</span>
        </span>
      ` : ''}
      ${freq ? `
        <span class="popup-chip">${freq}× ${t('wordFreq', lang)}</span>
      ` : ''}
      ${hasAlif ? `
        <span class="popup-chip alif">
          ✨ ${t('fromAlif', lang)} · ${t('lesson', lang)} ${data.alifLesson}
        </span>
      ` : ''}
    </div>

    <button class="popup-audio-btn" id="wp-audio-btn"
            onclick="wpPlayWord(${surahNum},${ayahNum},${wordIdx})">
      ▶ ${t('playWord', lang)}
    </button>

    <div style="text-align:center;margin-top:10px;font-size:0.6875rem;color:var(--ink-3);">
      ${lang==='ur'?'باہر ٹیپ کریں بند کرنے کے لیے':lang==='hi'?'बाहर टैप करके बंद करें':'Tap outside to close'}
    </div>
  `;
}

// ── Word audio via timestamp-seek ─────────────────────────────
window.wpPlayWord = function(surahNum, ayahNum, wordIdx) {
  const btn  = document.getElementById('wp-audio-btn');
  const lang = document.documentElement.getAttribute('data-lang') || 'hi';
  const wordPos = wordIdx + 1; // convert 0-based idx to 1-based position

  if (btn) { btn.classList.add('playing'); btn.textContent = '⏹ Stop'; }

  playWord(surahNum, ayahNum, wordPos, {
    onStart: () => {
      if (btn) { btn.classList.add('playing'); btn.textContent = '⏹ Stop'; }
    },
    onEnd: () => {
      if (btn) { btn.classList.remove('playing'); btn.textContent = `▶ ${t('playWord', lang)}`; }
    },
  });
};

export function closeWordPopup() {
  document.getElementById('wp-overlay')?.remove();
  document.getElementById('wp-popup')?.remove();
  document.querySelectorAll('.q-word').forEach(el => el.classList.remove('highlighted'));
  stopAudio();
}
window.closeWordPopup = closeWordPopup;
window.openWordPopup  = openWordPopup;
