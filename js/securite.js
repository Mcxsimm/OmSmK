/* ==========================================================================
   OmSmK — sécurité : quarts d'heure sécurité (émargement), accueils des
   nouveaux arrivants, visites sécurité (non-conformités → actions), permis
   de feu (surveillance après travaux) et registre des accidents.
   ========================================================================== */
// deno-lint-ignore-file no-unused-vars
'use strict';

const TYPES_SECU = {
  causerie: { lib: 'Quart d\'heure sécurité', court: 'Quart d\'heure', ic: 'messages-square' },
  accueil: { lib: 'Accueil sécurité', court: 'Accueil', ic: 'user' },
  visite: { lib: 'Visite sécurité', court: 'Visite', ic: 'search' },
  permis: { lib: 'Permis de feu', court: 'Permis de feu', ic: 'flame' },
  evenement: { lib: 'Accident / presqu\'accident', court: 'Événement', ic: 'siren' }
};
const secuDe = (cid, type) => (db.securite || []).filter(s => s.chantierId === cid && (!type || s.type === type)).sort((a, b) => b.date.localeCompare(a.date) || (b.debut || '').localeCompare(a.debut || ''));
const nomK = id => { const k = (db.compagnons || []).find(x => x.id === id); return k ? nomCompagnon(k) : ''; };
const permisAsurveiller = (cid, auj = aujourdHui()) => secuDe(cid, 'permis').filter(p => p.date <= auj && !(p.surveillance && p.surveillance.fait));

// Personnes appelées à signer un enregistrement sécurité
function signatairesSecu(s) {
  const k = id => ({ cle: id, nom: nomK(id), role: ((db.compagnons || []).find(x => x.id === id) || {}).qualification || 'Compagnon' });
  const ext = String(s.externes || '').split(/[,;\n]/).map(x => x.trim()).filter(Boolean).map(n => ({ cle: 'ext:' + n, nom: n, role: 'Participant' }));
  if (s.type === 'causerie') return (s.participants || []).map(k).concat(ext, [{ cle: 'animateur', nom: s.animateur || nomUser(), role: 'Animateur' }]);
  if (s.type === 'accueil') return [s.compagnonId ? Object.assign(k(s.compagnonId), { role: 'Personne accueillie' }) : { cle: 'accueilli', nom: s.nomExterne || '', role: 'Personne accueillie' }, { cle: 'animateur', nom: s.animateur || nomUser(), role: 'Accueil réalisé par' }];
  if (s.type === 'permis') return [{ cle: 'responsable', nom: s.par || nomUser(), role: 'Délivre le permis' }].concat((s.intervenants || []).map(id => Object.assign(k(id), { role: 'Intervenant' })));
  if (s.type === 'visite') return [{ cle: 'auteur', nom: s.auteur || nomUser(), role: 'Visite réalisée par' }];
  return [];
}
const nbSignes = s => signatairesSecu(s).filter(x => (s.signatures || {})[x.cle]).length;

