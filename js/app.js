/* ==========================================================================
   OmSmK — état, vues et actions
   ========================================================================== */
// deno-lint-ignore-file no-unused-vars
'use strict';

const STORE_KEY = 'omsmk_db_v1';
const USER_KEY = 'omsmk_user';
const UI_KEY = 'omsmk_ui';
const REF = REFERENTIEL;

/* ================================ État =================================== */
function dbVide() { return { version: 1, chantiers: [], ops: [], suivi: [], taches: [], journal: [], reserves: [], checklists: {}, postes: [], situations: [], commandes: [], compagnons: [], pointages: [], contacts: [], reunions: [], actions: [], securite: [], photos: [], pvs: [] }; }
function chargerDB() {
  const d = lireJSON(STORE_KEY, null);
  return d && Array.isArray(d.chantiers) ? Object.assign(dbVide(), d) : dbVide();
}
let db = chargerDB();
let user = lireJSON(USER_KEY, null);
const ui = Object.assign({
  view: 'journee', chantierId: null, zone: null, terrainMode: 'liste', filtreTache: '',
  qualiteTab: 'reserves', reserveFiltre: 'ouvertes', semaine: null, equipe: 2, paramTab: 'equipe', ptMode: 'jour'
}, lireJSON(UI_KEY, {}));
if (!ui.semaine) ui.semaine = lundi(aujourdHui());
if (ui.view === 'chantiers') ui.view = 'portefeuille';

function save() { enregistrerLocal(); Synchro.planifier(); }
function enregistrerLocal() {
  try { localStorage.setItem(STORE_KEY, JSON.stringify(db)); }
  catch (_e) { toast('Stockage local plein : exportez une sauvegarde puis faites du ménage.', 'erreur'); }
}
function saveUI() { try { localStorage.setItem(UI_KEY, JSON.stringify(ui)); } catch (_e) { /* ignoré */ } }

const ch = () => db.chantiers.find(c => c.id === ui.chantierId) || null;
const deCh = (arr, cid = ui.chantierId) => arr.filter(x => x.chantierId === cid);
const nomUser = () => user ? `${user.prenom || ''} ${user.nom || ''}`.trim() : '';
function zonesDe(cid) { return [...new Set(deCh(db.taches, cid).map(t => t.zone))].filter(Boolean); }
function nbChecklist(cid, cle) {
  const l = cle === 'cdt' ? REF.checklistCDT : REF.qualiteFinChantier;
  const total = l.reduce((t, s) => t + s.items.length, 0);
  const st = (db.checklists[cid] || {})[cle] || {};
  return { faits: Object.keys(st).length, total };
}
function statutChantier(c) {
  const auj = aujourdHui();
  if (!c.dateDebut) return { txt: 'En préparation', cls: '' };
  if (auj < c.dateDebut) return { txt: 'À venir', cls: 'info' };
  if (c.dateFin && auj > c.dateFin) return { txt: 'Délai dépassé', cls: 'warn' };
  return { txt: 'En cours', cls: 'pos' };
}
function avancementTheorique(c) {
  if (!c.dateDebut || !c.dateFin) return null;
  const t0 = new Date(c.dateDebut).getTime(), t1 = new Date(c.dateFin).getTime() + 86400000;
  return Math.max(0, Math.min(1, (Date.now() - t0) / (t1 - t0)));
}
const numeroReserve = (r) => {
  const toutes = deCh(db.reserves, r.chantierId).slice().sort((a, b) => (a.creeLe || '').localeCompare(b.creeLe || '') || a.id.localeCompare(b.id));
  return 'R-' + String(toutes.indexOf(r) + 1).padStart(3, '0');
};

/* ============================ Navigation ================================= */
/* Navigation par espaces : chaque espace ouvre une page d'accueil (tuiles) et
   propose ses pages en onglets ; pas de longue liste de menus. */
const ESPACES = [
  { id: 'accueil', t: 'Accueil', ic: 'house', pages: [['journee', 'Ma journée', 'house'], ['portefeuille', 'Portefeuille', 'briefcase']] },
  { id: 'chantier', t: 'Chantier', ic: 'building-2', pages: [['hubChantier', 'Vue d\'ensemble', 'layout-dashboard'], ['tableau', 'Indicateurs', 'gauge'], ['planning', 'Planning', 'chart-gantt'], ['suivi', 'Suivi hebdo', 'trending-up'], ['bte', 'Budget BTE', 'calculator']] },
  { id: 'terrain', t: 'Terrain', ic: 'hard-hat', pages: [['hubTerrain', 'Vue d\'ensemble', 'layout-dashboard'], ['pointage', 'Pointage', 'clock'], ['terrain', 'Saisie terrain', 'clipboard-check'], ['journal', 'Journal & photos', 'camera'], ['qualite', 'Qualité', 'shield-check'], ['securite', 'Sécurité', 'shield-alert']] },
  { id: 'coordination', t: 'Coordination', ic: 'messages-square', pages: [['hubCoordination', 'Vue d\'ensemble', 'layout-dashboard'], ['actions', 'Actions', 'list-todo'], ['reunions', 'Réunions & CR', 'messages-square'], ['annuaire', 'Annuaire', 'contact']] },
  { id: 'gestion', t: 'Gestion', ic: 'wallet', pages: [['hubGestion', 'Vue d\'ensemble', 'layout-dashboard'], ['finances', 'Synthèse financière', 'wallet'], ['situations', 'Situations', 'receipt'], ['commandes', 'Commandes', 'shopping-cart']] }
];
const TITRES = Object.assign(Object.fromEntries(ESPACES.flatMap(e => e.pages.map(([v, t]) => [v, t]))), { parametres: 'Paramètres' });
const espaceDe = v => ESPACES.find(e => e.pages.some(p => p[0] === v)) || null;
const VUES_SANS_CHANTIER = ['journee', 'portefeuille', 'parametres'];

// Pastilles de comptage (retards, alertes) par page
function compteurs() {
  const c = ch(), auj = aujourdHui();
  const n = {};
  if (c) {
    n.qualite = deCh(db.reserves).filter(r => r.statut !== 'levée').length;
    n.actions = actionsDe(db, c.id).filter(a => actionEnRetard(a, auj)).length;
    n.securite = permisAsurveiller(c.id).length;
    n.planning = calcPlanning(db, c.id, auj).rows.filter(r => r.statut === 'retard').length;
  }
  n.journee = actionsDe(db).filter(a => actionEnRetard(a, auj) && db.chantiers.some(x => x.id === a.chantierId)).length;
  n.portefeuille = 0;
  return n;
}

function renderShell() {
  const c = ch();
  $('#chantierNom').textContent = c ? c.nom : 'Aucun chantier';
  const esp = espaceDe(ui.view);
  const n = compteurs();
  const totalEsp = e => e.pages.reduce((t, [v]) => t + (n[v] || 0), 0);
  $('#espaces').innerHTML = ESPACES.map(e => `<button class="esp ${esp && esp.id === e.id ? 'on' : ''}" data-act="espace" data-e="${e.id}">${esc(e.t)}${totalEsp(e) ? `<span class="pastille">${totalEsp(e)}</span>` : ''}</button>`).join('');
  const sub = $('#subnav');
  if (esp && esp.pages.length > 1 && !(esp.id !== 'accueil' && !c)) {
    sub.innerHTML = `<div class="subnav-in">${esp.pages.map(([v, t, ic]) => `<button class="${ui.view === v ? 'on' : ''}" data-nav="${v}">${icone(ic, 'sm')}<span>${esc(t)}</span>${n[v] ? `<span class="pastille">${n[v]}</span>` : ''}</button>`).join('')}</div>`;
    sub.classList.remove('hidden');
  } else { sub.innerHTML = ''; sub.classList.add('hidden'); }
  const mob = [['accueil', 'house', 'Accueil'], ['chantier', 'building-2', 'Chantier'], null, ['terrain', 'hard-hat', 'Terrain'], ['menu', 'menu', 'Menu']];
  $('#bottomNav').innerHTML = mob.map(m => m === null
    ? `<button class="bn-creer" data-act="creer" aria-label="Créer">${icone('plus')}</button>`
    : `<button class="${(esp && esp.id === m[0]) ? 'active' : ''}" data-act="${m[0] === 'menu' ? 'menuMobile' : 'espace'}" data-e="${m[0]}">${icone(m[1])}<span>${m[2]}</span>${m[0] !== 'menu' && ESPACES.find(e => e.id === m[0]) && totalEsp(ESPACES.find(e => e.id === m[0])) ? '<i class="bn-dot"></i>' : ''}</button>`).join('');
  $('#userBtn').innerHTML = `<span class="avatar">${initiales(nomUser())}</span>`;
  renderSyncPill();
  const sombre = document.documentElement.dataset.theme === 'dark' || (!document.documentElement.dataset.theme && matchMedia('(prefers-color-scheme: dark)').matches);
  $('#themeBtn').innerHTML = icone(sombre ? 'sun' : 'moon');
  document.title = `${TITRES[ui.view] || 'OmSmK'}${c && !VUES_SANS_CHANTIER.includes(ui.view) ? ' · ' + c.nom : ''} — OmSmK`;
}

function renderSyncPill() {
  const p = $('#syncPill');
  let etat = 'local', lbl = 'Local', titre = 'Données sur cet appareil uniquement — cliquez pour activer la synchronisation';
  if (Synchro.connecte()) {
    if (!navigator.onLine) { etat = 'horsligne'; lbl = 'Hors-ligne'; titre = 'Hors-ligne : les saisies partiront au retour du réseau'; }
    else if (Synchro.etat === 'encours') { etat = 'encours'; lbl = 'Synchronisation…'; titre = lbl; }
    else if (Synchro.etat === 'erreur') { etat = 'erreur'; lbl = 'Erreur'; titre = 'Erreur de synchronisation : ' + Synchro.erreur; }
    else { etat = 'ok'; lbl = 'Synchronisé'; titre = 'Synchronisé' + (Synchro.derniere ? ' à ' + Synchro.derniere.toLocaleTimeString('fr-FR') : ''); }
  } else if (!navigator.onLine) { etat = 'horsligne'; lbl = 'Hors-ligne'; }
  p.className = 'sync-pill ' + etat;
  p.title = titre;
  p.innerHTML = `<span class="dot"></span><span class="lbl">${lbl}</span>`;
}

const VUES = { tableau: vTableau, terrain: vTerrain, suivi: vSuivi, bte: vBTE, journal: vJournal, qualite: vQualite, portefeuille: vPortefeuille, parametres: vParametres, finances: c => vFinances(c), situations: c => vSituations(c), commandes: c => vCommandes(c), pointage: c => vPointage(c),
  journee: () => vJournee(), hubChantier: c => vHubChantier(c), hubTerrain: c => vHubTerrain(c), hubCoordination: c => vHubCoordination(c), hubGestion: c => vHubGestion(c), planning: c => vPlanning(c), securite: c => vSecurite(c), actions: c => vActions(c), reunions: c => vReunions(c), annuaire: c => vAnnuaire(c) };

function render() {
  if (!ch() && db.chantiers.length) ui.chantierId = db.chantiers[0].id;
  if (!VUES[ui.view]) ui.view = 'tableau';
  const c = ch();
  renderShell();
  _graphiques.clear();
  $('#view').innerHTML = (!VUES_SANS_CHANTIER.includes(ui.view) && !c) ? vAccueil() : VUES[ui.view](c);
  if (ui.view === 'terrain' && c && ui.terrainMode === 'liste') renderListeTaches();
  dessinerGraphiques();
  hydraterPhotos($('#view'));
  saveUI();
}

function allerA(vue) {
  ui.view = vue;
  fermerPopover();
  render();
  scrollTo(0, 0);
}

/* =============================== Accueil ================================= */
function vAccueil() {
  return `<div class="welcome"><div class="card welcome-card">
    <div class="eyebrow" style="font-size:12px;font-weight:600;color:var(--accent);text-transform:uppercase;letter-spacing:.08em">Bienvenue${user && user.prenom ? ', ' + esc(user.prenom) : ''}</div>
    <h1>Pilotez vos chantiers d'étanchéité et de façade</h1>
    <p class="lead">Budget technique d'exécution et cadences cibles, suivi hebdomadaire des écarts en heures et en euros,
      saisie terrain par zone, journal, réserves et check-list du conducteur de travaux — en ligne comme hors-ligne.</p>
    <div class="welcome-actions">
      <button class="w-action" data-act="chantierNew"><span class="w-ico">${icone('plus')}</span><b>Nouveau chantier</b><span>Créer la fiche et construire le BTE</span></button>
      <button class="w-action" data-act="importFichier"><span class="w-ico">${icone('upload')}</span><b>Importer un BTE</b><span>Fichier Excel standard SMAC ou liste terrain CSV</span></button>
      <button class="w-action" data-act="demo"><span class="w-ico">${icone('sparkles')}</span><b>Découvrir avec la démo</b><span>Cas pratique CIGV, données réalistes</span></button>
    </div>
    <div class="features">
      <div>${icone('circle-check')}<span>Écarts d'heures et impact € calculés comme le BTE standard</span></div>
      <div>${icone('circle-check')}<span>Cadences standard étanchéité et façade intégrées</span></div>
      <div>${icone('circle-check')}<span>QR codes par zone pour la saisie sur le terrain</span></div>
      <div>${icone('circle-check')}<span>Synchronisation d'équipe et fonctionnement hors-ligne</span></div>
    </div>
  </div></div>`;
}

