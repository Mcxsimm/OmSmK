/* ==========================================================================
   OmSmK — fonctions de calcul pures (sans DOM), partagées par l'application
   et les tests automatisés (tests/).
   ========================================================================== */
// deno-lint-ignore-file no-unused-vars
'use strict';

const num = v => {
  if (v === null || v === undefined || v === '') return 0;
  if (typeof v === 'number') return isFinite(v) ? v : 0;
  const n = parseFloat(String(v).replace(/\s/g, '').replace(',', '.'));
  return isFinite(n) ? n : 0;
};
const estFait = v => v === true || ['vrai', 'true', '1', 'oui', 'x', 'ok', 'fait'].includes(String(v ?? '').toLowerCase().trim());
const norm = s => String(s ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();

function isoLocal(d) { return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10); }
function aujourdHui() { return isoLocal(new Date()); }
function addDays(s, n) { const d = new Date(s + 'T00:00:00'); d.setDate(d.getDate() + n); return isoLocal(d); }
function lundi(s) { const d = new Date(s + 'T00:00:00'); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); return isoLocal(d); }
function semISO(s) {
  const d = new Date(s + 'T00:00:00');
  d.setDate(d.getDate() + 3 - ((d.getDay() + 6) % 7));
  const w1 = new Date(d.getFullYear(), 0, 4);
  return 1 + Math.round(((d - w1) / 86400000 - 3 + ((w1.getDay() + 6) % 7)) / 7);
}

const HEURES_JOUR_DEFAUT = 7.5;
const hjDe = c => num(c && c.heuresJour) || HEURES_JOUR_DEFAUT;

// Heures budgétées d'une opération : métré / cadence (u/j/homme) x heures par jour, sinon forfait
function heuresOp(op, c) {
  if (num(op.cadence) > 0 && num(op.metre) > 0) return num(op.metre) / num(op.cadence) * hjDe(c);
  return num(op.heuresForfait);
}

// Couples ouvrage / phase issus du BTE, dans l'ordre d'apparition, avec heures budgétées
function phasesBTE(base, cid) {
  const c = base.chantiers.find(x => x.id === cid);
  const map = new Map();
  base.ops.filter(o => o.chantierId === cid).forEach(op => {
    const k = op.ouvrage + '||' + op.phase;
    if (!map.has(k)) map.set(k, { ouvrage: op.ouvrage, phase: op.phase, budget: 0, metreMax: 0, unite: '' });
    const p = map.get(k);
    p.budget += heuresOp(op, c);
    if (num(op.metre) > p.metreMax) { p.metreMax = num(op.metre); p.unite = op.unite; }
  });
  return [...map.values()];
}

/* Indicateurs du fichier de suivi standard SMAC (Étape 2) :
   écart h à date  = heures budgétées x % réalisé - heures pointées (si heures pointées > 0)
   impact €        = écart h x taux horaire
   écart projeté   = écart h / % réalisé            (extrapolation à 100 %) */
function calcSuivi(base, cid, jusqua) {
  const c = base.chantiers.find(x => x.id === cid);
  const taux = num(c && c.tauxHoraire);
  const entrees = entreesSuivi(base, cid).filter(s => !jusqua || s.semaine <= jusqua).sort((a, b) => a.semaine.localeCompare(b.semaine));
  const phases = phasesBTE(base, cid);
  const cles = new Set(phases.map(p => p.ouvrage + '||' + p.phase));
  // Heures pointées sur une phase absente du BTE (ou non ventilées) : coût réel sans avancement associé
  const horsBTE = entrees.filter(s => !cles.has(s.ouvrage + '||' + s.phase)).reduce((t, s) => t + num(s.heures), 0);
  const rows = phases.map(p => {
    const es = entrees.filter(s => s.ouvrage === p.ouvrage && s.phase === p.phase);
    let pct = 0;
    es.forEach(s => { if (s.pct !== null && s.pct !== undefined && s.pct !== '') pct = num(s.pct); });
    const heures = es.reduce((t, s) => t + num(s.heures), 0);
    const ecartH = heures === 0 ? 0 : p.budget * pct - heures;
    const ecartProj = pct > 0 ? ecartH / pct : 0;
    return Object.assign({}, p, { pct, heures, gagnees: p.budget * pct, ecartH, impact: ecartH * taux, ecartProj, impactProj: ecartProj * taux });
  });
  const tot = rows.reduce((t, r) => {
    t.budget += r.budget; t.heures += r.heures; t.gagnees += r.gagnees; t.ecartH += r.ecartH;
    t.impact += r.impact; t.ecartProj += r.ecartProj; t.impactProj += r.impactProj; return t;
  }, { budget: 0, heures: 0, gagnees: 0, ecartH: 0, impact: 0, ecartProj: 0, impactProj: 0 });
  tot.pct = tot.budget > 0 ? tot.gagnees / tot.budget : 0;
  // Comme le fichier SMAC : projection globale = écart total / avancement global
  tot.ecartProj = tot.pct > 0 ? tot.ecartH / tot.pct : 0;
  tot.impactProj = tot.ecartProj * taux;
  tot.horsBTE = horsBTE;
  return { rows, tot, taux };
}

/* ============================ Pointage journalier ============================
   Un pointage = un compagnon, un jour : statut, heures ventilées par phase du BTE,
   heures d'intempéries, panier. Les heures des compagnons présents alimentent le
   suivi hebdomadaire (elles s'ajoutent aux heures saisies manuellement). */
const STATUTS_POINTAGE = [
  ['present', 'Présent', 'P'], ['intemperie', 'Intempéries', 'I'], ['conge', 'Congés', 'CP'],
  ['maladie', 'Maladie', 'M'], ['formation', 'Formation', 'F'], ['absent', 'Absent', 'A']
];
const QUALIFICATIONS = ['Chef de chantier', 'Chef d\'équipe', 'Compagnon', 'Ouvrier', 'Apprenti', 'Intérimaire'];

const heuresPointage = p => p && p.statut === 'present' ? (p.lignes || []).reduce((t, l) => t + num(l.h), 0) : 0;
const intempPointage = p => !p ? 0 : num(p.intemp);
const idPointage = (cid, date, compagnonId) => `p|${cid}|${date}|${compagnonId}`;

function pointagesDe(base, cid, du, au) {
  return (base.pointages || []).filter(p => p.chantierId === cid && (!du || p.date >= du) && (!au || p.date <= au))
    .sort((a, b) => a.date.localeCompare(b.date));
}

// Heures pointées regroupées par semaine et par phase, sous forme de saisies de suivi (sans %)
function suiviDepuisPointages(base, cid) {
  const m = new Map();
  pointagesDe(base, cid).forEach(p => {
    if (p.statut !== 'present') return;
    const sem = lundi(p.date);
    (p.lignes || []).forEach(l => {
      if (!num(l.h)) return;
      const k = sem + '||' + (l.ouvrage || '') + '||' + (l.phase || '');
      if (!m.has(k)) m.set(k, { id: 'pt|' + k, chantierId: cid, semaine: sem, ouvrage: l.ouvrage || '', phase: l.phase || '', pct: null, heures: 0, source: 'pointage' });
      m.get(k).heures += num(l.h);
    });
  });
  return [...m.values()];
}

// Saisies du suivi : % et heures saisis à la semaine + heures issues du pointage journalier
function entreesSuivi(base, cid) {
  return base.suivi.filter(s => s.chantierId === cid).concat(suiviDepuisPointages(base, cid));
}