// Indicateurs et alertes sécurité d'un chantier
function etatSecurite(c, auj = aujourdHui()) {
  const tous = secuDe(c.id);
  const accidents = tous.filter(s => s.type === 'evenement' && /^Accident/.test(s.nature || ''));
  const avecArret = accidents.filter(s => s.nature === 'Accident avec arrêt');
  const depuis = avecArret[0] ? avecArret[0].date : (c.dateDebut || null);
  const joursSans = depuis && depuis <= auj ? Math.round((new Date(auj) - new Date(depuis)) / 86400000) : null;
  const causeries = tous.filter(s => s.type === 'causerie');
  const accueillis = new Set(tous.filter(s => s.type === 'accueil').map(s => s.compagnonId));
  const equipe = (db.compagnons || []).filter(k => k.chantierId === c.id && k.actif !== false);
  const sansAccueil = equipe.filter(k => !accueillis.has(k.id));
  const surv = permisAsurveiller(c.id, auj);
  const actionsSecu = (db.actions || []).filter(a => a.chantierId === c.id && (a.origine || {}).type === 'securite' && actionOuverte(a));
  const alertes = [];
  if (sansAccueil.length) alertes.push({ sev: 'serious', ic: 'user', t: `${sansAccueil.length} compagnon(s) sans accueil sécurité`, d: sansAccueil.slice(0, 3).map(k => esc(nomCompagnon(k))).join(', ') + (sansAccueil.length > 3 ? '…' : ''), go: 'securite' });
  if (surv.length) alertes.push({ sev: 'critical', ic: 'flame', t: `Surveillance après permis de feu à confirmer`, d: surv.map(p => `${fmtDateCourt(p.date)}${p.zone ? ' — ' + esc(p.zone) : ''}`).join(' · '), go: 'securite' });
  const enCours = c.dateDebut && c.dateDebut <= auj && (!c.dateFin || c.dateFin >= addDays(auj, -7));
  const derniere = causeries[0];
  if (enCours && (!derniere || derniere.date < addDays(auj, -14))) alertes.push({ sev: 'warning', ic: 'messages-square', t: 'Quart d\'heure sécurité à animer', d: derniere ? `Dernier le ${fmtDate(derniere.date)}.` : 'Aucun quart d\'heure sécurité enregistré.', go: 'securite' });
  if (actionsSecu.some(a => actionEnRetard(a, auj))) alertes.push({ sev: 'serious', ic: 'shield-alert', t: 'Actions sécurité en retard', d: actionsSecu.filter(a => actionEnRetard(a, auj)).slice(0, 2).map(a => esc(a.libelle)).join(' · '), go: 'actions' });
  return { tous, joursSans, accidents, causeries, sansAccueil, equipe, surv, actionsSecu, alertes, causeriesMois: causeries.filter(s => s.date.slice(0, 7) === auj.slice(0, 7)).length };
}

/* ================================== Vue ================================== */
function vSecurite(c) {
  const e = etatSecurite(c);
  const f = ui.secuFiltre || 'tous';
  const boutons = Object.entries(TYPES_SECU).map(([t, d]) => `<button class="btn ${t === 'causerie' ? 'primary' : ''}" data-act="secuNew" data-t="${t}">${icone(d.ic)}${d.court}</button>`).join('');
  const entete = enTetePage({ eyebrow: 'Prévention', titre: 'Sécurité', sous: [sousInfo('shield-check', `${e.tous.length} enregistrement(s)`)], actions: boutons });
  const kpis = `<div class="kpis">
    <div class="card kpi"><div class="kpi-top"><span class="kpi-lbl">Jours sans accident avec arrêt</span><span class="kpi-ico">${icone('shield-check')}</span></div>
      <div class="kpi-val">${e.joursSans === null ? '—' : e.joursSans}<small>${e.joursSans === null ? '' : ' j'}</small></div><div class="kpi-sub">${e.accidents.length ? `${e.accidents.length} accident(s) déclaré(s)` : 'aucun accident déclaré'}</div></div>
    <div class="card kpi"><div class="kpi-top"><span class="kpi-lbl">Quarts d'heure sécurité</span><span class="kpi-ico">${icone('messages-square')}</span></div>
      <div class="kpi-val">${e.causeriesMois}<small> ce mois</small></div><div class="kpi-sub">${e.causeries[0] ? `dernier ${depuis(e.causeries[0].date)} · ${esc(e.causeries[0].theme || '')}` : 'aucun pour l\'instant'}</div></div>
    <div class="card kpi"><div class="kpi-top"><span class="kpi-lbl">Accueils sécurité</span><span class="kpi-ico">${icone('user')}</span></div>
      <div class="kpi-val">${e.equipe.length - e.sansAccueil.length}<small> / ${e.equipe.length}</small></div>
      <div style="margin-top:10px">${barre(e.equipe.length ? (e.equipe.length - e.sansAccueil.length) / e.equipe.length : 0, 'lg')}</div>
      <div class="kpi-sub">${e.sansAccueil.length ? `${e.sansAccueil.length} compagnon(s) à accueillir` : e.equipe.length ? 'toute l\'équipe est accueillie' : 'équipe non renseignée (pointage)'}</div></div>
    <div class="card kpi"><div class="kpi-top"><span class="kpi-lbl">Permis de feu</span><span class="kpi-ico">${icone('flame')}</span></div>
      <div class="kpi-val ${e.surv.length ? 'neg' : ''}">${e.surv.length}<small> à surveiller</small></div><div class="kpi-sub">${secuDe(c.id, 'permis').filter(p => p.date === aujourdHui()).length} permis aujourd'hui</div></div>
  </div>`;
  const alertes = e.alertes.length ? `<div class="card"><div class="card-head"><h3>${icone('triangle-alert')}À traiter</h3><span class="badge warn">${e.alertes.length}</span></div>
    <ul class="attention-list">${e.alertes.map(a => `<li><span class="sev ${a.sev}">${icone(a.ic, 'sm')}</span><div class="grow"><div class="strong">${a.t}</div><div class="small muted">${a.d}</div></div>
      ${a.ic === 'user' ? `<button class="btn sm" data-act="secuNew" data-t="accueil">${icone('plus', 'sm')}Accueil</button>` : a.ic === 'messages-square' ? `<button class="btn sm" data-act="secuNew" data-t="causerie">${icone('plus', 'sm')}Animer</button>` : a.go === 'actions' ? `<button class="btn ghost sm" data-nav="actions">${icone('chevron-right', 'sm')}</button>` : ''}</li>`).join('')}</ul></div>` : '';
  const types = [['tous', 'Tout'], ...Object.entries(TYPES_SECU).map(([t, d]) => [t, d.court])];
  const liste = e.tous.filter(s => f === 'tous' || s.type === f);
  const registre = `<div class="card"><div class="card-head"><div class="seg seg-scroll">${types.map(([v, l]) => `<button class="${f === v ? 'on' : ''}" data-act="secuFiltre" data-f="${v}">${l} <span class="n">${v === 'tous' ? e.tous.length : e.tous.filter(s => s.type === v).length}</span></button>`).join('')}</div></div>
    ${liste.length ? liste.map(s => ligneSecu(s)).join('') : vide('shield-check', 'Registre vide', 'Quarts d\'heure sécurité avec émargement, accueils, visites, permis de feu et événements : tout est tracé ici, daté et signé.')}</div>`;
  return entete + `<div class="stack">${kpis}${alertes}${registre}</div>`;
}

