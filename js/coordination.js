/* ==========================================================================
   OmSmK — coordination : annuaire du chantier, plan d'actions et comptes
   rendus de réunion (PDF à diffuser).
   ========================================================================== */
// deno-lint-ignore-file no-unused-vars
'use strict';

const ROLES_CONTACT = ['Maître d\'ouvrage', 'Maître d\'œuvre', 'Bureau de contrôle', 'CSPS', 'OPC', 'Entreprise générale', 'Autre corps d\'état', 'Sous-traitant', 'Fournisseur', 'Interne', 'Autre'];
const TYPES_REUNION = ['Réunion de chantier', 'Réunion de préparation', 'Réunion de lancement', 'Visite CSPS', 'OPR', 'Réception', 'Réunion interne', 'Autre'];
const STATUTS_PARTICIPANT = [['present', 'Présent', 'P'], ['excuse', 'Excusé', 'E'], ['absent', 'Absent', 'A'], ['diffusion', 'Diffusion', 'D']];
const ORIGINES_ACTION = { reunion: ['CR', 'messages-square'], securite: ['Sécurité', 'shield-alert'], manuel: ['', 'list-todo'] };

const contactsDe = cid => (db.contacts || []).filter(k => k.chantierId === cid)
  .sort((a, b) => ROLES_CONTACT.indexOf(a.role) - ROLES_CONTACT.indexOf(b.role) || (a.societe || '').localeCompare(b.societe || '', 'fr') || (a.nom || '').localeCompare(b.nom || '', 'fr'));
const reunionsDe = cid => (db.reunions || []).filter(r => r.chantierId === cid).sort((a, b) => num(b.numero) - num(a.numero));
const libContact = k => [k.nom, k.societe].filter(Boolean).join(' — ');

// Noms proposés comme responsables d'action : annuaire, compagnons, utilisateur
function responsablesPossibles(cid) {
  const s = new Set();
  if (nomUser()) s.add(nomUser());
  contactsDe(cid).forEach(k => s.add(k.societe ? `${k.societe}${k.nom ? ' (' + k.nom + ')' : ''}` : k.nom));
  (db.compagnons || []).filter(k => k.chantierId === cid && k.actif !== false).forEach(k => s.add(`${k.prenom || ''} ${k.nom || ''}`.trim()));
  return [...s].filter(Boolean);
}
const datalistResponsables = cid => `<datalist id="dlResp">${responsablesPossibles(cid).map(x => `<option value="${esc(x)}">`).join('')}</datalist>`;

function badgeEcheance(a) {
  if (!actionOuverte(a)) return `<span class="badge pos">${icone('check', 'sm')}Faite${a.faiteLe ? ' le ' + fmtDateCourt(a.faiteLe) : ''}</span>`;
  if (!a.echeance) return '<span class="badge">Sans échéance</span>';
  const auj = aujourdHui();
  if (a.echeance < auj) return `<span class="badge neg">${icone('triangle-alert', 'sm')}En retard · ${fmtDateCourt(a.echeance)}</span>`;
  if (a.echeance <= addDays(auj, 2)) return `<span class="badge warn">${icone('clock', 'sm')}${a.echeance === auj ? 'Aujourd\'hui' : fmtDateCourt(a.echeance)}</span>`;
  return `<span class="badge">${icone('calendar', 'sm')}${fmtDateCourt(a.echeance)}</span>`;
}
function libOrigine(a) {
  const o = a.origine || {};
  if (o.type === 'reunion') { const r = (db.reunions || []).find(x => x.id === o.id); return r ? `CR n° ${r.numero}` : 'Réunion'; }
  if (o.type === 'securite') return 'Sécurité';
  return '';
}

/* ================================ Actions ================================ */
function ligneAction(a, opts = {}) {
  const c = db.chantiers.find(x => x.id === a.chantierId);
  const orig = libOrigine(a);
  return `<div class="act-item ${actionOuverte(a) ? '' : 'fait'}">
    <label class="checkbox"><input type="checkbox" ${actionOuverte(a) ? '' : 'checked'} data-change="actFaite" data-id="${esc(a.id)}" aria-label="Action faite"></label>
    <div class="grow" style="min-width:0"><div class="act-lib">${esc(a.libelle)}</div>
      <div class="r-meta">${badgeEcheance(a)}${a.responsable ? `<span>${icone('user', 'sm')}${esc(a.responsable)}</span>` : ''}${orig ? `<span>${icone(ORIGINES_ACTION[(a.origine || {}).type] ? ORIGINES_ACTION[a.origine.type][1] : 'list-todo', 'sm')}${esc(orig)}</span>` : ''}${opts.chantier && c ? `<span class="badge brand">${esc(c.nom)}</span>` : ''}</div></div>
    <div class="row" style="flex-wrap:nowrap"><button class="btn ghost icon sm" data-act="actEdit" data-id="${esc(a.id)}" aria-label="Modifier">${icone('pencil', 'sm')}</button>${opts.sansSuppr ? '' : `<button class="btn ghost icon sm" data-act="actSuppr" data-id="${esc(a.id)}" aria-label="Supprimer">${icone('trash-2', 'sm')}</button>`}</div></div>`;
}

