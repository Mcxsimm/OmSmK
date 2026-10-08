/* ==========================================================================
   OmSmK — préparation de chantier et registre des documents
   Préparation : liste des étapes de la passation à l'ouverture (statut,
   échéance, responsable, note), reliée au plan d'actions.
   Documents : plans d'exécution, fiches et avis techniques, PV d'essai…
   avec indice, diffusion, visa et constitution du DOE.
   ========================================================================== */
// deno-lint-ignore-file no-unused-vars
'use strict';

const CLS_STATUT_PREP = { afaire: '', encours: 'info', fait: 'pos', so: '' };
const CLS_STATUT_DOC = { encours: '', diffuse: 'info', vise: 'pos', vise_obs: 'warn', refuse: 'neg' };
const documentsDe = cid => (db.documents || []).filter(d => d.chantierId === cid).sort((a, b) => (a.type || '').localeCompare(b.type || '') || (a.reference || '').localeCompare(b.reference || '', 'fr', { numeric: true }) || String(b.indice || '').localeCompare(String(a.indice || '')));
// Dernier indice de chaque document (même référence)
const derniersIndices = cid => { const vus = new Set(); return documentsDe(cid).filter(d => { const k = (d.reference || d.titre || d.id); if (vus.has(k)) return false; vus.add(k); return true; }); };

/* ------------------------------ Préparation ------------------------------ */
function vPreparation(c) {
  const e = etatPreparation(db, c.id, REF.preparation);
  const entete = enTetePage({ eyebrow: 'Chantier', titre: 'Préparation de chantier', sous: [sousInfo('list-checks', `${e.faits} / ${e.total} étapes`), e.retard.length ? `<span class="badge neg">${e.retard.length} en retard</span>` : ''] });
  const resp = datalistResponsables(c.id);
  const sections = REF.preparation.map((sec, si) => {
    const items = e.items.filter(i => i.cle.startsWith(si + '-'));
    const n = items.filter(i => i.statut === 'fait').length, tot = items.filter(i => i.statut !== 'so').length;
    return `<div class="card"><div class="card-head"><h3>${esc(sec.section)}</h3><span class="hint">${n} / ${tot}</span></div>
      ${items.map(i => {
        const retard = i.statut !== 'fait' && i.statut !== 'so' && i.echeance && i.echeance < aujourdHui();
        return `<div class="prep-item ${i.statut}">
          <div class="prep-txt"><div class="${i.statut === 'so' ? 'muted' : 'strong'}">${esc(i.texte)}</div>
            <div class="r-meta">${i.responsable ? `<span>${icone('user', 'sm')}${esc(i.responsable)}</span>` : ''}${i.note ? `<span>${icone('notebook-pen', 'sm')}${esc(i.note)}</span>` : ''}${i.statut === 'fait' && i.date ? `<span>${icone('check', 'sm')}le ${fmtDateCourt(i.date)}${i.par ? ' par ' + esc(i.par) : ''}</span>` : ''}${retard ? `<span class="badge neg">${icone('triangle-alert', 'sm')}échéance ${fmtDateCourt(i.echeance)}</span>` : ''}</div></div>
          <div class="prep-champs">
            <select class="input prep-st st-${i.statut}" data-change="prepChamp" data-k="${i.cle}" data-f="statut" aria-label="Statut">${STATUTS_PREP.map(([v, l]) => `<option value="${v}" ${i.statut === v ? 'selected' : ''}>${l}</option>`).join('')}</select>
            ${['fait', 'so'].includes(i.statut) ? '' : `<input class="input" type="date" value="${esc(i.echeance || '')}" data-change="prepChamp" data-k="${i.cle}" data-f="echeance" aria-label="Échéance" title="Échéance">`}
            <button class="btn ghost icon sm" data-act="prepDetail" data-k="${i.cle}" title="Responsable, note, action" aria-label="Détail">${icone('pencil', 'sm')}</button></div></div>`;
      }).join('')}</div>`;
  }).join('');
  return entete + `<div class="stack">${resp}
    <div class="card card-pad"><div class="row" style="justify-content:space-between;margin-bottom:8px"><b>Avancement de la préparation</b><span class="strong">${pc(e.pct)}</span></div>${barre(e.pct, e.pct >= 1 ? 'pos lg' : 'lg')}
      <p class="small muted" style="margin-top:8px">Marquez « Sans objet » ce qui ne concerne pas ce chantier. Une étape avec responsable et échéance peut devenir une action suivie en réunion.</p></div>
    ${sections}</div>`;
}

