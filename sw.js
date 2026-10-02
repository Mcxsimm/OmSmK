/* Service worker OmSmK : application utilisable hors-ligne sur chantier */
const CACHE = 'omsmk-v1';
const SHELL = [
  './', './index.html', './manifest.json', './css/app.css',
  './js/referentiel.js', './js/demo.js', './js/app.js',
  './icons/icon-192.png', './icons/icon-512.png',
  './vendor/xlsx.full.min.js', './vendor/jspdf.umd.min.js', './vendor/jspdf.plugin.autotable.min.js', './vendor/qrcode.min.js'
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

// Réseau d'abord pour l'application (mises à jour), cache en secours ; cache d'abord pour les bibliothèques CDN
self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  const cdn = url.origin !== location.origin;
  if (cdn) {
    e.respondWith(caches.match(req).then(hit => hit || fetch(req).then(res => {
      if (res.ok || res.type === 'opaque') { const copy = res.clone(); caches.open(CACHE).then(c => c.put(req, copy)); }
      return res;
    })));
    return;
  }
  e.respondWith(fetch(req).then(res => {
    if (res.ok) { const copy = res.clone(); caches.open(CACHE).then(c => c.put(req, copy)); }
    return res;
  }).catch(() => caches.match(req, { ignoreSearch: true }).then(hit => hit || caches.match('./index.html'))));
});