function ligneSecu(s) {
  const d = TYPES_SECU[s.type] || TYPES_SECU.causerie;
  let titre = d.lib, meta = [], extra = '';
  if (s.type === 'causerie') { titre = s.theme || d.lib; meta = [`${(s.participants || []).length} participant(s)`, s.animateur ? 'animé par ' + s.animateur : '']; extra = `<button class="btn sm" data-act="secuPDF" data-id="${esc(s.id)}">${icone('printer', 'sm')}Émargement</button>`; }
  if (s.type === 'accueil') { titre = `Accueil de ${nomK(s.compagnonId) || s.nomExterne || '—'}`; const n = Object.keys(s.items || {}).length; meta = [`${n} / ${REF.accueilSecurite.length} points`, s.animateur]; }
  if (s.type === 'visite') { const nc = Object.values(s.items || {}).filter(v => v === 'nc').length; titre = `Visite sécurité${s.auteur ? ' — ' + s.auteur : ''}`; meta = [nc ? `${nc} non-conformité(s)` : 'aucune non-conformité']; }
  if (s.type === 'permis') {
    titre = `Permis de feu${s.zone ? ' — ' + s.zone : ''}`; meta = [[s.debut, s.fin].filter(Boolean).join(' → '), (s.intervenants || []).map(nomK).filter(Boolean).join(', ')];
    extra = s.surveillance && s.surveillance.fait ? `<span class="badge pos">${icone('check', 'sm')}Surveillé ${esc(s.surveillance.heure || '')}</span>` : `<button class="btn sm primary" data-act="secuSurveillance" data-id="${esc(s.id)}">${icone('check', 'sm')}Surveillance faite</button>`;
  }
  if (s.type === 'evenement') { titre = `${s.nature || 'Événement'}${s.victimeId || s.victime ? ' — ' + (nomK(s.victimeId) || s.victime) : ''}`; meta = [(s.description || '').slice(0, 80)]; }
  const alerteVisite = s.type === 'visite' && Object.values(s.items || {}).includes('nc');
  return `<div class="res-item"><span class="kpi-ico" style="width:34px;height:34px">${icone(d.ic, 'sm')}</span>
    <div><div class="r-desc">${esc(titre)}</div><div class="r-meta"><span>${icone('calendar', 'sm')}${fmtDate(s.date, true)}</span><span class="badge ${s.type === 'evenement' ? 'neg' : alerteVisite ? 'warn' : ''}">${d.court}</span>${meta.filter(Boolean).map(m => `<span>${esc(m)}</span>`).join('')}</div></div>
    <div class="row" style="flex-wrap:nowrap">${['causerie', 'accueil', 'permis'].includes(s.type) && signatairesSecu(s).length ? `<button class="btn sm ${nbSignes(s) === signatairesSecu(s).length ? '' : 'ghost'}" data-act="secuSigner" data-id="${esc(s.id)}" title="Faire signer">${icone('pencil', 'sm')}${nbSignes(s)}/${signatairesSecu(s).length}</button>` : ''}${extra}<button class="btn ghost icon sm" data-act="secuEdit" data-id="${esc(s.id)}" aria-label="Modifier">${icone('pencil', 'sm')}</button><button class="btn ghost icon sm" data-act="secuSuppr" data-id="${esc(s.id)}" aria-label="Supprimer">${icone('trash-2', 'sm')}</button></div></div>`;
}

