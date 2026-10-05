/* ==========================================================================
   OmSmK — devis de travaux supplémentaires et relances clients
   Devis : brouillon → émis → (relances) → accepté (avenant créé) ou refusé.
   Relances : devis sans réponse depuis 15 jours, situations impayées après
   leur échéance de paiement (délai réglable dans la décomposition du marché).
   ========================================================================== */
// deno-lint-ignore-file no-unused-vars
'use strict';

const CLS_STATUT_DEVIS = { brouillon: '', emis: 'info', accepte: 'pos', refuse: 'neg' };
const devisDe = cid => (db.devis || []).filter(d => d.chantierId === cid).sort((a, b) => (b.dateEmission || b.creeLe || '').localeCompare(a.dateEmission || a.creeLe || ''));
const destinataireClient = c => contactsDe(c.id).find(k => k.role === 'Maître d\'œuvre' && k.email) || contactsDe(c.id).find(k => k.role === 'Maître d\'ouvrage' && k.email) || null;

function vDevis(c) {
  const auj = aujourdHui();
  const ds = devisDe(c.id);
  const attente = ds.filter(d => d.statut === 'emis');
  const acceptes = ds.filter(d => d.statut === 'accepte');
  const decides = ds.filter(d => ['accepte', 'refuse'].includes(d.statut));
  const aRelancer = devisARelancer(db, c.id, auj);
  const impayes = situationsImpayees(db, c.id, auj);
  const entete = enTetePage({ eyebrow: 'Gestion', titre: 'Devis et relances', sous: [sousInfo('file-plus', `${ds.length} devis`), impayes.length ? `<span class="badge neg">${impayes.length} impayé(s)</span>` : ''],
    actions: `<button class="btn primary" data-act="devisNew">${icone('plus')}Nouveau devis</button>` });
  const resume = `<div class="resume">
      <div><span>En attente de réponse</span><b>${fmtE(attente.reduce((t, d) => t + montantDevis(d), 0))}</b><small>${attente.length} devis émis${aRelancer.length ? ` · ${aRelancer.length} à relancer` : ''}</small></div>
      <div><span>Acceptés (avenants)</span><b class="pos">${fmtE(acceptes.reduce((t, d) => t + montantDevis(d), 0))}</b><small>${decides.length ? `taux d'acceptation ${pc(acceptes.length / decides.length)}` : 'aucune décision pour l\'instant'}</small></div>
      <div><span>Impayés échus TTC</span><b class="${impayes.length ? 'neg' : ''}">${fmtE(impayes.reduce((t, x) => t + x.ttc, 0))}</b><small>${impayes.length ? `retard maximal ${Math.max(...impayes.map(x => x.retard))} jour(s)` : `échéance à ${parametresFinanciers(c).delai} jours`}</small></div>
    </div>`;
  const relances = aRelancer.length || impayes.length ? `<div class="card"><div class="card-head"><h3>${icone('send')}Relances à faire</h3><span class="badge warn">${aRelancer.length + impayes.length}</span></div>
    <ul class="attention-list">
      ${impayes.map(x => `<li><span class="sev critical">${icone('banknote', 'sm')}</span><div class="grow"><div class="strong">Situation n° ${esc(x.sit.numero)} impayée — ${fmtE2(x.ttc)} TTC</div><div class="small muted">Échéance ${fmtDate(x.echeance)} dépassée de ${x.retard} jour(s)${(x.sit.relances || []).length ? ` · ${(x.sit.relances || []).length} relance(s), dernière le ${fmtDate(x.sit.relances[x.sit.relances.length - 1])}` : ''}</div></div>
        <button class="btn sm" data-act="relanceSitPDF" data-id="${esc(x.sit.id)}">${icone('file-text', 'sm')}Lettre</button><button class="btn sm primary" data-act="relanceSit" data-id="${esc(x.sit.id)}">${icone('send', 'sm')}Relancer</button></li>`).join('')}
      ${aRelancer.map(d => `<li><span class="sev warning">${icone('file-plus', 'sm')}</span><div class="grow"><div class="strong">Devis ${esc(d.numero)} sans réponse — ${fmtE(montantDevis(d))} HT</div><div class="small muted">${esc(d.objet || '')} · émis le ${fmtDate(d.dateEmission)}${(d.relances || []).length ? ` · relancé le ${fmtDate(derniereRelance(d))}` : ''}</div></div>
        <button class="btn sm primary" data-act="relanceDevis" data-id="${esc(d.id)}">${icone('send', 'sm')}Relancer</button></li>`).join('')}
    </ul></div>` : '';
  const liste = `<div class="card"><div class="card-head"><h3>Devis de travaux supplémentaires</h3><span class="hint">acceptés : intégrés au marché comme avenants</span></div>
    ${ds.length ? `<div class="table-wrap"><table class="table"><thead><tr><th>N°</th><th>Objet</th><th class="num">Montant HT</th><th>Émis le</th><th>Statut</th><th></th></tr></thead><tbody>
      ${ds.map(d => `<tr><td class="strong">${esc(d.numero)}</td><td>${esc(d.objet || '')}${(d.relances || []).length ? `<div class="sub">${d.relances.length} relance(s)</div>` : ''}</td><td class="num">${fmtE2(montantDevis(d))}</td><td>${d.dateEmission ? fmtDate(d.dateEmission) : '—'}</td>
        <td><span class="badge ${CLS_STATUT_DEVIS[d.statut] || ''} dot">${esc(libStatut(STATUTS_DEVIS, d.statut))}</span>${d.statut === 'accepte' && d.dateAcceptation ? `<div class="sub">le ${fmtDate(d.dateAcceptation)}</div>` : ''}</td>
        <td class="num"><div class="row" style="flex-wrap:nowrap;justify-content:flex-end">
          ${d.statut === 'brouillon' ? `<button class="btn sm" data-act="devisStatut" data-id="${esc(d.id)}" data-s="emis">${icone('send', 'sm')}Émettre</button>` : ''}
          ${d.statut === 'emis' ? `<button class="btn sm primary" data-act="devisStatut" data-id="${esc(d.id)}" data-s="accepte">${icone('check', 'sm')}Accepté</button><button class="btn sm ghost" data-act="devisStatut" data-id="${esc(d.id)}" data-s="refuse">Refusé</button>` : ''}
          <button class="btn ghost icon sm" data-act="devisPDF" data-id="${esc(d.id)}" aria-label="PDF">${icone('file-text', 'sm')}</button>
          <button class="btn ghost icon sm" data-act="devisEdit" data-id="${esc(d.id)}" aria-label="Modifier">${icone('pencil', 'sm')}</button></div></td></tr>`).join('')}
      </tbody></table></div>` : vide('file-plus', 'Aucun devis', 'Chiffrez les travaux supplémentaires demandés par le client : lignes, PDF, suivi des relances. Une fois accepté, le devis devient un avenant facturable dans les situations.')}</div>`;
  return entete + `<div class="stack">${resume}${relances}${liste}</div>`;
}

let _dvLignes = [];
function modalDevis(d) {
  const c = ch();
  // Numéro suivant : plus grand « TS n » parmi les devis et les avenants
  const nums = [...devisDe(c.id).map(d => d.numero), ...postesDe(db, c.id).filter(p => p.avenant).map(p => p.code)].map(x => num(String(x || '').replace(/\D+/g, ' ').trim().split(' ').pop()));
  const n = Math.max(0, ...nums) + 1;
  const e = d || { numero: `TS ${String(n).padStart(2, '0')}`, statut: 'brouillon', lignes: [] };
  _dvLignes = JSON.parse(JSON.stringify(e.lignes && e.lignes.length ? e.lignes : [{ designation: '', quantite: '', unite: 'U', pu: '' }]));
  ouvrirModal(d ? `Devis ${e.numero}` : 'Nouveau devis de travaux supplémentaires', `
    <input type="hidden" id="dvId" value="${esc(d ? d.id : '')}">
    <div class="form-grid">${champ('dvNum', 'N° (repris comme code d\'avenant)', e.numero)}${champ('dvObjet', 'Objet *', e.objet, 'text', 'placeholder="ex : crapaudines et trop-pleins supplémentaires"')}
      ${champ('dvDemande', 'Demandé par', e.demandePar, 'text', 'placeholder="MOE, MOA, OS n°…"')}${champ('dvDate', 'Date d\'émission', e.dateEmission || aujourdHui(), 'date')}</div>
    <div class="form-section" style="display:flex;justify-content:space-between;align-items:center">Détail <button class="btn sm" data-act="dvLigneAjout">${icone('plus', 'sm')}Ligne</button></div>
    <div id="dvLignes" style="border:1px solid var(--border);border-radius:10px;overflow:auto"></div>
    ${zoneTexte('dvNotes', 'Conditions / délai d\'exécution', e.notes || 'Validité de l\'offre : 30 jours. Délai d\'exécution à convenir après acceptation.', 'rows="2"')}`,
    `${d ? `<button class="btn danger" data-act="devisSuppr" data-id="${esc(d.id)}" style="margin-right:auto">${icone('trash-2')}Supprimer</button>` : ''}<button class="btn" data-act="fermerModal">Annuler</button><button class="btn primary" data-act="devisSave">Enregistrer</button>`,
    { taille: 'wide', icone: 'file-plus' });
  renderLignesDevis();
}
function lireLignesDevis() {
  $$('#dvLignes tr[data-i]').forEach(tr => {
    const l = _dvLignes[num(tr.dataset.i)];
    $$('[data-f]', tr).forEach(i => { l[i.dataset.f] = i.value; });
  });
}
function renderLignesDevis() {
  const total = _dvLignes.reduce((t, l) => t + num(l.quantite) * num(l.pu), 0);
  $('#dvLignes').innerHTML = `<table class="table"><thead><tr><th>Désignation</th><th class="num">Qté</th><th>Unité</th><th class="num">PU HT</th><th class="num">Total</th><th></th></tr></thead><tbody>
    ${_dvLignes.map((l, i) => `<tr data-i="${i}"><td><input class="input" data-f="designation" value="${esc(l.designation)}" aria-label="Désignation"></td>
      <td class="num"><input class="input" style="width:80px;text-align:right" type="number" step="any" data-f="quantite" value="${esc(l.quantite)}" data-input="dvTotal" aria-label="Quantité"></td>
      <td><input class="input" style="width:70px" data-f="unite" value="${esc(l.unite)}" aria-label="Unité"></td>
      <td class="num"><input class="input" style="width:100px;text-align:right" type="number" step="any" data-f="pu" value="${esc(l.pu)}" data-input="dvTotal" aria-label="Prix unitaire"></td>
      <td class="num strong">${fmtE2(num(l.quantite) * num(l.pu))}</td>
      <td><button class="btn ghost icon sm" data-act="dvLigneSuppr" data-i="${i}" aria-label="Supprimer la ligne">${icone('x', 'sm')}</button></td></tr>`).join('')}
    <tr class="total"><td colspan="4">Total HT</td><td class="num" id="dvTotal">${fmtE2(total)}</td><td></td></tr></tbody></table>`;
}

function devisPDF(id) {
  const c = ch();
  const d = (db.devis || []).find(x => x.id === id);
  if (!d || !globalThis.jspdf) return toast('Bibliothèque PDF non chargée.', 'erreur');
  const { jsPDF } = globalThis.jspdf;
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  let y = enTeteDocument(doc, 'DEVIS — TRAVAUX SUPPLÉMENTAIRES', `N° ${d.numero}`, [`Date : ${fmtDate(d.dateEmission || aujourdHui())}`, d.demandePar ? `Demandé par : ${d.demandePar}` : '']);
  const h1 = cadre(doc, 14, y, 88, 'Chantier', [c.nom, c.adresse || '', c.imputation ? `Affaire ${c.imputation}` : ''].filter(Boolean));
  const dest = destinataireClient(c);
  const h2 = cadre(doc, 108, y, 88, 'Destinataire', [c.client || '—', dest ? `${dest.nom || ''} — ${dest.societe || ''}` : ''].filter(Boolean));
  y += Math.max(h1, h2) + 7;
  if (d.objet) { doc.setFont('helvetica', 'bold'); doc.setFontSize(10); doc.setTextColor(16, 24, 40); doc.text(pdfTxt('Objet : ' + d.objet), 14, y); y += 6; }
  doc.autoTable(Object.assign({}, STYLE_TABLE, {
    startY: y,
    head: [['Désignation', 'Quantité', 'Unité', 'PU HT', 'Total HT'].map(pdfTxt)],
    body: (d.lignes || []).map(l => [l.designation, fmt(num(l.quantite), num(l.quantite) % 1 ? 2 : 0), l.unite, fmtE2(num(l.pu)), fmtE2(num(l.quantite) * num(l.pu))].map(pdfTxt)),
    columnStyles: { 1: { halign: 'right' }, 3: { halign: 'right' }, 4: { halign: 'right', fontStyle: 'bold' } }
  }));
  y = doc.lastAutoTable.finalY + 10;
  const ht = montantDevis(d), tva = parametresFinanciers(c).tva;
  y = recapitulatif(doc, y, [['Total HT', fmtE2(ht)], [`TVA ${fmt(tva, 1)} %`, fmtE2(ht * tva / 100)], ['TOTAL TTC', fmtE2(ht * (1 + tva / 100)), true]]) + 10;
  if (d.notes) { doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5); doc.setTextColor(71, 84, 103); const l = doc.splitTextToSize(pdfTxt(d.notes), 182); doc.text(l, 14, y); y += l.length * 4.2 + 8; }
  const yS = Math.min(y + 4, 248);
  [['L\'entreprise', nomUser()], ['Bon pour accord du client', 'Date, signature et cachet']].forEach(([t, n], i) => {
    const x = 14 + i * 94;
    doc.setDrawColor(205, 212, 222); doc.roundedRect(x, yS, 88, 30, 1.5, 1.5);
    doc.setFontSize(7.5); doc.setTextColor(102, 112, 133); doc.text(pdfTxt(t.toUpperCase()), x + 3, yS + 5);
    doc.setFontSize(8.5); doc.setTextColor(16, 24, 40); doc.text(pdfTxt(n), x + 3, yS + 10);
  });
  piedDocument(doc, `${entreprise().nom || 'OmSmK'}  ·  ${c.nom}  ·  Devis ${d.numero}`);
  doc.save(`Devis_${String(d.numero).replace(/[^\w-]+/g, '_')}_${c.nom.replace(/[^\w-]+/g, '_')}.pdf`);
  toast(`Devis ${d.numero} généré`, 'succes');
}

function lettreRelancePDF(sitId) {
  const c = ch();
  const s = (db.situations || []).find(x => x.id === sitId);
  if (!s || !globalThis.jspdf) return toast('Bibliothèque PDF non chargée.', 'erreur');
  const { jsPDF } = globalThis.jspdf;
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const t = calcSituation(db, c.id, s.id).tot;
  const ech = echeanceSituation(s, c);
  const rang = (s.relances || []).length + 1;
  let y = enTeteDocument(doc, rang > 1 ? `RELANCE N° ${rang}` : 'RELANCE DE PAIEMENT', `Situation n° ${s.numero} — ${moisLong(s.mois)}`, [`Le ${fmtDate(aujourdHui())}`]);
  const h = cadre(doc, 108, y, 88, 'Destinataire', [c.client || 'Maître d\'ouvrage', ...contactsDe(c.id).filter(k => k.role === 'Maître d\'ouvrage').slice(0, 1).map(k => k.nom || '')].filter(Boolean));
  y += h + 10;
  doc.setFont('helvetica', 'normal'); doc.setFontSize(10); doc.setTextColor(16, 24, 40);
  const texte = `Objet : ${c.nom} — situation de travaux n° ${s.numero} (${moisLong(s.mois)})\n\nMadame, Monsieur,\n\nSauf erreur de notre part, la situation de travaux n° ${s.numero}, d'un montant de ${fmtE2(t.ttc)} TTC, arrivée à échéance le ${fmtDate(ech)}, reste impayée à ce jour.\n\nNous vous remercions de bien vouloir procéder à son règlement dans les meilleurs délais${rang > 1 ? ', cette relance faisant suite à nos précédents courriers' : ''}. Si votre paiement a été effectué entre-temps, nous vous prions de ne pas tenir compte de ce courrier.\n\nNous rappelons que tout retard de paiement entraîne l'application des intérêts moratoires et de l'indemnité forfaitaire pour frais de recouvrement prévus par la réglementation.\n\nNous vous prions d'agréer, Madame, Monsieur, l'expression de nos salutations distinguées.`;
  doc.splitTextToSize(pdfTxt(texte), 182).forEach(l => { doc.text(l, 14, y); y += 5.2; });
  y += 8; doc.setFont('helvetica', 'bold'); doc.text(pdfTxt(nomUser() || ''), 120, y);
  doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(102, 112, 133); doc.text(pdfTxt((user && user.role) || 'Conducteur de travaux'), 120, y + 5);
  piedDocument(doc, `${entreprise().nom || 'OmSmK'}  ·  ${c.nom}  ·  Relance situation n° ${s.numero}`);
  doc.save(`Relance_situation_${s.numero}_${c.nom.replace(/[^\w-]+/g, '_')}.pdf`);
}

