/* ==========================================================================
   OmSmK — gestion financière : synthèse, situations mensuelles (MOE),
   commandes et achats.
   ========================================================================== */
// deno-lint-ignore-file no-unused-vars
'use strict';

const libStatut = (liste, v) => (liste.find(s => s[0] === v) || [v, v])[1];
const CLS_STATUT_CMD = { brouillon: '', commandee: 'info', confirmee: 'info', partielle: 'warn', livree: 'pos', facturee: 'pos', annulee: 'neg' };
const CLS_STATUT_SIT = { brouillon: '', transmise: 'info', validee: 'brand', facturee: 'warn', payee: 'pos' };
const moisLong = m => m ? new Date(m + '-01T00:00:00').toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' }) : '';
const ENTREPRISE_KEY = 'omsmk_entreprise';
const entreprise = () => lireJSON(ENTREPRISE_KEY, { nom: '', adresse: '', siret: '', contact: '' });

/* =========================== Synthèse financière ========================= */
function vFinances(c) {
  const f = calcFinances(db, c.id);
  const pts = serieFinanciere(db, c.id);
  const ecartMarge = f.margePFA - f.margePrevue;
  const entete = enTetePage({ eyebrow: 'Gestion financière', titre: 'Synthèse financière', sous: [sousInfo('briefcase', c.nom), c.client ? sousInfo('building-2', c.client) : ''],
    actions: `<button class="btn" data-nav="situations">${icone('receipt')}Situations</button><button class="btn" data-nav="commandes">${icone('shopping-cart')}Commandes</button><button class="btn primary" data-act="rapportPDF">${icone('file-text')}Rapport PDF</button>` });
  if (!f.ca) {
    return entete + `<div class="card">${vide('wallet', 'Montant du marché non renseigné',
      'Saisissez la décomposition du marché (DPGF) ou au minimum le montant HT du marché pour suivre la facturation et la marge.',
      `<button class="btn primary" data-act="finOngletMarche">${icone('receipt')}Décomposition du marché</button><button class="btn" data-act="chantierEdit" data-id="${esc(c.id)}">${icone('pencil')}Montant du marché</button>`)}</div>`;
  }
  const kpis = `<div class="kpis">
    <div class="card kpi"><div class="kpi-top"><span class="kpi-lbl">Chiffre d'affaires</span><span class="kpi-ico">${icone('briefcase')}</span></div>
      <div class="kpi-val">${fmtE(f.ca)}</div><div class="kpi-sub">${f.avenants ? `dont avenants ${fmtE(f.avenants)}` : 'marché de base, sans avenant'}</div></div>
    <div class="card kpi"><div class="kpi-top"><span class="kpi-lbl">Facturé cumulé HT</span><span class="kpi-ico">${icone('receipt')}</span></div>
      <div class="kpi-val">${fmtE(f.facture)}</div><div style="margin-top:10px">${barre(f.avFinancier, 'lg')}</div>
      <div class="kpi-sub">${pc(f.avFinancier)} du CA · avancement physique ${pc(f.avPhysique)}</div></div>
    <div class="card kpi"><div class="kpi-top"><span class="kpi-lbl">Déboursé à date</span><span class="kpi-ico">${icone('coins')}</span></div>
      <div class="kpi-val">${fmtE(f.reel.total)}</div><div style="margin-top:10px">${barre(f.budget.total ? f.reel.total / f.budget.total : 0, 'lg')}</div>
      <div class="kpi-sub">sur ${fmtE(f.budget.total)} de budget déboursé</div></div>
    <div class="card kpi"><div class="kpi-top"><span class="kpi-lbl">Marge fin d'affaire</span><span class="kpi-ico">${icone('scale')}</span></div>
      <div class="kpi-val ${f.margePFA < 0 ? 'neg' : ''}">${fmtE(f.margePFA)}</div>
      <div class="kpi-sub">${pc(f.tauxMargePFA)} · ${deltaE(ecartMarge)} vs prévu (${pc(f.tauxMargePrevue)})</div></div>
  </div>`;
  const lignes = [['Main d\'œuvre', 'mo', 'hard-hat', 'heures pointées × taux horaire'], ...CATEGORIES_ACHAT.map(cat => [cat, CLE_BUDGET[cat], { 'Matériaux': 'package', 'Sous-traitance': 'users', 'Matériel': 'truck', 'Divers': 'layers' }[cat], 'commandes engagées'])];
  const tableau = `<div class="card"><div class="card-head"><h3>Déboursé par poste de dépense</h3><span class="hint">Budget BTE · réel ou engagé · prévision fin d'affaire</span></div>
    <div class="table-wrap"><table class="table">
      <thead><tr><th>Poste</th><th class="num">Budget</th><th class="num">Réel / engagé</th><th class="num">Consommé</th><th class="num">Fin d'affaire</th><th class="num">Écart</th></tr></thead>
      <tbody>${lignes.map(([lib, k, ic, sub]) => {
        const e = f.budget[k] - f.pfa[k];
        return `<tr><td><div class="row" style="gap:10px;flex-wrap:nowrap"><span class="kpi-ico" style="width:28px;height:28px">${icone(ic, 'sm')}</span><div><div class="strong">${lib}</div><div class="sub">${sub}</div></div></div></td>
          <td class="num">${k === 'mo' ? fmtE(f.budget.mo) : `<input class="input cell" style="width:110px;border-color:var(--border-strong);background:var(--surface)" type="number" step="any" value="${num((c.budget || {})[k]) || ''}" data-change="budgetPoste" data-k="${k}" aria-label="Budget ${lib}">`}</td>
          <td class="num">${fmtE(f.reel[k])}</td>
          <td class="num"><div style="width:90px;margin-left:auto">${barre(f.budget[k] ? f.reel[k] / f.budget[k] : 0, f.reel[k] > f.budget[k] && f.budget[k] ? '' : '')}</div><div class="sub">${f.budget[k] ? pc(f.reel[k] / f.budget[k]) : '—'}</div></td>
          <td class="num">${fmtE(f.pfa[k])}</td>
          <td class="num strong ${cls(e)}">${signeE(e)}</td></tr>`;
      }).join('')}
      <tr class="total"><td>Total déboursé</td><td class="num">${fmtE(f.budget.total)}</td><td class="num">${fmtE(f.reel.total)}</td><td class="num">${f.budget.total ? pc(f.reel.total / f.budget.total) : '—'}</td><td class="num">${fmtE(f.pfa.total)}</td><td class="num ${cls(f.budget.total - f.pfa.total)}">${signeE(f.budget.total - f.pfa.total)}</td></tr>
      <tr><td class="strong">Marge brute</td><td class="num">${fmtE(f.margePrevue)}<div class="sub">${pc(f.tauxMargePrevue)}</div></td><td></td><td></td><td class="num strong ${f.margePFA < 0 ? 'neg' : ''}">${fmtE(f.margePFA)}<div class="sub">${pc(f.tauxMargePFA)}</div></td><td class="num strong ${cls(ecartMarge)}">${signeE(ecartMarge)}</td></tr>
      </tbody></table></div>
    <div class="card-foot small muted">Fin d'affaire : main d'œuvre projetée d'après le suivi hebdomadaire ; achats = le plus élevé entre budget et engagé. Budgets d'achats importés depuis la synthèse du BTE ou saisis ici.</div></div>`;
  const courbe = `<div class="card"><div class="card-head"><h3>Facturation et dépenses cumulées</h3>
      <div class="legend"><span><i style="background:var(--serie-1)"></i>Facturé HT</span><span style="color:var(--serie-2)"><i class="dash"></i><span style="color:var(--text-2)">Dépenses (MO + achats)</span></span></div></div>
    <div class="card-body">${pts.length > 0 ? graphique('finances', w => courbesMensuelles(pts, [{ cle: 'facture', lib: 'Facturé', couleur: 's1' }, { cle: 'depenses', lib: 'Dépenses', couleur: 's2', tirets: true }], w)) : '<p class="muted">Aucune donnée mensuelle pour l\'instant.</p>'}</div></div>`;
  const encaissements = `<div class="card"><div class="card-head"><h3>Facturation et encaissements</h3></div><div class="card-body"><dl class="dl">
      <dt>Facturé TTC (situations émises)</dt><dd>${fmtE(f.factureTTC)}</dd>
      <dt>Encaissé TTC</dt><dd class="pos">${fmtE(f.encaisseTTC)}</dd>
      <dt>Reste à encaisser</dt><dd class="${f.resteAEncaisser > 0 ? 'neg' : ''}">${fmtE(f.resteAEncaisser)}</dd>
      <dt>Retenues de garantie cumulées</dt><dd>${fmtE(f.rgCumul)}</dd>
      <dt>Reste à facturer HT</dt><dd>${fmtE(f.ca - f.facture)}</dd>
    </dl></div>
    <div class="card-foot"><div class="small muted" style="margin-bottom:6px">Avancement physique vs facturé</div>
      <div class="row small" style="flex-wrap:nowrap"><span style="width:70px" class="muted">Physique</span><span class="grow">${barre(f.avPhysique)}</span><b style="width:44px;text-align:right">${pc(f.avPhysique)}</b></div>
      <div class="row small" style="flex-wrap:nowrap;margin-top:6px"><span style="width:70px" class="muted">Facturé</span><span class="grow">${barre(f.avFinancier, 'pos')}</span><b style="width:44px;text-align:right">${pc(f.avFinancier)}</b></div>
      ${f.avFinancier + 0.05 < f.avPhysique ? `<div class="alert warn" style="margin-top:10px">${icone('triangle-alert')}<div>Retard de facturation : ${pc(f.avPhysique - f.avFinancier)} d'avancement non facturé (≈ ${fmtE((f.avPhysique - f.avFinancier) * f.ca)}).</div></div>` : ''}</div></div>`;
  return entete + `<div class="stack">${kpis}<div class="grid g-main">${courbe}${encaissements}</div>${tableau}</div>`;
}