/* =========================== Tableau de bord ============================= */
function alertes(c, s) {
  const out = [];
  const auj = aujourdHui();
  s.rows.forEach(r => {
    const nom = `${esc(r.phase)} <span class="muted">· ${esc(r.ouvrage)}</span>`;
    if (r.pct >= 1 && r.ecartH < -0.05) out.push({ sev: 'critical', ic: 'circle-alert', t: nom, d: `Phase terminée avec un dépassement de ${fmt(-r.ecartH)} h (${fmtE(r.impact)}).` });
    else if (r.ecartProj < -Math.max(1, r.budget * 0.05)) out.push({ sev: 'serious', ic: 'trending-up', t: nom, d: `Dérive projetée de ${fmt(-r.ecartProj)} h (${fmtE(-r.impactProj)}) à ${pc(r.pct)} d'avancement.` });
    else if (r.heures > r.budget && r.budget > 0) out.push({ sev: 'serious', ic: 'clock', t: nom, d: `Heures pointées (${fmt(r.heures)} h) supérieures au budget (${fmt(r.budget)} h).` });
  });
  const enRetard = deCh(db.reserves).filter(r => r.statut !== 'levée' && r.echeance && r.echeance < auj);
  if (enRetard.length) out.push({ sev: 'critical', ic: 'shield-check', t: `${enRetard.length} réserve(s) en retard`, d: `Échéance de levée dépassée — ${enRetard.slice(0, 3).map(numeroReserve).join(', ')}${enRetard.length > 3 ? '…' : ''}.`, go: 'qualite' });
  const theo = avancementTheorique(c);
  if (theo !== null && s.rows.length && s.tot.pct + 0.1 < theo) out.push({ sev: 'warning', ic: 'calendar', t: 'Avancement en retard sur le planning', d: `${pc(s.tot.pct)} réalisé pour ${pc(theo)} de délai écoulé.` });
  const cmdRetard = (db.commandes || []).filter(x => x.chantierId === c.id && commandeEngagee(x) && !commandeLivree(x) && x.livraisonPrevue && x.livraisonPrevue < auj);
  if (cmdRetard.length) out.push({ sev: 'serious', ic: 'truck', t: `${cmdRetard.length} livraison(s) en retard`, d: cmdRetard.slice(0, 3).map(x => `${esc(x.numero)} — ${esc(x.fournisseur)}`).join(' · '), go: 'commandes' });
  const fi = calcFinances(db, c.id);
  if (fi.ca && fi.avFinancier + 0.1 < fi.avPhysique) out.push({ sev: 'warning', ic: 'receipt', t: 'Retard de facturation', d: `${pc(fi.avPhysique - fi.avFinancier)} d'avancement non facturé (≈ ${fmtE((fi.avPhysique - fi.avFinancier) * fi.ca)}).`, go: 'situations' });
  if (fi.ca && c.dateDebut && c.dateDebut <= auj && !situationsDe(db, c.id).some(x => x.mois === auj.slice(0, 7)) && fi.avFinancier < 1) out.push({ sev: 'warning', ic: 'file-plus', t: 'Situation du mois à établir', d: `Aucune situation pour ${new Date(auj + 'T00:00:00').toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' })}.`, go: 'situations' });
  const equipePt = (db.compagnons || []).filter(k => k.chantierId === c.id && k.actif !== false);
  if (equipePt.length && c.dateDebut && c.dateDebut <= auj && (!c.dateFin || c.dateFin >= auj)) {
    let veille = addDays(auj, -1);
    while ([0, 6].includes(new Date(veille + 'T00:00:00').getDay())) veille = addDays(veille, -1);
    const manquants = veille >= c.dateDebut ? equipePt.filter(k => !(db.pointages || []).some(p => p.chantierId === c.id && p.date === veille && p.compagnonId === k.id)) : [];
    if (manquants.length) out.push({ sev: 'warning', ic: 'clock', t: `Pointage du ${fmtDate(veille)} incomplet`, d: `${manquants.length} compagnon(s) non pointé(s) : ${manquants.slice(0, 3).map(k => esc(`${k.prenom || ''} ${k.nom || ''}`.trim())).join(', ')}${manquants.length > 3 ? '…' : ''}.`, go: 'pointage', date: veille });
  }
  const pl = calcPlanning(db, c.id, auj);
  if (pl.retard) out.push({ sev: 'serious', ic: 'chart-gantt', t: `Délai : ${pl.retard} jour(s) de retard projeté`, d: `Fin projetée le ${fmtDate(pl.finProjetee)} pour une fin contractuelle le ${fmtDate(pl.finContrat)}.`, go: 'planning' });
  const phRetard = pl.rows.filter(r => r.statut === 'retard');
  if (phRetard.length && !pl.retard) out.push({ sev: 'warning', ic: 'chart-gantt', t: `${phRetard.length} phase(s) en retard sur le planning`, d: phRetard.slice(0, 3).map(r => `${esc(r.phase)} (${pc(r.pct)} pour ${pc(r.attendu)} attendu)`).join(' · '), go: 'planning' });
  const actRetard = actionsDe(db, c.id).filter(a => actionEnRetard(a, auj) && (a.origine || {}).type !== 'securite');
  if (actRetard.length) out.push({ sev: 'warning', ic: 'list-todo', t: `${actRetard.length} action(s) en retard`, d: actRetard.slice(0, 3).map(a => esc(a.libelle) + (a.responsable ? ` (${esc(a.responsable)})` : '')).join(' · '), go: 'actions' });
  const semCourante = lundi(auj);
  if (s.rows.length && c.dateDebut && c.dateDebut <= auj && (!c.dateFin || c.dateFin >= semCourante)
      && !deCh(db.suivi).some(x => x.semaine === semCourante && x.pct !== null && x.pct !== undefined)) out.push({ sev: 'warning', ic: 'notebook-pen', t: 'Suivi de la semaine à renseigner', d: `Semaine ${semISO(semCourante)} : % d'avancement des phases non saisi.`, go: 'suivi' });
  return out;
}

function activiteRecente(c) {
  const ev = [];
  deCh(db.taches).filter(t => estFait(t.fait) && t.faitLe).forEach(t => ev.push({ d: t.faitLe, ic: 'check', c: 'pos', h: `<b>${esc(t.tache)}</b> — ${esc(t.zone)}`, s: t.faitPar }));
  deCh(db.journal).forEach(j => ev.push({ d: j.date, ic: j.intemperie ? 'cloud-rain' : 'notebook-pen', c: j.intemperie ? 'warn' : 'info', h: j.intemperie ? `<b>Intempérie</b>${j.cause ? ' — ' + esc(j.cause) : ''}` : `<b>Journal</b> — ${esc((j.texte || '').slice(0, 70))}${(j.texte || '').length > 70 ? '…' : ''}`, s: j.auteur }));
  deCh(db.reserves).forEach(r => {
    ev.push({ d: r.creeLe, ic: 'circle-alert', c: 'warn', h: `<b>Réserve ${numeroReserve(r)}</b> — ${esc((r.description || '').slice(0, 60))}`, s: r.creePar });
    if (r.statut === 'levée' && r.leveeLe) ev.push({ d: r.leveeLe, ic: 'shield-check', c: 'pos', h: `<b>Réserve ${numeroReserve(r)} levée</b>`, s: r.leveePar });
  });
  return ev.filter(e => e.d).sort((a, b) => b.d.localeCompare(a.d)).slice(0, 7);
}

function vTableau(c) {
  const s = calcSuivi(db, c.id);
  const t = statsTerrain(db, c.id);
  const res = deCh(db.reserves);
  const ouvertes = res.filter(r => r.statut !== 'levée').length;
  const jIntemp = deCh(db.journal).filter(j => j.intemperie).length;
  const indice = s.tot.heures > 0 ? s.tot.gagnees / s.tot.heures : null;
  const theo = avancementTheorique(c);
  const st = statutChantier(c);
  const al = alertes(c, s).concat(etatSecurite(c).alertes).sort((a, b) => ({ critical: 0, serious: 1, warning: 2 }[a.sev] ?? 9) - ({ critical: 0, serious: 1, warning: 2 }[b.sev] ?? 9));
  const act = activiteRecente(c);
  const pts = serieAvancement(db, c.id);
  const cdt = nbChecklist(c.id, 'cdt');

  const entete = enTetePage({
    eyebrow: c.client || 'Chantier',
    titre: c.nom,
    sous: [`<span class="badge ${st.cls} dot">${st.txt}</span>`, sousInfo('map-pin', c.adresse), c.dateDebut ? sousInfo('calendar', `${fmtDate(c.dateDebut)} → ${fmtDate(c.dateFin) || '…'}`) : '', sousInfo('hard-hat', c.conducteur), c.equipeId ? `<span>${icone('cloud', 'sm')}Partagé</span>` : ''],
    actions: `<button class="btn" data-act="exportExcel">${icone('file-spreadsheet')}Excel</button><button class="btn primary" data-act="rapportPDF">${icone('file-text')}Rapport PDF</button>`
  });

  if (!s.rows.length) {
    return entete + `<div class="card">${vide('calculator', 'Le budget technique n\'est pas encore construit',
      'Le tableau de bord s\'appuie sur les opérations du BTE (métrés, cadences, heures). Construisez-le ou importez votre fichier Excel SMAC.',
      `<button class="btn primary" data-nav="bte">${icone('calculator')}Construire le BTE</button><button class="btn" data-act="importFichier">${icone('upload')}Importer un BTE</button>`)}</div>`;
  }

  const kpis = `<div class="kpis">
    <div class="card kpi"><div class="kpi-top"><span class="kpi-lbl">Avancement</span><span class="kpi-ico">${icone('gauge')}</span></div>
      <div class="kpi-val">${Math.round(s.tot.pct * 100)}<small>%</small></div>
      <div style="margin-top:10px">${barre(s.tot.pct, 'lg')}</div>
      <div class="kpi-sub">${theo !== null ? `${delta((s.tot.pct - theo) * 100, ' pts', 0)} vs prévu (${pc(theo)})` : `${fmt(s.tot.gagnees)} h produites`}</div></div>
    <div class="card kpi"><div class="kpi-top"><span class="kpi-lbl">Heures pointées</span><span class="kpi-ico">${icone('timer')}</span></div>
      <div class="kpi-val">${fmtCompact(s.tot.heures)}<small> / ${fmtCompact(s.tot.budget)} h</small></div>
      <div style="margin-top:10px">${barre(s.tot.budget ? s.tot.heures / s.tot.budget : 0, 'lg')}</div>
      <div class="kpi-sub">${fmt(Math.max(0, s.tot.budget - s.tot.heures))} h restantes au budget</div></div>
    <div class="card kpi"><div class="kpi-top"><span class="kpi-lbl">Écart à date</span><span class="kpi-ico">${icone('activity')}</span></div>
      <div class="kpi-val ${cls(s.tot.ecartH)}">${signe(s.tot.ecartH)}<small> h</small></div>
      <div class="kpi-sub">${deltaE(s.tot.impact)} impact main d'œuvre</div></div>
    <div class="card kpi"><div class="kpi-top"><span class="kpi-lbl">Projection fin de chantier</span><span class="kpi-ico">${icone('trending-up')}</span></div>
      <div class="kpi-val ${cls(s.tot.ecartProj)}">${signe(s.tot.ecartProj)}<small> h</small></div>
      <div class="kpi-sub">${deltaE(s.tot.impactProj)} si la tendance se maintient</div></div>
  </div>`;

  const attention = `<div class="card"><div class="card-head"><h3>${icone('triangle-alert')}Points d'attention</h3><span class="badge ${al.length ? 'warn' : 'pos'}">${al.length || 'Aucun'}</span></div>
    ${al.length ? `<ul class="attention-list">${al.map(a => `<li><span class="sev ${a.sev}">${icone(a.ic, 'sm')}</span><div class="grow"><div class="strong">${a.t}</div><div class="small muted">${a.d}</div></div>${a.go ? `<button class="btn ghost sm" ${a.date ? `data-act="ptAller" data-d="${a.date}"` : `data-nav="${a.go}"`}>${icone('chevron-right', 'sm')}</button>` : ''}</li>`).join('')}</ul>`
      : `<div class="card-body row"><span class="sev good">${icone('circle-check', 'sm')}</span><span class="muted">Aucune dérive détectée. Le chantier est dans le budget.</span></div>`}</div>`;

  const courbe = `<div class="card"><div class="card-head"><h3>Courbe d'avancement</h3>
      <div class="legend"><span><i style="background:var(--serie-1)"></i>Réel (cumul pondéré)</span>${pts.some(p => p.theo !== null) ? '<span style="color:var(--serie-2)"><i class="dash"></i><span style="color:var(--text-2)">Prévu (délai linéaire)</span></span>' : ''}</div></div>
    <div class="card-body">${pts.length ? graphique('avancement', w => courbeAvancement(pts, w)) : '<p class="muted">Renseignez les dates du chantier et le suivi hebdomadaire.</p>'}</div></div>`;

  const ecarts = `<div class="card"><div class="card-head"><h3>Écart d'heures par phase</h3><span class="hint">gain à droite · dépassement à gauche</span></div>
    <div class="card-body">${graphique('ecarts', w => barresEcarts(s.rows, w))}</div>
    <div class="card-foot row"><span class="small muted">${s.rows.length} phase(s) · taux horaire ${fmtE(s.taux)}/h</span><span class="grow"></span><button class="btn ghost sm" data-nav="suivi">Détail par semaine ${icone('chevron-right', 'sm')}</button></div></div>`;

  const flux = `<div class="card"><div class="card-head"><h3>Activité récente</h3></div>
    ${act.length ? `<ul class="feed">${act.map(e => `<li><span class="f-ico ${e.c}">${icone(e.ic, 'sm')}</span><div class="f-txt"><div>${e.h}</div><div class="f-date">${depuis(e.d)}${e.s ? ' · ' + esc(e.s) : ''}</div></div></li>`).join('')}</ul>`
      : '<div class="card-body muted">Aucune activité pour l\'instant.</div>'}</div>`;

  const mini = `<div class="card mini-stats">
    <div><div class="ms-lbl">${icone('gauge', 'sm')}Productivité</div><div class="ms-val ${indice === null ? '' : cls(indice - 1)}">${indice === null ? '—' : fmt(indice, 2)}</div><div class="xs muted">h produites / h pointées</div></div>
    <div><div class="ms-lbl">${icone('clipboard-check', 'sm')}Terrain</div><div class="ms-val">${pc(t.pct)}</div><div class="xs muted">${t.faites} / ${t.total} tâches</div></div>
    <div><div class="ms-lbl">${icone('shield-check', 'sm')}Réserves ouvertes</div><div class="ms-val ${ouvertes ? 'neg' : ''}">${ouvertes}</div><div class="xs muted">${res.length} au total</div></div>
    <div><div class="ms-lbl">${icone('cloud-rain', 'sm')}Intempéries</div><div class="ms-val">${jIntemp}</div><div class="xs muted">jour(s) déclarés</div></div>
  </div>`;

  const phases = `<div class="card"><div class="card-head"><h3>Avancement par phase</h3></div>${s.rows.map(r => `<div class="phase">
      <div class="p-nom">${esc(r.phase)} <span class="muted small">· ${esc(r.ouvrage)}</span></div>
      <div class="p-val ${cls(r.ecartH)}">${pc(r.pct)}<small>${r.heures ? signe(r.ecartH) + ' h' : '—'}</small></div>
      ${barre(r.pct, r.pct >= 1 ? 'pos' : '')}
      <div class="p-meta">${fmt(r.heures)} h pointées · ${fmt(r.budget)} h budget</div></div>`).join('')}</div>`;

  const fiche = `<div class="card"><div class="card-head"><h3>Fiche chantier</h3><button class="btn ghost sm" data-act="chantierEdit" data-id="${esc(c.id)}">${icone('pencil', 'sm')}Modifier</button></div>
    <div class="card-body"><dl class="dl">
      ${[['Client', c.client], ['Métier', [c.metier, c.support && 'support ' + c.support.toLowerCase()].filter(Boolean).join(' · ')], ['N° d\'imputation', c.imputation], ['Agence', c.agence],
         ['Conducteur de travaux', c.conducteur], ['Chef de chantier', c.chef], ['Marché HT', num(c.marcheHT) ? fmtE(c.marcheHT) : ''],
         ['Taux horaire équipe', num(c.tauxHoraire) ? fmtE(c.tauxHoraire) + ' / h' : ''], ['Check-list CDT', `${cdt.faits} / ${cdt.total} points`]]
        .filter(r => String(r[1] || '').trim()).map(r => `<dt>${r[0]}</dt><dd>${esc(r[1])}</dd>`).join('')}
    </dl></div></div>`;

  return entete + `<div class="stack">${kpis}
    <div class="grid g-main">${courbe}${attention}</div>
    ${mini}
    <div class="grid g-main">${ecarts}${flux}</div>
    <div class="grid g-2">${phases}${fiche}</div></div>`;
}

