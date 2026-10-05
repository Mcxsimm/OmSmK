/* ==========================================================================
   OmSmK — imports (BTE SMAC, listes terrain, sauvegardes), exports (Excel,
   rapport PDF) et QR codes de zones.
   ========================================================================== */
// deno-lint-ignore-file no-unused-vars
'use strict';

/* ============================ Import fichiers ============================ */
function choisirFichier() {
  const inp = document.createElement('input');
  inp.type = 'file';
  inp.accept = '.xlsx,.xlsm,.xls,.csv,.txt,.json';
  inp.onchange = () => { if (inp.files[0]) importerFichier(inp.files[0]); };
  inp.click();
}

async function importerFichier(file) {
  const nom = file.name.toLowerCase();
  try {
    if (nom.endsWith('.json')) {
      const d = JSON.parse(await file.text());
      if (!d || !Array.isArray(d.chantiers)) throw new Error('Fichier de sauvegarde invalide');
      if (!await confirmer('Restaurer la sauvegarde', `La sauvegarde contient ${d.chantiers.length} chantier(s). Elle <b>remplacera</b> les données de cet appareil.`, { ok: 'Restaurer', danger: true })) return;
      Synchro.oublierEtat();
      db = Object.assign(dbVide(), d); ui.chantierId = null; save(); fermerModal(); render(); toast('Sauvegarde restaurée', 'succes');
      return;
    }
    if (nom.endsWith('.csv') || nom.endsWith('.txt')) {
      importerTerrain(parseCSV(await file.text()));
      return;
    }
    if (typeof XLSX === 'undefined') throw new Error('Bibliothèque Excel non chargée (connectez-vous une première fois à Internet).');
    const wb = XLSX.read(await file.arrayBuffer(), { type: 'array' });
    if (wb.SheetNames.some(n => /main d.?(oe|œ)uvre/i.test(n))) await importerBTE(wb, file.name);
    else importerTerrain(XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, raw: false, defval: '' }));
  } catch (e) {
    console.error(e);
    toast('Import impossible : ' + (e.message || e), 'erreur');
  }
}

function importerTerrain(rows) {
  if (!rows.length) throw new Error('Fichier vide');
  const h = rows[0].map(norm);
  const col = (...noms) => h.findIndex(x => noms.includes(x));
  const iC = col('chantier'), iZ = col('zone', 'support', 'repere', 'localisation', 'emplacement'), iL = col('lot', 'phase'),
    iT = col('tache', 'taches', 'travaux', 'operation'), iF = col('fait', 'realise', 'etat'), iO = col('observation', 'observations', 'obs', 'commentaire');
  if (iT < 0 || iZ < 0) throw new Error('Colonnes « Zone » (ou « Support ») et « Tache » obligatoires');
  if (iC < 0 && !ch()) throw new Error('Pas de colonne « Chantier » : créez ou ouvrez d\'abord un chantier');
  const exist = new Set(db.taches.map(t => t.chantierId + '||' + t.zone + '||' + t.tache));
  let n = 0, nc = 0, cible = null;
  rows.slice(1).forEach(r => {
    const tache = String(r[iT] ?? '').trim(), zone = String(r[iZ] ?? '').trim();
    if (!tache || !zone) return;
    let c = ch();
    if (iC >= 0 && String(r[iC] ?? '').trim()) {
      const nomC = String(r[iC]).trim();
      c = db.chantiers.find(x => norm(x.nom) === norm(nomC));
      if (!c) {
        c = { id: uid(), nom: nomC, metier: 'Étanchéité', support: 'Béton', tauxHoraire: REF.tauxHoraireDefaut, heuresJour: REF.heuresJourDefaut, creeLe: new Date().toISOString() };
        db.chantiers.push(c); nc++;
      }
    }
    cible = cible || c;
    if (exist.has(c.id + '||' + zone + '||' + tache)) return;
    exist.add(c.id + '||' + zone + '||' + tache);
    const fait = iF >= 0 && estFait(r[iF]);
    db.taches.push({ id: uid(), chantierId: c.id, zone, lot: iL >= 0 ? String(r[iL] ?? '').trim() : '', tache, fait, faitLe: fait ? aujourdHui() : '', faitPar: '', obs: iO >= 0 ? String(r[iO] ?? '').trim() : '', ajout: false });
    n++;
  });
  if (cible) ui.chantierId = cible.id;
  ui.view = 'terrain'; ui.zone = null;
  save(); fermerModal(); render();
  toast(`${n} tâche(s) importée(s)${nc ? `, ${nc} chantier(s) créé(s)` : ''}`, 'succes');
}