/* ========================== Situations mensuelles ======================== */
function vSituations(c) {
  const onglet = ui.sitOnglet || 'situations';
  const sits = situationsDe(db, c.id);
  const postes = postesDe(db, c.id);
  const pf = parametresFinanciers(c);
  const entete = enTetePage({ eyebrow: 'Gestion financière', titre: 'Situations mensuelles', sous: [sousInfo('receipt', `${sits.length} situation(s)`), sousInfo('briefcase', fmtE(postes.reduce((t, p) => t + num(p.montant), 0)) + ' HT')],
    actions: `<button class="btn primary" data-act="sitNew">${icone('file-plus')}Nouvelle situation</button>` });
  const seg = `<div class="seg" style="margin-bottom:16px">
    <button class="${onglet === 'situations' ? 'on' : ''}" data-act="sitOnglet" data-t="situations">${icone('receipt', 'sm')}Situations <span class="n">${sits.length}</span></button>
    <button class="${onglet === 'marche' ? 'on' : ''}" data-act="sitOnglet" data-t="marche">${icone('list', 'sm')}Marché & avenants <span class="n">${(db.postes || []).filter(p => p.chantierId === c.id).length}</span></button></div>`;

  if (onglet === 'marche') {
    const reels = (db.postes || []).filter(p => p.chantierId === c.id);
    const total = postes.reduce((t, p) => t + num(p.montant), 0);
    const base = postes.filter(p => !p.avenant).reduce((t, p) => t + num(p.montant), 0);
    return entete + seg + `<div class="stack">
      <div class="card"><div class="card-head"><h3>Décomposition du prix global et forfaitaire</h3>
        <div class="row"><button class="btn sm" data-act="dpgfImport">${icone('upload', 'sm')}Importer (CSV / Excel)</button><button class="btn sm" data-act="posteNew" data-av="1">${icone('plus', 'sm')}Avenant / TS</button><button class="btn sm primary" data-act="posteNew" data-av="0">${icone('plus', 'sm')}Poste</button></div></div>
        ${reels.length ? `<div class="table-wrap"><table class="table"><thead><tr><th>Code</th><th>Désignation</th><th>Type</th><th class="num">Montant HT</th><th></th></tr></thead><tbody>
          ${postes.map(p => `<tr><td class="muted">${esc(p.code)}</td><td class="strong">${esc(p.designation)}</td><td>${p.avenant ? '<span class="badge accent">Avenant</span>' : '<span class="badge">Marché</span>'}</td>
            <td class="num">${fmtE(p.montant)}</td><td class="actions"><button class="btn ghost icon sm" data-act="posteEdit" data-id="${esc(p.id)}" aria-label="Modifier">${icone('pencil', 'sm')}</button><button class="btn ghost icon sm" data-act="posteSuppr" data-id="${esc(p.id)}" aria-label="Supprimer">${icone('trash-2', 'sm')}</button></td></tr>`).join('')}
          <tr class="total"><td colspan="3">Total marché${total !== base ? ` <span class="muted" style="font-weight:500">(base ${fmtE(base)} + avenants ${fmtE(total - base)})</span>` : ''}</td><td class="num">${fmtE(total)}</td><td></td></tr></tbody></table></div>`
        : vide('list', 'Aucune décomposition saisie', `${num(c.marcheHT) ? `Les situations utilisent pour l'instant une ligne unique « Marché de base » de ${fmtE(c.marcheHT)}. ` : ''}Saisissez les postes de la DPGF pour facturer poste par poste, et les avenants / travaux supplémentaires.`,
          `<button class="btn primary" data-act="posteNew" data-av="0">${icone('plus')}Ajouter un poste</button><button class="btn" data-act="dpgfImport">${icone('upload')}Importer</button>`)}</div>
      <div class="card"><div class="card-head"><h3>Conditions de facturation</h3></div>
        <div class="card-body"><div class="form-grid" style="grid-template-columns:repeat(auto-fill,minmax(150px,1fr))">
          ${champ('pfRg', 'Retenue de garantie (%)', pf.rg, 'number', 'step="0.5" data-change="paramFin" data-k="rg"')}
          ${champ('pfPro', 'Compte prorata (%)', pf.prorata, 'number', 'step="0.1" data-change="paramFin" data-k="prorata"')}
          ${champ('pfTva', 'TVA (%)', pf.tva, 'number', 'step="0.1" data-change="paramFin" data-k="tva"')}
          ${champ('pfDelai', 'Délai de paiement (jours)', pf.delai, 'number', 'step="1" data-change="paramFin" data-k="delai"')}
        </div><p class="small muted">Appliqués au montant HT de chaque situation. TVA à 0 % en cas d'autoliquidation (sous-traitance).</p></div></div>
    </div>`;
  }

  if (!postes.length) {
    return entete + seg + `<div class="card">${vide('receipt', 'Marché à décomposer', 'Saisissez la décomposition du marché (ou le montant HT du marché dans la fiche chantier) avant d\'établir les situations.',
      `<button class="btn primary" data-act="sitOnglet" data-t="marche">${icone('list')}Décomposition du marché</button>`)}</div>`;
  }
  if (!sits.length) {
    return entete + seg + `<div class="card">${vide('receipt', 'Aucune situation', 'Chaque mois, établissez la situation de travaux : avancement cumulé par poste, montant du mois, retenue de garantie, TVA. Elle se transmet au maître d\'œuvre en PDF.',
      `<button class="btn primary" data-act="sitNew">${icone('file-plus')}Première situation</button>`)}</div>`;
  }
  if (!sits.find(s => s.id === ui.situationId)) ui.situationId = sits[sits.length - 1].id;
  const liste = `<div class="card"><div class="table-wrap"><table class="table"><thead><tr><th>N°</th><th>Mois</th><th class="num">Cumul HT</th><th class="num">Avancement</th><th class="num">Montant du mois HT</th><th class="num">Net TTC</th><th>Statut</th><th></th></tr></thead><tbody>
    ${sits.slice().reverse().map(s => {
      const t = calcSituation(db, c.id, s.id).tot;
      return `<tr class="row-link" data-act="sitOuvrir" data-id="${esc(s.id)}" style="${s.id === ui.situationId ? 'box-shadow:inset 3px 0 0 var(--brand-2)' : ''}">
        <td class="strong">n° ${esc(s.numero)}</td><td>${esc(moisLong(s.mois))}</td><td class="num">${fmtE(t.cumul)}</td><td class="num">${pc(t.pct)}</td><td class="num strong">${fmtE(t.mois)}</td><td class="num">${fmtE(t.ttc)}</td>
        <td><span class="badge ${CLS_STATUT_SIT[s.statut] || ''} dot">${esc(libStatut(STATUTS_SITUATION, s.statut))}</span></td>
        <td class="actions"><button class="btn ghost icon sm" data-act="sitPDF" data-id="${esc(s.id)}" aria-label="PDF">${icone('file-text', 'sm')}</button></td></tr>`;
    }).join('')}</tbody></table></div></div>`;
  return entete + seg + `<div class="stack">${liste}${editeurSituation(c, ui.situationId)}</div>`;
}

