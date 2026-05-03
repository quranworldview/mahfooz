const CACHE = 'mahfooz-v31';
const PRECACHE = [
  './', './index.html', './manifest.json',
  './css/design.css', './css/components.css',
  './js/app.js',
  './js/core/theme.js', './js/core/i18n.js', './js/core/ArabicText.js', './js/core/TajweedText.js',
  './js/services/QuranAPI.js', './js/services/ProgressService.js',
  './js/services/WordAudio.js',
  './js/screens/WelcomeScreen.js', './js/screens/OnboardingScreen.js',
  './js/screens/HomeScreen.js', './js/screens/SurahListScreen.js',
  './js/screens/SessionScreen.js', './js/screens/ReviewScreen.js',
  './js/screens/ProgressScreen.js', './js/screens/TajweedScreen.js',
  './js/screens/ReflectionsScreen.js', './js/screens/MenuSheet.js',
  './js/screens/ReflectionModal.js', './js/screens/WordPopup.js',
  './js/data/surahs.json', './js/data/alif-index.json',
  './js/data/daily-gems.json', './js/data/tajweed-rules.json',
  './js/data/tajweed-map.json',
  './js/data/wbw-hi.json', './js/data/wbw-ur.json',
  './fonts/IndoPakNastaleeq.woff2', './fonts/KFGQPCUthmanicScriptHAFS.woff2',
];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE)
      .then(c => c.addAll(PRECACHE))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  const url = new URL(e.request.url);
  // Network-first for Quran APIs and audio (always fresh)
  if (url.hostname.includes('quran.com') ||
      url.hostname.includes('everyayah.com') ||
      url.hostname.includes('alquran.cloud')) {
    e.respondWith(
      fetch(e.request)
        .then(res => {
          if (res.ok) {
            const cloned = res.clone();
            caches.open(CACHE).then(c => c.put(e.request, cloned));
          }
          return res;
        })
        .catch(() => caches.match(e.request))
    );
    return;
  }
  // Cache-first for app shell
  e.respondWith(
    caches.match(e.request).then(cached => cached || fetch(e.request))
  );
});