// Synthèse d'une période (jour ou semaine) : par compagnon et par phase
function synthesePointage(base, cid, du, au) {
  const pts = pointagesDe(base, cid, du, au);
  const parCompagnon = {};
  const parPhase = new Map();
  const tot = { heures: 0, intemp: 0, paniers: 0, presences: 0, absences: 0 };
  pts.forEach(p => {
    const h = heuresPointage(p), hi = intempPointage(p);
    const cp = parCompagnon[p.compagnonId] = parCompagnon[p.compagnonId] || { heures: 0, intemp: 0, paniers: 0, jours: 0 };
    cp.heures += h; cp.intemp += hi;
    if (p.panier) { cp.paniers++; tot.paniers++; }
    if (p.statut === 'present') { cp.jours++; tot.presences++; } else if (p.statut !== 'intemperie') tot.absences++;
    tot.heures += h; tot.intemp += hi;
    if (p.statut === 'present') (p.lignes || []).forEach(l => {
      const k = (l.ouvrage || '') + '||' + (l.phase || '');
      if (!parPhase.has(k)) parPhase.set(k, { ouvrage: l.ouvrage || '', phase: l.phase || '', heures: 0 });
      parPhase.get(k).heures += num(l.h);
    });
  });
  return { pointages: pts, parCompagnon, parPhase: [...parPhase.values()], tot };
}

function statsTerrain(base, cid) {
  const t = base.taches.filter(x => x.chantierId === cid);
  const faites = t.filter(x => estFait(x.fait)).length;
  return { total: t.length, faites, pct: t.length ? faites / t.length : 0 };
}


function parseCSV(txt) {
  txt = txt.replace(/^﻿/, '');
  const premiere = txt.split(/\r?\n/)[0] || '';
  const delim = [';', '\t', ','].map(d => [d, premiere.split(d).length]).sort((a, b) => b[1] - a[1])[0][0];
  const rows = []; let row = [], cur = '', q = false;
  for (let i = 0; i < txt.length; i++) {
    const ch_ = txt[i];
    if (q) {
      if (ch_ === '"') { if (txt[i + 1] === '"') { cur += '"'; i++; } else q = false; }
      else cur += ch_;
    } else if (ch_ === '"') q = true;
    else if (ch_ === delim) { row.push(cur); cur = ''; }
    else if (ch_ === '\n' || ch_ === '\r') {
      if (ch_ === '\r' && txt[i + 1] === '\n') i++;
      row.push(cur); rows.push(row); row = []; cur = '';
    } else cur += ch_;
  }
  if (cur !== '' || row.length) { row.push(cur); rows.push(row); }
  return rows.filter(r => r.some(c => String(c).trim() !== ''));
}


/* ============================ Gestion financière ============================ */
const CATEGORIES_ACHAT = ['Matériaux', 'Sous-traitance', 'Matériel', 'Divers'];
const CLE_BUDGET = { 'Matériaux': 'materiaux', 'Sous-traitance': 'soustraitance', 'Matériel': 'materiel', 'Divers': 'divers' };
const STATUTS_COMMANDE = [
  ['brouillon', 'À commander'], ['commandee', 'Commandée'], ['confirmee', 'Confirmée (AR)'],
  ['partielle', 'Livrée partiellement'], ['livree', 'Livrée'], ['facturee', 'Facturée'], ['annulee', 'Annulée']
];
const STATUTS_SITUATION = [
  ['brouillon', 'Brouillon'], ['transmise', 'Transmise MOE'], ['validee', 'Validée MOE'], ['facturee', 'Facturée'], ['payee', 'Payée']
];
const commandeEngagee = cmd => !['brouillon', 'annulee'].includes(cmd.statut);
const commandeLivree = cmd => ['livree', 'facturee'].includes(cmd.statut);

function montantCommande(cmd) {
  return (cmd.lignes || []).reduce((t, l) => t + num(l.quantite) * num(l.pu), 0);
}

function parametresFinanciers(c) {
  const f = (c && c.finances) || {};
  return { rg: f.rg ?? 5, prorata: f.prorata ?? 0, tva: f.tva ?? 20, delai: f.delai ?? 30 };
}

// Décomposition du marché (DPGF + avenants). Sans postes saisis : une ligne unique « Marché ».
function postesDe(base, cid) {
  const c = base.chantiers.find(x => x.id === cid);
  const p = (base.postes || []).filter(x => x.chantierId === cid)
    .sort((a, b) => (a.avenant ? 1 : 0) - (b.avenant ? 1 : 0) || String(a.code || '').localeCompare(String(b.code || ''), 'fr', { numeric: true }));
  if (p.length) return p;
  return num(c && c.marcheHT) ? [{ id: '__marche', chantierId: cid, code: '01', designation: 'Marché de base', montant: num(c.marcheHT), avenant: false }] : [];
}

function situationsDe(base, cid) {
  return (base.situations || []).filter(s => s.chantierId === cid)
    .sort((a, b) => a.mois.localeCompare(b.mois) || num(a.numero) - num(b.numero));
}

/* Situation de travaux : cumul = % cumulé × montant du poste ; montant du mois = cumul − cumul précédent.
   Retenue de garantie et compte prorata appliqués au montant HT du mois, puis TVA. */
function calcSituation(base, cid, sitId) {
  const c = base.chantiers.find(x => x.id === cid);
  const sits = situationsDe(base, cid);
  const i = sits.findIndex(s => s.id === sitId);
  const sit = sits[i];
  const prec = i > 0 ? sits[i - 1] : null;
  const pf = parametresFinanciers(c);
  const lignes = postesDe(base, cid).map(p => {
    const pct = num((sit && sit.pcts || {})[p.id]);
    const pctPrec = prec ? num((prec.pcts || {})[p.id]) : 0;
    const cumul = pct * num(p.montant), precedent = pctPrec * num(p.montant);
    return { poste: p, pct, pctPrec, cumul, precedent, mois: cumul - precedent };
  });
  const t = lignes.reduce((a, l) => { a.montant += num(l.poste.montant); a.cumul += l.cumul; a.precedent += l.precedent; a.mois += l.mois; return a; }, { montant: 0, cumul: 0, precedent: 0, mois: 0 });
  t.rg = t.mois * pf.rg / 100;
  t.prorata = t.mois * pf.prorata / 100;
  t.netHT = t.mois - t.rg - t.prorata;
  t.tva = t.netHT * pf.tva / 100;
  t.ttc = t.netHT + t.tva;
  t.pct = t.montant ? t.cumul / t.montant : 0;
  return { sit, prec, lignes, tot: t, pf };
}

/* Synthèse financière : chiffre d'affaires, facturation, déboursé budget / réel / fin d'affaire.
   Prévision fin d'affaire (PFA) : main d'œuvre = budget − impact projeté du suivi hebdo ;
   achats = le plus grand entre budget et engagé. */