/* ================================ Terrain ================================ */
function vTerrain(c) {
  const taches = deCh(db.taches);
  const actions = `<button class="btn" data-act="qrEtiquettes">${icone('qr-code')}Étiquettes QR</button><button class="btn" data-act="genTaches">${icone('list-checks')}Générer la liste</button><button class="btn accent" data-act="scanQR">${icone('scan-line')}Scanner</button>`;
  const entete = enTetePage({ eyebrow: 'Saisie terrain', titre: 'Avancement par zone', sous: [taches.length ? sousInfo('map-pin', `${zonesDe(c.id).length} zones`) : '', taches.length ? sousInfo('list-checks', `${taches.length} tâches`) : ''], actions });
  if (!taches.length) {
    return entete + `<div class="card">${vide('clipboard-check', 'Aucune tâche terrain',
      'Générez la liste <b>zones × tâches</b> (terrasses, façades, supports, niveaux…) ou importez un fichier <code>Chantier;Zone;Lot;Tache;Fait;Observation</code>.',
      `<button class="btn primary" data-act="genTaches">${icone('list-checks')}Générer la liste</button><button class="btn" data-act="importFichier">${icone('upload')}Importer</button>`)}</div>`;
  }
  const zones = zonesDe(c.id);
  if (!zones.includes(ui.zone)) ui.zone = zones[0];
  const st = statsTerrain(db, c.id);
  const bascule = `<div class="row" style="margin-bottom:14px"><div class="seg">
      <button class="${ui.terrainMode === 'liste' ? 'on' : ''}" data-act="terrainMode" data-mode="liste">${icone('list', 'sm')}Par zone</button>
      <button class="${ui.terrainMode === 'matrice' ? 'on' : ''}" data-act="terrainMode" data-mode="matrice">${icone('grid-3x3', 'sm')}Vue d'ensemble</button></div>
    <span class="grow"></span><span class="badge brand" id="terrainBadge">${st.faites} / ${st.total} · ${pc(st.pct)}</span></div>`;
  if (ui.terrainMode === 'matrice') return entete + bascule + vMatrice(zones);
  return entete + bascule + `<div class="card">
    <div class="card-body" style="border-bottom:1px solid var(--border)">
      <div class="zone-bar">
        <button class="btn icon" data-act="zoneNav" data-dir="-1" aria-label="Zone précédente">${icone('chevron-left')}</button>
        <button class="zone-pick" data-act="zonePicker"><span class="ring" id="zoneRing"><span></span></span><span class="zp-txt"><span class="zp-lbl">Zone</span><span class="zp-nom">${esc(ui.zone)}</span></span>${icone('chevron-down')}</button>
        <button class="btn icon" data-act="zoneNav" data-dir="1" aria-label="Zone suivante">${icone('chevron-right')}</button>
      </div>
      <div class="row" style="margin-top:12px">
        <div class="input-icon grow" style="min-width:180px">${icone('search', 'sm')}<input class="input" placeholder="Filtrer les tâches…" value="${esc(ui.filtreTache)}" data-input="filtreTache"></div>
        <button class="btn sm" data-act="cocherZone" data-v="1">${icone('check', 'sm')}Tout cocher</button>
        <button class="btn sm ghost" data-act="cocherZone" data-v="0">Tout décocher</button>
      </div>
    </div>
    <div class="tasks" id="taskList"></div>
    <div class="card-foot row"><button class="btn sm" data-act="tacheAjout">${icone('plus', 'sm')}Travail non prévu</button><button class="btn sm ghost" data-act="copierRecap">${icone('copy', 'sm')}Copier le récap du jour</button></div>
  </div>`;
}

function renderListeTaches() {
  const box = $('#taskList');
  if (!box) return;
  const f = norm(ui.filtreTache);
  const toutes = deCh(db.taches).filter(t => t.zone === ui.zone);
  const visibles = toutes.filter(t => !f || norm(t.tache).includes(f) || norm(t.lot).includes(f));
  const faites = toutes.filter(t => estFait(t.fait)).length;
  const p = toutes.length ? Math.round(faites / toutes.length * 100) : 0;
  const ring = $('#zoneRing');
  if (ring) { ring.style.setProperty('--p', p); ring.firstElementChild.textContent = p + '%'; }
  const st = statsTerrain(db, ui.chantierId);
  if ($('#terrainBadge')) $('#terrainBadge').textContent = `${st.faites} / ${st.total} · ${pc(st.pct)}`;
  box.innerHTML = visibles.length ? visibles.map(t => {
    const fait = estFait(t.fait);
    return `<div class="task ${fait ? 'done' : ''}">
      <label class="checkbox lg"><input type="checkbox" ${fait ? 'checked' : ''} data-change="toggleTache" data-id="${esc(t.id)}" aria-label="${esc(t.tache)}"></label>
      <div><div class="t-nom">${esc(t.tache)}</div><div class="t-meta">${t.lot ? `<span class="badge">${esc(t.lot)}</span>` : ''}${t.ajout ? '<span class="badge accent">Non prévu</span>' : ''}${fait && t.faitLe ? `<span>${icone('check', 'sm')} ${fmtDate(t.faitLe)}${t.faitPar ? ' · ' + esc(t.faitPar) : ''}</span>` : ''}</div></div>
      <input class="input t-obs" placeholder="Observation" value="${esc(t.obs)}" data-change="obsTache" data-id="${esc(t.id)}">
      <button class="btn ghost icon sm" data-act="tacheSuppr" data-id="${esc(t.id)}" aria-label="Supprimer">${icone('trash-2', 'sm')}</button>
    </div>`;
  }).join('') : `<div class="card-body muted">Aucune tâche ne correspond au filtre.</div>`;
}

function vMatrice(zones) {
  const taches = deCh(db.taches);
  const cols = [...new Set(taches.map(t => t.tache))];
  const idx = new Map(taches.map(t => [t.zone + '||' + t.tache, t]));
  const head = `<tr><th>Zone</th>${cols.map(t => `<th class="rot">${esc(t)}</th>`).join('')}<th class="num">Avancement</th></tr>`;
  const body = zones.map(z => {
    let n = 0, f = 0;
    const cells = cols.map(col => {
      const t = idx.get(z + '||' + col);
      if (!t) return '<td class="na"></td>';
      n++; const ok = estFait(t.fait); if (ok) f++;
      return `<td class="cell ${ok ? 'on' : ''}" data-act="toggleCell" data-id="${esc(t.id)}" title="${esc(z)} — ${esc(col)}"><span class="c">${ok ? icone('check', 'sm') : ''}</span></td>`;
    }).join('');
    return `<tr><td class="zone"><a href="#" data-act="ouvrirZone" data-zone="${esc(z)}">${esc(z)}</a></td>${cells}<td class="num"><div class="row" style="justify-content:flex-end;flex-wrap:nowrap"><span style="width:70px">${barre(n ? f / n : 0, f === n ? 'pos' : '')}</span><b style="width:42px">${n ? Math.round(f / n * 100) : 0}%</b></div></td></tr>`;
  }).join('');
  const foot = `<tr class="total"><td>Total</td>${cols.map(col => {
    const ts = taches.filter(t => t.tache === col);
    return `<td class="num small">${ts.length ? Math.round(ts.filter(t => estFait(t.fait)).length / ts.length * 100) : 0}%</td>`;
  }).join('')}<td></td></tr>`;
  return `<div class="card"><div class="card-head"><h3>Vue d'ensemble zones × tâches</h3><span class="hint">Cliquez sur une case pour cocher, sur une zone pour la saisie détaillée</span></div>
    <div class="table-wrap"><table class="table matrix"><thead>${head}</thead><tbody>${body}${foot}</tbody></table></div></div>`;
}

