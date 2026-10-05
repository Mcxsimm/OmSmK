/* ==========================================================================
   OmSmK — signature à l'écran (doigt, stylet ou souris)
   Les signatures sont enregistrées en PNG compact (dataURL) dans l'objet
   signé, donc synchronisées avec lui et reprises dans les PDF.
   ========================================================================== */
// deno-lint-ignore-file no-unused-vars
'use strict';

function padSignature(id) {
  return `<div class="sig-zone"><canvas class="sig-pad" id="${id}" data-vide="1" aria-label="Zone de signature"></canvas>
    <div class="sig-pied"><span class="xs muted">Signez dans le cadre</span><button type="button" class="btn ghost sm" data-act="sigEffacer" data-id="${id}">${icone('undo-2', 'sm')}Effacer</button></div></div>`;
}

// Prépare les zones de signature présentes (taille réelle, tracé au pointeur, signature existante)
function activerPads(racine = document, existantes = {}) {
  $$('canvas.sig-pad', racine).forEach(cv => {
    const r = cv.getBoundingClientRect();
    const dpr = globalThis.devicePixelRatio || 1;
    cv.width = Math.max(10, Math.round(r.width * dpr)); cv.height = Math.max(10, Math.round(r.height * dpr));
    const cx = cv.getContext('2d');
    cx.scale(dpr, dpr);
    cx.lineWidth = 2.2; cx.lineCap = 'round'; cx.lineJoin = 'round'; cx.strokeStyle = '#0e2340';
    const ex = existantes[cv.id];
    if (ex) {
      const img = new Image();
      img.onload = () => { const k = Math.min(r.width / img.width, r.height / img.height, 1); cx.drawImage(img, (r.width - img.width * k) / 2, (r.height - img.height * k) / 2, img.width * k, img.height * k); };
      img.src = ex;
      cv.dataset.vide = '0'; cv.dataset.initiale = '1';
    }
    let trace = false, dernier = null;
    const pos = e => { const b = cv.getBoundingClientRect(); return [e.clientX - b.left, e.clientY - b.top]; };
    cv.addEventListener('pointerdown', e => { e.preventDefault(); cv.setPointerCapture(e.pointerId); trace = true; dernier = pos(e); cx.beginPath(); cx.arc(dernier[0], dernier[1], 1, 0, Math.PI * 2); cx.fillStyle = '#0e2340'; cx.fill(); cv.dataset.vide = '0'; cv.dataset.initiale = '0'; });
    cv.addEventListener('pointermove', e => {
      if (!trace) return;
      const p = pos(e);
      cx.beginPath(); cx.moveTo(dernier[0], dernier[1]); cx.lineTo(p[0], p[1]); cx.stroke();
      dernier = p;
    });
    const fin = () => { trace = false; };
    cv.addEventListener('pointerup', fin); cv.addEventListener('pointercancel', fin);
  });
}

// PNG recadré sur le tracé, largeur 480 px au plus ; null si vide
function lireSignature(id) {
  const cv = document.getElementById(id);
  if (!cv || cv.dataset.vide === '1') return null;
  const cx = cv.getContext('2d');
  const { width: w, height: h } = cv;
  const d = cx.getImageData(0, 0, w, h).data;
  let x0 = w, y0 = h, x1 = -1, y1 = -1;
  for (let y = 0; y < h; y += 2) for (let x = 0; x < w; x += 2) {
    if (d[(y * w + x) * 4 + 3] > 20) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  }
  if (x1 < 0) return null;
  const m = 6;
  x0 = Math.max(0, x0 - m); y0 = Math.max(0, y0 - m); x1 = Math.min(w - 1, x1 + m); y1 = Math.min(h - 1, y1 + m);
  const k = Math.min(1, 480 / (x1 - x0 + 1));
  const out = document.createElement('canvas');
  out.width = Math.round((x1 - x0 + 1) * k); out.height = Math.round((y1 - y0 + 1) * k);
  out.getContext('2d').drawImage(cv, x0, y0, x1 - x0 + 1, y1 - y0 + 1, 0, 0, out.width, out.height);
  return out.toDataURL('image/png');
}
function effacerPad(id) {
  const cv = document.getElementById(id);
  if (!cv) return;
  cv.getContext('2d').clearRect(0, 0, cv.width, cv.height);
  cv.dataset.vide = '1'; cv.dataset.initiale = '0';
}

/* Recueil de plusieurs signatures dans une même fenêtre.
   opts : { titre, sousTitre, signataires: [{ cle, nom, role }], signatures: { cle: dataURL }, apres: signatures => void } */
let _sigCtx = null;
function modalSignatures(opts) {
  _sigCtx = opts;
  const existantes = {};
  opts.signataires.forEach((s, i) => { if ((opts.signatures || {})[s.cle]) existantes['sig' + i] = opts.signatures[s.cle]; });
  ouvrirModal(opts.titre, `<div class="sig-liste">${opts.signataires.map((s, i) => `<div class="sig-item">
      <div class="row" style="justify-content:space-between"><div><div class="strong">${esc(s.nom || '—')}</div><div class="sub">${esc(s.role || '')}</div></div>
        ${(opts.signatures || {})[s.cle] ? `<span class="badge pos">${icone('check', 'sm')}Signé</span>` : ''}</div>
      ${padSignature('sig' + i)}</div>`).join('')}</div>`,
    `<button class="btn" data-act="fermerModal">Annuler</button><button class="btn primary" data-act="sigEnregistrer">${icone('check')}Enregistrer les signatures</button>`,
    { icone: 'pencil', sousTitre: opts.sousTitre || '', pasDeFocus: true });
  requestAnimationFrame(() => activerPads($('#modalRoot'), existantes));
}

// Image d'une signature dans un PDF (cellule ou cadre), proportions conservées
function signaturePDF(doc, dataURL, x, y, w, h) {
  if (!dataURL) return;
  try {
    const p = doc.getImageProperties(dataURL);
    const k = Math.min(w / p.width, h / p.height);
    doc.addImage(dataURL, 'PNG', x + (w - p.width * k) / 2, y + (h - p.height * k) / 2, p.width * k, p.height * k);
  } catch (_e) { /* signature illisible : ignorée */ }
}

Object.assign(ACT, {
  sigEffacer: el => effacerPad(el.dataset.id),
  sigEnregistrer: () => {
    if (!_sigCtx) return fermerModal();
    const res = Object.assign({}, _sigCtx.signatures || {});
    _sigCtx.signataires.forEach((s, i) => {
      const cv = document.getElementById('sig' + i);
      if (!cv) return;
      if (cv.dataset.vide === '1') delete res[s.cle];
      else if (cv.dataset.initiale !== '1') { const v = lireSignature('sig' + i); if (v) res[s.cle] = v; }
    });
    const apres = _sigCtx.apres;
    _sigCtx = null;
    fermerModal();
    apres(res);
  }
});
