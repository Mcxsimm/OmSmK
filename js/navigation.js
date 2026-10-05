/* ==========================================================================
   OmSmK — navigation : pages d'accueil des espaces (tuiles interactives),
   menu général, création rapide et recherche (Ctrl+K).
   ========================================================================== */
// deno-lint-ignore-file no-unused-vars
'use strict';

/* --------------------------------- Tuiles -------------------------------- */
// { v, ic, titre, val, sous, etat: 'alerte' | 'ok' | '', action: { act | nav, lib, ic, data } }
function tuile(t) {
  const a = t.action;
  const attrs = a ? (a.act ? `data-act="${a.act}"` : `data-nav="${a.nav}"`) + Object.entries(a.data || {}).map(([k, v]) => ` data-${k}="${esc(v)}"`).join('') : '';
  return `<div class="tuile ${t.etat || ''}" ${t.act ? `data-act="${t.act}"` : `data-nav="${t.v}"`} role="link" tabindex="0" aria-label="${esc(t.titre)}">
    <div class="t-haut"><span class="t-ico">${icone(t.ic)}</span>${t.badge ? `<span class="badge ${t.etat === 'alerte' ? 'neg' : t.etat === 'ok' ? 'pos' : ''}">${t.badge}</span>` : ''}<span class="t-fleche">${icone('arrow-right', 'sm')}</span></div>
    <div class="t-titre">${esc(t.titre)}</div>
    <div class="t-val">${t.val}</div>
    <div class="t-sous">${t.sous || ''}</div>
    ${a ? `<button class="btn sm t-action" ${attrs}>${icone(a.ic || 'plus', 'sm')}${esc(a.lib)}</button>` : ''}
  </div>`;
}
const grilleTuiles = ts => `<div class="tuiles">${ts.map(tuile).join('')}</div>`;

function enTeteEspace(c, eyebrow) {
  const st = statutChantier(c);
  return enTetePage({ eyebrow, titre: c.nom, sous: [`<span class="badge ${st.cls} dot">${st.txt}</span>`, sousInfo('building-2', c.client), c.dateDebut ? sousInfo('calendar', `${fmtDate(c.dateDebut)} → ${fmtDate(c.dateFin) || '…'}`) : ''] });
}

// Trois points d'attention au plus, avec un lien vers le détail
function attentionCourte(liste, lienVue, lienLib) {
  if (!liste.length) return `<div class="calme">${icone('circle-check')}<span>Rien à signaler pour l'instant.</span></div>`;
  return `<div class="card"><ul class="attention-list">${liste.slice(0, 3).map(a => `<li><span class="sev ${a.sev}">${icone(a.ic, 'sm')}</span><div class="grow"><div class="strong">${a.t}</div><div class="small muted">${a.d}</div></div>
    ${a.go ? `<button class="btn ghost sm" ${a.date ? `data-act="ptAller" data-d="${a.date}"` : `data-nav="${a.go}"`} aria-label="Ouvrir">${icone('chevron-right', 'sm')}</button>` : ''}</li>`).join('')}</ul>
    ${liste.length > 3 || lienVue ? `<div class="card-foot row"><span class="small muted">${liste.length > 3 ? `${liste.length - 3} autre(s) point(s)` : ''}</span><span class="grow"></span>${lienVue ? `<button class="btn ghost sm" data-nav="${lienVue}">${esc(lienLib)} ${icone('chevron-right', 'sm')}</button>` : ''}</div>` : ''}</div>`;
}
const triSev = l => l.sort((a, b) => ({ critical: 0, serious: 1, warning: 2 }[a.sev] ?? 9) - ({ critical: 0, serious: 1, warning: 2 }[b.sev] ?? 9));

