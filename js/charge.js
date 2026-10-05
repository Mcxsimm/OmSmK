/* ==========================================================================
   OmSmK — plan de charge des équipes (tous chantiers)
   Qui est où dans les semaines à venir, face au besoin en compagnons que
   calcule le planning de chaque chantier.
   ========================================================================== */
// deno-lint-ignore-file no-unused-vars
'use strict';

const STATUTS_AFFECT = { conge: ['Congés', 'CP'], formation: ['Formation', 'F'], maladie: ['Arrêt', 'M'], dispo: ['Disponible', '·'] };
const NB_SEMAINES_CHARGE = 6;
const semainesCharge = () => { const d = ui.chargeDebut && ui.chargeDebut >= addDays(lundi(aujourdHui()), -28) ? ui.chargeDebut : lundi(aujourdHui()); return Array.from({ length: NB_SEMAINES_CHARGE }, (_, i) => addDays(d, 7 * i)); };
const codeChantier = c => (c.code || c.nom).slice(0, 14);
const chantiersCharge = () => db.chantiers.filter(c => !c.dateFin || c.dateFin >= addDays(lundi(aujourdHui()), -7));

function majAffectation(p, semaine, valeur) {
  db.affectations = db.affectations || [];
  const id = idAffectation(p.cle, semaine);
  db.affectations = db.affectations.filter(a => a.id !== id);
  if (valeur) {
    const estChantier = !STATUTS_AFFECT[valeur];
    // Une absence est rattachée au chantier d'origine de la personne (pour la synchronisation)
    db.affectations.push({ id, personne: p.cle, nom: p.nom, semaine, statut: estChantier ? 'chantier' : valeur, chantierId: estChantier ? valeur : p.chantiers[0], par: nomUser() });
  }
}

// Alertes : semaine prochaine (et la courante) en sous-effectif sur un chantier
function alertesCharge(c) {
  const out = [];
  if (!personnesEquipe(db).length || !Object.keys(c.planning || {}).length) return out;
  [lundi(aujourdHui()), addDays(lundi(aujourdHui()), 7)].forEach(s => {
    const besoin = besoinEffectif(db, c.id, s), aff = affectesSemaine(db, c.id, s);
    if (besoin >= 0.5 && aff + 0.5 <= besoin && !out.length) out.push({ sev: 'warning', ic: 'users', t: `Effectif insuffisant en semaine ${semISO(s)}`, d: `${aff} compagnon(s) affecté(s) pour un besoin de ${fmt(besoin, 1)} d'après le planning.`, go: 'charge' });
  });
  return out;
}