// Import du BTE standard SMAC (onglets Synthèse, 1a Main d'œuvre, Étape 2 - Objectifs et suivi)
async function importerBTE(wb, nomFichier) {
  const sn = wb.SheetNames;
  const lignes = n => XLSX.utils.sheet_to_json(wb.Sheets[n], { header: 1, raw: true, defval: null, blankrows: true });
  const shMO = sn.find(n => /main d.?(oe|œ)uvre/i.test(n));
  const shSy = sn.find(n => /synth/i.test(n));
  const shSu = sn.find(n => /suivi/i.test(n));

  // 1. Synthèse : informations chantier
  const info = {};
  if (shSy) {
    const R = lignes(shSy);
    const pick = re => {
      for (const row of R) for (let i = 0; i < row.length; i++) {
        if (typeof row[i] === 'string' && re.test(row[i])) {
          for (let j = i + 1; j < row.length; j++) if (row[j] !== null && row[j] !== '') return row[j];
          return null;
        }
      }
      return null;
    };
    info.nom = pick(/^\s*chantier\s*:/i); info.conducteur = pick(/conducteur/i); info.imputation = pick(/imputation/i);
    info.agence = pick(/^\s*agence/i); info.marcheHT = pick(/march.*sign/i); info.marge = pick(/marge commerciale/i); info.taux = pick(/taux horaire/i);
    // Budgets d'achats (colonne BTE de la répartition des dépenses)
    info.budget = { materiaux: num(pick(/total mat[ée]riaux/i)), soustraitance: num(pick(/total sous.?trait/i)), materiel: num(pick(/total mat[ée]riel/i)), divers: num(pick(/total divers/i)) };
  }

  // 2. Main d'œuvre : opérations
  const R = lignes(shMO);
  let hj = REF.heuresJourDefaut, cols = null, bloc = '';
  R.forEach((row, r) => row.forEach((v, i) => {
    if (typeof v === 'string' && /heures par journ/i.test(v)) {
      const sous = R[r + 1] && R[r + 1][i];
      if (num(sous) > 0) hj = num(sous);
      else { const n = row.slice(i + 1).find(x => num(x) > 0 && num(x) < 24); if (n) hj = num(n); }
    }
  }));
  const ops = [];
  R.forEach(row => {
    const estEntete = row.some(v => typeof v === 'string' && /phase chantier/i.test(v));
    if (estEntete) {
      const f = re => row.findIndex(v => typeof v === 'string' && re.test(v));
      cols = { cx: f(/^\s*complexe/i), ph: f(/phase chantier/i), op: f(/op[ée]rations/i), me: f(/m[ée]tr[ée]/i), ca: f(/cadence/i), h: f(/nbr d.?heures/i), dv: f(/devis/i) };
      return;
    }
    if (typeof row[0] === 'string' && /^\s*\d+\.\s*$/.test(row[0]) && row[1]) { bloc = String(row[1]).trim(); return; }
    if (!cols || cols.op < 0) return;
    const opNom = row[cols.op];
    if (typeof opNom !== 'string' || !opNom.trim() || /total/i.test(opNom)) return;
    const metre = num(row[cols.me]), cad = num(row[cols.ca]), h = num(row[cols.h]);
    if (metre <= 0 && h <= 0) return;
    let ouvrage = cols.cx >= 0 && row[cols.cx] ? String(row[cols.cx]).trim() : '';
    if (!ouvrage || ouvrage === '0') ouvrage = bloc && bloc !== '0' ? bloc : 'Ouvrage 1';
    let phase = cols.ph >= 0 && row[cols.ph] ? String(row[cols.ph]).trim() : '';
    if (!phase || phase === '0') phase = phaseDeOperation(opNom) || 'Non classé';
    const calcule = metre > 0 && cad > 0;
    ops.push({
      ouvrage, phase, operation: opNom.trim(), designation: '', metre, unite: calcule ? uniteDe(opNom) : (metre > 0 ? uniteDe(opNom) : 'h'),
      cadence: calcule ? cad : 0, heuresForfait: calcule ? 0 : h, devis: cols.dv >= 0 ? num(row[cols.dv]) : 0
    });
  });
  if (!ops.length) throw new Error('aucune opération renseignée dans l\'onglet « 1a Main d\'œuvre » (modèle de BTE vierge ?)');

  // 3. Suivi hebdomadaire (Étape 2)
  const suivi = [];
  // 4. Liste des matériaux (onglet 1c) : catalogue proposé dans les commandes
  const catalogue = [];
  const shMat = sn.find(n => /mat[ée]riaux/i.test(n));
  if (shMat) {
    let cm = null;
    lignes(shMat).forEach(row => {
      const f = re => row.findIndex(v => typeof v === 'string' && re.test(v.trim()));
      if (!cm && f(/^mat[ée]riaux$/i) >= 0 && f(/^unit/i) >= 0) { cm = { d: f(/^mat[ée]riaux$/i), u: f(/^unit/i), q: f(/^m[ée]tr/i), pu: f(/^pu/i), t: f(/^total/i) }; return; }
      if (!cm) return;
      const d = row[cm.d];
      if (typeof d !== 'string' || !d.trim() || /^total/i.test(d) || num(row[cm.t]) <= 0) return;
      catalogue.push({ designation: d.trim(), unite: String(row[cm.u] ?? '').trim(), quantite: num(row[cm.q]), pu: num(row[cm.pu]) });
    });
  }

  if (shSu) {
    const S = lignes(shSu);
    let semCols = [];
    S.forEach(row => {
      const sc = [];
      row.forEach((v, i) => { const m = typeof v === 'string' && v.match(/^\s*semaine\s*(\d+)/i); if (m) sc.push({ k: Number(m[1]), col: i }); });
      if (sc.length) { semCols = sc; return; }
      const ouv = row[1], ph = row[2];
      if (!semCols.length || typeof ph !== 'string' || !ph.trim() || /phase chantier/i.test(ph)) return;
      semCols.forEach(({ k, col }) => {
        const p = row[col], hh = num(row[col + 1]);
        const aPct = p !== null && p !== '' && num(p) > 0;
        if (aPct || hh > 0) suivi.push({ k, ouvrage: String(ouv || bloc).trim(), phase: ph.trim(), pct: aPct ? num(p) : null, heures: hh });
      });
    });
  }

  const nomC = String(info.nom || nomFichier.replace(/\.[^.]+$/, '')).trim();
  let c = db.chantiers.find(x => norm(x.nom) === norm(nomC));
  if (c) {
    if (!await confirmer('Chantier existant', `Le chantier « <b>${esc(c.nom)}</b> » existe déjà. Remplacer son BTE${suivi.length ? ' et son suivi hebdomadaire' : ''} par ceux du fichier ?`, { ok: 'Remplacer', danger: true })) return;
    db.ops = db.ops.filter(o => o.chantierId !== c.id);
    if (suivi.length) db.suivi = db.suivi.filter(s => s.chantierId !== c.id);
  } else {
    const facade = ops.some(o => /ossature|bardage|peau|cassette|clin/i.test(o.operation + o.phase));
    c = { id: uid(), nom: nomC, metier: facade ? 'Façade' : 'Étanchéité', support: 'Béton', creeLe: new Date().toISOString() };
    db.chantiers.push(c);
  }
  Object.assign(c, {
    conducteur: info.conducteur ? String(info.conducteur) : c.conducteur, imputation: info.imputation ? String(info.imputation) : c.imputation,
    agence: info.agence ? String(info.agence) : c.agence, marcheHT: num(info.marcheHT) || c.marcheHT,
    margeCommerciale: num(info.marge) || c.margeCommerciale, tauxHoraire: num(info.taux) || c.tauxHoraire || REF.tauxHoraireDefaut, heuresJour: hj
  });
  if (info.budget && Object.values(info.budget).some(v => v > 0)) c.budget = Object.assign({}, c.budget, info.budget);
  if (catalogue.length) c.catalogue = catalogue;
  ops.forEach(o => db.ops.push(Object.assign({ id: uid(), chantierId: c.id }, o)));
  if (suivi.length) {
    const kMax = Math.max(...suivi.map(s => s.k));
    if (!c.dateDebut) c.dateDebut = addDays(lundi(aujourdHui()), -7 * (kMax - 1));
    const base = lundi(c.dateDebut);
    suivi.forEach(s => db.suivi.push({ id: uid(), chantierId: c.id, semaine: addDays(base, 7 * (s.k - 1)), ouvrage: s.ouvrage, phase: s.phase, pct: s.pct, heures: s.heures }));
  }
  ui.chantierId = c.id; ui.view = 'bte';
  save(); fermerModal(); render();
  toast(`BTE importé : ${ops.length} opération(s)${suivi.length ? `, ${suivi.length} saisie(s) de suivi` : ''}`, 'succes');
}

function phaseDeOperation(op) {
  const n = norm(op);
  for (const m of Object.values(REF.metiers)) for (const [ph, ops] of Object.entries(m)) if (ops.some(o => norm(o) === n || n.includes(norm(o)))) return ph;
  if (/hors d.?eau/.test(n)) return "Hors d'eau";
  if (/2.{0,4}couche|releve/.test(n)) return '2nd couche et relevés';
  return '';
}
function uniteDe(op) {
  const n = norm(op);
  if (/^(ep|crosses?|lanterneaux?)$/.test(n) || /lanterneau|crosse/.test(n)) return 'U';
  if (/releve|equerre|solin|couvertine|garde|joint|acrotere|encadrement|bavette|angle|costiere|rive/.test(n)) return 'mL';
  return 'm²';
}

