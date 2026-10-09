/* ==========================================================================
   OmSmK — agenda et rappels
   - Export iCalendar (.ics) des réunions, échéances d'actions, jalons,
     livraisons et démarrages de phases : le téléphone les ajoute à son
     agenda avec leurs rappels (fonctionne même application fermée).
   - Notifications de rappel sur l'appareil (actions échues, réunion du
     jour, surveillance de permis de feu, pointage manquant le soir).
   ========================================================================== */
// deno-lint-ignore-file no-unused-vars
'use strict';

const RAPPELS_KEY = 'omsmk_rappels';
const RAPPELS_VUS_KEY = 'omsmk_rappels_vus';
const TYPES_AGENDA = [['reunions', 'Réunions de chantier', 'messages-square'], ['actions', 'Échéances des actions ouvertes', 'list-todo'], ['jalons', 'Jalons du planning', 'flag'], ['livraisons', 'Livraisons prévues', 'truck'], ['phases', 'Démarrages de phases', 'chart-gantt']];

function evenementsAgenda(chantiers, types) {
  const auj = aujourdHui();
  const ev = [];
  chantiers.forEach(c => {
    const pre = db.chantiers.length > 1 ? `[${c.nom}] ` : '';
    if (types.includes('reunions')) {
      const r = reunionsDe(c.id)[0];
      if (r && r.prochaine && r.prochaine.date >= auj) ev.push({ uid: `reu-${r.id}-${r.prochaine.date}`, titre: `${pre}${r.type || 'Réunion de chantier'} n° ${num(r.numero) + 1}`, date: r.prochaine.date, heure: r.prochaine.heure || '09:00', duree: 90, lieu: r.lieu || c.adresse || '', description: `Chantier ${c.nom}`, rappel: 60 });
    }
    if (types.includes('actions')) actionsDe(db, c.id).filter(a => actionOuverte(a) && a.echeance && a.echeance >= auj)
      .forEach(a => ev.push({ uid: `act-${a.id}`, titre: `${pre}Action : ${a.libelle}`, date: a.echeance, description: [a.responsable ? 'Responsable : ' + a.responsable : '', `Chantier ${c.nom}`, a.note || ''].filter(Boolean).join('\n') }));
    if (types.includes('jalons')) (c.jalons || []).filter(j => !j.fait && j.date >= auj).forEach(j => ev.push({ uid: `jal-${j.id}`, titre: `${pre}Jalon : ${j.libelle}`, date: j.date, description: `Chantier ${c.nom}` }));
    if (types.includes('livraisons')) (db.commandes || []).filter(x => x.chantierId === c.id && commandeEngagee(x) && !commandeLivree(x) && x.livraisonPrevue && x.livraisonPrevue >= auj)
      .forEach(x => ev.push({ uid: `liv-${x.id}`, titre: `${pre}Livraison ${x.numero} — ${x.fournisseur || ''}`, date: x.livraisonPrevue, lieu: c.adresse || '', description: x.objet || '' }));
    if (types.includes('phases')) Object.entries(c.planning || {}).filter(([, p]) => p.debut && p.debut >= auj)
      .forEach(([k, p]) => ev.push({ uid: `ph-${c.id}-${empreinte(k)}`, titre: `${pre}Démarrage : ${k.split('||')[1]}`, date: p.debut, description: `Fin prévue le ${fmtDate(p.fin)} · chantier ${c.nom}` }));
  });
  return ev.sort((a, b) => (a.date + (a.heure || '')).localeCompare(b.date + (b.heure || '')));
}

async function partagerOuTelecharger(nom, contenu, type, titre) {
  const blob = new Blob([contenu], { type });
  const f = new File([blob], nom, { type });
  if (navigator.canShare && navigator.canShare({ files: [f] }) && matchMedia('(pointer: coarse)').matches) {
    try { await navigator.share({ files: [f], title: titre }); return; } catch (e) { if (e && e.name === 'AbortError') return; }
  }
  telecharger(nom, blob);
}

function modalAgenda() {
  const c = ch();
  const sel = lireJSON('omsmk_agenda_types', TYPES_AGENDA.map(t => t[0]));
  ouvrirModal('Ajouter à mon agenda', `
    <p class="muted" style="margin-bottom:14px">Un fichier agenda (.ics) est créé : ouvrez-le sur le téléphone pour ajouter les événements à votre agenda (Google, Outlook, iPhone). Chaque événement porte son rappel : <b>1 h avant</b> une réunion, <b>la veille à 17 h</b> pour une échéance ou une livraison.</p>
    ${db.chantiers.length > 1 ? selectHTML('agPortee', 'Chantiers', [['tous', `Tous mes chantiers (${db.chantiers.length})`], ['actuel', c ? c.nom : 'Chantier actif']], 'tous') : ''}
    <div class="label">Événements à inclure</div>
    <div class="choix-k" style="grid-template-columns:1fr">${TYPES_AGENDA.map(([v, l, ic]) => `<label class="checkbox"><input type="checkbox" class="agType" value="${v}" ${sel.includes(v) ? 'checked' : ''}><span>${icone(ic, 'sm')} ${esc(l)}</span></label>`).join('')}</div>
    <p class="xs muted">Réimporter le fichier met à jour les événements déjà ajoutés dans la plupart des agendas (identifiants stables).</p>`,
    `<button class="btn" data-act="fermerModal">Annuler</button><button class="btn primary" data-act="agExporter">${icone('calendar')}Créer le fichier agenda</button>`, { icone: 'calendar-range' });
}

