/* ==========================================================================
   OmSmK — stockage sur Google Drive et stockage local sans limite de taille

   - Les données sont gardées sur l'appareil dans IndexedDB (pas de limite de
     5 Mo comme localStorage) : l'application reste utilisable hors-ligne.
   - Une fois Google Drive connecté, elles sont enregistrées dans le dossier
     « OmSmK » du Drive (fichier omsmk_donnees.json), avec une copie datée par
     jour conservée 30 jours. Le PC et le téléphone retrouvent ainsi les mêmes
     données.
   - Fusion à trois voies : on compare chaque objet (chantier, pointage,
     commande…) à son état lors de la dernière synchronisation. Ce qui n'a
     changé que d'un côté est repris ; si un objet a changé des deux côtés,
     la version de l'appareil est conservée (conflit signalé).
   La partie haute de ce fichier est pure (testée dans tests/) ; la partie
   basse dialogue avec IndexedDB et l'API Google Drive.
   ========================================================================== */
// deno-lint-ignore-file no-unused-vars
'use strict';

// Objets de la base, indexés : « collection|id », et « cl|<chantier> » pour les check-lists
function objetsBase(base) {
  const m = new Map();
  Object.entries(base || {}).forEach(([col, v]) => {
    if (Array.isArray(v)) v.forEach(o => { if (o && o.id !== undefined) m.set(col + '|' + o.id, o); });
  });
  Object.entries((base && base.checklists) || {}).forEach(([cid, v]) => m.set('cl|' + cid, v));
  return m;
}
const empreinteDrive = o => o === undefined ? null : empreinte(JSON.stringify(o));
function empreintesBase(base) {
  const out = {};
  objetsBase(base).forEach((o, k) => { out[k] = empreinteDrive(o); });
  return out;
}

/* Fusion de la base locale et de la base du Drive.
   snap : empreintes de chaque objet lors de la dernière synchronisation réussie ({} si aucune).
   Renvoie { base, snap, conflits, recus, envoyes } : recus / envoyes = nombre d'objets
   à reprendre du Drive / à y envoyer. */
function fusionnerBases(local, distant, snap) {
  snap = snap || {};
  const L = objetsBase(local), D = objetsBase(distant);
  const garder = new Map();
  let conflits = 0, recus = 0, envoyes = 0;
  new Set([...L.keys(), ...D.keys()]).forEach(k => {
    const l = L.get(k), d = D.get(k);
    const hl = empreinteDrive(l), hd = empreinteDrive(d), hs = snap[k];
    if (hl === hd) { garder.set(k, l); return; }
    const changeL = hs === undefined ? l !== undefined : hl !== hs;
    const changeD = hs === undefined ? d !== undefined : hd !== hs;
    if (changeD && !changeL) { recus++; if (d !== undefined) garder.set(k, d); return; }
    if (changeD && changeL) {
      // Modifié des deux côtés : la version de l'appareil l'emporte ; un objet supprimé ici mais modifié ailleurs revient
      if (l !== undefined) { conflits++; envoyes++; garder.set(k, l); } else { recus++; garder.set(k, d); }
      return;
    }
    envoyes++;
    if (l !== undefined) garder.set(k, l);
  });
  // Reconstruction : ordre de l'appareil, puis les objets venus du Drive
  const base = {};
  new Set([...Object.keys(local || {}), ...Object.keys(distant || {})]).forEach(col => {
    const vl = (local || {})[col], vd = (distant || {})[col];
    if (col === 'checklists') {
      base.checklists = {};
      [...Object.keys(vl || {}), ...Object.keys(vd || {})].forEach(cid => { if (garder.has('cl|' + cid)) base.checklists[cid] = garder.get('cl|' + cid); });
    } else if (Array.isArray(vl) || Array.isArray(vd)) {
      const vus = new Set();
      base[col] = [];
      [...(vl || []), ...(vd || [])].forEach(o => {
        const k = col + '|' + (o && o.id);
        if (!o || o.id === undefined) { if (Array.isArray(vl) && vl.includes(o)) base[col].push(o); return; }
        if (vus.has(k) || !garder.has(k)) return;
        vus.add(k);
        base[col].push(garder.get(k));
      });
    } else base[col] = vl !== undefined ? vl : vd;
  });
  return { base, snap: empreintesBase(base), conflits, recus, envoyes };
}

