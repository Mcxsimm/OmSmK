/* ==========================================================================
   OmSmK — briques d'interface : formats, icônes, notifications, boîtes de
   dialogue, menus.
   ========================================================================== */
// deno-lint-ignore-file no-unused-vars
'use strict';

const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/* -------------------------------- Formats -------------------------------- */
const fmt = (n, d = 1) => Number(n || 0).toLocaleString('fr-FR', { minimumFractionDigits: d, maximumFractionDigits: d });
const fmtE = n => Number(n || 0).toLocaleString('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 });
// Au centime près : documents (situations, commandes) et montants unitaires
const fmtE2 = n => Number(n || 0).toLocaleString('fr-FR', { style: 'currency', currency: 'EUR', minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtCompact = n => Math.abs(n) >= 10000 ? Number(n).toLocaleString('fr-FR', { notation: 'compact', maximumFractionDigits: 1 }) : fmt(n, Math.abs(n) >= 100 ? 0 : 1);
const pc = n => Math.round((n || 0) * 100) + ' %';
const signe = (n, d = 1) => (n > 0.04 ? '+' : n < -0.04 ? '−' : '') + fmt(Math.abs(n), d);
const signeE = n => (n > 0.5 ? '+' : n < -0.5 ? '−' : '') + fmtE(Math.abs(n));
const cls = n => n > 0.04 ? 'pos' : (n < -0.04 ? 'neg' : '');
function fmtDate(s, long) {
  if (!s) return '';
  const d = new Date(s + 'T00:00:00');
  return long ? d.toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'long', year: 'numeric' }) : d.toLocaleDateString('fr-FR');
}
function fmtDateCourt(s) { return s ? new Date(s + 'T00:00:00').toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' }) : ''; }
function depuis(s) {
  if (!s) return '';
  const j = Math.round((new Date(aujourdHui() + 'T00:00:00') - new Date(s + 'T00:00:00')) / 86400000);
  if (j === 0) return 'aujourd\'hui';
  if (j === 1) return 'hier';
  if (j > 1 && j < 7) return `il y a ${j} jours`;
  return fmtDateCourt(s);
}
function lireJSON(k, def) { try { const v = JSON.parse(localStorage.getItem(k)); return v ?? def; } catch (_e) { return def; } }
function initiales(nomComplet) {
  return String(nomComplet || '').split(/\s+/).filter(Boolean).slice(0, 2).map(p => p[0]).join('').toUpperCase() || '?';
}

/* -------------------------------- Icônes --------------------------------- */
function icone(nom, cls = '') {
  const p = ICONES[nom];
  if (!p) return '';
  return `<svg class="ico ${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${p}</svg>`;
}
// Remplace les <span data-icone="..."> statiques du HTML
function hydraterIcones(racine = document) {
  $$('[data-icone]', racine).forEach(el => { el.outerHTML = icone(el.dataset.icone); });
}

/* ----------------------------- Notifications ----------------------------- */
function toast(msg, type = 'info') {
  const icones = { info: 'info', succes: 'circle-check', erreur: 'circle-alert', alerte: 'triangle-alert' };
  const el = document.createElement('div');
  el.className = 'toast ' + type;
  el.innerHTML = icone(icones[type] || 'info') + `<span>${esc(msg)}</span>`;
  $('#toasts').appendChild(el);
  setTimeout(() => { el.style.transition = 'opacity .25s'; el.style.opacity = '0'; setTimeout(() => el.remove(), 260); }, type === 'erreur' ? 5200 : 3000);
}

function telecharger(nom, contenu, type) {
  const blob = contenu instanceof Blob ? contenu : new Blob([contenu], { type });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = nom;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
}

/* -------------------------------- Modales -------------------------------- */
let modalVerrou = false;
let _resoudreConfirmation = null;

/* opts : { icone, sousTitre, taille: 'wide' | 'narrow', verrou, pasDeFocus, danger } */
function ouvrirModal(titre, corps, pied = '', opts = {}) {
  if (_resoudreConfirmation) { _resoudreConfirmation(false); _resoudreConfirmation = null; }
  modalVerrou = !!opts.verrou;
  $('#modalRoot').innerHTML = `<div class="modal-back"><div class="modal ${opts.taille || ''}" role="dialog" aria-modal="true" aria-label="${esc(titre)}">
    <div class="modal-head">
      ${opts.icone ? `<div class="m-ico ${opts.danger ? 'danger' : ''}">${icone(opts.icone)}</div>` : ''}
      <div class="m-titre"><h2>${esc(titre)}</h2>${opts.sousTitre ? `<p>${opts.sousTitre}</p>` : ''}</div>
      ${opts.verrou ? '' : `<button class="btn ghost icon sm" data-act="fermerModal" aria-label="Fermer">${icone('x')}</button>`}
    </div>
    <div class="modal-body">${corps}</div>
    ${pied ? `<div class="modal-foot">${pied}</div>` : ''}
  </div></div>`;
  const premier = $('#modalRoot .modal-body input:not([type=checkbox]):not([type=hidden]), #modalRoot .modal-body select, #modalRoot .modal-body textarea');
  if (premier && !opts.pasDeFocus) setTimeout(() => premier.focus(), 60);
}
function fermerModal() {
  $('#modalRoot').innerHTML = '';
  modalVerrou = false;
  if (_resoudreConfirmation) { _resoudreConfirmation(false); _resoudreConfirmation = null; }
  if (typeof arreterScan === 'function') arreterScan();
}
const modalOuverte = () => !!$('#modalRoot').innerHTML;

// Confirmation (remplace window.confirm) : renvoie une promesse booléenne
function confirmer(titre, message, { ok = 'Confirmer', danger = false, icone: ic } = {}) {
  ouvrirModal(titre, `<p class="muted" style="color:var(--text-2)">${message}</p>`,
    `<button class="btn" data-act="confirmNon">Annuler</button><button class="btn ${danger ? 'danger-fill' : 'primary'}" data-act="confirmOui">${esc(ok)}</button>`,
    { taille: 'narrow', icone: ic || (danger ? 'triangle-alert' : 'info'), danger, pasDeFocus: true });
  return new Promise(resoudre => { _resoudreConfirmation = resoudre; });
}
function _repondreConfirmation(v) {
  const r = _resoudreConfirmation;
  _resoudreConfirmation = null;
  $('#modalRoot').innerHTML = '';
  if (r) r(v);
}

const val = id => { const el = document.getElementById(id); return el ? el.value.trim() : ''; };
const champ = (id, label, value = '', type = 'text', extra = '') =>
  `<div class="field"><label class="label" for="${id}">${label}</label><input class="input" id="${id}" type="${type}" value="${esc(value)}" ${extra}></div>`;
const zoneTexte = (id, label, value = '', extra = '') =>
  `<div class="field"><label class="label" for="${id}">${label}</label><textarea class="input" id="${id}" ${extra}>${esc(value)}</textarea></div>`;
const selectHTML = (id, label, options, value, extra = '') =>
  `<div class="field"><label class="label" for="${id}">${label}</label><select class="input" id="${id}" ${extra}>${options.map(o => {
    const [v, t] = Array.isArray(o) ? o : [o, o];
    return `<option value="${esc(v)}" ${v === value ? 'selected' : ''}>${esc(t)}</option>`;
  }).join('')}</select></div>`;

/* --------------------------------- Menus --------------------------------- */
function ouvrirPopover(ancre, html, largeur = 320) {
  const r = ancre.getBoundingClientRect();
  const gauche = Math.min(Math.max(8, r.left), innerWidth - largeur - 8);
  const haut = r.bottom + 6;
  $('#popRoot').innerHTML = `<div class="popover" style="left:${gauche}px;top:${haut}px;width:${largeur}px">${html}</div>`;
  const s = $('#popRoot input');
  if (s) setTimeout(() => s.focus(), 30);
}
function fermerPopover() { $('#popRoot').innerHTML = ''; }

/* ------------------------------ Mise en page ----------------------------- */
function enTetePage({ eyebrow = '', titre, sous = [], actions = '' }) {
  return `<div class="page-head"><div class="ph-txt">
      ${eyebrow ? `<div class="eyebrow">${esc(eyebrow)}</div>` : ''}
      <h1>${esc(titre)}</h1>
      ${sous.length ? `<div class="sub">${sous.filter(Boolean).join('')}</div>` : ''}
    </div>${actions ? `<div class="page-actions">${actions}</div>` : ''}</div>`;
}
const sousInfo = (ic, txt) => txt ? `<span>${icone(ic, 'sm')}${esc(txt)}</span>` : '';

function vide(ic, titre, texte, actions = '') {
  return `<div class="empty"><div class="e-ico">${icone(ic, 'lg')}</div><h3>${esc(titre)}</h3><p>${texte}</p>${actions ? `<div class="row" style="justify-content:center">${actions}</div>` : ''}</div>`;
}

function barre(p, extra = '') {
  return `<div class="progress ${extra}"><i style="width:${Math.max(0, Math.min(100, p * 100))}%"></i></div>`;
}

function deltaE(n) {
  const c = n > 0.5 ? 'pos' : n < -0.5 ? 'neg' : 'neutre';
  const ic = n > 0.5 ? 'arrow-up-right' : n < -0.5 ? 'arrow-down-right' : 'minus';
  return `<span class="delta ${c}">${icone(ic, 'sm')}${signeE(n)}</span>`;
}
function delta(n, unite = '', d = 1) {
  const c = n > 0.04 ? 'pos' : n < -0.04 ? 'neg' : 'neutre';
  const ic = n > 0.04 ? 'arrow-up-right' : n < -0.04 ? 'arrow-down-right' : 'minus';
  return `<span class="delta ${c}">${icone(ic, 'sm')}${signe(n, d)}${unite}</span>`;
}