/* ============================= Suivi hebdo =============================== */
function vSuivi(c) {
  const phases = phasesBTE(db, c.id);
  const sem = ui.semaine;
  const nSem = c.dateDebut ? Math.floor((new Date(sem) - new Date(lundi(c.dateDebut))) / (7 * 86400000)) + 1 : null;
  const nav = `<div class="btn-group"><button class="btn icon" data-act="semNav" data-d="-7" aria-label="Semaine précédente">${icone('chevron-left')}</button>
      <button class="btn" data-act="semNav" data-d="0">Semaine ${semISO(sem)}</button>
      <button class="btn icon" data-act="semNav" data-d="7" aria-label="Semaine suivante">${icone('chevron-right')}</button></div>
    <input type="date" class="input" style="width:auto" value="${sem}" data-change="semDate" aria-label="Choisir une date">`;
  const entete = enTetePage({ eyebrow: 'Suivi hebdomadaire', titre: `Semaine ${semISO(sem)}`, sous: [sousInfo('calendar', `du ${fmtDate(sem)} au ${fmtDate(addDays(sem, 6))}`), nSem && nSem > 0 ? `<span class="badge brand">Semaine n°${nSem} du chantier</span>` : ''], actions: nav });
  if (!phases.length) {
    return entete + `<div class="card">${vide('trending-up', 'Aucune phase à suivre', 'Le suivi hebdomadaire s\'appuie sur les phases du BTE. Construisez-le ou importez votre fichier SMAC.',
      `<button class="btn primary" data-nav="bte">${icone('calculator')}Construire le BTE</button><button class="btn" data-act="importFichier">${icone('upload')}Importer</button>`)}</div>`;
  }
  const calc = calcSuivi(db, c.id, sem);
  const precedent = calcSuivi(db, c.id, addDays(sem, -1));
  const entreesSem = deCh(db.suivi).filter(s => s.semaine === sem);
  // Heures issues du pointage journalier (lecture seule ici)
  const avecPt = (db.pointages || []).some(p => p.chantierId === c.id);
  const ptSem = suiviDepuisPointages(db, c.id).filter(s => s.semaine === sem);
  const hPt = (o, p) => ptSem.filter(s => s.ouvrage === o && s.phase === p).reduce((t, s) => t + s.heures, 0);
  const totalPt = ptSem.reduce((t, s) => t + s.heures, 0);
  const totalSem = entreesSem.reduce((t, s) => t + num(s.heures), 0) + totalPt;
  const nCol = avecPt ? 10 : 9;
  let ouvCourant = null;
  const lignes = calc.rows.map((r, i) => {
    const e = entreesSem.find(s => s.ouvrage === r.ouvrage && s.phase === r.phase);
    const prev = precedent.rows[i];
    const g = r.ouvrage !== ouvCourant ? `<tr class="group"><td colspan="${nCol}">${icone('building-2', 'sm')} ${esc(r.ouvrage)}</td></tr>` : '';
    ouvCourant = r.ouvrage;
    const valPct = e && e.pct !== null && e.pct !== undefined ? Math.round(num(e.pct) * 1000) / 10 : '';
    return g + `<tr>
      <td><div class="strong">${esc(r.phase)}</div><div class="sub">${fmt(r.budget)} h budget</div></td>
      <td class="num"><div class="row" style="justify-content:flex-end;flex-wrap:nowrap;gap:2px">
        <input class="input cell" style="width:72px;border-color:var(--border-strong);background:var(--surface)" type="number" inputmode="decimal" min="0" max="100" step="5" placeholder="${Math.round(prev.pct * 100)}" value="${valPct}" data-change="suiviPct" data-o="${esc(r.ouvrage)}" data-p="${esc(r.phase)}" aria-label="% cumulé ${esc(r.phase)}"><span class="muted">%</span>
        <button class="btn ghost icon sm" title="Calculer depuis les quantités" data-act="suiviQte" data-o="${esc(r.ouvrage)}" data-p="${esc(r.phase)}">${icone('ruler', 'sm')}</button></div></td>
      ${avecPt ? `<td class="num">${hPt(r.ouvrage, r.phase) ? `<span class="strong">${fmt(hPt(r.ouvrage, r.phase))}</span>` : '<span class="muted">—</span>'}</td>` : ''}
      <td class="num"><input class="input cell" style="width:80px;border-color:var(--border-strong);background:var(--surface)" type="number" inputmode="decimal" min="0" step="0.5" value="${e && num(e.heures) ? num(e.heures) : ''}" data-change="suiviH" data-o="${esc(r.ouvrage)}" data-p="${esc(r.phase)}" aria-label="Heures semaine ${esc(r.phase)}"></td>
      <td class="num"><div style="width:90px;margin-left:auto">${barre(r.pct, r.pct >= 1 ? 'pos' : '')}</div><div class="sub">${pc(r.pct)}</div></td>
      <td class="num">${fmt(r.heures)}</td>
      <td class="num strong ${cls(r.ecartH)}">${r.heures ? signe(r.ecartH) : '—'}</td>
      <td class="num ${cls(r.impact)}">${r.heures ? signeE(r.impact) : '—'}</td>
      <td class="num ${cls(r.ecartProj)}">${r.heures ? signe(r.ecartProj) : '—'}</td>
      <td class="num ${cls(r.impactProj)}">${r.heures ? signeE(r.impactProj) : '—'}</td></tr>`;
  }).join('');
  const T = calc.tot;
  const toutes = entreesSuivi(db, c.id);
  const semaines = [...new Set(toutes.map(s => s.semaine))].sort();
  const hist = semaines.length ? `<div class="card"><div class="card-head"><h3>Historique des saisies</h3><span class="hint">% cumulé · heures de la semaine</span></div>
    <div class="table-wrap"><table class="table"><thead><tr><th>Phase</th>${semaines.map(w => `<th class="num"><a href="#" data-act="allerSemaine" data-s="${w}">S${semISO(w)}</a><div style="font-weight:500;text-transform:none;letter-spacing:0">${fmtDateCourt(w)}</div></th>`).join('')}</tr></thead>
    <tbody>${phases.map(p => `<tr><td><span class="strong">${esc(p.phase)}</span> <span class="sub">· ${esc(p.ouvrage)}</span></td>${semaines.map(w => {
      const es = toutes.filter(s => s.semaine === w && s.ouvrage === p.ouvrage && s.phase === p.phase);
      if (!es.length) return '<td class="num muted">—</td>';
      const m = es.find(s => s.pct !== null && s.pct !== undefined);
      return `<td class="num">${m ? pc(m.pct) : '·'}<div class="sub">${fmt(es.reduce((t, s) => t + num(s.heures), 0))} h</div></td>`;
    }).join('')}</tr>`).join('')}</tbody></table></div></div>` : '';

  return entete + `<div class="stack">
    <div class="alert info">${icone('info')}<div>${avecPt
      ? `Chaque semaine, saisissez le <b>% d'avancement cumulé</b> de chaque phase. Les heures viennent du <a href="#" data-act="ptAller" data-d="${sem}">pointage journalier</a> ; la colonne « Ajout manuel » sert aux heures non pointées (régularisations, intérim facturé…).`
      : `Chaque semaine, saisissez le <b>% d'avancement cumulé</b> de chaque phase (une estimation suffit) et les <b>heures pointées dans la semaine</b>, ou utilisez le <a href="#" data-nav="pointage">pointage journalier</a> qui les calcule automatiquement.`}
      Écart = heures budgétées × % réalisé − heures pointées : positif = gain, négatif = dépassement.</div></div>
    <div class="card">
      <div class="table-wrap"><table class="table">
        <thead><tr><th>Phase</th><th class="num">% cumulé</th>${avecPt ? '<th class="num" title="Somme des pointages journaliers de la semaine">Pointage</th><th class="num">Ajout manuel</th>' : '<th class="num">Heures semaine</th>'}<th class="num">Réalisé</th><th class="num">H. pointées</th><th class="num">Écart h</th><th class="num">Impact</th><th class="num">Projeté h</th><th class="num">Projeté €</th></tr></thead>
        <tbody>${lignes}
          <tr class="total"><td>Total chantier</td><td></td>${avecPt ? `<td class="num">${fmt(totalPt)} h</td><td class="num">${fmt(totalSem - totalPt)} h</td>` : `<td class="num">${fmt(totalSem)} h</td>`}<td class="num">${pc(T.pct)}</td><td class="num">${fmt(T.heures)}</td>
            <td class="num ${cls(T.ecartH)}">${signe(T.ecartH)}</td><td class="num ${cls(T.impact)}">${signeE(T.impact)}</td><td class="num ${cls(T.ecartProj)}">${signe(T.ecartProj)}</td><td class="num ${cls(T.impactProj)}">${signeE(T.impactProj)}</td></tr>
        </tbody></table></div>
      <div class="card-foot small muted">${icone('clock', 'sm')} ${fmt(totalSem)} h cette semaine${avecPt ? ` dont ${fmt(totalPt)} h pointées` : ' — à rapprocher du pointage RH'}. Valeurs cumulées au ${fmtDate(addDays(sem, 6))} · taux horaire ${fmtE(calc.taux)}/h.</div>
    </div>${hist}</div>`;
}

/* ================================== BTE ================================== */
function vBTE(c) {
  const ops = deCh(db.ops);
  const hj = hjDe(c);
  const taux = num(c.tauxHoraire);
  let tH = 0, tB = 0, tD = 0, ouvCourant = null;
  const lignes = ops.map(op => {
    const h = heuresOp(op, c), b = h * taux, d = num(op.devis);
    tH += h; tB += b; tD += d;
    const calcule = num(op.cadence) > 0 && num(op.metre) > 0;
    const g = op.ouvrage !== ouvCourant ? `<tr class="group"><td colspan="10">${icone('building-2', 'sm')} ${esc(op.ouvrage)}</td></tr>` : '';
    ouvCourant = op.ouvrage;
    return g + `<tr>
      <td class="muted">${esc(op.phase)}</td>
      <td><div class="strong">${esc(op.operation)}</div>${op.designation ? `<div class="sub">${esc(op.designation)}</div>` : ''}</td>
      <td class="num"><input class="input cell" type="number" inputmode="decimal" value="${num(op.metre) || ''}" data-change="opField" data-f="metre" data-id="${esc(op.id)}" aria-label="Métré"></td>
      <td class="muted">${esc(op.unite)}</td>
      <td class="num"><input class="input cell" type="number" inputmode="decimal" value="${num(op.cadence) ? Math.round(num(op.cadence) * 100) / 100 : ''}" data-change="opField" data-f="cadence" data-id="${esc(op.id)}" title="${esc(op.unite)} / jour / homme" aria-label="Cadence"></td>
      <td class="num">${calcule ? `<b>${fmt(h)}</b>` : `<input class="input cell" type="number" inputmode="decimal" value="${num(op.heuresForfait) || ''}" data-change="opField" data-f="heuresForfait" data-id="${esc(op.id)}" title="Heures au forfait" aria-label="Heures au forfait">`}</td>
      <td class="num">${fmtE(b)}</td>
      <td class="num"><input class="input cell" type="number" inputmode="decimal" value="${num(op.devis) || ''}" data-change="opField" data-f="devis" data-id="${esc(op.id)}" aria-label="Devis"></td>
      <td class="num ${d ? cls(d - b) : ''}">${d ? signeE(d - b) : ''}</td>
      <td class="actions"><button class="btn ghost icon sm" data-act="opEdit" data-id="${esc(op.id)}" aria-label="Modifier">${icone('pencil', 'sm')}</button><button class="btn ghost icon sm" data-act="opSuppr" data-id="${esc(op.id)}" aria-label="Supprimer">${icone('trash-2', 'sm')}</button></td>
    </tr>`;
  }).join('');
  const equipe = Math.max(1, num(ui.equipe) || 1);
  const jours = tH / (hj * equipe);
  const partMO = num(c.marcheHT) ? tB / num(c.marcheHT) : 0;
  const entete = enTetePage({ eyebrow: 'Budget technique d\'exécution', titre: 'Main d\'œuvre par opération', sous: [sousInfo('layers', `${ops.length} opérations`), sousInfo('building-2', `${new Set(ops.map(o => o.ouvrage)).size} ouvrage(s)`)],
    actions: `<button class="btn" data-act="importFichier">${icone('upload')}Importer</button><button class="btn" data-act="biblio">${icone('book-open')}Cadences standard</button><button class="btn primary" data-act="opNew">${icone('plus')}Opération</button>` });

  return entete + `<div class="stack">
    <div class="kpis">
      <div class="card kpi"><div class="kpi-top"><span class="kpi-lbl">Heures budgétées</span><span class="kpi-ico">${icone('timer')}</span></div><div class="kpi-val">${fmtCompact(tH)}<small> h</small></div><div class="kpi-sub">${fmt(tH / hj)} jours-homme</div></div>
      <div class="card kpi"><div class="kpi-top"><span class="kpi-lbl">Budget main d'œuvre</span><span class="kpi-ico">${icone('calculator')}</span></div><div class="kpi-val">${fmtE(tB)}</div><div class="kpi-sub">${partMO ? pc(partMO) + ' du marché' : 'taux ' + fmtE(taux) + '/h'}</div></div>
      <div class="card kpi"><div class="kpi-top"><span class="kpi-lbl">Gain / perte vs devis</span><span class="kpi-ico">${icone('activity')}</span></div><div class="kpi-val ${tD ? cls(tD - tB) : ''}">${tD ? signeE(tD - tB) : '—'}</div><div class="kpi-sub">${tD ? `devis MO ${fmtE(tD)} · ${delta((tD - tB) / tD * 100, ' %', 1)}` : 'renseignez le devis par opération'}</div></div>
      <div class="card kpi"><div class="kpi-top"><span class="kpi-lbl">Durée indicative</span><span class="kpi-ico">${icone('calendar')}</span></div><div class="kpi-val">${fmt(jours, 1)}<small> jours</small></div>
        <div class="kpi-sub">avec <input class="input" type="number" min="1" style="width:56px;height:26px;padding:0 6px;display:inline-block" value="${equipe}" data-change="equipe" aria-label="Nombre de compagnons"> compagnon(s) · ${fmt(jours / 5, 1)} sem.</div></div>
    </div>
    <div class="card">
      <div class="card-head"><div class="row" style="gap:16px">
        <label class="small row" style="gap:6px">Taux horaire <input class="input" style="width:84px;height:32px" type="number" step="0.5" value="${num(c.tauxHoraire) || ''}" data-change="chField" data-f="tauxHoraire"> €/h</label>
        <label class="small row" style="gap:6px">Journée <input class="input" style="width:70px;height:32px" type="number" step="0.25" value="${hj}" data-change="chField" data-f="heuresJour"> h</label>
        <label class="small row" style="gap:6px">Marché HT <input class="input" style="width:120px;height:32px" type="number" value="${num(c.marcheHT) || ''}" data-change="chField" data-f="marcheHT"> €</label>
      </div></div>
      ${ops.length ? `<div class="table-wrap"><table class="table">
        <thead><tr><th>Phase</th><th>Opération</th><th class="num">Métré</th><th>U</th><th class="num">Cadence <span style="text-transform:none;letter-spacing:0">(u/j/h)</span></th><th class="num">Heures</th><th class="num">Budget</th><th class="num">Devis</th><th class="num">Écart</th><th></th></tr></thead>
        <tbody>${lignes}<tr class="total"><td colspan="5">Total main d'œuvre</td><td class="num">${fmt(tH)}</td><td class="num">${fmtE(tB)}</td><td class="num">${tD ? fmtE(tD) : ''}</td><td class="num ${tD ? cls(tD - tB) : ''}">${tD ? signeE(tD - tB) : ''}</td><td></td></tr></tbody></table></div>
        <div class="card-foot small muted">Heures = métré ÷ cadence × ${hj} h. Sans métré ni cadence (installation, approvisionnement…), saisissez les heures au forfait. Écart = devis − budget.</div>`
      : vide('calculator', 'Aucune opération', 'Ajoutez les opérations une par une, depuis la bibliothèque des cadences standard SMAC, ou importez votre BTE Excel.',
        `<button class="btn primary" data-act="biblio">${icone('book-open')}Cadences standard</button><button class="btn" data-act="opNew">${icone('plus')}Opération</button>`)}
    </div></div>`;
}

/* ================================ Journal ================================ */
function vJournal(c) {
  const js = deCh(db.journal).sort((a, b) => b.date.localeCompare(a.date));
  const nI = js.filter(j => j.intemperie).length;
  const hT = js.reduce((t, j) => t + num(j.heures), 0);
  const eff = js.filter(j => num(j.effectif));
  const phs = photosDe(c.id);
  const onglet = ui.journalTab === 'photos' ? 'photos' : 'journal';
  const entete = enTetePage({ eyebrow: 'Journal de chantier', titre: onglet === 'photos' ? 'Photos du chantier' : 'Main courante', sous: [sousInfo('notebook-pen', `${js.length} entrée(s)`), sousInfo('camera', `${phs.length} photo(s)`)],
    actions: `<label class="btn">${icone('camera')}Photos<input type="file" accept="image/*" multiple hidden data-change="photosGalerie"></label><button class="btn primary" data-act="journalNew">${icone('plus')}Nouvelle entrée</button>` });
  const seg = `<div class="seg" style="margin-bottom:16px"><button class="${onglet === 'journal' ? 'on' : ''}" data-act="journalTab" data-t="journal">${icone('notebook-pen', 'sm')}Main courante <span class="n">${js.length}</span></button><button class="${onglet === 'photos' ? 'on' : ''}" data-act="journalTab" data-t="photos">${icone('image', 'sm')}Photos <span class="n">${phs.length}</span></button></div>`;
  if (onglet === 'photos') {
    const jours = [...new Set(phs.map(p => p.date))];
    return entete + seg + (phs.length ? `<div class="stack">${jours.map(d => `<div class="card"><div class="card-head"><h3>${fmtDate(d, true)}</h3><span class="hint">${phs.filter(p => p.date === d).length} photo(s)</span></div>
      <div class="card-body">${vignettesPhotos(phs.filter(p => p.date === d), { legende: true })}</div></div>`).join('')}</div>`
      : `<div class="card">${vide('camera', 'Aucune photo', 'Prenez des photos depuis le téléphone : avancement, points singuliers, réserves, livraisons. Elles restent disponibles hors-ligne et sont partagées avec l\'équipe.',
        `<label class="btn primary">${icone('camera')}Prendre des photos<input type="file" accept="image/*" multiple hidden data-change="photosGalerie"></label>`)}</div>`);
  }
  return entete + seg + `<div class="stack">
    <div class="card mini-stats">
      <div><div class="ms-lbl">${icone('notebook-pen', 'sm')}Entrées</div><div class="ms-val">${js.length}</div></div>
      <div><div class="ms-lbl">${icone('cloud-rain', 'sm')}Intempéries</div><div class="ms-val ${nI ? 'neg' : ''}">${nI}</div></div>
      <div><div class="ms-lbl">${icone('timer', 'sm')}Heures déclarées</div><div class="ms-val">${fmt(hT, 0)} h</div></div>
      <div><div class="ms-lbl">${icone('users', 'sm')}Effectif moyen</div><div class="ms-val">${eff.length ? fmt(eff.reduce((t, j) => t + num(j.effectif), 0) / eff.length, 1) : '—'}</div></div>
    </div>
    ${js.length ? `<div class="timeline">${js.map(j => `<div class="tl-item ${j.intemperie ? 'intemp' : ''}"><div class="card card-pad">
      <div class="tl-head"><div class="row"><span class="tl-date">${fmtDate(j.date, true)}</span>
        ${j.meteo ? `<span class="badge">${esc(j.meteo)}</span>` : ''}${j.intemperie ? `<span class="badge warn">${icone('cloud-rain')}Intempérie</span>` : ''}
        ${num(j.effectif) ? `<span class="badge brand">${icone('users')}${num(j.effectif)}</span>` : ''}${num(j.heures) ? `<span class="badge">${icone('timer')}${fmt(j.heures)} h</span>` : ''}</div>
        <div><button class="btn ghost icon sm" data-act="journalEdit" data-id="${esc(j.id)}" aria-label="Modifier">${icone('pencil', 'sm')}</button><button class="btn ghost icon sm" data-act="journalSuppr" data-id="${esc(j.id)}" aria-label="Supprimer">${icone('trash-2', 'sm')}</button></div></div>
      ${j.intemperie && j.cause ? `<div class="small" style="margin-top:8px"><b>Cause :</b> ${esc(j.cause)}${(j.verifs || []).length ? ` <span class="muted">· ${j.verifs.length} bonne(s) pratique(s) vérifiée(s)</span>` : ''}</div>` : ''}
      ${j.texte ? `<div class="tl-body">${esc(j.texte)}</div>` : ''}
      ${vignettesPhotos(photosDe(c.id, 'journal', j.id), { petit: true })}
      ${j.auteur ? `<div class="xs muted" style="margin-top:8px">${esc(j.auteur)}</div>` : ''}</div></div>`).join('')}</div>`
      : `<div class="card">${vide('notebook-pen', 'Aucune entrée', 'Consignez chaque jour l\'effectif, la météo, les travaux réalisés, les visites et les événements.', `<button class="btn primary" data-act="journalNew">${icone('plus')}Nouvelle entrée</button>`)}</div>`}
  </div>`;
}

/* ================================ Qualité ================================ */
function vQualite(c) {
  const t = ui.qualiteTab;
  const res = deCh(db.reserves);
  const ouv = res.filter(r => r.statut !== 'levée').length;
  const cdt = nbChecklist(c.id, 'cdt'), fin = nbChecklist(c.id, 'fin');
  const entete = enTetePage({ eyebrow: 'Qualité & conformité', titre: { reserves: 'Réserves et OPR', cdt: 'Check-list du conducteur de travaux', fin: 'Contrôle de fin de chantier', pv: 'Procès-verbaux' }[t],
    actions: t === 'reserves' ? `<button class="btn primary" data-act="resNew">${icone('plus')}Nouvelle réserve</button>` : '' });
  const seg = `<div class="seg" style="margin-bottom:16px">
    <button class="${t === 'reserves' ? 'on' : ''}" data-act="qTab" data-t="reserves">${icone('circle-alert', 'sm')}Réserves <span class="n">${ouv}</span></button>
    <button class="${t === 'cdt' ? 'on' : ''}" data-act="qTab" data-t="cdt">${icone('list-checks', 'sm')}Check-list CDT <span class="n">${cdt.faits}/${cdt.total}</span></button>
    <button class="${t === 'fin' ? 'on' : ''}" data-act="qTab" data-t="fin">${icone('shield-check', 'sm')}Fin de chantier <span class="n">${fin.faits}/${fin.total}</span></button>
    <button class="${t === 'pv' ? 'on' : ''}" data-act="qTab" data-t="pv">${icone('file-check', 'sm')}PV <span class="n">${pvsDe(c.id).length}</span></button></div>`;
  let corps = '';
  if (t === 'pv') corps = vPVs(c);
  else if (t === 'reserves') {
    const f = ui.reserveFiltre;
    const auj = aujourdHui();
    const liste = res.filter(r => f === 'toutes' || (f === 'ouvertes' ? r.statut !== 'levée' : r.statut === 'levée'))
      .sort((a, b) => (a.echeance || '9').localeCompare(b.echeance || '9'));
    corps = `<div class="card"><div class="card-head"><div class="seg">${[['ouvertes', 'Ouvertes'], ['levées', 'Levées'], ['toutes', 'Toutes']].map(([x, l]) => `<button class="${f === x ? 'on' : ''}" data-act="resFiltre" data-f="${x}">${l}</button>`).join('')}</div>
      <span class="hint">${res.length} réserve(s) · ${res.length - ouv} levée(s)</span></div>
      ${liste.length ? liste.map(r => {
        const retard = r.statut !== 'levée' && r.echeance && r.echeance < auj;
        return `<div class="res-item"><span class="res-num">${numeroReserve(r)}</span>
          <div><div class="r-desc">${esc(r.description)}</div>
            <div class="r-meta"><span>${icone('map-pin', 'sm')}${esc(r.zone || 'Sans zone')}</span><span>${icone('info', 'sm')}${esc(r.origine || '')}</span>${r.responsable ? `<span>${icone('user', 'sm')}${esc(r.responsable)}</span>` : ''}<span>${icone('calendar', 'sm')}créée ${fmtDate(r.creeLe)}</span></div>
            ${vignettesPhotos(photosDe(c.id, 'reserve', r.id), { petit: true })}
            <div style="margin-top:8px">${r.statut === 'levée' ? `<span class="badge pos">${icone('check')}Levée le ${fmtDate(r.leveeLe)}</span>` : `<span class="badge ${retard ? 'neg' : 'warn'} dot">${retard ? 'En retard' : 'Ouverte'}${r.echeance ? ' · échéance ' + fmtDate(r.echeance) : ''}</span>`}</div></div>
          <div class="row" style="flex-wrap:nowrap"><button class="btn sm ${r.statut === 'levée' ? '' : 'primary'}" data-act="resLever" data-id="${esc(r.id)}">${r.statut === 'levée' ? icone('undo-2', 'sm') + 'Rouvrir' : icone('check', 'sm') + 'Lever'}</button>
            <button class="btn ghost icon sm" data-act="resEdit" data-id="${esc(r.id)}" aria-label="Modifier">${icone('pencil', 'sm')}</button><button class="btn ghost icon sm" data-act="resSuppr" data-id="${esc(r.id)}" aria-label="Supprimer">${icone('trash-2', 'sm')}</button></div></div>`;
      }).join('') : vide('shield-check', f === 'ouvertes' ? 'Aucune réserve ouverte' : 'Aucune réserve', 'Les réserves d\'OPR, d\'autocontrôle ou de visite sont listées ici avec leur échéance de levée.')}</div>`;
  } else {
    const liste = t === 'cdt' ? REF.checklistCDT : REF.qualiteFinChantier;
    const st = ((db.checklists[c.id] || {})[t]) || {};
    const tot = t === 'cdt' ? cdt : fin;
    corps = (t === 'fin' ? `<div class="alert info" style="margin-bottom:16px">${icone('info')}<div>Contrôle qualité à réaliser avant l'établissement du DGD. Base générique, à adapter au formulaire de votre agence.</div></div>` : '')
      + `<div class="card"><div class="card-head"><h3>${tot.faits} / ${tot.total} points validés</h3><div style="width:200px">${barre(tot.faits / tot.total, tot.faits === tot.total ? 'pos lg' : 'lg')}</div></div>`
      + liste.map((s, si) => {
        const n = s.items.filter((_, ii) => st[si + '-' + ii]).length;
        return `<div class="cl-sec"><div class="cl-sec-head"><h4>${esc(s.section)}</h4><span class="small muted">${n}/${s.items.length}</span></div>${s.items.map((it, ii) => {
          const k = si + '-' + ii, v = st[k];
          return `<div class="cl-item ${v ? 'done' : ''}"><label class="checkbox"><input type="checkbox" ${v ? 'checked' : ''} data-change="clToggle" data-l="${t}" data-k="${k}"><span class="txt">${esc(it)}</span></label>
            ${v ? `<div class="cl-meta">Validé le ${fmtDate(v.date)}${v.par ? ' par ' + esc(v.par) : ''}</div>` : ''}</div>`;
        }).join('')}</div>`;
      }).join('') + '</div>';
  }
  return entete + seg + corps;
}