function editeurSituation(c, sitId) {
  const { sit, prec, lignes, tot, pf } = calcSituation(db, c.id, sitId);
  if (!sit) return '';
  const fige = ['facturee', 'payee'].includes(sit.statut);
  const etapes = STATUTS_SITUATION.map(([v, l], i) => {
    const iCour = STATUTS_SITUATION.findIndex(s => s[0] === sit.statut);
    return `<span class="badge ${i < iCour ? 'pos' : i === iCour ? 'brand' : ''}">${i < iCour ? icone('check') : ''}${esc(l)}</span>`;
  }).join(icone('chevron-right', 'sm'));
  const suivant = { brouillon: ['transmise', 'send', 'Transmettre au MOE'], transmise: ['validee', 'file-check', 'Validée par le MOE'], validee: ['facturee', 'receipt', 'Marquer facturée'], facturee: ['payee', 'hand-coins', 'Marquer payée'] }[sit.statut];
  return `<div class="card">
    <div class="card-head"><div><h3>Situation n° ${esc(sit.numero)} — ${esc(moisLong(sit.mois))}</h3><div class="row small muted" style="margin-top:6px;gap:4px">${etapes}</div></div>
      <div class="row">${sit.statut !== 'brouillon' ? `<button class="btn sm ghost" data-act="sitStatut" data-id="${esc(sit.id)}" data-s="${STATUTS_SITUATION[Math.max(0, STATUTS_SITUATION.findIndex(s => s[0] === sit.statut) - 1)][0]}">${icone('undo-2', 'sm')}Revenir</button>` : `<button class="btn sm ghost" data-act="sitSuppr" data-id="${esc(sit.id)}">${icone('trash-2', 'sm')}Supprimer</button>`}
        <button class="btn sm" data-act="sitPDF" data-id="${esc(sit.id)}">${icone('file-text', 'sm')}PDF</button>
        ${suivant ? `<button class="btn sm primary" data-act="sitStatut" data-id="${esc(sit.id)}" data-s="${suivant[0]}">${icone(suivant[1], 'sm')}${suivant[2]}</button>` : ''}</div></div>
    ${fige ? `<div class="card-body" style="padding-bottom:0"><div class="alert info">${icone('lock')}<div>Situation ${sit.statut === 'payee' ? 'payée' : 'facturée'} : les avancements sont figés. « Revenir » pour corriger.</div></div></div>` : ''}
    <div class="table-wrap"><table class="table"><thead><tr><th>Poste</th><th class="num">Montant HT</th><th class="num">% précédent</th><th class="num">% cumulé</th><th class="num">Cumul HT</th><th class="num">Mois HT</th></tr></thead><tbody>
      ${lignes.map(l => `<tr><td><span class="muted">${esc(l.poste.code)}</span> <span class="strong">${esc(l.poste.designation)}</span>${l.poste.avenant ? ' <span class="badge accent">Avenant</span>' : ''}</td>
        <td class="num">${fmtE2(l.poste.montant)}</td><td class="num muted">${pc(l.pctPrec)}</td>
        <td class="num">${fige ? pc(l.pct) : `<div class="row" style="justify-content:flex-end;flex-wrap:nowrap;gap:4px"><input class="input cell" style="width:76px;border-color:var(--border-strong);background:var(--surface)" type="number" min="0" max="100" step="1" value="${Math.round(l.pct * 1000) / 10}" data-change="sitPct" data-s="${esc(sit.id)}" data-p="${esc(l.poste.id)}" aria-label="% cumulé ${esc(l.poste.designation)}"><span class="muted">%</span></div>`}</td>
        <td class="num">${fmtE2(l.cumul)}</td><td class="num strong ${l.mois < 0 ? 'neg' : ''}">${fmtE2(l.mois)}</td></tr>`).join('')}
      <tr class="total"><td>Total</td><td class="num">${fmtE2(tot.montant)}</td><td class="num">${prec ? pc(tot.montant ? tot.precedent / tot.montant : 0) : '0 %'}</td><td class="num">${pc(tot.pct)}</td><td class="num">${fmtE2(tot.cumul)}</td><td class="num">${fmtE2(tot.mois)}</td></tr>
    </tbody></table></div>
    <div class="card-body" style="border-top:1px solid var(--border)"><div class="grid g-2">
      <div class="small muted">${!fige ? `<button class="btn sm" data-act="sitReprendre" data-id="${esc(sit.id)}">${icone('gauge', 'sm')}Reprendre l'avancement physique (${pc(calcSuivi(db, c.id).tot.pct)})</button><p style="margin-top:8px">Applique le % d'avancement pondéré du suivi hebdomadaire à tous les postes, à ajuster ensuite poste par poste.</p>` : ''}
        ${sit.transmiseLe ? `<p>Transmise le ${fmtDate(sit.transmiseLe)}</p>` : ''}${sit.valideeLe ? `<p>Validée le ${fmtDate(sit.valideeLe)}</p>` : ''}${sit.payeeLe ? `<p>Payée le ${fmtDate(sit.payeeLe)}</p>` : ''}</div>
      <dl class="dl">
        <dt>Montant du mois HT</dt><dd>${fmtE2(tot.mois)}</dd>
        <dt>Retenue de garantie (${fmt(pf.rg, 1)} %)</dt><dd>− ${fmtE2(tot.rg)}</dd>
        ${pf.prorata ? `<dt>Compte prorata (${fmt(pf.prorata, 1)} %)</dt><dd>− ${fmtE2(tot.prorata)}</dd>` : ''}
        <dt>Net HT</dt><dd>${fmtE2(tot.netHT)}</dd>
        <dt>TVA (${fmt(pf.tva, 1)} %)</dt><dd>${fmtE2(tot.tva)}</dd>
        <dt class="strong" style="color:var(--text)">Net à payer TTC</dt><dd style="font-size:17px;font-weight:700">${fmtE2(tot.ttc)}</dd>
      </dl></div></div>
  </div>`;
}