function vActions(c) {
  const toutes = actionsDe(db, c.id);
  const auj = aujourdHui();
  const f = ui.actFiltre || 'ouvertes';
  const ouvertes = toutes.filter(actionOuverte);
  const retard = ouvertes.filter(a => actionEnRetard(a, auj));
  const liste = toutes.filter(a => f === 'toutes' || (f === 'faites' ? !actionOuverte(a) : f === 'retard' ? actionEnRetard(a, auj) : actionOuverte(a)));
  const entete = enTetePage({ eyebrow: 'Coordination', titre: 'Plan d\'actions', sous: [sousInfo('list-todo', `${ouvertes.length} action(s) ouverte(s)`), retard.length ? `<span class="badge neg">${retard.length} en retard</span>` : ''],
    actions: `<button class="btn" data-nav="reunions">${icone('messages-square')}Comptes rendus</button><button class="btn primary" data-act="actNew">${icone('plus')}Nouvelle action</button>` });
  const saisie = `<div class="card"><div class="card-body act-rapide">${datalistResponsables(c.id)}
      <input class="input grow" id="arLib" placeholder="Nouvelle action : relancer le BET pour les détails d'acrotère…" aria-label="Libellé de l'action">
      <input class="input" id="arResp" list="dlResp" placeholder="Responsable" style="max-width:220px" aria-label="Responsable">
      <input class="input" id="arEch" type="date" value="${addDays(auj, 7)}" style="max-width:160px" aria-label="Échéance">
      <button class="btn primary" data-act="actRapide">${icone('plus')}Ajouter</button></div></div>`;
  const seg = `<div class="seg">${[['ouvertes', 'Ouvertes', ouvertes.length], ['retard', 'En retard', retard.length], ['faites', 'Faites', toutes.length - ouvertes.length], ['toutes', 'Toutes', toutes.length]].map(([v, l, n]) => `<button class="${f === v ? 'on' : ''}" data-act="actFiltre" data-f="${v}">${l} <span class="n">${n}</span></button>`).join('')}</div>`;
  const corps = liste.length ? liste.map(a => ligneAction(a)).join('') : vide('list-todo', f === 'retard' ? 'Aucune action en retard' : 'Aucune action', 'Notez ici tout ce qui doit être fait, par qui et pour quand : actions de réunion, relances, points sécurité.');
  return entete + `<div class="stack">${saisie}<div class="card"><div class="card-head">${seg}<span class="hint">triées par échéance</span></div>${corps}</div></div>`;
}

function modalAction(a, defauts = {}) {
  const c = ch();
  const e = a || Object.assign({ echeance: addDays(aujourdHui(), 7), statut: 'ouverte' }, defauts);
  ouvrirModal(a ? 'Modifier l\'action' : 'Nouvelle action', `${datalistResponsables(e.chantierId || c.id)}
    <input type="hidden" id="acId" value="${esc(a ? a.id : '')}">
    ${zoneTexte('acLib', 'Action *', e.libelle, 'rows="2"')}
    <div class="form-grid">${champ('acResp', 'Responsable', e.responsable, 'text', 'list="dlResp"')}${champ('acEch', 'Échéance', e.echeance, 'date')}</div>
    ${a ? selectHTML('acStatut', 'État', [['ouverte', 'Ouverte'], ['faite', 'Faite']], e.statut) : ''}
    ${zoneTexte('acNote', 'Commentaire', e.note, 'rows="2" placeholder="réponse obtenue, document attendu…"')}`,
    `<button class="btn" data-act="fermerModal">Annuler</button><button class="btn primary" data-act="actSave">Enregistrer</button>`, { icone: 'list-todo' });
}

function creerAction(champs) {
  db.actions = db.actions || [];
  const a = Object.assign({ id: uid(), chantierId: ui.chantierId, statut: 'ouverte', creeLe: aujourdHui(), creePar: nomUser(), origine: { type: 'manuel' } }, champs);
  db.actions.push(a);
  return a;
}