// Copies datées à supprimer : au-delà de « jours » jours (nom omsmk_AAAA-MM-JJ.json)
function copiesAPurger(noms, auj, jours = 30) {
  const limite = addDays(auj, -jours);
  return noms.filter(n => { const m = /^omsmk_(\d{4}-\d{2}-\d{2})\.json$/.exec(n); return m && m[1] < limite; });
}

/* ============================ Stockage local ============================= */
const StockLocal = {
  _db: null,
  ouvrir() {
    if (this._db) return Promise.resolve(this._db);
    return new Promise((ok, ko) => {
      const rq = indexedDB.open('omsmk_donnees', 1);
      rq.onupgradeneeded = () => rq.result.createObjectStore('kv');
      rq.onsuccess = () => { this._db = rq.result; ok(this._db); };
      rq.onerror = () => ko(rq.error);
    });
  },
  async lire(cle) {
    const d = await this.ouvrir();
    return new Promise((ok, ko) => { const r = d.transaction('kv').objectStore('kv').get(cle); r.onsuccess = () => ok(r.result); r.onerror = () => ko(r.error); });
  },
  async ecrire(cle, v) {
    const d = await this.ouvrir();
    return new Promise((ok, ko) => { const t = d.transaction('kv', 'readwrite'); t.objectStore('kv').put(v, cle); t.oncomplete = () => ok(); t.onerror = () => ko(t.error); });
  }
};

/* ============================== Google Drive ============================= */
const DRIVE_KEY = 'omsmk_drive';
const DRIVE_FICHIER = 'omsmk_donnees.json';
const DRIVE_DOSSIER = 'OmSmK';
const DRIVE_API = 'https://www.googleapis.com/drive/v3';
const DRIVE_UPLOAD = 'https://www.googleapis.com/upload/drive/v3';