/* ------------------------------ Espace Chantier --------------------------- */
function vHubChantier(c) {
  const s = calcSuivi(db, c.id), pl = calcPlanning(db, c.id), theo = avancementTheorique(c);
  const sem = lundi(aujourdHui());
  const semSaisie = deCh(db.suivi).some(x => x.semaine === sem && x.pct !== null && x.pct !== undefined);
  const nbOps = deCh(db.ops).length;
  const resume = s.rows.length ? `<div class="resume">
      <div><span>Avancement</span><b>${pc(s.tot.pct)}</b>${barre(s.tot.pct, 'lg')}<small>${theo !== null ? `${pc(theo)} du délai écoulé` : `${fmt(s.tot.gagnees)} h produites`}</small></div>
      <div><span>Projection main d'œuvre</span><b class="${cls(s.tot.impactProj)}">${s.tot.heures ? signeE(s.tot.impactProj) : '—'}</b><small>${s.tot.heures ? `${signe(s.tot.ecartProj)} h en fin de chantier` : 'aucune heure pointée'}</small></div>
      <div><span>Délai</span><b class="${pl.retard ? 'neg' : ''}">${pl.finProjetee ? (pl.retard ? `+${pl.retard} j` : 'Tenu') : '—'}</b><small>${pl.finProjetee ? `fin projetée le ${fmtDate(pl.finProjetee)}` : 'planning à établir'}</small></div>
    </div>` : '';
  const tuiles = [
    { v: 'tableau', ic: 'gauge', titre: 'Indicateurs', val: s.tot.heures ? `${signe(s.tot.ecartH)} h` : '—', sous: s.rows.length ? `écart à date · ${fmt(s.tot.heures, 0)} h pointées sur ${fmt(s.tot.budget, 0)} h` : 'BTE à construire', etat: s.tot.ecartH < -0.5 ? 'alerte' : '' },
    { v: 'planning', ic: 'chart-gantt', titre: 'Planning', val: pl.finProjetee ? fmtDate(pl.finProjetee) : 'À établir', sous: pl.finProjetee ? (pl.retard ? `${pl.retard} jour(s) de retard sur le contrat` : 'fin projetée, dans les délais') : `${pl.rows.length} phase(s) à planifier`,
      etat: pl.retard ? 'alerte' : '', badge: pl.rows.filter(r => r.statut === 'retard').length ? `${pl.rows.filter(r => r.statut === 'retard').length} en retard` : '', action: pl.finProjetee ? null : (pl.rows.length ? { act: 'planGenerer', lib: 'Générer', ic: 'sparkles' } : null) },
    { v: 'suivi', ic: 'trending-up', titre: 'Suivi hebdo', val: `Semaine ${semISO(sem)}`, sous: semSaisie ? 'avancement de la semaine saisi' : 'avancement de la semaine à saisir', etat: semSaisie || !s.rows.length ? '' : 'alerte', badge: semSaisie ? 'à jour' : '', action: semSaisie ? null : { nav: 'suivi', lib: 'Saisir les %', ic: 'pencil' } },
    (() => { const e = etatPreparation(db, c.id, REF.preparation); return { v: 'preparation', ic: 'list-checks', titre: 'Préparation', val: pc(e.pct), sous: e.retard.length ? `${e.retard.length} étape(s) en retard` : `${e.faits} / ${e.total} étapes réalisées`, etat: e.retard.length ? 'alerte' : '' }; })(),
    { v: 'bilan', ic: 'flag', titre: 'Bilan', val: c.clotureLe ? 'Clôturé' : `${Object.keys((c.bilan || {}).cloture || {}).length} / ${REF.cloture.length}`, sous: c.clotureLe ? `le ${fmtDate(c.clotureLe)}` : 'étapes de clôture · écarts, cadences, retour d\'expérience' },
    { v: 'bte', ic: 'calculator', titre: 'Budget BTE', val: `${fmt(s.tot.budget, 0)} h`, sous: nbOps ? `${nbOps} opération(s) · ${s.rows.length} phase(s)` : 'aucune opération', action: nbOps ? null : { act: 'importFichier', lib: 'Importer un BTE', ic: 'upload' } }
  ];
  const al = triSev(alertes(c, s).concat(etatSecurite(c).alertes));
  return enTeteEspace(c, 'Chantier') + `<div class="stack">${resume}${grilleTuiles(tuiles)}
    <div><div class="section-titre">Points d'attention</div>${attentionCourte(al, 'tableau', 'Tous les indicateurs')}</div>
    <div class="row liens-discrets"><button class="btn ghost sm" data-act="chantierEdit" data-id="${esc(c.id)}">${icone('pencil', 'sm')}Fiche chantier</button><button class="btn ghost sm" data-act="rapportPDF">${icone('file-text', 'sm')}Rapport PDF</button><button class="btn ghost sm" data-act="exportExcel">${icone('file-spreadsheet', 'sm')}Export Excel</button></div></div>`;
}

