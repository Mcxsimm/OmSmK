/* ==========================================================================
   OmSmK — pointage journalier des compagnons
   Chaque jour : statut, heures ventilées par phase du BTE, intempéries,
   panier. Les heures pointées alimentent le suivi hebdomadaire et donc le
   budget d'heures, les écarts et la main d'œuvre de la synthèse financière.
   ========================================================================== */
// deno-lint-ignore-file no-unused-vars
'use strict';

const CLS_STATUT_PT = { present: 'pos', intemperie: 'info', conge: 'brand', maladie: 'warn', formation: 'brand', absent: 'neg' };
const ORDRE_QUALIF = q => { const i = QUALIFICATIONS.indexOf(q); return i < 0 ? 99 : i; };
const nomCompagnon = k => `${k.prenom || ''} ${k.nom || ''}`.trim() || 'Sans nom';
const clePhase = (o, p) => (o || '') + '||' + (p || '');
const libPhase = (o, p) => p ? (o ? `${p} · ${o}` : p) : 'Non ventilé';

function compagnonsDe(cid, inactifs = false) {
  return (db.compagnons || []).filter(k => k.chantierId === cid && (inactifs || k.actif !== false))
    .sort((a, b) => (a.actif === false) - (b.actif === false) || ORDRE_QUALIF(a.qualification) - ORDRE_QUALIF(b.qualification) || nomCompagnon(a).localeCompare(nomCompagnon(b), 'fr'));
}
const pointageDe = (cid, date, kid) => (db.pointages || []).find(p => p.chantierId === cid && p.date === date && p.compagnonId === kid) || null;
const datePt = () => ui.ptDate || aujourdHui();

function optionsPhases(c) {
  return phasesBTE(db, c.id).map(p => [clePhase(p.ouvrage, p.phase), libPhase(p.ouvrage, p.phase)]).concat([['', 'Non ventilé (hors BTE)']]);
}
// Phase proposée : celle choisie, sinon la première phase non terminée du suivi
function phaseParDefaut(c) {
  const opts = optionsPhases(c).map(o => o[0]);
  if (ui.ptPhase !== undefined && opts.includes(ui.ptPhase)) return ui.ptPhase;
  const r = calcSuivi(db, c.id).rows.find(x => x.pct < 1);
  return r ? clePhase(r.ouvrage, r.phase) : opts[0];
}
const ligneDepuisCle = (cle, h) => { const [ouvrage, phase] = String(cle || '').split('||'); return { ouvrage: ouvrage || '', phase: phase || '', h }; };

function majPointage(kid, date, champs) {
  const c = ch();
  db.pointages = db.pointages || [];
  let p = pointageDe(c.id, date, kid);
  // Identifiant déterministe : un compagnon pointé le même jour sur deux appareils = un seul pointage
  if (!p) { p = { id: idPointage(c.id, date, kid), chantierId: c.id, compagnonId: kid, date, statut: 'present', lignes: [], intemp: 0, panier: false, obs: '' }; db.pointages.push(p); }
  Object.assign(p, champs, { par: nomUser() });
  save();
  return p;
}
function supprimerPointage(kid, date) {
  db.pointages = (db.pointages || []).filter(p => !(p.chantierId === ui.chantierId && p.date === date && p.compagnonId === kid));
  save();
}
// Panier : repris du dernier pointage du compagnon (oui par défaut)
function panierHabituel(kid) {
  const dernier = (db.pointages || []).filter(p => p.compagnonId === kid && p.statut === 'present').sort((a, b) => b.date.localeCompare(a.date))[0];
  return dernier ? !!dernier.panier : true;
}
function champsStatut(c, statut, kid) {
  const hj = hjDe(c);
  if (statut === 'present') return { statut, lignes: [ligneDepuisCle(phaseParDefaut(c), hj)], intemp: 0, panier: panierHabituel(kid) };
  if (statut === 'intemperie') return { statut, lignes: [], intemp: hj, panier: false };
  return { statut, lignes: [], intemp: 0, panier: false };
}

/* ================================= Vue =================================== */
function vPointage(c) {
  const date = datePt();
  const mode = ui.ptMode === 'semaine' ? 'semaine' : 'jour';
  const lun = lundi(date);
  const pas = mode === 'jour' ? 1 : 7;
  const nav = `<div class="seg">${[['jour', 'Jour'], ['semaine', 'Semaine']].map(([v, l]) => `<button class="${mode === v ? 'on' : ''}" data-act="ptMode" data-m="${v}">${l}</button>`).join('')}</div>
    <div class="btn-group"><button class="btn icon" data-act="ptNav" data-d="-${pas}" aria-label="Précédent">${icone('chevron-left')}</button>
      <button class="btn" data-act="ptNav" data-d="0">${mode === 'jour' ? 'Aujourd\'hui' : 'Cette semaine'}</button>
      <button class="btn icon" data-act="ptNav" data-d="${pas}" aria-label="Suivant">${icone('chevron-right')}</button></div>
    <input type="date" class="input" style="width:auto" value="${date}" data-change="ptDate" aria-label="Choisir une date">
    <button class="btn" data-act="ptEquipe">${icone('users')}Équipe</button>
    <button class="btn" data-act="ptReleve" ${compagnonsDe(c.id).length ? '' : 'disabled'}>${icone('printer')}Relevé PDF</button>`;
  const titre = mode === 'jour' ? fmtDate(date, true).replace(/^./, x => x.toUpperCase()) : `Semaine ${semISO(lun)}`;
  const sous = mode === 'jour' ? [sousInfo('calendar', `Semaine ${semISO(date)}`), sousInfo('clock', `${fmt(hjDe(c))} h par jour`)]
    : [sousInfo('calendar', `du ${fmtDate(lun)} au ${fmtDate(addDays(lun, 6))}`)];
  const entete = enTetePage({ eyebrow: 'Pointage journalier', titre, sous, actions: nav });
  if (!compagnonsDe(c.id, true).length) {
    const autres = db.chantiers.filter(x => x.id !== c.id && compagnonsDe(x.id).length);
    return entete + `<div class="card">${vide('hard-hat', 'Aucun compagnon sur ce chantier',
      'Constituez l\'équipe une fois : chef de chantier, compagnons, intérimaires. Chaque jour, il suffira ensuite de pointer présences et heures par phase.',
      `<button class="btn primary" data-act="ptCompagnon">${icone('plus')}Ajouter un compagnon</button>${autres.length ? `<button class="btn" data-act="ptEquipe">${icone('copy')}Reprendre l'équipe d'un autre chantier</button>` : ''}`)}</div>`;
  }
  return entete + (mode === 'jour' ? vPointageJour(c, date) : vPointageSemaine(c, lun));
}