const Drive = {
  etat: 'off',            // off | ok | encours | erreur | reconnexion
  erreur: '',
  derniere: null,
  _cfg: {},               // { clientId, email, dossierId, fichierId, snap, copie }
  _jeton: null, _expire: 0,
  _client: null,
  _timer: null, _enCours: false, _relancer: false,
  base: null, remplacerBase: null, onChange: null, onStatut: null,

  init() {
    try { this._cfg = JSON.parse(localStorage.getItem(DRIVE_KEY)) || {}; } catch (_e) { this._cfg = {}; }
    try { const j = JSON.parse(sessionStorage.getItem(DRIVE_KEY + '_jeton')); if (j && j.expire > Date.now()) { this._jeton = j.jeton; this._expire = j.expire; } } catch (_e) { /* aucun jeton */ }
    if (!this.connecte()) return;
    this.etat = this.jetonValide() ? 'ok' : 'reconnexion';
    this.planifier(500);
    if (this._ecoute) return;
    this._ecoute = true;
    // Toutes les 5 minutes, au retour du réseau, et en quittant / revenant sur l'application
    setInterval(() => { if (document.visibilityState === 'visible') this.planifier(0); }, 5 * 60000);
    addEventListener('online', () => this.planifier(0));
    document.addEventListener('visibilitychange', () => this.planifier(0));
  },
  clientId() { return this._cfg.clientId || (typeof OMSMK_CONFIG !== 'undefined' && OMSMK_CONFIG.googleClientId) || ''; },
  connecte() { return !!this._cfg.connecte; },
  email() { return this._cfg.email || ''; },
  _sauverCfg() { try { localStorage.setItem(DRIVE_KEY, JSON.stringify(this._cfg)); } catch (_e) { /* quota */ } },
  _statut(etat, erreur = '') { this.etat = etat; this.erreur = erreur; if (this.onStatut) this.onStatut(); },
  definirClientId(id) { this._cfg.clientId = String(id || '').trim(); this._client = null; this._sauverCfg(); },

  _chargerGIS() {
    if (globalThis.google && google.accounts && google.accounts.oauth2) return Promise.resolve();
    return new Promise((ok, ko) => {
      const s = document.createElement('script');
      s.src = 'https://accounts.google.com/gsi/client'; s.async = true;
      s.onload = () => ok(); s.onerror = () => ko(new Error('Service Google injoignable (connexion Internet ?)'));
      document.head.appendChild(s);
    });
  },
  // Demande un jeton d'accès (fenêtre Google). « interactif » : appelé depuis un clic.
  async _demanderJeton(interactif) {
    if (!this.clientId()) throw new Error('Identifiant client Google non renseigné');
    await this._chargerGIS();
    return new Promise((ok, ko) => {
      const client = google.accounts.oauth2.initTokenClient({
        client_id: this.clientId(),
        scope: 'https://www.googleapis.com/auth/drive.file',
        prompt: interactif ? (this._cfg.email ? '' : 'consent') : '',
        hint: this._cfg.email || undefined,
        callback: r => {
          if (r.error) return ko(new Error(r.error_description || r.error));
          this._jeton = r.access_token;
          this._expire = Date.now() + (num(r.expires_in) || 3600) * 1000 - 60000;
          try { sessionStorage.setItem(DRIVE_KEY + '_jeton', JSON.stringify({ jeton: this._jeton, expire: this._expire })); } catch (_e) { /* ignoré */ }
          ok(this._jeton);
        },
        error_callback: e => ko(new Error(e && e.type === 'popup_closed' ? 'Fenêtre Google fermée' : (e && e.message) || 'Autorisation Google refusée'))
      });
      client.requestAccessToken();
    });
  },
  jetonValide() { return !!this._jeton && Date.now() < this._expire; },

  async _api(url, opts = {}) {
    if (!this.jetonValide()) { const e = new Error('Reconnexion à Google nécessaire'); e.reconnexion = true; throw e; }
    const r = await fetch(url, Object.assign({}, opts, { headers: Object.assign({ Authorization: 'Bearer ' + this._jeton }, opts.headers || {}) }));
    if (r.status === 401) { this._jeton = null; const e = new Error('Reconnexion à Google nécessaire'); e.reconnexion = true; throw e; }
    if (!r.ok) { let m = ''; try { m = (await r.json()).error.message; } catch (_e) { /* ignoré */ } throw new Error(`Google Drive : ${m || r.status}`); }
    return r;
  },
  async _chercher(q) {
    const r = await this._api(`${DRIVE_API}/files?q=${encodeURIComponent(q + ' and trashed=false')}&fields=files(id,name,modifiedTime)&orderBy=modifiedTime desc&pageSize=100&spaces=drive`);
    return (await r.json()).files || [];
  },
  async _creer(meta, contenu) {
    if (contenu === undefined) return (await (await this._api(`${DRIVE_API}/files?fields=id`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(meta) })).json()).id;
    const limite = 'omsmk' + Date.now();
    const corps = `--${limite}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(meta)}\r\n--${limite}\r\nContent-Type: application/json\r\n\r\n${contenu}\r\n--${limite}--`;
    return (await (await this._api(`${DRIVE_UPLOAD}/files?uploadType=multipart&fields=id`, { method: 'POST', headers: { 'Content-Type': 'multipart/related; boundary=' + limite }, body: corps })).json()).id;
  },
  async _dossier() {
    if (this._cfg.dossierId) return this._cfg.dossierId;
    const f = await this._chercher(`name='${DRIVE_DOSSIER}' and mimeType='application/vnd.google-apps.folder'`);
    this._cfg.dossierId = f[0] ? f[0].id : await this._creer({ name: DRIVE_DOSSIER, mimeType: 'application/vnd.google-apps.folder' });
    this._sauverCfg();
    return this._cfg.dossierId;
  },
  async _fichier() {
    if (this._cfg.fichierId) return this._cfg.fichierId;
    const dossier = await this._dossier();
    const f = await this._chercher(`name='${DRIVE_FICHIER}' and '${dossier}' in parents`);
    if (f[0]) { this._cfg.fichierId = f[0].id; this._sauverCfg(); }
    return this._cfg.fichierId || null;
  },

  // Connexion (depuis un clic) : autorisation Google, adresse du compte, première synchronisation
  async connecter() {
    await this._demanderJeton(true);
    try {
      const r = await this._api(`${DRIVE_API}/about?fields=user(emailAddress)`);
      const email = ((await r.json()).user || {}).emailAddress || '';
      if (this._cfg.email && email && email !== this._cfg.email) { this._cfg.dossierId = this._cfg.fichierId = null; this._cfg.snap = {}; }
      this._cfg.email = email;
    } catch (_e) { /* l'adresse n'est qu'indicative */ }
    this._cfg.connecte = true; this._sauverCfg();
    this.init();
    this._statut('ok');
    await this.synchroniser();
  },
  deconnecter() {
    if (this._jeton && globalThis.google && google.accounts) { try { google.accounts.oauth2.revoke(this._jeton, () => { /* ignoré */ }); } catch (_e) { /* ignoré */ } }
    this._jeton = null; this._expire = 0;
    try { sessionStorage.removeItem(DRIVE_KEY + '_jeton'); } catch (_e) { /* ignoré */ }
    this._cfg = { clientId: this._cfg.clientId };
    this._sauverCfg();
    this._statut('off');
  },

  // Après un effacement de l'appareil : tout ce qui est sur le Drive sera repris (rien n'y est supprimé)
  oublierEtat() { this._cfg.snap = {}; this._sauverCfg(); },

  planifier(delai = 15000) {
    if (!this.connecte()) return;
    clearTimeout(this._timer);
    this._timer = setTimeout(() => this.synchroniser().catch(() => { /* état déjà affiché */ }), delai);
  },

  async synchroniser() {
    if (!this.connecte() || !navigator.onLine) return;
    if (this._enCours) { this._relancer = true; return; }
    if (!this.jetonValide()) { this._statut('reconnexion', 'Session Google expirée : reconnectez-vous'); return; }
    this._enCours = true;
    this._statut('encours');
    try {
      const id = await this._fichier();
      let distant = null;
      if (id) {
        const r = await this._api(`${DRIVE_API}/files/${id}?alt=media`).catch(e => { if (/404|not found/i.test(e.message)) { this._cfg.fichierId = null; return null; } throw e; });
        distant = r ? await r.json() : null;
      }
      const local = this.base();
      const f = distant ? fusionnerBases(local, distant, this._cfg.snap || {}) : { base: local, snap: empreintesBase(local), conflits: 0, recus: 0, envoyes: 1 };
      const contenu = JSON.stringify(f.base);
      if (f.recus) this.remplacerBase(f.base);
      if (!distant || contenu !== JSON.stringify(distant)) {
        if (this._cfg.fichierId) await this._api(`${DRIVE_UPLOAD}/files/${this._cfg.fichierId}?uploadType=media`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: contenu });
        else { this._cfg.fichierId = await this._creer({ name: DRIVE_FICHIER, parents: [await this._dossier()], mimeType: 'application/json' }, contenu); }
      }
      this._cfg.snap = f.snap;
      this._cfg.derniere = new Date().toISOString();
      this._sauverCfg();
      this.derniere = new Date();
      await this._copieDuJour(contenu);
      this._statut('ok');
      if (f.recus && this.onChange) this.onChange(f.recus, f.conflits);
    } catch (e) {
      console.error(e);
      this._statut(e.reconnexion ? 'reconnexion' : 'erreur', e.message || String(e));
    } finally {
      this._enCours = false;
      if (this._relancer) { this._relancer = false; this.planifier(1000); }
    }
  },

  // Une copie datée par jour dans le dossier OmSmK/Sauvegardes, conservée 30 jours
  async _copieDuJour(contenu) {
    const auj = aujourdHui();
    if (this._cfg.copie === auj) return;
    const dossier = await this._dossier();
    let sauv = this._cfg.sauvegardesId;
    if (!sauv) {
      const f = await this._chercher(`name='Sauvegardes' and mimeType='application/vnd.google-apps.folder' and '${dossier}' in parents`);
      sauv = this._cfg.sauvegardesId = f[0] ? f[0].id : await this._creer({ name: 'Sauvegardes', mimeType: 'application/vnd.google-apps.folder', parents: [dossier] });
    }
    await this._creer({ name: `omsmk_${auj}.json`, parents: [sauv], mimeType: 'application/json' }, contenu);
    const copies = await this._chercher(`'${sauv}' in parents`);
    for (const n of copiesAPurger(copies.map(c => c.name), auj)) {
      const c = copies.find(x => x.name === n);
      await this._api(`${DRIVE_API}/files/${c.id}`, { method: 'DELETE' }).catch(() => { /* sans gravité */ });
    }
    this._cfg.copie = auj; this._sauverCfg();
  },

  // Reprendre une copie datée (remplace les données de l'appareil, puis renvoyée sur le Drive)
  async listerCopies() {
    if (!this._cfg.sauvegardesId) return [];
    return (await this._chercher(`'${this._cfg.sauvegardesId}' in parents`)).sort((a, b) => b.name.localeCompare(a.name));
  },
  async lireCopie(id) { return (await this._api(`${DRIVE_API}/files/${id}?alt=media`)).json(); }
};