/* ================================ Modales ================================ */
function choixCompagnons(cid, coches, nom = 'scK') {
  const ks = compagnonsDe(cid);
  if (!ks.length) return '<p class="small muted">Aucun compagnon : constituez l\'équipe depuis le pointage journalier.</p>';
  return `<div class="choix-k">${ks.map(k => `<label class="checkbox"><input type="checkbox" class="${nom}" value="${esc(k.id)}" ${coches.includes(k.id) ? 'checked' : ''}><span>${esc(nomCompagnon(k))} <span class="muted small">${esc(k.qualification || '')}</span></span></label>`).join('')}</div>`;
}

function modalSecu(type, s) {
  const c = ch();
  const d = TYPES_SECU[type];
  const auj = aujourdHui();
  const e = s || { date: auj };
  let corps = `<input type="hidden" id="scId" value="${esc(s ? s.id : '')}"><input type="hidden" id="scType" value="${type}">`;
  if (type === 'causerie') {
    // Par défaut : compagnons pointés présents ce jour-là, sinon toute l'équipe
    const presents = pointagesDe(db, c.id, e.date, e.date).filter(p => p.statut === 'present').map(p => p.compagnonId);
    const coches = s ? s.participants || [] : (presents.length ? presents : compagnonsDe(c.id).map(k => k.id));
    corps += `<div class="form-grid">${champ('scDate', 'Date', e.date, 'date')}${champ('scAnim', 'Animateur', e.animateur || nomUser())}</div>
      <datalist id="dlThemes">${REF.themesSecurite.map(t => `<option value="${esc(t)}">`).join('')}</datalist>
      ${champ('scTheme', 'Thème *', e.theme, 'text', 'list="dlThemes" placeholder="choisir ou saisir un thème"')}
      <div class="label">Participants (émargement)</div>${choixCompagnons(c.id, coches)}
      ${champ('scExt', 'Autres participants', e.externes, 'text', 'placeholder="intérimaires, sous-traitants…"')}
      ${zoneTexte('scNotes', 'Points abordés, questions, remontées du terrain', e.notes, 'rows="3"')}`;
  }
  if (type === 'accueil') {
    const deja = new Set(secuDe(c.id, 'accueil').map(x => x.compagnonId));
    const ks = compagnonsDe(c.id);
    const def = s ? s.compagnonId : (ks.find(k => !deja.has(k.id)) || ks[0] || {}).id;
    corps += `<div class="form-grid">${champ('scDate', 'Date', e.date, 'date')}${champ('scAnim', 'Accueil réalisé par', e.animateur || nomUser())}</div>
      ${ks.length ? selectHTML('scK1', 'Compagnon accueilli', ks.map(k => [k.id, nomCompagnon(k) + (deja.has(k.id) && k.id !== (s && s.compagnonId) ? ' (déjà accueilli)' : '')]), def) : champ('scNomExt', 'Personne accueillie', e.nomExterne)}
      <div class="label">Points présentés</div>
      <div class="choix-k">${REF.accueilSecurite.map((it, i) => `<label class="checkbox"><input type="checkbox" class="scItem" value="${i}" ${!s || (s.items || {})[i] ? 'checked' : ''}><span class="small">${esc(it)}</span></label>`).join('')}</div>`;
  }
  if (type === 'visite') {
    corps += `<div class="form-grid">${champ('scDate', 'Date', e.date, 'date')}${champ('scAuteur', 'Visite réalisée par', e.auteur || nomUser())}</div>
      <div class="label">Points de contrôle</div>
      <div class="visite-grille">${REF.visiteSecurite.map((it, i) => {
        const v = (e.items || {})[i] || 'c';
        return `<div class="visite-ligne"><span class="small">${esc(it)}</span><div class="seg seg-sm" role="radiogroup">${[['c', 'OK'], ['nc', 'NC'], ['na', 'S.O.']].map(([k, l]) => `<label class="${v === k ? 'on' : ''} ${k}"><input type="radio" name="vs${i}" value="${k}" ${v === k ? 'checked' : ''} data-change="visiteRadio">${l}</label>`).join('')}</div></div>`;
      }).join('')}</div>
      ${zoneTexte('scNotes', 'Observations', e.notes, 'rows="2"')}
      ${s ? '' : `<label class="checkbox field"><input type="checkbox" id="scActions" checked><span>Créer une action corrective pour chaque non-conformité (échéance 48 h)</span></label>`}`;
  }
  if (type === 'permis') {
    corps += `<div class="form-grid">${champ('scDate', 'Date', e.date, 'date')}${champ('scZone', 'Zone / localisation *', e.zone, 'text', 'placeholder="terrasse 2, relevés côté nord…"')}
        ${champ('scDebut', 'Début des travaux', e.debut || '08:00', 'time')}${champ('scFin', 'Fin des travaux par point chaud', e.fin || '', 'time')}</div>
      ${champ('scTravaux', 'Nature des travaux', e.travaux || 'Soudure de membranes bitumineuses au chalumeau', 'text')}
      <div class="label">Intervenants</div>${choixCompagnons(c.id, s ? s.intervenants || [] : pointagesDe(db, c.id, e.date, e.date).filter(p => p.statut === 'present').map(p => p.compagnonId))}
      <div class="label">Mesures préalables</div>
      <div class="choix-k">${REF.permisFeu.map((it, i) => `<label class="checkbox"><input type="checkbox" class="scItem" value="${i}" ${(e.mesures || {})[i] ? 'checked' : ''}><span class="small">${esc(it)}</span></label>`).join('')}</div>
      <div class="alert warn" style="margin-top:12px">${icone('flame')}<div>Surveillance de la zone <b>2 heures</b> après la fin des travaux par point chaud, puis contrôle final.</div></div>
      <label class="checkbox field"><input type="checkbox" id="scSurv" ${e.surveillance && e.surveillance.fait ? 'checked' : ''}><span>Surveillance après travaux réalisée${e.surveillance && e.surveillance.fait ? ` (${esc(e.surveillance.heure || '')}${e.surveillance.par ? ', ' + esc(e.surveillance.par) : ''})` : ''}</span></label>`;
  }
  if (type === 'evenement') {
    const ks = compagnonsDe(c.id, true);
    corps += `<div class="form-grid">${champ('scDate', 'Date', e.date, 'date')}${selectHTML('scNature', 'Nature', REF.typesEvenement, e.nature || 'Presqu\'accident')}
        ${selectHTML('scVictime', 'Personne concernée', [['', '—'], ...ks.map(k => [k.id, nomCompagnon(k)])], e.victimeId || '')}${champ('scArret', 'Jours d\'arrêt', e.arret || '', 'number', 'min="0"')}</div>
      ${zoneTexte('scDesc', 'Description des faits *', e.description, 'rows="3"')}
      ${zoneTexte('scCauses', 'Causes identifiées', e.causes, 'rows="2"')}
      ${zoneTexte('scMesures', 'Mesures prises / à prendre', e.mesures, 'rows="2"')}
      ${s ? '' : `<label class="checkbox field"><input type="checkbox" id="scActions" checked><span>Créer une action pour les mesures à prendre</span></label>`}
      <div class="alert info">${icone('info')}<div>Un accident du travail se déclare à la CPAM sous 48 h (déclaration employeur). Prévenez la direction et le service prévention.</div></div>`;
  }
  ouvrirModal(s ? `Modifier — ${d.lib}` : d.lib, corps,
    `<button class="btn" data-act="fermerModal">Annuler</button><button class="btn primary" data-act="secuSave">Enregistrer</button>`, { icone: d.ic, taille: type === 'visite' ? 'wide' : '' });
}