/* ================================ Exports ================================ */
function exporterExcel() {
  const c = ch();
  if (!c) return;
  if (typeof XLSX === 'undefined') return toast('Bibliothèque Excel non chargée.', 'erreur');
  const wb = XLSX.utils.book_new();
  const add = (nom, rows) => XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), nom);
  add('BTE', [['Ouvrage', 'Phase', 'Opération', 'Désignation', 'Métré', 'Unité', 'Cadence (u/j/homme)', 'Heures', 'Budget €', 'Devis €'],
    ...deCh(db.ops).map(o => { const h = heuresOp(o, c); return [o.ouvrage, o.phase, o.operation, o.designation, num(o.metre), o.unite, num(o.cadence), +h.toFixed(2), +(h * num(c.tauxHoraire)).toFixed(2), num(o.devis)]; })]);
  const s = calcSuivi(db, c.id);
  add('Avancement', [['Ouvrage', 'Phase', 'Objectif h', '% réalisé', 'H. pointées', 'Écart h à date', 'Impact € à date', 'Écart h projeté', 'Impact € projeté'],
    ...s.rows.map(r => [r.ouvrage, r.phase, +r.budget.toFixed(2), +r.pct.toFixed(3), r.heures, +r.ecartH.toFixed(2), +r.impact.toFixed(2), +r.ecartProj.toFixed(2), +r.impactProj.toFixed(2)]),
    ['TOTAL', '', +s.tot.budget.toFixed(2), +s.tot.pct.toFixed(3), s.tot.heures, +s.tot.ecartH.toFixed(2), +s.tot.impact.toFixed(2), +s.tot.ecartProj.toFixed(2), +s.tot.impactProj.toFixed(2)]]);
  add('Suivi hebdo', [['Semaine (lundi)', 'N° semaine', 'Ouvrage', 'Phase', '% cumulé', 'Heures pointées'],
    ...deCh(db.suivi).sort((a, b) => a.semaine.localeCompare(b.semaine)).map(e => [e.semaine, semISO(e.semaine), e.ouvrage, e.phase, e.pct ?? '', num(e.heures)])]);
  const nomK = id => { const k = (db.compagnons || []).find(x => x.id === id); return k ? [`${k.prenom || ''} ${k.nom || ''}`.trim(), k.qualification || '', k.matricule || ''] : ['', '', '']; };
  const libSt = st => (STATUTS_POINTAGE.find(x => x[0] === st) || [st, st])[1];
  add('Pointages', [['OTP', 'Date', 'N° semaine', 'Compagnon', 'Qualification', 'Matricule', 'Statut', 'Ouvrage', 'Phase', 'Heures', 'Intempéries h', 'Panier', 'Observation'],
    ...pointagesDe(db, c.id).flatMap(p => {
      const base = [otpDe(c), p.date, semISO(p.date), ...nomK(p.compagnonId), libSt(p.statut)];
      const fin = (i) => i === 0 ? [num(p.intemp), p.panier ? 1 : 0, p.obs || ''] : [0, 0, ''];
      const lignes = p.statut === 'present' && (p.lignes || []).length ? p.lignes : [{ ouvrage: '', phase: '', h: 0 }];
      return lignes.map((l, i) => [...base, l.ouvrage, l.phase, num(l.h), ...fin(i)]);
    })]);
  const pl = calcPlanning(db, c.id);
  add('Planning', [['Ouvrage', 'Phase', 'Budget h', 'Début', 'Fin', 'Durée (j ouvrés)', '% réalisé', 'Fin projetée', 'Glissement (j)', 'Statut'],
    ...pl.rows.map(r => [r.ouvrage, r.phase, +r.budget.toFixed(1), r.debut, r.fin, r.duree, +r.pct.toFixed(3), r.finProjetee, r.glissement, (STATUTS_PHASE[r.statut] || [''])[0]]),
    [], ['Jalon', 'Date', 'Atteint'], ...pl.jalons.map(j => [j.libelle, j.date, j.fait ? 'oui' : ''])]);
  add('Actions', [['Action', 'Responsable', 'Échéance', 'État', 'Origine', 'Créée le', 'Faite le', 'Commentaire'],
    ...actionsDe(db, c.id).map(a => [a.libelle, a.responsable, a.echeance, actionOuverte(a) ? (actionEnRetard(a) ? 'En retard' : 'Ouverte') : 'Faite', libOrigine(a), a.creeLe, a.faiteLe, a.note || ''])]);
  add('Réunions', [['N°', 'Type', 'Date', 'Lieu', 'Présents', 'Points abordés', 'Diffusé le'],
    ...reunionsDe(c.id).map(r => [num(r.numero), r.type, r.date, r.lieu, (r.participants || []).filter(x => x.statut === 'present').map(x => x.societe || x.nom).join(', '), (r.points || []).map(x => `${x.titre} : ${x.texte || 'RAS'}`).join('\n'), r.diffuseLe || ''])]);
  add('Annuaire', [['Rôle', 'Société', 'Nom', 'Fonction', 'Téléphone', 'E-mail'], ...contactsDe(c.id).map(k => [k.role, k.societe, k.nom, k.fonction, k.tel, k.email])]);
  add('Sécurité', [['Date', 'Type', 'Objet', 'Personnes', 'Détail'],
    ...secuDe(c.id).map(x => [x.date, TYPES_SECU[x.type].lib,
      x.type === 'causerie' ? x.theme : x.type === 'accueil' ? nomK(x.compagnonId) : x.type === 'permis' ? x.zone : x.type === 'evenement' ? x.nature : 'Visite',
      (x.participants || x.intervenants || []).map(nomK).join(', ') || nomK(x.victimeId) || x.auteur || '',
      x.type === 'visite' ? `${Object.values(x.items || {}).filter(v => v === 'nc').length} non-conformité(s)` : x.type === 'permis' ? (x.surveillance && x.surveillance.fait ? `surveillance ${x.surveillance.heure}` : 'surveillance à confirmer') : (x.notes || x.description || '')])]);
  add('Terrain', [['Chantier', 'Zone', 'Lot', 'Tache', 'Fait', 'Fait le', 'Par', 'Observation', 'Non prévu'],
    ...deCh(db.taches).map(t => [c.nom, t.zone, t.lot, t.tache, estFait(t.fait) ? 'VRAI' : 'FAUX', t.faitLe, t.faitPar, t.obs, t.ajout ? 'oui' : ''])]);
  add('Journal', [['Date', 'Météo', 'Effectif', 'Heures', 'Intempérie', 'Cause', 'Texte', 'Auteur'],
    ...deCh(db.journal).sort((a, b) => a.date.localeCompare(b.date)).map(j => [j.date, j.meteo, num(j.effectif), num(j.heures), j.intemperie ? 'oui' : '', j.cause, j.texte, j.auteur])]);
  add('Réserves', [['Zone', 'Description', 'Origine', 'Responsable', 'Échéance', 'Statut', 'Créée le', 'Levée le'],
    ...deCh(db.reserves).map(r => [r.zone, r.description, r.origine, r.responsable, r.echeance, r.statut, r.creeLe, r.leveeLe])]);
  add('Marché', [['Code', 'Désignation', 'Type', 'Montant HT'], ...postesDe(db, c.id).map(p => [p.code, p.designation, p.avenant ? 'Avenant' : 'Marché', num(p.montant)])]);
  add('Situations', [['N°', 'Mois', 'Statut', 'Cumul HT', 'Mois HT', 'Retenue garantie', 'Net HT', 'TVA', 'Net TTC'],
    ...situationsDe(db, c.id).map(s => { const t = calcSituation(db, c.id, s.id).tot; return [num(s.numero), s.mois, libStatut(STATUTS_SITUATION, s.statut), +t.cumul.toFixed(2), +t.mois.toFixed(2), +t.rg.toFixed(2), +t.netHT.toFixed(2), +t.tva.toFixed(2), +t.ttc.toFixed(2)]; })]);
  add('Commandes', [['N°', 'Date', 'Fournisseur', 'Objet', 'Catégorie', 'Statut', 'Montant HT', 'Livraison prévue', 'Livraison réelle', 'N° facture', 'Montant facturé'],
    ...(db.commandes || []).filter(x => x.chantierId === c.id).map(x => [x.numero, x.date, x.fournisseur, x.objet, x.categorie, libStatut(STATUTS_COMMANDE, x.statut), +montantCommande(x).toFixed(2), x.livraisonPrevue, x.livraisonReelle, x.factureNumero, num(x.factureMontant)])]);
  const fi = calcFinances(db, c.id);
  add('Finances', [['Poste', 'Budget', 'Réel / engagé', 'Fin d\'affaire'], ['Main d\'œuvre', fi.budget.mo, fi.reel.mo, fi.pfa.mo],
    ...CATEGORIES_ACHAT.map(cat => { const k = CLE_BUDGET[cat]; return [cat, fi.budget[k], fi.reel[k], fi.pfa[k]]; }),
    ['Total déboursé', fi.budget.total, fi.reel.total, fi.pfa.total], [], ['Chiffre d\'affaires', fi.ca], ['Marge prévue', fi.margePrevue], ['Marge fin d\'affaire', fi.margePFA], ['Facturé HT', fi.facture], ['Encaissé TTC', fi.encaisseTTC]]);
  toast('Export Excel généré', 'succes');
  XLSX.writeFile(wb, `OmSmK_${c.nom.replace(/[^\w-]+/g, '_')}_${aujourdHui()}.xlsx`);
}

// jsPDF (polices standard) : remplacer les espaces insécables et caractères hors Latin-1
// deno-lint-ignore no-control-regex
const pdfTxt = s => String(s ?? '').replace(/[  ]/g, ' ').replace(/−/g, '-').replace(/[’‘]/g, "'").replace(/[“”]/g, '"').replace(/[–—]/g, '-').replace(/…/g, '...').replace(/œ/g, 'oe').replace(/Œ/g, 'OE').replace(/[^\x00-\xFF€]/g, '');