/* -------------------------------- Rappels --------------------------------- */
const rappelsActifs = () => lireJSON(RAPPELS_KEY, { actif: false }).actif && 'Notification' in globalThis && Notification.permission === 'granted';

async function activerRappels() {
  if (!('Notification' in globalThis)) return toast('Les notifications ne sont pas disponibles sur ce navigateur. Utilisez l\'ajout à l\'agenda.', 'alerte');
  const p = await Notification.requestPermission();
  if (p !== 'granted') return toast('Notifications refusées : autorisez-les dans les réglages du navigateur.', 'alerte');
  localStorage.setItem(RAPPELS_KEY, JSON.stringify({ actif: true }));
  try {
    const reg = await navigator.serviceWorker.ready;
    if (reg.periodicSync) await reg.periodicSync.register('omsmk-rappels', { minInterval: 6 * 3600 * 1000 }).catch(() => {});
  } catch (_e) { /* pas de service worker */ }
  toast('Rappels activés sur cet appareil', 'succes');
  verifierRappels(true);
  render();
}
function desactiverRappels() { localStorage.setItem(RAPPELS_KEY, JSON.stringify({ actif: false })); toast('Rappels désactivés'); render(); }

async function afficherNotification(r) {
  const opts = { body: r.corps, tag: r.id, icon: 'icons/icon-192.png', badge: 'icons/icon-192.png', data: { url: `./?c=${encodeURIComponent(r.cid)}&v=${r.vue}` } };
  try {
    const reg = navigator.serviceWorker && await navigator.serviceWorker.getRegistration();
    if (reg) { await reg.showNotification(r.titre, opts); return; }
  } catch (_e) { /* repli ci-dessous */ }
  const n = new Notification(r.titre, opts);
  n.onclick = () => { focus(); ui.chantierId = r.cid; allerA(r.vue); n.close(); };
}

// Affiche les rappels dus non encore affichés aujourd'hui ; prépare ceux des 7 prochains jours pour le service worker
async function verifierRappels(test = false) {
  if (!rappelsActifs()) return;
  const vus = lireJSON(RAPPELS_VUS_KEY, {});
  const auj = aujourdHui();
  Object.keys(vus).forEach(k => { if (vus[k] < addDays(auj, -7)) delete vus[k]; });
  const dus = rappelsDus(db).filter(r => !vus[r.id]);
  for (const r of dus.slice(0, 5)) { await afficherNotification(r); vus[r.id] = auj; }
  if (dus.length > 5) { await afficherNotification({ id: 'resume|' + auj, titre: 'OmSmK', corps: `${accord(dus.length - 5, 'autre(s) rappel(s)')} : ouvrez Ma journée`, vue: 'journee', cid: ui.chantierId || '' }); dus.slice(5).forEach(r => { vus[r.id] = auj; }); }
  if (test && !dus.length) await afficherNotification({ id: 'test|' + Date.now(), titre: 'Rappels OmSmK activés', corps: 'Vous serez prévenu des actions échues, réunions, permis de feu et pointages manquants.', vue: 'journee', cid: ui.chantierId || '' });
  localStorage.setItem(RAPPELS_VUS_KEY, JSON.stringify(vus));
  planifierRappels();
}

// Rappels datés des prochains jours, lus par le service worker (synchronisation périodique, Android)
function planifierRappels() {
  const liste = [];
  const auj = aujourdHui();
  db.chantiers.forEach(c => {
    actionsDe(db, c.id).filter(a => actionOuverte(a) && a.echeance && a.echeance > auj && a.echeance <= addDays(auj, 7))
      .forEach(a => liste.push({ id: `act|${a.id}|${a.echeance}`, quand: new Date(a.echeance + 'T08:00:00').getTime(), titre: 'Action à faire aujourd\'hui', corps: `${a.libelle} (${c.nom})`, url: `./?c=${c.id}&v=actions` }));
    const r = reunionsDe(c.id)[0];
    if (r && r.prochaine && r.prochaine.date > auj && r.prochaine.date <= addDays(auj, 7)) {
      const t = new Date(`${r.prochaine.date}T${r.prochaine.heure || '09:00'}:00`).getTime() - 3600 * 1000;
      liste.push({ id: `reu|${r.id}|${r.prochaine.date}`, quand: t, titre: 'Réunion dans 1 heure', corps: `${c.nom}${r.lieu ? ' — ' + r.lieu : ''}`, url: `./?c=${c.id}&v=reunions` });
    }
  });
  try {
    const rq = indexedDB.open('omsmk_rappels', 1);
    rq.onupgradeneeded = () => rq.result.createObjectStore('kv');
    rq.onsuccess = () => { const t = rq.result.transaction('kv', 'readwrite'); t.objectStore('kv').put(liste, 'a_venir'); };
  } catch (_e) { /* IndexedDB indisponible */ }
}

