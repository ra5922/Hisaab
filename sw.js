// Hisaab service worker: makes the app installable and lets the app shell open offline.
// Bump VERSION whenever you want every phone to drop its old cached files.
const VERSION = 'hisaab-v2';
const SHELL = [
  'login.html', 'signup.html', 'groups.html', 'new-group.html', 'group.html',
  'add-expense.html', 'expense.html', 'activity.html', 'friends.html', 'profile.html', 'join.html',
  'manifest.json', 'css/style.css',
  'js/config.js', 'js/supabase.js', 'js/ui.js', 'js/logic.js', 'js/charts.js', 'js/export.js', 'js/pwa.js',
  'js/pages/login.js', 'js/pages/signup.js', 'js/pages/groups.js', 'js/pages/new-group.js', 'js/pages/group.js',
  'js/pages/add-expense.js', 'js/pages/expense.js', 'js/pages/activity.js', 'js/pages/friends.js',
  'js/pages/profile.js', 'js/pages/join.js',
  'img/logo.svg', 'img/icon-192.png', 'img/icon-512.png', 'img/apple-touch-icon.png'
];
const CDN = ['cdn.jsdelivr.net', 'fonts.googleapis.com', 'fonts.gstatic.com'];

self.addEventListener('install', (event) => {
  // Cache each file on its own so one missing file can't break the install.
  event.waitUntil(
    caches.open(VERSION)
      .then((cache) => Promise.all(SHELL.map((url) => cache.add(url).catch(() => {}))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // Your data (Supabase) and anything unknown always goes straight to the network.
  if (url.origin !== location.origin && !CDN.includes(url.hostname)) return;

  // Libraries and fonts: use the saved copy if we have one, otherwise fetch and save it.
  if (url.origin !== location.origin) {
    event.respondWith(
      caches.match(req).then((hit) => hit || fetch(req).then((res) => {
        if (res && (res.ok || res.type === 'opaque')) {
          const copy = res.clone();
          caches.open(VERSION).then((c) => c.put(req, copy));
        }
        return res;
      }))
    );
    return;
  }

  // Our own pages and scripts: try the network first (so updates show up), fall back to the saved copy offline.
  event.respondWith(
    fetch(req)
      .then((res) => {
        if (res && res.ok) {
          const copy = res.clone();
          caches.open(VERSION).then((c) => c.put(req, copy));
        }
        return res;
      })
      .catch(() => caches.match(req, { ignoreSearch: true }).then((hit) => hit || caches.match('login.html')))
  );
});