/* ==========================================================================
   OmSmK — planning d'exécution (Gantt par phase du BTE)
   Durées tirées des heures budgétées et de l'effectif, avancement réel issu
   du suivi hebdomadaire, activité réelle issue du pointage, fin projetée au
   rythme constaté, jalons contractuels.
   ========================================================================== */
// deno-lint-ignore-file no-unused-vars
'use strict';

const STATUTS_PHASE = {
  termine: ['Terminée', 'pos', 'circle-check'], retard: ['En retard', 'neg', 'triangle-alert'], en_cours: ['En cours', 'info', 'activity'],
  a_venir: ['À venir', '', 'calendar'], non_planifie: ['Non planifiée', '', 'minus']
};
const badgeStatutPhase = st => { const [l, c, ic] = STATUTS_PHASE[st] || STATUTS_PHASE.non_planifie; return `<span class="badge ${c}">${icone(ic, 'sm')}${l}</span>`; };
const effectifParDefaut = cid => Math.max(1, (db.compagnons || []).filter(k => k.chantierId === cid && k.actif !== false).length || ui.equipe || 2);

/* ------------------------------ Diagramme -------------------------------- */
function diagrammeGantt(pl, largeur, opts = {}) {
  const P = opts.impression ? PALETTE_IMPRESSION : PALETTE_ECRAN;
  const auj = opts.auj || aujourdHui();
  const rows = pl.rows.filter(r => r.debut && r.fin);
  const W = Math.max(320, largeur);
  const compact = W < 640;
  const lw = compact ? 0 : Math.min(230, Math.round(W * 0.26));
  const pasY = compact ? 46 : 38, hb = 14;
  const hJalons = pl.jalons.length ? 46 : 0;
  const m = { g: lw + 8, d: 56, h: 30 + hJalons, b: 10 };
  // Domaine temporel
  const dates = [auj, ...rows.flatMap(r => [r.debut, r.fin, r.finProjetee, r.reel && r.reel.debut, r.reel && r.reel.fin]), ...pl.jalons.map(j => j.date), pl.finContrat].filter(Boolean).sort();
  const d0 = lundi(dates[0]), d1 = addDays(lundi(dates[dates.length - 1]), 6);
  const nJ = Math.round((new Date(d1) - new Date(d0)) / 86400000) + 1;
  const iw = W - m.g - m.d;
  const pj = iw / nJ;
  const x = d => m.g + Math.round((new Date(d + 'T00:00:00') - new Date(d0 + 'T00:00:00')) / 86400000) * pj;
  const H = m.h + m.b + rows.length * pasY;
  const id = 'g' + Math.random().toString(36).slice(2, 7);
  let s = `<svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg" font-family="${P.police}" role="img" aria-label="Planning des phases">`;
  // Week-ends grisés et semaines
  if (pj >= 3) for (let i = 0, d = d0; i < nJ; i++, d = addDays(d, 1)) if (!estOuvre(d)) s += `<rect x="${x(d)}" y="${m.h - 4}" width="${pj}" height="${H - m.h - m.b + 8}" fill="${P.grille}" opacity=".55"/>`;
  const nSem = Math.ceil(nJ / 7);
  const saut = Math.max(1, Math.ceil(nSem / Math.max(1, Math.floor(iw / 62))));
  for (let k = 0; k < nSem; k++) {
    const d = addDays(d0, k * 7);
    s += `<line x1="${x(d)}" x2="${x(d)}" y1="${m.h - 4}" y2="${H - m.b}" stroke="${P.grille}" stroke-width="1"/>`;
    if (k % saut === 0) s += `<text x="${x(d) + 4}" y="12" font-size="11" font-weight="600" fill="${P.texteFort}">S${semISO(d)}</text><text x="${x(d) + 4}" y="25" font-size="10.5" fill="${P.texte}">${esc(fmtDateCourt(d))}</text>`;
  }
  // Jalons : libellés répartis sur deux lignes quand ils se chevauchent
  const finVoies = [-1e9, -1e9];
  pl.jalons.forEach(j => {
    if (!j.date) return;
    const cx = x(j.date) + pj / 2, cy = 38;
    const lib = j.libelle.length > 22 ? j.libelle.slice(0, 21) + '…' : j.libelle;
    const lg = lib.length * 6.3 + 4;
    const aDroite = cx - 6 + lg < W - 4;
    const x0 = aDroite ? cx - 6 : cx + 6 - lg, x1 = x0 + lg;
    // Libellé sur la première ligne libre ; sans place, le jalon reste visible (losange + info-bulle)
    const voie = x0 > finVoies[0] + 6 ? 0 : x0 > finVoies[1] + 6 ? 1 : -1;
    if (voie >= 0) finVoies[voie] = x1;
    s += `<line x1="${cx}" x2="${cx}" y1="${cy}" y2="${H - m.b}" stroke="${P.base}" stroke-width="1" stroke-dasharray="2 3"/>`;
    s += `<path d="M${cx},${cy - 6}L${cx + 6},${cy}L${cx},${cy + 6}L${cx - 6},${cy}Z" fill="${j.fait ? P.texteFort : P.surface}" stroke="${P.texteFort}" stroke-width="1.5"/>`;
    if (voie >= 0) s += ` <text x="${aDroite ? cx - 6 : cx + 6}" y="${cy + 21 + voie * 13}" text-anchor="${aDroite ? 'start' : 'end'}" font-size="11" fill="${P.texteFort}">${esc(lib)}</text>`;
    if (!opts.impression) s += `<rect x="${cx - 9}" y="${cy - 9}" width="18" height="18" fill="transparent" data-tip='${esc(JSON.stringify({ h: j.libelle, r: [['Date', fmtDate(j.date), ''], ['État', j.fait ? 'Atteint' : (j.date < auj ? 'Dépassé' : 'À venir'), '']] }))}'/>`;
  });
  // Lignes verticales : aujourd'hui et fin contractuelle
  if (pl.finContrat) {
    const xf = x(pl.finContrat) + pj;
    s += `<line x1="${xf}" x2="${xf}" y1="${m.h - 4}" y2="${H - m.b}" stroke="${P.neg}" stroke-width="1.5" stroke-dasharray="5 4"/>`;
  }
  if (auj >= d0 && auj <= d1) {
    const xa = x(auj) + pj / 2;
    s += `<line x1="${xa}" x2="${xa}" y1="${m.h - 8}" y2="${H - m.b}" stroke="${P.texteFort}" stroke-width="1.5"/>`;
    s += `<circle cx="${xa}" cy="${m.h - 8}" r="3" fill="${P.texteFort}"/>`;
  }
  // Barres
  rows.forEach((r, i) => {
    const y0 = m.h + i * pasY;
    const yb = y0 + (compact ? 22 : (pasY - hb) / 2);
    const nom = r.phase.length > 34 ? r.phase.slice(0, 33) + '…' : r.phase;
    if (compact) s += `<text x="8" y="${y0 + 14}" font-size="12" font-weight="600" fill="${P.texteFort}">${esc(nom)}</text>`;
    else s += `<text x="${lw}" y="${yb + hb / 2 + 4}" text-anchor="end" font-size="12" fill="${P.texteFort}">${esc(nom)}</text>`;
    const xd = x(r.debut), xf = x(r.fin) + pj;
    const w = Math.max(3, xf - xd);
    // Projection au-delà de la fin prévue
    if (r.finProjetee && r.finProjetee > r.fin) {
      const xp = x(r.finProjetee) + pj;
      s += `<rect x="${xf}" y="${yb + 1}" width="${Math.max(2, xp - xf)}" height="${hb - 2}" rx="3" fill="none" stroke="${P.neg}" stroke-width="1.5" stroke-dasharray="4 3"/>`;
      s += `<text x="${xp + 6}" y="${yb + hb / 2 + 4}" font-size="11" font-weight="600" fill="${P.texteFort}">+${r.glissement} j</text>`;
    }
    s += `<rect x="${xd}" y="${yb}" width="${w}" height="${hb}" rx="4" fill="${P.serie1}" fill-opacity=".2" stroke="${P.serie1}" stroke-width="1"/>`;
    if (r.pct > 0) s += `<rect x="${xd}" y="${yb}" width="${Math.max(3, w * Math.min(1, r.pct))}" height="${hb}" rx="4" fill="${P.serie1}"/>`;
    // Activité réelle (pointage) sous la barre
    if (r.reel) {
      const xr0 = x(r.reel.debut), xr1 = x(r.reel.fin) + pj;
      s += `<rect x="${xr0}" y="${yb + hb + 3}" width="${Math.max(3, xr1 - xr0)}" height="3" rx="1.5" fill="${P.serie2}"/>`;
    }
    if (!(r.finProjetee && r.finProjetee > r.fin)) s += `<text x="${xf + 6}" y="${yb + hb / 2 + 4}" font-size="11" fill="${P.texte}">${pc(r.pct)}</text>`;
    if (!opts.impression) {
      const tip = { h: `${r.phase} · ${r.ouvrage}`, r: [
        ['Prévu', `${fmtDateCourt(r.debut)} → ${fmtDateCourt(r.fin)} (${r.duree} j)`, 'serie-1'],
        ['Réalisé', pc(r.pct) + (r.attendu !== null && r.pct < 1 ? ` · attendu ${pc(r.attendu)}` : ''), ''],
        ['Activité pointée', r.reel ? `${fmtDateCourt(r.reel.debut)} → ${fmtDateCourt(r.reel.fin)}` : '—', r.reel ? 'serie-2' : ''],
        ['Fin projetée', r.finProjetee ? fmtDate(r.finProjetee) + (r.glissement ? ` (+${r.glissement} j)` : '') : '—', r.glissement ? 'div-neg' : ''],
        ['Statut', (STATUTS_PHASE[r.statut] || [''])[0], '']] };
      s += `<rect x="0" y="${y0}" width="${W}" height="${pasY}" fill="transparent" data-tip='${esc(JSON.stringify(tip))}'/>`;
    }
  });
  return s + '</svg>';
}