function majPrep(cle, champs) {
  const c = ch();
  db.checklists[c.id] = db.checklists[c.id] || {};
  const prep = db.checklists[c.id].prep = db.checklists[c.id].prep || {};
  const it = prep[cle] = Object.assign({ statut: 'afaire' }, prep[cle], champs);
  if (champs.statut === 'fait' && !it.date) { it.date = aujourdHui(); it.par = nomUser(); }
  if (champs.statut && champs.statut !== 'fait') { delete it.date; delete it.par; }
  save();
}

function modalPrepDetail(cle) {
  const c = ch();
  const it = etatPreparation(db, c.id, REF.preparation).items.find(i => i.cle === cle);
  ouvrirModal('Étape de préparation', `<p class="strong" style="margin-bottom:14px">${esc(it.texte)}</p>${datalistResponsables(c.id)}
    <input type="hidden" id="ppK" value="${cle}">
    <div class="form-grid">${champ('ppResp', 'Responsable', it.responsable, 'text', 'list="dlResp"')}${champ('ppEch', 'Échéance', it.echeance, 'date')}</div>
    ${zoneTexte('ppNote', 'Note (référence, n° de récépissé, contact…)', it.note, 'rows="2"')}
    <label class="checkbox field"><input type="checkbox" id="ppAction"><span>Créer l'action correspondante dans le plan d'actions</span></label>`,
    `<button class="btn" data-act="fermerModal">Annuler</button><button class="btn primary" data-act="prepDetailOk">Enregistrer</button>`, { icone: 'list-checks' });
}

/* ------------------------------- Documents ------------------------------- */
function vDocuments(c) {
  const f = ui.docFiltre || 'tous';
  const tous = documentsDe(c.id);
  const derniers = derniersIndices(c.id);
  const attente = documentsEnAttente(db, c.id);
  const liste = (f === 'tous' ? derniers : f === 'historique' ? tous : f === 'doe' ? derniers.filter(d => d.doe) : derniers.filter(d => d.statut === f));
  const entete = enTetePage({ eyebrow: 'Coordination', titre: 'Registre des documents', sous: [sousInfo('folder-open', `${accord(derniers.length, 'document(s)')}`), attente.length ? `<span class="badge warn">${accord(attente.length, 'visa(s)')} en attente</span>` : ''],
    actions: `<button class="btn" data-act="doePDF" ${derniers.some(d => d.doe) ? '' : 'disabled'}>${icone('file-text')}Bordereau DOE</button><button class="btn primary" data-act="docNew">${icone('plus')}Nouveau document</button>` });
  const seg = `<div class="seg seg-scroll">${[['tous', 'Dernier indice', derniers.length], ['diffuse', 'En attente de visa', derniers.filter(d => d.statut === 'diffuse').length], ['vise_obs', 'Visés avec obs.', derniers.filter(d => d.statut === 'vise_obs').length], ['refuse', 'Refusés', derniers.filter(d => d.statut === 'refuse').length], ['doe', 'DOE', derniers.filter(d => d.doe).length], ['historique', 'Historique', tous.length]]
    .map(([v, l, n]) => `<button class="${f === v ? 'on' : ''}" data-act="docFiltre" data-f="${v}">${l} <span class="n">${n}</span></button>`).join('')}</div>`;
  const table = liste.length ? `<div class="table-wrap"><table class="table"><thead><tr><th>Référence</th><th>Document</th><th>Ind.</th><th>Émetteur</th><th>Diffusé le</th><th>Statut</th><th>DOE</th><th></th></tr></thead><tbody>
    ${liste.map(d => {
      const enAttente = attente.includes(d);
      return `<tr><td class="strong">${esc(d.reference || '—')}</td><td><div>${esc(d.titre || '')}</div><div class="sub">${esc(d.type || '')}${d.lien ? ` · <a href="${esc(d.lien)}" target="_blank" rel="noopener">ouvrir ${icone('external-link', 'sm')}</a>` : ''}</div></td>
        <td><span class="badge">${esc(d.indice || '0')}</span></td><td class="small">${esc(d.emetteur || '')}</td><td class="small">${d.diffuseLe ? fmtDate(d.diffuseLe) : '—'}</td>
        <td><span class="badge ${CLS_STATUT_DOC[d.statut] || ''} dot">${esc(libStatut(STATUTS_DOC, d.statut))}</span>${enAttente ? `<div class="xs neg">${icone('clock', 'sm')}depuis ${Math.round((new Date(aujourdHui()) - new Date(d.diffuseLe)) / 86400000)} j</div>` : ''}${d.visa && d.visa.avis ? `<div class="sub">${esc(d.visa.avis)}</div>` : ''}</td>
        <td><label class="checkbox"><input type="checkbox" ${d.doe ? 'checked' : ''} data-change="docDoe" data-id="${esc(d.id)}" aria-label="Pièce du DOE"></label></td>
        <td class="num"><div class="row" style="flex-wrap:nowrap;justify-content:flex-end">${d.statut === 'diffuse' ? `<button class="btn sm" data-act="docVisa" data-id="${esc(d.id)}">${icone('check', 'sm')}Visa</button>` : ''}${['vise_obs', 'refuse'].includes(d.statut) ? `<button class="btn sm" data-act="docIndice" data-id="${esc(d.id)}" title="Nouvel indice">${icone('copy', 'sm')}Indice +</button>` : ''}
          <button class="btn ghost icon sm" data-act="docEdit" data-id="${esc(d.id)}" aria-label="Modifier">${icone('pencil', 'sm')}</button></div></td></tr>`;
    }).join('')}</tbody></table></div>` : vide('folder-open', 'Aucun document', 'Tenez à jour la liste des plans, notes et fiches : indice, diffusion, visa du bureau de contrôle ou du maître d\'œuvre, et cochez les pièces à remettre dans le DOE.');
  return entete + `<div class="stack"><div class="card"><div class="card-head">${seg}</div>${table}</div></div>`;
}