/* --------------------------------- PDF ----------------------------------- */
function emargementPDF(id) {
  const c = ch();
  const s = (db.securite || []).find(x => x.id === id);
  if (!s || !globalThis.jspdf) return toast('Bibliothèque PDF non chargée.', 'erreur');
  const { jsPDF } = globalThis.jspdf;
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  let y = enTeteDocument(doc, 'QUART D\'HEURE SÉCURITÉ', fmtDate(s.date, true), [s.animateur ? `Animateur : ${s.animateur}` : '']);
  const h1 = cadre(doc, 14, y, 88, 'Chantier', [c.nom, c.adresse || ''].filter(Boolean));
  const h2 = cadre(doc, 108, y, 88, 'Thème', doc.splitTextToSize(pdfTxt(s.theme || '-'), 80).slice(0, 3));
  y += Math.max(h1, h2) + 7;
  if (s.notes) {
    doc.setFont('helvetica', 'bold'); doc.setFontSize(9.5); doc.setTextColor(16, 24, 40); doc.text(pdfTxt('Points abordés'), 14, y); y += 5;
    doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(52, 64, 84);
    const l = doc.splitTextToSize(pdfTxt(s.notes), 182); doc.text(l, 14, y); y += l.length * 4.4 + 6;
  }
  const sig = s.signatures || {};
  const sigs = signatairesSecu(s).filter(x => x.cle !== 'animateur');
  const lignes = sigs.map(x => { const k = (db.compagnons || []).find(c2 => c2.id === x.cle); return [x.nom, k ? k.qualification || '' : '', k ? k.interim || entreprise().nom || '' : '', '']; });
  const cles = sigs.map(x => x.cle);
  for (let i = 0; i < 3; i++) lignes.push(['', '', '', '']);
  doc.autoTable(Object.assign({}, STYLE_TABLE, {
    startY: y,
    head: [['Nom', 'Qualification', 'Entreprise', 'Signature'].map(pdfTxt)],
    body: lignes.map(l => l.map(pdfTxt)),
    styles: Object.assign({}, STYLE_TABLE.styles, { minCellHeight: 11, valign: 'middle', lineWidth: 0.2 }),
    columnStyles: { 3: { cellWidth: 55 } },
    didDrawCell: d => { if (d.section === 'body' && d.column.index === 3 && sig[cles[d.row.index]]) signaturePDF(doc, sig[cles[d.row.index]], d.cell.x + 1, d.cell.y + 1, d.cell.width - 2, d.cell.height - 2); }
  }));
  const yA = Math.min(doc.lastAutoTable.finalY + 8, 250);
  doc.setDrawColor(205, 212, 222); doc.roundedRect(124, yA, 72, 28, 1.5, 1.5);
  doc.setFontSize(7.5); doc.setTextColor(102, 112, 133); doc.text(pdfTxt('ANIMATEUR'), 127, yA + 5);
  doc.setFontSize(8.5); doc.setTextColor(16, 24, 40); doc.text(pdfTxt(s.animateur || ''), 127, yA + 10);
  signaturePDF(doc, sig.animateur, 127, yA + 12, 66, 14);
  piedDocument(doc, `${entreprise().nom || 'OmSmK'}  ·  ${c.nom}  ·  Quart d'heure sécurité du ${fmtDate(s.date)}`);
  doc.save(`Quart_heure_securite_${s.date}_${c.nom.replace(/[^\w-]+/g, '_')}.pdf`);
  toast('Feuille d\'émargement générée', 'succes');
}