/* --------------------------------- Vue ----------------------------------- */
function vPlanning(c) {
  const pl = calcPlanning(db, c.id);
  const planifiees = pl.rows.filter(r => r.debut && r.fin);
  const actions = `<button class="btn" data-act="planGenerer" ${pl.rows.length ? '' : 'disabled'}>${icone('sparkles')}Générer depuis le BTE</button>
    <button class="btn" data-act="planJalon">${icone('flag')}Jalon</button>
    <button class="btn primary" data-act="planPDF" ${planifiees.length ? '' : 'disabled'}>${icone('printer')}Planning PDF</button>`;
  const entete = enTetePage({ eyebrow: 'Planning d\'exécution', titre: 'Planning', sous: [pl.debut ? sousInfo('calendar', `${fmtDate(pl.debut)} → ${fmtDate(pl.finContrat || pl.finPlan)}`) : '', sousInfo('hard-hat', `${effectifParDefaut(c.id)} compagnon(s)`)], actions });
  if (!pl.rows.length) {
    return entete + `<div class="card">${vide('chart-gantt', 'Pas encore de phases à planifier', 'Le planning se construit à partir des phases et des heures du BTE.', `<button class="btn primary" data-nav="bte">${icone('calculator')}Budget (BTE)</button>`)}</div>`;
  }
  if (!planifiees.length) {
    return entete + `<div class="card">${vide('chart-gantt', 'Le planning n\'est pas encore établi',
      `${pl.rows.length} phase(s) au BTE. Générez un planning enchaîné à partir des heures budgétées et de l'effectif, puis ajustez les dates.`,
      `<button class="btn primary" data-act="planGenerer">${icone('sparkles')}Générer le planning</button>`)}</div>` + tableauPlanning(c, pl) + carteJalons(pl);
  }
  const enRetard = pl.rows.filter(r => r.statut === 'retard');
  const prochain = pl.jalons.find(j => !j.fait && j.date >= aujourdHui());
  const kpis = `<div class="card mini-stats">
    <div><div class="ms-lbl">${icone('flag', 'sm')}Fin contractuelle</div><div class="ms-val">${pl.finContrat ? fmtDate(pl.finContrat) : '—'}</div><div class="xs muted">${pl.finContrat ? `${joursOuvres(aujourdHui(), pl.finContrat)} jour(s) ouvré(s) restant(s)` : 'à renseigner sur la fiche chantier'}</div></div>
    <div><div class="ms-lbl">${icone('trending-up', 'sm')}Fin projetée</div><div class="ms-val ${pl.retard ? 'neg' : ''}">${pl.finProjetee ? fmtDate(pl.finProjetee) : '—'}</div><div class="xs muted">${pl.retard ? `${icone('triangle-alert', 'sm')} ${pl.retard} jour(s) de retard` : 'dans les délais'}</div></div>
    <div><div class="ms-lbl">${icone('activity', 'sm')}Phases en retard</div><div class="ms-val ${enRetard.length ? 'neg' : ''}">${enRetard.length}</div><div class="xs muted">${enRetard.length ? esc(enRetard.slice(0, 2).map(r => r.phase).join(', ')) : 'aucune'}</div></div>
    <div><div class="ms-lbl">${icone('flag', 'sm')}Prochain jalon</div><div class="ms-val">${prochain ? fmtDateCourt(prochain.date) : '—'}</div><div class="xs muted">${prochain ? esc(prochain.libelle) : 'aucun jalon à venir'}</div></div>
  </div>`;
  const gantt = `<div class="card"><div class="card-head"><h3>Diagramme de Gantt</h3>
      <div class="legend"><span><i style="background:var(--serie-1)"></i>Réalisé</span><span><i style="background:var(--serie-1);opacity:.25"></i>Prévu</span><span><i style="background:var(--serie-2);height:3px"></i>Activité pointée</span><span><i style="border:1.5px dashed var(--div-neg);background:none"></i>Glissement projeté</span></div></div>
    <div class="card-body">${graphique('gantt', w => diagrammeGantt(pl, w))}</div>
    <div class="card-foot small muted">${icone('info', 'sm')} Trait vertical plein : aujourd'hui · tirets rouges : fin contractuelle. La fin projetée prolonge chaque phase au rythme réellement constaté (% réalisé ÷ jours écoulés).</div></div>`;
  return entete + `<div class="stack">${kpis}${gantt}${tableauPlanning(c, pl)}${carteJalons(pl)}</div>`;
}

