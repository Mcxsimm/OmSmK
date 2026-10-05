/* ==========================================================================
   OmSmK — RAF projet par OTP (modèle de la saisie du RAF projet SAP)
   Le code OTP relie le chantier au pointage, aux commandes client et
   fournisseurs et à la facturation. Chaque mois : réel par poste, reste à
   faire (RAF), fin d'affaire, CA mérité, FAE / PCA, marge, lissage mensuel.
   Coûts réels : import de l'état SAP « postes individuels de coûts réels ».
   ========================================================================== */
// deno-lint-ignore-file no-unused-vars
'use strict';

const NATURES_KEY = 'omsmk_natures';
// Règles nature comptable → poste : défauts du plan comptable + règles ajoutées sur cet appareil
const reglesNatures = () => Object.assign({}, NATURES_RAF_DEFAUT, lireJSON(NATURES_KEY, {}));
const libPosteRAF = k => (POSTES_RAF.find(p => p[0] === k) || [k, k])[1];
const moisCourt = m => new Date(m + '-01T00:00:00').toLocaleDateString('fr-FR', { month: 'short', year: 'numeric' }).replace('.', '');
// Références du chantier pour l'en-tête des documents : OTP et n° d'affaire / imputation
const refsChantier = (c, lib = 'Affaire') => [otpDe(c) ? `OTP ${otpDe(c)}` : '', c.imputation ? `${lib} ${c.imputation}` : ''].filter(Boolean).join('  ·  ');
const badgeOTP = c => otpDe(c) ? `<span class="badge brand">OTP ${esc(otpDe(c))}</span>` : '';
const rafDe = c => { c.raf = c.raf || {}; c.raf.postes = c.raf.postes || {}; return c.raf; };
const cellE = n => Math.abs(n) < 0.005 ? '<span class="muted">0</span>' : fmtE(n);
const NB_MOIS_VISIBLES = 6;

function vRAF(c) {
  const onglet = ui.rafOnglet || 'raf';
  const mois = ui.rafMois || aujourdHui().slice(0, 7);
  const couts = (db.couts || []).filter(k => k.chantierId === c.id);
  const entete = enTetePage({ eyebrow: 'Gestion financière', titre: 'RAF projet', sous: [otpDe(c) ? sousInfo('database', `OTP ${otpDe(c)}`) : '<span class="badge warn">OTP à renseigner</span>', sousInfo('briefcase', c.nom)],
    actions: `<button class="btn" data-act="coutsImport">${icone('upload')}Importer les coûts SAP</button><button class="btn" data-act="rafExcel">${icone('file-spreadsheet')}Excel</button>` });
  const seg = `<div class="row" style="margin-bottom:16px;justify-content:space-between">
    <div class="seg"><button class="${onglet === 'raf' ? 'on' : ''}" data-act="rafOnglet" data-t="raf">${icone('calculator', 'sm')}Saisie du RAF</button>
      <button class="${onglet === 'couts' ? 'on' : ''}" data-act="rafOnglet" data-t="couts">${icone('list', 'sm')}Coûts réels <span class="n">${couts.length}</span></button></div>
    <label class="row small" style="gap:6px">Période <input type="month" class="input" style="width:auto" value="${mois}" data-change="rafMois" aria-label="Période du RAF"></label></div>`;
  const sansOTP = otpDe(c) ? '' : `<div class="alert warn" style="margin-bottom:16px">${icone('triangle-alert')}<div>Renseignez le <b>code OTP</b> du chantier (fiche chantier) : il sert à rattacher les coûts SAP importés, et figure sur les commandes, situations et relevés d'heures.
    <div style="margin-top:8px"><button class="btn sm" data-act="chantierEdit" data-id="${esc(c.id)}">${icone('pencil', 'sm')}Fiche chantier</button></div></div></div>`;
  return entete + seg + sansOTP + (onglet === 'couts' ? vCoutsReels(c, mois) : vSaisieRAF(c, mois));
}

