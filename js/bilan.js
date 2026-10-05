/* ==========================================================================
   OmSmK — bilan de fin de chantier et dossier de clôture
   Écarts finaux (heures, marge, délai), cadences constatées face aux
   cadences du BTE, qualité, sécurité, retour d'expérience, check-list de
   clôture et dossier PDF transmis à la direction et au bureau d'études.
   ========================================================================== */
// deno-lint-ignore-file no-unused-vars
'use strict';

const bilanDe = c => (c.bilan = c.bilan || { pointsForts: '', difficultes: '', ameliorations: '', cloture: {} });

function vBilan(c) {
  const b = bilanChantier(db, c.id);
  const bl = bilanDe(c);
  const nCl = Object.keys(bl.cloture || {}).length;
  const entete = enTetePage({ eyebrow: 'Chantier', titre: 'Bilan de fin de chantier', sous: [c.clotureLe ? `<span class="badge pos">${icone('check', 'sm')}Clôturé le ${fmtDate(c.clotureLe)}</span>` : `<span class="badge">${nCl} / ${REF.cloture.length} étapes de clôture</span>`],
    actions: `<button class="btn" data-act="bilanPDF">${icone('file-text')}Dossier de clôture</button>${c.clotureLe ? `<button class="btn ghost" data-act="bilanRouvrir">${icone('undo-2')}Rouvrir</button>` : `<button class="btn primary" data-act="bilanCloturer">${icone('flag')}Clôturer le chantier</button>`}` });
  const H = b.heures, F = b.finances, D = b.delai;
  const resume = `<div class="resume">
      <div><span>Heures</span><b class="${cls(H.ecart)}">${H.reel ? signe(H.ecart) + ' h' : '—'}</b><small>${fmt(H.reel, 0)} h réalisées pour ${fmt(H.budget, 0)} h budgétées · ${pc(H.pct)} réalisé</small></div>
      <div><span>Marge</span><b class="${F.margeFin < F.margePrevue - 1 ? 'neg' : ''}">${F.ca ? fmtE(F.margeFin) : '—'}</b><small>${F.ca ? `${pc(F.tauxFin)} pour ${pc(F.tauxPrevu)} prévus (${signeE(F.margeFin - F.margePrevue)})` : 'marché non renseigné'}</small></div>
      <div><span>Délai</span><b class="${D.retard ? 'neg' : ''}">${D.finReelle ? (D.retard ? `+${D.retard} j` : 'Tenu') : '—'}</b><small>${D.finReelle ? `${D.reception ? 'réception' : 'dernière activité'} le ${fmtDate(D.finReelle)}${D.finContrat ? ` · contrat ${fmtDate(D.finContrat)}` : ''}` : 'pas encore d\'activité'}</small></div>
    </div>`;
  const phases = `<div class="card"><div class="card-head"><h3>Heures et cadences par phase</h3><span class="hint">cadence constatée = cadence du BTE × productivité (heures produites ÷ heures pointées)</span></div>
    <div class="table-wrap"><table class="table"><thead><tr><th>Phase</th><th class="num">Budget</th><th class="num">Réalisé</th><th class="num">Écart</th><th>Opération de référence</th><th class="num">Cadence BTE</th><th class="num">Constatée</th></tr></thead><tbody>
      ${b.phases.map(p => {
        const r = p.productivite;
        return `<tr><td><div class="strong">${esc(p.phase)}</div><div class="sub">${esc(p.ouvrage)} · ${pc(p.pct)}</div></td><td class="num">${fmt(p.budget)} h</td><td class="num">${fmt(p.heures)} h</td><td class="num strong ${cls(p.ecart)}">${p.heures ? signe(p.ecart) + ' h' : '—'}</td>
          <td class="small">${esc(p.operation || '—')}</td><td class="num">${p.cadenceCible ? `${fmt(p.cadenceCible, 0)} ${esc(p.unite)}/j` : '—'}</td>
          <td class="num">${p.cadenceReelle ? `<b class="${r >= 1 ? 'pos' : r < 0.9 ? 'neg' : ''}">${fmt(p.cadenceReelle, 0)} ${esc(p.unite)}/j</b><div class="sub">productivité ${pc(r)}</div>` : '—'}</td></tr>`;
      }).join('')}</tbody></table></div>
    <div class="card-foot small muted">Les cadences constatées alimentent le retour d'expérience et la mise à jour des cadences standard pour les prochains chiffrages.</div></div>`;
  const autres = `<div class="card mini-stats">
      <div><div class="ms-lbl">${icone('shield-check', 'sm')}Réserves</div><div class="ms-val">${b.qualite.levees} / ${b.qualite.reserves}</div><div class="xs muted">levées${b.qualite.delaiMoyen ? ` en ${b.qualite.delaiMoyen} j en moyenne` : ''}${b.qualite.ouvertes ? ` · ${b.qualite.ouvertes} ouverte(s)` : ''}</div></div>
      <div><div class="ms-lbl">${icone('shield-alert', 'sm')}Sécurité</div><div class="ms-val ${b.securite.accidents ? 'neg' : ''}">${b.securite.accidents}</div><div class="xs muted">accident(s) · ${b.securite.causeries} quart(s) d'heure</div></div>
      <div><div class="ms-lbl">${icone('cloud-rain', 'sm')}Intempéries</div><div class="ms-val">${b.joursIntemperie} j</div><div class="xs muted">d'arrêt</div></div>
      <div><div class="ms-lbl">${icone('landmark', 'sm')}Retenue de garantie</div><div class="ms-val">${b.liberationRG ? fmtDateCourt(b.liberationRG) : '—'}</div><div class="xs muted">${b.liberationRG ? `libérable le ${fmtDate(b.liberationRG)} · ${fmtE(F.rg)}` : 'à la date de réception + 1 an'}</div></div>
    </div>`;
  const rex = `<div class="card"><div class="card-head"><h3>Retour d'expérience</h3><span class="hint">enregistré automatiquement</span></div><div class="card-body">
      ${zoneTexte('rxForts', 'Ce qui a bien fonctionné', bl.pointsForts, 'rows="3" data-change="bilanChamp" data-f="pointsForts" placeholder="méthodes, cadences tenues, organisation, relation client…"')}
      ${zoneTexte('rxDiff', 'Difficultés rencontrées', bl.difficultes, 'rows="3" data-change="bilanChamp" data-f="difficultes" placeholder="aléas, interfaces, approvisionnements, intempéries…"')}
      ${zoneTexte('rxAmel', 'Pistes d\'amélioration pour les prochains chantiers', bl.ameliorations, 'rows="3" data-change="bilanChamp" data-f="ameliorations" placeholder="chiffrage, préparation, carnet de détails, sécurité…"')}</div></div>`;
  const cloture = `<div class="card"><div class="card-head"><h3>Clôture</h3><span class="hint">${nCl} / ${REF.cloture.length}</span></div>
    ${REF.cloture.map((t, i) => { const v = (bl.cloture || {})[i]; return `<div class="cl-item ${v ? 'done' : ''}"><label class="checkbox"><input type="checkbox" ${v ? 'checked' : ''} data-change="bilanCloture" data-i="${i}"><span class="txt">${esc(t)}</span></label>${v ? `<div class="cl-meta">le ${fmtDate(v.date)}${v.par ? ' par ' + esc(v.par) : ''}</div>` : ''}</div>`; }).join('')}</div>`;
  return entete + `<div class="stack">${resume}${phases}${autres}<div class="grid g-2">${rex}${cloture}</div></div>`;
}

