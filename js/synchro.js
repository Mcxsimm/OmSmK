/* ==========================================================================
   OmSmK — synchronisation en ligne entre appareils (Supabase)

   Principe :
   - chaque chantier partagé appartient à une équipe (chantier.equipeId) ;
   - chacun de ses objets (opération, saisie hebdo, tâche, journal, réserve,
     check-list) devient un enregistrement en ligne ;
   - chaque objet porte « _m », l'heure de sa dernière modification :
     en cas de modification simultanée, la plus récente gagne ;
   - les modifications sont détectées en comparant une empreinte de chaque
     objet à celle mémorisée lors de la dernière synchronisation (« snap »).
   La partie haute de ce fichier est pure (testée dans tests/) ; la partie
   basse dialogue avec Supabase.
   ========================================================================== */
// deno-lint-ignore-file no-unused-vars
'use strict';

const SYNC_COLLECTIONS = { op: 'ops', suivi: 'suivi', tache: 'taches', journal: 'journal', reserve: 'reserves', poste: 'postes', situation: 'situations', commande: 'commandes', compagnon: 'compagnons', pointage: 'pointages' };

// Empreinte FNV-1a 32 bits (suffisante pour détecter un changement)
function empreinte(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return (h >>> 0).toString(36);
}
function empreinteObjet(o) {
  const copie = Object.assign({}, o);
  delete copie._m;
  return empreinte(JSON.stringify(copie));
}

// Tous les objets synchronisables (ceux des chantiers rattachés à une équipe)
function collecterEnregistrements(base) {
  const out = [];
  const equipeDe = new Map();
  base.chantiers.forEach(c => {
    if (!c.equipeId) return;
    equipeDe.set(c.id, c.equipeId);
    out.push({ id: c.id, kind: 'chantier', chantierId: c.id, equipeId: c.equipeId, obj: c });
    const cl = base.checklists[c.id];
    if (cl) out.push({ id: 'cl|' + c.id, kind: 'checklist', chantierId: c.id, equipeId: c.equipeId, obj: cl });
  });
  Object.entries(SYNC_COLLECTIONS).forEach(([kind, cle]) => {
    (base[cle] || []).forEach(o => {
      const eq = equipeDe.get(o.chantierId);
      if (eq) out.push({ id: o.id, kind, chantierId: o.chantierId, equipeId: eq, obj: o });
    });
  });
  return out;
}

/* Changements locaux à envoyer depuis la dernière synchronisation.
   Met à jour _m des objets modifiés. Renvoie { envois, empreintes }. */
function calculerEnvois(base, snap, maintenant) {
  const envois = [];
  const empreintes = {};
  const vus = new Set();
  collecterEnregistrements(base).forEach(r => {
    vus.add(r.id);
    const h = empreinteObjet(r.obj);
    empreintes[r.id] = h;
    const s = snap[r.id];
    if (s && s.h === h) return;
    if (s) r.obj._m = maintenant;                 // modifié localement
    else r.obj._m = r.obj._m || maintenant;       // nouveau (ou inconnu après réinitialisation)
    envois.push({ equipeId: r.equipeId, id: r.id, kind: r.kind, chantier_id: r.chantierId, data: r.obj, maj: r.obj._m, supprime: false });
  });
  Object.entries(snap).forEach(([id, s]) => {
    if (!vus.has(id) && s.e) envois.push({ equipeId: s.e, id, kind: s.k, chantier_id: s.c || null, data: null, maj: maintenant, supprime: true });
  });
  return { envois, empreintes };
}

// Après un envoi réussi : mémoriser l'état envoyé
function validerEnvois(snap, envois, empreintes) {
  envois.forEach(e => {
    if (e.supprime) delete snap[e.id];
    else snap[e.id] = { h: empreintes[e.id], m: e.maj, e: e.equipeId, k: e.kind, c: e.chantier_id };
  });
}