function mailRelance(c, objet, corps) {
  const dest = destinataireClient(c);
  location.href = `mailto:${dest ? dest.email : ''}?subject=${encodeURIComponent(objet)}&body=${encodeURIComponent(corps)}`;
}

Object.assign(ACT, {
  devisNew: () => modalDevis(null),
  devisEdit: el => modalDevis((db.devis || []).find(d => d.id === el.dataset.id)),
  dvLigneAjout: () => { lireLignesDevis(); _dvLignes.push({ designation: '', quantite: '', unite: 'U', pu: '' }); renderLignesDevis(); },
  dvLigneSuppr: el => { lireLignesDevis(); _dvLignes.splice(num(el.dataset.i), 1); if (!_dvLignes.length) _dvLignes.push({ designation: '', quantite: '', unite: 'U', pu: '' }); renderLignesDevis(); },
  devisSave: () => {
    if (!val('dvObjet')) return toast('Indiquez l\'objet du devis.', 'alerte');
    lireLignesDevis();
    const lignes = _dvLignes.filter(l => l.designation || num(l.pu));
    db.devis = db.devis || [];
    const id = val('dvId');
    const champs = { numero: val('dvNum'), objet: val('dvObjet'), demandePar: val('dvDemande'), dateEmission: val('dvDate'), lignes, notes: val('dvNotes') };
    if (id) Object.assign(db.devis.find(d => d.id === id), champs);
    else db.devis.push(Object.assign({ id: uid(), chantierId: ui.chantierId, statut: 'brouillon', relances: [], creeLe: aujourdHui(), par: nomUser() }, champs));
    save(); fermerModal(); render(); toast('Devis enregistré', 'succes');
  },
  devisSuppr: async el => {
    if (!await confirmer('Supprimer le devis', 'Le devis sera supprimé (un avenant déjà créé reste dans le marché).', { ok: 'Supprimer', danger: true })) return;
    db.devis = db.devis.filter(d => d.id !== el.dataset.id); save(); render();
  },
  devisStatut: el => {
    const d = (db.devis || []).find(x => x.id === el.dataset.id);
    if (!d) return;
    d.statut = el.dataset.s;
    if (d.statut === 'emis' && !d.dateEmission) d.dateEmission = aujourdHui();
    if (d.statut === 'accepte') {
      d.dateAcceptation = aujourdHui();
      // Devis accepté : avenant au marché, facturable dans les situations
      db.postes = db.postes || [];
      if (!d.posteId || !db.postes.some(p => p.id === d.posteId)) {
        if (!db.postes.some(p => p.chantierId === d.chantierId)) postesDe(db, d.chantierId).forEach(p => { if (p.id === '__marche') db.postes.push(Object.assign({}, p, { id: uid() })); });
        const p = { id: uid(), chantierId: d.chantierId, code: d.numero, designation: d.objet, montant: Math.round(montantDevis(d) * 100) / 100, avenant: true };
        db.postes.push(p); d.posteId = p.id;
      }
    }
    save(); render();
    toast(d.statut === 'accepte' ? `Devis ${d.numero} accepté : avenant ajouté au marché` : `Devis ${d.numero} : ${libStatut(STATUTS_DEVIS, d.statut).toLowerCase()}`, 'succes');
  },
  devisPDF: el => devisPDF(el.dataset.id),
  relanceDevis: el => {
    const c = ch();
    const d = (db.devis || []).find(x => x.id === el.dataset.id);
    d.relances = (d.relances || []).concat([aujourdHui()]);
    save(); render();
    mailRelance(c, `${c.nom} — devis ${d.numero} en attente de réponse`, `Bonjour,\n\nSauf erreur, nous restons sans retour sur notre devis ${d.numero} « ${d.objet} » d'un montant de ${fmtE2(montantDevis(d))} HT, transmis le ${fmtDate(d.dateEmission)}.\n\nPourriez-vous nous indiquer votre décision afin que nous puissions planifier ces travaux ?\n\nCordialement,\n${nomUser()}`);
    toast('Relance enregistrée', 'succes');
  },
  relanceSit: el => {
    const c = ch();
    const s = (db.situations || []).find(x => x.id === el.dataset.id);
    const t = calcSituation(db, c.id, s.id).tot;
    mailRelance(c, `${c.nom} — situation n° ${s.numero} impayée`, `Bonjour,\n\nSauf erreur de notre part, notre situation de travaux n° ${s.numero} (${moisLong(s.mois)}) d'un montant de ${fmtE2(t.ttc)} TTC, échue le ${fmtDate(echeanceSituation(s, c))}, reste impayée.\n\nMerci de bien vouloir procéder à son règlement ou de nous indiquer la date de paiement prévue.\n\nCordialement,\n${nomUser()}`);
    s.relances = (s.relances || []).concat([aujourdHui()]);
    save(); render(); toast('Relance enregistrée', 'succes');
  },
  relanceSitPDF: el => lettreRelancePDF(el.dataset.id)
});
Object.assign(INP, {
  dvTotal: () => { lireLignesDevis(); const z = $('#dvTotal'); if (z) z.textContent = fmtE2(_dvLignes.reduce((t, l) => t + num(l.quantite) * num(l.pu), 0)); }
});
