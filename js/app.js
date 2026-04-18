// ============================================================
// MAHFOOZ — app.js  v3.0
// All screens wired. Routes into #app-main on desktop.
// ============================================================

import { initTheme, applyTheme, getTheme,
         applyScript, applyQuranSize, applyTransSize, applyTextSize }
  from './core/theme.js';
import { getLang, setLang, t }                   from './core/i18n.js';
import { renderWelcomeScreen }                   from './screens/WelcomeScreen.js';
import { renderOnboardingScreen }                from './screens/OnboardingScreen.js';
import { renderHomeScreen }                      from './screens/HomeScreen.js';
import { renderSurahListScreen }                 from './screens/SurahListScreen.js';
import { renderSessionScreen, updateSessionLang } from './screens/SessionScreen.js';
import { renderReviewScreen }                    from './screens/ReviewScreen.js';
import { renderProgressScreen }                  from './screens/ProgressScreen.js';
import { renderTajweedScreen }                   from './screens/TajweedScreen.js';
import { renderReflectionsScreen }               from './screens/ReflectionsScreen.js';
import { renderMenuSheet }                       from './screens/MenuSheet.js';
import { openWordPopup, closeWordPopup }         from './screens/WordPopup.js';
import { openReflection, closeReflection }       from './screens/ReflectionModal.js';
import { playWord as _playWord }                 from './services/WordAudio.js';

window.APP = {
  lang:     getLang(),
  userName: localStorage.getItem('mahfooz_user_name') || '',
  pathway:  localStorage.getItem('mahfooz_pathway') || null,
};

const SCREENS = {
  welcome:      () => renderWelcomeScreen(window.APP.lang),
  onboarding:   () => renderOnboardingScreen(window.APP.lang),
  home:         () => renderHomeScreen(window.APP.lang, window.APP.userName),
  memorize:     () => renderSurahListScreen(window.APP.lang),
  session:      () => renderSessionScreen(window.APP.lang),
  review:       () => renderReviewScreen(window.APP.lang),
  progress:     () => renderProgressScreen(window.APP.lang),
  tajweed:      () => renderTajweedScreen(window.APP.lang),
  reflections:  () => Promise.resolve(renderReflectionsScreen(window.APP.lang)),
};

function getStartScreen() {
  const pathway = localStorage.getItem('mahfooz_pathway');
  if (pathway) { window.APP.pathway = pathway; return 'home'; }
  return 'onboarding';
}

function getTarget() {
  return document.getElementById('app-main') || document.getElementById('app');
}

window.showScreen = async function(name) {
  closeMenu();
  const target = getTarget();
  if (!target) return;

  const asyncScreens = ['memorize','session','review','progress','tajweed','home'];
  if (asyncScreens.includes(name)) {
    target.innerHTML = `
      <div style="display:flex;align-items:center;justify-content:center;
                  height:100%;min-height:60vh;flex-direction:column;gap:14px;background:var(--bg);">
        <div style="width:44px;height:44px;border-radius:12px;overflow:hidden;
                    border:1px solid var(--border-gold);">
          <img class="mahfooz-logo" src="icons/logo-dark.png"
               style="width:100%;height:100%;object-fit:cover;">
        </div>
        <div style="font-size:0.8125rem;color:var(--ink-3);">${t('loading', window.APP.lang)}</div>
      </div>`;
  }

  const renderFn = SCREENS[name];
  if (!renderFn) { console.warn('[Mahfooz] Unknown screen:', name); return; }

  try {
    const html = await Promise.resolve(renderFn());
    target.innerHTML = html;
  } catch (err) {
    console.error('[Mahfooz] Screen error:', name, err);
    target.innerHTML = `
      <div style="display:flex;align-items:center;justify-content:center;
                  height:100%;min-height:60vh;flex-direction:column;gap:16px;
                  padding:32px;background:var(--bg);text-align:center;">
        <div style="font-size:2rem;">⚠️</div>
        <div style="font-size:0.875rem;color:var(--ink-3);">${t('error', window.APP.lang)}</div>
        <button onclick="showScreen('home')"
                style="padding:10px 24px;border-radius:var(--r-md);
                       background:var(--gold-dim);border:1px solid var(--border-gold);
                       color:var(--gold);cursor:pointer;font-size:0.875rem;">
          ← ${t('navHome', window.APP.lang)}
        </button>
      </div>`;
    return;
  }

  if (name === 'review') {
    setTimeout(() => window._loadReviewCard?.(window.APP.lang), 80);
  }

  window.updateSidebarNav?.(name);

  window._mahfooz = {
    // Single tap → instant word audio play
    onWordTap: (idx, word, surah, ayah) => {
      const wordPos = idx + 1;
      document.querySelectorAll('.q-word').forEach((el, i) => {
        el.classList.toggle('playing', i === idx);
      });
      _playWord(surah, ayah, wordPos, {
        onEnd: () => {
          document.querySelectorAll('.q-word').forEach(el => el.classList.remove('playing'));
        },
      });
    },
    // Long press / right-click → full info popup
    onWordLongPress: (idx, word, surah, ayah) => {
      openWordPopup(idx, word, surah, ayah);
    },
    onScriptChange: () => {
      const cur = document.querySelector('.screen.active')?.dataset?.screen || 'home';
      window.showScreen(cur);
    },
  };

  // Long-press timer — shared across all q-word elements
  // When long-press fires, we set a flag that suppresses the next onclick
  let _lpTimer = null;
  let _lpFired = false;

  window._mhfzLpStart = function(idx, word, surah, ayah, el) {
    _lpFired = false;
    _lpTimer = setTimeout(() => {
      _lpTimer = null;
      _lpFired = true; // suppress the upcoming onclick
      window._mahfooz?.onWordLongPress(idx, word, surah, ayah);
    }, 500);
  };

  window._mhfzLpCancel = function() {
    if (_lpTimer) { clearTimeout(_lpTimer); _lpTimer = null; }
  };

  // Wrap onWordTap to skip if long-press just fired
  const _origOnWordTap = window._mahfooz.onWordTap;
  window._mahfooz.onWordTap = function(idx, word, surah, ayah) {
    if (_lpFired) { _lpFired = false; return; } // long-press already handled
    _origOnWordTap(idx, word, surah, ayah);
  };
};

