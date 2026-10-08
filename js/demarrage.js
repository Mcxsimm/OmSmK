/* ==========================================================================
   OmSmK — branchement des événements, synchronisation et démarrage
   ========================================================================== */
'use strict';

document.addEventListener('click', e => {
  if (e.target.classList.contains('modal-back') && !modalVerrou) { if (_resoudreConfirmation) return _repondreConfirmation(false); return fermerModal(); }
  if ($('#popRoot').innerHTML && !e.target.closest('.popover') && !e.target.closest('#chantierSwitch') && !e.target.closest('#userBtn')) fermerPopover();
  // Un bouton d'action placé dans une tuile cliquable l'emporte sur le lien de la tuile
  const nav = e.target.closest('[data-nav]');
  const el = e.target.closest('[data-act]');
  if (el && ACT[el.dataset.act] && (!nav || nav.contains(el))) { e.preventDefault(); return ACT[el.dataset.act](el, e); }
  if (nav && !nav.disabled) { e.preventDefault(); fermerModal(); fermerPopover(); return allerA(nav.dataset.nav); }
});
document.addEventListener('change', e => {
  const el = e.target.closest('[data-change]');
  if (el && CHG[el.dataset.change]) CHG[el.dataset.change](el, e);
});
document.addEventListener('input', e => {
  const el = e.target.closest('[data-input]');
  if (el && INP[el.dataset.input]) INP[el.dataset.input](el, e);
});
document.addEventListener('keydown', e => {
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); return ouvrirRecherche(); }
  if (e.key === 'Enter' && e.target.id === 'rcQ') { e.preventDefault(); const x = _resultatsRecherche[0]; if (x) { fermerModal(); x.run(); } return; }
  if ((e.key === 'Enter' || e.key === ' ') && e.target.classList && e.target.classList.contains('tuile')) { e.preventDefault(); return e.target.dataset.act ? ACT[e.target.dataset.act](e.target, e) : allerA(e.target.dataset.nav); }
  if (e.key !== 'Escape') return;
  if ($('#popRoot').innerHTML) return fermerPopover();
  if (modalOuverte() && !modalVerrou) { if (_resoudreConfirmation) _repondreConfirmation(false); else fermerModal(); }
});

// Sections « Détail » repliables : mémoriser l'état et dessiner les graphiques à l'ouverture
document.addEventListener('toggle', e => {
  const d = e.target;
  if (!d.matches || !d.matches('details.plus')) return;
  ui.plusOuvert = Object.assign({}, ui.plusOuvert, { [d.dataset.cle]: d.open });
  saveUI();
  if (d.open) dessinerGraphiques();
}, true);

// Info-bulles des graphiques
document.addEventListener('pointermove', e => {
  const c = e.target.closest && e.target.closest('[data-tip]');
  if (c) afficherInfoBulle(c, e);
});
document.addEventListener('pointerout', e => {
  const c = e.target.closest && e.target.closest('[data-tip]');
  if (c) masquerInfoBulle(c);
});
let _redim = null;
addEventListener('resize', () => { clearTimeout(_redim); _redim = setTimeout(dessinerGraphiques, 150); });

$('#chantierSwitch').addEventListener('click', e => {
  if ($('#popRoot').innerHTML) return fermerPopover();
  popChantiers(e.currentTarget);
});
$('#searchBtn').addEventListener('click', () => ouvrirRecherche());
$('#userBtn').addEventListener('click', e => { if ($('#popRoot').innerHTML) return fermerPopover(); e.stopPropagation(); menuUtilisateur(e.currentTarget); });
$('#syncPill').addEventListener('click', () => ACT.syncPill());
$('#themeBtn').addEventListener('click', () => {
  const sombre = document.documentElement.dataset.theme === 'dark' || (!document.documentElement.dataset.theme && matchMedia('(prefers-color-scheme: dark)').matches);
  ACT.theme({ dataset: { t: sombre ? 'light' : 'dark' } });
});
addEventListener('online', () => { renderSyncPill(); toast('Connexion rétablie', 'succes'); });
addEventListener('offline', () => { renderSyncPill(); toast('Hors-ligne : vos saisies restent enregistrées sur l\'appareil', 'alerte'); });