/* ============================ Commandes & achats ========================= */
function vCommandes(c) {
  const toutes = (db.commandes || []).filter(x => x.chantierId === c.id);
  const filtre = ui.cmdFiltre || 'toutes';
  const auj = aujourdHui();
  const enRetard = x => commandeEngagee(x) && !commandeLivree(x) && x.livraisonPrevue && x.livraisonPrevue < auj;
  const liste = toutes.filter(x => filtre === 'toutes' || (filtre === 'encours' && ['brouillon', 'commandee', 'confirmee', 'partielle'].includes(x.statut)) || (filtre === 'alivrer' && commandeEngagee(x) && !commandeLivree(x)) || (filtre === 'livrees' && commandeLivree(x)))
    .sort((a, b) => (b.date || '').localeCompare(a.date || '') || String(b.numero).localeCompare(String(a.numero)));
  const engage = toutes.filter(commandeEngagee).reduce((t, x) => t + montantCommande(x), 0);
  const budgetAchats = CATEGORIES_ACHAT.reduce((t, cat) => t + num((c.budget || {})[CLE_BUDGET[cat]]), 0);
  const aLivrer = toutes.filter(x => commandeEngagee(x) && !commandeLivree(x));
  const retard = toutes.filter(enRetard);
  const entete = enTetePage({ eyebrow: 'Gestion financière', titre: 'Commandes & achats', sous: [sousInfo('shopping-cart', `${toutes.length} commande(s)`)],
    actions: `<button class="btn primary" data-act="cmdNew">${icone('plus')}Nouvelle commande</button>` });
  const kpis = `<div class="card mini-stats">
    <div><div class="ms-lbl">${icone('coins', 'sm')}Engagé HT</div><div class="ms-val">${fmtE(engage)}</div><div class="xs muted">${budgetAchats ? pc(engage / budgetAchats) + ' du budget achats' : 'budget achats non renseigné'}</div></div>
    <div><div class="ms-lbl">${icone('wallet', 'sm')}Budget achats</div><div class="ms-val">${fmtE(budgetAchats)}</div><div class="xs muted">reste ${fmtE(budgetAchats - engage)}</div></div>
    <div><div class="ms-lbl">${icone('truck', 'sm')}À livrer</div><div class="ms-val">${aLivrer.length}</div><div class="xs muted">${fmtE(aLivrer.reduce((t, x) => t + montantCommande(x), 0))}</div></div>
    <div><div class="ms-lbl">${icone('clock', 'sm')}Livraisons en retard</div><div class="ms-val ${retard.length ? 'neg' : ''}">${retard.length}</div><div class="xs muted">date prévue dépassée</div></div></div>`;
  const tableau = `<div class="card"><div class="card-head"><div class="seg">${[['toutes', 'Toutes'], ['encours', 'En cours'], ['alivrer', 'À livrer'], ['livrees', 'Livrées']].map(([v, l]) => `<button class="${filtre === v ? 'on' : ''}" data-act="cmdFiltre" data-f="${v}">${l}</button>`).join('')}</div></div>
    ${liste.length ? `<div class="table-wrap"><table class="table"><thead><tr><th>N°</th><th>Fournisseur</th><th>Objet</th><th>Catégorie</th><th class="num">Montant HT</th><th>Livraison</th><th>Statut</th><th></th></tr></thead><tbody>
      ${liste.map(x => `<tr class="row-link" data-act="cmdEdit" data-id="${esc(x.id)}">
        <td class="strong nowrap">${esc(x.numero)}<div class="sub">${fmtDate(x.date)}</div></td><td>${esc(x.fournisseur)}</td><td>${esc(x.objet)}<div class="sub">${(x.lignes || []).length} ligne(s)</div></td>
        <td><span class="badge">${esc(x.categorie || 'Matériaux')}</span></td><td class="num strong">${fmtE2(montantCommande(x))}</td>
        <td class="nowrap">${x.livraisonReelle ? `<span class="pos">${icone('check', 'sm')} ${fmtDate(x.livraisonReelle)}</span>` : x.livraisonPrevue ? `<span class="${enRetard(x) ? 'neg' : ''}">${enRetard(x) ? icone('clock', 'sm') + ' ' : ''}${fmtDate(x.livraisonPrevue)}</span>` : '<span class="muted">—</span>'}</td>
        <td><span class="badge ${CLS_STATUT_CMD[x.statut] || ''} dot">${esc(libStatut(STATUTS_COMMANDE, x.statut))}</span></td>
        <td class="actions"><button class="btn ghost icon sm" data-act="cmdPDF" data-id="${esc(x.id)}" aria-label="Bon de commande PDF">${icone('file-text', 'sm')}</button><button class="btn ghost icon sm" data-act="cmdSuppr" data-id="${esc(x.id)}" aria-label="Supprimer">${icone('trash-2', 'sm')}</button></td></tr>`).join('')}
      <tr class="total"><td colspan="4">Total ${filtre === 'toutes' ? '' : 'de la sélection'}</td><td class="num">${fmtE(liste.reduce((t, x) => t + montantCommande(x), 0))}</td><td colspan="3"></td></tr></tbody></table></div>`
      : vide('shopping-cart', toutes.length ? 'Aucune commande dans ce filtre' : 'Aucune commande', 'Saisissez les commandes fournisseurs (matériaux, location de matériel, sous-traitance) : elles alimentent le déboursé engagé et la prévision de fin d\'affaire.', toutes.length ? '' : `<button class="btn primary" data-act="cmdNew">${icone('plus')}Nouvelle commande</button>`)}</div>`;
  return entete + `<div class="stack">${kpis}${tableau}</div>`;
}