function vPointageJour(c, date) {
  const comps = compagnonsDe(c.id);
  const jour = synthesePointage(db, c.id, date, date);
  const sem = synthesePointage(db, c.id, lundi(date), addDays(lundi(date), 6));
  const suivi = calcSuivi(db, c.id);
  const consomme = suivi.tot.heures + suivi.tot.horsBTE;
  const phases = optionsPhases(c);
  const defaut = phaseParDefaut(c);
  // Compagnons inactifs mais pointés ce jour-là restent visibles
  const pointesInactifs = compagnonsDe(c.id, true).filter(k => k.actif === false && pointageDe(c.id, date, k.id));
  const liste = comps.concat(pointesInactifs);
  const nonPointes = comps.filter(k => !pointageDe(c.id, date, k.id)).length;
  const presents = jour.pointages.filter(p => p.statut === 'present').length;

  const kpis = `<div class="kpis">
    <div class="card kpi"><div class="kpi-top"><span class="kpi-lbl">Effectif présent</span><span class="kpi-ico">${icone('hard-hat')}</span></div>
      <div class="kpi-val">${presents}<small>/ ${comps.length}</small></div><div class="kpi-sub">${nonPointes ? `${accord(nonPointes, 'compagnon(s) non pointé(s)')}` : 'Tout le monde est pointé'}</div></div>
    <div class="card kpi"><div class="kpi-top"><span class="kpi-lbl">Heures du jour</span><span class="kpi-ico">${icone('clock')}</span></div>
      <div class="kpi-val">${fmt(jour.tot.heures)}<small>h</small></div><div class="kpi-sub">${jour.tot.intemp ? `+ ${fmt(jour.tot.intemp)} h d'intempéries` : `${accord(jour.tot.paniers, 'panier(s)')}`}</div></div>
    <div class="card kpi"><div class="kpi-top"><span class="kpi-lbl">Semaine ${semISO(date)}</span><span class="kpi-ico">${icone('calendar')}</span></div>
      <div class="kpi-val">${fmt(sem.tot.heures)}<small>h</small></div><div class="kpi-sub">${accord(fmt(sem.tot.heures / hjDe(c), 1), 'jour(s)-homme')}${sem.tot.intemp ? ` · ${fmt(sem.tot.intemp)} h intempéries` : ''}</div></div>
    <div class="card kpi"><div class="kpi-top"><span class="kpi-lbl">Budget d'heures consommé</span><span class="kpi-ico">${icone('gauge')}</span></div>
      <div class="kpi-val">${fmt(consomme, 0)}<small>/ ${fmt(suivi.tot.budget, 0)} h</small></div>
      <div style="margin-top:10px">${barre(suivi.tot.budget ? consomme / suivi.tot.budget : 0, 'lg')}</div>
      <div class="kpi-sub">${suivi.tot.budget ? pc(consomme / suivi.tot.budget) : '—'} consommé · ${pc(suivi.tot.pct)} réalisé</div></div>
  </div>`;

  const lignes = liste.map(k => lignePointage(c, k, pointageDe(c.id, date, k.id), phases)).join('');
  const futur = date > aujourdHui();
  const nonVentile = jour.parPhase.filter(p => !p.phase).reduce((t, p) => t + p.heures, 0);
  const carte = `<div class="card">
    <div class="card-head"><h3>Pointage du ${fmtDateCourt(date)}</h3>
      <div class="row pt-outils" style="gap:8px">
        ${phases.length > 1 ? `<label class="small muted" for="ptDefaut">Phase par défaut</label><select class="input" id="ptDefaut" style="width:auto;height:32px;max-width:240px" data-change="ptDefaut">${phases.map(([v, t]) => `<option value="${esc(v)}" ${v === defaut ? 'selected' : ''}>${esc(t)}</option>`).join('')}</select>
          <button class="btn sm" data-act="ptAppliquer" title="Affecter tous les présents (une seule phase) à la phase par défaut">${icone('layers', 'sm')}Appliquer à tous</button>` : ''}
        <button class="btn sm" data-act="ptCopier" title="Reprendre le dernier jour pointé pour les compagnons non pointés">${icone('copy', 'sm')}Reprendre la veille</button>
        <button class="btn primary sm" data-act="ptTous" ${nonPointes ? '' : 'disabled'}>${icone('check', 'sm')}Tous présents</button>
      </div></div>
    ${futur ? `<div class="alert warn" style="margin:0 20px 12px">${icone('triangle-alert')}<div>Cette date est dans le futur.</div></div>` : ''}
    <div class="pt-list">
      <div class="pt-row pt-head"><span>Compagnon</span><span>Statut</span><span class="num">Heures</span><span>Phase du BTE</span><span class="num">Intemp.</span><span>Panier</span><span></span></div>
      ${lignes}
      <div class="pt-row pt-total"><span>Total du jour</span><span>${accord(presents, 'présent(s)')}</span><span class="num">${fmt(jour.tot.heures)} h</span><span></span><span class="num">${jour.tot.intemp ? fmt(jour.tot.intemp) + ' h' : ''}</span><span>${jour.tot.paniers || ''}</span><span></span></div>
    </div>
    <div class="card-foot small muted">${icone('info', 'sm')} Les heures pointées s'ajoutent automatiquement au suivi hebdomadaire de la phase choisie. Pour répartir une journée sur plusieurs phases, utilisez ${icone('layers', 'sm')}.</div>
  </div>`;
  const alerte = nonVentile ? `<div class="alert warn">${icone('triangle-alert')}<div><b>${fmt(nonVentile)} h non ventilées</b> aujourd'hui : elles comptent dans le coût de main d'œuvre mais pas dans l'avancement des phases. Affectez-les à une phase du BTE.</div></div>` : '';
  return `<div class="stack">${kpis}${alerte}${carte}${budgetHeures(c, suivi, jour)}</div>`;
}

