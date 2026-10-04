/* ==========================================================================
   OmSmK — « Ma journée » : le cockpit du conducteur de travaux, tous
   chantiers confondus (actions, agenda, alertes, état des chantiers).
   ========================================================================== */
// deno-lint-ignore-file no-unused-vars
'use strict';

const ORDRE_SEV = { critical: 0, serious: 1, warning: 2, good: 3 };
const chantiersActifs = () => db.chantiers.filter(c => { const st = statutChantier(c); return st.txt !== 'À venir' || (c.dateDebut && c.dateDebut <= addDays(aujourdHui(), 14)); });
const badgeChantier = c => c ? `<span class="badge brand">${esc(c.nom)}</span>` : '';

// Toutes les alertes de tous les chantiers (BTE, planning, sécurité, actions…)
function alertesGlobales() {
  const out = [];
  db.chantiers.forEach(c => {
    const s = calcSuivi(db, c.id);
    alertes(c, s).forEach(a => out.push(Object.assign({ c }, a)));
    etatSecurite(c).alertes.forEach(a => out.push(Object.assign({ c }, a)));
  });
  return out.sort((a, b) => (ORDRE_SEV[a.sev] ?? 9) - (ORDRE_SEV[b.sev] ?? 9));
}

// Événements à venir sur n jours (réunions, jalons, livraisons, démarrages de phases, échéances de réserves)
function agenda(jours = 7) {
  const auj = aujourdHui(), fin = addDays(auj, jours);
  const ev = [];
  const dans = d => d && d >= auj && d <= fin;
  db.chantiers.forEach(c => {
    const der = reunionsDe(c.id)[0];
    if (der && der.prochaine && dans(der.prochaine.date)) ev.push({ d: der.prochaine.date, h: der.prochaine.heure, ic: 'messages-square', t: `${der.type || 'Réunion'} n° ${num(der.numero) + 1}`, c, v: 'reunions' });
    ((c.jalons) || []).filter(j => !j.fait && dans(j.date)).forEach(j => ev.push({ d: j.date, ic: 'flag', t: `Jalon : ${j.libelle}`, c, v: 'planning' }));
    (db.commandes || []).filter(x => x.chantierId === c.id && commandeEngagee(x) && !commandeLivree(x) && x.livraisonPrevue && x.livraisonPrevue <= fin)
      .forEach(x => ev.push({ d: x.livraisonPrevue < auj ? auj : x.livraisonPrevue, ic: 'truck', t: `Livraison ${x.numero} — ${x.fournisseur || ''}`, sub: x.livraisonPrevue < auj ? `prévue le ${fmtDateCourt(x.livraisonPrevue)}, en retard` : '', retard: x.livraisonPrevue < auj, c, v: 'commandes' }));
    Object.entries(c.planning || {}).forEach(([k, p]) => { if (dans(p.debut) && p.debut > auj) ev.push({ d: p.debut, ic: 'chart-gantt', t: `Démarrage : ${k.split('||')[1]}`, c, v: 'planning' }); });
    (db.reserves || []).filter(r => r.chantierId === c.id && r.statut !== 'levée' && dans(r.echeance)).forEach(r => ev.push({ d: r.echeance, ic: 'shield-check', t: `Levée réserve ${numeroReserve(r)}`, sub: r.description, c, v: 'qualite' }));
  });
  return ev.sort((a, b) => (a.d + (a.h || '')).localeCompare(b.d + (b.h || '')));
}

