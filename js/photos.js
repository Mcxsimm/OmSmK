/* ==========================================================================
   OmSmK — photos de chantier
   Les images sont compressées sur l'appareil (1600 px + vignette 360 px) et
   rangées dans IndexedDB (hors-ligne). La fiche de chaque photo (date,
   légende, rattachement à une entrée de journal ou une réserve) suit la
   synchronisation habituelle ; les fichiers des chantiers partagés sont
   déposés dans le stockage Supabase privé de l'équipe.
   ========================================================================== */
// deno-lint-ignore-file no-unused-vars
'use strict';

const BUCKET_PHOTOS = 'omsmk-photos';
const ENVOYEES_KEY = 'omsmk_photos_env';

const PhotoStore = {
  _db: null,
  ouvrir() {
    if (this._db) return Promise.resolve(this._db);
    return new Promise((ok, ko) => {
      const rq = indexedDB.open('omsmk_photos', 1);
      rq.onupgradeneeded = () => rq.result.createObjectStore('photos');
      rq.onsuccess = () => { this._db = rq.result; ok(this._db); };
      rq.onerror = () => ko(rq.error);
    });
  },
  async _tx(mode, fn) {
    const d = await this.ouvrir();
    return new Promise((ok, ko) => {
      const t = d.transaction('photos', mode);
      const r = fn(t.objectStore('photos'));
      t.oncomplete = () => ok(r && r.result);
      t.onerror = () => ko(t.error);
    });
  },
  put(id, v) { return this._tx('readwrite', s => s.put(v, id)); },
  get(id) { return this._tx('readonly', s => s.get(id)); },
  del(id) { return this._tx('readwrite', s => s.delete(id)); }
};

const photosDe = (cid, cible, cibleId) => (db.photos || []).filter(p => p.chantierId === cid && (!cible || p.cible === cible) && (!cibleId || p.cibleId === cibleId))
  .sort((a, b) => (b.date + (b.heure || '')).localeCompare(a.date + (a.heure || '')));

async function compresserImage(fichier, max, qualite) {
  let source, w, h;
  if (globalThis.createImageBitmap) {
    source = await createImageBitmap(fichier);
    w = source.width; h = source.height;
  } else {
    source = await new Promise((ok, ko) => { const i = new Image(); i.onload = () => ok(i); i.onerror = ko; i.src = URL.createObjectURL(fichier); });
    w = source.naturalWidth; h = source.naturalHeight;
  }
  const k = Math.min(1, max / Math.max(w, h));
  const cv = document.createElement('canvas');
  cv.width = Math.round(w * k); cv.height = Math.round(h * k);
  cv.getContext('2d').drawImage(source, 0, 0, cv.width, cv.height);
  const blob = await new Promise(ok => cv.toBlob(ok, 'image/jpeg', qualite));
  return { blob, w: cv.width, h: cv.height };
}