function vCharge() {
  const sems = semainesCharge();
  const pers = personnesEquipe(db);
  const chs = chantiersCharge();
  const entete = enTetePage({ eyebrow: 'Organisation des équipes', titre: 'Plan de charge', sous: [sousInfo('users', `${pers.length} personne(s)`), sousInfo('building-2', `${chs.length} chantier(s)`)],
    actions: `<div class="btn-group"><button class="btn icon" data-act="chargeNav" data-d="-7" aria-label="Semaines précédentes">${icone('chevron-left')}</button><button class="btn" data-act="chargeNav" data-d="0">Cette semaine</button><button class="btn icon" data-act="chargeNav" data-d="7" aria-label="Semaines suivantes">${icone('chevron-right')}</button></div>` });
  if (!pers.length) return entete + `<div class="card">${vide('users', 'Aucune équipe enregistrée', 'Le plan de charge réunit les compagnons de tous vos chantiers. Constituez d\'abord l\'équipe de chaque chantier depuis le pointage journalier.', `<button class="btn primary" data-act="espace" data-e="terrain">${icone('hard-hat')}Aller au terrain</button>`)}</div>`;
  const auj = lundi(aujourdHui());
  const tete = `<tr><th>Chantier / compagnon</th>${sems.map(s => `<th class="num ${s === auj ? 'pt-auj' : ''}">S${semISO(s)}<div style="font-weight:500;text-transform:none;letter-spacing:0">${fmtDateCourt(s)}</div></th>`).join('')}</tr>`;
  // Bilan besoin / affectés par chantier
  const lignesCh = chs.map(c => `<tr class="charge-ch"><td><div class="strong">${esc(c.nom)}</div><div class="sub">${Object.keys(c.planning || {}).length ? 'besoin d\'après le planning' : 'planning non établi'}</div></td>${sems.map(s => {
      const b = besoinEffectif(db, c.id, s), a = affectesSemaine(db, c.id, s);
      const manque = b >= 0.5 && a + 0.5 <= b, exces = a > 0 && a >= b + 1.5;
      return `<td class="num ${s === auj ? 'pt-auj' : ''}"><span class="charge-jauge ${manque ? 'manque' : exces ? 'exces' : a || b ? 'ok' : ''}" title="${a} affecté(s) · besoin ${fmt(b, 1)}">${a}<small>/${b ? fmt(b, 1) : '0'}</small></span>${manque ? `<div class="xs neg">${icone('triangle-alert', 'sm')}manque ${fmt(b - a, 1)}</div>` : ''}</td>`;
    }).join('')}</tr>`).join('');
  const opts = (valeur) => `<option value="">—</option>${chs.map(c => `<option value="${esc(c.id)}" ${valeur === c.id ? 'selected' : ''}>${esc(codeChantier(c))}</option>`).join('')}<optgroup label="Absence">${Object.entries(STATUTS_AFFECT).filter(([k]) => k !== 'dispo').map(([k, [l]]) => `<option value="${k}" ${valeur === k ? 'selected' : ''}>${l}</option>`).join('')}</optgroup>`;
  const lignesP = pers.map(p => `<tr><td><div class="row" style="gap:10px;flex-wrap:nowrap"><span class="avatar">${initiales(p.nom)}</span><div><div class="strong">${esc(p.nom)}</div><div class="sub">${esc([p.qualification, p.interim].filter(Boolean).join(' · '))}</div></div></div></td>${sems.map(s => {
      const a = affectationDe(db, p.cle, s);
      const v = a ? (a.statut === 'chantier' ? a.chantierId : a.statut) : '';
      const cls = !a ? 'vide' : a.statut === 'chantier' ? 'chantier' : 'absence';
      return `<td class="${s === auj ? 'pt-auj' : ''}"><select class="input charge-sel ${cls}" data-change="chargeAffecter" data-p="${esc(p.cle)}" data-s="${s}" aria-label="${esc(p.nom)} semaine ${semISO(s)}">${opts(v)}</select></td>`;
    }).join('')}</tr>`).join('');
  const pied = `<tr><td class="small muted">Recopier la semaine précédente</td>${sems.map((s, i) => `<td class="num">${i ? `<button class="btn ghost sm" data-act="chargeRecopier" data-s="${s}" title="Reprendre les affectations de la semaine ${semISO(sems[i - 1])}">${icone('copy', 'sm')}</button>` : ''}</td>`).join('')}</tr>`;
  const manques = chs.flatMap(c => sems.slice(0, 2).map(s => ({ c, s, b: besoinEffectif(db, c.id, s), a: affectesSemaine(db, c.id, s) }))).filter(x => x.b >= 0.5 && x.a + 0.5 <= x.b);
  const libres = pers.filter(p => !affectationDe(db, p.cle, addDays(auj, 7)));
  const resume = `<div class="resume">
      <div><span>Sous-effectifs (2 semaines)</span><b class="${manques.length ? 'neg' : ''}">${manques.length}</b><small>${manques.length ? esc(manques.slice(0, 2).map(x => `${codeChantier(x.c)} S${semISO(x.s)}`).join(' · ')) : 'les besoins sont couverts'}</small></div>
      <div><span>Non affectés semaine prochaine</span><b>${libres.length}</b><small>${libres.length ? esc(libres.slice(0, 3).map(p => p.nom).join(', ')) + (libres.length > 3 ? '…' : '') : 'tout le monde a une affectation'}</small></div>
      <div><span>Absences prévues</span><b>${(db.affectations || []).filter(a => a.statut !== 'chantier' && sems.includes(a.semaine)).length}</b><small>semaines de congés, formation ou arrêt</small></div>
    </div>`;
  return entete + `<div class="stack">${resume}
    <div class="card"><div class="table-wrap"><table class="table charge">
      <thead>${tete}</thead>
      <tbody><tr class="group"><td colspan="${sems.length + 1}">${icone('building-2', 'sm')} Besoin et affectés par chantier</td></tr>${lignesCh}
        <tr class="group"><td colspan="${sems.length + 1}">${icone('users', 'sm')} Affectations des compagnons</td></tr>${lignesP}${pied}</tbody></table></div>
      <div class="card-foot small muted">${icone('info', 'sm')} Besoin = heures restantes des phases du planning réparties sur leurs jours ouvrés, ramenées en compagnons à temps plein. Une même personne présente sur plusieurs chantiers n'apparaît qu'une fois.</div></div></div>`;
}

Object.assign(ACT, {
  chargeNav: el => { const d = num(el.dataset.d); ui.chargeDebut = d ? addDays(semainesCharge()[0], d) : lundi(aujourdHui()); render(); },
  chargeRecopier: el => {
    const s = el.dataset.s, prec = addDays(s, -7);
    let n = 0;
    personnesEquipe(db).forEach(p => {
      const a = affectationDe(db, p.cle, prec);
      if (a && !affectationDe(db, p.cle, s)) { majAffectation(p, s, a.statut === 'chantier' ? a.chantierId : a.statut); n++; }
    });
    save(); render(); toast(n ? `${n} affectation(s) reprise(s) en semaine ${semISO(s)}` : 'Rien à reprendre', n ? 'succes' : 'info');
  }
});
Object.assign(CHG, {
  chargeAffecter: el => {
    const p = personnesEquipe(db).find(x => x.cle === el.dataset.p);
    if (!p) return;
    majAffectation(p, el.dataset.s, el.value);
    save(); render();
  }
});