function bilanPDF() {
  const c = ch();
  if (!globalThis.jspdf) return toast('Bibliothèque PDF non chargée.', 'erreur');
  const { jsPDF } = globalThis.jspdf;
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const b = bilanChantier(db, c.id), bl = bilanDe(c);
  let y = enTeteDocument(doc, 'DOSSIER DE CLÔTURE', c.nom, [`Établi le ${fmtDate(aujourdHui())}`, nomUser() ? `par ${nomUser()}` : '']);
  const h1 = cadre(doc, 14, y, 88, 'Chantier', [c.nom, c.client ? `Maître d'ouvrage : ${c.client}` : '', c.imputation ? `Affaire ${c.imputation}` : ''].filter(Boolean));
  const h2 = cadre(doc, 108, y, 88, 'Dates', [`Début : ${fmtDate(b.delai.debut) || '-'}`, `Fin contractuelle : ${fmtDate(b.delai.finContrat) || '-'}`, `${b.delai.reception ? 'Réception' : 'Fin réelle'} : ${fmtDate(b.delai.finReelle) || '-'}${b.delai.retard ? ` (+${b.delai.retard} j)` : ''}`]);
  y += Math.max(h1, h2) + 7;
  const titre = t => { if (y > 255) { doc.addPage(); y = 20; } doc.setFont('helvetica', 'bold'); doc.setFontSize(11); doc.setTextColor(14, 35, 64); doc.text(pdfTxt(t), 14, y); y += 2; doc.setDrawColor(232, 89, 12); doc.setLineWidth(0.6); doc.line(14, y, 30, y); doc.setLineWidth(0.2); y += 6; };
  titre('Synthèse');
  doc.autoTable(Object.assign({}, STYLE_TABLE, {
    startY: y, head: [['Indicateur', 'Prévu', 'Réalisé', 'Écart'].map(pdfTxt)],
    body: [
      ['Heures de main d\'œuvre', fmt(b.heures.budget, 1) + ' h', fmt(b.heures.reel, 1) + ' h', signe(b.heures.ecart) + ' h'],
      ['Impact main d\'œuvre', '', '', signeE(b.heures.impact)],
      ['Marge brute', b.finances.ca ? `${fmtE(b.finances.margePrevue)} (${pc(b.finances.tauxPrevu)})` : '-', b.finances.ca ? `${fmtE(b.finances.margeFin)} (${pc(b.finances.tauxFin)})` : '-', b.finances.ca ? signeE(b.finances.margeFin - b.finances.margePrevue) : '-'],
      ['Délai', fmtDate(b.delai.finContrat) || '-', fmtDate(b.delai.finReelle) || '-', b.delai.retard ? `+${b.delai.retard} j ouvrés` : 'tenu'],
      ['Réserves levées', '', `${b.qualite.levees} / ${b.qualite.reserves}`, b.qualite.delaiMoyen ? `${b.qualite.delaiMoyen} j en moyenne` : ''],
      ['Accidents / intempéries', '', `${b.securite.accidents} accident(s)`, `${b.joursIntemperie} j d'intempéries`]
    ].map(r => r.map(pdfTxt)),
    columnStyles: { 1: { halign: 'right' }, 2: { halign: 'right' }, 3: { halign: 'right', fontStyle: 'bold' } }
  }));
  y = doc.lastAutoTable.finalY + 8;
  titre('Cadences constatées');
  doc.autoTable(Object.assign({}, STYLE_TABLE, {
    startY: y, head: [['Phase', 'Budget h', 'Réalisé h', 'Opération', 'Cadence BTE', 'Constatée'].map(pdfTxt)],
    body: b.phases.map(p => [p.phase, fmt(p.budget), fmt(p.heures), p.operation || '-', p.cadenceCible ? `${fmt(p.cadenceCible, 0)} ${p.unite}/j` : '-', p.cadenceReelle ? `${fmt(p.cadenceReelle, 0)} ${p.unite}/j` : '-'].map(pdfTxt)),
    columnStyles: { 1: { halign: 'right' }, 2: { halign: 'right' }, 4: { halign: 'right' }, 5: { halign: 'right', fontStyle: 'bold' } }
  }));
  y = doc.lastAutoTable.finalY + 8;
  [['Ce qui a bien fonctionné', bl.pointsForts], ['Difficultés rencontrées', bl.difficultes], ['Pistes d\'amélioration', bl.ameliorations]].forEach(([t, v]) => {
    titre(t);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(9.5); doc.setTextColor(16, 24, 40);
    doc.splitTextToSize(pdfTxt(v || 'Non renseigné.'), 182).forEach(l => { if (y > 282) { doc.addPage(); y = 20; } doc.text(l, 14, y); y += 4.6; });
    y += 4;
  });
  titre('Clôture');
  doc.autoTable(Object.assign({}, STYLE_TABLE, {
    startY: y, head: [['Étape', 'Fait le'].map(pdfTxt)],
    body: REF.cloture.map((t, i) => [t, (bl.cloture || {})[i] ? fmtDate(bl.cloture[i].date) : 'à faire'].map(pdfTxt)).concat(b.liberationRG ? [[pdfTxt('Libération de la retenue de garantie'), pdfTxt(fmtDate(b.liberationRG))]] : []),
    columnStyles: { 1: { cellWidth: 34 } }
  }));
  const pieces = derniersIndices(c.id).filter(d => d.doe);
  if (pieces.length) {
    y = doc.lastAutoTable.finalY + 8; titre('Pièces du DOE');
    doc.autoTable(Object.assign({}, STYLE_TABLE, { startY: y, head: [['Référence', 'Désignation', 'Indice'].map(pdfTxt)], body: pieces.map(d => [d.reference || '', d.titre || '', d.indice || ''].map(pdfTxt)) }));
  }
  piedDocument(doc, `${entreprise().nom || 'OmSmK'}  ·  ${c.nom}  ·  Dossier de clôture`);
  doc.save(`Dossier_cloture_${c.nom.replace(/[^\w-]+/g, '_')}.pdf`);
  toast('Dossier de clôture généré', 'succes');
}

Object.assign(ACT, {
  bilanPDF: () => bilanPDF(),
  bilanCloturer: async () => {
    const c = ch();
    const manque = REF.cloture.length - Object.keys(bilanDe(c).cloture || {}).length;
    if (!await confirmer('Clôturer le chantier', manque ? `${manque} étape(s) de clôture ne sont pas cochées. Clôturer quand même ?` : 'Le chantier passera au statut « Clôturé ». Vous pourrez le rouvrir.', { ok: 'Clôturer', icone: 'flag' })) return;
    c.clotureLe = aujourdHui(); save(); render(); toast('Chantier clôturé', 'succes');
  },
  bilanRouvrir: () => { const c = ch(); delete c.clotureLe; save(); render(); }
});
Object.assign(CHG, {
  bilanChamp: el => { const c = ch(); bilanDe(c)[el.dataset.f] = el.value; save(); },
  bilanCloture: el => {
    const c = ch(), bl = bilanDe(c);
    bl.cloture = bl.cloture || {};
    if (el.checked) bl.cloture[el.dataset.i] = { date: aujourdHui(), par: nomUser() }; else delete bl.cloture[el.dataset.i];
    save(); render();
  }
});