function tableauPlanning(c, pl) {
  return `<div class="card"><div class="card-head"><h3>Dates par phase</h3><span class="hint">Modifiez les dates directement ; durées en jours ouvrés</span></div>
    <div class="table-wrap"><table class="table">
      <thead><tr><th>Phase</th><th class="num">Budget</th><th>Début</th><th>Fin</th><th class="num">Durée</th><th class="num">Avancement</th><th>Fin projetée</th><th>Statut</th></tr></thead>
      <tbody>${pl.rows.map(r => `<tr>
        <td><div class="strong">${esc(r.phase)}</div><div class="sub">${esc(r.ouvrage)}</div></td>
        <td class="num">${fmt(r.budget)} h<div class="sub">${fmt(r.budget / hjDe(c), 1)} j-homme</div></td>
        <td><input class="input" type="date" style="height:34px;width:150px" value="${r.debut}" data-change="planDate" data-k="${esc(r.cle)}" data-f="debut" aria-label="Début ${esc(r.phase)}"></td>
        <td><input class="input" type="date" style="height:34px;width:150px" value="${r.fin}" data-change="planDate" data-k="${esc(r.cle)}" data-f="fin" aria-label="Fin ${esc(r.phase)}"></td>
        <td class="num">${r.duree ? r.duree + ' j' : '—'}</td>
        <td class="num"><div style="width:100px;margin-left:auto">${barre(r.pct, r.pct >= 1 ? 'pos' : '')}</div><div class="sub">${pc(r.pct)}${r.attendu !== null && r.pct < 1 ? ' · attendu ' + pc(r.attendu) : ''}</div></td>
        <td>${r.finProjetee ? fmtDate(r.finProjetee) : '—'}${r.glissement ? `<div class="sub neg">+${r.glissement} j</div>` : ''}</td>
        <td>${badgeStatutPhase(r.statut)}</td></tr>`).join('')}</tbody></table></div></div>`;
}