function lignePointage(c, k, p, phases) {
  const st = p ? p.statut : '';
  const lignesP = p ? (p.lignes || []) : [];
  const multi = lignesP.length > 1;
  const h = heuresPointage(p);
  const cleL = lignesP[0] ? clePhase(lignesP[0].ouvrage, lignesP[0].phase) : '';
  const optsPhase = phases.some(o => o[0] === cleL) ? phases : phases.concat([[cleL, libPhase(lignesP[0] && lignesP[0].ouvrage, lignesP[0] && lignesP[0].phase) + ' (hors BTE)']]);
  const statut = `<select class="input pt-statut ${st ? 'st-' + st : ''}" data-change="ptStatut" data-k="${esc(k.id)}" aria-label="Statut ${esc(nomCompagnon(k))}">
      <option value="">— Non pointé —</option>${STATUTS_POINTAGE.map(([v, l]) => `<option value="${v}" ${st === v ? 'selected' : ''}>${l}</option>`).join('')}</select>`;
  let heures = '<span class="muted">—</span>', phase = '';
  if (st === 'present') {
    heures = multi ? `<b>${fmt(h)}</b>` : `<input class="input cell pt-num" type="number" inputmode="decimal" min="0" max="24" step="0.5" value="${h || ''}" data-change="ptHeures" data-k="${esc(k.id)}" aria-label="Heures ${esc(nomCompagnon(k))}">`;
    phase = multi ? `<button class="btn ghost sm pt-multi" data-act="ptVentiler" data-k="${esc(k.id)}">${icone('layers', 'sm')}${lignesP.length} phases : ${lignesP.map(l => esc(l.phase || 'non ventilé')).join(', ')}</button>`
      : `<select class="input pt-phase" data-change="ptPhaseLigne" data-k="${esc(k.id)}" aria-label="Phase ${esc(nomCompagnon(k))}">${optsPhase.map(([v, t]) => `<option value="${esc(v)}" ${v === cleL ? 'selected' : ''}>${esc(t)}</option>`).join('')}</select>`;
  } else if (st) phase = `<span class="muted small">${st === 'intemperie' ? 'Arrêt intempéries — déclaration CIBTP' : 'Absence — non imputée au chantier'}</span>`;
  const intemp = st === 'present' || st === 'intemperie'
    ? `<input class="input cell pt-num" type="number" inputmode="decimal" min="0" max="24" step="0.5" value="${num(p.intemp) || ''}" placeholder="0" data-change="ptIntemp" data-k="${esc(k.id)}" aria-label="Heures d'intempéries ${esc(nomCompagnon(k))}">` : '';
  const panier = st === 'present' ? `<label class="checkbox"><input type="checkbox" ${p.panier ? 'checked' : ''} data-change="ptPanier" data-k="${esc(k.id)}"><span class="pt-lbl-m">Panier</span></label>` : '';
  return `<div class="pt-row ${st ? '' : 'pt-vide'}">
    <div class="pt-who"><span class="avatar">${initiales(nomCompagnon(k))}</span><div><div class="strong">${esc(nomCompagnon(k))}</div><div class="sub">${esc(k.qualification || '')}${k.interim ? ' · ' + esc(k.interim) : ''}${p && p.obs ? ` · ${icone('notebook-pen', 'sm')} ${esc(p.obs)}` : ''}</div></div></div>
    <div>${statut}</div>
    <div class="num"><span class="pt-lbl-m">Heures</span>${heures}</div>
    <div class="pt-ph">${phase}</div>
    <div class="num">${intemp ? `<span class="pt-lbl-m">Intemp.</span>${intemp}` : ''}</div>
    <div>${panier}</div>
    <div class="pt-act"><button class="btn ghost icon sm" data-act="ptVentiler" data-k="${esc(k.id)}" title="Détail : plusieurs phases, intempéries, observation" aria-label="Détail du pointage">${icone('layers', 'sm')}</button></div>
  </div>`;
}

