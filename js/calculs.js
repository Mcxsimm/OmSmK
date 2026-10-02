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
  const entrees = base.suivi.filter(s => s.chantierId === cid).filter(s => !jusqua || s.semaine <= jusqua).sort((a, b) => a.semaine.localeCompare(b.semaine));
  const rows = phasesBTE(base, cid).map(p => {
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
  return { rows, tot, taux };
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