async function rapportPDF() {
  const c = ch();
  if (!c) return;
  if (!globalThis.jspdf) return toast('Bibliothèque PDF non chargée.', 'erreur');
  toast('Génération du rapport…');
  const { jsPDF } = globalThis.jspdf;
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const s = calcSuivi(db, c.id);
  const t = statsTerrain(db, c.id);
  const st = statutChantier(c);
  const theo = avancementTheorique(c);
  const NAVY = [14, 35, 64], ACCENT = [232, 89, 12], GRIS = [102, 112, 133], TEXTE = [16, 24, 40], LIGNE = [228, 232, 238];
  const POS = [6, 118, 71], NEG = [180, 35, 24];
  const W = 210, M = 14, CW = W - 2 * M;
  const T = rows => rows.map(r => r.map(pdfTxt));
  const couleur = n => n > 0.04 ? POS : n < -0.04 ? NEG : TEXTE;

  // En-tête
  doc.setFillColor(...NAVY); doc.rect(0, 0, W, 26, 'F');
  doc.setFillColor(...ACCENT); doc.roundedRect(M, 7, 12, 12, 2.5, 2.5, 'F');
  doc.setTextColor(255, 255, 255); doc.setFont('helvetica', 'bold'); doc.setFontSize(8.5); doc.text('OS', M + 6, 14.6, { align: 'center' });
  doc.setFontSize(13); doc.text('OmSmK', M + 16, 12.5);
  doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(195, 207, 224); doc.text(pdfTxt('Rapport d\'avancement de chantier'), M + 16, 18);
  doc.text(pdfTxt(new Date().toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })), W - M, 12.5, { align: 'right' });
  doc.text(pdfTxt(`Semaine ${semISO(lundi(aujourdHui()))}`), W - M, 18, { align: 'right' });

  // Titre et fiche
  let y = 38;
  doc.setTextColor(...ACCENT); doc.setFont('helvetica', 'bold'); doc.setFontSize(8); doc.text(pdfTxt((c.client || 'Chantier').toUpperCase()), M, y);
  doc.setTextColor(...TEXTE); doc.setFontSize(18); doc.text(pdfTxt(c.nom), M, y + 8);
  doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(...GRIS);
  doc.text(pdfTxt([c.adresse, c.metier, st.txt].filter(Boolean).join('  ·  ')), M, y + 14);
  y += 21;
  const infos = [['Conducteur de travaux', c.conducteur], ['Chef de chantier', c.chef], ['Période', c.dateDebut ? `${fmtDate(c.dateDebut)} - ${fmtDate(c.dateFin) || '...'}` : ''],
    ['Marché HT', num(c.marcheHT) ? fmtE(c.marcheHT) : ''], ['Taux horaire', num(c.tauxHoraire) ? fmtE(c.tauxHoraire) + ' / h' : ''], ['Édité par', nomUser()]].filter(r => r[1]);
  infos.forEach((r, i) => {
    const cx = M + (i % 3) * (CW / 3), cy = y + Math.floor(i / 3) * 10;
    doc.setFontSize(7.5); doc.setTextColor(...GRIS); doc.text(pdfTxt(r[0].toUpperCase()), cx, cy);
    doc.setFontSize(9.5); doc.setTextColor(...TEXTE); doc.text(pdfTxt(r[1]), cx, cy + 4.5);
  });
  y += Math.ceil(infos.length / 3) * 10 + 4;

  // Indicateurs
  const kpis = [
    ['Avancement', pc(s.tot.pct), theo !== null ? `prévu ${pc(theo)}` : `${fmt(s.tot.gagnees)} h produites`, TEXTE],
    ['Heures pointées', `${fmt(s.tot.heures, 0)} h`, `sur ${fmt(s.tot.budget, 0)} h budgétées`, TEXTE],
    ['Écart à date', `${signe(s.tot.ecartH)} h`, signeE(s.tot.impact), couleur(s.tot.ecartH)],
    ['Projection fin', `${signe(s.tot.ecartProj)} h`, signeE(s.tot.impactProj), couleur(s.tot.ecartProj)]
  ];
  const kw = (CW - 9) / 4;
  kpis.forEach(([l, v, sub, col], i) => {
    const kx = M + i * (kw + 3);
    doc.setFillColor(248, 249, 251); doc.setDrawColor(...LIGNE); doc.roundedRect(kx, y, kw, 22, 2, 2, 'FD');
    doc.setFontSize(7.5); doc.setTextColor(...GRIS); doc.text(pdfTxt(l.toUpperCase()), kx + 4, y + 6);
    doc.setFont('helvetica', 'bold'); doc.setFontSize(14); doc.setTextColor(...col); doc.text(pdfTxt(v), kx + 4, y + 13.5);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(...GRIS); doc.text(pdfTxt(sub), kx + 4, y + 18.5);
  });
  y += 30;

  // besoin : hauteur (mm) du contenu qui suit, pour ne pas laisser un titre seul en bas de page
  const titre = (txt, besoin = 24) => {
    if (y + 8 + besoin > 280) { doc.addPage(); y = 20; }
    doc.setFont('helvetica', 'bold'); doc.setFontSize(11); doc.setTextColor(...TEXTE); doc.text(pdfTxt(txt), M, y);
    doc.setDrawColor(...ACCENT); doc.setLineWidth(0.6); doc.line(M, y + 2, M + 12, y + 2); doc.setLineWidth(0.2);
    y += 6;
  };
  const table = (head, body, extra = {}) => {
    doc.autoTable(Object.assign({
      startY: y, head: [head.map(pdfTxt)], body: T(body), theme: 'plain', margin: { left: M, right: M },
      styles: { font: 'helvetica', fontSize: 8.5, cellPadding: { top: 2.2, bottom: 2.2, left: 2, right: 2 }, textColor: TEXTE, lineColor: LIGNE, lineWidth: { bottom: 0.2 } },
      headStyles: { fillColor: [244, 246, 249], textColor: GRIS, fontStyle: 'bold', fontSize: 7.5 },
      alternateRowStyles: { fillColor: [252, 252, 253] }
    }, extra));
    y = doc.lastAutoTable.finalY + 9;
  };
  const image = async (svg, wPx, hPx) => {
    const hMm = CW * hPx / wPx;
    if (y + hMm > 280) { doc.addPage(); y = 20; }
    try { doc.addImage(await svgEnPng(svg, wPx, hPx), 'PNG', M, y, CW, hMm); } catch (_e) { /* graphique ignoré */ }
    y += hMm + 6;
  };

  const pts = serieAvancement(db, c.id);
  if (pts.length && s.rows.length) {
    titre('Courbe d\'avancement', CW * 250 / 760 + 4);
    doc.setFontSize(8); doc.setTextColor(...GRIS);
    doc.setFillColor(42, 120, 214); doc.rect(M, y - 1.6, 6, 1.2, 'F'); doc.text(pdfTxt('Réel (cumul pondéré)'), M + 8, y);
    if (pts.some(p => p.theo !== null)) { doc.setDrawColor(235, 104, 52); doc.setLineWidth(0.5); doc.setLineDashPattern([1.2, 0.8], 0); doc.line(M + 48, y - 1, M + 54, y - 1); doc.setLineDashPattern([], 0); doc.setLineWidth(0.2); doc.text(pdfTxt('Prévu (délai linéaire)'), M + 56, y); }
    y += 3;
    await image(courbeAvancement(pts, 760, { impression: true, hauteur: 250 }), 760, 250);
  }
  if (s.rows.length) {
    titre('Avancement par phase');
    table(['Ouvrage', 'Phase', 'Budget h', 'Réalisé', 'H. pointées', 'Écart h', 'Impact', 'Projeté'],
      [...s.rows.map(r => [r.ouvrage, r.phase, fmt(r.budget), pc(r.pct), fmt(r.heures), r.heures ? signe(r.ecartH) : '-', r.heures ? signeE(r.impact) : '-', r.heures ? signeE(r.impactProj) : '-']),
        ['Total', '', fmt(s.tot.budget), pc(s.tot.pct), fmt(s.tot.heures), signe(s.tot.ecartH), signeE(s.tot.impact), signeE(s.tot.impactProj)]],
      { columnStyles: { 2: { halign: 'right' }, 3: { halign: 'right' }, 4: { halign: 'right' }, 5: { halign: 'right' }, 6: { halign: 'right' }, 7: { halign: 'right' } },
        didParseCell: d => { if (d.section === 'body' && d.row.index === s.rows.length) { d.cell.styles.fontStyle = 'bold'; d.cell.styles.fillColor = [244, 246, 249]; } } });
    const hE = 16 + s.rows.length * 34; // hauteur du graphique en mode non compact
    titre('Écart d\'heures par phase', CW * hE / 760);
    await image(barresEcarts(s.rows, 760, { impression: true }), 760, hE);
  }
  const fi = calcFinances(db, c.id);
  if (fi.ca) {
    titre('Point financier', 60);
    table(['Indicateur', 'Montant', 'Commentaire'], [
      ['Chiffre d\'affaires (marché + avenants)', fmtE(fi.ca), fi.avenants ? `dont avenants ${fmtE(fi.avenants)}` : ''],
      ['Facturé cumulé HT', fmtE(fi.facture), `${pc(fi.avFinancier)} du CA - avancement physique ${pc(fi.avPhysique)}`],
      ['Encaissé TTC', fmtE(fi.encaisseTTC), `reste à encaisser ${fmtE(fi.resteAEncaisser)}`],
      ['Déboursé réel / engagé', fmtE(fi.reel.total), `budget ${fmtE(fi.budget.total)}`],
      ['Déboursé fin d\'affaire', fmtE(fi.pfa.total), `écart ${signeE(fi.budget.total - fi.pfa.total)}`],
      ['Marge brute fin d\'affaire', fmtE(fi.margePFA), `${pc(fi.tauxMargePFA)} (prévue ${pc(fi.tauxMargePrevue)})`]
    ], { columnStyles: { 1: { halign: 'right', fontStyle: 'bold' } } });
  }
  const zones = zonesDe(c.id);
  if (zones.length) {
    titre(`Avancement terrain par zone · ${t.faites} / ${t.total} tâches (${pc(t.pct)})`);
    table(['Zone', 'Faites', 'Total', 'Avancement', 'Reste à faire'], zones.map(z => {
      const ts = deCh(db.taches).filter(x => x.zone === z);
      const f = ts.filter(x => estFait(x.fait)).length;
      const reste = ts.filter(x => !estFait(x.fait)).map(x => x.tache);
      return [z, String(f), String(ts.length), pc(ts.length ? f / ts.length : 0), reste.slice(0, 4).join(', ') + (reste.length > 4 ? '...' : '')];
    }), { columnStyles: { 1: { halign: 'right' }, 2: { halign: 'right' }, 3: { halign: 'right' } } });
  }
  const ouvertes = deCh(db.reserves).filter(r => r.statut !== 'levée');
  if (ouvertes.length) {
    titre(`Réserves ouvertes (${ouvertes.length})`);
    table(['N°', 'Zone', 'Description', 'Origine', 'Responsable', 'Échéance'], ouvertes.map(r => [numeroReserve(r), r.zone, r.description, r.origine, r.responsable, fmtDate(r.echeance)]),
      { columnStyles: { 2: { cellWidth: 70 } } });
  }
  const js = deCh(db.journal).sort((a, b) => b.date.localeCompare(a.date)).slice(0, 10);
  if (js.length) {
    titre('Journal de chantier (10 dernières entrées)');
    table(['Date', 'Météo', 'Effectif', 'Observations'], js.map(j => [fmtDate(j.date), (j.meteo || '') + (j.intemperie ? ' (intempérie)' : ''), num(j.effectif) ? String(num(j.effectif)) : '', (j.cause ? j.cause + ' - ' : '') + (j.texte || '')]),
      { columnStyles: { 3: { cellWidth: 110 } } });
  }
  const n = doc.getNumberOfPages();
  for (let i = 1; i <= n; i++) {
    doc.setPage(i);
    doc.setDrawColor(...LIGNE); doc.line(M, 286, W - M, 286);
    doc.setFontSize(7.5); doc.setTextColor(...GRIS); doc.setFont('helvetica', 'normal');
    doc.text(pdfTxt(`OmSmK  ·  ${c.nom}`), M, 290.5);
    doc.text(pdfTxt(`Page ${i} / ${n}`), W - M, 290.5, { align: 'right' });
  }

  const nom = `Rapport_${c.nom.replace(/[^\w-]+/g, '_')}_${aujourdHui()}.pdf`;
  const blob = doc.output('blob');
  try {
    const file = new File([blob], nom, { type: 'application/pdf' });
    if (navigator.canShare && navigator.canShare({ files: [file] }) && /Android|iPhone|iPad/i.test(navigator.userAgent)) {
      await navigator.share({ files: [file], title: 'Rapport chantier', text: `Rapport d'avancement – ${c.nom}` });
      return;
    }
  } catch (e) { if (e.name === 'AbortError') return; }
  doc.save(nom);
}