function carteJalons(pl) {
  return `<div class="card"><div class="card-head"><h3>Jalons</h3><button class="btn sm" data-act="planJalon">${icone('plus', 'sm')}Ajouter</button></div>
    ${pl.jalons.length ? pl.jalons.map(j => `<div class="res-item" style="align-items:center">
      <label class="checkbox"><input type="checkbox" ${j.fait ? 'checked' : ''} data-change="planJalonFait" data-id="${esc(j.id)}" aria-label="Jalon atteint"></label>
      <div><div class="strong">${esc(j.libelle)}</div><div class="sub">${fmtDate(j.date, true)}${!j.fait && j.date < aujourdHui() ? ' · <span class="neg">dépassé</span>' : ''}</div></div>
      <div class="row" style="flex-wrap:nowrap"><button class="btn ghost icon sm" data-act="planJalon" data-id="${esc(j.id)}" aria-label="Modifier">${icone('pencil', 'sm')}</button><button class="btn ghost icon sm" data-act="planJalonSuppr" data-id="${esc(j.id)}" aria-label="Supprimer">${icone('trash-2', 'sm')}</button></div></div>`).join('')
      : '<div class="card-body muted">Ajoutez les dates clés : démarrage, mise hors d\'eau, OPR, réception…</div>'}</div>`;
}