function calcFinances(base, cid) {
  const c = base.chantiers.find(x => x.id === cid);
  const postes = postesDe(base, cid);
  const marcheBase = postes.filter(p => !p.avenant).reduce((t, p) => t + num(p.montant), 0);
  const avenants = postes.filter(p => p.avenant).reduce((t, p) => t + num(p.montant), 0);
  const ca = marcheBase + avenants;
  const sits = situationsDe(base, cid);
  const emises = sits.filter(s => s.statut !== 'brouillon');
  const derniere = emises[emises.length - 1];
  const facture = derniere ? calcSituation(base, cid, derniere.id).tot.cumul : 0;
  let encaisseTTC = 0, factureTTC = 0, rgCumul = 0;
  emises.forEach(s => {
    const t = calcSituation(base, cid, s.id).tot;
    factureTTC += t.ttc; rgCumul += t.rg;
    if (s.statut === 'payee') encaisseTTC += t.ttc;
  });
  const suivi = calcSuivi(base, cid);
  const taux = suivi.taux;
  const b = (c && c.budget) || {};
  const budget = { mo: suivi.tot.budget * taux };
  CATEGORIES_ACHAT.forEach(cat => { budget[CLE_BUDGET[cat]] = num(b[CLE_BUDGET[cat]]); });
  const cmds = (base.commandes || []).filter(x => x.chantierId === cid && commandeEngagee(x));
  const heuresReelles = suivi.tot.heures + suivi.tot.horsBTE;
  const reel = { mo: heuresReelles * taux };
  CATEGORIES_ACHAT.forEach(cat => { reel[CLE_BUDGET[cat]] = cmds.filter(x => (x.categorie || 'Matériaux') === cat).reduce((t, x) => t + montantCommande(x), 0); });
  const pfa = { mo: heuresReelles > 0 ? Math.max(reel.mo, budget.mo - suivi.tot.impactProj + suivi.tot.horsBTE * taux) : budget.mo };
  CATEGORIES_ACHAT.forEach(cat => { const k = CLE_BUDGET[cat]; pfa[k] = Math.max(budget[k], reel[k]); });
  const somme = o => Object.values(o).reduce((t, v) => t + v, 0);
  budget.total = somme(budget); reel.total = somme(reel); pfa.total = somme(pfa);
  const margePrevue = ca - budget.total, margePFA = ca - pfa.total;
  return {
    ca, marcheBase, avenants, facture, factureTTC, encaisseTTC, resteAEncaisser: factureTTC - encaisseTTC, rgCumul,
    budget, reel, pfa, margePrevue, margePFA,
    tauxMargePrevue: ca ? margePrevue / ca : 0, tauxMargePFA: ca ? margePFA / ca : 0,
    avPhysique: suivi.tot.pct, avFinancier: ca ? facture / ca : 0
  };
}

// Séries mensuelles cumulées : facturation (situations émises) et dépenses (MO pointée + achats engagés)
function serieFinanciere(base, cid) {
  const c = base.chantiers.find(x => x.id === cid);
  if (!c) return [];
  const taux = num(c.tauxHoraire);
  const suivi = entreesSuivi(base, cid);
  const cmds = (base.commandes || []).filter(x => x.chantierId === cid && commandeEngagee(x));
  const sits = situationsDe(base, cid).filter(s => s.statut !== 'brouillon');
  const dates = [c.dateDebut, ...suivi.map(s => s.semaine), ...cmds.map(x => x.date), ...sits.map(s => s.mois + '-01')].filter(Boolean).sort();
  if (!dates.length) return [];
  const fin = [aujourdHui(), c.dateFin || ''].sort().pop();
  const pts = [];
  let m = dates[0].slice(0, 7);
  const mFin = (fin > aujourdHui() ? aujourdHui() : fin).slice(0, 7);
  for (let i = 0; m <= mFin && i < 60; i++) {
    const finMois = m + '-31';
    const mo = suivi.filter(s => s.semaine <= finMois).reduce((t, s) => t + num(s.heures), 0) * taux;
    const achats = cmds.filter(x => (x.date || '') <= finMois).reduce((t, x) => t + montantCommande(x), 0);
    const sit = sits.filter(s => s.mois <= m).pop();
    pts.push({ mois: m, depenses: mo + achats, facture: sit ? calcSituation(base, cid, sit.id).tot.cumul : 0 });
    const [a, mm] = m.split('-').map(Number);
    m = mm === 12 ? `${a + 1}-01` : `${a}-${String(mm + 1).padStart(2, '0')}`;
  }
  return pts;
}

/* ================================ Planning ================================
   Durée d'une phase (jours ouvrés) = heures budgétées ÷ (effectif × heures par jour).
   Une phase est en retard si, à date, son % réalisé est inférieur de plus de 10 points
   au % attendu (linéaire entre ses dates prévues), ou si sa date de fin est dépassée. */
const estOuvre = s => { const j = new Date(s + 'T00:00:00').getDay(); return j !== 0 && j !== 6; };
// Nombre de jours ouvrés (lundi → vendredi) entre deux dates incluses
function joursOuvres(du, au) {
  if (!du || !au || au < du) return 0;
  let n = 0;
  for (let d = du, i = 0; d <= au && i < 4000; d = addDays(d, 1), i++) if (estOuvre(d)) n++;
  return n;
}
// Date du n-ième jour ouvré à partir de « du » (n = 1 : premier jour ouvré à partir de du)
function ajouterJoursOuvres(du, n) {
  let d = du;
  while (!estOuvre(d)) d = addDays(d, 1);
  for (let k = 1; k < Math.max(1, Math.ceil(n)); k++) { d = addDays(d, 1); while (!estOuvre(d)) d = addDays(d, 1); }
  return d;
}
const dureePhase = (budget, effectif, hj) => Math.max(1, Math.ceil(num(budget) / (Math.max(1, num(effectif)) * (num(hj) || HEURES_JOUR_DEFAUT)) - 1e-9));

// Planning enchaîné : phases successives, chevauchement en % de la durée de la phase précédente
function planningAuto(base, cid, { debut, effectif = 2, chevauchement = 0 } = {}) {
  const c = base.chantiers.find(x => x.id === cid);
  const hj = hjDe(c);
  const out = {};
  const depart = ajouterJoursOuvres(debut || (c && c.dateDebut) || aujourdHui(), 1);
  const chev = Math.max(0, Math.min(0.9, num(chevauchement)));
  let prec = null;
  phasesBTE(base, cid).forEach(p => {
    const duree = dureePhase(p.budget, effectif, hj);
    // Démarre après la phase précédente, ou pendant (chevauchement) mais au plus tôt son 2e jour
    const d = prec ? ajouterJoursOuvres(prec.debut, Math.max(2, Math.round(prec.duree * (1 - chev)) + 1)) : depart;
    const f = ajouterJoursOuvres(d, duree);
    out[p.ouvrage + '||' + p.phase] = { debut: d, fin: f };
    prec = { debut: d, duree };
  });
  return out;
}

// Première et dernière date avec des heures sur une phase (pointage journalier, sinon semaines du suivi)
function activiteReelle(base, cid) {
  const m = {};
  const noter = (k, d1, d2) => { const a = m[k] = m[k] || { debut: d1, fin: d2 }; if (d1 < a.debut) a.debut = d1; if (d2 > a.fin) a.fin = d2; };
  (base.pointages || []).forEach(p => {
    if (p.chantierId !== cid || p.statut !== 'present') return;
    (p.lignes || []).forEach(l => { if (num(l.h) > 0) noter((l.ouvrage || '') + '||' + (l.phase || ''), p.date, p.date); });
  });
  (base.suivi || []).forEach(s => {
    if (s.chantierId !== cid || !num(s.heures)) return;
    const k = s.ouvrage + '||' + s.phase;
    if (!m[k]) noter(k, s.semaine, addDays(s.semaine, 4));
  });
  return m;
}