function trouverLocal(base, kind, id) {
  if (kind === 'chantier') return base.chantiers.find(c => c.id === id) || null;
  if (kind === 'checklist') return base.checklists[id.slice(3)] || null;
  return (base[SYNC_COLLECTIONS[kind]] || []).find(o => o.id === id) || null;
}

function insererDistant(base, kind, data) {
  if (kind === 'chantier') { base.chantiers.push(data); return; }
  const arr = base[SYNC_COLLECTIONS[kind]] = base[SYNC_COLLECTIONS[kind]] || [];
  if (kind === 'op') {
    let idx = -1;
    arr.forEach((o, i) => { if (o.chantierId === data.chantierId && o.ouvrage === data.ouvrage && o.phase === data.phase) idx = i; });
    if (idx < 0) arr.forEach((o, i) => { if (o.chantierId === data.chantierId && o.ouvrage === data.ouvrage) idx = i; });
    if (idx >= 0) { arr.splice(idx + 1, 0, data); return; }
  }
  arr.push(data);
}

function retirerLocal(base, kind, id) {
  if (kind === 'chantier') base.chantiers = base.chantiers.filter(c => c.id !== id);
  else if (kind === 'checklist') delete base.checklists[id.slice(3)];
  else base[SYNC_COLLECTIONS[kind]] = (base[SYNC_COLLECTIONS[kind]] || []).filter(o => o.id !== id);
}

/* Intègre les enregistrements reçus. Une modification locale non encore
   envoyée est conservée (elle partira au prochain envoi). Renvoie le nombre
   d'objets modifiés localement. */
function appliquerDistants(base, snap, lignes) {
  let n = 0;
  lignes.forEach(r => {
    const local = trouverLocal(base, r.kind, r.id);
    const s = snap[r.id];
    const sale = local && s && empreinteObjet(local) !== s.h;
    if (sale) return;
    const mLocal = local ? (local._m || 0) : 0;
    if (r.supprime) {
      if (local && (!s ? mLocal <= r.maj : true)) { retirerLocal(base, r.kind, r.id); n++; }
      delete snap[r.id];
      return;
    }
    const data = Object.assign({}, r.data, { _m: r.maj });
    const h = empreinteObjet(data);
    if (local && empreinteObjet(local) === h) {
      local._m = Math.max(mLocal, r.maj);
    } else if (!local) {
      if (r.kind === 'checklist') base.checklists[r.id.slice(3)] = data; else insererDistant(base, r.kind, data);
      n++;
    } else if (r.maj >= mLocal || s) {
      if (r.kind === 'checklist') base.checklists[r.id.slice(3)] = data;
      else {
        Object.keys(local).forEach(k => delete local[k]);
        Object.assign(local, data);
      }
      n++;
    } else {
      return; // version locale plus récente : elle sera renvoyée
    }
    snap[r.id] = { h, m: r.maj, e: r.equipe_id, k: r.kind, c: r.chantier_id };
  });
  return n;
}

/* ============================ Partie navigateur =========================== */
const SYNC_KEY = 'omsmk_sync_v1';