/* ------------------------------ Espace Terrain ---------------------------- */
function vHubTerrain(c) {
  const auj = aujourdHui();
  const equipe = compagnonsDe(c.id);
  const ptJour = pointagesDe(db, c.id, auj, auj);
  const nonPointes = equipe.filter(k => !ptJour.some(p => p.compagnonId === k.id)).length;
  const t = statsTerrain(db, c.id);
  const js = deCh(db.journal).sort((a, b) => b.date.localeCompare(a.date));
  const phs = photosDe(c.id);
  const res = deCh(db.reserves).filter(r => r.statut !== 'levée');
  const resRetard = res.filter(r => r.echeance && r.echeance < auj);
  const e = etatSecurite(c);
  const tuiles = [
    { v: 'pointage', ic: 'clock', titre: 'Pointage', val: equipe.length ? `${ptJour.filter(p => p.statut === 'present').length} / ${equipe.length}` : '—', sous: equipe.length ? (nonPointes ? `${nonPointes} compagnon(s) à pointer aujourd'hui` : `tout le monde est pointé · ${fmt(synthesePointage(db, c.id, auj, auj).tot.heures)} h`) : 'équipe à constituer',
      etat: equipe.length && nonPointes ? 'alerte' : '', action: { nav: 'pointage', lib: equipe.length ? 'Pointer' : 'Constituer l\'équipe', ic: equipe.length ? 'check' : 'users' } },
    { v: 'journal', ic: 'camera', titre: 'Journal & photos', val: js[0] ? depuis(js[0].date).replace(/^./, x => x.toUpperCase()) : 'Aucune entrée', sous: `${js.length} entrée(s) · ${phs.length} photo(s)`, action: { act: 'photoGalerie', lib: 'Prendre une photo', ic: 'camera' } },
    { v: 'terrain', ic: 'clipboard-check', titre: 'Saisie terrain', val: t.total ? pc(t.pct) : '—', sous: t.total ? `${t.faites} / ${t.total} tâches réalisées` : 'zones et tâches à générer', action: { act: 'scanQR', lib: 'Scanner un QR', ic: 'scan-line' } },
    { v: 'qualite', ic: 'shield-check', titre: 'Qualité & réserves', val: `${res.length} ouverte(s)`, sous: resRetard.length ? `${resRetard.length} réserve(s) en retard` : 'aucune réserve en retard', etat: resRetard.length ? 'alerte' : '', action: { act: 'resNewDepuisHub', lib: 'Nouvelle réserve', ic: 'plus' } },
    { v: 'securite', ic: 'shield-alert', titre: 'Sécurité', val: e.joursSans === null ? '—' : `${e.joursSans} j`, sous: e.surv.length ? `${e.surv.length} permis de feu à surveiller` : 'sans accident avec arrêt', etat: e.alertes.some(a => a.sev === 'critical' || a.sev === 'serious') ? 'alerte' : '', badge: e.alertes.length ? `${e.alertes.length} à traiter` : '',
      action: { act: 'secuNewDepuisHub', lib: 'Quart d\'heure', ic: 'messages-square', data: { t: 'causerie' } } }
  ];
  return enTeteEspace(c, 'Terrain') + `<div class="stack">${grilleTuiles(tuiles)}
    <div><div class="section-titre">Aujourd'hui sur le terrain</div>${attentionCourte(triSev(e.alertes.concat(alertes(c, calcSuivi(db, c.id)).filter(a => ['pointage', 'qualite', 'terrain'].includes(a.go)))), null, '')}</div></div>`;
}