/* -------------------------------- Actions -------------------------------- */
Object.assign(ACT, {
  secuNew: el => modalSecu(el.dataset.t, null),
  secuEdit: el => { const s = (db.securite || []).find(x => x.id === el.dataset.id); if (s) modalSecu(s.type, s); },
  secuFiltre: el => { ui.secuFiltre = el.dataset.f; render(); },
  secuSuppr: async el => {
    if (!await confirmer('Supprimer l\'enregistrement', 'Cet enregistrement sera retiré du registre sécurité.', { ok: 'Supprimer', danger: true })) return;
    db.securite = db.securite.filter(s => s.id !== el.dataset.id); save(); render();
  },
  secuSurveillance: el => {
    const s = (db.securite || []).find(x => x.id === el.dataset.id);
    if (!s) return;
    s.surveillance = { fait: true, heure: new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }), par: nomUser() };
    save(); render(); toast('Surveillance après travaux enregistrée', 'succes');
  },
  secuPDF: el => emargementPDF(el.dataset.id),
  secuSigner: el => {
    const s = (db.securite || []).find(x => x.id === el.dataset.id);
    if (!s) return;
    modalSignatures({ titre: `Signatures — ${TYPES_SECU[s.type].lib}`, sousTitre: `${fmtDate(s.date, true)}${s.theme ? ' · ' + esc(s.theme) : s.zone ? ' · ' + esc(s.zone) : ''}`,
      signataires: signatairesSecu(s), signatures: s.signatures || {},
      apres: sig => { s.signatures = sig; save(); render(); toast(`${nbSignes(s)} / ${signatairesSecu(s).length} signature(s) enregistrée(s)`, 'succes'); } });
  },
  secuSave: () => {
    const type = val('scType'), id = val('scId');
    const coches = cl => $$('.' + cl).filter(x => x.checked).map(x => x.value);
    const items = () => Object.fromEntries(coches('scItem').map(i => [i, true]));
    const data = { date: val('scDate') || aujourdHui() };
    if (type === 'causerie') {
      if (!val('scTheme')) return toast('Indiquez le thème.', 'alerte');
      Object.assign(data, { theme: val('scTheme'), animateur: val('scAnim'), participants: coches('scK'), externes: val('scExt'), notes: val('scNotes') });
    }
    if (type === 'accueil') Object.assign(data, { compagnonId: val('scK1'), nomExterne: val('scNomExt'), animateur: val('scAnim'), items: items() });
    if (type === 'visite') {
      const its = {};
      REF.visiteSecurite.forEach((_, i) => { const r = $(`input[name="vs${i}"]:checked`); its[i] = r ? r.value : 'c'; });
      Object.assign(data, { auteur: val('scAuteur'), items: its, notes: val('scNotes') });
    }
    if (type === 'permis') {
      if (!val('scZone')) return toast('Indiquez la zone des travaux.', 'alerte');
      const ancien = id ? db.securite.find(x => x.id === id) : null;
      const fait = $('#scSurv').checked;
      Object.assign(data, { zone: val('scZone'), debut: val('scDebut'), fin: val('scFin'), travaux: val('scTravaux'), intervenants: coches('scK'), mesures: items(),
        surveillance: fait ? (ancien && ancien.surveillance && ancien.surveillance.fait ? ancien.surveillance : { fait: true, heure: new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }), par: nomUser() }) : { fait: false } });
      if (Object.keys(data.mesures).length < REF.permisFeu.length) toast('Toutes les mesures préalables ne sont pas cochées.', 'alerte');
    }
    if (type === 'evenement') {
      if (!val('scDesc')) return toast('Décrivez les faits.', 'alerte');
      Object.assign(data, { nature: val('scNature'), victimeId: val('scVictime'), arret: num(val('scArret')), description: val('scDesc'), causes: val('scCauses'), mesures: val('scMesures') });
    }
    db.securite = db.securite || [];
    let s;
    if (id) { s = db.securite.find(x => x.id === id); Object.assign(s, data); }
    else { s = Object.assign({ id: uid(), chantierId: ui.chantierId, type, par: nomUser() }, data); db.securite.push(s); }
    // Actions correctives
    let nA = 0;
    if (!id && $('#scActions') && $('#scActions').checked) {
      if (type === 'visite') Object.entries(s.items).filter(([, v]) => v === 'nc').forEach(([i]) => { creerAction({ libelle: `Sécurité — ${REF.visiteSecurite[i]}`, responsable: ch().chef || '', echeance: addDays(s.date, 2), origine: { type: 'securite', id: s.id } }); nA++; });
      if (type === 'evenement' && s.mesures) { creerAction({ libelle: `Sécurité — ${s.mesures}`, responsable: ch().conducteur || '', echeance: addDays(s.date, 7), origine: { type: 'securite', id: s.id } }); nA++; }
    }
    save(); fermerModal(); render();
    toast(`Enregistré : ${TYPES_SECU[type].lib.toLowerCase()}${nA ? ` · ${nA} action(s) corrective(s) créée(s)` : ''}`, 'succes');
  }
});

Object.assign(CHG, {
  visiteRadio: el => { $$(`input[name="${el.name}"]`).forEach(r => r.parentElement.classList.toggle('on', r.checked)); }
});