const Synchro = {
  client: null,
  session: null,
  equipes: [],
  etat: 'off',          // off | ok | encours | erreur
  erreur: '',
  derniere: null,
  emailEnAttente: '',
  _etat: { snap: {}, curseurs: {} },
  _timer: null,
  _enCours: false,
  _relancer: false,
  _canal: null,
  onChange: null,       // (nbModifs) => void  : données modifiées par la synchro
  onStatut: null,       // () => void           : état / équipes changés

  disponible() { return typeof supabase !== 'undefined' && typeof OMSMK_CONFIG !== 'undefined' && !!OMSMK_CONFIG.supabaseUrl; },
  connecte() { return !!this.session; },
  email() { return this.session ? this.session.user.email : ''; },

  async init() {
    try { const e = JSON.parse(localStorage.getItem(SYNC_KEY)); if (e && e.snap) this._etat = e; } catch (_e) { /* état vierge */ }
    this.emailEnAttente = localStorage.getItem(SYNC_KEY + '_email') || '';
    if (!this.disponible()) return;
    this.client = supabase.createClient(OMSMK_CONFIG.supabaseUrl, OMSMK_CONFIG.supabaseKey, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, storageKey: 'omsmk_auth' }
    });
    this.client.auth.onAuthStateChange((evt, session) => {
      const avant = this.session && this.session.user.id;
      this.session = session;
      if (session && session.user.id !== avant) setTimeout(() => this._apresConnexion(), 0);
      if (!session) { this.equipes = []; this.etat = 'off'; this._fermerCanal(); this._statut(); }
    });
    const { data } = await this.client.auth.getSession();
    this.session = data.session;
    if (this.session) await this._apresConnexion();
    setInterval(() => { if (document.visibilityState === 'visible') this.planifier(0); }, 60000);
    addEventListener('online', () => this.planifier(0));
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') this.planifier(0); });
  },

  _sauverEtat() { try { localStorage.setItem(SYNC_KEY, JSON.stringify(this._etat)); } catch (_e) { /* quota */ } },
  _statut() { if (this.onStatut) this.onStatut(); },

  async demanderCode(email) {
    email = String(email || '').trim().toLowerCase();
    const { error } = await this.client.auth.signInWithOtp({
      email, options: { shouldCreateUser: true, emailRedirectTo: location.origin + location.pathname }
    });
    if (error) throw error;
    this.emailEnAttente = email;
    localStorage.setItem(SYNC_KEY + '_email', email);
  },

  async verifierCode(code) {
    const { error } = await this.client.auth.verifyOtp({ email: this.emailEnAttente, token: String(code).trim(), type: 'email' });
    if (error) throw error;
  },

  async deconnecter() {
    this._fermerCanal();
    await this.client.auth.signOut();
    this.session = null; this.equipes = []; this.etat = 'off';
    this.oublierEtat();
    this._statut();
  },

  // Oublie l'état de synchronisation (aucune suppression ne sera envoyée)
  oublierEtat(equipeId) {
    if (!equipeId) this._etat = { snap: {}, curseurs: {} };
    else {
      Object.keys(this._etat.snap).forEach(id => { if (this._etat.snap[id].e === equipeId) delete this._etat.snap[id]; });
      delete this._etat.curseurs[equipeId];
    }
    this._sauverEtat();
  },

  async _apresConnexion() {
    try {
      await this.client.rpc('omsmk_accepter_invitations');
      await this.chargerEquipes();
      this._ouvrirCanal();
      this.planifier(0);
    } catch (e) { this._erreur(e); }
  },

  async chargerEquipes() {
    const { data, error } = await this.client.from('omsmk_membres')
      .select('role, equipe_id, omsmk_equipes(id, nom)').eq('user_id', this.session.user.id);
    if (error) throw error;
    this.equipes = (data || []).filter(m => m.omsmk_equipes).map(m => ({ id: m.equipe_id, nom: m.omsmk_equipes.nom, role: m.role }));
    this._statut();
  },

  async creerEquipe(nom) {
    const { error } = await this.client.rpc('omsmk_creer_equipe', { p_nom: nom });
    if (error) throw error;
    await this.chargerEquipes();
    this._ouvrirCanal();
  },

  async membres(equipeId) {
    const [m, i] = await Promise.all([
      this.client.from('omsmk_membres').select('user_id, email, role, ajoute_le').eq('equipe_id', equipeId).order('ajoute_le'),
      this.client.from('omsmk_invitations').select('email, role, invite_le, acceptee_le').eq('equipe_id', equipeId).order('invite_le')
    ]);
    if (m.error) throw m.error;
    return { membres: m.data || [], invitations: i.data || [] };
  },

  async inviter(equipeId, email, role) {
    const { error } = await this.client.from('omsmk_invitations')
      .insert({ equipe_id: equipeId, email: String(email).trim().toLowerCase(), role: role || 'membre' });
    if (error) throw error;
  },

  async annulerInvitation(equipeId, email) {
    const { error } = await this.client.from('omsmk_invitations').delete().eq('equipe_id', equipeId).eq('email', email);
    if (error) throw error;
  },

  async retirerMembre(equipeId, userId) {
    const { error } = await this.client.from('omsmk_membres').delete().eq('equipe_id', equipeId).eq('user_id', userId);
    if (error) throw error;
  },

  _ouvrirCanal() {
    this._fermerCanal();
    if (!this.equipes.length) return;
    let canal = this.client.channel('omsmk-records');
    this.equipes.forEach(eq => {
      canal = canal.on('postgres_changes', { event: '*', schema: 'public', table: 'omsmk_records', filter: `equipe_id=eq.${eq.id}` },
        () => this.planifier(800));
    });
    this._canal = canal.subscribe();
  },
  _fermerCanal() { if (this._canal) { this.client.removeChannel(this._canal); this._canal = null; } },

  planifier(delai = 1500) {
    if (!this.connecte()) return;
    clearTimeout(this._timer);
    this._timer = setTimeout(() => this.synchroniser(), delai);
  },

  _erreur(e) {
    console.error(e);
    this.etat = 'erreur';
    this.erreur = (e && (e.message || e.error_description)) || String(e);
    this._statut();
  },

  // Un cycle : envoyer les changements locaux puis récupérer ceux des autres
  async synchroniser() {
    if (!this.connecte() || !navigator.onLine) return;
    if (this._enCours) { this._relancer = true; return; }
    this._enCours = true; this.etat = 'encours'; this._statut();
    try {
      const base = this.base();
      const mesEquipes = new Set(this.equipes.map(e => e.id));
      const { envois, empreintes } = calculerEnvois(base, this._etat.snap, Date.now());
      const parEquipe = {};
      envois.filter(e => mesEquipes.has(e.equipeId)).forEach(e => (parEquipe[e.equipeId] = parEquipe[e.equipeId] || []).push(e));
      for (const [eq, lot] of Object.entries(parEquipe)) {
        for (let i = 0; i < lot.length; i += 400) {
          const tranche = lot.slice(i, i + 400);
          const recs = tranche.map(({ id, kind, chantier_id, data, maj, supprime }) => ({ id, kind, chantier_id, data, maj, supprime }));
          const { error } = await this.client.rpc('omsmk_push', { p_equipe: eq, p_recs: recs });
          if (error) throw error;
          validerEnvois(this._etat.snap, tranche, empreintes);
        }
      }
      if (envois.length) this.enregistrerBase();

      let modifs = 0;
      for (const eq of mesEquipes) {
        let curseur = this._etat.curseurs[eq] || '1970-01-01T00:00:00Z';
        // Recouvrement de 30 s : une écriture lente peut être validée après une plus récente
        let depuis = new Date(new Date(curseur).getTime() - 30000).toISOString();
        for (;;) {
          const { data, error } = await this.client.from('omsmk_records').select('*')
            .eq('equipe_id', eq).gt('updated_at', depuis).order('updated_at').limit(1000);
          if (error) throw error;
          if (!data.length) break;
          modifs += appliquerDistants(this.base(), this._etat.snap, data);
          const dernier = data[data.length - 1].updated_at;
          if (new Date(dernier) > new Date(curseur)) curseur = dernier;
          if (data.length < 1000) break;
          depuis = dernier;
        }
        this._etat.curseurs[eq] = curseur;
      }
      this._finCycle(modifs);
    } catch (e) {
      this._enCours = false;
      this._erreur(e);
    }
  },

  _finCycle(modifs) {
    this._sauverEtat();
    if (modifs) { this.enregistrerBase(); if (this.onChange) this.onChange(modifs); }
    this._enCours = false;
    this.etat = 'ok'; this.erreur = ''; this.derniere = new Date();
    this._statut();
    if (this._relancer) { this._relancer = false; this.planifier(200); }
  },

  // Fournis par l'application
  base: () => null,
  enregistrerBase: () => {}
};