function calcPlanning(base, cid, auj = aujourdHui()) {
  const c = base.chantiers.find(x => x.id === cid);
  const plan = (c && c.planning) || {};
  const suivi = calcSuivi(base, cid);
  const reel = activiteReelle(base, cid);
  const rows = suivi.rows.map(r => {
    const k = r.ouvrage + '||' + r.phase;
    const pl = plan[k] || {};
    const row = { cle: k, ouvrage: r.ouvrage, phase: r.phase, budget: r.budget, heures: r.heures, pct: r.pct, debut: pl.debut || '', fin: pl.fin || '', reel: reel[k] || null };
    row.duree = row.debut && row.fin ? joursOuvres(row.debut, row.fin) : 0;
    row.attendu = !row.debut || !row.fin ? null : auj < row.debut ? 0 : auj >= row.fin ? 1 : joursOuvres(row.debut, auj) / Math.max(1, row.duree);
    if (r.pct >= 1) row.statut = 'termine';
    else if (!row.debut || !row.fin) row.statut = 'non_planifie';
    else if (auj > row.fin || row.pct + 0.1 < row.attendu) row.statut = 'retard';
    else if (auj < row.debut && !row.reel) row.statut = 'a_venir';
    else row.statut = 'en_cours';
    // Fin projetée au rythme constaté
    row.finProjetee = row.fin;
    if (row.statut !== 'termine' && row.debut) {
      const depart = row.reel ? (row.reel.debut < row.debut ? row.reel.debut : row.debut) : row.debut;
      if (row.pct > 0 && depart <= auj) {
        const ecoule = Math.max(1, joursOuvres(depart, auj));
        const proj = ajouterJoursOuvres(depart, Math.ceil(ecoule / row.pct));
        row.finProjetee = proj > (row.fin || '') ? proj : row.fin;
      } else if (row.debut < auj && row.duree) {
        const proj = ajouterJoursOuvres(addDays(auj, 1), row.duree);
        row.finProjetee = proj > row.fin ? proj : row.fin;
      }
    }
    row.glissement = row.finProjetee && row.fin && row.finProjetee > row.fin ? joursOuvres(addDays(row.fin, 1), row.finProjetee) : 0;
    return row;
  });
  const planifiees = rows.filter(r => r.debut && r.fin);
  const debut = planifiees.map(r => r.debut).sort()[0] || (c && c.dateDebut) || '';
  const finPlan = planifiees.map(r => r.fin).sort().pop() || '';
  const finProjetee = rows.map(r => r.finProjetee).filter(Boolean).sort().pop() || finPlan;
  const finContrat = (c && c.dateFin) || finPlan;
  const retard = finProjetee && finContrat && finProjetee > finContrat ? joursOuvres(addDays(finContrat, 1), finProjetee) : 0;
  return { rows, debut, finPlan, finProjetee, finContrat, retard, jalons: ((c && c.jalons) || []).slice().sort((a, b) => (a.date || '').localeCompare(b.date || '')) };
}

/* ================================ Actions ================================ */
const actionOuverte = a => a.statut !== 'faite';
const actionEnRetard = (a, auj = aujourdHui()) => actionOuverte(a) && !!a.echeance && a.echeance < auj;
function actionsDe(base, cid) {
  return (base.actions || []).filter(a => !cid || a.chantierId === cid)
    .sort((a, b) => (actionOuverte(b) - actionOuverte(a)) || (a.echeance || '9999').localeCompare(b.echeance || '9999'));
}

/* ============================ Rapport mensuel ============================= */
const finDuMois = m => { const [a, mm] = m.split('-').map(Number); return isoLocal(new Date(a, mm, 0)); };
const moisPrecedent = m => { const [a, mm] = m.split('-').map(Number); return mm === 1 ? `${a - 1}-12` : `${a}-${String(mm - 1).padStart(2, '0')}`; };

// Chiffres d'un mois pour le rapport d'avancement au maître d'œuvre
function syntheseMois(base, cid, mois) {
  const du = mois + '-01', au = finDuMois(mois);
  const avant = calcSuivi(base, cid, addDays(du, -1)), apres = calcSuivi(base, cid, au);
  const pt = synthesePointage(base, cid, du, au);
  const c = base.chantiers.find(x => x.id === cid);
  const hj = hjDe(c);
  const joursPointes = new Set(pt.pointages.filter(p => p.statut === 'present').map(p => p.date));
  const journal = (base.journal || []).filter(j => j.chantierId === cid && j.date >= du && j.date <= au).sort((a, b) => a.date.localeCompare(b.date));
  const joursIntemp = new Set([...journal.filter(j => j.intemperie).map(j => j.date), ...pt.pointages.filter(p => p.statut === 'intemperie' || num(p.intemp) >= hj).map(p => p.date)]);
  const res = (base.reserves || []).filter(r => r.chantierId === cid);
  const secu = (base.securite || []).filter(s => s.chantierId === cid && s.date >= du && s.date <= au);
  return {
    du, au,
    avancement: { debut: avant.tot.pct, fin: apres.tot.pct, gain: apres.tot.pct - avant.tot.pct },
    phases: apres.rows.map((r, i) => ({ ouvrage: r.ouvrage, phase: r.phase, debut: avant.rows[i] ? avant.rows[i].pct : 0, fin: r.pct })),
    effectif: { heures: pt.tot.heures, joursHomme: pt.tot.heures / hj, jours: joursPointes.size, moyen: joursPointes.size ? pt.tot.heures / hj / joursPointes.size : 0, intemp: pt.tot.intemp },
    joursIntemperie: joursIntemp.size,
    journal,
    reserves: { creees: res.filter(r => r.creeLe >= du && r.creeLe <= au).length, levees: res.filter(r => r.leveeLe && r.leveeLe >= du && r.leveeLe <= au).length, ouvertes: res.filter(r => r.statut !== 'levée' && (r.creeLe || '') <= au).length },
    securite: { causeries: secu.filter(s => s.type === 'causerie').length, accueils: secu.filter(s => s.type === 'accueil').length, visites: secu.filter(s => s.type === 'visite').length, permis: secu.filter(s => s.type === 'permis').length,
      accidents: secu.filter(s => s.type === 'evenement' && /^Accident/.test(s.nature || '')).length }
  };
}