function carteRappels() {
  const dispo = 'Notification' in globalThis;
  const actif = rappelsActifs();
  const refuse = dispo && Notification.permission === 'denied';
  return `<div class="card"><div class="card-head"><h3>${icone('calendar-range')}Agenda du téléphone</h3></div>
      <div class="set-row"><div class="s-txt"><b>Ajouter à mon agenda</b><span>Réunions, échéances d'actions, jalons, livraisons et démarrages de phases, avec leurs rappels. La méthode la plus fiable, notamment sur iPhone.</span></div><button class="btn primary" data-act="agenda">${icone('calendar')}Ajouter</button></div></div>
    <div class="card" style="margin-top:16px"><div class="card-head"><h3>${icone('info')}Rappels sur cet appareil</h3><span class="badge ${actif ? 'pos' : ''}">${actif ? 'Activés' : 'Désactivés'}</span></div>
      <div class="set-row"><div class="s-txt"><b>Notifications</b><span>Action échue ou à faire aujourd'hui, réunion du jour (et de demain, après 16 h), surveillance de permis de feu à confirmer, pointage du jour manquant après 17 h.</span></div>
        ${!dispo ? '<span class="small muted">Non disponible sur ce navigateur</span>' : actif ? `<button class="btn" data-act="rappelsOff">${icone('x')}Désactiver</button>` : `<button class="btn primary" data-act="rappelsOn" ${refuse ? 'disabled' : ''}>${icone('check')}Activer</button>`}</div>
      ${refuse ? `<div class="set-row"><div class="s-txt"><span>Les notifications sont bloquées pour ce site : autorisez-les dans les réglages du navigateur.</span></div></div>` : ''}
      <div class="set-row"><div class="s-txt"><span>Les rappels sont vérifiés à l'ouverture de l'application et toutes les 10 minutes tant qu'elle est ouverte. Sur Android, installée sur l'écran d'accueil, l'application peut aussi prévenir en arrière-plan. Sur iPhone (iOS 16.4 et plus), installez-la sur l'écran d'accueil pour recevoir les notifications.</span></div></div></div>`;
}

Object.assign(ACT, {
  agenda: () => modalAgenda(),
  agExporter: () => {
    const types = $$('.agType').filter(x => x.checked).map(x => x.value);
    if (!types.length) return toast('Choisissez au moins un type d\'événement.', 'alerte');
    localStorage.setItem('omsmk_agenda_types', JSON.stringify(types));
    const chs = val('agPortee') === 'actuel' && ch() ? [ch()] : db.chantiers;
    const ev = evenementsAgenda(chs, types);
    if (!ev.length) return toast('Aucun événement à venir pour ces critères.', 'info');
    fermerModal();
    partagerOuTelecharger(`OmSmK_agenda_${aujourdHui()}.ics`, genererICS(ev, chs.length === 1 ? `OmSmK — ${chs[0].nom}` : 'OmSmK — chantiers'), 'text/calendar', 'Agenda OmSmK');
    toast(`${accord(ev.length, 'événement(s)')} prêts à ajouter à votre agenda`, 'succes');
  },
  agReunion: el => {
    const c = ch();
    const r = (db.reunions || []).find(x => x.id === el.dataset.id);
    if (!r || !r.prochaine || !r.prochaine.date) return toast('Indiquez la date de la prochaine réunion.', 'alerte');
    const ev = [{ uid: `reu-${r.id}-${r.prochaine.date}`, titre: `${r.type || 'Réunion de chantier'} n° ${num(r.numero) + 1} — ${c.nom}`, date: r.prochaine.date, heure: r.prochaine.heure || '09:00', duree: 90, lieu: r.lieu || c.adresse || '', description: `Chantier ${c.nom}`, rappel: 60 }];
    partagerOuTelecharger(`Reunion_${r.prochaine.date}.ics`, genererICS(ev, `OmSmK — ${c.nom}`), 'text/calendar', 'Réunion de chantier');
  },
  rappelsOn: () => activerRappels(),
  rappelsOff: () => desactiverRappels()
});

// Vérifications périodiques tant que l'application est ouverte
setTimeout(() => verifierRappels(), 4000);
setInterval(() => verifierRappels(), 10 * 60 * 1000);
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') verifierRappels(); });
if (navigator.serviceWorker) navigator.serviceWorker.addEventListener('message', e => {
  const d = e.data || {};
  if (d.type === 'naviguer' && d.v) { if (d.c && db.chantiers.some(x => x.id === d.c)) ui.chantierId = d.c; allerA(d.v); }
});
