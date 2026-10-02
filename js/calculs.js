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
  return { rg: f.rg ?? 5, prorata: f.prorata ?? 0, tva: f.tva ?? 20 };
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
