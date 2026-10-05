/* ==========================================================================
   OmSmK — rapport mensuel d'avancement pour le maître d'œuvre (PDF)
   Avancement du mois par phase, planning et délai, effectifs pointés,
   intempéries, faits marquants du journal, sécurité, qualité, facturation,
   points en attente et photos du mois.
   ========================================================================== */
'use strict';

const blobEnDataURL = b => new Promise(ok => { const r = new FileReader(); r.onload = () => ok(r.result); r.onerror = () => ok(null); r.readAsDataURL(b); });

function modalRapportMensuel() {
  const c = ch();
  const auj = aujourdHui();
  // Proposer le mois écoulé en début de mois, sinon le mois en cours
  const defaut = Number(auj.slice(8, 10)) <= 10 ? moisPrecedent(auj.slice(0, 7)) : auj.slice(0, 7);
  const debut = (c.dateDebut || auj).slice(0, 7);
  const mois = [];
  for (let m = auj.slice(0, 7), i = 0; m >= debut && i < 36; m = moisPrecedent(m), i++) mois.push([m, moisLong(m)]);
  if (!mois.length) mois.push([auj.slice(0, 7), moisLong(auj.slice(0, 7))]);
  const nbPhotos = m => photosDe(c.id).filter(p => p.date.startsWith(m)).length;
  ouvrirModal('Rapport mensuel d\'avancement', `
    <p class="muted" style="margin-bottom:14px">Synthèse du mois pour le maître d'œuvre et le maître d'ouvrage, établie à partir du suivi, du pointage, du journal, de la sécurité, des réserves et des situations.</p>
    ${selectHTML('rmMois', 'Mois', mois, mois.some(x => x[0] === defaut) ? defaut : mois[0][0])}
    <label class="checkbox field"><input type="checkbox" id="rmPhotos" checked><span>Joindre les photos du mois (6 au plus) <span class="muted small">— ${nbPhotos(defaut)} photo(s) en ${moisLong(defaut)}</span></span></label>
    <label class="checkbox field"><input type="checkbox" id="rmFinances" checked><span>Inclure la facturation (situations de travaux)</span></label>
    ${zoneTexte('rmMot', 'Commentaire du conducteur de travaux (facultatif)', '', 'rows="3" placeholder="points forts du mois, difficultés, besoins de décisions…"')}`,
    `<button class="btn" data-act="fermerModal">Annuler</button><button class="btn primary" data-act="rmGenerer">${icone('file-text')}Générer le PDF</button>`, { icone: 'file-text' });
}