/* ================================ Annuaire =============================== */
function vAnnuaire(c) {
  const ks = contactsDe(c.id);
  const autres = db.chantiers.filter(x => x.id !== c.id && contactsDe(x.id).length);
  const entete = enTetePage({ eyebrow: 'Coordination', titre: 'Annuaire du chantier', sous: [sousInfo('contact', `${ks.length} intervenant(s)`)],
    actions: `${autres.length ? `<button class="btn" data-act="annImporter">${icone('copy')}Reprendre d'un chantier</button>` : ''}<button class="btn primary" data-act="contactNew">${icone('plus')}Nouvel intervenant</button>` });
  if (!ks.length) return entete + `<div class="card">${vide('contact', 'Aucun intervenant', 'Maître d\'ouvrage, maître d\'œuvre, bureau de contrôle, CSPS, fournisseurs… Tous les contacts du chantier à portée de main, pour appeler, écrire et convoquer aux réunions.',
    `<button class="btn primary" data-act="contactNew">${icone('plus')}Nouvel intervenant</button>${autres.length ? `<button class="btn" data-act="annImporter">${icone('copy')}Reprendre d'un autre chantier</button>` : ''}`)}</div>`;
  const groupes = ROLES_CONTACT.filter(r => ks.some(k => k.role === r));
  const sansRole = ks.filter(k => !ROLES_CONTACT.includes(k.role));
  const carte = k => `<div class="contact">
      <span class="avatar" style="background:var(--brand-2)">${initiales(k.nom || k.societe)}</span>
      <div class="grow" style="min-width:0"><div class="strong">${esc(k.nom || k.societe)}</div><div class="sub">${esc([k.nom ? k.societe : '', k.fonction].filter(Boolean).join(' · '))}</div>
        <div class="contact-liens">${k.tel ? `<a class="btn sm" href="tel:${esc(k.tel.replace(/\s/g, ''))}">${icone('phone', 'sm')}${esc(k.tel)}</a>` : ''}${k.email ? `<a class="btn sm" href="mailto:${esc(k.email)}">${icone('at-sign', 'sm')}<span class="ellipsis">${esc(k.email)}</span></a>` : ''}</div></div>
      <button class="btn ghost icon sm" data-act="contactEdit" data-id="${esc(k.id)}" aria-label="Modifier">${icone('pencil', 'sm')}</button></div>`;
  return entete + `<div class="stack">${groupes.map(r => `<div class="card"><div class="card-head"><h3>${esc(r)}</h3><span class="hint">${ks.filter(k => k.role === r).length}</span></div>
      <div class="contacts">${ks.filter(k => k.role === r).map(carte).join('')}</div></div>`).join('')}
    ${sansRole.length ? `<div class="card"><div class="card-head"><h3>Autres</h3></div><div class="contacts">${sansRole.map(carte).join('')}</div></div>` : ''}</div>`;
}

function modalContact(k) {
  const e = k || { role: 'Maître d\'œuvre' };
  ouvrirModal(k ? 'Modifier l\'intervenant' : 'Nouvel intervenant', `
    <input type="hidden" id="ctId" value="${esc(k ? k.id : '')}">
    <div class="form-grid">${selectHTML('ctRole', 'Rôle', ROLES_CONTACT, e.role)}${champ('ctSoc', 'Société', e.societe)}
      ${champ('ctNom', 'Nom', e.nom)}${champ('ctFonction', 'Fonction', e.fonction, 'text', 'placeholder="chargé d\'opération, architecte…"')}
      ${champ('ctTel', 'Téléphone', e.tel, 'tel')}${champ('ctMail', 'E-mail', e.email, 'email')}</div>
    ${zoneTexte('ctNotes', 'Notes', e.notes, 'rows="2"')}`,
    `${k ? `<button class="btn danger" data-act="contactSuppr" data-id="${esc(k.id)}" style="margin-right:auto">${icone('trash-2')}Supprimer</button>` : ''}<button class="btn" data-act="fermerModal">Annuler</button><button class="btn primary" data-act="contactSave">Enregistrer</button>`, { icone: 'contact' });
}

/* ========================= Réunions / comptes rendus ====================== */
function vReunions(c) {
  if (ui.reunionId && (db.reunions || []).some(r => r.id === ui.reunionId && r.chantierId === c.id)) return editeurReunion(c, db.reunions.find(r => r.id === ui.reunionId));
  ui.reunionId = null;
  const rs = reunionsDe(c.id);
  const entete = enTetePage({ eyebrow: 'Coordination', titre: 'Réunions et comptes rendus', sous: [sousInfo('messages-square', `${rs.length} compte(s) rendu(s)`)],
    actions: `<button class="btn" data-nav="actions">${icone('list-todo')}Plan d'actions</button><button class="btn primary" data-act="reuNew">${icone('plus')}Nouveau compte rendu</button>` });
  if (!rs.length) return entete + `<div class="card">${vide('messages-square', 'Aucun compte rendu', 'Préparez la réunion de chantier, prenez les notes en séance (participants, points abordés, actions avec responsable et échéance) et diffusez le CR en PDF dans la foulée.',
    `<button class="btn primary" data-act="reuNew">${icone('plus')}Nouveau compte rendu</button>`)}</div>`;
  const prochaine = rs.find(r => r.prochaine && r.prochaine.date >= aujourdHui());
  return entete + `<div class="stack">
    ${prochaine ? `<div class="alert info">${icone('calendar')}<div>Prochaine réunion : <b>${fmtDate(prochaine.prochaine.date, true)}${prochaine.prochaine.heure ? ' à ' + esc(prochaine.prochaine.heure) : ''}</b>${prochaine.lieu ? ' · ' + esc(prochaine.lieu) : ''}</div></div>` : ''}
    <div class="card">${rs.map(r => {
      const acts = (db.actions || []).filter(a => (a.origine || {}).id === r.id);
      const pres = (r.participants || []).filter(p => p.statut === 'present').length;
      return `<div class="res-item reu-item" data-act="reuOuvrir" data-id="${esc(r.id)}">
        <span class="res-num">N° ${esc(r.numero)}</span>
        <div><div class="r-desc">${esc(r.type || 'Réunion')} du ${fmtDate(r.date, true)}</div>
          <div class="r-meta"><span>${icone('users', 'sm')}${pres} présent(s)</span><span>${icone('list-checks', 'sm')}${(r.points || []).length} point(s)</span><span>${icone('list-todo', 'sm')}${acts.length} action(s)${acts.filter(actionOuverte).length ? ` dont ${acts.filter(actionOuverte).length} ouverte(s)` : ''}</span></div></div>
        <div class="row" style="flex-wrap:nowrap">${r.diffuseLe ? `<span class="badge pos">${icone('send', 'sm')}Diffusé le ${fmtDateCourt(r.diffuseLe)}</span>` : '<span class="badge warn">Brouillon</span>'}${icone('chevron-right')}</div></div>`;
    }).join('')}</div></div>`;
}

function editeurReunion(c, r) {
  const auj = aujourdHui();
  const parts = r.participants || [];
  const contactsLibres = contactsDe(c.id).filter(k => !parts.some(p => p.contactId === k.id));
  const actsCR = (db.actions || []).filter(a => (a.origine || {}).id === r.id);
  const actsSuivi = actionsDe(db, c.id).filter(a => (a.origine || {}).id !== r.id && (actionOuverte(a) || (a.faiteLe && a.faiteLe >= addDays(r.date, -14))));
  const entete = enTetePage({ eyebrow: `Compte rendu n° ${r.numero}`, titre: `${r.type || 'Réunion'} du ${fmtDate(r.date)}`,
    sous: [r.diffuseLe ? `<span class="badge pos">${icone('send', 'sm')}Diffusé le ${fmtDate(r.diffuseLe)}</span>` : '<span class="badge warn">Brouillon</span>', sousInfo('user', r.redacteur)],
    actions: `<button class="btn" data-act="reuFermer">${icone('chevron-left')}Retour</button>
      <button class="btn ghost icon" data-act="reuSuppr" data-id="${esc(r.id)}" aria-label="Supprimer">${icone('trash-2')}</button>
      <button class="btn" data-act="reuPDF" data-id="${esc(r.id)}">${icone('file-text')}PDF</button>
      <button class="btn primary" data-act="reuDiffuser" data-id="${esc(r.id)}">${icone('send')}Diffuser</button>` });
  const infos = `<div class="card"><div class="card-body"><div class="form-grid reu-infos">
      ${selectHTML('reType', 'Type de réunion', TYPES_REUNION, r.type, `data-change="reuChamp" data-f="type"`)}
      ${champ('reDate', 'Date', r.date, 'date', `data-change="reuChamp" data-f="date"`)}
      ${champ('reHeure', 'Heure', r.heure, 'time', `data-change="reuChamp" data-f="heure"`)}
      ${champ('reLieu', 'Lieu', r.lieu, 'text', `data-change="reuChamp" data-f="lieu" placeholder="base vie, bureau MOE…"`)}</div></div></div>`;
  const participants = `<div class="card"><div class="card-head"><h3>Participants</h3><span class="hint">${parts.filter(p => p.statut === 'present').length} présent(s)</span></div>
    ${parts.length ? `<div class="table-wrap"><table class="table"><thead><tr><th>Société</th><th>Nom</th><th>Rôle</th><th>Présence</th><th></th></tr></thead><tbody>
      ${parts.map((p, i) => `<tr><td class="strong">${esc(p.societe || '—')}</td><td>${esc(p.nom || '')}</td><td class="muted small">${esc(p.role || '')}</td>
        <td><select class="input" style="height:32px;width:130px" data-change="reuPresence" data-i="${i}" aria-label="Présence">${STATUTS_PARTICIPANT.map(([v, l]) => `<option value="${v}" ${p.statut === v ? 'selected' : ''}>${l}</option>`).join('')}</select></td>
        <td class="num"><button class="btn ghost icon sm" data-act="reuRetirerPart" data-i="${i}" aria-label="Retirer">${icone('x', 'sm')}</button></td></tr>`).join('')}</tbody></table></div>` : '<div class="card-body muted">Ajoutez les participants depuis l\'annuaire.</div>'}
    <div class="card-foot row" style="gap:8px">
      ${contactsLibres.length ? `<select class="input" id="reAjoutPart" style="width:auto;max-width:320px;height:34px" aria-label="Intervenant à ajouter">${contactsLibres.map(k => `<option value="${esc(k.id)}">${esc(libContact(k))}</option>`).join('')}</select><button class="btn sm" data-act="reuAjoutPart">${icone('plus', 'sm')}Ajouter</button>` : ''}
      ${contactsLibres.length > 1 ? `<button class="btn sm" data-act="reuAjoutTous">${icone('users', 'sm')}Tout l'annuaire</button>` : ''}
      <button class="btn ghost sm" data-act="contactNew" data-pour="reunion">${icone('plus', 'sm')}Nouvel intervenant</button></div></div>`;
  const points = `<div class="card"><div class="card-head"><h3>Points abordés</h3><button class="btn sm" data-act="reuAjoutPoint">${icone('plus', 'sm')}Ajouter un point</button></div>
    ${(r.points || []).length ? (r.points || []).map((p, i) => `<div class="reu-point">
      <div class="row" style="flex-wrap:nowrap;gap:8px"><span class="res-num">${i + 1}</span>
        <input class="input strong" value="${esc(p.titre)}" placeholder="Sujet (avancement, sécurité, planning, interfaces…)" data-change="reuPoint" data-i="${i}" data-f="titre" aria-label="Sujet du point ${i + 1}">
        <button class="btn ghost icon sm" data-act="reuRetirerPoint" data-i="${i}" aria-label="Retirer le point">${icone('x', 'sm')}</button></div>
      <textarea class="input" rows="3" placeholder="Constats, décisions, informations…" data-change="reuPoint" data-i="${i}" data-f="texte" aria-label="Contenu du point ${i + 1}">${esc(p.texte || '')}</textarea></div>`).join('')
      : '<div class="card-body muted">Aucun point pour l\'instant.</div>'}</div>`;
  const actions = `<div class="card"><div class="card-head"><h3>Actions décidées</h3><span class="hint">${actsCR.length} action(s)</span></div>
    ${actsCR.map(a => ligneAction(a)).join('')}
    <div class="card-body act-rapide">${datalistResponsables(c.id)}
      <input class="input grow" id="raLib" placeholder="Action décidée en réunion…" aria-label="Libellé de l'action">
      <input class="input" id="raResp" list="dlResp" placeholder="Qui ?" style="max-width:220px" aria-label="Responsable">
      <input class="input" id="raEch" type="date" value="${r.prochaine && r.prochaine.date ? r.prochaine.date : addDays(r.date || auj, 7)}" style="max-width:160px" aria-label="Échéance">
      <button class="btn primary" data-act="reuAjoutAction" data-id="${esc(r.id)}">${icone('plus')}Ajouter</button></div></div>`;
  const suivi = actsSuivi.length ? `<div class="card"><div class="card-head"><h3>Suivi des actions en cours</h3><span class="hint">reprises dans le CR · cochez celles qui sont soldées</span></div>${actsSuivi.map(a => ligneAction(a, { sansSuppr: true })).join('')}</div>` : '';
  const prochaine = `<div class="card"><div class="card-head"><h3>Prochaine réunion</h3></div><div class="card-body"><div class="form-grid">
      ${champ('reProDate', 'Date', (r.prochaine || {}).date, 'date', `data-change="reuProchaine" data-f="date"`)}
      ${champ('reProHeure', 'Heure', (r.prochaine || {}).heure, 'time', `data-change="reuProchaine" data-f="heure"`)}</div>
      ${zoneTexte('reObs', 'Observations générales / diffusion', r.observations, 'rows="2" data-change="reuChamp" data-f="observations"')}</div></div>`;
  return entete + `<div class="stack">${infos}${participants}${points}${actions}${suivi}${prochaine}</div>`;
}

function nouvelleReunion() {
  const c = ch();
  const prec = reunionsDe(c.id)[0];
  const parts = prec ? (prec.participants || []).map(p => Object.assign({}, p, { statut: p.statut === 'diffusion' ? 'diffusion' : 'present' }))
    : contactsDe(c.id).filter(k => ['Maître d\'ouvrage', 'Maître d\'œuvre', 'Entreprise générale', 'OPC', 'CSPS'].includes(k.role)).map(k => ({ contactId: k.id, nom: k.nom, societe: k.societe, role: k.role, email: k.email, statut: 'present' }));
  if (!parts.some(p => p.nom === nomUser()) && nomUser()) parts.unshift({ nom: nomUser(), societe: entreprise().nom || 'Entreprise', role: (user && user.role) || 'Conducteur de travaux', statut: 'present' });
  const points = prec && (prec.points || []).length ? prec.points.map(p => ({ id: uid(), titre: p.titre, texte: '' }))
    : ['Effectifs et avancement', 'Planning', 'Sécurité', 'Qualité et réserves', 'Approvisionnements', 'Interfaces avec les autres corps d\'état', 'Divers'].map(t => ({ id: uid(), titre: t, texte: '' }));
  const auj = aujourdHui();
  const r = { id: uid(), chantierId: c.id, numero: (prec ? num(prec.numero) : 0) + 1, type: prec ? prec.type : 'Réunion de chantier', date: auj, heure: prec ? prec.heure || '' : '', lieu: prec ? prec.lieu || '' : '',
    participants: parts, points, prochaine: { date: addDays(auj, 7), heure: prec ? prec.heure || '' : '' }, redacteur: nomUser(), observations: '' };
  // Points d'avancement pré-remplis à partir des données du chantier
  const s = calcSuivi(db, c.id);
  if (s.rows.length) {
    const av = r.points.find(p => /avancement/i.test(p.titre));
    if (av) av.texte = `Avancement global : ${pc(s.tot.pct)}. ` + s.rows.filter(x => x.pct > 0 && x.pct < 1).map(x => `${x.phase} : ${pc(x.pct)}`).join(' ; ') + (s.rows.some(x => x.pct > 0 && x.pct < 1) ? '.' : '');
  }
  const pl = calcPlanning(db, c.id);
  const ptPlanning = r.points.find(p => /planning/i.test(p.titre));
  if (ptPlanning && pl.finProjetee) ptPlanning.texte = pl.retard ? `Fin projetée au ${fmtDate(pl.finProjetee)}, soit ${pl.retard} jour(s) ouvré(s) de retard sur la fin contractuelle du ${fmtDate(pl.finContrat)}.` : `Planning tenu : fin prévue le ${fmtDate(pl.finProjetee)}.`;
  const resOuv = deCh(db.reserves).filter(x => x.statut !== 'levée');
  const ptQual = r.points.find(p => /qualit|réserve/i.test(p.titre));
  if (ptQual && resOuv.length) ptQual.texte = `${resOuv.length} réserve(s) ouverte(s) : ` + resOuv.slice(0, 5).map(x => `${numeroReserve(x)} ${x.description}`).join(' ; ') + '.';
  db.reunions = db.reunions || [];
  db.reunions.push(r);
  return r;
}

/* --------------------------------- PDF ----------------------------------- */
function compteRenduPDF(reuId, sortie) {
  const c = ch();
  const r = (db.reunions || []).find(x => x.id === reuId);
  if (!r) return null;
  if (!globalThis.jspdf) { toast('Bibliothèque PDF non chargée.', 'erreur'); return null; }
  const { jsPDF } = globalThis.jspdf;
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  let y = enTeteDocument(doc, `COMPTE RENDU N° ${r.numero}`, `${r.type || 'Réunion'} du ${fmtDate(r.date)}`,
    [r.heure ? `à ${r.heure}` : '', r.lieu ? `Lieu : ${r.lieu}` : '', r.redacteur ? `Rédacteur : ${r.redacteur}` : ''].filter(Boolean));
  const h1 = cadre(doc, 14, y, 88, 'Chantier', [c.nom, c.adresse || '', c.client ? `Maître d'ouvrage : ${c.client}` : ''].filter(Boolean));
  const pro = r.prochaine && r.prochaine.date ? [`${fmtDate(r.prochaine.date, true)}`, r.prochaine.heure ? `à ${r.prochaine.heure}` : '', r.lieu ? r.lieu : ''].filter(Boolean) : ['À définir'];
  const h2 = cadre(doc, 108, y, 88, 'Prochaine réunion', pro);
  y += Math.max(h1, h2) + 7;
  const code = st => (STATUTS_PARTICIPANT.find(s => s[0] === st) || [])[2] || '';
  doc.autoTable(Object.assign({}, STYLE_TABLE, {
    startY: y,
    head: [['Société', 'Nom', 'Rôle', 'P', 'E', 'A', 'D'].map(pdfTxt)],
    body: (r.participants || []).map(p => [p.societe || '', p.nom || '', p.role || '', ...['P', 'E', 'A', 'D'].map(k => code(p.statut) === k ? 'X' : '')].map(pdfTxt)),
    columnStyles: { 3: { halign: 'center', cellWidth: 9 }, 4: { halign: 'center', cellWidth: 9 }, 5: { halign: 'center', cellWidth: 9 }, 6: { halign: 'center', cellWidth: 9 } }
  }));
  y = doc.lastAutoTable.finalY + 3;
  doc.setFontSize(7); doc.setTextColor(102, 112, 133); doc.text(pdfTxt('P présent · E excusé · A absent · D diffusion'), 14, y + 2);
  y += 9;
  const titre = (t) => { if (y > 262) { doc.addPage(); y = 20; } doc.setFont('helvetica', 'bold'); doc.setFontSize(10.5); doc.setTextColor(14, 35, 64); doc.text(pdfTxt(t), 14, y); y += 2; doc.setDrawColor(232, 89, 12); doc.setLineWidth(0.5); doc.line(14, y, 30, y); doc.setLineWidth(0.2); y += 5; };
  titre('Points abordés');
  (r.points || []).filter(p => p.titre || p.texte).forEach((p, i) => {
    if (y > 268) { doc.addPage(); y = 20; }
    doc.setFont('helvetica', 'bold'); doc.setFontSize(9.5); doc.setTextColor(16, 24, 40);
    doc.text(pdfTxt(`${i + 1}. ${p.titre || ''}`), 14, y); y += 5;
    doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(52, 64, 84);
    const lignes = doc.splitTextToSize(pdfTxt(p.texte || 'RAS'), 178);
    lignes.forEach(l => { if (y > 280) { doc.addPage(); y = 20; } doc.text(l, 18, y); y += 4.4; });
    y += 3;
  });
  const actsCR = (db.actions || []).filter(a => (a.origine || {}).id === r.id);
  const actsSuivi = actionsDe(db, c.id).filter(a => (a.origine || {}).id !== r.id && (actionOuverte(a) || (a.faiteLe && a.faiteLe >= addDays(r.date, -14))));
  const toutes = actsSuivi.concat(actsCR);
  if (toutes.length) {
    y += 2; titre('Actions');
    doc.autoTable(Object.assign({}, STYLE_TABLE, {
      startY: y,
      head: [['Action', 'Origine', 'Responsable', 'Échéance', 'État'].map(pdfTxt)],
      body: toutes.map(a => [a.libelle, (a.origine || {}).id === r.id ? 'Ce CR' : (libOrigine(a) || '-'), a.responsable || '-', a.echeance ? fmtDate(a.echeance) : '-',
        actionOuverte(a) ? (actionEnRetard(a, r.date) ? 'En retard' : 'En cours') : 'Soldée'].map(pdfTxt)),
      columnStyles: { 0: { cellWidth: 78 }, 3: { cellWidth: 22 }, 4: { cellWidth: 20 } },
      didParseCell: d => { if (d.section === 'body' && d.column.index === 4) { if (d.cell.raw === 'En retard') d.cell.styles.textColor = [180, 35, 24]; if (d.cell.raw === 'Soldée') d.cell.styles.textColor = [6, 118, 71]; } }
    }));
    y = doc.lastAutoTable.finalY + 8;
  }
  if (r.observations) {
    if (y > 260) { doc.addPage(); y = 20; }
    titre('Observations');
    doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(52, 64, 84);
    const l = doc.splitTextToSize(pdfTxt(r.observations), 178); doc.text(l, 14, y); y += l.length * 4.4 + 6;
  }
  if (y > 270) { doc.addPage(); y = 20; }
  doc.setFont('helvetica', 'italic'); doc.setFontSize(8); doc.setTextColor(102, 112, 133);
  doc.text(doc.splitTextToSize(pdfTxt('Toute observation sur le présent compte rendu doit être formulée par écrit dans un délai de 8 jours ; passé ce délai, il est réputé accepté par l\'ensemble des participants.'), 182), 14, y + 2);
  piedDocument(doc, `${entreprise().nom || 'OmSmK'}  ·  ${c.nom}  ·  CR n° ${r.numero} du ${fmtDate(r.date)}`);
  const nom = `CR_${String(r.numero).padStart(2, '0')}_${r.date}_${c.nom.replace(/[^\w-]+/g, '_')}.pdf`;
  if (sortie === 'blob') return { blob: doc.output('blob'), nom };
  doc.save(nom);
  toast(`Compte rendu n° ${r.numero} généré`, 'succes');
  return null;
}

async function diffuserCR(reuId) {
  const c = ch();
  const r = (db.reunions || []).find(x => x.id === reuId);
  const res = compteRenduPDF(reuId, 'blob');
  if (!r || !res) return;
  const destinataires = (r.participants || []).filter(p => p.statut !== 'absent' || p.email).map(p => p.email || ((db.contacts || []).find(k => k.id === p.contactId) || {}).email).filter(Boolean);
  const objet = `${c.nom} — Compte rendu n° ${r.numero} du ${fmtDate(r.date)}`;
  const texte = `Bonjour,\n\nVeuillez trouver ci-joint le compte rendu n° ${r.numero} de la ${(r.type || 'réunion').toLowerCase()} du ${fmtDate(r.date)}.` +
    (r.prochaine && r.prochaine.date ? `\nProchaine réunion : ${fmtDate(r.prochaine.date, true)}${r.prochaine.heure ? ' à ' + r.prochaine.heure : ''}.` : '') + `\n\nCordialement,\n${nomUser()}`;
  const fichier = new File([res.blob], res.nom, { type: 'application/pdf' });
  r.diffuseLe = aujourdHui();
  save(); render();
  if (navigator.canShare && navigator.canShare({ files: [fichier] })) {
    try { await navigator.share({ files: [fichier], title: objet, text: texte }); toast('Compte rendu partagé', 'succes'); return; }
    catch (e) { if (e && e.name === 'AbortError') return; }
  }
  telecharger(res.nom, res.blob);
  if (destinataires.length) location.href = `mailto:${destinataires.join(',')}?subject=${encodeURIComponent(objet)}&body=${encodeURIComponent(texte + '\n\n(PDF téléchargé à joindre au message)')}`;
  toast(destinataires.length ? 'PDF téléchargé : joignez-le au message ouvert' : 'PDF téléchargé (aucune adresse e-mail dans les participants)', 'succes');
}

/* -------------------------------- Actions -------------------------------- */
const reunionCourante = () => (db.reunions || []).find(r => r.id === ui.reunionId);
Object.assign(ACT, {
  actNew: () => modalAction(null),
  actEdit: el => modalAction((db.actions || []).find(a => a.id === el.dataset.id)),
  actSave: () => {
    const libelle = val('acLib');
    if (!libelle) return toast('Décrivez l\'action.', 'alerte');
    const id = val('acId');
    const champs = { libelle, responsable: val('acResp'), echeance: val('acEch'), note: val('acNote') };
    if (id) {
      const a = db.actions.find(x => x.id === id);
      const statut = val('acStatut') || a.statut;
      Object.assign(a, champs, { statut, faiteLe: statut === 'faite' ? (a.faiteLe || aujourdHui()) : '' });
    } else creerAction(champs);
    save(); fermerModal(); render(); toast('Action enregistrée', 'succes');
  },
  actSuppr: async el => {
    if (!await confirmer('Supprimer l\'action', 'Cette action sera supprimée.', { ok: 'Supprimer', danger: true })) return;
    db.actions = db.actions.filter(a => a.id !== el.dataset.id); save(); render();
  },
  actFiltre: el => { ui.actFiltre = el.dataset.f; render(); },
  actRapide: () => {
    const libelle = val('arLib');
    if (!libelle) return $('#arLib').focus();
    creerAction({ libelle, responsable: val('arResp'), echeance: val('arEch') });
    save(); render(); toast('Action ajoutée', 'succes'); setTimeout(() => { const i = $('#arLib'); if (i) i.focus(); }, 30);
  },
  contactNew: el => { ui._contactPourReunion = el.dataset.pour === 'reunion'; modalContact(null); },
  contactEdit: el => modalContact((db.contacts || []).find(k => k.id === el.dataset.id)),
  contactSave: () => {
    const nom = val('ctNom'), societe = val('ctSoc');
    if (!nom && !societe) return toast('Indiquez au moins un nom ou une société.', 'alerte');
    db.contacts = db.contacts || [];
    const id = val('ctId');
    const champs = { role: val('ctRole'), societe, nom, fonction: val('ctFonction'), tel: val('ctTel'), email: val('ctMail'), notes: val('ctNotes') };
    let k;
    if (id) { k = db.contacts.find(x => x.id === id); Object.assign(k, champs); }
    else { k = Object.assign({ id: uid(), chantierId: ui.chantierId }, champs); db.contacts.push(k); }
    const r = reunionCourante();
    if (!id && ui._contactPourReunion && r) { r.participants = r.participants || []; r.participants.push({ contactId: k.id, nom: k.nom, societe: k.societe, role: k.role, email: k.email, statut: 'present' }); }
    ui._contactPourReunion = false;
    save(); fermerModal(); render(); toast('Intervenant enregistré', 'succes');
  },
  contactSuppr: async el => {
    if (!await confirmer('Supprimer l\'intervenant', 'Ce contact sera retiré de l\'annuaire du chantier.', { ok: 'Supprimer', danger: true })) return;
    db.contacts = db.contacts.filter(k => k.id !== el.dataset.id); save(); render();
  },
  annImporter: () => {
    const autres = db.chantiers.filter(x => x.id !== ui.chantierId && contactsDe(x.id).length);
    ouvrirModal('Reprendre un annuaire', selectHTML('anSrc', 'Chantier source', autres.map(x => [x.id, `${x.nom} (${contactsDe(x.id).length})`]), autres[0].id) +
      `<p class="small muted">Les intervenants déjà présents (même société et même nom) ne sont pas dupliqués.</p>`,
      `<button class="btn" data-act="fermerModal">Annuler</button><button class="btn primary" data-act="annImporterOk">${icone('copy')}Reprendre</button>`, { icone: 'contact', taille: 'narrow' });
  },
  annImporterOk: () => {
    const cle = k => norm((k.societe || '') + '|' + (k.nom || ''));
    const deja = new Set(contactsDe(ui.chantierId).map(cle));
    const nv = contactsDe(val('anSrc')).filter(k => !deja.has(cle(k))).map(k => Object.assign({}, k, { id: uid(), chantierId: ui.chantierId, _m: undefined }));
    nv.forEach(k => delete k._m);
    db.contacts.push(...nv); save(); fermerModal(); render(); toast(`${nv.length} intervenant(s) ajouté(s)`, 'succes');
  },
  reuNew: () => { const r = nouvelleReunion(); ui.reunionId = r.id; save(); render(); scrollTo(0, 0); },
  reuOuvrir: el => { ui.reunionId = el.dataset.id; render(); scrollTo(0, 0); },
  reuFermer: () => { ui.reunionId = null; render(); },
  reuSuppr: async el => {
    const r = (db.reunions || []).find(x => x.id === el.dataset.id);
    const n = (db.actions || []).filter(a => (a.origine || {}).id === r.id).length;
    if (!await confirmer(`Supprimer le CR n° ${r.numero}`, `Le compte rendu sera supprimé${n ? ` ; ses ${n} action(s) restent dans le plan d'actions` : ''}.`, { ok: 'Supprimer', danger: true })) return;
    db.reunions = db.reunions.filter(x => x !== r); ui.reunionId = null; save(); render();
  },
  reuAjoutPart: () => {
    const r = reunionCourante(), k = (db.contacts || []).find(x => x.id === val('reAjoutPart'));
    if (!r || !k) return;
    r.participants = r.participants || [];
    r.participants.push({ contactId: k.id, nom: k.nom, societe: k.societe, role: k.role, email: k.email, statut: 'present' });
    save(); render();
  },
  reuAjoutTous: () => {
    const r = reunionCourante();
    contactsDe(r.chantierId).filter(k => !(r.participants || []).some(p => p.contactId === k.id))
      .forEach(k => r.participants.push({ contactId: k.id, nom: k.nom, societe: k.societe, role: k.role, email: k.email, statut: 'diffusion' }));
    save(); render();
  },
  reuRetirerPart: el => { const r = reunionCourante(); r.participants.splice(num(el.dataset.i), 1); save(); render(); },
  reuAjoutPoint: () => { const r = reunionCourante(); r.points = r.points || []; r.points.push({ id: uid(), titre: '', texte: '' }); save(); render(); setTimeout(() => { const l = $$('.reu-point input'); if (l.length) l[l.length - 1].focus(); }, 30); },
  reuRetirerPoint: el => { const r = reunionCourante(); r.points.splice(num(el.dataset.i), 1); save(); render(); },
  reuAjoutAction: el => {
    const libelle = val('raLib');
    if (!libelle) return $('#raLib').focus();
    creerAction({ libelle, responsable: val('raResp'), echeance: val('raEch'), origine: { type: 'reunion', id: el.dataset.id } });
    save(); render(); setTimeout(() => { const i = $('#raLib'); if (i) i.focus(); }, 30);
  },
  reuPDF: el => compteRenduPDF(el.dataset.id),
  reuDiffuser: el => diffuserCR(el.dataset.id)
});

Object.assign(CHG, {
  actFaite: el => {
    const a = (db.actions || []).find(x => x.id === el.dataset.id);
    if (!a) return;
    a.statut = el.checked ? 'faite' : 'ouverte'; a.faiteLe = el.checked ? aujourdHui() : ''; a.faitePar = el.checked ? nomUser() : '';
    save(); render(); if (el.checked) toast('Action soldée', 'succes');
  },
  reuChamp: el => { const r = reunionCourante(); if (r) { r[el.dataset.f] = el.value; save(); if (['date', 'type'].includes(el.dataset.f)) render(); } },
  reuProchaine: el => { const r = reunionCourante(); if (r) { r.prochaine = r.prochaine || {}; r.prochaine[el.dataset.f] = el.value; save(); } },
  reuPresence: el => { const r = reunionCourante(); if (r) { r.participants[num(el.dataset.i)].statut = el.value; save(); render(); } },
  reuPoint: el => { const r = reunionCourante(); if (r) { r.points[num(el.dataset.i)][el.dataset.f] = el.value; save(); } }
});