function vSaisieRAF(c, mois) {
  const r = calcRAF(db, c.id, mois, reglesNatures());
  const raf = rafDe(c);
  const lien = rattachementsOTP(db, c.id);
  const visibles = r.horizon.slice(0, NB_MOIS_VISIBLES);
  const otp = `<div class="card"><div class="card-head"><h3>${icone('database')}Rattaché à l'OTP ${esc(otpDe(c) || '—')}</h3>
      <label class="row small" style="gap:6px">Coûts réels <select class="input" style="width:auto" data-change="rafSource" aria-label="Source des coûts réels">${[['auto', `Automatique (${r.source === 'sap' ? 'SAP' : 'OmSmK'})`], ['sap', 'Coûts SAP importés'], ['omsmk', 'Pointage + commandes OmSmK']]
        .map(([v, l]) => `<option value="${v}" ${(raf.source || 'auto') === v ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select></label></div>
    <div class="resume r4" style="border-width:1px 0 0;border-radius:0">
      <div class="row-link" data-nav="pointage"><span>Pointage</span><b>${fmt(lien.pointage.heures, 0)} h</b><small>${lien.pointage.n} journée(s) compagnon · ${fmtE(lien.pointage.heures * num(c.tauxHoraire))}</small></div>
      <div class="row-link" data-nav="commandes"><span>Commandes fournisseurs</span><b>${fmtE(lien.commandes.montant)}</b><small>${lien.commandes.n} commande(s) engagée(s)</small></div>
      <div class="row-link" data-nav="situations"><span>Facturation</span><b>${fmtE(lien.facturation.montant)}</b><small>${lien.facturation.n} situation(s) émise(s)</small></div>
      <div class="row-link" data-act="rafOnglet" data-t="couts"><span>Coûts réels SAP</span><b>${lien.couts.n ? fmtE(lien.couts.montant) : '—'}</b><small>${lien.couts.n ? `${lien.couts.n} poste(s) individuel(s) · jusqu'au ${fmtDate(lien.couts.dernier)}` : 'aucun import'}</small></div>
    </div></div>`;
  const champE = (k, v, lib) => `<input class="input cell" style="width:120px;text-align:right;border-color:var(--border-strong);background:var(--surface)" type="number" step="any" value="${v ? Math.round(v * 100) / 100 : ''}" data-change="rafCA" data-k="${k}" aria-label="${esc(lib)}">`;
  const ligne = (lib, v, extra = '') => `<dt>${lib}</dt><dd class="${extra}">${v}</dd>`;
  const entete = `<div class="grid g-3">
    <div class="card"><div class="card-head"><h3>Contrat</h3></div><div class="card-body"><dl class="dl">
      ${ligne('Commande initiale', fmtE2(r.ca.initial))}${ligne('Avenants', fmtE2(r.ca.avenants))}${ligne('Commande', `<b>${fmtE2(r.ca.commande)}</b>`)}
      ${ligne('Reste à obtenir', champE('resteAObtenir', r.ca.resteAObtenir, 'Reste à obtenir'))}
      ${ligne('Commande potentielle', `${fmtE2(r.ca.potentiel)}<div class="sub">devis émis en attente</div>`)}
      ${ligne('CA fin d\'affaire', `<b>${fmtE2(r.ca.fin)}</b>`)}</dl></div></div>
    <div class="card"><div class="card-head"><h3>Résultat</h3></div><div class="card-body"><dl class="dl">
      ${ligne(`Facturation ${moisCourt(mois)}`, fmtE2(r.ca.factureM))}${ligne('Facturation cumulée', fmtE2(r.ca.factureCumul))}
      ${ligne('Avancement (coûts)', pc(r.avancement))}${ligne('CA mérité', `<b>${fmtE2(r.ca.merite)}</b>`)}
      ${ligne('Marge brute cumulée', `${fmtE2(r.marge.cumul)}<div class="sub">${pc(r.marge.tauxCumul)} du CA mérité</div>`, r.marge.cumul < 0 ? 'neg' : '')}
      ${ligne('Marge fin d\'affaire', `<b>${fmtE2(r.marge.fin)}</b><div class="sub">${pc(r.marge.tauxFin)} · prévu ${pc(r.marge.tauxPrevu)}</div>`, r.marge.fin < 0 ? 'neg' : '')}</dl></div></div>
    <div class="card"><div class="card-head"><h3>Écritures comptables</h3></div><div class="card-body"><dl class="dl">
      ${ligne('FAE <span class="muted small">(factures à établir)</span>', fmtE2(r.fae), r.fae ? 'warn' : '')}
      ${ligne('PCA <span class="muted small">(produits constatés d\'avance)</span>', fmtE2(r.pca))}</dl>
      <p class="small muted" style="margin-top:10px">CA mérité = CA fin d'affaire × réel cumulé ÷ coûts fin d'affaire. FAE si le CA mérité dépasse la facturation cumulée, PCA dans le cas contraire.</p>
      ${!r.rafSaisi && r.tot.reelCumul ? `<div class="alert warn">${icone('triangle-alert')}<div>RAF non saisi : l'avancement est compté à 100 % des coûts engagés.</div></div>` : ''}</div></div>
  </div>`;
  const inp = (k, v, attrs, lib) => `<input class="input cell" style="width:100px;text-align:right;border-color:var(--border-strong);background:var(--surface)" type="number" step="any" value="${v ? Math.round(v * 100) / 100 : ''}" ${attrs} aria-label="${esc(lib)}">`;
  const tableau = `<div class="card"><div class="card-head"><h3>RAF par poste — ${esc(moisLong(mois))}</h3>
      <div class="row"><button class="btn sm" data-act="rafProposer">${icone('sparkles', 'sm')}Proposer (budget restant)</button><button class="btn sm" data-act="rafLisser">${icone('calendar-range', 'sm')}Lisser jusqu'à la fin</button>
        <button class="btn sm ${r.valide ? '' : 'primary'}" data-act="rafValider">${icone(r.valide ? 'circle-check' : 'check', 'sm')}${r.valide ? 'RAF validé — revalider' : 'Valider le RAF du mois'}</button></div></div>
    <div class="table-wrap"><table class="table">
      <thead><tr><th>Poste</th><th class="num">Réel ${esc(moisCourt(mois))}</th><th class="num">Réel exercice</th><th class="num">Réel cumulé</th><th class="num">Budget</th><th class="num">Reste à faire</th><th class="num">Fin d'affaire</th><th class="num">Écart / budget</th><th class="num">Reste à répartir</th>
        ${visibles.map(m => `<th class="num">${esc(moisCourt(m))}</th>`).join('')}</tr></thead>
      <tbody>
        <tr class="sous-total"><td class="strong">CA mérité</td><td></td><td></td><td class="num strong">${fmtE(r.ca.merite)}</td><td class="num">${fmtE(r.ca.commande)}</td><td class="num">${fmtE(r.ca.fin - r.ca.merite)}</td><td class="num strong">${fmtE(r.ca.fin)}</td><td></td><td></td>${visibles.map(() => '<td></td>').join('')}</tr>
        ${r.postes.map(p => `<tr><td style="white-space:nowrap"><div class="strong">${esc(p.lib)}</div><div class="sub">${r.ca.merite ? pc(p.reelCumul / r.ca.merite) + ' du CA mérité' : ''}</div></td>
          <td class="num">${cellE(p.reelM)}</td><td class="num">${cellE(p.reelExercice)}</td><td class="num strong">${cellE(p.reelCumul)}</td>
          <td class="num">${inp(p.k, p.budget, `data-change="rafBudget" data-k="${p.k}"`, `Budget ${p.lib}`)}</td>
          <td class="num">${inp(p.k, p.raf, `data-change="rafPoste" data-k="${p.k}"`, `Reste à faire ${p.lib}`)}</td>
          <td class="num strong">${cellE(p.fin)}</td><td class="num ${cls(p.ecart)}">${signeE(p.ecart)}</td>
          <td class="num ${Math.abs(p.aRepartir) > 0.5 ? 'warn' : ''}">${cellE(p.aRepartir)}</td>
          ${visibles.map(m => `<td class="num">${inp(p.k, p.repartition[m], `data-change="rafMoisPoste" data-k="${p.k}" data-m="${m}"`, `${p.lib} ${moisCourt(m)}`)}</td>`).join('')}</tr>`).join('')}
        <tr class="total"><td>Total coûts</td><td class="num">${fmtE(r.tot.reelM)}</td><td class="num">${fmtE(r.tot.reelExercice)}</td><td class="num">${fmtE(r.tot.reelCumul)}</td><td class="num">${fmtE(r.tot.budget)}</td><td class="num">${fmtE(r.tot.raf)}</td><td class="num">${fmtE(r.tot.fin)}</td><td class="num ${cls(r.tot.ecart)}">${signeE(r.tot.ecart)}</td><td class="num">${fmtE(r.tot.aRepartir)}</td>
          ${visibles.map(m => `<td class="num">${fmtE(r.tot.mois[m])}</td>`).join('')}</tr>
        <tr><td class="strong">Marge brute</td><td></td><td></td><td class="num strong ${r.marge.cumul < 0 ? 'neg' : ''}">${fmtE(r.marge.cumul)}</td><td class="num">${fmtE(r.marge.prevue)}</td><td></td><td class="num strong ${r.marge.fin < 0 ? 'neg' : ''}">${fmtE(r.marge.fin)}</td><td class="num ${cls(r.marge.fin - r.marge.prevue)}">${signeE(r.marge.fin - r.marge.prevue)}</td><td></td>${visibles.map(() => '<td></td>').join('')}</tr>
        <tr><td class="strong">Marge brute (%)</td><td></td><td></td><td class="num">${pc(r.marge.tauxCumul)}</td><td class="num">${pc(r.marge.tauxPrevu)}</td><td></td><td class="num strong">${pc(r.marge.tauxFin)}</td><td></td><td></td>${visibles.map(() => '<td></td>').join('')}</tr>
      </tbody></table></div>
    <div class="card-foot small muted">Réel ${r.source === 'sap' ? 'issu des coûts SAP importés (postes individuels, classés par nature comptable)' : 'issu d\'OmSmK : heures pointées × taux horaire, commandes fournisseurs engagées'}. Fin d'affaire = réel cumulé + reste à faire. Les montants mensuels lissent le RAF ; « reste à répartir » = RAF − mois saisis.</div></div>`;
  const hist = Object.entries(raf.historique || {}).sort((a, b) => b[0].localeCompare(a[0]));
  const historique = hist.length ? `<div class="card"><div class="card-head"><h3>RAF validés</h3><span class="hint">évolution de la fin d'affaire mois après mois</span></div>
    <div class="table-wrap"><table class="table"><thead><tr><th>Période</th><th class="num">Réel cumulé</th><th class="num">Reste à faire</th><th class="num">Coûts fin d'affaire</th><th class="num">CA fin d'affaire</th><th class="num">Marge fin d'affaire</th><th>Validé</th></tr></thead><tbody>
      ${hist.map(([m, h], i) => { const prec = hist[i + 1] && hist[i + 1][1]; return `<tr><td class="strong">${esc(moisLong(m))}</td><td class="num">${fmtE(h.reelCumul)}</td><td class="num">${fmtE(h.raf)}</td><td class="num">${fmtE(h.fin)}</td><td class="num">${fmtE(h.caFin)}</td>
        <td class="num strong ${h.margeFin < 0 ? 'neg' : ''}">${fmtE(h.margeFin)} <span class="muted">(${pc(h.caFin ? h.margeFin / h.caFin : 0)})</span>${prec ? `<div class="sub ${cls(h.margeFin - prec.margeFin)}">${signeE(h.margeFin - prec.margeFin)} vs ${esc(moisCourt(hist[i + 1][0]))}</div>` : ''}</td>
        <td class="small muted">${fmtDate(h.le)}${h.par ? ` · ${esc(h.par)}` : ''}</td></tr>`; }).join('')}</tbody></table></div></div>` : '';
  return `<div class="stack">${otp}${entete}${tableau}${historique}</div>`;
}

function vCoutsReels(c, mois) {
  const regles = reglesNatures();
  const tous = (db.couts || []).filter(k => k.chantierId === c.id).sort((a, b) => b.date.localeCompare(a.date) || String(a.piece).localeCompare(String(b.piece)));
  const filtreP = ui.coutsPoste || '', filtreM = ui.coutsMois || '';
  const liste = tous.filter(k => (!filtreP || posteCout(k, regles) === filtreP) && (!filtreM || k.date.slice(0, 7) === filtreM));
  const parPoste = POSTES_RAF.map(([k, lib]) => [k, lib, tous.filter(x => posteCout(x, regles) === k).reduce((t, x) => t + num(x.montant), 0)]);
  const natures = [...new Set(tous.filter(k => !k.poste).map(k => k.nature).filter(Boolean))].sort();
  const sansRegle = natures.filter(n => !Object.keys(regles).some(p => n.startsWith(p)));
  const moisDispo = [...new Set(tous.map(k => k.date.slice(0, 7)))].sort().reverse();
  if (!tous.length) {
    return `<div class="card">${vide('database', 'Aucun coût réel importé', `Dans SAP, affichez les <b>postes individuels de coûts réels</b> de l'OTP ${esc(otpDe(c) || '')} (Afficher postes indiv. cts réels pour projets), exportez la liste en Excel (ou fichier local), puis importez-la ici. Les coûts sont rattachés au chantier par l'élément d'OTP et classés par nature comptable dans les postes du RAF.`,
      `<button class="btn primary" data-act="coutsImport">${icone('upload')}Importer l'export SAP</button><button class="btn" data-act="coutNew">${icone('plus')}Saisir un coût</button>`)}</div>`;
  }
  const synthese = `<div class="card"><div class="card-head"><h3>Coûts réels par poste</h3><span class="hint">${tous.length} poste(s) individuel(s) · cliquez pour filtrer</span></div>
    <div class="table-wrap"><table class="table"><tbody>${parPoste.map(([k, lib, m]) => `<tr class="row-link" data-act="coutsFiltre" data-p="${filtreP === k ? '' : k}" style="${filtreP === k ? 'box-shadow:inset 3px 0 0 var(--brand-2)' : ''}"><td class="strong">${esc(lib)}</td><td class="num">${cellE(m)}</td></tr>`).join('')}
      <tr class="total"><td>Total</td><td class="num">${fmtE(parPoste.reduce((t, x) => t + x[2], 0))}</td></tr></tbody></table></div></div>`;
  const reglesCarte = `<div class="card"><div class="card-head"><h3>Natures comptables → postes</h3><span class="hint">règle au préfixe le plus long</span></div>
    <div class="table-wrap"><table class="table"><thead><tr><th>Nature</th><th>Poste du RAF</th><th class="num">Montant</th></tr></thead><tbody>
      ${natures.map(n => { const m = tous.filter(k => k.nature === n && !k.poste).reduce((t, k) => t + num(k.montant), 0); return `<tr><td class="strong">${esc(n)}${sansRegle.includes(n) ? ' <span class="badge warn">sans règle</span>' : ''}</td>
        <td><select class="input" style="width:auto" data-change="natureRegle" data-n="${esc(n)}" aria-label="Poste de la nature ${esc(n)}">${POSTES_RAF.map(([k, lib]) => `<option value="${k}" ${classerNature(n, regles) === k ? 'selected' : ''}>${esc(lib)}</option>`).join('')}</select></td>
        <td class="num">${fmtE(m)}</td></tr>`; }).join('') || '<tr><td colspan="3" class="muted">Aucune nature comptable dans les coûts importés.</td></tr>'}</tbody></table></div>
    <div class="card-foot small muted">Les natures sans règle vont en « Autres dépenses ». Une règle choisie ici s'applique à tous les chantiers de cet appareil.</div></div>`;
  const table = `<div class="card"><div class="card-head"><h3>Postes individuels</h3>
      <div class="row"><select class="input" style="width:auto" data-change="coutsMois" aria-label="Filtrer par mois"><option value="">Tous les mois</option>${moisDispo.map(m => `<option value="${m}" ${filtreM === m ? 'selected' : ''}>${esc(moisLong(m))}</option>`).join('')}</select>
        ${filtreP ? `<button class="btn sm ghost" data-act="coutsFiltre" data-p="">${icone('x', 'sm')}${esc(libPosteRAF(filtreP))}</button>` : ''}
        <button class="btn sm" data-act="coutNew">${icone('plus', 'sm')}Coût</button><button class="btn sm ghost" data-act="coutsVider">${icone('trash-2', 'sm')}Vider</button></div></div>
    <div class="table-wrap"><table class="table"><thead><tr><th>Date de valeur</th><th>Elt d'OTP</th><th>Nature</th><th>Poste</th><th>Libellé / fournisseur</th><th>Doc. achat</th><th>N° pièce</th><th class="num">Montant</th><th></th></tr></thead><tbody>
      ${liste.slice(0, 500).map(k => `<tr><td>${fmtDate(k.date)}</td><td class="muted">${esc(k.otp)}</td><td>${esc(k.nature)}</td>
        <td><select class="input" style="width:auto;height:28px" data-change="coutPoste" data-id="${esc(k.id)}" aria-label="Poste">${POSTES_RAF.map(([p, lib]) => `<option value="${p}" ${posteCout(k, regles) === p ? 'selected' : ''}>${esc(lib)}</option>`).join('')}</select>${k.poste ? '<div class="sub">forcé</div>' : ''}</td>
        <td>${esc(k.libelle || '')}${k.fournisseur ? `<div class="sub">${esc(k.fournisseur)}${k.codeFournisseur ? ` · ${esc(k.codeFournisseur)}` : ''}</div>` : ''}</td>
        <td class="muted">${esc(k.docAchat || '')}</td><td class="muted">${esc(k.piece || '')}</td><td class="num strong ${num(k.montant) < 0 ? 'neg' : ''}">${fmtE2(k.montant)}</td>
        <td class="actions">${k.source === 'manuel' ? `<button class="btn ghost icon sm" data-act="coutSuppr" data-id="${esc(k.id)}" aria-label="Supprimer">${icone('trash-2', 'sm')}</button>` : ''}</td></tr>`).join('')}
      <tr class="total"><td colspan="7">Total${filtreP || filtreM ? ' filtré' : ''} (${liste.length})</td><td class="num">${fmtE2(liste.reduce((t, k) => t + num(k.montant), 0))}</td><td></td></tr></tbody></table></div>
    ${liste.length > 500 ? '<div class="card-foot small muted">500 premières lignes affichées ; filtrez par mois ou par poste.</div>' : ''}</div>`;
  return `<div class="stack"><div class="grid g-2">${synthese}${reglesCarte}</div>${table}</div>`;
}