/* ============================== Portefeuille ============================= */
function vPortefeuille() {
  const entete = enTetePage({ eyebrow: 'Organisation', titre: 'Portefeuille de chantiers', sous: [sousInfo('briefcase', `${db.chantiers.length} chantier(s)`)],
    actions: `<button class="btn" data-act="importFichier">${icone('upload')}Importer</button><button class="btn primary" data-act="chantierNew">${icone('plus')}Nouveau chantier</button>` });
  if (!db.chantiers.length) return entete + `<div class="card">${vide('briefcase', 'Aucun chantier', 'Créez votre premier chantier, importez un BTE SMAC, ou explorez la démo.',
    `<button class="btn primary" data-act="chantierNew">${icone('plus')}Nouveau chantier</button><button class="btn" data-act="demo">${icone('sparkles')}Démo</button>`)}</div>`;
  let totB = 0, totH = 0, totI = 0, totIP = 0;
  const cartes = db.chantiers.map(c => {
    const s = calcSuivi(db, c.id), st = statutChantier(c);
    const ouv = deCh(db.reserves, c.id).filter(r => r.statut !== 'levée').length;
    totB += s.tot.budget; totH += s.tot.heures; totI += s.tot.impact; totIP += s.tot.impactProj;
    const eq = c.equipeId ? Synchro.equipes.find(e => e.id === c.equipeId) : null;
    return `<div class="card projet ${c.id === ui.chantierId ? 'actif' : ''}" data-act="chantierOuvrir" data-id="${esc(c.id)}">
      <div class="projet-head"><span class="projet-ico">${icone(c.metier === 'Façade' ? 'layers' : 'building-2')}</span>
        <div class="grow"><h3>${esc(c.nom)}</h3><div class="small muted">${esc([c.client, c.metier].filter(Boolean).join(' · ') || '—')}</div></div>
        <span class="badge ${st.cls} dot">${st.txt}</span></div>
      <div><div class="row small" style="justify-content:space-between;margin-bottom:6px"><span class="muted">Avancement</span><b>${pc(s.tot.pct)}</b></div>${barre(s.tot.pct, s.tot.pct >= 1 ? 'pos' : '')}</div>
      <div class="p-kpis">
        <div><div class="l">Écart à date</div><div class="v ${cls(s.tot.ecartH)}">${s.tot.heures ? signe(s.tot.ecartH) + ' h' : '—'}</div></div>
        <div><div class="l">Impact projeté</div><div class="v ${cls(s.tot.impactProj)}">${s.tot.heures ? signeE(s.tot.impactProj) : '—'}</div></div>
        <div><div class="l">Réserves</div><div class="v ${ouv ? 'neg' : ''}">${ouv}</div></div>
      </div>
      <div class="row small muted"><span class="row" style="gap:5px">${icone(c.equipeId ? 'cloud' : 'database', 'sm')}${c.equipeId ? esc(eq ? eq.nom : 'Équipe') : 'Sur cet appareil'}</span><span class="grow"></span>
        ${!c.equipeId && Synchro.connecte() ? `<button class="btn sm" data-act="partager" data-id="${esc(c.id)}">${icone('share-2', 'sm')}Partager</button>` : ''}
        <button class="btn ghost icon sm" data-act="chantierEdit" data-id="${esc(c.id)}" aria-label="Modifier">${icone('pencil', 'sm')}</button>
        <button class="btn ghost icon sm" data-act="chantierSuppr" data-id="${esc(c.id)}" aria-label="Supprimer">${icone('trash-2', 'sm')}</button></div>
    </div>`;
  }).join('');
  return entete + `<div class="stack">
    <div class="card mini-stats">
      <div><div class="ms-lbl">${icone('briefcase', 'sm')}Chantiers</div><div class="ms-val">${db.chantiers.length}</div></div>
      <div><div class="ms-lbl">${icone('timer', 'sm')}Heures budgétées</div><div class="ms-val">${fmtCompact(totB)} h</div></div>
      <div><div class="ms-lbl">${icone('activity', 'sm')}Impact à date</div><div class="ms-val ${cls(totI)}">${signeE(totI)}</div></div>
      <div><div class="ms-lbl">${icone('trending-up', 'sm')}Impact projeté</div><div class="ms-val ${cls(totIP)}">${signeE(totIP)}</div></div>
    </div>
    <div class="projets">${cartes}</div></div>`;
}

/* =============================== Paramètres ============================== */
function vParametres() {
  const t = ui.paramTab;
  const nav = [['equipe', 'users', 'Équipe & synchronisation'], ['entreprise', 'landmark', 'Entreprise'], ['donnees', 'database', 'Données'], ['profil', 'user', 'Profil'], ['rappels', 'calendar-range', 'Rappels & agenda'], ['apparence', 'sun', 'Apparence'], ['apropos', 'info', 'À propos']];
  let corps = '';
  if (t === 'equipe') corps = vSynchro();
  if (t === 'rappels') corps = carteRappels();
  if (t === 'donnees') corps = `<div class="card"><div class="card-head"><h3>Importer</h3></div>
      <div class="set-row"><div class="s-txt"><b>BTE standard SMAC (.xlsx)</b><span>Synthèse, opérations de main d'œuvre (métrés, cadences) et suivi hebdomadaire déjà saisi.</span></div><button class="btn" data-act="importFichier">${icone('upload')}Choisir un fichier</button></div>
      <div class="set-row"><div class="s-txt"><b>Liste terrain (.csv / .xlsx)</b><span>Colonnes <code>Chantier;Zone;Lot;Tache;Fait;Observation</code> — « Support » accepté pour « Zone ».</span></div><button class="btn" data-act="importFichier">${icone('upload')}Choisir un fichier</button></div>
      <div class="set-row"><div class="s-txt"><b>Restaurer une sauvegarde (.json)</b><span>Remplace les données de cet appareil.</span></div><button class="btn" data-act="importFichier">${icone('upload')}Choisir un fichier</button></div></div>
    <div class="card" style="margin-top:16px"><div class="card-head"><h3>Exporter</h3></div>
      <div class="set-row"><div class="s-txt"><b>Sauvegarde complète</b><span>Tous les chantiers de cet appareil au format JSON.</span></div><button class="btn" data-act="exportJSON">${icone('download')}Télécharger</button></div>
      <div class="set-row"><div class="s-txt"><b>Chantier actif en Excel</b><span>BTE, avancement, suivi hebdo, terrain, journal et réserves.</span></div><button class="btn" data-act="exportExcel" ${ch() ? '' : 'disabled'}>${icone('file-spreadsheet')}Exporter</button></div>
      <div class="set-row"><div class="s-txt"><b>Rapport d'avancement PDF</b><span>Indicateurs, graphiques, phases, zones, réserves et journal.</span></div><button class="btn" data-act="rapportPDF" ${ch() ? '' : 'disabled'}>${icone('file-text')}Générer</button></div></div>
    <div class="card" style="margin-top:16px"><div class="card-head"><h3>Zone sensible</h3></div>
      <div class="set-row"><div class="s-txt"><b>Charger la démonstration</b><span>Ajoute le chantier du cas pratique CIGV.</span></div><button class="btn" data-act="demo">${icone('sparkles')}Ajouter la démo</button></div>
      <div class="set-row"><div class="s-txt"><b>Effacer les données de cet appareil</b><span>Les chantiers partagés restent en ligne et reviendront à la prochaine synchronisation.</span></div><button class="btn danger" data-act="toutEffacer">${icone('trash-2')}Effacer</button></div></div>`;
  if (t === 'entreprise') {
    const e = entreprise();
    corps = `<div class="card"><div class="set-row"><div class="row"><span class="kpi-ico" style="width:44px;height:44px">${icone('landmark', 'lg')}</span><div class="s-txt"><b>${esc(e.nom || 'Non renseignée')}</b><span>${esc([String(e.adresse || '').replace(/\n/g, ', '), e.siret && 'SIRET ' + e.siret].filter(Boolean).join(' · ') || 'Raison sociale, adresse et SIRET')}</span></div></div><button class="btn" data-act="entreprise">${icone('pencil')}Modifier</button></div>
      <div class="set-row"><div class="s-txt"><b>Utilisation</b><span>En-tête des situations de travaux transmises au maître d'œuvre et des bons de commande fournisseurs.</span></div></div></div>`;
  }
  if (t === 'profil') corps = `<div class="card"><div class="set-row"><div class="row"><span class="avatar" style="width:44px;height:44px;font-size:15px">${initiales(nomUser())}</span><div class="s-txt"><b>${esc(nomUser() || 'Non renseigné')}</b><span>${esc(user && user.role || '')}</span></div></div><button class="btn" data-act="identite">${icone('pencil')}Modifier</button></div>
      <div class="set-row"><div class="s-txt"><b>Utilisation du nom</b><span>Votre nom est enregistré sur les tâches cochées, le journal, les réserves et les check-lists.</span></div></div></div>`;
  if (t === 'apparence') {
    const th = document.documentElement.dataset.theme || 'auto';
    corps = `<div class="card"><div class="set-row"><div class="s-txt"><b>Thème</b><span>Clair, sombre ou selon le réglage de l'appareil.</span></div>
      <div class="seg">${[['auto', 'Automatique'], ['light', 'Clair'], ['dark', 'Sombre']].map(([v, l]) => `<button class="${th === v ? 'on' : ''}" data-act="theme" data-t="${v}">${l}</button>`).join('')}</div></div></div>`;
  }
  if (t === 'apropos') corps = `<div class="card"><div class="card-body"><div class="row" style="gap:14px;margin-bottom:14px"><div class="logo-mark" style="width:44px;height:44px">OS</div><div><h2>OmSmK</h2><div class="muted">Pilotage de chantiers d'étanchéité et de façade</div></div></div>
      <p class="muted">Méthode : budget technique d'exécution standard, cadences cibles et fichier de suivi hebdomadaire (Excellence Opérationnelle). Les écarts sont calculés comme dans le BTE standard : écart = heures budgétées × % réalisé − heures pointées.</p>
      <div class="sep"></div><p class="small muted">Fonctionne hors-ligne · données stockées sur l'appareil, synchronisées pour les chantiers partagés · bibliothèques : SheetJS, jsPDF, qrcodejs, supabase-js, icônes Lucide, police Inter.</p></div></div>`;
  return enTetePage({ eyebrow: 'Organisation', titre: 'Paramètres' }) + `<div class="settings-grid"><nav class="set-nav">${nav.map(([v, ic, l]) => `<button class="${t === v ? 'on' : ''}" data-act="paramTab" data-t="${v}">${icone(ic, 'sm')}${l}</button>`).join('')}</nav><div>${corps}</div></div>`;
}

function vSynchro() {
  if (!Synchro.disponible()) return `<div class="card">${vide('cloud-off', 'Synchronisation indisponible', 'La bibliothèque de synchronisation n\'a pas pu être chargée.')}</div>`;
  if (!Synchro.connecte()) {
    return `<div class="card"><div class="card-body">
      <div class="row" style="gap:14px;align-items:flex-start"><span class="kpi-ico" style="width:44px;height:44px">${icone('cloud', 'lg')}</span>
        <div class="grow"><h3>Travaillez en équipe</h3><p class="muted" style="margin-top:4px">Connectez-vous pour partager des chantiers avec votre équipe : le téléphone du chef de chantier et le PC du conducteur voient les mêmes données, mises à jour en direct.
          Sans réseau, l'application continue de fonctionner et envoie les saisies au retour de la connexion.</p>
          <button class="btn primary" style="margin-top:14px" data-act="syncConnexion">${icone('mail')}Se connecter avec mon e-mail</button></div></div></div></div>`;
  }
  const eqs = Synchro.equipes.map(e => {
    const nb = db.chantiers.filter(c => c.equipeId === e.id).length;
    return `<div class="set-row"><div class="row"><span class="kpi-ico">${icone('users')}</span><div class="s-txt"><b>${esc(e.nom)}</b><span>${nb} chantier(s) partagé(s) · ${e.role === 'admin' ? 'administrateur' : 'membre'}</span></div></div>
      <button class="btn" data-act="equipeGerer" data-id="${esc(e.id)}">${icone('users')}Membres</button></div>`;
  }).join('');
  return `<div class="card"><div class="card-head"><h3>${icone('cloud')}Synchronisation en ligne</h3>
      <div class="row"><button class="btn sm" data-act="syncMaintenant">${icone('refresh-cw', 'sm')}Synchroniser</button><button class="btn sm ghost" data-act="syncDeconnexion">${icone('log-out', 'sm')}Déconnexion</button></div></div>
    <div class="set-row"><div class="s-txt"><b>${esc(Synchro.email())}</b><span>${Synchro.derniere ? 'Dernière synchronisation à ' + Synchro.derniere.toLocaleTimeString('fr-FR') : 'Connecté'}</span></div>
      ${Synchro.etat === 'erreur' ? `<span class="badge neg">${icone('circle-alert')}${esc(Synchro.erreur)}</span>` : `<span class="badge pos dot">Actif</span>`}</div></div>
  <div class="card" style="margin-top:16px"><div class="card-head"><h3>Équipes</h3></div>
    ${eqs || '<div class="card-body muted">Vous ne faites partie d\'aucune équipe. Créez-en une, ou demandez à un administrateur de vous inviter avec cette adresse e-mail.</div>'}
    <div class="card-foot row"><input class="input grow" id="nouvelleEquipe" placeholder="Nom de la nouvelle équipe (ex : Agence Normandie — Étanchéité)"><button class="btn primary" data-act="equipeCreer">${icone('plus')}Créer</button></div></div>
  <p class="small muted" style="margin-top:12px">Pour partager un chantier : Portefeuille → bouton « Partager » du chantier.</p>`;
}