/* ================================ QR codes =============================== */
let qrStream = null, qrTimer = null;
function urlZone(c, z) {
  return `${location.origin}${location.pathname}?c=${encodeURIComponent(c.nom)}&z=${encodeURIComponent(z)}`;
}

async function lancerScan() {
  ouvrirModal('Scanner une zone', `<video id="qrVideo" autoplay playsinline muted></video><p id="qrStatut" class="small muted" style="text-align:center;margin-top:10px">Accès à la caméra…</p>`,
    `<button class="btn" data-act="fermerModal">Fermer</button>`, { icone: 'scan-line', taille: 'narrow', sousTitre: 'Visez l\'étiquette QR collée sur la zone' });
  if (!('BarcodeDetector' in window)) {
    $('#qrStatut').innerHTML = 'Le scan intégré n\'est pas supporté par ce navigateur.<br>Scannez l\'étiquette avec l\'appareil photo du téléphone : le lien ouvre directement la bonne zone.';
    return;
  }
  try {
    qrStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
    const v = $('#qrVideo'); if (!v) return arreterScan();
    v.srcObject = qrStream; await v.play();
    $('#qrStatut').textContent = 'Visez le QR code de la zone…';
    const det = new BarcodeDetector({ formats: ['qr_code'] });
    qrTimer = setInterval(async () => {
      try {
        const v2 = $('#qrVideo'); if (!v2) return arreterScan();
        const codes = await det.detect(v2);
        if (codes.length) { const txt = codes[0].rawValue; fermerModal(); traiterCible(txt); }
      } catch (_e) { /* image pas prête */ }
    }, 350);
  } catch (e) { $('#qrStatut').textContent = 'Caméra inaccessible : ' + (e.message || e); }
}
function arreterScan() {
  clearInterval(qrTimer); qrTimer = null;
  if (qrStream) { qrStream.getTracks().forEach(t => t.stop()); qrStream = null; }
}

// Formats acceptés : URL ?c=…&z=… (ou chantier / zone / support), « Chantier|Zone », ou zone seule
function traiterCible(texte) {
  let cNom = '', zNom = String(texte || '').trim();
  try {
    if (/^https?:/i.test(zNom) || zNom.includes('?')) {
      const u = new URL(zNom, location.href);
      cNom = u.searchParams.get('c') || u.searchParams.get('chantier') || '';
      zNom = u.searchParams.get('z') || u.searchParams.get('zone') || u.searchParams.get('support') || '';
    } else if (zNom.includes('|')) { [cNom, zNom] = zNom.split('|').map(s => s.trim()); }
  } catch (_e) { /* texte brut */ }
  if (cNom) {
    const c = db.chantiers.find(x => x.id === cNom || norm(x.nom) === norm(cNom));
    if (!c) return toast(`Chantier « ${cNom} » introuvable sur cet appareil`, 'alerte');
    ui.chantierId = c.id;
  }
  if (zNom) {
    const z = zonesDe(ui.chantierId).find(x => norm(x) === norm(zNom));
    if (!z) { render(); return toast(`Zone « ${zNom} » introuvable`, 'alerte'); }
    ui.zone = z; ui.view = 'terrain'; ui.terrainMode = 'liste'; ui.filtreTache = '';
    toast(`Zone ${z}`, 'succes');
  }
  render();
}

function etiquettesQR() {
  const c = ch();
  const zones = zonesDe(c.id);
  if (!zones.length) return toast('Aucune zone : générez d\'abord la liste terrain.', 'alerte');
  if (typeof QRCode === 'undefined') return toast('Bibliothèque QR non chargée.', 'erreur');
  const html = `<div class="qr-sheet">${zones.map((z, i) => `<div class="qr-label"><div class="brand">OMSMK</div><div class="z">${esc(z)}</div><div class="qr-box" id="qrb_%P_${i}"></div><div class="c">${esc(c.nom)}</div></div>`).join('')}</div>`;
  $('#printArea').innerHTML = html.replace(/%P/g, 'p');
  ouvrirModal(`Étiquettes QR · ${zones.length} zones`, html.replace(/%P/g, 'm'),
    `<button class="btn" data-act="fermerModal">Fermer</button><button class="btn primary" data-act="imprimer">${icone('printer')}Imprimer</button>`, { taille: 'wide', icone: 'qr-code', sousTitre: 'Collez une étiquette par zone : le scan ouvre directement la saisie de la zone.' });
  zones.forEach((z, i) => ['p', 'm'].forEach(k => {
    const el = document.getElementById(`qrb_${k}_${i}`);
    if (el) new QRCode(el, { text: urlZone(c, z), width: 240, height: 240, correctLevel: QRCode.CorrectLevel.M });
  }));
}


/* ================== Documents : situation de travaux, commande ================== */
function enTeteDocument(doc, titre, sousTitre, droite) {
  const e = entreprise();
  const M = 14, W = 210;
  doc.setFillColor(14, 35, 64); doc.rect(0, 0, W, 4, 'F');
  doc.setFont('helvetica', 'bold'); doc.setFontSize(12); doc.setTextColor(16, 24, 40);
  doc.text(pdfTxt(e.nom || 'Entreprise'), M, 16);
  doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5); doc.setTextColor(102, 112, 133);
  const lignesE = [...String(e.adresse || '').split('\n'), e.siret ? 'SIRET ' + e.siret : '', e.contact].filter(Boolean);
  lignesE.forEach((l, i) => doc.text(pdfTxt(l), M, 21 + i * 4));
  doc.setFont('helvetica', 'bold'); doc.setFontSize(15); doc.setTextColor(14, 35, 64);
  doc.text(pdfTxt(titre), W - M, 16, { align: 'right' });
  doc.setFont('helvetica', 'normal'); doc.setFontSize(9.5); doc.setTextColor(232, 89, 12);
  doc.text(pdfTxt(sousTitre), W - M, 22, { align: 'right' });
  doc.setTextColor(102, 112, 133); doc.setFontSize(8.5);
  (droite || []).forEach((l, i) => doc.text(pdfTxt(l), W - M, 27 + i * 4, { align: 'right' }));
  return Math.max(21 + lignesE.length * 4, 27 + (droite || []).length * 4) + 6;
}

