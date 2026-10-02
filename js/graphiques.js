/* ==========================================================================
   OmSmK — graphiques (SVG natif, sans bibliothèque)
   - courbe d'avancement : réel cumulé vs théorique (linéaire sur les dates)
   - écarts d'heures par phase : barres divergentes (gain / dépassement)
   Palette validée daltonisme (voir README) ; texte toujours en couleurs de
   texte, jamais en couleur de série.
   ========================================================================== */
// deno-lint-ignore-file no-unused-vars
'use strict';

const PALETTE_IMPRESSION = {
  serie1: '#2a78d6', serie2: '#eb6834', pos: '#2a78d6', neg: '#e34948', grille: '#e4e7ec', base: '#98a2b3',
  texte: '#475467', texteFort: '#101828', surface: '#ffffff', police: 'Helvetica, Arial, sans-serif'
};
const PALETTE_ECRAN = {
  serie1: 'var(--serie-1)', serie2: 'var(--serie-2)', pos: 'var(--div-pos)', neg: 'var(--div-neg)', grille: 'var(--grid)', base: 'var(--border-strong)',
  texte: 'var(--text-3)', texteFort: 'var(--text-2)', surface: 'var(--surface)', police: 'var(--font)'
};

/* ------------------------------- Données --------------------------------- */
// Avancement hebdomadaire : réel (cumul pondéré des saisies) et théorique (linéaire début → fin)
function serieAvancement(base, cid) {
  const c = base.chantiers.find(x => x.id === cid);
  if (!c) return [];
  const saisies = base.suivi.filter(s => s.chantierId === cid).map(s => s.semaine).sort();
  const auj = lundi(aujourdHui());
  const debut = c.dateDebut ? lundi(c.dateDebut) : saisies[0];
  if (!debut) return [];
  const derniereSaisie = saisies[saisies.length - 1] || debut;
  let fin = c.dateFin ? lundi(c.dateFin) : derniereSaisie;
  if (auj > fin && (!c.dateFin || auj <= lundi(c.dateFin))) fin = auj;
  if (derniereSaisie > fin) fin = derniereSaisie;
  const t0 = new Date(c.dateDebut || debut).getTime();
  const t1 = c.dateFin ? new Date(c.dateFin).getTime() + 86400000 : null;
  const pts = [];
  for (let s = debut, i = 0; s <= fin && i < 160; s = addDays(s, 7), i++) {
    const finSem = addDays(s, 6);
    const p = { semaine: s, n: i + 1, reel: null, theo: null };
    if (s <= derniereSaisie && saisies.length) p.reel = calcSuivi(base, cid, finSem).tot.pct;
    if (t1) p.theo = Math.max(0, Math.min(1, (new Date(finSem).getTime() + 86400000 - t0) / (t1 - t0)));
    pts.push(p);
  }
  return pts;
}

/* ------------------------------- Tracés ---------------------------------- */
// Barre horizontale à bout arrondi (4 px) côté données, carrée côté ligne de base
function barreH(x0, x1, y, h, r = 4) {
  const g = Math.min(x0, x1), d = Math.max(x0, x1), w = d - g;
  if (w < 0.5) return '';
  r = Math.min(r, w, h / 2);
  if (x1 >= x0) return `M${g},${y}H${d - r}Q${d},${y} ${d},${y + r}V${y + h - r}Q${d},${y + h} ${d - r},${y + h}H${g}Z`;
  return `M${d},${y}H${g + r}Q${g},${y} ${g},${y + r}V${y + h - r}Q${g},${y + h} ${g + r},${y + h}H${d}Z`;
}

