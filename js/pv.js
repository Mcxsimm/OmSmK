/* ==========================================================================
   OmSmK — procès-verbaux : réception des travaux et levée des réserves,
   signés à l'écran par le maître d'ouvrage, le maître d'œuvre et l'entreprise.
   ========================================================================== */
// deno-lint-ignore-file no-unused-vars
'use strict';

const TYPES_PV = { reception: 'Procès-verbal de réception', levee: 'Procès-verbal de levée des réserves' };
const DECISIONS_PV = [['sans', 'Réception prononcée sans réserve'], ['avec', 'Réception prononcée avec réserves'], ['differee', 'Réception différée']];
const pvsDe = cid => (db.pvs || []).filter(p => p.chantierId === cid).sort((a, b) => b.date.localeCompare(a.date));

function signatairesPV(c) {
  const k = role => contactsDe(c.id).find(x => x.role === role);
  const moa = k('Maître d\'ouvrage'), moe = k('Maître d\'œuvre');
  return [
    { cle: 'moa', nom: moa ? libContact(moa) : (c.client || ''), role: 'Maître d\'ouvrage' },
    { cle: 'moe', nom: moe ? libContact(moe) : '', role: 'Maître d\'œuvre' },
    { cle: 'entreprise', nom: [nomUser(), entreprise().nom].filter(Boolean).join(' — '), role: 'Entreprise' }
  ];
}

function vPVs(c) {
  const ps = pvsDe(c.id);
  const ouvertes = deCh(db.reserves).filter(r => r.statut !== 'levée');
  const levees = deCh(db.reserves).filter(r => r.statut === 'levée');
  const actions = `<div class="row" style="gap:8px;margin-bottom:16px"><button class="btn primary" data-act="pvNew" data-t="reception">${icone('file-check')}PV de réception</button>
    <button class="btn" data-act="pvNew" data-t="levee" ${levees.length ? '' : 'disabled'}>${icone('shield-check')}PV de levée des réserves</button>
    <span class="small muted">${accord(ouvertes.length, 'réserve(s) ouverte(s)')} · ${accord(levees.length, 'levée(s)')}</span></div>`;
  if (!ps.length) return actions + `<div class="card">${vide('file-check', 'Aucun procès-verbal', 'Établissez le PV de réception avec le maître d\'ouvrage (avec ou sans réserves), puis le PV de levée des réserves. Signature à l\'écran, PDF immédiat.')}</div>`;
  return actions + `<div class="card">${ps.map(p => {
    const sig = signatairesPV(c).filter(x => (p.signatures || {})[x.cle]).length;
    return `<div class="res-item"><span class="kpi-ico" style="width:34px;height:34px">${icone(p.type === 'reception' ? 'file-check' : 'shield-check', 'sm')}</span>
      <div><div class="r-desc">${esc(TYPES_PV[p.type])}</div>
        <div class="r-meta"><span>${icone('calendar', 'sm')}${fmtDate(p.date, true)}</span>${p.type === 'reception' ? `<span class="badge ${p.decision === 'sans' ? 'pos' : p.decision === 'avec' ? 'warn' : 'neg'}">${esc((DECISIONS_PV.find(d => d[0] === p.decision) || ['', ''])[1])}</span>` : ''}<span>${accord((p.reserves || []).length, 'réserve(s)')}</span><span class="badge ${sig === 3 ? 'pos' : ''}">${sig}/3 signature(s)</span></div></div>
      <div class="row" style="flex-wrap:nowrap"><button class="btn sm ${sig === 3 ? '' : 'primary'}" data-act="pvSigner" data-id="${esc(p.id)}">${icone('pencil', 'sm')}Signer</button><button class="btn sm" data-act="pvPDF" data-id="${esc(p.id)}">${icone('file-text', 'sm')}PDF</button>
        <button class="btn ghost icon sm" data-act="pvEdit" data-id="${esc(p.id)}" aria-label="Modifier">${icone('pencil', 'sm')}</button><button class="btn ghost icon sm" data-act="pvSuppr" data-id="${esc(p.id)}" aria-label="Supprimer">${icone('trash-2', 'sm')}</button></div></div>`;
  }).join('')}</div>`;
}