/* ------------------------------- Modales --------------------------------- */
let _cmdLignes = [];
function modalCommande(cmd) {
  const c = ch();
  const toutes = (db.commandes || []).filter(x => x.chantierId === c.id);
  const fournisseurs = [...new Set((db.commandes || []).map(x => x.fournisseur).filter(Boolean))];
  const an = aujourdHui().slice(0, 4);
  const numAuto = `CMD-${an}-${String(toutes.filter(x => String(x.numero || '').includes(an)).length + 1).padStart(3, '0')}`;
  const e = cmd || { numero: numAuto, categorie: 'Matériaux', date: aujourdHui(), statut: 'brouillon', lignes: [] };
  _cmdLignes = JSON.parse(JSON.stringify(e.lignes && e.lignes.length ? e.lignes : [{ designation: '', quantite: '', unite: 'U', pu: '' }]));
  const catalogue = (c.catalogue || []);
  ouvrirModal(cmd ? `Commande ${e.numero}` : 'Nouvelle commande', `
    <input type="hidden" id="cmId" value="${esc(cmd ? cmd.id : '')}">
    <datalist id="dlFourn">${fournisseurs.map(f => `<option value="${esc(f)}">`).join('')}</datalist>
    <datalist id="dlCat">${catalogue.map(a => `<option value="${esc(a.designation)}">`).join('')}</datalist>
    <div class="form-grid">${champ('cmNum', 'N° de commande', e.numero)}${champ('cmFourn', 'Fournisseur *', e.fournisseur, 'text', 'list="dlFourn"')}
      ${champ('cmObjet', 'Objet', e.objet, 'text', 'placeholder="ex : Isolant et membranes phase 1"')}${selectHTML('cmCat', 'Catégorie', CATEGORIES_ACHAT, e.categorie)}
      ${champ('cmDate', 'Date de commande', e.date, 'date')}${selectHTML('cmStatut', 'Statut', STATUTS_COMMANDE, e.statut)}
      ${champ('cmLivP', 'Livraison prévue', e.livraisonPrevue, 'date')}${champ('cmLivR', 'Livraison réelle', e.livraisonReelle, 'date')}</div>
    <div class="form-section" style="display:flex;justify-content:space-between;align-items:center">Lignes de commande <button class="btn sm" data-act="cmLigneAjout">${icone('plus', 'sm')}Ligne</button></div>
    <div id="cmLignes" style="border:1px solid var(--border);border-radius:10px;overflow:auto"></div>
    ${catalogue.length ? `<p class="small muted" style="margin-top:6px">${icone('info', 'sm')} Désignations proposées depuis la liste matériaux du BTE (prix unitaire repris automatiquement).</p>` : ''}
    <div class="form-grid" style="margin-top:14px">${champ('cmFactNum', 'N° de facture fournisseur', e.factureNumero)}${champ('cmFactMt', 'Montant facturé HT (€)', e.factureMontant || '', 'number', 'step="any"')}</div>
    ${zoneTexte('cmNotes', 'Notes (conditions, contact, lieu de livraison…)', e.notes, 'rows="2"')}`,
    `${cmd ? `<button class="btn" data-act="cmdPDF" data-id="${esc(cmd.id)}" style="margin-right:auto">${icone('file-text')}Bon de commande</button>` : ''}<button class="btn" data-act="fermerModal">Annuler</button><button class="btn primary" data-act="cmdSave">Enregistrer</button>`,
    { taille: 'wide', icone: 'shopping-cart' });
  renderLignesCommande();
}
function lireLignesCommande() {
  $$('#cmLignes tr[data-i]').forEach(tr => {
    const l = _cmdLignes[Number(tr.dataset.i)];
    if (!l) return;
    l.designation = $('[data-f=designation]', tr).value.trim(); l.quantite = num($('[data-f=quantite]', tr).value);
    l.unite = $('[data-f=unite]', tr).value.trim(); l.pu = num($('[data-f=pu]', tr).value);
  });
}
function renderLignesCommande() {
  const box = $('#cmLignes');
  if (!box) return;
  const total = _cmdLignes.reduce((t, l) => t + num(l.quantite) * num(l.pu), 0);
  box.innerHTML = `<table class="table"><thead><tr><th>Désignation</th><th class="num">Quantité</th><th>Unité</th><th class="num">PU HT</th><th class="num">Total HT</th><th></th></tr></thead><tbody>
    ${_cmdLignes.map((l, i) => `<tr data-i="${i}">
      <td style="min-width:220px"><input class="input" data-f="designation" list="dlCat" value="${esc(l.designation)}" data-change="cmLigne" placeholder="Désignation"></td>
      <td class="num"><input class="input" style="width:90px;text-align:right" data-f="quantite" type="number" step="any" value="${l.quantite ?? ''}" data-change="cmLigne"></td>
      <td><input class="input" style="width:70px" data-f="unite" value="${esc(l.unite || '')}" data-change="cmLigne"></td>
      <td class="num"><input class="input" style="width:100px;text-align:right" data-f="pu" type="number" step="any" value="${l.pu ?? ''}" data-change="cmLigne"></td>
      <td class="num strong">${fmtE2(num(l.quantite) * num(l.pu))}</td>
      <td class="actions"><button class="btn ghost icon sm" data-act="cmLigneSuppr" data-i="${i}" aria-label="Supprimer la ligne">${icone('x', 'sm')}</button></td></tr>`).join('')}
    <tr class="total"><td colspan="4">Total commande HT</td><td class="num">${fmtE2(total)}</td><td></td></tr></tbody></table>`;
}