/* ================================ Modales ================================ */
function modalIdentite(verrou) {
  ouvrirModal(verrou ? 'Bienvenue sur OmSmK' : 'Votre profil', `
    ${verrou ? '<p class="muted" style="margin-bottom:16px">Indiquez votre nom : il sera associé à vos saisies (tâches validées, journal, réserves, check-lists).</p>' : ''}
    <div class="form-grid">${champ('idPrenom', 'Prénom', user && user.prenom, 'text', 'autocomplete="given-name"')}${champ('idNom', 'Nom', user && user.nom, 'text', 'autocomplete="family-name"')}</div>
    ${selectHTML('idRole', 'Fonction', ['Conducteur de travaux', 'Chargé d\'affaires', 'Chef de chantier', 'Chef d\'équipe', 'Compagnon', 'Direction', 'Autre'], user && user.role)}`,
    `<button class="btn primary" data-act="saveIdentite">${verrou ? 'Commencer' : 'Enregistrer'}</button>`, { verrou, icone: verrou ? 'hard-hat' : 'user', taille: 'narrow' });
}

function modalChantier(c) {
  const e = c || { metier: 'Étanchéité', support: 'Béton', tauxHoraire: REF.tauxHoraireDefaut, heuresJour: REF.heuresJourDefaut, conducteur: nomUser() };
  ouvrirModal(c ? 'Modifier le chantier' : 'Nouveau chantier', `
    <input type="hidden" id="chId" value="${esc(c ? c.id : '')}">
    <div class="form-section">Identification</div>
    ${champ('chNom', 'Nom du chantier *', e.nom, 'text', 'placeholder="ex : Résidence Les Tilleuls — Bât. A"')}
    <div class="form-grid">${champ('chClient', 'Client / maître d\'ouvrage', e.client)}${champ('chAdresse', 'Adresse', e.adresse)}
      ${selectHTML('chMetier', 'Métier', ['Étanchéité', 'Façade', 'Autre'], e.metier)}${selectHTML('chSupport', 'Support', ['Béton', 'Acier', 'Bois', 'Parpaing', 'Autre'], e.support)}
      ${champ('chImput', 'N° d\'imputation', e.imputation)}${champ('chAgence', 'Agence', e.agence)}</div>
    <div class="form-section">Équipe et planning</div>
    <div class="form-grid">${champ('chCdt', 'Conducteur de travaux', e.conducteur)}${champ('chChef', 'Chef de chantier', e.chef)}
      ${champ('chDebut', 'Date de début', e.dateDebut, 'date')}${champ('chFin', 'Date de fin prévue', e.dateFin, 'date')}</div>
    <div class="form-section">Économie</div>
    <div class="form-grid">${champ('chMarche', 'Montant marché HT (€)', e.marcheHT || '', 'number')}${champ('chMarge', 'Marge commerciale (%)', e.margeCommerciale ? Math.round(num(e.margeCommerciale) * 1000) / 10 : '', 'number', 'step="0.1"')}
      ${champ('chTaux', 'Taux horaire équipe (€/h)', e.tauxHoraire, 'number', 'step="0.5"')}${champ('chHj', 'Heures par journée', e.heuresJour, 'number', 'step="0.25"')}</div>`,
    `<button class="btn" data-act="fermerModal">Annuler</button><button class="btn primary" data-act="saveChantier">${c ? 'Enregistrer' : 'Créer le chantier'}</button>`, { icone: 'building-2' });
}

function phasesPour(c) {
  const std = Object.keys(REF.metiers[c.metier] || REF.metiers['Étanchéité']);
  return [...new Set([...std, ...deCh(db.ops).map(o => o.phase)])];
}

function modalOp(op) {
  const c = ch();
  const e = op || { unite: 'm²' };
  const ouvrages = [...new Set(deCh(db.ops).map(o => o.ouvrage))];
  const phases = phasesPour(c);
  const opsStd = [...new Set(Object.values(REF.metiers).flatMap(m => Object.values(m).flat()))];
  ouvrirModal(op ? 'Modifier l\'opération' : 'Nouvelle opération', `
    <input type="hidden" id="opId" value="${esc(op ? op.id : '')}">
    <datalist id="dlOuvrages">${ouvrages.map(o => `<option value="${esc(o)}">`).join('')}</datalist>
    <datalist id="dlOps">${opsStd.map(o => `<option value="${esc(o)}">`).join('')}</datalist>
    <div class="form-grid">${champ('opOuvrage', 'Complexe / ouvrage *', e.ouvrage || ouvrages[0] || '', 'text', 'list="dlOuvrages" placeholder="ex : Toiture A"')}${selectHTML('opPhase', 'Phase chantier', phases, e.phase || phases[0])}</div>
    ${champ('opOperation', 'Opération *', e.operation, 'text', 'list="dlOps"')}
    ${champ('opDesignation', 'Désignation / matériau', e.designation)}
    <div class="form-grid">${champ('opMetre', 'Métré / DGPF', num(e.metre) || '', 'number', 'step="any"')}${selectHTML('opUnite', 'Unité', ['m²', 'mL', 'U', 'h', 'forfait'], e.unite)}
      ${champ('opCadence', 'Cadence cible (u / jour / homme)', num(e.cadence) || '', 'number', 'step="any"')}${champ('opForfait', 'ou heures au forfait', num(e.heuresForfait) || '', 'number', 'step="any"')}</div>
    ${champ('opDevis', 'Devis main d\'œuvre hors marge (€)', num(e.devis) || '', 'number', 'step="any"')}`,
    `<button class="btn" data-act="fermerModal">Annuler</button><button class="btn primary" data-act="saveOp">Enregistrer</button>`, { icone: 'calculator' });
}

function modalBiblio() {
  const c = ch();
  const ouvrages = [...new Set(deCh(db.ops).map(o => o.ouvrage))];
  ouvrirModal('Cadences standard', `
    <div class="alert info" style="margin-bottom:16px">${icone('info')}<div>Cadences des simulateurs SMAC (journée de ${hjDe(c)} h). Le <b>coefficient chantier</b> pondère la cadence selon la surface, les émergences, la coactivité, la hauteur ou les exigences : 1,10 = 10 % plus lent.</div></div>
    <datalist id="dlOuvB">${ouvrages.map(o => `<option value="${esc(o)}">`).join('')}</datalist>
    <div class="form-grid">${champ('biOuvrage', 'Ajouter dans l\'ouvrage', ouvrages[0] || 'Ouvrage 1', 'text', 'list="dlOuvB"')}${champ('biMetre', 'Métré', '', 'number', 'step="any"')}
      ${champ('biCoef', 'Coefficient chantier', '1', 'number', 'step="0.01"')}
      <div class="field"><label class="label">Métier / support</label><div class="row" style="flex-wrap:nowrap">
        <select class="input" id="biMetier" data-change="biblioFiltre">${['Étanchéité', 'Façade'].map(m => `<option ${m === c.metier ? 'selected' : ''}>${m}</option>`).join('')}</select>
        <select class="input" id="biSupport" data-change="biblioFiltre">${['Tous supports', 'Béton', 'Acier', 'Parpaing'].map(s => `<option ${s === c.support ? 'selected' : ''}>${s}</option>`).join('')}</select></div></div></div>
    <div class="input-icon">${icone('search', 'sm')}<input class="input" id="biRecherche" placeholder="Rechercher : isolant, relevé, cassette…" data-input="biblioFiltre"></div>
    <div id="biListe" style="margin-top:12px;border:1px solid var(--border);border-radius:10px;max-height:46vh;overflow:auto"></div>`,
    `<button class="btn" data-act="fermerModal">Fermer</button>`, { taille: 'wide', icone: 'book-open', pasDeFocus: true });
  renderBiblio();
}
function renderBiblio() {
  const c = ch();
  const m = val('biMetier'), s = val('biSupport'), q = norm(val('biRecherche'));
  const hj = hjDe(c);
  const liste = REF.cadences.filter(x => x.m === m && (s === 'Tous supports' || x.s === 'Tous' || x.s === s) && (!q || norm(x.lib + ' ' + x.op + ' ' + x.phase).includes(q)));
  $('#biListe').innerHTML = `<table class="table"><thead><tr><th>Phase · opération</th><th>Désignation</th><th>Support</th><th class="num">Cadence</th><th></th></tr></thead><tbody>
    ${liste.map(x => `<tr><td><div class="strong">${esc(x.op)}</div><div class="sub">${esc(x.phase)}</div></td><td>${esc(x.lib)}</td><td class="muted">${esc(x.s)}</td>
      <td class="num"><b>${fmt(hj / x.h, 0)}</b> <span class="muted">${esc(x.u)}/j</span><div class="sub">${fmt(x.h, 3)} h/${esc(x.u)}</div></td>
      <td class="actions"><button class="btn sm primary" data-act="biblioAjout" data-i="${REF.cadences.indexOf(x)}">${icone('plus', 'sm')}Ajouter</button></td></tr>`).join('') || '<tr><td colspan="5" class="muted">Aucun résultat</td></tr>'}
  </tbody></table>`;
}

function modalJournal(j) {
  const e = j || { date: aujourdHui(), meteo: 'Beau', effectif: '', heures: '', intemperie: false, verifs: [] };
  if (!j) {
    // Effectif et heures repris du pointage du jour
    const pt = synthesePointage(db, ui.chantierId, e.date, e.date);
    if (pt.pointages.length) { e.effectif = pt.tot.presences; e.heures = pt.tot.heures; e.intemperie = pt.tot.intemp > 0; }
  }
  ouvrirModal(j ? 'Modifier l\'entrée' : 'Nouvelle entrée de journal', `
    <input type="hidden" id="jId" value="${esc(j ? j.id : '')}">
    <div class="form-grid">${champ('jDate', 'Date', e.date, 'date')}${selectHTML('jMeteo', 'Météo', REF.meteo, e.meteo)}
      ${champ('jEff', 'Effectif présent', e.effectif, 'number', 'min="0"')}${champ('jH', 'Heures travaillées (équipe)', e.heures, 'number', 'step="0.5" min="0"')}</div>
    <label class="checkbox field"><input type="checkbox" id="jIntemp" ${e.intemperie ? 'checked' : ''} data-change="jIntemp"><span><b>Arrêt ou perte pour intempérie</b></span></label>
    <div id="jIntempBloc" class="${e.intemperie ? '' : 'hidden'}">
      ${champ('jCause', 'Cause', e.cause, 'text', 'placeholder="pluie, vent, gel…"')}
      <div class="alert warn" style="margin-bottom:14px">${icone('triangle-alert')}<div><b>Avant de se déclarer en intempéries, vérifier :</b>
        ${REF.intemperies.map((it, i) => `<label class="checkbox" style="margin-top:8px"><input type="checkbox" class="jVerif" value="${i}" ${(e.verifs || []).includes(i) ? 'checked' : ''}><span class="small">${esc(it)}</span></label>`).join('')}</div></div>
    </div>
    ${zoneTexte('jTexte', 'Travaux réalisés, visites, événements', e.texte, 'rows="5"')}
    ${blocPhotosModal('journal', j ? j.id : '')}`,
    `<button class="btn" data-act="fermerModal">Annuler</button><button class="btn primary" data-act="saveJournal">Enregistrer</button>`, { icone: 'notebook-pen' });
  hydraterPhotos($('#modalRoot'));
}

function modalReserve(r) {
  const e = r || { origine: 'OPR', statut: 'ouverte' };
  ouvrirModal(r ? `Réserve ${numeroReserve(r)}` : 'Nouvelle réserve', `
    <input type="hidden" id="rId" value="${esc(r ? r.id : '')}">
    <datalist id="dlZones">${zonesDe(ui.chantierId).map(z => `<option value="${esc(z)}">`).join('')}</datalist>
    ${champ('rZone', 'Zone / localisation', e.zone, 'text', 'list="dlZones"')}
    ${zoneTexte('rDesc', 'Description *', e.description, 'rows="3"')}
    <div class="form-grid">${selectHTML('rOrigine', 'Origine', ['OPR', 'Autocontrôle', 'Visite CDT', 'Client / MOE', 'Bureau de contrôle', 'GPA'], e.origine)}${champ('rResp', 'Responsable', e.responsable)}</div>
    ${champ('rEch', 'Échéance de levée', e.echeance, 'date')}
    ${blocPhotosModal('reserve', r ? r.id : '')}`,
    `<button class="btn" data-act="fermerModal">Annuler</button><button class="btn primary" data-act="saveReserve">Enregistrer</button>`, { icone: 'circle-alert' });
  hydraterPhotos($('#modalRoot'));
}

function modalGenTaches() {
  const zones = zonesDe(ui.chantierId);
  ouvrirModal('Générer la liste zones × tâches', `
    <p class="muted" style="margin-bottom:16px">Chaque tâche est créée pour chaque zone ; les doublons existants sont ignorés. Zones : terrasses, façades, travées, supports, niveaux, logements…</p>
    <div class="form-grid">
      <div>${zoneTexte('gZones', 'Zones (une par ligne)', zones.join('\n'), 'rows="9" placeholder="Terrasse 01&#10;Terrasse 02"')}
        <div class="row small"><span class="muted">Série :</span><input class="input" id="gPref" style="width:80px;height:32px" placeholder="T"><span class="muted">de</span><input class="input" id="gDe" type="number" style="width:64px;height:32px" value="1"><span class="muted">à</span><input class="input" id="gA" type="number" style="width:64px;height:32px" value="10"><button class="btn sm" data-act="genSerie">${icone('plus', 'sm')}Ajouter</button></div></div>
      <div>${zoneTexte('gTaches', 'Tâches (une par ligne, « Lot | Tâche » possible)', '', 'rows="9" placeholder="Pare-vapeur | Vernis&#10;Hors d\'eau | Isolant"')}
        <button class="btn sm" data-act="genDepuisBTE" ${deCh(db.ops).length ? '' : 'disabled'}>${icone('calculator', 'sm')}Reprendre les opérations du BTE</button></div>
    </div>`,
    `<button class="btn" data-act="fermerModal">Annuler</button><button class="btn primary" data-act="genValider">Générer</button>`, { taille: 'wide', icone: 'list-checks' });
}

function modalConnexion() {
  const etape2 = !!Synchro.emailEnAttente;
  ouvrirModal('Connexion', `
    <p class="muted" style="margin-bottom:16px">Pas de mot de passe : vous recevez un e-mail de connexion.</p>
    ${champ('cxEmail', 'Adresse e-mail professionnelle', Synchro.emailEnAttente || '', 'email', 'autocomplete="email" placeholder="prenom.nom@entreprise.fr"')}
    <button class="btn primary block" data-act="syncEnvoyer">${icone('mail')}Recevoir l'e-mail de connexion</button>
    <div id="cxEtape2" class="${etape2 ? '' : 'hidden'}" style="margin-top:18px">
      <div class="alert info" style="margin-bottom:12px">${icone('info')}<div>Ouvrez l'e-mail <b>sur cet appareil</b> et touchez le lien — ou saisissez le code à 6 chiffres s'il figure dans le message.</div></div>
      <div class="row" style="flex-wrap:nowrap"><input class="input grow" id="cxCode" inputmode="numeric" autocomplete="one-time-code" placeholder="Code à 6 chiffres"><button class="btn" data-act="syncCode">Valider</button></div>
    </div>`, '', { icone: 'cloud', taille: 'narrow' });
}