/* ========================= Agenda (iCalendar .ics) ======================== */
const icsTexte = s => String(s ?? '').replace(/\\/g, '\\\\').replace(/;/g, '\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
const icsDate = d => d.replace(/-/g, '');
const icsDateHeure = (d, h) => `${icsDate(d)}T${(h || '08:00').replace(':', '')}00`;
// Lignes de 75 octets au plus (repli RFC 5545), sans couper un caractère accentué
function icsPlier(ligne) {
  const octets = ch_ => { const n = ch_.codePointAt(0); return n < 0x80 ? 1 : n < 0x800 ? 2 : n < 0x10000 ? 3 : 4; };
  const out = [];
  let cour = '', taille = 0;
  for (const ch_ of ligne) {
    const o = octets(ch_);
    if (taille + o > (out.length ? 74 : 75)) { out.push(cour); cour = ''; taille = 0; }
    cour += ch_; taille += o;
  }
  out.push(cour);
  return out.join('\r\n ');
}
const VTIMEZONE_PARIS = ['BEGIN:VTIMEZONE', 'TZID:Europe/Paris',
  'BEGIN:DAYLIGHT', 'TZOFFSETFROM:+0100', 'TZOFFSETTO:+0200', 'TZNAME:CEST', 'DTSTART:19700329T020000', 'RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=-1SU', 'END:DAYLIGHT',
  'BEGIN:STANDARD', 'TZOFFSETFROM:+0200', 'TZOFFSETTO:+0100', 'TZNAME:CET', 'DTSTART:19701025T030000', 'RRULE:FREQ=YEARLY;BYMONTH=10;BYDAY=-1SU', 'END:STANDARD',
  'END:VTIMEZONE'];
/* evenements : [{ uid, titre, date, heure?, duree? (min), description?, lieu?, rappel? (min avant ; jour entier : la veille à 17 h par défaut) }] */
function genererICS(evenements, nomCalendrier = 'OmSmK', horodatage = new Date()) {
  const stamp = horodatage.toISOString().replace(/[-:]/g, '').replace(/\.\d+/, '');
  const l = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//OmSmK//Pilotage de chantiers//FR', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH', `X-WR-CALNAME:${icsTexte(nomCalendrier)}`];
  if (evenements.some(e => e.heure)) l.push(...VTIMEZONE_PARIS);
  evenements.forEach(e => {
    l.push('BEGIN:VEVENT', `UID:${e.uid}@omsmk`, `DTSTAMP:${stamp}`, `SUMMARY:${icsTexte(e.titre)}`);
    if (e.heure) {
      l.push(`DTSTART;TZID=Europe/Paris:${icsDateHeure(e.date, e.heure)}`);
      const [h, mi] = e.heure.split(':').map(Number);
      const fin = h * 60 + mi + (e.duree || 60);
      l.push(`DTEND;TZID=Europe/Paris:${icsDate(e.date)}T${String(Math.floor(fin / 60) % 24).padStart(2, '0')}${String(fin % 60).padStart(2, '0')}00`);
    } else {
      l.push(`DTSTART;VALUE=DATE:${icsDate(e.date)}`, `DTEND;VALUE=DATE:${icsDate(addDays(e.date, 1))}`, 'TRANSP:TRANSPARENT');
    }
    if (e.lieu) l.push(`LOCATION:${icsTexte(e.lieu)}`);
    if (e.description) l.push(`DESCRIPTION:${icsTexte(e.description)}`);
    const rappel = e.rappel ?? (e.heure ? 60 : 7 * 60);   // jour entier : veille 17 h (7 h avant minuit)
    l.push('BEGIN:VALARM', 'ACTION:DISPLAY', `DESCRIPTION:${icsTexte(e.titre)}`, `TRIGGER:-PT${rappel}M`, 'END:VALARM', 'END:VEVENT');
  });
  l.push('END:VCALENDAR');
  return l.map(icsPlier).join('\r\n') + '\r\n';
}

/* ================================ Rappels ================================= */
// Rappels à afficher maintenant (les déjà affichés sont filtrés par l'appelant)
function rappelsDus(base, maintenant = new Date()) {
  const auj = isoLocal(maintenant), demain = addDays(auj, 1);
  const heure = maintenant.getHours() * 60 + maintenant.getMinutes();
  const out = [];
  (base.chantiers || []).forEach(c => {
    const nom = c.nom;
    (base.actions || []).filter(a => a.chantierId === c.id && actionOuverte(a) && a.echeance && a.echeance <= auj)
      .forEach(a => out.push({ id: `act|${a.id}|${auj}`, titre: a.echeance < auj ? 'Action en retard' : 'Action à faire aujourd\'hui', corps: `${a.libelle}${a.responsable ? ' — ' + a.responsable : ''} (${nom})`, vue: 'actions', cid: c.id }));
    const reus = (base.reunions || []).filter(r => r.chantierId === c.id).sort((a, b) => num(b.numero) - num(a.numero));
    const pro = reus[0] && reus[0].prochaine;
    if (pro && pro.date === auj) out.push({ id: `reu|${reus[0].id}|${auj}`, titre: 'Réunion aujourd\'hui', corps: `${nom}${pro.heure ? ' à ' + pro.heure : ''}${reus[0].lieu ? ' — ' + reus[0].lieu : ''}`, vue: 'reunions', cid: c.id });
    if (pro && pro.date === demain && heure >= 16 * 60) out.push({ id: `reu|${reus[0].id}|${demain}`, titre: 'Réunion demain', corps: `${nom}${pro.heure ? ' à ' + pro.heure : ''}`, vue: 'reunions', cid: c.id });
    (base.securite || []).filter(s => s.chantierId === c.id && s.type === 'permis' && s.date <= auj && !(s.surveillance && s.surveillance.fait))
      .forEach(s => out.push({ id: `pf|${s.id}|${auj}`, titre: 'Permis de feu : surveillance à confirmer', corps: `${nom}${s.zone ? ' — ' + s.zone : ''}`, vue: 'securite', cid: c.id }));
    const equipe = (base.compagnons || []).filter(k => k.chantierId === c.id && k.actif !== false);
    const enCours = c.dateDebut && c.dateDebut <= auj && (!c.dateFin || c.dateFin >= auj) && estOuvre(auj);
    if (enCours && equipe.length && heure >= 17 * 60) {
      const pointes = new Set((base.pointages || []).filter(p => p.chantierId === c.id && p.date === auj).map(p => p.compagnonId));
      const manq = equipe.filter(k => !pointes.has(k.id)).length;
      if (manq) out.push({ id: `pt|${c.id}|${auj}`, titre: 'Pointage du jour à faire', corps: `${nom} : ${manq} compagnon(s) non pointé(s)`, vue: 'pointage', cid: c.id });
    }
  });
  return out;
}

/* ============================= Plan de charge =============================
   Besoin d'une semaine = heures restantes de chaque phase (budget × (1 − % réalisé))
   réparties sur ses jours ouvrés restants (planning), ramenées en compagnons
   (heures ÷ (heures par jour × 5)). */
const clePersonne = k => norm(`${k.prenom || ''} ${k.nom || ''}`);
function personnesEquipe(base) {
  const m = new Map();
  (base.compagnons || []).filter(k => k.actif !== false).forEach(k => {
    const cle = clePersonne(k);
    if (!cle) return;
    if (!m.has(cle)) m.set(cle, { cle, nom: `${k.prenom || ''} ${k.nom || ''}`.trim(), qualification: k.qualification || '', interim: k.interim || '', chantiers: [] });
    const p = m.get(cle);
    if (!p.chantiers.includes(k.chantierId)) p.chantiers.push(k.chantierId);
  });
  return [...m.values()].sort((a, b) => a.nom.localeCompare(b.nom, 'fr'));
}
const idAffectation = (cle, semaine) => `af|${empreinte(cle)}|${semaine}`;
const affectationDe = (base, cle, semaine) => (base.affectations || []).find(a => a.personne === cle && a.semaine === semaine) || null;

function besoinEffectif(base, cid, lun, auj = aujourdHui()) {
  const c = base.chantiers.find(x => x.id === cid);
  if (!c) return 0;
  const hj = hjDe(c), plan = c.planning || {};
  const finSem = addDays(lun, 4);
  let heures = 0;
  calcSuivi(base, cid).rows.forEach(r => {
    const p = plan[r.ouvrage + '||' + r.phase];
    const reste = r.budget * (1 - r.pct);
    if (!p || !p.debut || !p.fin || reste <= 0.01) return;
    const debut = p.debut > auj ? p.debut : auj;
    const fin = p.fin >= debut ? p.fin : ajouterJoursOuvres(debut, 5);   // phase en retard : reste à faire sur une semaine
    const jours = joursOuvres(debut, fin);
    if (!jours) return;
    const d0 = debut > lun ? debut : lun, d1 = fin < finSem ? fin : finSem;
    heures += reste / jours * joursOuvres(d0, d1);
  });
  return Math.round(heures / (hj * 5) * 10) / 10;
}
const affectesSemaine = (base, cid, lun) => (base.affectations || []).filter(a => a.chantierId === cid && a.semaine === lun && a.statut === 'chantier').length;

/* ========================= Devis et relances clients ====================== */
const STATUTS_DEVIS = [['brouillon', 'Brouillon'], ['emis', 'Émis'], ['accepte', 'Accepté'], ['refuse', 'Refusé']];
const montantDevis = d => (d.lignes || []).length ? d.lignes.reduce((t, l) => t + num(l.quantite) * num(l.pu), 0) : num(d.montant);
const derniereRelance = d => (d.relances || []).slice().sort().pop() || d.dateEmission || '';
function devisARelancer(base, cid, auj = aujourdHui(), delai = 15) {
  return (base.devis || []).filter(d => d.chantierId === cid && d.statut === 'emis' && derniereRelance(d) && derniereRelance(d) <= addDays(auj, -delai));
}
function echeanceSituation(s, c) {
  const base = s.factureeLe || s.valideeLe || s.transmiseLe;
  return base ? addDays(base, parametresFinanciers(c).delai) : '';
}
// Situations émises non payées dont l'échéance de paiement est dépassée
function situationsImpayees(base, cid, auj = aujourdHui()) {
  const c = base.chantiers.find(x => x.id === cid);
  return situationsDe(base, cid).filter(s => ['transmise', 'validee', 'facturee'].includes(s.statut)).map(s => {
    const ech = echeanceSituation(s, c);
    return { sit: s, echeance: ech, retard: ech && ech < auj ? Math.round((new Date(auj) - new Date(ech)) / 86400000) : 0, ttc: calcSituation(base, cid, s.id).tot.ttc };
  }).filter(x => x.retard > 0);
}

/* ====================== Préparation et documents ========================== */
const STATUTS_PREP = [['afaire', 'À faire'], ['encours', 'En cours'], ['fait', 'Fait'], ['so', 'Sans objet']];
function etatPreparation(base, cid, liste, auj = aujourdHui()) {
  const st = ((base.checklists || {})[cid] || {}).prep || {};
  const items = liste.flatMap((sec, si) => sec.items.map((t, ii) => Object.assign({ cle: si + '-' + ii, section: sec.section, texte: t, statut: 'afaire' }, st[si + '-' + ii] || {})));
  const utiles = items.filter(i => i.statut !== 'so');
  const faits = utiles.filter(i => i.statut === 'fait').length;
  return { items, faits, total: utiles.length, pct: utiles.length ? faits / utiles.length : 0, retard: utiles.filter(i => i.statut !== 'fait' && i.echeance && i.echeance < auj) };
}
const STATUTS_DOC = [['encours', 'En cours'], ['diffuse', 'Diffusé'], ['vise', 'Visé sans observation'], ['vise_obs', 'Visé avec observations'], ['refuse', 'Refusé']];
function documentsEnAttente(base, cid, auj = aujourdHui(), delai = 15) {
  return (base.documents || []).filter(d => d.chantierId === cid && d.statut === 'diffuse' && d.diffuseLe && d.diffuseLe <= addDays(auj, -delai));
}

/* ========================== Bilan de fin de chantier ====================== */
function bilanChantier(base, cid, auj = aujourdHui()) {
  const c = base.chantiers.find(x => x.id === cid);
  const hj = hjDe(c);
  const s = calcSuivi(base, cid);
  const f = calcFinances(base, cid);
  const ops = (base.ops || []).filter(o => o.chantierId === cid);
  const phases = s.rows.map(r => {
    const principale = ops.filter(o => o.ouvrage === r.ouvrage && o.phase === r.phase && num(o.metre) > 0).sort((a, b) => num(b.metre) - num(a.metre))[0];
    const cible = principale ? num(principale.cadence) : 0;
    // Productivité de la phase = heures produites (budget × % réalisé) ÷ heures pointées ;
    // cadence équivalente constatée = cadence du BTE × productivité
    const productivite = r.heures > 0 && r.pct > 0 ? r.budget * r.pct / r.heures : 0;
    return { ouvrage: r.ouvrage, phase: r.phase, budget: r.budget, heures: r.heures, pct: r.pct, ecart: r.ecartH, unite: principale ? principale.unite : '', operation: principale ? principale.operation : '', productivite, cadenceCible: cible, cadenceReelle: cible * productivite };
  });
  const pvRec = (base.pvs || []).filter(p => p.chantierId === cid && p.type === 'reception' && p.decision !== 'differee').sort((a, b) => a.date.localeCompare(b.date))[0];
  const activite = [...(base.pointages || []).filter(p => p.chantierId === cid && p.date <= auj).map(p => p.date), ...(base.suivi || []).filter(x => x.chantierId === cid && num(x.heures) && x.semaine <= auj).map(x => addDays(x.semaine, 4) < auj ? addDays(x.semaine, 4) : auj)].sort();
  const finReelle = pvRec ? pvRec.date : (activite[activite.length - 1] || '');
  const res = (base.reserves || []).filter(r => r.chantierId === cid);
  const levees = res.filter(r => r.statut === 'levée' && r.creeLe && r.leveeLe);
  const secu = (base.securite || []).filter(x => x.chantierId === cid);
  const intemp = new Set([...(base.journal || []).filter(j => j.chantierId === cid && j.intemperie).map(j => j.date), ...(base.pointages || []).filter(p => p.chantierId === cid && p.statut === 'intemperie').map(p => p.date)]);
  return {
    heures: { budget: s.tot.budget, reel: s.tot.heures + s.tot.horsBTE, ecart: s.tot.ecartH, ecartProj: s.tot.ecartProj, impact: s.tot.impact, pct: s.tot.pct, productivite: s.tot.heures > 0 ? s.tot.gagnees / s.tot.heures : 0 },
    finances: { ca: f.ca, margePrevue: f.margePrevue, margeFin: f.margePFA, tauxPrevu: f.tauxMargePrevue, tauxFin: f.tauxMargePFA, facture: f.facture, encaisse: f.encaisseTTC, rg: f.rgCumul },
    delai: { debut: c.dateDebut || '', finContrat: c.dateFin || '', finReelle, retard: c.dateFin && finReelle > c.dateFin ? joursOuvres(addDays(c.dateFin, 1), finReelle) : 0, reception: pvRec ? pvRec.date : '' },
    liberationRG: pvRec ? addDays(pvRec.date, 365) : '',
    qualite: { reserves: res.length, levees: levees.length, ouvertes: res.filter(r => r.statut !== 'levée').length, delaiMoyen: levees.length ? Math.round(levees.reduce((t, r) => t + (new Date(r.leveeLe) - new Date(r.creeLe)) / 86400000, 0) / levees.length) : 0 },
    securite: { accidents: secu.filter(x => x.type === 'evenement' && /^Accident/.test(x.nature || '')).length, causeries: secu.filter(x => x.type === 'causerie').length, visites: secu.filter(x => x.type === 'visite').length },
    joursIntemperie: intemp.size,
    phases
  };
}

/* ===================== OTP et RAF projet (modèle SAP) =====================
   Le code OTP identifie le chantier dans SAP : pointage, commandes client et
   fournisseurs, facturation et coûts réels y sont imputés.
   RAF (reste à faire) par poste ; fin d'affaire = réel cumulé + RAF.
   CA mérité (avancement par les coûts) = CA fin d'affaire × réel cumulé ÷ coûts fin d'affaire ;
   FAE = CA mérité − facturé cumulé s'il est positif, PCA dans le cas contraire. */
const POSTES_RAF = [
  ['stmoyen', 'ST moyen'], ['stcomp', 'ST compétence'], ['mo', 'Main d\'œuvre'], ['fournitures', 'Fournitures'],
  ['materiel', 'Matériel'], ['etudes', 'Études techniques'], ['autres', 'Autres dépenses']
];
const POSTE_RAF_ACHAT = { 'Matériaux': 'fournitures', 'Sous-traitance': 'stcomp', 'Matériel': 'materiel', 'Divers': 'autres' };
// Nature comptable (plan comptable général) → poste du RAF ; la règle au préfixe le plus long l'emporte
const NATURES_RAF_DEFAUT = {
  '60': 'fournitures', '604': 'stcomp', '611': 'stcomp', '6122': 'materiel', '6132': 'materiel', '6135': 'materiel', '615': 'materiel',
  '617': 'etudes', '6226': 'etudes', '621': 'mo', '64': 'mo', '61': 'autres', '62': 'autres'
};
const moisSuivant = m => { const [a, mm] = m.split('-').map(Number); return mm === 12 ? `${a + 1}-01` : `${a}-${String(mm + 1).padStart(2, '0')}`; };
const otpDe = c => String((c && c.otp) || '').trim();
// Un élément d'OTP appartient au chantier s'il est égal à son OTP ou en est un sous-élément (6009435-01, 6009435.02…)
const otpCorrespond = (otpChantier, elt) => {
  const a = norm(otpChantier).replace(/\s+/g, ''), b = norm(elt).replace(/\s+/g, '');
  return !!a && (b === a || (b.startsWith(a) && /^[-./_]/.test(b.slice(a.length))));
};

function classerNature(nature, regles = NATURES_RAF_DEFAUT) {
  const n = String(nature || '').replace(/\s/g, '');
  let best = '', poste = 'autres';
  Object.entries(regles || {}).forEach(([p, k]) => { if (p && n.startsWith(p) && p.length > best.length) { best = p; poste = k; } });
  return poste;
}
const posteCout = (k, regles) => k.poste || classerNature(k.nature, regles);

// Montant au format SAP : « 2,339.85- », « 1 234,56 », « -298.40 », « 298,40- »
function montantSAP(v) {
  if (typeof v === 'number') return isFinite(v) ? v : 0;
  let s = String(v ?? '').replace(/[\s €]/g, '');
  if (!s) return 0;
  let neg = false;
  if (/-$/.test(s)) { neg = true; s = s.slice(0, -1); }
  if (/^-/.test(s)) { neg = !neg; s = s.slice(1); }
  const ip = s.lastIndexOf('.'), iv = s.lastIndexOf(',');
  if (ip >= 0 && iv >= 0) s = ip > iv ? s.replace(/,/g, '') : s.replace(/\./g, '').replace(',', '.');
  else if (iv >= 0) s = s.split(',').length > 2 ? s.replace(/,/g, '') : s.replace(',', '.');
  else if (s.split('.').length > 2) s = s.replace(/\./g, '');
  const n = parseFloat(s);
  return isFinite(n) ? (neg ? -n : n) : 0;
}
// Date SAP « 30.09.2026 », « 30/09/2026 », ISO, objet Date ou numéro de série Excel → AAAA-MM-JJ
function dateSAP(v) {
  if (v instanceof Date) return isNaN(v) ? '' : isoLocal(v);
  if (typeof v === 'number' && v > 20000 && v < 80000) return isoLocal(new Date(Math.round((v - 25569) * 86400000) + new Date().getTimezoneOffset() * 60000));
  const s = String(v ?? '').trim();
  let m = s.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{4})/);
  if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[1]}-${m[2]}-${m[3]}` : '';
}

/* Lecture d'un état SAP « postes individuels de coûts réels » (CJI3 / ZPS) exporté en Excel, CSV ou texte.
   Repère la ligne d'en-tête, ignore les lignes de total (sans date), renvoie des coûts { otp, date, nature, montant… }. */
const COLONNES_SAP = {
  otp: [/^elt d.?otp$/, /element d.?otp/, /^elt.*otp/, /^otp$/, /^element$/],
  montant: [/val.*devise perim/, /val.*d\.?tra/, /val.*dev.*obj/, /val.*dev.*soc/, /^montant/, /^valeur/],
  date: [/^date de valeur/, /^date comptable/, /^date pce/, /^date/],
  nature: [/^nat.*c(om)?pte/, /^nature/, /^element de couts?$/, /^cpte/],
  libelle: [/description de l.?article/, /^libelle/, /^texte/, /^designation$/, /^denomination/, /designation du poste/],
  fournisseur: [/^nom 1$/, /^nom du fournisseur/, /^nom fournisseur/],
  codeFournisseur: [/^fourn/],
  docAchat: [/^document d.?achat/, /^doc.*achat/, /^commande/],
  piece: [/^n.? ?pce ref/, /^n.*piece/, /^piece/, /^n.? doc/, /^document$/],
  objet: [/designation de l.?objet/]
};
function lireCoutsSAP(rows) {
  rows = (rows || []).map(r => (r || []).map(x => x instanceof Date || typeof x === 'number' ? x : String(x ?? '').trim()));
  let iEnTete = -1, cols = null;
  for (let i = 0; i < Math.min(rows.length, 40) && iEnTete < 0; i++) {
    const h = rows[i].map(x => norm(x).replace(/\s+/g, ' '));
    const c = {};
    const pris = new Set();
    Object.entries(COLONNES_SAP).forEach(([k, motifs]) => {
      for (const re of motifs) { const j = h.findIndex((x, jj) => !pris.has(jj) && re.test(x)); if (j >= 0) { c[k] = j; pris.add(j); break; } }
    });
    if (c.montant !== undefined && c.date !== undefined && (c.otp !== undefined || c.nature !== undefined)) { iEnTete = i; cols = c; }
  }
  if (iEnTete < 0) throw new Error('Colonnes SAP non reconnues (il faut au moins « Elt d\'OTP » ou « Nature compt. », une date et une valeur).');
  const v = (r, k) => cols[k] === undefined ? '' : r[cols[k]];
  const out = [];
  rows.slice(iEnTete + 1).forEach(r => {
    const date = dateSAP(v(r, 'date'));
    const brut = v(r, 'montant');
    if (!date || brut === '' || brut === undefined) return;
    out.push({
      otp: String(v(r, 'otp') || ''), date, nature: String(v(r, 'nature') || '').replace(/\s/g, ''), montant: Math.round(montantSAP(brut) * 100) / 100,
      libelle: String(v(r, 'libelle') || ''), fournisseur: String(v(r, 'fournisseur') || ''), codeFournisseur: String(v(r, 'codeFournisseur') || ''),
      docAchat: String(v(r, 'docAchat') || ''), piece: String(v(r, 'piece') || ''), objet: String(v(r, 'objet') || '')
    });
  });
  return out;
}

// Texte SAP (« fichier local non converti ») : colonnes séparées par « | » ; sinon CSV classique
function tableauTexte(txt) {
  const lignes = txt.replace(/^﻿/, '').split(/\r?\n/);
  if (lignes.filter(l => /^\s*\|/.test(l)).length >= 2) {
    return lignes.filter(l => /^\s*\|/.test(l) && !/^\s*\|?-{3,}/.test(l)).map(l => l.trim().replace(/^\||\|$/g, '').split('|').map(x => x.trim()));
  }
  return parseCSV(txt);
}

// Coûts réels par poste et par mois, depuis SAP (coûts importés) ou depuis OmSmK (pointage × taux + commandes engagées)
function sourceCouts(base, cid) {
  const c = base.chantiers.find(x => x.id === cid);
  const choix = (c && c.raf && c.raf.source) || 'auto';
  if (choix !== 'auto') return choix;
  return (base.couts || []).some(k => k.chantierId === cid) ? 'sap' : 'omsmk';
}
function mouvementsCouts(base, cid, regles) {
  const c = base.chantiers.find(x => x.id === cid);
  if (sourceCouts(base, cid) === 'sap') {
    return (base.couts || []).filter(k => k.chantierId === cid).map(k => ({ date: k.date, poste: posteCout(k, regles), montant: num(k.montant) }));
  }
  const taux = num(c && c.tauxHoraire);
  // Main d'œuvre : pointage journalier à sa date, plus les heures saisies à la semaine dans le suivi
  const mo = pointagesDe(base, cid).filter(p => heuresPointage(p)).map(p => ({ date: p.date, poste: 'mo', montant: heuresPointage(p) * taux }))
    .concat(base.suivi.filter(s => s.chantierId === cid && num(s.heures)).map(s => ({ date: s.semaine, poste: 'mo', montant: num(s.heures) * taux })));
  const achats = (base.commandes || []).filter(x => x.chantierId === cid && commandeEngagee(x) && x.date)
    .map(x => ({ date: x.date, poste: POSTE_RAF_ACHAT[x.categorie || 'Matériaux'] || 'autres', montant: montantCommande(x) }));
  return mo.concat(achats);
}

function calcRAF(base, cid, mois, regles = NATURES_RAF_DEFAUT) {
  const c = base.chantiers.find(x => x.id === cid);
  const raf = (c && c.raf) || {};
  const f = calcFinances(base, cid);
  const finM = finDuMois(mois), debutExercice = mois.slice(0, 4) + '-01-01';
  const mvts = mouvementsCouts(base, cid, regles).filter(x => x.date);
  // Budget par poste : main d'œuvre du BTE, achats de la synthèse financière ; écrasable dans le RAF
  const budgetAuto = { mo: f.budget.mo, fournitures: f.budget.materiaux, stcomp: f.budget.soustraitance, materiel: f.budget.materiel, autres: f.budget.divers };
  const horizon = [];
  for (let m = moisSuivant(mois), i = 0; i < 12; i++, m = moisSuivant(m)) horizon.push(m);
  const tot = { reelM: 0, reelExercice: 0, reelCumul: 0, raf: 0, fin: 0, budget: 0, repartis: 0, aRepartir: 0, mois: Object.fromEntries(horizon.map(m => [m, 0])) };
  const postes = POSTES_RAF.map(([k, lib]) => {
    const p = (raf.postes || {})[k] || {};
    const mv = mvts.filter(x => x.poste === k);
    const somme = l => Math.round(l.reduce((t, x) => t + x.montant, 0) * 100) / 100;
    const reelM = somme(mv.filter(x => x.date.slice(0, 7) === mois));
    const reelExercice = somme(mv.filter(x => x.date >= debutExercice && x.date <= finM));
    const reelCumul = somme(mv.filter(x => x.date <= finM));
    const rafP = num(p.raf);
    const repartition = Object.fromEntries(horizon.map(m => [m, num((p.mois || {})[m])]));
    const repartis = Object.values(repartition).reduce((t, v) => t + v, 0);
    const budget = p.budget !== undefined && p.budget !== '' ? num(p.budget) : num(budgetAuto[k]);
    const l = { k, lib, reelM, reelExercice, reelCumul, raf: rafP, fin: reelCumul + rafP, budget, ecart: budget - (reelCumul + rafP), repartition, repartis, aRepartir: rafP - repartis };
    ['reelM', 'reelExercice', 'reelCumul', 'raf', 'fin', 'budget', 'repartis', 'aRepartir'].forEach(x => { tot[x] += l[x]; });
    horizon.forEach(m => { tot.mois[m] += repartition[m]; });
    return l;
  });
  tot.ecart = tot.budget - tot.fin;
  // Chiffre d'affaires : commande (marché + avenants) + reste à obtenir (devis en attente probables, révisions…)
  const resteAObtenir = num(raf.resteAObtenir);
  const devisAttente = (base.devis || []).filter(d => d.chantierId === cid && d.statut === 'emis').reduce((t, d) => t + montantDevis(d), 0);
  const caFin = f.ca + resteAObtenir;
  const sits = situationsDe(base, cid).filter(s => s.statut !== 'brouillon' && s.mois <= mois);
  const der = sits[sits.length - 1];
  const factureCumul = der ? calcSituation(base, cid, der.id).tot.cumul : 0;
  const sitM = sits.filter(s => s.mois === mois).pop();
  const factureM = sitM ? calcSituation(base, cid, sitM.id).tot.mois : 0;
  const avancement = tot.fin > 0 ? Math.min(1, tot.reelCumul / tot.fin) : 0;
  const caMerite = caFin * avancement;
  const ecritures = caMerite - factureCumul;
  const margeCumul = caMerite - tot.reelCumul;
  const margeFin = caFin - tot.fin;
  return {
    mois, horizon, postes, tot, source: sourceCouts(base, cid),
    ca: { initial: f.marcheBase, avenants: f.avenants, commande: f.ca, resteAObtenir, potentiel: devisAttente, fin: caFin, factureM, factureCumul, merite: caMerite },
    avancement, fae: Math.max(0, ecritures), pca: Math.max(0, -ecritures),
    marge: { cumul: margeCumul, tauxCumul: caMerite ? margeCumul / caMerite : 0, fin: margeFin, tauxFin: caFin ? margeFin / caFin : 0, prevue: f.margePrevue, tauxPrevu: f.tauxMargePrevue },
    rafSaisi: postes.some(p => p.raf), valide: !!((raf.historique || {})[mois])
  };
}

// RAF proposé par poste = reste du budget (fin d'affaire prévue − réel cumulé), jamais négatif
function rafPropose(r, pfaMO) {
  return Object.fromEntries(r.postes.map(p => [p.k, Math.max(0, Math.round(((p.k === 'mo' && pfaMO !== undefined ? Math.max(pfaMO, p.budget) : p.budget) - p.reelCumul) * 100) / 100)]));
}

// Répartition linéaire d'un montant sur des mois (arrondi au centime, le reliquat sur le dernier mois)
function repartirLineaire(montant, mois) {
  if (!mois.length) return {};
  const part = Math.floor(num(montant) / mois.length * 100) / 100;
  const out = Object.fromEntries(mois.map(m => [m, part]));
  out[mois[mois.length - 1]] = Math.round((num(montant) - part * (mois.length - 1)) * 100) / 100;
  return out;
}

// Tout ce qui est rattaché à l'OTP du chantier : heures pointées, commandes fournisseurs, facturation, coûts SAP
function rattachementsOTP(base, cid) {
  const pts = (base.pointages || []).filter(p => p.chantierId === cid);
  const cmds = (base.commandes || []).filter(x => x.chantierId === cid && commandeEngagee(x));
  const sits = situationsDe(base, cid).filter(s => s.statut !== 'brouillon');
  const der = sits[sits.length - 1];
  const couts = (base.couts || []).filter(k => k.chantierId === cid);
  return {
    pointage: { n: pts.filter(p => p.statut === 'present').length, heures: pts.reduce((t, p) => t + heuresPointage(p), 0) },
    commandes: { n: cmds.length, montant: cmds.reduce((t, x) => t + montantCommande(x), 0) },
    facturation: { n: sits.length, montant: der ? calcSituation(base, cid, der.id).tot.cumul : 0 },
    couts: { n: couts.length, montant: couts.reduce((t, k) => t + num(k.montant), 0), dernier: couts.map(k => k.date).sort().pop() || '' }
  };
}