/* ------------------------------ Import SAP ------------------------------- */
async function importerCoutsSAP(file) {
  let rows;
  if (/\.(csv|txt)$/i.test(file.name)) rows = tableauTexte(await file.text());
  else {
    if (typeof XLSX === 'undefined') throw new Error('Bibliothèque Excel non chargée.');
    const wb = XLSX.read(await file.arrayBuffer(), { type: 'array', cellDates: true });
    rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, raw: true, defval: '' });
  }
  const lignes = lireCoutsSAP(rows);
  if (!lignes.length) throw new Error('Aucune ligne de coût trouvée.');
  const c = ch();
  const otps = [...new Set(lignes.map(l => l.otp).filter(Boolean))];
  // Chantier sans OTP et fichier mono-OTP : on propose de lui attribuer cet OTP
  if (!otpDe(c) && otps.length) {
    const racine = otps.reduce((a, b) => { let i = 0; while (i < a.length && a[i] === b[i]) i++; return a.slice(0, i); }).replace(/[-./_]+$/, '');
    if (racine && await confirmer('Code OTP du chantier', `Le fichier porte l'OTP <b>${esc(racine)}</b>. L'attribuer au chantier « ${esc(c.nom)} » ?`, { ok: 'Attribuer' })) c.otp = racine;
  }
  db.couts = db.couts || [];
  const parChantier = new Map();
  let ignores = 0;
  lignes.forEach(l => {
    const cible = l.otp ? db.chantiers.find(x => otpCorrespond(otpDe(x), l.otp)) : (otpDe(c) ? null : c);
    const dest = cible || (!l.otp ? c : null);
    if (!dest) { ignores++; return; }
    if (!parChantier.has(dest.id)) parChantier.set(dest.id, []);
    parChantier.get(dest.id).push(l);
  });
  if (!parChantier.size) throw new Error(`Aucune ligne ne correspond à l'OTP d'un chantier (${otps.slice(0, 3).join(', ')}${otps.length > 3 ? '…' : ''}).`);
  let n = 0;
  parChantier.forEach((ls, cid) => {
    // Un nouvel import remplace les coûts SAP de la même période (dates couvertes par le fichier)
    const du = ls.reduce((m, l) => l.date < m ? l.date : m, '9999'), au = ls.reduce((m, l) => l.date > m ? l.date : m, '');
    const forces = new Map(db.couts.filter(k => k.chantierId === cid && k.poste && k.source === 'sap').map(k => [k.cle, k.poste]));
    db.couts = db.couts.filter(k => !(k.chantierId === cid && k.source === 'sap' && k.date >= du && k.date <= au));
    const vus = {};
    ls.forEach(l => {
      const base = [l.otp, l.date, l.nature, l.piece, l.docAchat, l.montant, l.libelle].join('|');
      vus[base] = (vus[base] || 0) + 1;
      const cle = base + '|' + vus[base];
      db.couts.push(Object.assign({ id: 'sap|' + cid + '|' + empreinte(cle) + vus[base], cle, chantierId: cid, source: 'sap', importeLe: aujourdHui() }, l, forces.has(cle) ? { poste: forces.get(cle) } : {}));
      n++;
    });
  });
  if (rafDe(c).source === 'omsmk' && parChantier.has(c.id)) delete c.raf.source;
  save(); render();
  toast(`${n} coût(s) importé(s)${parChantier.size > 1 ? ` sur ${parChantier.size} chantiers` : ''}${ignores ? ` · ${ignores} ligne(s) d'un autre OTP ignorée(s)` : ''}`, 'succes');
}