/* ---------------------------- Espace Coordination ------------------------- */
function vHubCoordination(c) {
  const auj = aujourdHui();
  const acts = actionsDe(db, c.id), ouvertes = acts.filter(actionOuverte), retard = ouvertes.filter(a => actionEnRetard(a, auj));
  const rs = reunionsDe(c.id), der = rs[0];
  const pro = der && der.prochaine && der.prochaine.date >= auj ? der.prochaine : null;
  const ks = contactsDe(c.id);
  const tuiles = [
    { v: 'actions', ic: 'list-todo', titre: 'Plan d\'actions', val: `${ouvertes.length} ouverte(s)`, sous: retard.length ? `${retard.length} en retard` : 'aucune action en retard', etat: retard.length ? 'alerte' : '', action: { act: 'actNew', lib: 'Nouvelle action', ic: 'plus' } },
    { v: 'reunions', ic: 'messages-square', titre: 'Réunions & CR', val: pro ? new Date(pro.date + 'T00:00:00').toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' }) + (pro.heure ? ' · ' + pro.heure : '') : (der ? `CR n° ${der.numero}` : 'Aucun CR'), sous: pro ? 'prochaine réunion' : der ? `du ${fmtDate(der.date)}${der.diffuseLe ? ', diffusé' : ', non diffusé'}` : 'premier compte rendu à rédiger',
      etat: der && !der.diffuseLe ? 'alerte' : '', badge: der && !der.diffuseLe ? 'à diffuser' : '', action: { act: 'reuNew', lib: 'Nouveau CR', ic: 'plus' } },
    { act: 'rapportMensuel', ic: 'file-text', titre: 'Rapport mensuel', val: moisLong(aujourdHui().slice(0, 7)).replace(/^./, x => x.toUpperCase()), sous: 'avancement, planning, effectifs, sécurité, photos — PDF pour le maître d\'œuvre' },
    { act: 'agenda', ic: 'calendar-range', titre: 'Mon agenda', val: `${evenementsAgenda([c], TYPES_AGENDA.map(x => x[0])).length} événement(s)`, sous: 'réunions, échéances, jalons et livraisons à ajouter au téléphone, avec rappels' },
    (() => { const ds = derniersIndices(c.id), att = documentsEnAttente(db, c.id); return { v: 'documents', ic: 'folder-open', titre: 'Documents', val: `${ds.length} document(s)`, sous: att.length ? `${att.length} visa(s) en attente depuis plus de 15 jours` : `${ds.filter(d => d.doe).length} pièce(s) du DOE`, etat: att.length ? 'alerte' : '', action: { act: 'docNew', lib: 'Ajouter', ic: 'plus' } }; })(),
    { v: 'annuaire', ic: 'contact', titre: 'Annuaire', val: `${ks.length} intervenant(s)`, sous: [...new Set(ks.map(k => k.role))].slice(0, 3).join(' · ') || 'MOA, MOE, CSPS, fournisseurs…', action: { act: 'contactNew', lib: 'Ajouter', ic: 'plus' } }
  ];
  const prochaines = ouvertes.slice(0, 5);
  return enTeteEspace(c, 'Coordination') + `<div class="stack">${grilleTuiles(tuiles)}
    <div><div class="section-titre">Prochaines actions</div>${prochaines.length ? `<div class="card">${prochaines.map(a => ligneAction(a, { sansSuppr: true })).join('')}
      ${ouvertes.length > 5 ? `<div class="card-foot row"><span class="grow"></span><button class="btn ghost sm" data-nav="actions">Toutes les actions ${icone('chevron-right', 'sm')}</button></div>` : ''}</div>` : `<div class="calme">${icone('circle-check')}<span>Aucune action ouverte.</span></div>`}</div></div>`;
}