async function modalEquipe(equipeId) {
  const eq = Synchro.equipes.find(e => e.id === equipeId);
  if (!eq) return;
  ouvrirModal(eq.nom, '<p class="muted">Chargement…</p>', `<button class="btn" data-act="fermerModal">Fermer</button>`, { pasDeFocus: true, icone: 'users', sousTitre: eq.role === 'admin' ? 'Vous êtes administrateur' : 'Vous êtes membre' });
  try {
    const { membres, invitations } = await Synchro.membres(equipeId);
    const admin = eq.role === 'admin';
    const moi = Synchro.session.user.id;
    const attente = invitations.filter(i => !i.acceptee_le);
    $('#modalRoot .modal-body').innerHTML = `
      <div class="form-section">Membres (${membres.length})</div>
      <div style="border:1px solid var(--border);border-radius:10px">${membres.map(m => `<div class="set-row" style="padding:10px 14px"><div class="row"><span class="avatar">${initiales(m.email)}</span><div class="s-txt"><b>${esc(m.email)}</b><span>${m.role === 'admin' ? 'Administrateur' : 'Membre'}${m.user_id === moi ? ' · vous' : ''}</span></div></div>
        ${(admin && m.user_id !== moi) || m.user_id === moi ? `<button class="btn sm danger" data-act="membreRetirer" data-eq="${esc(equipeId)}" data-u="${esc(m.user_id)}">${m.user_id === moi ? 'Quitter' : 'Retirer'}</button>` : ''}</div>`).join('')}</div>
      ${attente.length ? `<div class="form-section" style="margin-top:16px">Invitations en attente</div><div style="border:1px solid var(--border);border-radius:10px">${attente.map(i => `<div class="set-row" style="padding:10px 14px"><div class="row"><span class="avatar" style="background:var(--surface-3);color:var(--text-2)">${icone('mail', 'sm')}</span><div class="s-txt"><b>${esc(i.email)}</b><span>${i.role === 'admin' ? 'Administrateur' : 'Membre'} · en attente</span></div></div>
        ${admin ? `<button class="btn sm ghost" data-act="invitationAnnuler" data-eq="${esc(equipeId)}" data-email="${esc(i.email)}">Annuler</button>` : ''}</div>`).join('')}</div>` : ''}
      ${admin ? `<div class="form-section" style="margin-top:16px">Inviter une personne</div>
        <div class="row" style="flex-wrap:nowrap"><input class="input grow" id="invEmail" type="email" placeholder="e-mail de la personne">
          <select class="input" id="invRole" style="width:auto"><option value="membre">Membre</option><option value="admin">Administrateur</option></select>
          <button class="btn primary" data-act="equipeInviter" data-eq="${esc(equipeId)}">Inviter</button></div>
        <p class="small muted" style="margin-top:8px">La personne ouvre l'application, se connecte avec <b>cette adresse</b> et rejoint automatiquement l'équipe. Lien : <code>${esc(location.origin + location.pathname)}</code></p>` : ''}`;
  } catch (e) { $('#modalRoot .modal-body').innerHTML = `<div class="alert neg">${icone('circle-alert')}<div>${esc(e.message || e)}</div></div>`; }
}

function modalPartager(c) {
  const eqs = Synchro.equipes;
  if (!eqs.length) { ui.paramTab = 'equipe'; allerA('parametres'); return toast('Créez d\'abord une équipe.', 'alerte'); }
  ouvrirModal('Partager le chantier', `
    <p style="margin-bottom:14px">« <b>${esc(c.nom)}</b> » et toutes ses données (BTE, suivi, terrain, journal, réserves, check-lists) seront visibles et modifiables par les membres de l'équipe.</p>
    ${selectHTML('pgEquipe', 'Équipe', eqs.map(e => [e.id, e.nom]), eqs[0].id)}
    <input type="hidden" id="pgChantier" value="${esc(c.id)}">
    <p class="small muted">Un chantier partagé ne peut pas être déplacé vers une autre équipe.</p>`,
    `<button class="btn" data-act="fermerModal">Annuler</button><button class="btn primary" data-act="partagerValider">${icone('share-2')}Partager</button>`, { icone: 'share-2', taille: 'narrow' });
}

function popChantiers(ancre) {
  ouvrirPopover(ancre, `<div class="pop-search"><div class="input-icon">${icone('search', 'sm')}<input class="input" placeholder="Rechercher un chantier…" data-input="popChantiers"></div></div>
    <div class="pop-list" id="popListe"></div>
    <div class="pop-foot"><button class="pop-item" data-nav="portefeuille">${icone('briefcase')}<span class="pi-txt"><span class="pi-nom">Tous les chantiers</span></span></button>
      <button class="pop-item" data-act="chantierNew">${icone('plus')}<span class="pi-txt"><span class="pi-nom">Nouveau chantier</span></span></button></div>`, 300);
  renderPopChantiers();
}
function renderPopChantiers() {
  const inp = $('#popRoot input');
  const q = norm(inp ? inp.value : '');
  const box = $('#popListe');
  if (!box) return;
  box.innerHTML = db.chantiers.filter(c => !q || norm(c.nom + ' ' + (c.client || '')).includes(q)).map(c => {
    const st = statutChantier(c);
    return `<button class="pop-item ${c.id === ui.chantierId ? 'on' : ''}" data-act="chantierOuvrir" data-id="${esc(c.id)}">${icone(c.metier === 'Façade' ? 'layers' : 'building-2')}
      <span class="pi-txt"><span class="pi-nom">${esc(c.nom)}</span><span class="pi-sub">${esc(c.client || '—')} · ${st.txt}</span></span>${c.id === ui.chantierId ? icone('check', 'sm') : ''}</button>`;
  }).join('') || '<div class="small muted" style="padding:10px">Aucun chantier</div>';
}

function renderZonePicker() {
  const f = norm(val('zpFiltre'));
  const taches = deCh(db.taches);
  $('#zpListe').innerHTML = zonesDe(ui.chantierId).filter(z => !f || norm(z).includes(f)).map(z => {
    const ts = taches.filter(t => t.zone === z);
    const n = ts.filter(t => estFait(t.fait)).length;
    return `<button class="zone-item ${z === ui.zone ? 'active' : ''}" data-act="choisirZone" data-zone="${esc(z)}">
      <span class="zi-nom">${esc(z)}</span>${barre(ts.length ? n / ts.length : 0, n === ts.length ? 'pos' : '')}<span class="small muted" style="width:40px;text-align:right">${n}/${ts.length}</span></button>`;
  }).join('') || '<div class="muted">Aucune zone</div>';
}

/* ================================ Actions ================================ */
const erreurTxt = e => (e && e.message) || String(e);
const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