function modalCout() {
  const c = ch();
  ouvrirModal('Saisir un coût réel', `<div class="form-grid">
      ${champ('ktDate', 'Date de valeur', aujourdHui(), 'date')}${champ('ktMontant', 'Montant (€)', '', 'number', 'step="any"')}
      ${selectHTML('ktPoste', 'Poste du RAF', POSTES_RAF, 'fournitures')}${champ('ktNature', 'Nature comptable', '')}
      ${champ('ktLib', 'Libellé', '')}${champ('ktFourn', 'Fournisseur', '')}${champ('ktPiece', 'N° de pièce', '')}${champ('ktOtp', 'Élément d\'OTP', otpDe(c))}</div>`,
    `<button class="btn" data-act="fermerModal">Annuler</button><button class="btn primary" data-act="coutSave">Enregistrer</button>`, { icone: 'coins', taille: 'narrow' });
}

function rafExcel() {
  const c = ch();
  if (typeof XLSX === 'undefined') return toast('Bibliothèque Excel non chargée.', 'erreur');
  const mois = ui.rafMois || aujourdHui().slice(0, 7);
  const r = calcRAF(db, c.id, mois, reglesNatures());
  const aoa = [
    ['RAF projet', c.nom], ['OTP', otpDe(c)], ['Période', moisLong(mois)], [],
    ['Commande initiale', r.ca.initial], ['Avenants', r.ca.avenants], ['Commande', r.ca.commande], ['Reste à obtenir', r.ca.resteAObtenir], ['CA fin d\'affaire', r.ca.fin],
    ['Facturation du mois', r.ca.factureM], ['Facturation cumulée', r.ca.factureCumul], ['CA mérité', r.ca.merite], ['FAE', r.fae], ['PCA', r.pca], [],
    ['Poste', 'Réel M', 'Réel exercice', 'Réel cumulé', 'Budget', 'Reste à faire', 'Fin d\'affaire', 'Écart / budget', 'Reste à répartir', ...r.horizon.map(moisCourt)],
    ...r.postes.map(p => [p.lib, p.reelM, p.reelExercice, p.reelCumul, p.budget, p.raf, p.fin, p.ecart, p.aRepartir, ...r.horizon.map(m => p.repartition[m])]),
    ['Total coûts', r.tot.reelM, r.tot.reelExercice, r.tot.reelCumul, r.tot.budget, r.tot.raf, r.tot.fin, r.tot.ecart, r.tot.aRepartir, ...r.horizon.map(m => r.tot.mois[m])],
    ['Marge brute', '', '', r.marge.cumul, r.marge.prevue, '', r.marge.fin],
    ['Marge brute (%)', '', '', r.marge.tauxCumul, r.marge.tauxPrevu, '', r.marge.tauxFin]
  ];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(aoa), 'RAF');
  const couts = (db.couts || []).filter(k => k.chantierId === c.id);
  if (couts.length) {
    const regles = reglesNatures();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['Date de valeur', 'Elt d\'OTP', 'Nature', 'Poste', 'Libellé', 'Fournisseur', 'Doc. achat', 'N° pièce', 'Montant'],
      ...couts.map(k => [k.date, k.otp, k.nature, libPosteRAF(posteCout(k, regles)), k.libelle, k.fournisseur, k.docAchat, k.piece, num(k.montant)])]), 'Coûts réels');
  }
  XLSX.writeFile(wb, `RAF_${(otpDe(c) || c.nom).replace(/[^\w-]+/g, '_')}_${mois}.xlsx`);
}