function modalPoste(p, avenant) {
  const e = p || { avenant, code: '' };
  const nb = (db.postes || []).filter(x => x.chantierId === ui.chantierId && !!x.avenant === !!e.avenant).length;
  if (!p) e.code = e.avenant ? `TS ${String(nb + 1).padStart(2, '0')}` : String(nb + 1).padStart(2, '0');
  ouvrirModal(p ? 'Modifier le poste' : e.avenant ? 'Nouvel avenant / travaux supplémentaires' : 'Nouveau poste du marché', `
    <input type="hidden" id="poId" value="${esc(p ? p.id : '')}">
    <div class="form-grid">${champ('poCode', 'Code', e.code)}${champ('poMontant', 'Montant HT (€) *', e.montant || '', 'number', 'step="any"')}</div>
    ${champ('poDes', 'Désignation *', e.designation, 'text', e.avenant ? 'placeholder="ex : TS 01 — Crapaudines supplémentaires"' : 'placeholder="ex : Étanchéité bicouche"')}
    <label class="checkbox"><input type="checkbox" id="poAv" ${e.avenant ? 'checked' : ''}><span>Avenant / travaux supplémentaires</span></label>`,
    `<button class="btn" data-act="fermerModal">Annuler</button><button class="btn primary" data-act="posteSave">Enregistrer</button>`, { icone: e.avenant ? 'file-plus' : 'list', taille: 'narrow' });
}

function modalSituation() {
  const c = ch();
  const sits = situationsDe(db, c.id);
  const der = sits[sits.length - 1];
  let mois = aujourdHui().slice(0, 7);
  if (der && der.mois >= mois) { const [a, m] = der.mois.split('-').map(Number); mois = m === 12 ? `${a + 1}-01` : `${a}-${String(m + 1).padStart(2, '0')}`; }
  ouvrirModal('Nouvelle situation de travaux', `
    <div class="form-grid">${champ('siNum', 'Numéro', String(sits.length + 1), 'number', 'min="1"')}${champ('siMois', 'Mois', mois, 'month')}</div>
    <label class="checkbox field"><input type="checkbox" id="siReprendre" checked><span>Partir de l'avancement physique du suivi hebdomadaire (${pc(calcSuivi(db, c.id).tot.pct)})</span></label>
    <p class="small muted">${der ? `Sinon, les avancements de la situation n° ${esc(der.numero)} sont repris comme point de départ.` : 'Sinon, tous les postes démarrent à 0 %.'}</p>`,
    `<button class="btn" data-act="fermerModal">Annuler</button><button class="btn primary" data-act="sitCreer">Créer</button>`, { icone: 'file-plus', taille: 'narrow' });
}