function vJournee() {
  if (!db.chantiers.length) return vAccueil();
  const auj = aujourdHui();
  const toutes = actionsDe(db).filter(a => db.chantiers.some(c => c.id === a.chantierId));
  const ouvertes = toutes.filter(actionOuverte);
  const retard = ouvertes.filter(a => actionEnRetard(a, auj));
  const semaine = ouvertes.filter(a => a.echeance && a.echeance >= auj && a.echeance <= addDays(auj, 7));
  const al = alertesGlobales();
  const crit = al.filter(a => a.sev === 'critical' || a.sev === 'serious');
  const ag = agenda(7);
  const actifs = chantiersActifs();
  const h = new Date().getHours();
  const salut = h < 12 ? 'Bonjour' : h < 18 ? 'Bon après-midi' : 'Bonsoir';
  const entete = enTetePage({ eyebrow: fmtDate(auj, true), titre: `${salut}${user && user.prenom ? ' ' + user.prenom : ''}`,
    sous: [sousInfo('briefcase', `${actifs.length} chantier(s) actif(s)`), retard.length ? `<span class="badge neg">${retard.length} action(s) en retard</span>` : '<span class="badge pos">Aucune action en retard</span>'],
    actions: `<button class="btn" data-nav="portefeuille">${icone('briefcase')}Portefeuille</button><button class="btn primary" data-act="cpNouvelleAction">${icone('plus')}Nouvelle action</button>` });

  const kpis = `<div class="resume">
    <div><span>Actions en retard</span><b class="${retard.length ? 'neg' : ''}">${retard.length}</b><small>${ouvertes.length} action(s) ouverte(s) au total</small></div>
    <div><span>À échéance sous 7 jours</span><b>${semaine.length}</b><small>${semaine.filter(a => a.echeance === auj).length} pour aujourd'hui</small></div>
    <div><span>Alertes importantes</span><b class="${crit.length ? 'neg' : ''}">${crit.length}</b><small>${al.length} point(s) d'attention sur ${db.chantiers.length} chantier(s)</small></div>
  </div>`;

  const aFaire = retard.concat(ouvertes.filter(a => !actionEnRetard(a, auj) && (!a.echeance || a.echeance <= addDays(auj, 7)))).slice(0, 14);
  const carteActions = `<div class="card"><div class="card-head"><h3>${icone('list-todo')}À faire</h3><span class="hint">en retard et sous 7 jours · tous chantiers</span></div>
    <div class="card-body act-rapide">${datalistResponsables(ui.chantierId || (db.chantiers[0] || {}).id)}
      <select class="input" id="cpCh" style="max-width:190px" aria-label="Chantier">${db.chantiers.map(c => `<option value="${esc(c.id)}" ${c.id === ui.chantierId ? 'selected' : ''}>${esc(c.nom)}</option>`).join('')}</select>
      <input class="input grow" id="cpLib" placeholder="Nouvelle action…" aria-label="Libellé de l'action">
      <input class="input" id="cpEch" type="date" value="${addDays(auj, 2)}" style="max-width:150px" aria-label="Échéance">
      <button class="btn primary" data-act="cpAjout">${icone('plus')}</button></div>
    ${aFaire.length ? aFaire.map(a => ligneAction(a, { chantier: db.chantiers.length > 1 })).join('') : `<div class="card-body row"><span class="sev good">${icone('circle-check', 'sm')}</span><span class="muted">Rien d'urgent. Profitez-en pour passer sur un chantier.</span></div>`}
    ${ouvertes.length > aFaire.length ? `<div class="card-foot small muted">${ouvertes.length - aFaire.length} autre(s) action(s) à plus long terme</div>` : ''}</div>`;

  const jourLib = d => d === auj ? 'Aujourd\'hui' : d === addDays(auj, 1) ? 'Demain' : new Date(d + 'T00:00:00').toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'short' });
  let dernierJour = '';
  const carteAgenda = `<div class="card"><div class="card-head"><h3>${icone('calendar-range')}Agenda</h3><span class="hint">${ag.length} événement(s) · 7 prochains jours</span></div>
    ${ag.length ? `<ul class="agenda">${ag.map(e => {
      const sep = e.d !== dernierJour ? `<li class="ag-jour">${jourLib(e.d)}</li>` : '';
      dernierJour = e.d;
      return sep + `<li><button class="ag-item" data-act="cpAller" data-id="${esc(e.c.id)}" data-v="${e.v}"><span class="f-ico ${e.retard ? 'warn' : 'info'}">${icone(e.ic, 'sm')}</span>
        <span class="grow"><span class="strong">${e.h ? esc(e.h) + ' · ' : ''}${esc(e.t)}</span>${e.sub ? `<span class="sub">${esc(e.sub)}</span>` : ''}</span>${db.chantiers.length > 1 ? badgeChantier(e.c) : ''}</button></li>`;
    }).join('')}</ul>` : '<div class="card-body muted">Rien de prévu. Programmez la prochaine réunion depuis le dernier compte rendu, et les jalons depuis le planning.</div>'}</div>`;

  const carteAlertes = `<div class="card"><div class="card-head"><h3>${icone('triangle-alert')}Points d'attention</h3><span class="badge ${al.length ? 'warn' : 'pos'}">${al.length || 'Aucun'}</span></div>
    ${al.length ? `<ul class="attention-list">${(ui.cpTout ? al : al.slice(0, 5)).map(a => `<li><span class="sev ${a.sev}">${icone(a.ic, 'sm')}</span><div class="grow"><div class="strong">${a.t}</div><div class="small muted">${a.d}</div>${db.chantiers.length > 1 ? `<div style="margin-top:4px">${badgeChantier(a.c)}</div>` : ''}</div>
      ${a.go ? `<button class="btn ghost sm" data-act="cpAller" data-id="${esc(a.c.id)}" data-v="${a.go}" ${a.date ? `data-d="${a.date}"` : ''} aria-label="Ouvrir">${icone('chevron-right', 'sm')}</button>` : ''}</li>`).join('')}</ul>
      ${al.length > 5 ? `<div class="card-foot row"><span class="grow"></span><button class="btn ghost sm" data-act="cpTout">${ui.cpTout ? 'Réduire' : `Tout afficher (${al.length})`}</button></div>` : ''}` : `<div class="card-body row"><span class="sev good">${icone('circle-check', 'sm')}</span><span class="muted">Tous les chantiers sont sous contrôle.</span></div>`}</div>`;

  const lignes = actifs.map(c => {
    const s = calcSuivi(db, c.id), pl = calcPlanning(db, c.id), st = statutChantier(c);
    const ao = ouvertes.filter(a => a.chantierId === c.id).length;
    const ro = deCh(db.reserves, c.id).filter(r => r.statut !== 'levée').length;
    const ptHier = (db.pointages || []).filter(p => p.chantierId === c.id).map(p => p.date).sort().pop();
    return `<tr class="clic" data-act="cpAller" data-id="${esc(c.id)}" data-v="tableau">
      <td><div class="strong">${esc(c.nom)}</div><div class="sub">${esc(c.client || '')}</div></td>
      <td><span class="badge ${st.cls} dot">${st.txt}</span></td>
      <td class="num"><div style="width:90px;margin-left:auto">${barre(s.tot.pct, s.tot.pct >= 1 ? 'pos' : '')}</div><div class="sub">${pc(s.tot.pct)}</div></td>
      <td class="num ${cls(s.tot.impactProj)}">${s.tot.heures ? signeE(s.tot.impactProj) : '—'}</td>
      <td class="num ${pl.retard ? 'neg' : ''}">${pl.finProjetee ? (pl.retard ? `+${pl.retard} j` : 'à l\'heure') : '—'}</td>
      <td class="num ${ao ? '' : 'muted'}">${ao}</td><td class="num ${ro ? 'neg' : 'muted'}">${ro}</td>
      <td class="small muted">${ptHier ? depuis(ptHier) : '—'}</td></tr>`;
  }).join('');
  const carteChantiers = `<div class="card"><div class="card-head"><h3>${icone('briefcase')}Mes chantiers</h3><span class="hint">cliquez pour ouvrir le tableau de bord</span></div>
    <div class="table-wrap"><table class="table"><thead><tr><th>Chantier</th><th>Statut</th><th class="num">Avancement</th><th class="num">Impact projeté</th><th class="num">Délai</th><th class="num">Actions</th><th class="num">Réserves</th><th>Dernier pointage</th></tr></thead>
    <tbody>${lignes || '<tr><td colspan="8" class="muted">Aucun chantier en cours.</td></tr>'}</tbody></table></div></div>`;

  return entete + `<div class="stack">${kpis}<div class="grid g-2">${carteActions}${carteAgenda}</div>${carteAlertes}${carteChantiers}</div>`;
}

Object.assign(ACT, {
  cpAller: el => {
    ui.chantierId = el.dataset.id; ui.zone = null;
    if (el.dataset.v === 'pointage' && el.dataset.d) { ui.ptDate = el.dataset.d; ui.ptMode = 'jour'; }
    if (el.dataset.v === 'reunions') ui.reunionId = null;
    allerA(el.dataset.v || 'tableau');
  },
  cpAjout: () => {
    const libelle = val('cpLib');
    if (!libelle) return $('#cpLib').focus();
    creerAction({ chantierId: val('cpCh'), libelle, echeance: val('cpEch'), responsable: nomUser() });
    save(); render(); toast('Action ajoutée', 'succes'); setTimeout(() => { const i = $('#cpLib'); if (i) i.focus(); }, 30);
  },
  cpTout: () => { ui.cpTout = !ui.cpTout; render(); },
  cpNouvelleAction: () => { if (!ui.chantierId && db.chantiers[0]) ui.chantierId = db.chantiers[0].id; const i = $('#cpLib'); if (i) { i.focus(); i.scrollIntoView({ block: 'center' }); } else modalAction(null); }
});