async function rapportMensuelPDF(mois, opts = {}) {
  const c = ch();
  if (!globalThis.jspdf) return toast('Bibliothèque PDF non chargée.', 'erreur');
  toast('Génération du rapport mensuel…');
  const { jsPDF } = globalThis.jspdf;
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const S = syntheseMois(db, c.id, mois);
  const pl = calcPlanning(db, c.id, S.au < aujourdHui() ? S.au : aujourdHui());
  const NAVY = [14, 35, 64], GRIS = [102, 112, 133], TEXTE = [16, 24, 40];
  let y = enTeteDocument(doc, 'RAPPORT MENSUEL D\'AVANCEMENT', moisLong(mois).replace(/^./, x => x.toUpperCase()), [`Établi le ${fmtDate(aujourdHui())}`, nomUser() ? `par ${nomUser()}` : '']);
  const h1 = cadre(doc, 14, y, 88, 'Chantier', [c.nom, c.adresse || '', refsChantier(c)].filter(Boolean));
  const h2 = cadre(doc, 108, y, 88, 'Destinataires', [c.client ? `Maître d'ouvrage : ${c.client}` : 'Maître d\'ouvrage', ...contactsDe(c.id).filter(k => k.role === 'Maître d\'œuvre').slice(0, 1).map(k => `Maître d'œuvre : ${k.societe || k.nom}`)]);
  y += Math.max(h1, h2) + 7;
  const titre = (t, besoin = 30) => {
    y += 3;
    if (y + besoin > 280) { doc.addPage(); y = 20; }
    doc.setFont('helvetica', 'bold'); doc.setFontSize(11); doc.setTextColor(...NAVY); doc.text(pdfTxt(t), 14, y);
    y += 2; doc.setDrawColor(232, 89, 12); doc.setLineWidth(0.6); doc.line(14, y, 30, y); doc.setLineWidth(0.2); y += 6;
  };
  const para = (t, taille = 9.5) => {
    doc.setFont('helvetica', 'normal'); doc.setFontSize(taille); doc.setTextColor(...TEXTE);
    doc.splitTextToSize(pdfTxt(t), 182).forEach(l => { if (y > 282) { doc.addPage(); y = 20; } doc.text(l, 14, y); y += taille * 0.48; });
    y += 2;
  };

  // Chiffres clés
  const tuiles = [
    ['Avancement fin de mois', pc(S.avancement.fin), `+${Math.round(S.avancement.gain * 100)} pts sur le mois`],
    ['Effectif moyen', S.effectif.jours ? fmt(S.effectif.moyen, 1) : '-', `${fmt(S.effectif.joursHomme, 1)} jours-homme pointés`],
    ['Intempéries', String(S.joursIntemperie), 'jour(s) d\'arrêt'],
    ['Délai', pl.finProjetee ? (pl.retard ? `+${pl.retard} j` : 'Tenu') : '-', pl.finProjetee ? `fin projetée ${fmtDate(pl.finProjetee)}` : 'planning non établi']
  ];
  tuiles.forEach(([l, v, s], i) => {
    const x = 14 + i * 46;
    doc.setFillColor(248, 249, 251); doc.setDrawColor(228, 232, 238); doc.roundedRect(x, y, 43, 24, 1.5, 1.5, 'FD');
    doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5); doc.setTextColor(...GRIS); doc.text(pdfTxt(l), x + 3, y + 5);
    doc.setFont('helvetica', 'bold'); doc.setFontSize(15); doc.setTextColor(...TEXTE); doc.text(pdfTxt(v), x + 3, y + 13.5);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(7); doc.setTextColor(...GRIS); doc.text(doc.splitTextToSize(pdfTxt(s), 38)[0], x + 3, y + 19.5);
  });
  y += 32;
  if (opts.mot) { titre('Synthèse du conducteur de travaux', 20); para(opts.mot); }

  // Avancement par phase
  titre('Avancement des travaux');
  doc.autoTable(Object.assign({}, STYLE_TABLE, {
    startY: y,
    head: [['Ouvrage', 'Phase', 'Début de mois', 'Fin de mois', 'Progression'].map(pdfTxt)],
    body: S.phases.map(p => [p.ouvrage, p.phase, pc(p.debut), pc(p.fin), p.fin - p.debut > 0.004 ? '+' + Math.round((p.fin - p.debut) * 100) + ' pts' : '-'].map(pdfTxt))
      .concat([['', 'Avancement global', pc(S.avancement.debut), pc(S.avancement.fin), '+' + Math.round(S.avancement.gain * 100) + ' pts'].map(pdfTxt)]),
    columnStyles: { 2: { halign: 'right' }, 3: { halign: 'right' }, 4: { halign: 'right', fontStyle: 'bold' } },
    didParseCell: d => { if (d.section === 'body' && d.row.index === S.phases.length) { d.cell.styles.fontStyle = 'bold'; d.cell.styles.fillColor = [244, 246, 249]; } }
  }));
  y = doc.lastAutoTable.finalY + 8;

  // Planning
  if (pl.rows.some(r => r.debut && r.fin)) {
    titre('Planning et délai', 80);
    const svg = diagrammeGantt(pl, 1000, { impression: true, auj: S.au < aujourdHui() ? S.au : aujourdHui() });
    const hPx = Number((svg.match(/height="(\d+)"/) || [])[1]) || 300;
    try {
      const png = await svgEnPng(svg, 1000, hPx);
      let wMm = 182, hMm = wMm * hPx / 1000;
      if (hMm > 90) { wMm = wMm * 90 / hMm; hMm = 90; }
      if (y + hMm > 282) { doc.addPage(); y = 20; }
      doc.addImage(png, 'PNG', 14, y, wMm, hMm); y += hMm + 4;
    } catch (_e) { /* graphique non disponible */ }
    para(pl.retard ? `Fin projetée au ${fmtDate(pl.finProjetee)} au rythme constaté, soit ${pl.retard} jour(s) ouvré(s) après la fin contractuelle du ${fmtDate(pl.finContrat)}.` : `Fin projetée au ${fmtDate(pl.finProjetee)} : le délai contractuel${pl.finContrat ? ' du ' + fmtDate(pl.finContrat) : ''} est tenu.`);
    const jal = pl.jalons.filter(j => j.date >= S.du && j.date <= addDays(S.au, 45));
    if (jal.length) para('Jalons : ' + jal.map(j => `${j.libelle} le ${fmtDate(j.date)}${j.fait ? ' (atteint)' : ''}`).join(' ; ') + '.', 9);
  }

  // Effectifs et intempéries
  titre('Effectifs et conditions', 26);
  para(S.effectif.jours
    ? `${fmt(S.effectif.joursHomme, 1)} jours-homme pointés sur ${S.effectif.jours} jour(s) travaillé(s), soit un effectif moyen de ${fmt(S.effectif.moyen, 1)} compagnon(s) (${fmt(S.effectif.heures, 0)} h).`
    : 'Aucun pointage journalier enregistré sur le mois.');
  para(S.joursIntemperie ? `${S.joursIntemperie} jour(s) d'arrêt pour intempéries${S.effectif.intemp ? ` (${fmt(S.effectif.intemp, 1)} h déclarées)` : ''}.` : 'Aucun arrêt pour intempéries.');

  // Faits marquants
  const faits = S.journal.filter(j => j.texte || j.intemperie);
  if (faits.length) {
    titre('Faits marquants', 24);
    faits.slice(0, 12).forEach(j => para(`${fmtDate(j.date)} — ${j.intemperie ? 'Intempérie' + (j.cause ? ' (' + j.cause + ')' : '') + '. ' : ''}${j.texte || ''}`, 9));
  }

  // Sécurité et qualité
  titre('Sécurité et qualité', 30);
  const sec = S.securite;
  para(`Sécurité : ${sec.causeries} quart(s) d'heure sécurité, ${sec.accueils} accueil(s) de nouveaux arrivants, ${sec.visites} visite(s) sécurité, ${sec.permis} permis de feu. ${sec.accidents ? sec.accidents + ' accident(s) déclaré(s).' : 'Aucun accident.'}`);
  para(`Qualité : ${S.reserves.creees} réserve(s) émise(s) et ${S.reserves.levees} levée(s) dans le mois ; ${S.reserves.ouvertes} réserve(s) ouverte(s) en fin de mois.`);

  // Facturation
  if (opts.finances) {
    const sits = situationsDe(db, c.id).filter(s => s.mois === mois);
    const f = calcFinances(db, c.id);
    if (f.ca) {
      titre('Facturation', 24);
      if (sits.length) sits.forEach(s => { const t = calcSituation(db, c.id, s.id).tot; para(`Situation n° ${s.numero} (${libStatut(STATUTS_SITUATION, s.statut).toLowerCase()}) : ${fmtE2(t.mois)} HT pour le mois, ${fmtE2(t.cumul)} HT cumulés, soit ${pc(t.pct)} du marché.`); });
      else para(`Aucune situation pour ce mois. Facturé cumulé : ${fmtE(f.facture)} HT (${pc(f.avFinancier)} du marché).`);
    }
  }

  // Points en attente (actions ouvertes)
  const att = actionsDe(db, c.id).filter(a => actionOuverte(a) && (a.creeLe || '') <= S.au);
  if (att.length) {
    titre('Points en attente', 30);
    doc.autoTable(Object.assign({}, STYLE_TABLE, {
      startY: y,
      head: [['Action', 'Responsable', 'Échéance', 'État'].map(pdfTxt)],
      body: att.map(a => [a.libelle, a.responsable || '-', a.echeance ? fmtDate(a.echeance) : '-', actionEnRetard(a, S.au) ? 'En retard' : 'En cours'].map(pdfTxt)),
      columnStyles: { 0: { cellWidth: 86 }, 2: { cellWidth: 24 }, 3: { cellWidth: 22 } },
      didParseCell: d => { if (d.section === 'body' && d.column.index === 3 && d.cell.raw === 'En retard') d.cell.styles.textColor = [180, 35, 24]; }
    }));
    y = doc.lastAutoTable.finalY + 8;
  }

  // Photos du mois
  if (opts.photos) {
    const phs = photosDe(c.id).filter(p => p.date >= S.du && p.date <= S.au).slice(0, 6).reverse();
    const imgs = [];
    for (const p of phs) {
      const b = await blobPhoto(p.id, false);
      const u = b ? await blobEnDataURL(b) : null;
      if (u) imgs.push({ p, u });
    }
    if (imgs.length) {
      titre('Photos du mois', 70);
      const w = 88, h = 62;
      imgs.forEach((im, i) => {
        if (i % 2 === 0 && i > 0) y += h + 12;
        if (y + h + 10 > 285) { doc.addPage(); y = 20; }
        const x = 14 + (i % 2) * (w + 6);
        try {
          const pr = doc.getImageProperties(im.u);
          const k = Math.min(w / pr.width, h / pr.height);
          doc.setFillColor(244, 246, 249); doc.rect(x, y, w, h, 'F');
          doc.addImage(im.u, 'JPEG', x + (w - pr.width * k) / 2, y + (h - pr.height * k) / 2, pr.width * k, pr.height * k);
        } catch (_e) { /* image illisible */ }
        doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5); doc.setTextColor(...GRIS);
        doc.text(doc.splitTextToSize(pdfTxt(`${fmtDate(im.p.date)}${im.p.legende ? ' — ' + im.p.legende : ''}`), w)[0], x, y + h + 4);
      });
      y += h + 12;
    }
  }

  piedDocument(doc, `${entreprise().nom || 'OmSmK'}  ·  ${c.nom}  ·  Rapport mensuel ${moisLong(mois)}`);
  doc.save(`Rapport_mensuel_${mois}_${c.nom.replace(/[^\w-]+/g, '_')}.pdf`);
  toast('Rapport mensuel généré', 'succes');
}

Object.assign(ACT, {
  rapportMensuel: () => modalRapportMensuel(),
  rmGenerer: () => {
    const opts = { photos: $('#rmPhotos').checked, finances: $('#rmFinances').checked, mot: val('rmMot') };
    const mois = val('rmMois');
    fermerModal();
    rapportMensuelPDF(mois, opts);
  }
});