Object.assign(ACT, {
  rafOnglet: el => { ui.rafOnglet = el.dataset.t; if (ui.view !== 'raf') ui.view = 'raf'; saveUI(); render(); },
  rafProposer: async () => {
    const c = ch(), mois = ui.rafMois || aujourdHui().slice(0, 7);
    const r = calcRAF(db, c.id, mois, reglesNatures());
    if (r.rafSaisi && !await confirmer('Proposer le RAF', 'Le reste à faire de chaque poste sera remplacé par le budget restant (budget − réel cumulé ; main d\'œuvre projetée d\'après le suivi hebdomadaire).', { ok: 'Remplacer' })) return;
    const prop = rafPropose(r, calcFinances(db, c.id).pfa.mo);
    const raf = rafDe(c);
    Object.entries(prop).forEach(([k, v]) => { raf.postes[k] = Object.assign(raf.postes[k] || {}, { raf: v }); });
    save(); render(); toast('RAF proposé d\'après le budget restant', 'succes');
  },
  rafLisser: () => {
    const c = ch(), mois = ui.rafMois || aujourdHui().slice(0, 7);
    const r = calcRAF(db, c.id, mois, reglesNatures());
    const finCh = (c.dateFin || '').slice(0, 7);
    const cibles = r.horizon.filter(m => !finCh || m <= finCh);
    const liste = cibles.length ? cibles : r.horizon.slice(0, 1);
    const raf = rafDe(c);
    r.postes.forEach(p => {
      const e = raf.postes[p.k] = raf.postes[p.k] || {};
      e.mois = Object.fromEntries(Object.entries(e.mois || {}).filter(([m]) => m <= mois));
      if (p.raf) Object.assign(e.mois, repartirLineaire(p.raf, liste));
    });
    save(); render(); toast(`RAF lissé sur ${liste.length} mois${finCh ? ` (jusqu'à ${moisLong(liste[liste.length - 1])})` : ''}`, 'succes');
  },
  rafValider: () => {
    const c = ch(), mois = ui.rafMois || aujourdHui().slice(0, 7);
    const r = calcRAF(db, c.id, mois, reglesNatures());
    const raf = rafDe(c);
    raf.historique = raf.historique || {};
    raf.historique[mois] = { reelCumul: r.tot.reelCumul, raf: r.tot.raf, fin: r.tot.fin, caFin: r.ca.fin, caMerite: r.ca.merite, margeFin: r.marge.fin, fae: r.fae, pca: r.pca, postes: Object.fromEntries(r.postes.map(p => [p.k, { reel: p.reelCumul, raf: p.raf }])), le: aujourdHui(), par: nomUser() };
    save(); render(); toast(`RAF de ${moisLong(mois)} validé`, 'succes');
  },
  rafExcel: () => rafExcel(),
  coutsImport: () => {
    const inp = document.createElement('input');
    inp.type = 'file'; inp.accept = '.xlsx,.xls,.csv,.txt';
    inp.onchange = async () => {
      const f = inp.files[0]; if (!f) return;
      try { await importerCoutsSAP(f); ui.rafOnglet = 'couts'; ui.view = 'raf'; render(); } catch (e) { console.error(e); toast('Import impossible : ' + (e.message || e), 'erreur'); }
    };
    inp.click();
  },
  coutsFiltre: el => { ui.coutsPoste = el.dataset.p; render(); },
  coutNew: () => modalCout(),
  coutSave: () => {
    if (!val('ktDate') || !val('ktMontant')) return toast('Date et montant obligatoires.', 'alerte');
    db.couts = db.couts || [];
    db.couts.push({ id: uid(), chantierId: ui.chantierId, source: 'manuel', date: val('ktDate'), montant: num(val('ktMontant')), poste: val('ktPoste'), nature: val('ktNature'), libelle: val('ktLib'), fournisseur: val('ktFourn'), piece: val('ktPiece'), otp: val('ktOtp'), par: nomUser() });
    save(); fermerModal(); render(); toast('Coût enregistré', 'succes');
  },
  coutSuppr: el => { db.couts = (db.couts || []).filter(k => k.id !== el.dataset.id); save(); render(); },
  coutsVider: async () => {
    if (!await confirmer('Vider les coûts réels', 'Tous les coûts importés et saisis de ce chantier seront supprimés. Le RAF repassera sur le pointage et les commandes d\'OmSmK.', { ok: 'Vider', danger: true })) return;
    db.couts = (db.couts || []).filter(k => k.chantierId !== ui.chantierId); save(); render();
  }
});

Object.assign(CHG, {
  rafMois: el => { if (/^\d{4}-\d{2}$/.test(el.value)) { ui.rafMois = el.value; saveUI(); render(); } },
  rafSource: el => { const raf = rafDe(ch()); if (el.value === 'auto') delete raf.source; else raf.source = el.value; save(); render(); },
  rafCA: el => { rafDe(ch())[el.dataset.k] = num(el.value); save(); render(); },
  rafPoste: el => { const raf = rafDe(ch()); raf.postes[el.dataset.k] = Object.assign(raf.postes[el.dataset.k] || {}, { raf: num(el.value) }); save(); render(); },
  rafBudget: el => { const raf = rafDe(ch()); const p = raf.postes[el.dataset.k] = raf.postes[el.dataset.k] || {}; if (el.value === '') delete p.budget; else p.budget = num(el.value); save(); render(); },
  rafMoisPoste: el => {
    const raf = rafDe(ch());
    const p = raf.postes[el.dataset.k] = raf.postes[el.dataset.k] || {};
    p.mois = p.mois || {};
    if (el.value === '') delete p.mois[el.dataset.m]; else p.mois[el.dataset.m] = num(el.value);
    save(); render();
  },
  coutsMois: el => { ui.coutsMois = el.value; render(); },
  coutPoste: el => {
    const k = (db.couts || []).find(x => x.id === el.dataset.id);
    if (!k) return;
    if (el.value === classerNature(k.nature, reglesNatures())) delete k.poste; else k.poste = el.value;
    save(); render();
  },
  natureRegle: el => {
    const r = lireJSON(NATURES_KEY, {});
    r[el.dataset.n] = el.value;
    try { localStorage.setItem(NATURES_KEY, JSON.stringify(r)); } catch (_e) { /* ignoré */ }
    render(); toast(`Nature ${el.dataset.n} → ${libPosteRAF(el.value)}`, 'succes');
  }
});