function modalPV(type, p) {
  const c = ch();
  const e = p || { date: aujourdHui(), decision: deCh(db.reserves).some(r => r.statut !== 'levée') ? 'avec' : 'sans' };
  const candidates = deCh(db.reserves).filter(r => type === 'reception' ? r.statut !== 'levée' : r.statut === 'levée');
  const choisies = p ? (p.reserves || []).map(r => r.id) : candidates.map(r => r.id);
  ouvrirModal(p ? `Modifier — ${TYPES_PV[type]}` : TYPES_PV[type], `
    <input type="hidden" id="pvId" value="${esc(p ? p.id : '')}"><input type="hidden" id="pvType" value="${type}">
    <div class="form-grid">${champ('pvDate', type === 'reception' ? 'Date de la réception' : 'Date de la levée', e.date, 'date')}
      ${type === 'reception' ? selectHTML('pvDecision', 'Décision du maître d\'ouvrage', DECISIONS_PV, e.decision) : champ('pvRef', 'PV de réception de référence', e.reference || (pvsDe(c.id).find(x => x.type === 'reception') ? fmtDate(pvsDe(c.id).find(x => x.type === 'reception').date) : ''), 'text')}</div>
    ${type === 'reception' ? champ('pvDelai', 'Délai de levée des réserves (date limite)', e.delai || addDays(e.date, 30), 'date') : ''}
    <div class="label">${type === 'reception' ? 'Réserves émises' : 'Réserves levées'} (${candidates.length})</div>
    ${candidates.length ? `<div class="choix-k" style="grid-template-columns:1fr">${candidates.map(r => `<label class="checkbox"><input type="checkbox" class="pvRes" value="${esc(r.id)}" ${choisies.includes(r.id) ? 'checked' : ''}><span class="small"><b>${numeroReserve(r)}</b> ${esc(r.description)}${r.zone ? ` <span class="muted">— ${esc(r.zone)}</span>` : ''}</span></label>`).join('')}</div>` : '<p class="small muted" style="margin-bottom:14px">Aucune réserve concernée.</p>'}
    ${zoneTexte('pvObs', 'Observations', e.observations, 'rows="3"')}`,
    `<button class="btn" data-act="fermerModal">Annuler</button><button class="btn primary" data-act="pvSave">Enregistrer${p ? '' : ' et faire signer'}</button>`, { icone: type === 'reception' ? 'file-check' : 'shield-check' });
}

function pvPDF(id) {
  const c = ch();
  const p = (db.pvs || []).find(x => x.id === id);
  if (!p || !globalThis.jspdf) return toast('Bibliothèque PDF non chargée.', 'erreur');
  const { jsPDF } = globalThis.jspdf;
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  let y = enTeteDocument(doc, p.type === 'reception' ? 'PROCÈS-VERBAL DE RÉCEPTION' : 'PV DE LEVÉE DES RÉSERVES', fmtDate(p.date, true), [refsChantier(c)]);
  const h1 = cadre(doc, 14, y, 88, 'Chantier', [c.nom, c.adresse || ''].filter(Boolean));
  const h2 = cadre(doc, 108, y, 88, 'Maître d\'ouvrage', [c.client || '—'].concat(contactsDe(c.id).filter(k => k.role === 'Maître d\'œuvre').slice(0, 1).map(k => `Maître d'œuvre : ${k.societe || k.nom}`)));
  y += Math.max(h1, h2) + 8;
  doc.setFont('helvetica', 'normal'); doc.setFontSize(9.5); doc.setTextColor(16, 24, 40);
  const corps = p.type === 'reception'
    ? `Le maître d'ouvrage, après avoir procédé à la visite des travaux exécutés par l'entreprise${entreprise().nom ? ' ' + entreprise().nom : ''} au titre du marché désigné ci-dessus, en présence des soussignés, déclare que :`
    : `Les réserves formulées lors de la réception${p.reference ? ' du ' + p.reference : ''} et listées ci-dessous ont été levées par l'entreprise${entreprise().nom ? ' ' + entreprise().nom : ''}. Les soussignés constatent leur levée à la date du présent procès-verbal.`;
  const l = doc.splitTextToSize(pdfTxt(corps), 182); doc.text(l, 14, y); y += l.length * 4.6 + 4;
  if (p.type === 'reception') {
    DECISIONS_PV.forEach(([k, lib]) => {
      doc.setDrawColor(16, 24, 40); doc.rect(16, y - 3.2, 3.6, 3.6);
      if (p.decision === k) { doc.setFont('helvetica', 'bold'); doc.text('X', 16.8, y - 0.2); }
      doc.setFont('helvetica', p.decision === k ? 'bold' : 'normal'); doc.text(pdfTxt(lib), 22, y); y += 6;
    });
    doc.setFont('helvetica', 'normal');
    if (p.decision === 'avec' && p.delai) { doc.text(pdfTxt(`Les réserves devront être levées au plus tard le ${fmtDate(p.delai)}.`), 14, y + 1); y += 7; }
    doc.text(pdfTxt(`La réception prend effet à la date du ${fmtDate(p.date)}.`), 14, y + 1); y += 9;
  }
  if ((p.reserves || []).length) {
    doc.autoTable(Object.assign({}, STYLE_TABLE, {
      startY: y,
      head: [['N°', 'Localisation', 'Description', p.type === 'reception' ? 'Responsable' : 'Levée le'].map(pdfTxt)],
      body: p.reserves.map(r => [r.numero, r.zone || '', r.description, p.type === 'reception' ? r.responsable || '' : (r.leveeLe ? fmtDate(r.leveeLe) : '')].map(pdfTxt)),
      columnStyles: { 0: { cellWidth: 16 }, 2: { cellWidth: 100 } }
    }));
    y = doc.lastAutoTable.finalY + 8;
  }
  if (p.observations) {
    doc.setFont('helvetica', 'bold'); doc.setFontSize(9.5); doc.text(pdfTxt('Observations'), 14, y); y += 5;
    doc.setFont('helvetica', 'normal'); doc.setFontSize(9);
    const o = doc.splitTextToSize(pdfTxt(p.observations), 182); doc.text(o, 14, y); y += o.length * 4.4 + 6;
  }
  if (y > 236) { doc.addPage(); y = 20; }
  const sig = p.signatures || {};
  signatairesPV(c).forEach((s, i) => {
    const x = 14 + i * 62;
    doc.setDrawColor(205, 212, 222); doc.roundedRect(x, y, 58, 36, 1.5, 1.5);
    doc.setFontSize(7.5); doc.setTextColor(102, 112, 133); doc.text(pdfTxt(s.role.toUpperCase()), x + 3, y + 5);
    doc.setFontSize(8); doc.setTextColor(16, 24, 40); doc.text(doc.splitTextToSize(pdfTxt(s.nom || ''), 52).slice(0, 2), x + 3, y + 10);
    signaturePDF(doc, sig[s.cle], x + 3, y + 16, 52, 17);
    if (!sig[s.cle]) { doc.setFontSize(7); doc.setTextColor(152, 162, 179); doc.text(pdfTxt('Date et signature'), x + 3, y + 33); }
  });
  piedDocument(doc, `${entreprise().nom || 'OmSmK'}  ·  ${c.nom}  ·  ${TYPES_PV[p.type]} du ${fmtDate(p.date)}`);
  doc.save(`${p.type === 'reception' ? 'PV_reception' : 'PV_levee_reserves'}_${p.date}_${c.nom.replace(/[^\w-]+/g, '_')}.pdf`);
  toast('Procès-verbal généré', 'succes');
}

