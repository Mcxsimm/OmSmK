/* Service worker OmSmK : application utilisable hors-ligne sur chantier */
const CACHE = 'omsmk-v7';
const SHELL = [
  './', './index.html', './manifest.json', './css/app.css',
  './js/config.js', './js/icones.js', './js/referentiel.js', './js/calculs.js', './js/synchro.js', './js/demo.js',
  './js/ui.js', './js/graphiques.js', './js/app.js', './js/finances.js', './js/pointage.js', './js/planning.js', './js/coordination.js', './js/securite.js', './js/photos.js', './js/cockpit.js', './js/navigation.js', './js/donnees.js', './js/demarrage.js',
  './icons/icon-192.png', './icons/icon-512.png',
  './vendor/fonts/inter-latin-wght-normal.woff2', './vendor/fonts/inter-latin-ext-wght-normal.woff2',
  './vendor/xlsx.full.min.js', './vendor/jspdf.umd.min.js', './vendor/jspdf.plugin.autotable.min.js', './vendor/qrcode.min.js', './vendor/supabase.js'
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

// Réseau d'abord (mises à jour), cache en secours pour fonctionner hors-ligne.
// Les requêtes vers d'autres domaines (API Supabase) ne sont jamais mises en cache.
self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return;
  e.respondWith(fetch(req).then(res => {
    if (res.ok) { const copy = res.clone(); caches.open(CACHE).then(c => c.put(req, copy)); }
    return res;
  }).catch(() => caches.match(req, { ignoreSearch: true }).then(hit => hit || caches.match('./index.html'))));
});