// Budget d'heures par phase : pointé (toutes sources) face au budget et à l'avancement
function budgetHeures(c, suivi, jour) {
  if (!suivi.rows.length) {
    return `<div class="card">${vide('calculator', 'Pas encore de budget d\'heures', 'Construisez ou importez le BTE pour comparer les heures pointées au budget de chaque phase.', `<button class="btn" data-nav="bte">${icone('calculator')}Budget (BTE)</button>`)}</div>`;
  }
  const duJour = k => jour.parPhase.filter(p => clePhase(p.ouvrage, p.phase) === k).reduce((t, p) => t + p.heures, 0);
  const rows = suivi.rows.map(r => {
    const reste = r.budget - r.heures;
    const conso = r.budget ? r.heures / r.budget : 0;
    const alerte = r.heures > 0 && conso > r.pct + 0.1;
    return `<tr>
      <td><div class="strong">${esc(r.phase)}</div><div class="sub">${esc(r.ouvrage)}</div></td>
      <td class="num">${duJour(clePhase(r.ouvrage, r.phase)) ? fmt(duJour(clePhase(r.ouvrage, r.phase))) : '<span class="muted">—</span>'}</td>
      <td class="num">${fmt(r.budget)}</td>
      <td class="num strong">${fmt(r.heures)}</td>
      <td class="num"><div style="width:110px;margin-left:auto">${barre(conso, conso > 1 ? 'neg' : '')}</div><div class="sub">${pc(conso)} consommé</div></td>
      <td class="num"><div style="width:110px;margin-left:auto">${barre(r.pct, r.pct >= 1 ? 'pos' : '')}</div><div class="sub">${pc(r.pct)} réalisé</div></td>
      <td class="num ${reste < 0 ? 'neg' : ''}">${fmt(reste)}</td>
      <td class="num">${alerte ? `<span class="badge warn">${icone('triangle-alert', 'sm')}Consommé &gt; réalisé</span>` : r.heures ? `<span class="${cls(r.ecartH)} strong">${signe(r.ecartH)} h</span>` : '<span class="muted">—</span>'}</td></tr>`;
  }).join('');
  const T = suivi.tot;
  return `<div class="card"><div class="card-head"><h3>Budget d'heures par phase</h3><span class="hint">Cumul pointé depuis le début du chantier · % réalisé saisi dans le suivi hebdomadaire</span></div>
    <div class="table-wrap"><table class="table">
      <thead><tr><th>Phase</th><th class="num">Aujourd'hui</th><th class="num">Budget h</th><th class="num">Pointé h</th><th class="num">Consommation</th><th class="num">Avancement</th><th class="num">Reste h</th><th class="num">Écart</th></tr></thead>
      <tbody>${rows}
        <tr class="total"><td>Total</td><td class="num">${fmt(jour.tot.heures)}</td><td class="num">${fmt(T.budget)}</td><td class="num">${fmt(T.heures)}</td><td class="num">${T.budget ? pc(T.heures / T.budget) : '—'}</td><td class="num">${pc(T.pct)}</td><td class="num ${T.budget - T.heures < 0 ? 'neg' : ''}">${fmt(T.budget - T.heures)}</td><td class="num ${cls(T.ecartH)}">${signe(T.ecartH)} h</td></tr>
        ${T.horsBTE ? `<tr><td colspan="3" class="muted">Heures hors BTE ou non ventilées</td><td class="num neg">${fmt(T.horsBTE)}</td><td colspan="4" class="small muted">comptées dans la main d'œuvre réelle</td></tr>` : ''}
      </tbody></table></div>
    <div class="card-foot row"><span class="small muted">Écart = budget × % réalisé − heures pointées. Mettez à jour le % de chaque phase chaque semaine.</span><span class="grow"></span><button class="btn ghost sm" data-act="ptVersSuivi">Saisir les % de la semaine ${icone('chevron-right', 'sm')}</button></div></div>`;
}

function vPointageSemaine(c, lun) {
  const jours = Array.from({ length: 7 }, (_, i) => addDays(lun, i));
  const syn = synthesePointage(db, c.id, lun, addDays(lun, 6));
  const avecWE = syn.pointages.some(p => p.date >= jours[5]);
  const visibles = avecWE ? jours : jours.slice(0, 5);
  const pointes = new Set(syn.pointages.map(p => p.compagnonId));
  const liste = compagnonsDe(c.id, true).filter(k => k.actif !== false || pointes.has(k.id));
  const code = st => (STATUTS_POINTAGE.find(s => s[0] === st) || [])[2] || '';
  const totJour = d => syn.pointages.filter(p => p.date === d).reduce((t, p) => t + heuresPointage(p), 0);
  const lignes = liste.map(k => {
    const pk = syn.parCompagnon[k.id] || { heures: 0, intemp: 0, paniers: 0, jours: 0 };
    return `<tr><td><div class="row" style="gap:10px;flex-wrap:nowrap"><span class="avatar">${initiales(nomCompagnon(k))}</span><div><div class="strong">${esc(nomCompagnon(k))}</div><div class="sub">${esc(k.qualification || '')}</div></div></div></td>
      ${visibles.map(d => {
        const p = syn.pointages.find(x => x.date === d && x.compagnonId === k.id);
        let inner = '<span class="muted">·</span>';
        if (p && p.statut === 'present') inner = `<b>${fmt(heuresPointage(p))}</b>${num(p.intemp) ? `<div class="sub">+${fmt(num(p.intemp))} I</div>` : (p.lignes || []).length > 1 ? `<div class="sub">${p.lignes.length} phases</div>` : ''}`;
        else if (p) inner = `<span class="badge ${CLS_STATUT_PT[p.statut] || ''}">${code(p.statut)}</span>`;
        return `<td class="num pt-cel ${d === aujourdHui() ? 'pt-auj' : ''}" data-act="ptJour" data-d="${d}" title="Ouvrir le pointage du ${fmtDate(d)}">${inner}</td>`;
      }).join('')}
      <td class="num strong">${fmt(pk.heures)}</td><td class="num">${pk.intemp ? fmt(pk.intemp) : '—'}</td><td class="num">${pk.paniers || '—'}</td></tr>`;
  }).join('');
  const lib = d => new Date(d + 'T00:00:00').toLocaleDateString('fr-FR', { weekday: 'short' }).replace('.', '');
  const grille = `<div class="card"><div class="card-head"><h3>Relevé d'heures de la semaine</h3><span class="hint">Cliquez sur une case pour saisir la journée · P présent · I intempéries · CP congés · M maladie · F formation · A absent</span></div>
    <div class="table-wrap"><table class="table pt-grille">
      <thead><tr><th>Compagnon</th>${visibles.map(d => `<th class="num ${d === aujourdHui() ? 'pt-auj' : ''}">${lib(d)}<div style="font-weight:500;text-transform:none;letter-spacing:0">${fmtDateCourt(d)}</div></th>`).join('')}<th class="num">Heures</th><th class="num">Intemp.</th><th class="num">Paniers</th></tr></thead>
      <tbody>${lignes}
        <tr class="total"><td>Total</td>${visibles.map(d => `<td class="num">${totJour(d) ? fmt(totJour(d)) : '—'}</td>`).join('')}<td class="num">${fmt(syn.tot.heures)}</td><td class="num">${syn.tot.intemp ? fmt(syn.tot.intemp) : '—'}</td><td class="num">${syn.tot.paniers || '—'}</td></tr>
      </tbody></table></div></div>`;

  // Heures de la semaine par phase, telles qu'elles entrent dans le suivi hebdo
  const manu = deCh(db.suivi).filter(s => s.semaine === lun);
  const parPhase = syn.parPhase.slice().sort((a, b) => !a.phase - !b.phase);
  const phasesBte = new Set(phasesBTE(db, c.id).map(p => clePhase(p.ouvrage, p.phase)));
  const ventil = `<div class="card"><div class="card-head"><h3>Heures par phase → suivi hebdomadaire</h3><span class="hint">Semaine ${semISO(lun)}</span></div>
    ${parPhase.length ? `<div class="table-wrap"><table class="table"><thead><tr><th>Phase</th><th class="num">Pointées</th><th class="num">Saisie manuelle</th><th class="num">Total semaine</th></tr></thead><tbody>
      ${parPhase.map(p => {
        const m = manu.filter(s => s.ouvrage === p.ouvrage && s.phase === p.phase).reduce((t, s) => t + num(s.heures), 0);
        const hors = !phasesBte.has(clePhase(p.ouvrage, p.phase));
        return `<tr><td><span class="strong">${esc(p.phase || 'Non ventilé')}</span>${p.ouvrage ? ` <span class="sub">· ${esc(p.ouvrage)}</span>` : ''}${hors ? ` <span class="badge warn">hors BTE</span>` : ''}</td><td class="num">${fmt(p.heures)}</td><td class="num">${m ? fmt(m) : '—'}</td><td class="num strong">${fmt(p.heures + m)}</td></tr>`;
      }).join('')}</tbody></table></div>` : `<div class="card-body"><p class="muted">Aucune heure pointée cette semaine.</p></div>`}
    <div class="card-foot row"><span class="small muted">Les heures saisies manuellement dans le suivi s'ajoutent au pointage (intérim facturé à l'heure, régularisations…).</span><span class="grow"></span><button class="btn ghost sm" data-act="ptVersSuivi">Ouvrir le suivi S${semISO(lun)} ${icone('chevron-right', 'sm')}</button></div></div>`;
  const kpis = `<div class="card mini-stats">
    <div><div class="ms-lbl">${icone('clock', 'sm')}Heures travaillées</div><div class="ms-val">${fmt(syn.tot.heures)} h</div><div class="xs muted">${accord(fmt(syn.tot.heures / hjDe(c), 1), 'jour(s)-homme')}</div></div>
    <div><div class="ms-lbl">${icone('cloud-rain', 'sm')}Intempéries</div><div class="ms-val">${fmt(syn.tot.intemp)} h</div><div class="xs muted">à déclarer à la caisse CIBTP</div></div>
    <div><div class="ms-lbl">${icone('banknote', 'sm')}Paniers</div><div class="ms-val">${syn.tot.paniers}</div><div class="xs muted">indemnités repas</div></div>
    <div><div class="ms-lbl">${icone('user', 'sm')}Absences</div><div class="ms-val">${syn.tot.absences} j</div><div class="xs muted">congés, maladie, formation…</div></div></div>`;
  return `<div class="stack">${kpis}${grille}${ventil}</div>`;
}

/* ================================ Modales ================================ */
function modalEquipePt() {
  const c = ch();
  const comps = compagnonsDe(c.id, true);
  const autres = db.chantiers.filter(x => x.id !== c.id && compagnonsDe(x.id).length);
  ouvrirModal('Équipe du chantier', `
    ${comps.length ? `<div class="pt-equipe">${comps.map(k => `<div class="res-item ${k.actif === false ? 'pt-inactif' : ''}">
      <span class="avatar">${initiales(nomCompagnon(k))}</span>
      <div class="grow"><div class="strong">${esc(nomCompagnon(k))}${k.actif === false ? ' <span class="badge">inactif</span>' : ''}</div><div class="sub">${esc([k.qualification, k.matricule ? 'Mat. ' + k.matricule : '', k.interim].filter(Boolean).join(' · '))}</div></div>
      <button class="btn ghost icon sm" data-act="ptCompagnon" data-k="${esc(k.id)}" aria-label="Modifier">${icone('pencil', 'sm')}</button>
    </div>`).join('')}</div>` : '<p class="muted">Aucun compagnon pour l\'instant.</p>'}
    ${autres.length ? `<div class="row" style="margin-top:16px;gap:8px">${selectHTML('ptSource', 'Reprendre l\'équipe d\'un autre chantier', autres.map(x => [x.id, `${x.nom} (${compagnonsDe(x.id).length})`]), autres[0].id)}
      <button class="btn" style="align-self:flex-end;margin-bottom:14px" data-act="ptImporterEquipe">${icone('copy')}Reprendre</button></div>` : ''}`,
    `<button class="btn" data-act="fermerModal">Fermer</button><button class="btn primary" data-act="ptCompagnon">${icone('plus')}Ajouter un compagnon</button>`,
    { icone: 'users', sousTitre: `${accord(compagnonsDe(c.id).length, 'compagnon(s) actif(s)')} sur ${esc(c.nom)}` });
}

function modalCompagnon(k) {
  const e = k || { qualification: 'Compagnon', actif: true };
  ouvrirModal(k ? 'Modifier le compagnon' : 'Nouveau compagnon', `
    <input type="hidden" id="kId" value="${esc(k ? k.id : '')}">
    <div class="form-grid">${champ('kPrenom', 'Prénom', e.prenom)}${champ('kNom', 'Nom *', e.nom)}</div>
    <div class="form-grid">${selectHTML('kQualif', 'Qualification', QUALIFICATIONS, e.qualification)}${champ('kMat', 'Matricule', e.matricule)}</div>
    ${champ('kInterim', 'Agence d\'intérim (le cas échéant)', e.interim, 'text', 'placeholder="laisser vide pour un salarié"')}
    ${k ? `<label class="checkbox field"><input type="checkbox" id="kActif" ${e.actif !== false ? 'checked' : ''}><span><b>Actif sur le chantier</b> — décocher quand le compagnon quitte le chantier (ses pointages sont conservés)</span></label>` : ''}`,
    `${k ? `<button class="btn danger" data-act="ptCompagnonSuppr" data-k="${esc(k.id)}" style="margin-right:auto">${icone('trash-2')}Supprimer</button>` : ''}<button class="btn" data-act="ptEquipe">Retour</button><button class="btn primary" data-act="ptCompagnonSave">Enregistrer</button>`,
    { icone: 'hard-hat' });
}

let _ptLignes = [];
function modalVentilation(kid) {
  const c = ch();
  const date = datePt();
  const k = (db.compagnons || []).find(x => x.id === kid);
  const p = pointageDe(c.id, date, kid) || Object.assign({ statut: 'present', obs: '' }, champsStatut(c, 'present', kid));
  _ptLignes = (p.lignes || []).map(l => Object.assign({}, l));
  if (p.statut === 'present' && !_ptLignes.length) _ptLignes.push(ligneDepuisCle(phaseParDefaut(c), hjDe(c)));
  ouvrirModal(nomCompagnon(k), `
    <input type="hidden" id="vK" value="${esc(kid)}">
    <div class="form-grid">${selectHTML('vStatut', 'Statut', STATUTS_POINTAGE.map(s => [s[0], s[1]]), p.statut, 'data-change="vStatut"')}
      ${champ('vIntemp', 'Heures d\'intempéries', num(p.intemp) || '', 'number', 'min="0" max="24" step="0.5" placeholder="0"')}</div>
    <div id="vBlocLignes" class="${p.statut === 'present' ? '' : 'hidden'}">
      <div class="label" style="margin-bottom:6px">Répartition des heures par phase</div>
      <div id="vLignes"></div>
      <button class="btn sm" data-act="vAjout" style="margin:6px 0 14px">${icone('plus', 'sm')}Ajouter une phase</button>
      <label class="checkbox field"><input type="checkbox" id="vPanier" ${p.panier ? 'checked' : ''}><span>Panier repas</span></label>
    </div>
    ${zoneTexte('vObs', 'Observation', p.obs, 'rows="2" placeholder="tâche particulière, retard, départ anticipé…"')}`,
    `${pointageDe(c.id, date, kid) ? `<button class="btn danger" data-act="vSuppr" style="margin-right:auto">${icone('trash-2')}Effacer</button>` : ''}<button class="btn" data-act="fermerModal">Annuler</button><button class="btn primary" data-act="vSave">Enregistrer</button>`,
    { icone: 'clock', sousTitre: `${esc(k && k.qualification || '')} · ${fmtDate(date, true)}`, pasDeFocus: true });
  renderLignesPt();
}
function lireLignesPt() {
  _ptLignes = $$('#vLignes .v-ligne').map(el => ligneDepuisCle($('select', el).value, num($('input', el).value)));
}
function renderLignesPt() {
  const c = ch();
  const phases = optionsPhases(c);
  const total = _ptLignes.reduce((t, l) => t + num(l.h), 0);
  $('#vLignes').innerHTML = _ptLignes.map((l, i) => {
    const cle = clePhase(l.ouvrage, l.phase);
    const opts = phases.some(o => o[0] === cle) ? phases : phases.concat([[cle, libPhase(l.ouvrage, l.phase) + ' (hors BTE)']]);
    return `<div class="row v-ligne" style="gap:8px;flex-wrap:nowrap;margin-bottom:8px">
      <select class="input" style="flex:1;min-width:0" aria-label="Phase">${opts.map(([v, t]) => `<option value="${esc(v)}" ${v === cle ? 'selected' : ''}>${esc(t)}</option>`).join('')}</select>
      <input class="input" style="width:88px;text-align:right" type="number" inputmode="decimal" min="0" max="24" step="0.5" value="${num(l.h) || ''}" data-input="vTotal" aria-label="Heures">
      <span class="muted small">h</span>
      <button class="btn ghost icon sm" data-act="vRetirer" data-i="${i}" aria-label="Retirer">${icone('x', 'sm')}</button></div>`;
  }).join('') + `<div class="small muted" id="vTotal" style="text-align:right">Total : <b>${fmt(total)} h</b> sur ${fmt(hjDe(c))} h par jour</div>`;
}

/* ================================ Actions ================================ */
Object.assign(ACT, {
  ptMode: el => { ui.ptMode = el.dataset.m; render(); },
  ptNav: el => { const d = num(el.dataset.d); ui.ptDate = d ? addDays(datePt(), d) : aujourdHui(); render(); },
  ptAller: el => { ui.ptDate = el.dataset.d; ui.ptMode = 'jour'; allerA('pointage'); },
  ptJour: el => { ui.ptDate = el.dataset.d; ui.ptMode = 'jour'; render(); scrollTo(0, 0); },
  ptVersSuivi: () => { ui.semaine = lundi(datePt()); allerA('suivi'); },
  ptEquipe: () => modalEquipePt(),
  ptCompagnon: el => modalCompagnon(el.dataset.k ? (db.compagnons || []).find(k => k.id === el.dataset.k) : null),
  ptCompagnonSave: () => {
    const nom = val('kNom'), prenom = val('kPrenom');
    if (!nom && !prenom) return toast('Le nom est obligatoire.', 'alerte');
    db.compagnons = db.compagnons || [];
    const id = val('kId');
    const champs = { nom, prenom, qualification: val('kQualif'), matricule: val('kMat'), interim: val('kInterim') };
    if (id) Object.assign(db.compagnons.find(k => k.id === id), champs, { actif: $('#kActif').checked });
    else db.compagnons.push(Object.assign({ id: uid(), chantierId: ui.chantierId, actif: true }, champs));
    save(); render(); modalEquipePt();
    toast(id ? 'Compagnon modifié' : 'Compagnon ajouté', 'succes');
  },
  ptCompagnonSuppr: async el => {
    const kid = el.dataset.k;
    const n = (db.pointages || []).filter(p => p.compagnonId === kid).length;
    if (n) {
      if (!await confirmer('Compagnon déjà pointé', `${accord(n, 'pointage(s)')} existent pour ce compagnon : il est passé en <b>inactif</b> pour conserver l'historique des heures.`, { ok: 'Passer en inactif', icone: 'hard-hat' })) return modalEquipePt();
      db.compagnons.find(k => k.id === kid).actif = false;
    } else {
      if (!await confirmer('Supprimer le compagnon', 'Ce compagnon sera retiré de l\'équipe.', { ok: 'Supprimer', danger: true })) return modalEquipePt();
      db.compagnons = db.compagnons.filter(k => k.id !== kid);
    }
    save(); render(); modalEquipePt();
  },
  ptImporterEquipe: () => {
    const src = val('ptSource');
    const existants = new Set(compagnonsDe(ui.chantierId, true).map(k => norm(nomCompagnon(k))));
    const nouveaux = compagnonsDe(src).filter(k => !existants.has(norm(nomCompagnon(k))))
      .map(k => ({ id: uid(), chantierId: ui.chantierId, nom: k.nom, prenom: k.prenom, qualification: k.qualification, matricule: k.matricule, interim: k.interim, actif: true }));
    db.compagnons.push(...nouveaux);
    save(); render(); modalEquipePt();
    toast(nouveaux.length ? `${accord(nouveaux.length, 'compagnon(s) ajouté(s)')}` : 'Toute l\'équipe est déjà présente', nouveaux.length ? 'succes' : 'info');
  },
  ptTous: () => {
    const c = ch(), date = datePt();
    let n = 0;
    compagnonsDe(c.id).forEach(k => { if (!pointageDe(c.id, date, k.id)) { majPointage(k.id, date, champsStatut(c, 'present', k.id)); n++; } });
    render(); toast(`${accord(n, 'compagnon(s) pointé(s) présent(s)')}`, 'succes');
  },
  ptCopier: () => {
    const c = ch(), date = datePt();
    const avant = pointagesDe(db, c.id, null, addDays(date, -1));
    if (!avant.length) return toast('Aucun jour pointé avant cette date.', 'info');
    const veille = avant[avant.length - 1].date;
    let n = 0;
    avant.filter(p => p.date === veille).forEach(p => {
      const k = (db.compagnons || []).find(x => x.id === p.compagnonId);
      if (!k || k.actif === false || pointageDe(c.id, date, p.compagnonId)) return;
      majPointage(p.compagnonId, date, { statut: p.statut, lignes: (p.lignes || []).map(l => Object.assign({}, l)), intemp: p.statut === 'intemperie' ? num(p.intemp) : 0, panier: !!p.panier, obs: '' });
      n++;
    });
    render(); toast(n ? `Pointage du ${fmtDate(veille)} repris pour ${accord(n, 'compagnon(s)')}` : 'Tous les compagnons sont déjà pointés', n ? 'succes' : 'info');
  },
  ptAppliquer: () => {
    const c = ch(), date = datePt(), cle = phaseParDefaut(c);
    let n = 0;
    pointagesDe(db, c.id, date, date).forEach(p => {
      if (p.statut !== 'present' || (p.lignes || []).length > 1) return;
      majPointage(p.compagnonId, date, { lignes: [ligneDepuisCle(cle, heuresPointage(p) || hjDe(c))] }); n++;
    });
    render(); toast(`${accord(n, 'compagnon(s) affecté(s)')} à ${libPhase(...cle.split('||'))}`, 'succes');
  },
  ptVentiler: el => modalVentilation(el.dataset.k),
  vAjout: () => { lireLignesPt(); const c = ch(); const reste = Math.max(0, hjDe(c) - _ptLignes.reduce((t, l) => t + num(l.h), 0)); _ptLignes.push(ligneDepuisCle(phaseParDefaut(c), reste)); renderLignesPt(); },
  vRetirer: el => { lireLignesPt(); _ptLignes.splice(num(el.dataset.i), 1); renderLignesPt(); },
  vSuppr: () => { supprimerPointage(val('vK'), datePt()); fermerModal(); render(); toast('Pointage effacé', 'succes'); },
  vSave: () => {
    const statut = val('vStatut');
    lireLignesPt();
    const lignes = statut === 'present' ? _ptLignes.filter(l => num(l.h) > 0) : [];
    const total = lignes.reduce((t, l) => t + num(l.h), 0);
    if (total > 24) return toast('Plus de 24 h sur une journée : vérifiez la saisie.', 'alerte');
    majPointage(val('vK'), datePt(), { statut, lignes, intemp: Math.max(0, num(val('vIntemp'))), panier: statut === 'present' && $('#vPanier').checked, obs: val('vObs') });
    fermerModal(); render(); toast('Pointage enregistré', 'succes');
  },
  ptReleve: () => releveHeuresPDF(lundi(datePt()))
});