if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  navigator.serviceWorker.register('sw.js').catch(() => { /* pas bloquant */ });
}

/* --------------------------- Branchement synchro ------------------------- */
let renduEnAttente = false;
const enSaisie = () => { const a = document.activeElement; return !!(a && a.matches && a.matches('#view input, #view textarea, #view select')); };
// Après réception de données : rafraîchir sans perturber une saisie en cours
function rafraichirApresSynchro() {
  if (enSaisie()) { renduEnAttente = true; return; }
  render();
}
document.addEventListener('focusout', () => setTimeout(() => {
  if (renduEnAttente && !enSaisie()) { renduEnAttente = false; render(); }
}, 50));

Synchro.base = () => db;
Synchro.enregistrerBase = () => enregistrerLocal();
Synchro.onChange = n => { rafraichirApresSynchro(); toast(`${accord(n, 'mise(s) à jour reçue(s)')} de l'équipe`); };
Synchro.onStatut = () => {
  renderSyncPill();
  if (ui.view === 'parametres' && !modalOuverte()) rafraichirApresSynchro();
  if (Synchro.etat === 'ok') envoyerPhotos();   // fichiers photo des chantiers partagés
};
// Photos reçues d'un autre appareil : les vignettes se chargent au rendu suivant
addEventListener('online', () => envoyerPhotos());
// Google Drive : la base fusionnée remplace celle de l'appareil
Drive.base = () => db;
Drive.remplacerBase = b => { db = Object.assign(dbVide(), b); if (!ch()) ui.chantierId = null; enregistrerLocal(); };
Drive.onChange = (n, conflits) => { rafraichirApresSynchro(); toast(`${accord(n, 'mise(s) à jour reprise(s)')} de Google Drive${conflits ? ` · ${accord(conflits, 'conflit(s)')} : version de cet appareil conservée` : ''}`); };
Drive.onStatut = () => { renderSyncPill(); if (ui.view === 'parametres' && ui.paramTab === 'drive' && !modalOuverte()) rafraichirApresSynchro(); };

/* Base de l'appareil : localStorage est lu tout de suite (démarrage instantané) ;
   IndexedDB fait foi s'il est plus récent (base trop grosse pour localStorage). */
async function chargerStockLocal() {
  try {
    const r = await StockLocal.lire('db');
    const leLocal = num(localStorage.getItem(STORE_KEY + '_le'));
    if (r && r.json && (r.le > leLocal || !localStorage.getItem(STORE_KEY))) {
      const d = JSON.parse(r.json);
      if (d && Array.isArray(d.chantiers)) { db = Object.assign(dbVide(), d); render(); }
    } else if (!r && localStorage.getItem(STORE_KEY)) enregistrerLocal();   // première ouverture : recopie dans IndexedDB
  } catch (e) { console.error(e); }
}
document.addEventListener('DOMContentLoaded', () => {
  chargerStockLocal().then(() => { Drive.init(); renderSyncPill(); });
  Synchro.init().then(() => renderShell()).catch(e => console.error(e));
});

/* -------------------------------- Démarrage ------------------------------ */
(function demarrer() {
  hydraterIcones();
  render();
  const p = new URLSearchParams(location.search);
  // Ouverture depuis une notification de rappel : ?c=<chantier>&v=<page>
  if (p.get('v') && TITRES[p.get('v')]) {
    if (p.get('c') && db.chantiers.some(x => x.id === p.get('c'))) ui.chantierId = p.get('c');
    allerA(p.get('v'));
    history.replaceState({}, document.title, location.pathname);
    if (!user) modalIdentite(true);
    return;
  }
  const cible = p.get('c') || p.get('chantier'), zone = p.get('z') || p.get('zone') || p.get('support');
  if (cible || zone) {
    traiterCible(`${location.origin}${location.pathname}?${p.toString()}`);
    history.replaceState({}, document.title, location.pathname);
  }
  if (!user) modalIdentite(true);
  else proposerChoixPages();
})();