function cadre(doc, x, y, w, titre, lignes) {
  const h = 8 + lignes.length * 4.6;
  doc.setDrawColor(228, 232, 238); doc.setFillColor(248, 249, 251); doc.roundedRect(x, y, w, h, 1.5, 1.5, 'FD');
  doc.setFont('helvetica', 'bold'); doc.setFontSize(7.5); doc.setTextColor(102, 112, 133); doc.text(pdfTxt(titre.toUpperCase()), x + 4, y + 5.5);
  doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(16, 24, 40);
  lignes.forEach((l, i) => { if (i === 0) doc.setFont('helvetica', 'bold'); else doc.setFont('helvetica', 'normal'); doc.text(pdfTxt(l), x + 4, y + 10.5 + i * 4.6, { maxWidth: w - 8 }); });
  return h;
}

function piedDocument(doc, gauche) {
  const n = doc.getNumberOfPages();
  for (let i = 1; i <= n; i++) {
    doc.setPage(i);
    doc.setDrawColor(228, 232, 238); doc.line(14, 286, 196, 286);
    doc.setFontSize(7.5); doc.setTextColor(102, 112, 133);
    doc.text(pdfTxt(gauche), 14, 290.5);
    doc.text(pdfTxt(`Page ${i} / ${n}`), 196, 290.5, { align: 'right' });
  }
}

const STYLE_TABLE = {
  theme: 'plain', margin: { left: 14, right: 14 },
  styles: { font: 'helvetica', fontSize: 8.5, cellPadding: { top: 2.2, bottom: 2.2, left: 2, right: 2 }, textColor: [16, 24, 40], lineColor: [228, 232, 238], lineWidth: { bottom: 0.2 } },
  headStyles: { fillColor: [14, 35, 64], textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 7.5 },
  bodyStyles: { fillColor: [255, 255, 255] }
};

function recapitulatif(doc, y, lignes) {
  const x = 120, w = 76;
  lignes.forEach(([l, v, fort], i) => {
    const yy = y + i * 6;
    if (fort) { doc.setFillColor(14, 35, 64); doc.rect(x, yy - 4.2, w, 6.4, 'F'); doc.setTextColor(255, 255, 255); doc.setFont('helvetica', 'bold'); }
    else { doc.setTextColor(16, 24, 40); doc.setFont('helvetica', 'normal'); doc.setDrawColor(228, 232, 238); doc.line(x, yy + 2, x + w, yy + 2); }
    doc.setFontSize(9);
    doc.text(pdfTxt(l), x + 2, yy);
    doc.text(pdfTxt(v), x + w - 2, yy, { align: 'right' });
  });
  return y + lignes.length * 6;
}

function situationPDF(sitId) {
  const c = ch();
  if (!globalThis.jspdf) return toast('Bibliothèque PDF non chargée.', 'erreur');
  const { sit, prec, lignes, tot, pf } = calcSituation(db, c.id, sitId);
  if (!sit) return;
  const { jsPDF } = globalThis.jspdf;
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  let y = enTeteDocument(doc, `SITUATION DE TRAVAUX N° ${sit.numero}`, moisLong(sit.mois).replace(/^./, x => x.toUpperCase()),
    [`Établie le ${fmtDate(sit.date || aujourdHui())}`, prec ? `Précédente : n° ${prec.numero} (${moisLong(prec.mois)})` : 'Première situation']);
  const h1 = cadre(doc, 14, y, 88, 'Chantier', [c.nom, c.adresse || '', refsChantier(c, 'Imputation')].filter(Boolean));
  const h2 = cadre(doc, 108, y, 88, 'Maître d\'ouvrage', [c.client || '—', c.conducteur ? `Conducteur de travaux : ${c.conducteur}` : ''].filter(Boolean));
  y += Math.max(h1, h2) + 7;
  doc.autoTable(Object.assign({}, STYLE_TABLE, {
    startY: y,
    head: [['Code', 'Désignation', 'Montant HT', '% préc.', '% cumulé', 'Cumul HT', 'Mois HT'].map(pdfTxt)],
    body: lignes.map(l => [l.poste.code, l.poste.designation + (l.poste.avenant ? ' (avenant)' : ''), fmtE2(l.poste.montant), pc(l.pctPrec), pc(l.pct), fmtE2(l.cumul), fmtE2(l.mois)].map(pdfTxt))
      .concat([['', 'Total', fmtE2(tot.montant), pc(tot.montant ? tot.precedent / tot.montant : 0), pc(tot.pct), fmtE2(tot.cumul), fmtE2(tot.mois)].map(pdfTxt)]),
    columnStyles: { 0: { cellWidth: 14 }, 2: { halign: 'right' }, 3: { halign: 'right' }, 4: { halign: 'right' }, 5: { halign: 'right' }, 6: { halign: 'right', fontStyle: 'bold' } },
    didParseCell: d => { if (d.section === 'body' && d.row.index === lignes.length) { d.cell.styles.fontStyle = 'bold'; d.cell.styles.fillColor = [244, 246, 249]; } }
  }));
  y = doc.lastAutoTable.finalY + 10;
  if (y > 220) { doc.addPage(); y = 20; }
  const recap = [['Montant du marché HT', fmtE2(tot.montant)], ['Travaux cumulés HT', fmtE2(tot.cumul)], ['Situations précédentes HT', fmtE2(tot.precedent)], ['Montant de la situation HT', fmtE2(tot.mois)],
    [`Retenue de garantie ${fmt(pf.rg, 1)} %`, '- ' + fmtE2(tot.rg)]];
  if (pf.prorata) recap.push([`Compte prorata ${fmt(pf.prorata, 1)} %`, '- ' + fmtE2(tot.prorata)]);
  recap.push(['Net HT', fmtE2(tot.netHT)], [`TVA ${fmt(pf.tva, 1)} %${pf.tva ? '' : ' (autoliquidation)'}`, fmtE2(tot.tva)], ['NET À PAYER TTC', fmtE2(tot.ttc), true]);
  doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5); doc.setTextColor(102, 112, 133);
  doc.text(pdfTxt(`Avancement cumulé : ${pc(tot.pct)} du marché`), 14, y);
  const yFin = recapitulatif(doc, y, recap) + 14;
  const ySig = Math.min(yFin, 250);
  [['L\'entreprise', nomUser()], ['Visa du maître d\'œuvre', ''], ['Maître d\'ouvrage', '']].forEach(([t, n], i) => {
    const x = 14 + i * 62;
    doc.setDrawColor(205, 212, 222); doc.roundedRect(x, ySig, 58, 26, 1.5, 1.5);
    doc.setFontSize(7.5); doc.setTextColor(102, 112, 133); doc.text(pdfTxt(t.toUpperCase()), x + 3, ySig + 5);
    if (n) { doc.setFontSize(8.5); doc.setTextColor(16, 24, 40); doc.text(pdfTxt(n), x + 3, ySig + 10); }
    doc.setFontSize(7); doc.setTextColor(152, 162, 179); doc.text(pdfTxt('Date et signature'), x + 3, ySig + 23);
  });
  piedDocument(doc, `${entreprise().nom || 'OmSmK'}  ·  ${c.nom}  ·  Situation n° ${sit.numero}`);
  doc.save(`Situation_${String(sit.numero).padStart(2, '0')}_${sit.mois}_${c.nom.replace(/[^\w-]+/g, '_')}.pdf`);
  toast(`Situation n° ${sit.numero} générée`, 'succes');
}