function modalDocument(d, base) {
  const c = ch();
  const e = d || base || { type: REF.typesDocuments[0], indice: 'A', statut: 'encours', emetteur: entreprise().nom || '' };
  ouvrirModal(d ? 'Modifier le document' : base ? `Nouvel indice — ${base.reference || base.titre}` : 'Nouveau document', `
    <input type="hidden" id="dcId" value="${esc(d ? d.id : '')}">
    <div class="form-grid">${selectHTML('dcType', 'Type', REF.typesDocuments, e.type)}${champ('dcRef', 'Référence', e.reference, 'text', 'placeholder="ex : EXE-ETA-001"')}
      ${champ('dcTitre', 'Titre *', e.titre)}${champ('dcInd', 'Indice', e.indice)}
      ${champ('dcEmet', 'Émetteur', e.emetteur)}${selectHTML('dcStatut', 'Statut', STATUTS_DOC, e.statut)}
      ${champ('dcDiff', 'Diffusé le', e.diffuseLe, 'date')}${champ('dcDest', 'Diffusé à', e.diffusion, 'text', 'placeholder="MOE, bureau de contrôle…"')}</div>
    ${champ('dcLien', 'Lien vers le fichier (GED, Drive, SharePoint…)', e.lien, 'url', 'placeholder="https://…"')}
    <label class="checkbox field"><input type="checkbox" id="dcDoe" ${e.doe ? 'checked' : ''}><span>Pièce à remettre dans le DOE</span></label>`,
    `${d ? `<button class="btn danger" data-act="docSuppr" data-id="${esc(d.id)}" style="margin-right:auto">${icone('trash-2')}Supprimer</button>` : ''}<button class="btn" data-act="fermerModal">Annuler</button><button class="btn primary" data-act="docSave">Enregistrer</button>`, { icone: 'folder-open' });
}

function modalVisa(d) {
  ouvrirModal(`Visa — ${d.reference || d.titre}`, `<input type="hidden" id="vsId" value="${esc(d.id)}">
    <div class="form-grid">${selectHTML('vsStatut', 'Avis', STATUTS_DOC.filter(s => ['vise', 'vise_obs', 'refuse'].includes(s[0])), 'vise')}${champ('vsDate', 'Date du visa', aujourdHui(), 'date')}</div>
    ${champ('vsPar', 'Visé par', '', 'text', 'placeholder="bureau de contrôle, MOE…"')}
    ${zoneTexte('vsAvis', 'Observations', '', 'rows="3"')}`,
    `<button class="btn" data-act="fermerModal">Annuler</button><button class="btn primary" data-act="docVisaOk">Enregistrer le visa</button>`, { icone: 'check', taille: 'narrow' });
}