const ACT = {
  fermerModal,
  confirmOui: () => _repondreConfirmation(true),
  confirmNon: () => _repondreConfirmation(false),
  menuMobile: () => menuGeneral(),
  identite: () => modalIdentite(false),
  saveIdentite: () => {
    const prenom = val('idPrenom'), nom = val('idNom');
    if (!prenom && !nom) return toast('Indiquez au moins votre nom.', 'alerte');
    user = { prenom, nom: nom.toUpperCase(), role: val('idRole') };
    localStorage.setItem(USER_KEY, JSON.stringify(user));
    fermerModal(); render(); toast(`Bonjour ${prenom || nom}`, 'succes');
  },
  theme: el => {
    const t = el.dataset.t;
    if (t === 'auto') { delete document.documentElement.dataset.theme; localStorage.removeItem('omsmk_theme'); }
    else { document.documentElement.dataset.theme = t; localStorage.setItem('omsmk_theme', t); }
    render();
  },
  paramTab: el => { ui.paramTab = el.dataset.t; render(); },

  // Chantiers
  chantierNew: () => { fermerPopover(); modalChantier(null); },
  chantierEdit: (el, ev) => { ev.stopPropagation(); modalChantier(db.chantiers.find(c => c.id === el.dataset.id)); },
  chantierOuvrir: el => { ui.chantierId = el.dataset.id; ui.zone = null; fermerPopover(); allerA(VUES_SANS_CHANTIER.includes(ui.view) && ui.view !== 'journee' ? 'hubChantier' : ui.view); },
  chantierSuppr: async (el, ev) => {
    ev.stopPropagation();
    const c = db.chantiers.find(x => x.id === el.dataset.id);
    if (!c) return;
    const ok = await confirmer('Supprimer le chantier', `« <b>${esc(c.nom)}</b> » et toutes ses données seront définitivement supprimés.${c.equipeId ? '<br><br><b>Chantier partagé : il sera supprimé pour toute l\'équipe.</b>' : ''}`, { ok: 'Supprimer', danger: true });
    if (!ok) return;
    supprimerChantier(c.id); save(); render(); toast('Chantier supprimé', 'succes');
  },
  saveChantier: () => {
    const nom = val('chNom');
    if (!nom) return toast('Le nom du chantier est obligatoire.', 'alerte');
    const id = val('chId');
    const data = {
      nom, client: val('chClient'), adresse: val('chAdresse'), metier: val('chMetier'), support: val('chSupport'),
      imputation: val('chImput'), agence: val('chAgence'), conducteur: val('chCdt'), chef: val('chChef'),
      marcheHT: num(val('chMarche')), margeCommerciale: num(val('chMarge')) / 100, tauxHoraire: num(val('chTaux')),
      heuresJour: num(val('chHj')) || REF.heuresJourDefaut, dateDebut: val('chDebut'), dateFin: val('chFin')
    };
    if (data.dateDebut && data.dateFin && data.dateFin < data.dateDebut) return toast('La date de fin précède la date de début.', 'alerte');
    if (id) Object.assign(db.chantiers.find(c => c.id === id), data);
    else { const c = Object.assign({ id: uid(), creeLe: new Date().toISOString() }, data); db.chantiers.push(c); ui.chantierId = c.id; ui.view = 'bte'; }
    save(); fermerModal(); render(); toast(id ? 'Chantier enregistré' : 'Chantier créé', 'succes');
  },

  // Terrain
  terrainMode: el => { ui.terrainMode = el.dataset.mode; render(); },
  zoneNav: el => {
    const zs = zonesDe(ui.chantierId);
    const i = zs.indexOf(ui.zone) + Number(el.dataset.dir);
    if (i < 0 || i >= zs.length) return toast(i < 0 ? 'Première zone' : 'Dernière zone');
    ui.zone = zs[i]; ui.filtreTache = ''; render();
  },
  ouvrirZone: el => { ui.zone = el.dataset.zone; ui.terrainMode = 'liste'; render(); },
  zonePicker: () => {
    ouvrirModal('Choisir une zone', `<div class="input-icon">${icone('search', 'sm')}<input class="input" id="zpFiltre" placeholder="Rechercher une zone…" data-input="zpFiltre"></div><div class="zone-list" id="zpListe"></div>`, '', { icone: 'map-pin', taille: 'narrow' });
    renderZonePicker();
  },
  choisirZone: el => { ui.zone = el.dataset.zone; ui.filtreTache = ''; fermerModal(); render(); },
  cocherZone: el => {
    const v = el.dataset.v === '1';
    deCh(db.taches).filter(t => t.zone === ui.zone).forEach(t => marquer(t, v));
    save(); renderListeTaches();
  },
  toggleCell: el => { const t = db.taches.find(x => x.id === el.dataset.id); if (t) { marquer(t, !estFait(t.fait)); save(); render(); } },
  tacheSuppr: async el => {
    const t = db.taches.find(x => x.id === el.dataset.id);
    if (!t || !await confirmer('Supprimer la tâche', `« <b>${esc(t.tache)}</b> » — ${esc(t.zone)}`, { ok: 'Supprimer', danger: true })) return;
    db.taches = db.taches.filter(x => x !== t); save(); render();
  },
  tacheAjout: () => ouvrirModal('Travail non prévu', `
      ${champ('taIntitule', 'Intitulé *', '', 'text', 'placeholder="ex : Reprise de relevé suite à dégradation"')}
      ${champ('taLot', 'Lot / phase', '')}
      <label class="checkbox"><input type="checkbox" id="taFait" checked><span>Déjà réalisé</span></label>`,
    `<button class="btn" data-act="fermerModal">Annuler</button><button class="btn primary" data-act="saveTacheAjout">Ajouter</button>`, { icone: 'plus', sousTitre: 'Zone : ' + esc(ui.zone), taille: 'narrow' }),
  saveTacheAjout: () => {
    const intitule = val('taIntitule');
    if (!intitule) return toast('Saisissez un intitulé.', 'alerte');
    const t = { id: uid(), chantierId: ui.chantierId, zone: ui.zone, lot: val('taLot'), tache: intitule, fait: false, faitLe: '', faitPar: '', obs: '', ajout: true };
    marquer(t, $('#taFait').checked);
    db.taches.push(t); save(); fermerModal(); render(); toast('Travail ajouté', 'succes');
  },
  copierRecap: async () => {
    const auj = aujourdHui();
    const faites = deCh(db.taches).filter(t => estFait(t.fait) && t.faitLe === auj);
    if (!faites.length) return toast('Aucune tâche validée aujourd\'hui.');
    const parZone = {};
    faites.forEach(t => (parZone[t.zone] = parZone[t.zone] || []).push(t));
    let txt = `${ch().nom} — travaux du ${fmtDate(auj)}${nomUser() ? ' (' + nomUser() + ')' : ''}\n\n`;
    Object.entries(parZone).forEach(([z, ts]) => { txt += `${z}\n` + ts.map(t => `- ${t.tache}${t.obs ? ' (obs. : ' + t.obs + ')' : ''}`).join('\n') + '\n\n'; });
    try { await navigator.clipboard.writeText(txt.trim()); toast('Récapitulatif copié — collez-le dans un message', 'succes'); }
    catch (_e) { ouvrirModal('Récapitulatif du jour', `<textarea class="input" rows="12">${esc(txt.trim())}</textarea>`, '', { icone: 'copy' }); }
  },
  genTaches: () => modalGenTaches(),
  genSerie: () => {
    const p = $('#gPref').value, de = num($('#gDe').value), a = num($('#gA').value);
    if (a < de || a - de > 500) return toast('Série invalide', 'alerte');
    const largeur = String(a).length;
    const lignes = [];
    for (let i = de; i <= a; i++) lignes.push(p + String(i).padStart(largeur, '0'));
    const ta = $('#gZones');
    ta.value = (ta.value.trim() ? ta.value.trim() + '\n' : '') + lignes.join('\n');
  },
  genDepuisBTE: () => { $('#gTaches').value = [...new Set(deCh(db.ops).map(o => `${o.phase} | ${o.operation}`))].join('\n'); },
  genValider: () => {
    const zones = [...new Set($('#gZones').value.split('\n').map(s => s.trim()).filter(Boolean))];
    const taches = $('#gTaches').value.split('\n').map(s => s.trim()).filter(Boolean).map(l => {
      const p = l.split('|'); return p.length > 1 ? { lot: p[0].trim(), tache: p.slice(1).join('|').trim() } : { lot: '', tache: l };
    });
    if (!zones.length || !taches.length) return toast('Renseignez au moins une zone et une tâche.', 'alerte');
    const exist = new Set(deCh(db.taches).map(t => t.zone + '||' + t.tache));
    let n = 0;
    zones.forEach(z => taches.forEach(t => {
      if (exist.has(z + '||' + t.tache)) return;
      db.taches.push({ id: uid(), chantierId: ui.chantierId, zone: z, lot: t.lot, tache: t.tache, fait: false, faitLe: '', faitPar: '', obs: '', ajout: false });
      n++;
    }));
    save(); fermerModal(); ui.view = 'terrain'; render(); toast(`${n} tâche(s) créée(s)`, 'succes');
  },

  // Suivi
  semNav: el => { const d = Number(el.dataset.d); ui.semaine = d === 0 ? lundi(aujourdHui()) : addDays(ui.semaine, d); render(); },
  allerSemaine: el => { ui.semaine = el.dataset.s; render(); scrollTo(0, 0); },
  suiviQte: el => {
    const o = el.dataset.o, p = el.dataset.p;
    const ph = phasesBTE(db, ui.chantierId).find(x => x.ouvrage === o && x.phase === p);
    ouvrirModal('Avancement depuis les quantités', `
      <div class="form-grid">${champ('qFait', 'Quantité réalisée (cumul)', '', 'number', 'step="any"')}${champ('qTotal', `Quantité totale ${ph && ph.unite ? '(' + esc(ph.unite) + ')' : ''}`, ph ? ph.metreMax : '', 'number', 'step="any"')}</div>
      <input type="hidden" id="qO" value="${esc(o)}"><input type="hidden" id="qP" value="${esc(p)}">`,
      `<button class="btn" data-act="fermerModal">Annuler</button><button class="btn primary" data-act="suiviQteOk">Appliquer</button>`, { icone: 'ruler', sousTitre: `${esc(o)} · ${esc(p)}`, taille: 'narrow' });
  },
  suiviQteOk: () => {
    const f = num(val('qFait')), t = num(val('qTotal'));
    if (t <= 0) return toast('Quantité totale invalide', 'alerte');
    majSuivi(val('qO'), val('qP'), { pct: Math.min(1, f / t) });
    fermerModal(); render();
  },

  // BTE
  opNew: () => modalOp(null),
  opEdit: el => modalOp(db.ops.find(o => o.id === el.dataset.id)),
  opSuppr: async el => {
    const op = db.ops.find(o => o.id === el.dataset.id);
    if (!op || !await confirmer('Supprimer l\'opération', `« <b>${esc(op.operation)}</b> » — ${esc(op.ouvrage)}`, { ok: 'Supprimer', danger: true })) return;
    db.ops = db.ops.filter(o => o !== op); save(); render();
  },
  saveOp: () => {
    const ouvrage = val('opOuvrage'), operation = val('opOperation');
    if (!ouvrage || !operation) return toast('Ouvrage et opération sont obligatoires.', 'alerte');
    const id = val('opId');
    const data = {
      ouvrage, phase: val('opPhase'), operation, designation: val('opDesignation'), metre: num(val('opMetre')), unite: val('opUnite'),
      cadence: num(val('opCadence')), heuresForfait: num(val('opForfait')), devis: num(val('opDevis'))
    };
    if (id) Object.assign(db.ops.find(o => o.id === id), data);
    else insererOp(Object.assign({ id: uid(), chantierId: ui.chantierId }, data));
    save(); fermerModal(); render(); toast('Opération enregistrée', 'succes');
  },
  biblio: () => modalBiblio(),
  biblioAjout: el => {
    const x = REF.cadences[Number(el.dataset.i)];
    const c = ch();
    const coef = num(val('biCoef')) || 1;
    const ouvrage = val('biOuvrage') || 'Ouvrage 1';
    const cadence = x.h > 0 ? hjDe(c) / (x.h * coef) : 0;
    insererOp({ id: uid(), chantierId: c.id, ouvrage, phase: x.phase, operation: x.op, designation: x.lib, metre: num(val('biMetre')), unite: x.u, cadence: Math.round(cadence * 100) / 100, heuresForfait: 0, devis: 0 });
    save(); render(); toast(`« ${x.op} » ajouté à ${ouvrage}`, 'succes');
  },

  // Journal
  journalNew: () => modalJournal(null),
  journalEdit: el => modalJournal(db.journal.find(j => j.id === el.dataset.id)),
  journalSuppr: async el => {
    if (!await confirmer('Supprimer l\'entrée', 'Cette entrée du journal sera supprimée.', { ok: 'Supprimer', danger: true })) return;
    supprimerPhotosDe('journal', el.dataset.id);
    db.journal = db.journal.filter(j => j.id !== el.dataset.id); save(); render();
  },
  saveJournal: () => {
    const id = val('jId');
    const data = {
      date: val('jDate') || aujourdHui(), meteo: val('jMeteo'), effectif: num(val('jEff')), heures: num(val('jH')),
      intemperie: $('#jIntemp').checked, cause: val('jCause'), verifs: $$('.jVerif').filter(x => x.checked).map(x => Number(x.value)), texte: val('jTexte')
    };
    let cible = id;
    if (id) Object.assign(db.journal.find(j => j.id === id), data);
    else { cible = uid(); db.journal.push(Object.assign({ id: cible, chantierId: ui.chantierId, auteur: nomUser() }, data)); }
    save(); fermerModal(); render(); toast('Journal enregistré', 'succes');
    validerPhotosAttente('journal', cible);
  },

  // Qualité
  qTab: el => { ui.qualiteTab = el.dataset.t; render(); },
  journalTab: el => { ui.journalTab = el.dataset.t; render(); },
  resFiltre: el => { ui.reserveFiltre = el.dataset.f; render(); },
  resNew: () => modalReserve(null),
  resEdit: el => modalReserve(db.reserves.find(r => r.id === el.dataset.id)),
  resSuppr: async el => {
    const r = db.reserves.find(x => x.id === el.dataset.id);
    if (!r || !await confirmer(`Supprimer la réserve ${numeroReserve(r)}`, esc(r.description), { ok: 'Supprimer', danger: true })) return;
    supprimerPhotosDe('reserve', r.id);
    db.reserves = db.reserves.filter(x => x !== r); save(); render();
  },
  resLever: el => {
    const r = db.reserves.find(x => x.id === el.dataset.id);
    if (!r) return;
    if (r.statut === 'levée') { r.statut = 'ouverte'; r.leveeLe = ''; } else { r.statut = 'levée'; r.leveeLe = aujourdHui(); r.leveePar = nomUser(); }
    save(); render(); toast(r.statut === 'levée' ? `Réserve ${numeroReserve(r)} levée` : `Réserve ${numeroReserve(r)} rouverte`, 'succes');
  },
  saveReserve: () => {
    const description = val('rDesc');
    if (!description) return toast('Décrivez la réserve.', 'alerte');
    const id = val('rId');
    const data = { zone: val('rZone'), description, origine: val('rOrigine'), responsable: val('rResp'), echeance: val('rEch') };
    let cible = id;
    if (id) Object.assign(db.reserves.find(r => r.id === id), data);
    else { cible = uid(); db.reserves.push(Object.assign({ id: cible, chantierId: ui.chantierId, statut: 'ouverte', creeLe: aujourdHui(), creePar: nomUser(), leveeLe: '' }, data)); }
    save(); fermerModal(); render(); toast('Réserve enregistrée', 'succes');
    validerPhotosAttente('reserve', cible);
  },

  // Synchronisation
  syncPill: () => { if (Synchro.connecte()) { ui.paramTab = 'equipe'; allerA('parametres'); } else modalConnexion(); },
  syncConnexion: () => modalConnexion(),
  syncEnvoyer: async el => {
    const email = val('cxEmail');
    if (!EMAIL_RE.test(email)) return toast('Adresse e-mail invalide', 'alerte');
    el.disabled = true;
    try { await Synchro.demanderCode(email); $('#cxEtape2').classList.remove('hidden'); toast('E-mail envoyé à ' + email, 'succes'); }
    catch (e) { toast(erreurTxt(e), 'erreur'); }
    el.disabled = false;
  },
  syncCode: async () => {
    const code = val('cxCode');
    if (!/^\d{6,10}$/.test(code)) return toast('Code invalide', 'alerte');
    try { await Synchro.verifierCode(code); fermerModal(); toast('Connecté', 'succes'); }
    catch (e) { toast(erreurTxt(e), 'erreur'); }
  },
  syncDeconnexion: async () => {
    if (!await confirmer('Se déconnecter', 'Les chantiers partagés restent sur cet appareil mais ne seront plus synchronisés.', { ok: 'Se déconnecter', icone: 'log-out' })) return;
    await Synchro.deconnecter(); render();
  },
  syncMaintenant: () => { Synchro.planifier(0); toast('Synchronisation lancée'); },
  equipeCreer: async () => {
    const nom = val('nouvelleEquipe');
    if (!nom) return toast('Donnez un nom à l\'équipe', 'alerte');
    try { await Synchro.creerEquipe(nom); render(); toast(`Équipe « ${nom} » créée`, 'succes'); }
    catch (e) { toast(erreurTxt(e), 'erreur'); }
  },
  equipeGerer: el => modalEquipe(el.dataset.id),
  equipeInviter: async el => {
    const email = val('invEmail').toLowerCase();
    if (!EMAIL_RE.test(email)) return toast('Adresse e-mail invalide', 'alerte');
    try { await Synchro.inviter(el.dataset.eq, email, val('invRole')); toast(`${email} invité(e)`, 'succes'); modalEquipe(el.dataset.eq); }
    catch (e) { toast(/duplicate/i.test(erreurTxt(e)) ? 'Cette personne est déjà invitée' : erreurTxt(e), 'erreur'); }
  },
  invitationAnnuler: async el => {
    try { await Synchro.annulerInvitation(el.dataset.eq, el.dataset.email); modalEquipe(el.dataset.eq); }
    catch (e) { toast(erreurTxt(e), 'erreur'); }
  },
  membreRetirer: async el => {
    const moi = el.dataset.u === Synchro.session.user.id;
    const eqId = el.dataset.eq, uidM = el.dataset.u;
    const ok = await confirmer(moi ? 'Quitter l\'équipe' : 'Retirer le membre', moi ? 'Les chantiers de l\'équipe resteront sur cet appareil sans être synchronisés.' : 'Cette personne n\'aura plus accès aux chantiers de l\'équipe.', { ok: moi ? 'Quitter' : 'Retirer', danger: true });
    if (!ok) return modalEquipe(eqId);
    try {
      await Synchro.retirerMembre(eqId, uidM);
      if (moi) {
        db.chantiers.filter(c => c.equipeId === eqId).forEach(c => { delete c.equipeId; });
        Synchro.oublierEtat(eqId); enregistrerLocal();
        await Synchro.chargerEquipes(); render();
      } else modalEquipe(eqId);
    } catch (e) { toast(erreurTxt(e), 'erreur'); }
  },
  partager: (el, ev) => { ev.stopPropagation(); modalPartager(db.chantiers.find(c => c.id === el.dataset.id)); },
  partagerValider: () => {
    const c = db.chantiers.find(x => x.id === val('pgChantier'));
    const eq = Synchro.equipes.find(e => e.id === val('pgEquipe'));
    if (!c || !eq) return;
    c.equipeId = eq.id;
    save(); fermerModal(); render(); toast(`« ${c.nom} » partagé avec ${eq.nom}`, 'succes');
  },

  // QR
  scanQR: () => lancerScan(),
  qrEtiquettes: () => etiquettesQR(),
  imprimer: () => print(),

  // Données
  importFichier: () => choisirFichier(),
  exportJSON: () => { telecharger(`omsmk_sauvegarde_${aujourdHui()}.json`, JSON.stringify(db, null, 1), 'application/json'); toast('Sauvegarde téléchargée', 'succes'); },
  exportExcel: () => exporterExcel(),
  rapportPDF: () => rapportPDF(),
  demo: () => {
    const d = construireDemo(lundi(aujourdHui()));
    db.chantiers.push(d.chantier); db.ops.push(...d.ops); db.suivi.push(...d.suivi); db.taches.push(...d.taches);
    db.journal.push(...d.journal); db.reserves.push(...d.reserves); Object.assign(db.checklists, d.checklists);
    db.postes.push(...d.postes); db.situations.push(...d.situations); db.commandes.push(...d.commandes);
    db.compagnons.push(...d.compagnons); db.pointages.push(...d.pointages);
    ['contacts', 'reunions', 'actions', 'securite'].forEach(k => db[k].push(...(d[k] || [])));
    ui.chantierId = d.chantier.id; ui.zone = null; ui.semaine = lundi(aujourdHui());
    save(); allerA('tableau'); toast('Démonstration chargée', 'succes');
  },
  toutEffacer: async () => {
    if (!await confirmer('Effacer toutes les données', 'Toutes les données de cet appareil seront supprimées. Les chantiers partagés restent en ligne et reviendront à la prochaine synchronisation. Pensez à exporter une sauvegarde.', { ok: 'Tout effacer', danger: true })) return;
    Synchro.oublierEtat();
    db = dbVide(); ui.chantierId = null; save(); render(); toast('Données effacées', 'succes');
  }
};

const CHG = {
  toggleTache: el => { const t = db.taches.find(x => x.id === el.dataset.id); if (t) { marquer(t, el.checked); save(); renderListeTaches(); } },
  obsTache: el => { const t = db.taches.find(x => x.id === el.dataset.id); if (t) { t.obs = el.value.trim(); save(); } },
  suiviPct: el => { const v = el.value.trim(); majSuivi(el.dataset.o, el.dataset.p, { pct: v === '' ? null : Math.max(0, Math.min(100, num(v))) / 100 }); render(); },
  suiviH: el => { majSuivi(el.dataset.o, el.dataset.p, { heures: Math.max(0, num(el.value)) }); render(); },
  semDate: el => { if (el.value) { ui.semaine = lundi(el.value); render(); } },
  opField: el => { const op = db.ops.find(o => o.id === el.dataset.id); if (op) { op[el.dataset.f] = num(el.value); save(); render(); } },
  chField: el => { const c = ch(); c[el.dataset.f] = num(el.value); save(); render(); },
  equipe: el => { ui.equipe = Math.max(1, num(el.value)); render(); },
  biblioFiltre: () => renderBiblio(),
  jIntemp: el => $('#jIntempBloc').classList.toggle('hidden', !el.checked),
  clToggle: el => {
    const cid = ui.chantierId, l = el.dataset.l, k = el.dataset.k;
    db.checklists[cid] = db.checklists[cid] || {};
    db.checklists[cid][l] = db.checklists[cid][l] || {};
    if (el.checked) db.checklists[cid][l][k] = { date: aujourdHui(), par: nomUser() };
    else delete db.checklists[cid][l][k];
    save(); render();
  }
};

const INP = {
  filtreTache: el => { ui.filtreTache = el.value; renderListeTaches(); },
  zpFiltre: () => renderZonePicker(),
  biblioFiltre: () => renderBiblio(),
  popChantiers: () => renderPopChantiers()
};

/* ============================ Helpers d'action =========================== */
function marquer(t, fait) {
  const deja = estFait(t.fait);
  t.fait = !!fait;
  if (fait && !deja) { t.faitLe = aujourdHui(); t.faitPar = nomUser(); }
  if (!fait) { t.faitLe = ''; t.faitPar = ''; }
}

function majSuivi(ouvrage, phase, champs) {
  const cid = ui.chantierId, sem = ui.semaine;
  let e = db.suivi.find(s => s.chantierId === cid && s.semaine === sem && s.ouvrage === ouvrage && s.phase === phase);
  // Identifiant déterministe : deux appareils saisissant la même phase la même semaine modifient la même saisie
  if (!e) { e = { id: `s|${cid}|${sem}|${empreinte(ouvrage + '|' + phase)}`, chantierId: cid, semaine: sem, ouvrage, phase, pct: null, heures: 0 }; db.suivi.push(e); }
  Object.assign(e, champs);
  if ((e.pct === null || e.pct === undefined) && !num(e.heures)) db.suivi = db.suivi.filter(s => s !== e);
  save();
}

function insererOp(op) {
  let idx = -1;
  db.ops.forEach((o, i) => { if (o.chantierId === op.chantierId && o.ouvrage === op.ouvrage && o.phase === op.phase) idx = i; });
  if (idx < 0) db.ops.forEach((o, i) => { if (o.chantierId === op.chantierId && o.ouvrage === op.ouvrage) idx = i; });
  if (idx < 0) db.ops.push(op); else db.ops.splice(idx + 1, 0, op);
}

function supprimerChantier(cid) {
  db.chantiers = db.chantiers.filter(c => c.id !== cid);
  ['ops', 'suivi', 'taches', 'journal', 'reserves', 'postes', 'situations', 'commandes', 'compagnons', 'pointages', 'contacts', 'reunions', 'actions', 'securite', 'photos', 'pvs'].forEach(k => { db[k] = (db[k] || []).filter(x => x.chantierId !== cid); });
  delete db.checklists[cid];
  if (ui.chantierId === cid) ui.chantierId = db.chantiers[0] ? db.chantiers[0].id : null;
}