/* ------------------------------ Espace Gestion ---------------------------- */
function vHubGestion(c) {
  const f = calcFinances(db, c.id);
  const auj = aujourdHui();
  const sits = situationsDe(db, c.id), derSit = sits[sits.length - 1];
  const sitMois = sits.some(x => x.mois === auj.slice(0, 7));
  const cmds = (db.commandes || []).filter(x => x.chantierId === c.id);
  const retardLiv = cmds.filter(x => commandeEngagee(x) && !commandeLivree(x) && x.livraisonPrevue && x.livraisonPrevue < auj);
  const engage = cmds.filter(commandeEngagee).reduce((t, x) => t + montantCommande(x), 0);
  const tuiles = [
    { v: 'finances', ic: 'wallet', titre: 'Synthèse financière', val: f.ca ? fmtE(f.margePFA) : '—', sous: f.ca ? `marge fin d'affaire · ${pc(f.tauxMargePFA)} (prévu ${pc(f.tauxMargePrevue)})` : 'montant du marché à renseigner', etat: f.ca && f.margePFA < f.margePrevue - 1 ? 'alerte' : '' },
    { v: 'situations', ic: 'receipt', titre: 'Situations', val: derSit ? `N° ${derSit.numero}` : 'Aucune', sous: derSit ? `${moisLong(derSit.mois)} · ${libStatut(STATUTS_SITUATION, derSit.statut).toLowerCase()} · ${pc(f.avFinancier)} facturé` : 'première situation à établir',
      etat: f.ca && !sitMois && c.dateDebut && c.dateDebut <= auj ? 'alerte' : '', badge: f.ca && !sitMois && c.dateDebut && c.dateDebut <= auj ? 'mois à établir' : '', action: { act: 'sitNew', lib: 'Nouvelle situation', ic: 'plus' } },
    (() => { const att = devisDe(c.id).filter(d => d.statut === 'emis'), imp = situationsImpayees(db, c.id), rel = devisARelancer(db, c.id); return { v: 'devis', ic: 'file-plus', titre: 'Devis & relances', val: imp.length ? `${fmtE(imp.reduce((t, x) => t + x.ttc, 0))}` : fmtE(att.reduce((t, d) => t + montantDevis(d), 0)), sous: imp.length ? `${imp.length} situation(s) impayée(s)` : `${att.length} devis en attente${rel.length ? ` · ${rel.length} à relancer` : ''}`, etat: imp.length || rel.length ? 'alerte' : '', badge: imp.length || rel.length ? `${imp.length + rel.length} relance(s)` : '', action: { act: 'devisNew', lib: 'Nouveau devis', ic: 'plus' } }; })(),
    { v: 'commandes', ic: 'shopping-cart', titre: 'Commandes & achats', val: fmtE(engage), sous: retardLiv.length ? `${retardLiv.length} livraison(s) en retard` : `engagé · ${cmds.length} commande(s)`, etat: retardLiv.length ? 'alerte' : '', action: { act: 'cmdNew', lib: 'Nouvelle commande', ic: 'plus' } }
  ];
  const resume = f.ca ? `<div class="resume">
      <div><span>Chiffre d'affaires</span><b>${fmtE(f.ca)}</b><small>${f.avenants ? `dont avenants ${fmtE(f.avenants)}` : 'marché de base'}</small></div>
      <div><span>Facturé HT</span><b>${fmtE(f.facture)}</b>${barre(f.avFinancier, 'lg')}<small>${pc(f.avFinancier)} du CA · avancement physique ${pc(f.avPhysique)}</small></div>
      <div><span>Reste à encaisser TTC</span><b>${fmtE(f.resteAEncaisser)}</b><small>encaissé ${fmtE(f.encaisseTTC)}</small></div>
    </div>` : '';
  return enTeteEspace(c, 'Gestion') + `<div class="stack">${resume}${grilleTuiles(tuiles)}</div>`;
}

/* ------------------------------ Menu général ------------------------------ */
function menuGeneral() {
  const c = ch();
  ouvrirModal('Menu', `<div class="menu-espaces">${ESPACES.map(e => `<div class="menu-esp"><div class="menu-esp-t">${icone(e.ic, 'sm')}${esc(e.t)}</div>
      ${e.pages.map(([v, t, ic]) => `<button class="menu-lien" data-nav="${v}" ${e.id !== 'accueil' && !c ? 'disabled' : ''}>${icone(ic, 'sm')}${esc(t)}</button>`).join('')}</div>`).join('')}
    <div class="menu-esp"><div class="menu-esp-t">${icone('settings', 'sm')}Compte</div>
      <button class="menu-lien" data-nav="parametres">${icone('settings', 'sm')}Paramètres</button>
      <button class="menu-lien" data-act="identite">${icone('user', 'sm')}Mon profil</button>
      <button class="menu-lien" data-act="recherche">${icone('search', 'sm')}Rechercher</button></div></div>`,
    '', { icone: 'menu', taille: 'wide' });
}