function modalEntreprise() {
  const e = entreprise();
  ouvrirModal('Votre entreprise', `
    <p class="muted" style="margin-bottom:14px">Ces informations figurent en en-tête des situations et des bons de commande (enregistrées sur cet appareil).</p>
    ${champ('enNom', 'Raison sociale / agence', e.nom)}${zoneTexte('enAdr', 'Adresse', e.adresse, 'rows="2"')}
    <div class="form-grid">${champ('enSiret', 'SIRET', e.siret)}${champ('enContact', 'Contact (tél. / e-mail)', e.contact)}</div>`,
    `<button class="btn" data-act="fermerModal">Annuler</button><button class="btn primary" data-act="entrepriseSave">Enregistrer</button>`, { icone: 'landmark' });
}

/* -------------------------------- Actions -------------------------------- */
function dupliquerPcts(src) { return Object.assign({}, src || {}); }

Object.assign(ACT, {
  finOngletMarche: () => { ui.sitOnglet = 'marche'; allerA('situations'); },
  sitOnglet: el => { ui.sitOnglet = el.dataset.t; render(); },
  sitOuvrir: el => { ui.situationId = el.dataset.id; render(); },
  sitNew: () => {
    if (!postesDe(db, ui.chantierId).length) { ui.sitOnglet = 'marche'; render(); return toast('Saisissez d\'abord la décomposition du marché ou son montant.', 'alerte'); }
    modalSituation();
  },
  sitCreer: () => {
    const c = ch();
    const mois = val('siMois');
    if (!/^\d{4}-\d{2}$/.test(mois)) return toast('Mois invalide', 'alerte');
    if (situationsDe(db, c.id).some(s => s.mois === mois)) return toast('Une situation existe déjà pour ce mois.', 'alerte');
    const der = situationsDe(db, c.id).pop();
    const pcts = {};
    const pPhys = calcSuivi(db, c.id).tot.pct;
    postesDe(db, c.id).forEach(p => { pcts[p.id] = $('#siReprendre').checked ? Math.max(pPhys, der ? num((der.pcts || {})[p.id]) : 0) : (der ? num((der.pcts || {})[p.id]) : 0); });
    const s = { id: uid(), chantierId: c.id, numero: num(val('siNum')) || 1, mois, date: aujourdHui(), statut: 'brouillon', pcts, auteur: nomUser() };
    db.situations.push(s); ui.situationId = s.id; ui.sitOnglet = 'situations';
    save(); fermerModal(); render(); toast(`Situation n° ${s.numero} créée`, 'succes');
  },
  sitReprendre: el => {
    const s = db.situations.find(x => x.id === el.dataset.id);
    const p = calcSuivi(db, s.chantierId).tot.pct;
    postesDe(db, s.chantierId).forEach(po => { s.pcts[po.id] = p; });
    save(); render(); toast('Avancement physique appliqué à tous les postes', 'succes');
  },
  sitStatut: el => {
    const s = db.situations.find(x => x.id === el.dataset.id);
    if (!s) return;
    s.statut = el.dataset.s;
    const champDate = { transmise: 'transmiseLe', validee: 'valideeLe', facturee: 'factureeLe', payee: 'payeeLe' }[s.statut];
    if (champDate && !s[champDate]) s[champDate] = aujourdHui();
    save(); render(); toast(`Situation n° ${s.numero} : ${libStatut(STATUTS_SITUATION, s.statut).toLowerCase()}`, 'succes');
  },
  sitSuppr: async el => {
    const s = db.situations.find(x => x.id === el.dataset.id);
    if (!s || !await confirmer(`Supprimer la situation n° ${s.numero}`, `Situation de ${esc(moisLong(s.mois))} (brouillon).`, { ok: 'Supprimer', danger: true })) return;
    db.situations = db.situations.filter(x => x !== s); ui.situationId = null; save(); render();
  },
  sitPDF: el => situationPDF(el.dataset.id),

  posteNew: el => modalPoste(null, el.dataset.av === '1'),
  posteEdit: el => modalPoste(db.postes.find(p => p.id === el.dataset.id)),
  posteSave: () => {
    const designation = val('poDes'), montant = num(val('poMontant'));
    if (!designation) return toast('Désignation obligatoire', 'alerte');
    const id = val('poId');
    const data = { code: val('poCode'), designation, montant, avenant: $('#poAv').checked };
    const premier = !(db.postes || []).some(p => p.chantierId === ui.chantierId);
    if (id) Object.assign(db.postes.find(p => p.id === id), data);
    else {
      const p = Object.assign({ id: uid(), chantierId: ui.chantierId }, data);
      db.postes.push(p);
      // Le premier poste remplace la ligne virtuelle « Marché de base » : reporter les avancements déjà saisis
      if (premier) db.situations.filter(s => s.chantierId === ui.chantierId && s.pcts && s.pcts.__marche !== undefined).forEach(s => { s.pcts[p.id] = s.pcts.__marche; });
    }
    save(); fermerModal(); render(); toast('Poste enregistré', 'succes');
  },
  posteSuppr: async el => {
    const p = db.postes.find(x => x.id === el.dataset.id);
    if (!p || !await confirmer('Supprimer le poste', `« <b>${esc(p.designation)}</b> » (${fmtE(p.montant)}) sera retiré des situations.`, { ok: 'Supprimer', danger: true })) return;
    db.postes = db.postes.filter(x => x !== p); save(); render();
  },
  dpgfImport: () => {
    const inp = document.createElement('input');
    inp.type = 'file'; inp.accept = '.csv,.txt,.xlsx,.xls';
    inp.onchange = async () => {
      const f = inp.files[0]; if (!f) return;
      try {
        let rows;
        if (/\.(csv|txt)$/i.test(f.name)) rows = parseCSV(await f.text());
        else { const wb = XLSX.read(await f.arrayBuffer(), { type: 'array' }); rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, raw: true, defval: '' }); }
        const n = importerPostes(rows);
        render(); toast(`${n} poste(s) importé(s)`, 'succes');
      } catch (e) { toast('Import impossible : ' + (e.message || e), 'erreur'); }
    };
    inp.click();
  },
  entreprise: () => modalEntreprise(),
  entrepriseSave: () => {
    localStorage.setItem(ENTREPRISE_KEY, JSON.stringify({ nom: val('enNom'), adresse: val('enAdr'), siret: val('enSiret'), contact: val('enContact') }));
    fermerModal(); render(); toast('Informations entreprise enregistrées', 'succes');
  },

  cmdNew: () => modalCommande(null),
  cmdEdit: el => modalCommande(db.commandes.find(x => x.id === el.dataset.id)),
  cmdFiltre: el => { ui.cmdFiltre = el.dataset.f; render(); },
  cmLigneAjout: () => { lireLignesCommande(); _cmdLignes.push({ designation: '', quantite: '', unite: 'U', pu: '' }); renderLignesCommande(); const l = $$('#cmLignes [data-f=designation]').pop(); if (l) l.focus(); },
  cmLigneSuppr: el => { lireLignesCommande(); _cmdLignes.splice(Number(el.dataset.i), 1); if (!_cmdLignes.length) _cmdLignes.push({ designation: '', quantite: '', unite: 'U', pu: '' }); renderLignesCommande(); },
  cmdSave: () => {
    lireLignesCommande();
    const fournisseur = val('cmFourn');
    if (!fournisseur) return toast('Indiquez le fournisseur', 'alerte');
    const id = val('cmId');
    const data = {
      numero: val('cmNum'), fournisseur, objet: val('cmObjet'), categorie: val('cmCat'), date: val('cmDate'), statut: val('cmStatut'),
      livraisonPrevue: val('cmLivP'), livraisonReelle: val('cmLivR'), factureNumero: val('cmFactNum'), factureMontant: num(val('cmFactMt')), notes: val('cmNotes'),
      lignes: _cmdLignes.filter(l => l.designation || num(l.quantite) || num(l.pu))
    };
    if (data.livraisonReelle && ['commandee', 'confirmee', 'brouillon'].includes(data.statut)) data.statut = 'livree';
    if (id) Object.assign(db.commandes.find(x => x.id === id), data);
    else db.commandes.push(Object.assign({ id: uid(), chantierId: ui.chantierId, creePar: nomUser() }, data));
    save(); fermerModal(); render(); toast(`Commande ${data.numero} enregistrée`, 'succes');
  },
  cmdSuppr: async (el, ev) => {
    ev.stopPropagation();
    const x = db.commandes.find(k => k.id === el.dataset.id);
    if (!x || !await confirmer(`Supprimer la commande ${x.numero}`, `${esc(x.fournisseur)} — ${fmtE(montantCommande(x))} HT`, { ok: 'Supprimer', danger: true })) return;
    db.commandes = db.commandes.filter(k => k !== x); save(); render();
  },
  cmdPDF: (el, ev) => { ev.stopPropagation(); if ($('#cmId') && val('cmId') === el.dataset.id) ACT.cmdSave(); bonCommandePDF(el.dataset.id); }
});