function courbeAvancement(pts, largeur, opts = {}) {
  const P = opts.impression ? PALETTE_IMPRESSION : PALETTE_ECRAN;
  const W = Math.max(300, largeur), H = opts.hauteur || 260;
  const m = { g: 40, d: 92, h: 14, b: 30 };
  const iw = W - m.g - m.d, ih = H - m.h - m.b;
  const n = pts.length;
  const x = i => m.g + (n <= 1 ? iw / 2 : i * iw / (n - 1));
  const y = v => m.h + ih - v * ih;
  const id = 'c' + Math.random().toString(36).slice(2, 7);
  let s = `<svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg" font-family="${P.police}" role="img" aria-label="Courbe d'avancement réel et théorique">`;
  [0, .25, .5, .75, 1].forEach(v => {
    s += `<line x1="${m.g}" x2="${m.g + iw}" y1="${y(v)}" y2="${y(v)}" stroke="${v === 0 ? P.base : P.grille}" stroke-width="1"/>`;
    s += `<text x="${m.g - 8}" y="${y(v) + 4}" text-anchor="end" font-size="11" fill="${P.texte}">${v * 100}%</text>`;
  });
  const pas = Math.max(1, Math.ceil(n / Math.max(2, Math.floor(iw / 70))));
  pts.forEach((p, i) => {
    if (i % pas === 0 || i === n - 1) s += `<text x="${x(i)}" y="${H - 8}" text-anchor="middle" font-size="11" fill="${P.texte}">S${semISO(p.semaine)}</text>`;
  });
  const ligne = (cle) => pts.map((p, i) => p[cle] === null ? null : [x(i), y(p[cle])]).filter(Boolean);
  const theo = ligne('theo'), reel = ligne('reel');
  if (theo.length > 1) s += `<path d="M${theo.map(q => q.join(',')).join('L')}" fill="none" stroke="${P.serie2}" stroke-width="2" stroke-dasharray="6 4" stroke-linecap="round"/>`;
  if (reel.length) {
    if (reel.length > 1) {
      s += `<path d="M${reel[0][0]},${y(0)}L${reel.map(q => q.join(',')).join('L')}L${reel[reel.length - 1][0]},${y(0)}Z" fill="${P.serie1}" fill-opacity=".1" stroke="none"/>`;
      s += `<path d="M${reel.map(q => q.join(',')).join('L')}" fill="none" stroke="${P.serie1}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>`;
    }
  }
  // Étiquettes directes en bout de courbe (texte en couleur de texte)
  const fins = [];
  if (reel.length) { const q = reel[reel.length - 1]; const v = pts.filter(p => p.reel !== null).pop().reel; fins.push({ q, txt: `Réel ${pc(v)}`, c: P.serie1 }); }
  if (theo.length) {
    const iR = reel.length ? pts.findIndex(p => p.reel === null) - 1 : n - 1;
    const iT = iR >= 0 && iR < n ? iR : n - 1;
    if (pts[iT] && pts[iT].theo !== null) fins.push({ q: [x(iT), y(pts[iT].theo)], txt: `Prévu ${pc(pts[iT].theo)}`, c: P.serie2 });
  }
  if (fins.length === 2 && Math.abs(fins[0].q[1] - fins[1].q[1]) < 16) {
    const [a, b] = fins[0].q[1] < fins[1].q[1] ? [fins[0], fins[1]] : [fins[1], fins[0]];
    a.ly = a.q[1] - 8; b.ly = b.q[1] + 8;
  }
  fins.forEach(f => {
    s += `<circle cx="${f.q[0]}" cy="${f.q[1]}" r="5" fill="${f.c}" stroke="${P.surface}" stroke-width="2"/>`;
    s += `<text x="${f.q[0] + 10}" y="${(f.ly ?? f.q[1]) + 4}" font-size="11.5" font-weight="600" fill="${P.texteFort}">${f.txt}</text>`;
  });
  if (!opts.impression) {
    // Couche de survol : réticule + info-bulle par semaine
    s += `<line id="${id}x" x1="0" x2="0" y1="${m.h}" y2="${m.h + ih}" stroke="${P.base}" stroke-width="1" visibility="hidden"/>`;
    const lw = n <= 1 ? iw : iw / (n - 1);
    pts.forEach((p, i) => {
      const tip = { h: `Semaine ${semISO(p.semaine)} · ${fmtDateCourt(p.semaine)}`, r: [] };
      if (p.reel !== null) tip.r.push(['Réel', pc(p.reel), 'serie-1']);
      if (p.theo !== null) tip.r.push(['Prévu', pc(p.theo), 'serie-2']);
      if (p.reel !== null && p.theo !== null) tip.r.push(['Écart', signe((p.reel - p.theo) * 100, 0) + ' pts', '']);
      s += `<rect x="${x(i) - lw / 2}" y="${m.h}" width="${lw}" height="${ih}" fill="transparent" data-tip='${esc(JSON.stringify(tip))}' data-cross="${id}x" data-cx="${x(i)}"/>`;
    });
  }
  return s + '</svg>';
}