function bonCommandePDF(cmdId) {
  const c = ch();
  const x = (db.commandes || []).find(k => k.id === cmdId);
  if (!x) return;
  if (!globalThis.jspdf) return toast('Bibliothèque PDF non chargée.', 'erreur');
  const { jsPDF } = globalThis.jspdf;
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  let y = enTeteDocument(doc, 'BON DE COMMANDE', `N° ${x.numero}`, [`Date : ${fmtDate(x.date) || fmtDate(aujourdHui())}`, x.categorie || '', (x.otp || otpDe(c)) ? `Imputation OTP ${x.otp || otpDe(c)}` : ''].filter(Boolean));
  const h1 = cadre(doc, 14, y, 88, 'Fournisseur', [x.fournisseur || '—']);
  const h2 = cadre(doc, 108, y, 88, 'Livraison', [c.nom, c.adresse || '', x.livraisonPrevue ? `Date souhaitée : ${fmtDate(x.livraisonPrevue)}` : '', c.chef ? `Contact chantier : ${c.chef}` : ''].filter(Boolean));
  y += Math.max(h1, h2) + 7;
  if (x.objet) { doc.setFont('helvetica', 'bold'); doc.setFontSize(10); doc.setTextColor(16, 24, 40); doc.text(pdfTxt('Objet : ' + x.objet), 14, y); y += 6; }
  const lignes = x.lignes || [];
  doc.autoTable(Object.assign({}, STYLE_TABLE, {
    startY: y,
    head: [['Désignation', 'Quantité', 'Unité', 'PU HT', 'Total HT'].map(pdfTxt)],
    body: lignes.map(l => [l.designation, fmt(num(l.quantite), num(l.quantite) % 1 ? 2 : 0), l.unite, fmtE2(num(l.pu)), fmtE2(num(l.quantite) * num(l.pu))].map(pdfTxt)),
    columnStyles: { 1: { halign: 'right' }, 3: { halign: 'right' }, 4: { halign: 'right', fontStyle: 'bold' } }
  }));
  y = doc.lastAutoTable.finalY + 10;
  const ht = montantCommande(x);
  y = recapitulatif(doc, y, [['Total HT', fmtE2(ht)], ['TVA 20 %', fmtE2(ht * 0.2)], ['TOTAL TTC', fmtE2(ht * 1.2), true]]) + 10;
  if (x.notes) { doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5); doc.setTextColor(71, 84, 103); doc.text(doc.splitTextToSize(pdfTxt('Conditions / remarques : ' + x.notes), 182), 14, y); y += 12; }
  doc.setFontSize(8); doc.setTextColor(102, 112, 133);
  doc.text(pdfTxt(`Merci de rappeler le n° ${x.numero} sur l'accusé de réception, le bon de livraison et la facture.`), 14, Math.min(y + 4, 262));
  doc.setDrawColor(205, 212, 222); doc.roundedRect(130, Math.min(y + 10, 252), 66, 26, 1.5, 1.5);
  doc.setFontSize(7.5); doc.text(pdfTxt('BON POUR COMMANDE'), 133, Math.min(y + 10, 252) + 5);
  doc.setFontSize(8.5); doc.setTextColor(16, 24, 40); doc.text(pdfTxt(nomUser()), 133, Math.min(y + 10, 252) + 10);
  piedDocument(doc, `${entreprise().nom || 'OmSmK'}  ·  ${c.nom}  ·  Commande ${x.numero}`);
  doc.save(`Commande_${String(x.numero).replace(/[^\w-]+/g, '_')}.pdf`);
  toast(`Bon de commande ${x.numero} généré`, 'succes');
}


/* ===================== Relevé d'heures hebdomadaire (PDF) ===================== */
function releveHeuresPDF(lun) {
  const c = ch();
  if (!globalThis.jspdf) return toast('Bibliothèque PDF non chargée.', 'erreur');
  const { jsPDF } = globalThis.jspdf;
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const jours = Array.from({ length: 7 }, (_, i) => addDays(lun, i));
  const syn = synthesePointage(db, c.id, lun, addDays(lun, 6));
  const visibles = syn.pointages.some(p => p.date >= jours[5]) ? jours : jours.slice(0, 5);
  const pointes = new Set(syn.pointages.map(p => p.compagnonId));
  const comps = compagnonsDe(c.id, true).filter(k => k.actif !== false || pointes.has(k.id));
  let y = enTeteDocument(doc, 'RELEVÉ D\'HEURES', `Semaine ${semISO(lun)} — du ${fmtDate(lun)} au ${fmtDate(addDays(lun, 6))}`,
    [`Établi le ${fmtDate(aujourdHui())}`, `${fmt(hjDe(c))} h par jour`]);
  const h1 = cadre(doc, 14, y, 88, 'Chantier', [c.nom, c.adresse || '', refsChantier(c, 'Imputation')].filter(Boolean));
  const h2 = cadre(doc, 108, y, 88, 'Encadrement', [c.conducteur ? `Conducteur de travaux : ${c.conducteur}` : 'Conducteur de travaux : —', c.chef ? `Chef de chantier : ${c.chef}` : ''].filter(Boolean));
  y += Math.max(h1, h2) + 7;
  const code = st => (STATUTS_POINTAGE.find(s => s[0] === st) || [])[2] || '';
  const lib = d => new Date(d + 'T00:00:00').toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric' }).replace('.', '');
  const corps = comps.map(k => {
    const pk = syn.parCompagnon[k.id] || { heures: 0, intemp: 0, paniers: 0 };
    return [nomCompagnon(k), k.qualification || '', ...visibles.map(d => {
      const p = syn.pointages.find(x => x.date === d && x.compagnonId === k.id);
      if (!p) return '';
      if (p.statut !== 'present') return code(p.statut) + (num(p.intemp) ? ` ${fmt(num(p.intemp))}` : '');
      return fmt(heuresPointage(p)) + (num(p.intemp) ? ` +${fmt(num(p.intemp))}I` : '');
    }), fmt(pk.heures), pk.intemp ? fmt(pk.intemp) : '', pk.paniers || ''].map(pdfTxt);
  });
  const totJour = d => syn.pointages.filter(p => p.date === d).reduce((t, p) => t + heuresPointage(p), 0);
  corps.push(['Total', '', ...visibles.map(d => totJour(d) ? fmt(totJour(d)) : ''), fmt(syn.tot.heures), syn.tot.intemp ? fmt(syn.tot.intemp) : '', syn.tot.paniers || ''].map(pdfTxt));
  const nb = visibles.length;
  const colonnes = { 0: { cellWidth: 38 }, 1: { cellWidth: 26, textColor: [102, 112, 133] } };
  for (let i = 0; i < nb + 3; i++) colonnes[i + 2] = { halign: 'right' };
  colonnes[nb + 2].fontStyle = 'bold';
  doc.autoTable(Object.assign({}, STYLE_TABLE, {
    startY: y,
    head: [['Compagnon', 'Qualification', ...visibles.map(lib), 'Heures', 'Intemp.', 'Paniers'].map(pdfTxt)],
    body: corps, columnStyles: colonnes,
    didParseCell: d => { if (d.section === 'body' && d.row.index === corps.length - 1) { d.cell.styles.fontStyle = 'bold'; d.cell.styles.fillColor = [244, 246, 249]; } }
  }));
  y = doc.lastAutoTable.finalY + 4;
  doc.setFontSize(7.5); doc.setTextColor(102, 112, 133);
  doc.text(pdfTxt('P présent · I intempéries · CP congés · M maladie · F formation · A absent. « +xI » : heures d\'intempéries en plus des heures travaillées.'), 14, y + 2);
  y += 10;
  if (syn.parPhase.length) {
    doc.autoTable(Object.assign({}, STYLE_TABLE, {
      startY: y,
      head: [['Ventilation par phase du BTE', 'Heures', 'Jours-homme'].map(pdfTxt)],
      body: syn.parPhase.map(p => [p.phase ? `${p.phase}${p.ouvrage ? ' - ' + p.ouvrage : ''}` : 'Non ventilé', fmt(p.heures), fmt(p.heures / hjDe(c), 1)].map(pdfTxt)),
      columnStyles: { 1: { halign: 'right', cellWidth: 30 }, 2: { halign: 'right', cellWidth: 30 } }
    }));
    y = doc.lastAutoTable.finalY + 10;
  }
  const obs = syn.pointages.filter(p => p.obs);
  if (obs.length) {
    if (y > 240) { doc.addPage(); y = 20; }
    doc.setFont('helvetica', 'bold'); doc.setFontSize(9); doc.setTextColor(16, 24, 40); doc.text(pdfTxt('Observations'), 14, y); y += 5;
    doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5); doc.setTextColor(71, 84, 103);
    obs.forEach(p => {
      const k = (db.compagnons || []).find(x => x.id === p.compagnonId);
      const l = doc.splitTextToSize(pdfTxt(`${fmtDate(p.date)} - ${k ? nomCompagnon(k) : ''} : ${p.obs}`), 182);
      doc.text(l, 14, y); y += l.length * 4.2;
    });
    y += 6;
  }
  if (y > 250) { doc.addPage(); y = 20; }
  [['Chef de chantier', c.chef || ''], ['Conducteur de travaux', c.conducteur || '']].forEach(([t, n], i) => {
    const x = 14 + i * 94;
    doc.setDrawColor(205, 212, 222); doc.roundedRect(x, y, 88, 26, 1.5, 1.5);
    doc.setFontSize(7.5); doc.setTextColor(102, 112, 133); doc.text(pdfTxt(t.toUpperCase()), x + 3, y + 5);
    if (n) { doc.setFontSize(8.5); doc.setTextColor(16, 24, 40); doc.text(pdfTxt(n), x + 3, y + 10); }
    doc.setFontSize(7); doc.setTextColor(152, 162, 179); doc.text(pdfTxt('Date et signature'), x + 3, y + 23);
  });
  piedDocument(doc, `${entreprise().nom || 'OmSmK'}  ·  ${c.nom}  ·  Relevé d'heures S${semISO(lun)}`);
  doc.save(`Releve_heures_S${String(semISO(lun)).padStart(2, '0')}_${lun.slice(0, 4)}_${c.nom.replace(/[^\w-]+/g, '_')}.pdf`);
  toast(`Relevé de la semaine ${semISO(lun)} généré`, 'succes');
}