/* ------------------------------- Modales --------------------------------- */
function modalPlanGenerer() {
  const c = ch();
  const existe = Object.keys(c.planning || {}).length;
  ouvrirModal('Générer le planning', `
    <p class="muted" style="margin-bottom:16px">Les phases du BTE sont enchaînées dans leur ordre ; chaque durée = heures budgétées ÷ (effectif × ${fmt(hjDe(c))} h), en jours ouvrés.</p>
    <div class="form-grid">${champ('pgDebut', 'Date de démarrage', c.dateDebut || aujourdHui(), 'date')}${champ('pgEff', 'Effectif (compagnons)', effectifParDefaut(c.id), 'number', 'min="1" step="1"')}</div>
    ${selectHTML('pgChev', 'Enchaînement des phases', [['0', 'Successives (une phase après l\'autre)'], ['0.25', 'Chevauchement léger (25 %)'], ['0.5', 'Chevauchement fort (50 %)']], '0')}
    ${existe ? `<div class="alert warn">${icone('triangle-alert')}<div>Les dates actuelles des phases seront remplacées. Les jalons sont conservés.</div></div>` : ''}`,
    `<button class="btn" data-act="fermerModal">Annuler</button><button class="btn primary" data-act="planGenererOk">${icone('sparkles')}Générer</button>`, { icone: 'chart-gantt' });
}

function modalJalon(j) {
  const e = j || { date: aujourdHui() };
  ouvrirModal(j ? 'Modifier le jalon' : 'Nouveau jalon', `
    <input type="hidden" id="jlId" value="${esc(j ? j.id : '')}">
    <datalist id="dlJalons">${['Démarrage des travaux', 'Mise hors d\'eau', 'Fin du gros œuvre support', 'Fin des relevés', 'OPR', 'Réception', 'Levée des réserves', 'Livraison'].map(x => `<option value="${esc(x)}">`).join('')}</datalist>
    ${champ('jlLib', 'Libellé *', e.libelle, 'text', 'list="dlJalons"')}
    ${champ('jlDate', 'Date', e.date, 'date')}`,
    `<button class="btn" data-act="fermerModal">Annuler</button><button class="btn primary" data-act="planJalonOk">Enregistrer</button>`, { icone: 'flag', taille: 'narrow' });
}