function signerPV(p) {
  const c = ch();
  modalSignatures({ titre: `Signatures — ${TYPES_PV[p.type]}`, sousTitre: fmtDate(p.date, true), signataires: signatairesPV(c), signatures: p.signatures || {},
    apres: sig => {
      p.signatures = sig;
      // Réception signée par le maître d'ouvrage : jalon « Réception » atteint
      if (p.type === 'reception' && sig.moa && p.decision !== 'differee') { const j = (c.jalons || []).find(x => /r[ée]ception/i.test(x.libelle)); if (j) j.fait = true; }
      save(); render(); toast('Signatures enregistrées', 'succes');
    } });
}

Object.assign(ACT, {
  pvNew: el => modalPV(el.dataset.t, null),
  pvEdit: el => { const p = (db.pvs || []).find(x => x.id === el.dataset.id); if (p) modalPV(p.type, p); },
  pvSave: () => {
    const type = val('pvType'), id = val('pvId');
    const ids = $$('.pvRes').filter(x => x.checked).map(x => x.value);
    const reserves = deCh(db.reserves).filter(r => ids.includes(r.id)).map(r => ({ id: r.id, numero: numeroReserve(r), zone: r.zone, description: r.description, responsable: r.responsable, leveeLe: r.leveeLe }));
    const data = { date: val('pvDate') || aujourdHui(), decision: val('pvDecision') || '', delai: val('pvDelai'), reference: val('pvRef'), reserves, observations: val('pvObs') };
    db.pvs = db.pvs || [];
    let p;
    if (id) { p = db.pvs.find(x => x.id === id); Object.assign(p, data); }
    else { p = Object.assign({ id: uid(), chantierId: ui.chantierId, type, signatures: {}, par: nomUser() }, data); db.pvs.push(p); }
    save(); render();
    if (id) { fermerModal(); toast('Procès-verbal enregistré', 'succes'); } else signerPV(p);
  },
  pvSigner: el => { const p = (db.pvs || []).find(x => x.id === el.dataset.id); if (p) signerPV(p); },
  pvPDF: el => pvPDF(el.dataset.id),
  pvSuppr: async el => {
    if (!await confirmer('Supprimer le procès-verbal', 'Le PV et ses signatures seront supprimés.', { ok: 'Supprimer', danger: true })) return;
    db.pvs = db.pvs.filter(p => p.id !== el.dataset.id); save(); render();
  }
});