/* ============================== Google Drive ============================= */
function vDrive() {
  const id = Drive.clientId();
  const origine = location.origin + location.pathname.replace(/[^/]*$/, '');
  if (!Drive.connecte()) {
    return `<div class="card"><div class="card-body">
      <div class="row" style="gap:14px;align-items:flex-start"><span class="kpi-ico" style="width:44px;height:44px">${icone('cloud', 'lg')}</span>
        <div class="grow"><h3>Enregistrer mes données sur Google Drive</h3>
          <p class="muted" style="margin-top:4px">Vos chantiers sont enregistrés dans le dossier <b>OmSmK</b> de votre Google Drive, avec une copie par jour conservée 30 jours.
            Le PC et le téléphone connectés au même compte Google retrouvent les mêmes données. Hors-ligne, l'application continue de fonctionner et envoie les saisies au retour du réseau.
            OmSmK n'a accès qu'aux fichiers qu'il a lui-même créés dans votre Drive.</p>
          ${id ? `<button class="btn primary" style="margin-top:14px" data-act="driveConnecter">${icone('cloud')}Connecter Google Drive</button>` : ''}</div></div></div>
      <div class="sep"></div>
      <div class="card-body"><div class="form-section" style="margin-top:0">${id ? 'Identifiant client Google' : 'Une étape à faire une seule fois : créer l\'identifiant client Google'}</div>
        ${id ? '' : `<ol class="small" style="margin:6px 0 12px 18px;line-height:1.7">
          <li>Ouvrez <a href="https://console.cloud.google.com/projectcreate" target="_blank" rel="noopener">console.cloud.google.com</a> avec votre compte Google et créez un projet (ex. « OmSmK »).</li>
          <li>Menu <b>API et services → Bibliothèque</b> : activez <b>Google Drive API</b>.</li>
          <li><b>Écran de consentement OAuth</b> : type <i>Externe</i>, nom « OmSmK », votre e-mail ; dans <b>Utilisateurs test</b>, ajoutez votre adresse Gmail.</li>
          <li><b>Identifiants → Créer des identifiants → ID client OAuth</b> : type <i>Application Web</i>, origine JavaScript autorisée : <code>${esc(location.origin)}</code></li>
          <li>Copiez l'<b>ID client</b> (se termine par <code>.apps.googleusercontent.com</code>) et collez-le ci-dessous.</li></ol>`}
        <div class="row" style="flex-wrap:nowrap"><input class="input" id="drvClient" value="${esc(id)}" placeholder="xxxxxxxx.apps.googleusercontent.com" aria-label="Identifiant client Google">
          <button class="btn ${id ? '' : 'primary'}" data-act="driveClientId">${icone('check')}Enregistrer</button></div>
        <p class="small muted" style="margin-top:8px">Adresse de l'application à autoriser : <code>${esc(origine)}</code></p></div></div>`;
  }
  const etat = { ok: ['pos', 'Enregistré'], encours: ['info', 'Synchronisation…'], erreur: ['neg', 'Erreur'], reconnexion: ['warn', 'Reconnexion nécessaire'], off: ['', 'Déconnecté'] }[Drive.etat] || ['', Drive.etat];
  const dossier = Drive._cfg.dossierId;
  setTimeout(afficherStockage, 0);
  return `<div class="card">
      <div class="set-row"><div class="row"><span class="kpi-ico" style="width:44px;height:44px">${icone('cloud', 'lg')}</span><div class="s-txt"><b>${esc(Drive.email() || 'Google Drive')}</b>
        <span><span class="badge ${etat[0]} dot">${etat[1]}</span> ${Drive.derniere || Drive._cfg.derniere ? `· dernière synchronisation ${new Date(Drive.derniere || Drive._cfg.derniere).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' })}` : ''}</span></div></div>
        ${Drive.etat === 'reconnexion' ? `<button class="btn primary" data-act="driveConnecter">${icone('refresh-cw')}Se reconnecter</button>` : `<button class="btn" data-act="driveSync">${icone('refresh-cw')}Synchroniser</button>`}</div>
      ${Drive.etat === 'erreur' ? `<div class="card-body"><div class="alert neg">${icone('triangle-alert')}<div>${esc(Drive.erreur)}</div></div></div>` : ''}
      <div class="set-row"><div class="s-txt"><b>Dossier OmSmK</b><span>Fichier <code>${DRIVE_FICHIER}</code> et sous-dossier <i>Sauvegardes</i> (une copie par jour, 30 jours).</span></div>${dossier ? `<a class="btn" href="https://drive.google.com/drive/folders/${esc(dossier)}" target="_blank" rel="noopener">${icone('external-link')}Ouvrir</a>` : ''}</div>
      <div class="set-row"><div class="s-txt"><b>Revenir à une copie datée</b><span>Remplace les données par celles d'un jour précédent ; la version actuelle reste dans les copies.</span></div><button class="btn" data-act="driveCopies">${icone('undo-2')}Choisir une copie</button></div>
      <div class="set-row"><div class="s-txt"><b>Déconnecter</b><span>Les données restent sur l'appareil et sur votre Drive.</span></div><button class="btn ghost" data-act="driveDeconnecter">${icone('log-out')}Déconnecter</button></div>
      <div class="set-row"><div class="s-txt"><b>Stockage sur l'appareil</b><span id="drvStock">…</span></div></div></div>`;
}
async function afficherStockage() {
  const z = $('#drvStock');
  if (!z || !navigator.storage || !navigator.storage.estimate) return;
  const e = await navigator.storage.estimate();
  z.textContent = `${fmt((e.usage || 0) / 1048576, 1)} Mo utilisés sur ${fmt((e.quota || 0) / 1073741824, 1)} Go disponibles (données et photos)`;
}

Object.assign(ACT, {
  driveClientId: () => {
    const v = val('drvClient');
    if (v && !/\.apps\.googleusercontent\.com$/.test(v)) return toast('L\'identifiant client doit se terminer par .apps.googleusercontent.com', 'alerte');
    Drive.definirClientId(v); render(); toast(v ? 'Identifiant enregistré : vous pouvez connecter Google Drive' : 'Identifiant effacé', 'succes');
  },
  driveConnecter: async () => {
    try { await Drive.connecter(); render(); toast(`Google Drive connecté${Drive.email() ? ' : ' + Drive.email() : ''}`, 'succes'); }
    catch (e) { console.error(e); toast('Connexion à Google Drive impossible : ' + (e.message || e), 'erreur'); render(); }
  },
  driveSync: async () => { await Drive.synchroniser(); render(); if (Drive.etat === 'ok') toast('Données enregistrées sur Google Drive', 'succes'); },
  driveDeconnecter: async () => {
    if (!await confirmer('Déconnecter Google Drive', 'Les saisies ne seront plus enregistrées sur votre Drive. Les données restent sur cet appareil et sur le Drive.', { ok: 'Déconnecter' })) return;
    Drive.deconnecter(); render();
  },
  driveCopies: async () => {
    try {
      const copies = await Drive.listerCopies();
      if (!copies.length) return toast('Aucune copie datée pour l\'instant.', 'alerte');
      ouvrirModal('Revenir à une copie datée', `<div class="stack">${copies.map(c => `<button class="menu-lien" data-act="driveRestaurer" data-id="${esc(c.id)}" data-n="${esc(c.name)}">${icone('calendar', 'sm')}${esc(fmtDate(c.name.replace(/^omsmk_|\.json$/g, ''), true))}</button>`).join('')}</div>`,
        '<button class="btn" data-act="fermerModal">Fermer</button>', { icone: 'undo-2', taille: 'narrow' });
    } catch (e) { toast(e.message || String(e), 'erreur'); }
  },
  driveRestaurer: async el => {
    if (!await confirmer('Revenir à cette copie', `Les données de tous vos chantiers seront remplacées par la copie du <b>${esc(fmtDate(el.dataset.n.replace(/^omsmk_|\.json$/g, ''), true))}</b>, puis enregistrées sur le Drive.`, { ok: 'Remplacer', danger: true })) return;
    try {
      const d = await Drive.lireCopie(el.dataset.id);
      if (!d || !Array.isArray(d.chantiers)) throw new Error('Copie illisible');
      db = Object.assign(dbVide(), d); ui.chantierId = null;
      save(); fermerModal(); render(); toast('Copie restaurée', 'succes');
    } catch (e) { toast('Restauration impossible : ' + (e.message || e), 'erreur'); }
  }
});