/* --------------------------------- PDF ----------------------------------- */
async function planningPDF() {
  const c = ch();
  if (!globalThis.jspdf) return toast('Bibliothèque PDF non chargée.', 'erreur');
  const { jsPDF } = globalThis.jspdf;
  const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'landscape' });
  const pl = calcPlanning(db, c.id);
  const W = 297, M = 12;
  doc.setFillColor(14, 35, 64); doc.rect(0, 0, W, 4, 'F');
  doc.setFont('helvetica', 'bold'); doc.setFontSize(15); doc.setTextColor(14, 35, 64);
  doc.text(pdfTxt('PLANNING D\'EXÉCUTION'), M, 15);
  doc.setFont('helvetica', 'normal'); doc.setFontSize(9.5); doc.setTextColor(232, 89, 12);
  doc.text(pdfTxt(`${c.nom}${c.client ? ' · ' + c.client : ''}`), M, 21);
  doc.setTextColor(102, 112, 133); doc.setFontSize(8.5);
  doc.text(pdfTxt(['Édité le ' + fmtDate(aujourdHui()), entreprise().nom].filter(Boolean).join(' · ')), W - M, 15, { align: 'right' });
  doc.text(pdfTxt(`Fin contractuelle : ${pl.finContrat ? fmtDate(pl.finContrat) : '-'} · fin projetée : ${pl.finProjetee ? fmtDate(pl.finProjetee) : '-'}${pl.retard ? ` (${pl.retard} j de retard)` : ''}`), W - M, 21, { align: 'right' });
  const largeurPx = 1100;
  const svg = diagrammeGantt(pl, largeurPx, { impression: true });
  const hPx = Number((svg.match(/height="(\d+)"/) || [])[1]) || 400;
  const png = await svgEnPng(svg, largeurPx, hPx);
  let wMm = W - 2 * M, hMm = wMm * hPx / largeurPx;
  if (hMm > 120) { wMm = wMm * 120 / hMm; hMm = 120; }
  doc.addImage(png, 'PNG', M, 27, wMm, hMm);
  doc.autoTable(Object.assign({}, STYLE_TABLE, {
    startY: 27 + hMm + 6, margin: { left: M, right: M },
    head: [['Phase', 'Ouvrage', 'Budget h', 'Début', 'Fin', 'Durée', 'Réalisé', 'Fin projetée', 'Statut'].map(pdfTxt)],
    body: pl.rows.map(r => [r.phase, r.ouvrage, fmt(r.budget), r.debut ? fmtDate(r.debut) : '-', r.fin ? fmtDate(r.fin) : '-', r.duree ? r.duree + ' j' : '-', pc(r.pct),
      r.finProjetee ? fmtDate(r.finProjetee) + (r.glissement ? ` (+${r.glissement} j)` : '') : '-', (STATUTS_PHASE[r.statut] || [''])[0]].map(pdfTxt)),
    columnStyles: { 2: { halign: 'right' }, 5: { halign: 'right' }, 6: { halign: 'right' } }
  }));
  if (pl.jalons.length) {
    doc.autoTable(Object.assign({}, STYLE_TABLE, {
      startY: doc.lastAutoTable.finalY + 6, margin: { left: M, right: M },
      head: [['Jalon', 'Date', 'État'].map(pdfTxt)],
      body: pl.jalons.map(j => [j.libelle, fmtDate(j.date), j.fait ? 'Atteint' : (j.date < aujourdHui() ? 'Dépassé' : 'À venir')].map(pdfTxt))
    }));
  }
  const n = doc.getNumberOfPages();
  for (let i = 1; i <= n; i++) { doc.setPage(i); doc.setFontSize(7.5); doc.setTextColor(102, 112, 133); doc.text(pdfTxt(`${c.nom} · Planning · page ${i} / ${n}`), W - M, 203, { align: 'right' }); }
  doc.save(`Planning_${c.nom.replace(/[^\w-]+/g, '_')}_${aujourdHui()}.pdf`);
  toast('Planning PDF généré', 'succes');
}

/* ------------------------------- Actions --------------------------------- */
Object.assign(ACT, {
  planGenerer: () => modalPlanGenerer(),
  planGenererOk: () => {
    const c = ch();
    c.planning = planningAuto(db, c.id, { debut: val('pgDebut') || c.dateDebut, effectif: Math.max(1, num(val('pgEff'))), chevauchement: num(val('pgChev')) });
    if (!c.dateDebut) c.dateDebut = val('pgDebut');
    save(); fermerModal(); render();
    const pl = calcPlanning(db, c.id);
    toast(`Planning généré : fin prévue le ${fmtDate(pl.finPlan)}`, 'succes');
  },
  planJalon: el => { const c = ch(); modalJalon(el.dataset.id ? (c.jalons || []).find(j => j.id === el.dataset.id) : null); },
  planJalonOk: () => {
    const c = ch();
    const libelle = val('jlLib');
    if (!libelle || !val('jlDate')) return toast('Libellé et date sont nécessaires.', 'alerte');
    c.jalons = c.jalons || [];
    const id = val('jlId');
    if (id) Object.assign(c.jalons.find(j => j.id === id), { libelle, date: val('jlDate') });
    else c.jalons.push({ id: uid(), libelle, date: val('jlDate'), fait: false });
    save(); fermerModal(); render();
  },
  planJalonSuppr: async el => {
    const c = ch();
    if (!await confirmer('Supprimer le jalon', 'Ce jalon sera retiré du planning.', { ok: 'Supprimer', danger: true })) return;
    c.jalons = (c.jalons || []).filter(j => j.id !== el.dataset.id); save(); render();
  },
  planPDF: () => planningPDF()
});

Object.assign(CHG, {
  planDate: el => {
    const c = ch();
    c.planning = c.planning || {};
    const p = c.planning[el.dataset.k] = Object.assign({ debut: '', fin: '' }, c.planning[el.dataset.k]);
    p[el.dataset.f] = el.value;
    if (p.debut && p.fin && p.fin < p.debut) { if (el.dataset.f === 'debut') p.fin = p.debut; else p.debut = p.fin; }
    save(); render();
  },
  planJalonFait: el => { const j = (ch().jalons || []).find(x => x.id === el.dataset.id); if (j) { j.fait = el.checked; save(); render(); } }
});
