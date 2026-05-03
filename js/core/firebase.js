// ============================================================
// MAHFOOZ — js/core/firebase.js
// Firebase v8 compat SDK — loaded via CDN script tags in index.html.
// Do NOT use import/export for firebase itself.
// Do NOT use v10 syntax (getDoc, collection, etc.)
// This file assumes firebase-app.js, firebase-auth.js, and
// firebase-firestore.js are already loaded as <script> tags.
//
// Platform: quranworldview-home (single Firebase project for all QWV apps)
// Pattern: identical to Iqra, Miftah — every QWV app has its own copy.
// ============================================================

const firebaseConfig = {
  apiKey:            "AIzaSyCqxgyulLw6nitLSjn89M1u0A7bxbWlt_U",
  authDomain:        "quranworldview-home.firebaseapp.com",
  projectId:         "quranworldview-home",
  storageBucket:     "quranworldview-home.appspot.com",
  messagingSenderId: "YOUR_SENDER_ID",   // fill from Firebase console → Project Settings
  appId:             "YOUR_APP_ID",      // fill from Firebase console → Project Settings
};

if (!firebase.apps.length) {
  firebase.initializeApp(firebaseConfig);
}

export const db   = firebase.firestore();
export const auth = firebase.auth();

// ── Collection name constants ─────────────────────────────────
// Prevents typos. Add new collections here, never inline.
export const COLLECTIONS = {
  USERS:             'users',
  MAHFOOZ_PROGRESS:  'mahfooz_progress',   // Top-level, keyed by uid
};

// ── Subcollection constants ───────────────────────────────────
export const SUB_COLLECTIONS = {
  AYAH_PROGRESS: 'ayah_progress',          // mahfooz_progress/{uid}/ayah_progress/{surah}_{ayah}
};