function menuUtilisateur(ancre) {
  ouvrirPopover(ancre, `<div class="pop-user"><div class="row" style="gap:10px;padding:12px 14px;border-bottom:1px solid var(--border)"><span class="avatar">${initiales(nomUser())}</span>
      <div><div class="strong">${esc(nomUser() || 'Utilisateur')}</div><div class="small muted">${esc(user && user.role || 'Profil non renseigné')}</div></div></div>
    <button class="menu-lien" data-act="identite">${icone('user', 'sm')}Mon profil</button>
    <button class="menu-lien" data-nav="portefeuille">${icone('briefcase', 'sm')}Portefeuille de chantiers</button>
    <button class="menu-lien" data-nav="parametres">${icone('settings', 'sm')}Paramètres et données</button>
    <button class="menu-lien" data-act="syncPill">${icone('cloud', 'sm')}Synchronisation en ligne</button></div>`, 260);
  const p = $('#popRoot .popover');
  if (p) p.style.left = Math.max(8, Math.min(innerWidth - 268, ancre.getBoundingClientRect().right - 260)) + 'px';
}

/* ---------------------------- Création rapide ----------------------------- */
const CREATIONS = [
  { id: 'pointer', ic: 'clock', t: 'Pointer l\'équipe', s: 'présences et heures du jour', go: () => { ui.ptDate = aujourdHui(); ui.ptMode = 'jour'; allerA('pointage'); } },
  { id: 'photo', ic: 'camera', t: 'Prendre une photo', s: 'avancement, détail, livraison', go: () => $('#phGalerieInput').click() },
  { id: 'journal', ic: 'notebook-pen', t: 'Entrée de journal', s: 'météo, effectif, événements', go: () => modalJournal(null) },
  { id: 'action', ic: 'list-todo', t: 'Nouvelle action', s: 'qui fait quoi, pour quand', go: () => modalAction(null) },
  { id: 'reserve', ic: 'circle-alert', t: 'Nouvelle réserve', s: 'défaut à lever, avec photo', go: () => modalReserve(null) },
  { id: 'causerie', ic: 'shield-alert', t: 'Quart d\'heure sécurité', s: 'thème et émargement', go: () => modalSecu('causerie', null) },
  { id: 'permis', ic: 'flame', t: 'Permis de feu', s: 'travaux par point chaud', go: () => modalSecu('permis', null) },
  { id: 'cr', ic: 'messages-square', t: 'Compte rendu', s: 'réunion de chantier', go: () => { ui.reunionId = null; allerA('reunions'); ACT.reuNew(); } },
  { id: 'commande', ic: 'shopping-cart', t: 'Commande', s: 'matériaux, matériel', go: () => modalCommande(null) },
  { id: 'devis', ic: 'file-plus', t: 'Devis de travaux sup.', s: 'chiffrage, PDF, relances', go: () => modalDevis(null) },
  { id: 'document', ic: 'folder-open', t: 'Document', s: 'plan, fiche, visa, DOE', go: () => modalDocument(null) },
  { id: 'rapport', ic: 'file-text', t: 'Rapport mensuel', s: 'PDF d\'avancement pour le MOE', go: () => modalRapportMensuel() },
  { id: 'pv', ic: 'file-check', t: 'PV de réception', s: 'avec signatures à l\'écran', go: () => { ui.qualiteTab = 'pv'; allerA('qualite'); modalPV('reception', null); } },
  { id: 'agenda', ic: 'calendar-range', t: 'Ajouter à mon agenda', s: 'réunions, échéances, rappels', go: () => modalAgenda() }
];
function menuCreer() {
  const c = ch();
  if (!c) return modalChantier(null);
  ouvrirModal('Créer', `<p class="small muted" style="margin-bottom:12px">Sur le chantier <b>${esc(c.nom)}</b></p>
    <div class="creer-grille">${CREATIONS.map(x => `<button class="creer-item" data-act="creerGo" data-id="${x.id}"><span class="t-ico">${icone(x.ic)}</span><span><b>${esc(x.t)}</b><small>${esc(x.s)}</small></span></button>`).join('')}</div>`,
    '', { icone: 'plus', taille: 'wide' });
}