function bordereauDOE() {
  const c = ch();
  if (!globalThis.jspdf) return toast('Bibliothèque PDF non chargée.', 'erreur');
  const { jsPDF } = globalThis.jspdf;
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  let y = enTeteDocument(doc, 'DOSSIER DES OUVRAGES EXÉCUTÉS', 'Bordereau des pièces', [`Le ${fmtDate(aujourdHui())}`]);
  y += cadre(doc, 14, y, 182, 'Chantier', [c.nom, c.adresse || '', c.client ? `Maître d'ouvrage : ${c.client}` : ''].filter(Boolean)) + 7;
  const pieces = derniersIndices(c.id).filter(d => d.doe);
  doc.autoTable(Object.assign({}, STYLE_TABLE, {
    startY: y,
    head: [['N°', 'Type', 'Référence', 'Désignation', 'Indice', 'Visa'].map(pdfTxt)],
    body: pieces.map((d, i) => [String(i + 1), d.type || '', d.reference || '', d.titre || '', d.indice || '', libStatut(STATUTS_DOC, d.statut)].map(pdfTxt)),
    columnStyles: { 0: { cellWidth: 10 }, 4: { cellWidth: 14 } }
  }));
  piedDocument(doc, `${entreprise().nom || 'OmSmK'}  ·  ${c.nom}  ·  Bordereau DOE`);
  doc.save(`DOE_bordereau_${c.nom.replace(/[^\w-]+/g, '_')}.pdf`);
  toast('Bordereau du DOE généré', 'succes');
}

Object.assign(ACT, {
  prepDetail: el => modalPrepDetail(el.dataset.k),
  prepDetailOk: () => {
    const cle = val('ppK');
    majPrep(cle, { responsable: val('ppResp'), echeance: val('ppEch'), note: val('ppNote') });
    if ($('#ppAction').checked) {
      const it = etatPreparation(db, ui.chantierId, REF.preparation).items.find(i => i.cle === cle);
      creerAction({ libelle: `Préparation — ${it.texte}`, responsable: val('ppResp'), echeance: val('ppEch') || addDays(aujourdHui(), 7) });
      save();
    }
    fermerModal(); render(); toast('Étape mise à jour', 'succes');
  },
  docFiltre: el => { ui.docFiltre = el.dataset.f; render(); },
  docNew: () => modalDocument(null),
  docEdit: el => modalDocument((db.documents || []).find(d => d.id === el.dataset.id)),
  docIndice: el => {
    const d = (db.documents || []).find(x => x.id === el.dataset.id);
    const suiv = /^[A-Y]$/i.test(d.indice || '') ? String.fromCharCode(d.indice.toUpperCase().charCodeAt(0) + 1) : String(num(d.indice) + 1);
    modalDocument(null, Object.assign({}, d, { indice: suiv, statut: 'encours', diffuseLe: '', visa: null }));
  },
  docSave: () => {
    if (!val('dcTitre')) return toast('Indiquez le titre du document.', 'alerte');
    db.documents = db.documents || [];
    const id = val('dcId');
    const champs = { type: val('dcType'), reference: val('dcRef'), titre: val('dcTitre'), indice: val('dcInd'), emetteur: val('dcEmet'), statut: val('dcStatut'), diffuseLe: val('dcDiff'), diffusion: val('dcDest'), lien: val('dcLien'), doe: $('#dcDoe').checked };
    if (champs.statut === 'diffuse' && !champs.diffuseLe) champs.diffuseLe = aujourdHui();
    if (id) Object.assign(db.documents.find(d => d.id === id), champs);
    else db.documents.push(Object.assign({ id: uid(), chantierId: ui.chantierId, creeLe: aujourdHui(), par: nomUser() }, champs));
    save(); fermerModal(); render(); toast('Document enregistré', 'succes');
  },
  docSuppr: async el => {
    if (!await confirmer('Supprimer le document', 'Cette ligne du registre sera supprimée.', { ok: 'Supprimer', danger: true })) return;
    db.documents = db.documents.filter(d => d.id !== el.dataset.id); save(); render();
  },
  docVisa: el => modalVisa((db.documents || []).find(d => d.id === el.dataset.id)),
  docVisaOk: () => {
    const d = (db.documents || []).find(x => x.id === val('vsId'));
    d.statut = val('vsStatut');
    d.visa = { date: val('vsDate'), par: val('vsPar'), avis: val('vsAvis') };
    save(); fermerModal(); render(); toast('Visa enregistré', 'succes');
  },
  doePDF: () => bordereauDOE()
});
Object.assign(CHG, {
  prepChamp: el => { majPrep(el.dataset.k, { [el.dataset.f]: el.value }); render(); },
  docDoe: el => { const d = (db.documents || []).find(x => x.id === el.dataset.id); if (d) { d.doe = el.checked; save(); } }
});