Object.assign(CHG, {
  budgetPoste: el => { const c = ch(); c.budget = c.budget || {}; c.budget[el.dataset.k] = num(el.value); save(); render(); },
  paramFin: el => { const c = ch(); c.finances = Object.assign(parametresFinanciers(c), { [el.dataset.k]: Math.max(0, num(el.value)) }); save(); render(); },
  sitPct: el => {
    const s = db.situations.find(x => x.id === el.dataset.s);
    if (!s) return;
    s.pcts = s.pcts || {};
    s.pcts[el.dataset.p] = Math.max(0, Math.min(100, num(el.value))) / 100;
    save(); render();
  },
  // Mise à jour sur place (sans redessiner le tableau, pour ne pas perdre la saisie en cours)
  cmLigne: el => {
    const tr = el.closest('tr');
    const i = Number(tr.dataset.i);
    lireLignesCommande();
    // Désignation issue de la liste matériaux du BTE : reprendre l'unité et le prix unitaire
    if (el.dataset.f === 'designation') {
      const art = (ch().catalogue || []).find(a => norm(a.designation) === norm(el.value));
      const l = _cmdLignes[i];
      if (art && !num(l.pu)) {
        l.pu = art.pu; l.unite = art.unite || l.unite; if (!num(l.quantite)) l.quantite = art.quantite;
        $('[data-f=pu]', tr).value = l.pu; $('[data-f=unite]', tr).value = l.unite; $('[data-f=quantite]', tr).value = l.quantite;
      }
    }
    const l = _cmdLignes[i];
    tr.querySelector('td.num.strong').textContent = fmtE2(num(l.quantite) * num(l.pu));
    const tot = $('#cmLignes tr.total td.num');
    if (tot) tot.textContent = fmtE2(_cmdLignes.reduce((t, x) => t + num(x.quantite) * num(x.pu), 0));
  }
});

// Import d'une décomposition de marché : colonnes Code ; Désignation ; Montant (en-têtes détectés)
function importerPostes(rows) {
  if (!rows.length) throw new Error('Fichier vide');
  const h = rows[0].map(norm);
  let iC = h.findIndex(x => /^(code|n|no|n°|num|numero|article|poste)$/.test(x));
  let iD = h.findIndex(x => /designation|libelle|description|ouvrage/.test(x));
  let iM = h.findIndex(x => /montant|total|prix|ht/.test(x));
  let debut = 1;
  if (iD < 0 || iM < 0) { iC = 0; iD = 1; iM = rows[0].length - 1; debut = 0; }
  let n = 0;
  rows.slice(debut).forEach(r => {
    const d = String(r[iD] ?? '').trim(), mt = num(r[iM]);
    if (!d || !mt || /^total/i.test(d)) return;
    db.postes.push({ id: uid(), chantierId: ui.chantierId, code: iC >= 0 ? String(r[iC] ?? '').trim() : '', designation: d, montant: mt, avenant: /^(ts|avenant|av)\b/i.test(String(r[iC] ?? '') + ' ' + d) });
    n++;
  });
  if (!n) throw new Error('aucune ligne avec désignation et montant');
  save();
  return n;
}
