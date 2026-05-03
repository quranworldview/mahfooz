// ============================================================
// MAHFOOZ — js/core/auth.js
// Auth state management — identical pattern to Iqra and Miftah.
//
// On boot: waits for Firebase to resolve auth state.
//   - Not logged in  → redirect to quranworldview.com/login
//   - Logged in      → resolve with uid, hand off to app boot
//
// getCurrentUid() — safe getter used by ProgressService.js
//   Returns uid string if logged in, null if not (offline/guest).
//   ProgressService falls back to localStorage-only when null.
// ============================================================

import { auth } from './firebase.js';

const LOGIN_URL = 'https://quranworldview.com/login';

// ── DEV MODE ──────────────────────────────────────────────────
// Set to true for local testing without Firebase auth.
// Resolves immediately with a fake uid — no redirect, no Firestore writes.
// ⚠️  MUST be false before deploying to quranworldview.com/mahfooz/
const DEV_MODE = true;

let _currentUid = null;

// ── waitForAuth ───────────────────────────────────────────────
// Returns a Promise that resolves with the uid once Firebase
// has confirmed auth state. Rejects (redirects) if not logged in.
// Call this in app.js boot() before rendering the first screen.
export function waitForAuth() {
  // DEV MODE — skip Firebase entirely, resolve with fake uid
  if (DEV_MODE) {
    console.warn('[Mahfooz] DEV_MODE=true — auth bypassed. Disable before deploying.');
    _currentUid = 'dev_user';
    return Promise.resolve('dev_user');
  }

  return new Promise((resolve) => {
    auth.onAuthStateChanged((user) => {
      if (user) {
        _currentUid = user.uid;
        resolve(user.uid);
      } else {
        const returnUrl = encodeURIComponent(window.location.href);
        window.location.href = `${LOGIN_URL}?redirect=${returnUrl}`;
      }
    });
  });
}

// ── getCurrentUid ─────────────────────────────────────────────
// Safe synchronous getter. Returns null if auth not yet resolved
// or user not logged in. ProgressService uses this for all writes.
export function getCurrentUid() {
  return _currentUid;
}

// ── getCurrentUser ────────────────────────────────────────────
// Full Firebase user object — for display name, email etc.
export function getCurrentUser() {
  return auth.currentUser;
}