Object.assign(CHG, {
  ptDate: el => { if (el.value) { ui.ptDate = el.value; render(); } },
  ptDefaut: el => { ui.ptPhase = el.value; saveUI(); },
  ptStatut: el => {
    const c = ch(), kid = el.dataset.k, date = datePt();
    if (!el.value) supprimerPointage(kid, date);
    else majPointage(kid, date, Object.assign(champsStatut(c, el.value, kid), { obs: (pointageDe(c.id, date, kid) || {}).obs || '' }));
    render();
  },
  ptHeures: el => {
    const c = ch(), kid = el.dataset.k, date = datePt();
    const p = pointageDe(c.id, date, kid);
    const h = Math.max(0, Math.min(24, num(el.value)));
    const l = (p && p.lignes && p.lignes[0]) || ligneDepuisCle(phaseParDefaut(c), 0);
    majPointage(kid, date, { lignes: [Object.assign({}, l, { h })] });
    render();
  },
  ptPhaseLigne: el => {
    const c = ch(), kid = el.dataset.k, date = datePt();
    const p = pointageDe(c.id, date, kid);
    const h = p && p.lignes && p.lignes[0] ? num(p.lignes[0].h) : hjDe(c);
    majPointage(kid, date, { lignes: [ligneDepuisCle(el.value, h)] });
    render();
  },
  ptIntemp: el => { majPointage(el.dataset.k, datePt(), { intemp: Math.max(0, Math.min(24, num(el.value))) }); render(); },
  ptPanier: el => { majPointage(el.dataset.k, datePt(), { panier: el.checked }); render(); },
  vStatut: el => {
    $('#vBlocLignes').classList.toggle('hidden', el.value !== 'present');
    if (el.value === 'present' && !$$('#vLignes .v-ligne').length) { _ptLignes = [ligneDepuisCle(phaseParDefaut(ch()), hjDe(ch()))]; renderLignesPt(); }
    if (el.value === 'intemperie' && !num(val('vIntemp'))) $('#vIntemp').value = hjDe(ch());
  }
});

Object.assign(INP, {
  vTotal: () => { const t = $$('#vLignes .v-ligne input').reduce((s, i) => s + num(i.value), 0); const el = $('#vTotal'); if (el) el.innerHTML = `Total : <b>${fmt(t)} h</b> sur ${fmt(hjDe(ch()))} h par jour`; }
});
