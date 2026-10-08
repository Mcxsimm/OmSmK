/* Service worker OmSmK : application utilisable hors-ligne sur chantier */
const CACHE = 'omsmk-v11';
const SHELL = [
  './', './index.html', './manifest.json', './css/app.css',
  './js/config.js', './js/icones.js', './js/referentiel.js', './js/calculs.js', './js/synchro.js', './js/drive.js', './js/demo.js',
  './js/ui.js', './js/graphiques.js', './js/app.js', './js/finances.js', './js/pointage.js', './js/planning.js', './js/coordination.js', './js/securite.js', './js/photos.js', './js/cockpit.js', './js/signature.js', './js/pv.js', './js/rapports.js', './js/agenda.js', './js/charge.js', './js/devis.js', './js/raf.js', './js/preparation.js', './js/bilan.js', './js/navigation.js', './js/donnees.js', './js/demarrage.js',
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

// Clic sur une notification de rappel : ouvrir (ou ramener) l'application sur la bonne page
self.addEventListener('notificationclick', e => {
  e.notification.close();
  const url = new URL((e.notification.data && e.notification.data.url) || './', self.registration.scope);
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(liste => {
    const ouvert = liste.find(c => c.url.startsWith(self.registration.scope));
    if (ouvert) { ouvert.postMessage({ type: 'naviguer', v: url.searchParams.get('v'), c: url.searchParams.get('c') }); return ouvert.focus(); }
    return self.clients.openWindow(url.href);
  }));
});

// Rappels préparés par l'application (synchronisation périodique, Android) : afficher ceux qui sont échus
function lireRappels() {
  return new Promise(ok => {
    const rq = indexedDB.open('omsmk_rappels', 1);
    rq.onupgradeneeded = () => rq.result.createObjectStore('kv');
    rq.onerror = () => ok(null);
    rq.onsuccess = () => {
      const d = rq.result, t = d.transaction('kv', 'readonly'), s = t.objectStore('kv');
      const a = s.get('a_venir'), v = s.get('vus');
      t.oncomplete = () => ok({ d, liste: a.result || [], vus: v.result || {} });
    };
  });
}
self.addEventListener('periodicsync', e => {
  if (e.tag !== 'omsmk-rappels') return;
  e.waitUntil(lireRappels().then(async r => {
    if (!r) return;
    const maintenant = Date.now();
    for (const x of r.liste.filter(x => x.quand <= maintenant && maintenant - x.quand < 12 * 3600 * 1000 && !r.vus[x.id])) {
      await self.registration.showNotification(x.titre, { body: x.corps, tag: x.id, icon: 'icons/icon-192.png', data: { url: x.url } });
      r.vus[x.id] = maintenant;
    }
    r.d.transaction('kv', 'readwrite').objectStore('kv').put(r.vus, 'vus');
  }));
});