/* -------------------------------- Recherche ------------------------------- */
function entreesRecherche() {
  const out = [];
  ESPACES.forEach(e => e.pages.forEach(([v, t, ic]) => out.push({ ic, t, s: e.t, run: () => allerA(v), besoinCh: e.id !== 'accueil' })));
  out.push({ ic: 'settings', t: 'Paramètres', s: 'Compte', run: () => allerA('parametres') });
  CREATIONS.forEach(x => out.push({ ic: x.ic, t: x.t, s: 'Créer', run: () => { fermerModal(); x.go(); }, besoinCh: true }));
  db.chantiers.forEach(c => out.push({ ic: 'building-2', t: c.nom, s: 'Chantier' + (c.client ? ' · ' + c.client : ''), run: () => { ui.chantierId = c.id; ui.zone = null; allerA('hubChantier'); } }));
  const c = ch();
  if (c) {
    contactsDe(c.id).forEach(k => out.push({ ic: 'contact', t: libContact(k), s: `Annuaire · ${k.role}${k.tel ? ' · ' + k.tel : ''}`, run: () => allerA('annuaire') }));
    actionsDe(db, c.id).filter(actionOuverte).forEach(a => out.push({ ic: 'list-todo', t: a.libelle, s: `Action${a.responsable ? ' · ' + a.responsable : ''}${a.echeance ? ' · ' + fmtDateCourt(a.echeance) : ''}`, run: () => { fermerModal(); modalAction(a); } }));
    deCh(db.reserves).filter(r => r.statut !== 'levée').forEach(r => out.push({ ic: 'circle-alert', t: `${numeroReserve(r)} ${r.description}`, s: 'Réserve ouverte', run: () => { fermerModal(); modalReserve(r); } }));
    compagnonsDe(c.id).forEach(k => out.push({ ic: 'hard-hat', t: nomCompagnon(k), s: `Compagnon · ${k.qualification || ''}`, run: () => allerA('pointage') }));
  }
  return out.filter(x => !x.besoinCh || c);
}
let _resultatsRecherche = [];
function ouvrirRecherche() {
  ouvrirModal('Rechercher', `<div class="input-icon">${icone('search', 'sm')}<input class="input" id="rcQ" placeholder="Page, chantier, action, intervenant, compagnon…" data-input="rcFiltre" autocomplete="off"></div>
    <div class="rc-liste" id="rcListe"></div><div class="xs muted" style="margin-top:8px">Entrée pour ouvrir le premier résultat · Échap pour fermer · Ctrl+K pour rouvrir</div>`, '', { icone: 'search' });
  renderRecherche('');
}
function renderRecherche(q) {
  const mots = norm(q).split(/\s+/).filter(Boolean);
  _resultatsRecherche = entreesRecherche().filter(x => mots.every(m => norm(x.t + ' ' + x.s).includes(m))).slice(0, 12);
  const z = $('#rcListe');
  if (z) z.innerHTML = _resultatsRecherche.length ? _resultatsRecherche.map((x, i) => `<button class="rc-item ${i === 0 ? 'on' : ''}" data-act="rcGo" data-i="${i}">${icone(x.ic, 'sm')}<span class="grow"><b>${esc(x.t)}</b><small>${esc(x.s)}</small></span>${icone('arrow-right', 'sm')}</button>`).join('')
    : '<div class="muted small" style="padding:14px 4px">Aucun résultat.</div>';
}

/* --------------------------------- Actions -------------------------------- */
Object.assign(ACT, {
  espace: el => {
    const e = ESPACES.find(x => x.id === el.dataset.e);
    if (!e) return;
    if (e.id !== 'accueil' && !ch()) { if (!db.chantiers.length) return allerA('journee'); ui.chantierId = db.chantiers[0].id; }
    allerA(e.pages[0][0]);
  },
  creer: () => menuCreer(),
  creerGo: el => { const x = CREATIONS.find(k => k.id === el.dataset.id); if (!x) return; if (x.id !== 'photo') fermerModal(); x.go(); if (x.id === 'photo') fermerModal(); },
  recherche: () => ouvrirRecherche(),
  rcGo: el => { const x = _resultatsRecherche[num(el.dataset.i)]; if (x) { fermerModal(); x.run(); } },
  resNewDepuisHub: () => modalReserve(null),
  secuNewDepuisHub: el => modalSecu(el.dataset.t || 'causerie', null)
});
Object.assign(INP, { rcFiltre: el => renderRecherche(el.value) });