// Enregistre des fichiers image comme photos du chantier actif
async function ajouterPhotos(fichiers, cible = 'libre', cibleId = '', legende = '') {
  const c = ch();
  const liste = [...fichiers].filter(f => /^image\//.test(f.type));
  if (!liste.length) return [];
  db.photos = db.photos || [];
  const ajoutees = [];
  for (const f of liste) {
    try {
      const plein = await compresserImage(f, 1600, 0.8);
      const vignette = await compresserImage(plein.blob, 360, 0.72);
      const id = uid();
      await PhotoStore.put(id, { plein: plein.blob, vignette: vignette.blob });
      const maintenant = new Date();
      const p = { id, chantierId: c.id, date: isoLocal(maintenant), heure: maintenant.toTimeString().slice(0, 5), cible, cibleId, legende, auteur: nomUser(), w: plein.w, h: plein.h };
      db.photos.push(p); ajoutees.push(p);
    } catch (e) { console.error(e); toast('Une image n\'a pas pu être lue.', 'erreur'); }
  }
  save();
  envoyerPhotos();
  return ajoutees;
}

async function supprimerPhoto(id) {
  const p = (db.photos || []).find(x => x.id === id);
  if (!p) return;
  db.photos = db.photos.filter(x => x !== p);
  save();
  try { await PhotoStore.del(id); } catch (_e) { /* déjà absente */ }
  const c = db.chantiers.find(x => x.id === p.chantierId);
  if (c && c.equipeId && Synchro.connecte()) Synchro.client.storage.from(BUCKET_PHOTOS).remove([cheminPhoto(c, id), cheminPhoto(c, id, true)]).catch(() => {});
}
function supprimerPhotosDe(cible, cibleId) { photosDe(ui.chantierId, cible, cibleId).forEach(p => supprimerPhoto(p.id)); }

/* ----------------------- Stockage en ligne (Supabase) --------------------- */
const cheminPhoto = (c, id, vignette) => `${c.equipeId}/${c.id}/${id}${vignette ? '_t' : ''}.jpg`;
let _envoiEnCours = false;
async function envoyerPhotos() {
  if (_envoiEnCours || !Synchro.connecte() || !navigator.onLine) return;
  _envoiEnCours = true;
  try {
    const envoyees = new Set(lireJSON(ENVOYEES_KEY, []));
    const mesEquipes = new Set(Synchro.equipes.map(e => e.id));
    for (const p of db.photos || []) {
      const c = db.chantiers.find(x => x.id === p.chantierId);
      if (!c || !c.equipeId || !mesEquipes.has(c.equipeId) || envoyees.has(p.id)) continue;
      const v = await PhotoStore.get(p.id);
      if (!v) continue;
      const st = Synchro.client.storage.from(BUCKET_PHOTOS);
      const r1 = await st.upload(cheminPhoto(c, p.id), v.plein, { contentType: 'image/jpeg', upsert: true });
      const r2 = await st.upload(cheminPhoto(c, p.id, true), v.vignette, { contentType: 'image/jpeg', upsert: true });
      if (r1.error || r2.error) { console.error(r1.error || r2.error); break; }
      envoyees.add(p.id);
      localStorage.setItem(ENVOYEES_KEY, JSON.stringify([...envoyees]));
    }
  } catch (e) { console.error(e); } finally { _envoiEnCours = false; }
}

// Récupère une photo (vignette ou pleine taille) : d'abord sur l'appareil, sinon en ligne
async function blobPhoto(id, vignette = true) {
  const v = await PhotoStore.get(id).catch(() => null);
  if (v) return vignette ? v.vignette : v.plein;
  const p = (db.photos || []).find(x => x.id === id);
  const c = p && db.chantiers.find(x => x.id === p.chantierId);
  if (!c || !c.equipeId || !Synchro.connecte() || !navigator.onLine) return null;
  const st = Synchro.client.storage.from(BUCKET_PHOTOS);
  const { data, error } = await st.download(cheminPhoto(c, id, vignette));
  if (error || !data) return null;
  // Mise en cache locale (la pleine taille n'est rapatriée qu'à l'ouverture)
  if (!vignette) {
    const t = await st.download(cheminPhoto(c, id, true));
    await PhotoStore.put(id, { plein: data, vignette: t.data || data }).catch(() => {});
  }
  return data;
}

const _urlsPhotos = new Map();
async function urlPhoto(id, vignette = true) {
  const k = id + (vignette ? 't' : 'p');
  if (_urlsPhotos.has(k)) return _urlsPhotos.get(k);
  const b = await blobPhoto(id, vignette);
  if (!b) return null;
  const u = URL.createObjectURL(b);
  _urlsPhotos.set(k, u);
  return u;
}
// Remplit les <img data-photo> de la page
function hydraterPhotos(racine = document) {
  $$('img[data-photo]:not([src])', racine).forEach(async img => {
    const u = await urlPhoto(img.dataset.photo, img.dataset.taille !== 'plein');
    if (u) img.src = u; else img.closest('.ph')?.classList.add('ph-absente');
  });
}

/* --------------------------------- Rendu --------------------------------- */
function vignettesPhotos(liste, opts = {}) {
  if (!liste.length) return '';
  return `<div class="ph-grille ${opts.petit ? 'petit' : ''}">${liste.map(p => `<button class="ph" data-act="photoVoir" data-id="${esc(p.id)}" title="${esc(p.legende || fmtDate(p.date))}">
    <img data-photo="${esc(p.id)}" alt="${esc(p.legende || 'Photo du ' + fmtDate(p.date))}" loading="lazy">${opts.legende && p.legende ? `<span class="ph-leg">${esc(p.legende)}</span>` : ''}</button>`).join('')}</div>`;
}

// Sélecteur de photos dans une boîte de dialogue (les fichiers sont gardés jusqu'à l'enregistrement)
let _photosAttente = [];
function blocPhotosModal(cible, cibleId) {
  _photosAttente = [];
  const existantes = cibleId ? photosDe(ui.chantierId, cible, cibleId) : [];
  return `<div class="field"><div class="label">Photos</div>
    <div class="ph-grille petit" id="phModal">${existantes.map(p => `<div class="ph"><img data-photo="${esc(p.id)}" alt=""><button type="button" class="ph-x" data-act="photoRetirerExistante" data-id="${esc(p.id)}" aria-label="Supprimer la photo">${icone('x', 'sm')}</button></div>`).join('')}</div>
    <label class="btn sm" style="margin-top:8px">${icone('camera', 'sm')}Prendre ou ajouter des photos<input type="file" accept="image/*" multiple hidden data-change="photosAttente"></label></div>`;
}
function renderAttente() {
  const z = $('#phModal');
  if (!z) return;
  $$('.ph-attente', z).forEach(e => e.remove());
  _photosAttente.forEach((f, i) => z.insertAdjacentHTML('beforeend', `<div class="ph ph-attente"><img src="${URL.createObjectURL(f)}" alt=""><button type="button" class="ph-x" data-act="photoRetirerAttente" data-i="${i}" aria-label="Retirer">${icone('x', 'sm')}</button></div>`));
}
async function validerPhotosAttente(cible, cibleId) {
  if (!_photosAttente.length) return;
  const n = _photosAttente.length;
  const fichiers = _photosAttente; _photosAttente = [];
  await ajouterPhotos(fichiers, cible, cibleId);
  render();
  toast(`${accord(n, 'photo(s) ajoutée(s)')}`, 'succes');
}

function voirPhoto(id) {
  const p = (db.photos || []).find(x => x.id === id);
  if (!p) return;
  const freres = photosDe(p.chantierId, p.cible === 'libre' ? null : p.cible, p.cible === 'libre' ? null : p.cibleId);
  const i = freres.findIndex(x => x.id === id);
  const lien = p.cible === 'journal' ? 'Journal' : p.cible === 'reserve' ? (() => { const r = (db.reserves || []).find(x => x.id === p.cibleId); return r ? 'Réserve ' + numeroReserve(r) : 'Réserve'; })() : '';
  ouvrirModal(p.legende || `Photo du ${fmtDate(p.date)}`, `
    <div class="ph-plein"><img data-photo="${esc(p.id)}" data-taille="plein" alt="${esc(p.legende || '')}">
      ${freres.length > 1 ? `<button class="btn icon ph-nav g" data-act="photoVoir" data-id="${esc(freres[(i - 1 + freres.length) % freres.length].id)}" aria-label="Précédente">${icone('chevron-left')}</button>
      <button class="btn icon ph-nav d" data-act="photoVoir" data-id="${esc(freres[(i + 1) % freres.length].id)}" aria-label="Suivante">${icone('chevron-right')}</button>` : ''}</div>
    ${champ('phLeg', 'Légende', p.legende, 'text', `data-change="photoLegende" data-id="${esc(p.id)}" placeholder="ex : relevé angle nord-est avant reprise"`)}
    <div class="small muted">${fmtDate(p.date, true)}${p.heure ? ' à ' + esc(p.heure) : ''}${p.auteur ? ' · ' + esc(p.auteur) : ''}${lien ? ' · ' + esc(lien) : ''}</div>`,
    `<button class="btn danger" data-act="photoSuppr" data-id="${esc(p.id)}" style="margin-right:auto">${icone('trash-2')}Supprimer</button><button class="btn" data-act="photoTelecharger" data-id="${esc(p.id)}">${icone('download')}Télécharger</button><button class="btn primary" data-act="fermerModal">Fermer</button>`,
    { icone: 'image', taille: 'wide', sousTitre: freres.length > 1 ? `${i + 1} / ${freres.length}` : '', pasDeFocus: true });
  hydraterPhotos($('#modalRoot'));
}

/* -------------------------------- Actions -------------------------------- */
Object.assign(ACT, {
  photoVoir: el => voirPhoto(el.dataset.id),
  photoSuppr: async el => {
    if (!await confirmer('Supprimer la photo', 'La photo sera supprimée sur tous les appareils.', { ok: 'Supprimer', danger: true })) return;
    await supprimerPhoto(el.dataset.id); render(); toast('Photo supprimée', 'succes');
  },
  photoTelecharger: async el => {
    const p = (db.photos || []).find(x => x.id === el.dataset.id);
    const b = await blobPhoto(el.dataset.id, false);
    if (b) telecharger(`Photo_${p.date}_${(p.legende || p.id).replace(/[^\w-]+/g, '_').slice(0, 40)}.jpg`, b);
  },
  photoRetirerAttente: el => { _photosAttente.splice(num(el.dataset.i), 1); renderAttente(); },
  photoRetirerExistante: async el => {
    if (!await confirmer('Supprimer la photo', 'Cette photo sera supprimée.', { ok: 'Supprimer', danger: true })) return;
    await supprimerPhoto(el.dataset.id); render(); toast('Photo supprimée', 'succes');
  },
  photoGalerie: () => { const i = $('#phGalerieInput'); if (i) i.click(); }
});

Object.assign(CHG, {
  photosAttente: el => { _photosAttente.push(...[...el.files].filter(f => /^image\//.test(f.type))); el.value = ''; renderAttente(); },
  photosGalerie: async el => {
    const fichiers = [...el.files]; el.value = '';
    const n = (await ajouterPhotos(fichiers, 'libre', '')).length;
    render(); if (n) toast(`${accord(n, 'photo(s) ajoutée(s)')}`, 'succes');
  },
  photoLegende: el => { const p = (db.photos || []).find(x => x.id === el.dataset.id); if (p) { p.legende = el.value.trim(); save(); } }
});