window.setLang = function(lang) {
  setLang(lang); window.APP.lang = lang;
  document.documentElement.setAttribute('data-lang', lang);
  document.documentElement.setAttribute('dir', lang === 'ur' ? 'rtl' : 'ltr');
  const cur = document.querySelector('.screen.active')?.dataset?.screen || 'home';
  // Session screen: update lang in-place — don't restart the stage
  if (cur === 'session' && document.getElementById('sess-body')) {
    updateSessionLang(lang);
    return;
  }
  window.showScreen(cur);
};

window.applyTheme     = applyTheme;
window.applyScript    = applyScript;
window.applyQuranSize = applyQuranSize;
window.applyTransSize = applyTransSize;
window.applyTextSize  = applyTextSize;

window.showMenu  = function() {
  closeMenu();
  document.body.insertAdjacentHTML('beforeend', renderMenuSheet(window.APP.lang));
};
window.closeMenu = function() {
  document.getElementById('menu-overlay')?.remove();
  document.getElementById('menu-sheet')?.remove();
};

window.selectPathway = function(pathway) {
  localStorage.setItem('mahfooz_pathway', pathway);
  window.APP.pathway = pathway;
  window.showScreen('home');
};

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}

function boot() {
  initTheme();
  const lang = getLang();
  window.APP.lang = lang;
  document.documentElement.setAttribute('data-lang', lang);
  document.documentElement.setAttribute('dir', lang === 'ur' ? 'rtl' : 'ltr');

  const name = localStorage.getItem('mahfooz_user_name') || '';
  window.APP.userName = name;
  const usernameEl = document.getElementById('sidebar-username');
  if (usernameEl && name) usernameEl.textContent = name;

  window.showScreen(getStartScreen());
}

document.addEventListener('DOMContentLoaded', boot);

// ── iOS Audio Unlock ──────────────────────────────────────────
// iOS Safari blocks Web Audio and HTMLAudioElement.play() until
// a user gesture has occurred in the tab. We silently unlock on
// the first touch so all subsequent audio calls work instantly.
(function iosAudioUnlock() {
  let unlocked = false;
  function unlock() {
    if (unlocked) return;
    unlocked = true;
    // Create and immediately discard a silent audio buffer.
    // This satisfies Safari's "user gesture" requirement.
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const buf = ctx.createBuffer(1, 1, 22050);
      const src = ctx.createBufferSource();
      src.buffer = buf;
      src.connect(ctx.destination);
      src.start(0);
      ctx.close();
    } catch (_) {}
    // Also unlock HTMLAudioElement path
    try {
      const a = new Audio();
      a.src = 'data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQAAAAA=';
      a.play().catch(() => {});
    } catch (_) {}
    document.removeEventListener('touchstart', unlock, true);
    document.removeEventListener('touchend',   unlock, true);
    document.removeEventListener('click',      unlock, true);
  }
  document.addEventListener('touchstart', unlock, { capture: true, passive: true });
  document.addEventListener('touchend',   unlock, { capture: true, passive: true });
  document.addEventListener('click',      unlock, { capture: true, passive: true });
})();