function barresEcarts(rows, largeur, opts = {}) {
  const P = opts.impression ? PALETTE_IMPRESSION : PALETTE_ECRAN;
  const W = Math.max(280, largeur);
  const compact = W < 520;              // petit écran : nom de phase au-dessus de la barre
  const hb = compact ? 14 : 18, pasY = compact ? 46 : 34;
  const m = compact ? { g: 8, d: 8, h: 6, b: 6 } : { g: Math.min(180, W * 0.3), d: 8, h: 8, b: 8 };
  const H = m.h + m.b + rows.length * pasY;
  const iw = W - m.g - m.d;
  const place = 58;                     // réserve pour l'étiquette de valeur de chaque côté
  const max = Math.max(1, ...rows.map(r => Math.abs(r.ecartH)));
  const x0 = m.g + iw / 2;
  const x = v => x0 + v / max * (iw / 2 - place);
  let s = `<svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg" font-family="${P.police}" role="img" aria-label="Écart d'heures par phase">`;
  s += `<line x1="${x0}" x2="${x0}" y1="${m.h - 4}" y2="${H - m.b + 4}" stroke="${P.base}" stroke-width="1"/>`;
  rows.forEach((r, i) => {
    const yb = m.h + i * pasY + (compact ? 22 : (pasY - hb) / 2);
    const nom = r.phase.length > 30 ? r.phase.slice(0, 29) + '…' : r.phase;
    if (compact) s += `<text x="${m.g}" y="${m.h + i * pasY + 13}" font-size="12" fill="${P.texteFort}">${esc(nom)}</text>`;
    else s += `<text x="${m.g - 12}" y="${yb + hb / 2 + 4}" text-anchor="end" font-size="12" fill="${P.texteFort}">${esc(nom)}</text>`;
    const v = r.ecartH;
    if (Math.abs(v) >= 0.05) s += `<path d="${barreH(x0, x(v), yb, hb)}" fill="${v >= 0 ? P.pos : P.neg}"/>`;
    else s += `<circle cx="${x0}" cy="${yb + hb / 2}" r="3" fill="${P.base}"/>`;
    const tx = v >= 0 ? Math.max(x(v), x0) + 6 : Math.min(x(v), x0) - 6;
    s += `<text x="${tx}" y="${yb + hb / 2 + 4}" text-anchor="${v >= 0 ? 'start' : 'end'}" font-size="11.5" font-weight="600" fill="${P.texteFort}">${r.heures ? signe(v) + ' h' : '—'}</text>`;
    if (!opts.impression) {
      const tip = { h: `${r.ouvrage} · ${r.phase}`, r: [['Budget', fmt(r.budget) + ' h', ''], ['Avancement', pc(r.pct), ''], ['Heures pointées', fmt(r.heures) + ' h', ''], ['Écart à date', signe(v) + ' h', v >= 0 ? 'div-pos' : 'div-neg'], ['Impact', signeE(r.impact), '']] };
      s += `<rect x="0" y="${m.h + i * pasY}" width="${W}" height="${pasY}" fill="transparent" data-tip='${esc(JSON.stringify(tip))}'/>`;
    }
  });
  return s + '</svg>';
}

/* ------------------------- Rendu & interactions -------------------------- */
const _graphiques = new Map();
function graphique(cle, dessiner) {
  _graphiques.set(cle, dessiner);
  return `<div class="chart" data-graph="${cle}"></div>`;
}
function dessinerGraphiques() {
  $$('[data-graph]').forEach(el => {
    const f = _graphiques.get(el.dataset.graph);
    if (f) el.innerHTML = f(el.clientWidth || 600);
  });
}

function afficherInfoBulle(cible, ev) {
  const tip = $('#vizTip');
  let d;
  try { d = JSON.parse(cible.dataset.tip); } catch (_e) { return; }
  tip.innerHTML = `<div class="t-h">${esc(d.h)}</div>` + d.r.map(([l, v, c]) =>
    `<div class="t-r"><span>${c ? `<i style="background:var(--${c})"></i>` : ''}${esc(l)}</span><b>${esc(v)}</b></div>`).join('');
  tip.classList.add('show');
  const w = tip.offsetWidth, h = tip.offsetHeight;
  let gx = ev.clientX + 14, gy = ev.clientY - h - 12;
  if (gx + w > innerWidth - 8) gx = ev.clientX - w - 14;
  if (gy < 8) gy = ev.clientY + 16;
  tip.style.left = gx + 'px'; tip.style.top = gy + 'px';
  if (cible.dataset.cross) {
    const l = document.getElementById(cible.dataset.cross);
    if (l) { l.setAttribute('x1', cible.dataset.cx); l.setAttribute('x2', cible.dataset.cx); l.setAttribute('visibility', 'visible'); }
  }
}
function masquerInfoBulle(cible) {
  $('#vizTip').classList.remove('show');
  if (cible && cible.dataset.cross) { const l = document.getElementById(cible.dataset.cross); if (l) l.setAttribute('visibility', 'hidden'); }
}

// SVG → PNG (pour le rapport PDF)
function svgEnPng(svg, largeur, hauteur, echelle = 2) {
  return new Promise((ok, ko) => {
    const img = new Image();
    img.onload = () => {
      const cv = document.createElement('canvas');
      cv.width = largeur * echelle; cv.height = hauteur * echelle;
      const cx = cv.getContext('2d');
      cx.fillStyle = '#fff'; cx.fillRect(0, 0, cv.width, cv.height);
      cx.drawImage(img, 0, 0, cv.width, cv.height);
      ok(cv.toDataURL('image/png'));
    };
    img.onerror = ko;
    img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
  });
}
