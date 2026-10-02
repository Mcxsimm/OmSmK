/* ==========================================================================
   OmSmK — Suivi de chantier (PWA hors-ligne)
   Données stockées localement (localStorage). Aucune donnée n'est envoyée
   sur un serveur : exporter une sauvegarde JSON pour partager / archiver.
   ========================================================================== */
'use strict';

const STORE_KEY = 'omsmk_db_v1';
const USER_KEY = 'omsmk_user';
const UI_KEY = 'omsmk_ui';
const REF = REFERENTIEL;

/* ============================== Utilitaires ============================== */
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmt = (n, d = 1) => Number(n || 0).toLocaleString('fr-FR', { minimumFractionDigits: d, maximumFractionDigits: d });
const fmtE = n => Number(n || 0).toLocaleString('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 });
const pc = n => Math.round((n || 0) * 100) + ' %';
const signe = (n, d = 1) => (n > 0.0001 ? '+' : '') + fmt(n, d);
const signeE = n => (n > 0.5 ? '+' : '') + fmtE(n);
const cls = n => n > 0.0001 ? 'pos' : (n < -0.0001 ? 'neg' : '');

function fmtDate(s) { return s ? new Date(s + 'T00:00:00').toLocaleDateString('fr-FR') : ''; }
function lireJSON(k, def) { try { const v = JSON.parse(localStorage.getItem(k)); return v ?? def; } catch (_e) { return def; } }

function toast(msg) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toast._t);
  toast._t = setTimeout(() => t.classList.remove('show'), 2600);
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

/* ================================ État =================================== */
function dbVide() { return { version: 1, chantiers: [], ops: [], suivi: [], taches: [], journal: [], reserves: [], checklists: {} }; }
function chargerDB() {
  const d = lireJSON(STORE_KEY, null);
  return d && Array.isArray(d.chantiers) ? Object.assign(dbVide(), d) : dbVide();
}
let db = chargerDB();
let user = lireJSON(USER_KEY, null);
const ui = Object.assign({
  view: 'tableau', chantierId: null, zone: null, terrainMode: 'liste', filtreTache: '',
  qualiteTab: 'reserves', reserveFiltre: 'ouvertes', semaine: null, equipe: 2
}, lireJSON(UI_KEY, {}));
if (!ui.semaine) ui.semaine = lundi(aujourdHui());

function save() {
  enregistrerLocal();
  Synchro.planifier();
}
function enregistrerLocal() {
  try { localStorage.setItem(STORE_KEY, JSON.stringify(db)); }
  catch (_e) { toast('⚠️ Stockage local plein : exportez une sauvegarde puis faites du ménage.'); }
}
function saveUI() { try { localStorage.setItem(UI_KEY, JSON.stringify(ui)); } catch (_e) { /* ignoré */ } }

const ch = () => db.chantiers.find(c => c.id === ui.chantierId) || null;
const deCh = (arr, cid = ui.chantierId) => arr.filter(x => x.chantierId === cid);
const nomUser = () => user ? `${user.prenom || ''} ${user.nom || ''}`.trim() : '';

function zonesDe(cid) { return [...new Set(deCh(db.taches, cid).map(t => t.zone))].filter(Boolean); }

function nbChecklist(cid, cle) {
  const l = cle === 'cdt' ? REF.checklistCDT : REF.qualiteFinChantier;
  const total = l.reduce((t, s) => t + s.items.length, 0);
  const st = (db.checklists[cid] || {})[cle] || {};
  return { faits: Object.keys(st).length, total };
}

/* ================================ Rendu ================================== */
const VUES = { tableau: vTableau, terrain: vTerrain, suivi: vSuivi, bte: vBTE, journal: vJournal, qualite: vQualite, chantiers: vChantiers };

function render() {
  if (!ch() && db.chantiers.length) ui.chantierId = db.chantiers[0].id;
  renderHeader();
  const c = ch();
  const vue = VUES[ui.view] ? ui.view : 'tableau';
  $('#view').innerHTML = (vue !== 'chantiers' && !c) ? vAccueil() : VUES[vue](c);
  $$('.tab').forEach(b => b.classList.toggle('active', b.dataset.view === vue));
  if (vue === 'terrain' && c) renderListeTaches();
  saveUI();
}

function renderHeader() {
  const sel = $('#chantierSelect');
  sel.innerHTML = db.chantiers.length
    ? db.chantiers.map(c => `<option value="${esc(c.id)}" ${c.id === ui.chantierId ? 'selected' : ''}>${esc(c.nom)}</option>`).join('')
    : '<option value="">Aucun chantier</option>';
  const ini = user ? ((user.prenom || '')[0] || '') + ((user.nom || '')[0] || '') : '';
  $('#userChip').textContent = '👤 ' + (ini.toUpperCase() || '?');
  $('#netDot').classList.toggle('off', !navigator.onLine);
  $('#netDot').title = navigator.onLine ? 'En ligne' : 'Hors-ligne : tout est enregistré sur l\'appareil';
  const b = $('#syncBtn');
  const etats = {
    off: ['☁️', 'Synchronisation en ligne désactivée'],
    ok: ['☁️✓', 'Synchronisé' + (Synchro.derniere ? ' à ' + Synchro.derniere.toLocaleTimeString('fr-FR') : '')],
    encours: ['☁️⟳', 'Synchronisation en cours…'],
    erreur: ['☁️⚠', 'Erreur de synchronisation : ' + Synchro.erreur]
  };
  const [txt, titre] = Synchro.connecte() ? (navigator.onLine ? etats[Synchro.etat] || etats.ok : ['☁️⏸', 'Hors-ligne : synchronisation au retour du réseau']) : etats.off;
  b.textContent = txt; b.title = titre;
  b.classList.toggle('sync-err', Synchro.connecte() && Synchro.etat === 'erreur');
}

function vAccueil() {
  return `
  <div class="card" style="max-width:640px;margin:20px auto;text-align:center">
    <div style="font-size:2.6rem">🏗️</div>
    <h2 style="margin:6px 0 4px">Bienvenue dans OmSmK</h2>
    <p class="muted">Pilotez vos chantiers : BTE et cadences cibles, suivi hebdomadaire par phase
    (écarts d'heures et impact €), saisie terrain par zone, journal, intempéries, réserves et check-list CDT.</p>
    <div class="grid" style="margin-top:14px">
      <button class="btn primary block" data-act="chantierNew">➕ Créer un chantier</button>
      <button class="btn block" data-act="importFichier">📥 Importer un BTE SMAC (.xlsx) ou une liste terrain (.csv)</button>
      <button class="btn block" data-act="demo">🎓 Charger la démo (cas pratique CIGV)</button>
    </div>
    <p class="small muted" style="margin-top:14px">Les données restent sur cet appareil et l'application fonctionne sans réseau.</p>
  </div>`;
}

/* ---------------------------- Tableau de bord ---------------------------- */
function kpi(lbl, val, sub = '', c = '') {
  return `<div class="kpi"><div class="lbl">${lbl}</div><div class="val ${c}">${val}</div>${sub ? `<div class="sub">${sub}</div>` : ''}</div>`;
}

function alertes(c, s) {
  const out = [];
  const auj = aujourdHui();
  s.rows.forEach(r => {
    const nomP = `<b>${esc(r.ouvrage)} · ${esc(r.phase)}</b>`;
    if (r.pct >= 1 && r.ecartH < -0.05) out.push(`${nomP} : terminée avec un dépassement de ${fmt(-r.ecartH)} h (${fmtE(r.impact)}).`);
    else if (r.ecartProj < -Math.max(1, r.budget * 0.05)) out.push(`${nomP} : dérive projetée de ${fmt(r.ecartProj)} h (${fmtE(r.impactProj)}) à ${pc(r.pct)} d'avancement.`);
    else if (r.heures > r.budget && r.budget > 0) out.push(`${nomP} : heures pointées (${fmt(r.heures)} h) supérieures au budget (${fmt(r.budget)} h).`);
  });
  const enRetard = deCh(db.reserves).filter(r => r.statut !== 'levée' && r.echeance && r.echeance < auj).length;
  if (enRetard) out.push(`<b>${enRetard} réserve(s)</b> en retard sur leur échéance de levée.`);
  const semCourante = lundi(auj);
  if (s.rows.length && c.dateDebut && c.dateDebut <= auj && (!c.dateFin || c.dateFin >= semCourante)
      && !deCh(db.suivi).some(x => x.semaine === semCourante)) out.push('Le suivi de la semaine en cours n\'est pas encore renseigné.');
  return out;
}

function vTableau(c) {
  const s = calcSuivi(db, c.id);
  const t = statsTerrain(db, c.id);
  const res = deCh(db.reserves);
  const ouvertes = res.filter(r => r.statut !== 'levée').length;
  const jIntemp = deCh(db.journal).filter(j => j.intemperie).length;
  const cdt = nbChecklist(c.id, 'cdt');
  const indice = s.tot.heures > 0 ? s.tot.gagnees / s.tot.heures : null;
  const al = alertes(c, s);

  const phases = s.rows.length ? s.rows.map(r => `
    <div class="phase-row">
      <div><div style="font-weight:700">${esc(r.phase)}</div><div class="small muted">${esc(r.ouvrage)}</div></div>
      <div>
        <div class="bar ${r.pct >= 1 ? 'ok' : ''}"><i style="width:${Math.min(100, r.pct * 100)}%"></i></div>
        <div class="small muted" style="margin-top:3px">${pc(r.pct)} · ${fmt(r.heures)} h pointées / ${fmt(r.budget)} h budget</div>
      </div>
      <div class="right nowrap"><span class="${cls(r.ecartH)}" style="font-weight:800">${signe(r.ecartH)} h</span><div class="small muted">${signeE(r.impact)}</div></div>
    </div>`).join('')
    : `<div class="empty"><span class="big">🧮</span>Aucun BTE pour ce chantier.<br><button class="btn primary" style="margin-top:8px" data-act="goto" data-view="bte">Construire le BTE</button></div>`;

  return `
  <div class="card-head"><h2>📊 ${esc(c.nom)}</h2>
    <div class="row"><button class="btn" data-act="rapportPDF">📄 Rapport PDF</button><button class="btn" data-act="exportExcel">📗 Export Excel</button></div>
  </div>
  ${al.length ? `<div class="warnbox"><b>⚠️ Points d'attention</b><ul class="list-plain">${al.map(a => `<li>${a}</li>`).join('')}</ul></div>` : ''}
  <div class="grid grid-kpi" style="margin-bottom:14px">
    ${kpi('Avancement (pondéré)', pc(s.tot.pct), `${fmt(s.tot.gagnees)} h gagnées`)}
    ${kpi('Heures budgétées', fmt(s.tot.budget) + ' h', `${fmt(s.tot.budget / hjDe(c))} jours-homme`)}
    ${kpi('Heures pointées', fmt(s.tot.heures) + ' h')}
    ${kpi('Écart heures à date', signe(s.tot.ecartH) + ' h', signeE(s.tot.impact), cls(s.tot.ecartH))}
    ${kpi('Écart projeté fin', signe(s.tot.ecartProj) + ' h', signeE(s.tot.impactProj), cls(s.tot.ecartProj))}
    ${kpi('Indice productivité', indice === null ? '–' : fmt(indice, 2), 'h gagnées / h pointées', indice === null ? '' : cls(indice - 1))}
    ${kpi('Avancement terrain', pc(t.pct), `${t.faites} / ${t.total} tâches`)}
    ${kpi('Réserves ouvertes', ouvertes, `${res.length} au total`, ouvertes ? 'neg' : '')}
    ${kpi('Jours intempéries', jIntemp)}
    ${kpi('Check-list CDT', `${cdt.faits}/${cdt.total}`)}
  </div>
  <div class="grid grid-2">
    <div class="card"><div class="card-head"><h3>Avancement par phase</h3><button class="btn sm" data-act="goto" data-view="suivi">Saisir la semaine →</button></div>${phases}</div>
    <div class="card">
      <div class="card-head"><h3>Fiche chantier</h3><button class="btn sm" data-act="chantierEdit" data-id="${esc(c.id)}">Modifier</button></div>
      <table class="t"><tbody>
        ${[['Client', c.client], ['Métier', `${c.metier || ''} ${c.support ? '· support ' + c.support : ''}`], ['Adresse', c.adresse], ['N° imputation', c.imputation], ['Agence', c.agence],
           ['Conducteur de travaux', c.conducteur], ['Chef de chantier', c.chef], ['Marché HT', num(c.marcheHT) ? fmtE(c.marcheHT) : ''],
           ['Taux horaire équipe', num(c.tauxHoraire) ? fmtE(c.tauxHoraire) + ' / h' : ''], ['Journée de travail', hjDe(c) + ' h'],
           ['Début / fin', `${fmtDate(c.dateDebut)} → ${fmtDate(c.dateFin)}`]]
          .filter(r => String(r[1] || '').trim()).map(r => `<tr><td class="muted">${r[0]}</td><td><b>${esc(r[1])}</b></td></tr>`).join('')}
      </tbody></table>
    </div>
  </div>`;
}

/* -------------------------------- Terrain -------------------------------- */
function vTerrain(c) {
  const taches = deCh(db.taches);
  if (!taches.length) {
    return `<div class="card"><div class="empty"><span class="big">✅</span>
      Aucune tâche terrain pour ce chantier.<br>Générez la liste <b>zones × tâches</b> (terrasses, façades, supports, niveaux…)
      ou importez un CSV <code>Chantier;Zone;Lot;Tache;Fait;Observation</code>.
      <div class="row" style="justify-content:center;margin-top:12px">
        <button class="btn primary" data-act="genTaches">⚙️ Générer la liste</button>
        <button class="btn" data-act="importFichier">📥 Importer un CSV / Excel</button>
      </div></div></div>`;
  }
  const zones = zonesDe(c.id);
  if (!zones.includes(ui.zone)) ui.zone = zones[0];
  const st = statsTerrain(db, c.id);
  const mode = ui.terrainMode;

  const entete = `
  <div class="card-head">
    <h2>✅ Saisie terrain</h2>
    <div class="row">
      <span class="badge blue" id="terrainBadge">${st.faites}/${st.total} · ${pc(st.pct)}</span>
      <div class="seg"><button class="${mode === 'liste' ? 'on' : ''}" data-act="terrainMode" data-mode="liste">Liste</button><button class="${mode === 'matrice' ? 'on' : ''}" data-act="terrainMode" data-mode="matrice">Matrice</button></div>
    </div>
  </div>`;

  if (mode === 'matrice') return entete + vMatrice(c, zones) + piedTerrain();

  return entete + `
  <div class="card">
    <div class="zone-nav">
      <button class="btn" data-act="zoneNav" data-dir="-1" title="Zone précédente">◀</button>
      <button class="zone-pick" data-act="zonePicker"><span class="lbl">📍 Zone / support ▾</span><span class="val" id="zoneLabel">${esc(ui.zone)}</span></button>
      <button class="btn" data-act="zoneNav" data-dir="1" title="Zone suivante">▶</button>
    </div>
    <div class="row" style="margin-top:10px">
      <button class="btn sm accent" data-act="scanQR">📷 Scanner QR</button>
      <button class="btn sm" data-act="cocherZone" data-v="1">✅ Tout cocher</button>
      <button class="btn sm" data-act="cocherZone" data-v="0">❌ Tout décocher</button>
      <span class="grow"></span>
      <span class="badge" id="zoneBadge"></span>
    </div>
    <input class="input" style="margin-top:10px" placeholder="Filtrer les tâches…" value="${esc(ui.filtreTache)}" data-input="filtreTache">
  </div>
  <div id="taskList"></div>
  <div class="row" style="margin-bottom:14px">
    <button class="btn" data-act="tacheAjout">➕ Ajouter un travail non prévu</button>
    <button class="btn" data-act="copierRecap">📋 Copier le récap du jour</button>
  </div>` + piedTerrain();
}

function piedTerrain() {
  return `<div class="card"><div class="row">
    <button class="btn sm" data-act="genTaches">⚙️ Générer / compléter la liste</button>
    <button class="btn sm" data-act="qrEtiquettes">🏷️ Étiquettes QR des zones</button>
    <button class="btn sm" data-act="importFichier">📥 Importer</button>
  </div></div>`;
}

function renderListeTaches() {
  const box = $('#taskList');
  if (!box) return;
  const f = norm(ui.filtreTache);
  const toutes = deCh(db.taches).filter(t => t.zone === ui.zone);
  const visibles = toutes.filter(t => !f || norm(t.tache).includes(f) || norm(t.lot).includes(f));
  const faites = toutes.filter(t => estFait(t.fait)).length;
  const st = statsTerrain(db, ui.chantierId);
  if ($('#terrainBadge')) $('#terrainBadge').textContent = `${st.faites}/${st.total} · ${pc(st.pct)}`;
  const badge = $('#zoneBadge');
  if (badge) {
    badge.textContent = `${faites} / ${toutes.length} (${toutes.length ? Math.round(faites / toutes.length * 100) : 0} %)`;
    badge.className = 'badge ' + (faites === toutes.length && toutes.length ? 'ok' : 'blue');
  }
  box.innerHTML = visibles.length ? visibles.map(t => {
    const fait = estFait(t.fait);
    return `<div class="task ${fait ? 'done' : ''} ${t.ajout ? 'custom' : ''}">
      <label class="check t-main">
        <input type="checkbox" ${fait ? 'checked' : ''} data-change="toggleTache" data-id="${esc(t.id)}">
        <span><span class="t-title">${esc(t.tache)}</span>
          ${t.lot ? ` <span class="badge">${esc(t.lot)}</span>` : ''}${t.ajout ? ' <span class="badge accent">Non prévu</span>' : ''}
          <div class="t-meta">${fait && t.faitLe ? `Fait le ${fmtDate(t.faitLe)}${t.faitPar ? ' par ' + esc(t.faitPar) : ''}` : ''}</div>
        </span>
      </label>
      <input class="input t-obs" placeholder="Observation…" value="${esc(t.obs)}" data-change="obsTache" data-id="${esc(t.id)}">
      <button class="icon-btn" data-act="tacheSuppr" data-id="${esc(t.id)}" title="Supprimer">🗑</button>
    </div>`;
  }).join('') : '<div class="card empty">Aucune tâche ne correspond.</div>';
}

function vMatrice(_c, zones) {
  const taches = deCh(db.taches);
  const cols = [...new Set(taches.map(t => t.tache))];
  const idx = new Map(taches.map(t => [t.zone + '||' + t.tache, t]));
  const head = `<tr><th>Zone</th>${cols.map(t => `<th class="rot">${esc(t)}</th>`).join('')}<th class="num">%</th></tr>`;
  const body = zones.map(z => {
    let n = 0, f = 0;
    const cells = cols.map(col => {
      const t = idx.get(z + '||' + col);
      if (!t) return '<td class="cell na"></td>';
      n++; const ok = estFait(t.fait); if (ok) f++;
      return `<td class="cell ${ok ? 'on' : 'off'}" data-act="toggleCell" data-id="${esc(t.id)}" title="${esc(z)} — ${esc(col)}">${ok ? '✓' : '·'}</td>`;
    }).join('');
    return `<tr><td class="zone"><a href="#" data-act="ouvrirZone" data-zone="${esc(z)}">${esc(z)}</a></td>${cells}<td class="num"><b>${n ? Math.round(f / n * 100) : 0} %</b></td></tr>`;
  }).join('');
  const foot = `<tr class="total"><td>Total</td>${cols.map(col => {
    const ts = taches.filter(t => t.tache === col);
    const f = ts.filter(t => estFait(t.fait)).length;
    return `<td class="num small">${ts.length ? Math.round(f / ts.length * 100) : 0}%</td>`;
  }).join('')}<td></td></tr>`;
  return `<div class="card"><p class="small muted" style="margin-top:0">Touchez une case pour cocher / décocher. Nom de zone : ouvrir la saisie détaillée.</p>
    <div class="table-wrap"><table class="t matrix"><thead>${head}</thead><tbody>${body}${foot}</tbody></table></div></div>`;
}

/* ------------------------------ Suivi hebdo ------------------------------ */
function vSuivi(c) {
  const phases = phasesBTE(db, c.id);
  if (!phases.length) {
    return `<div class="card"><div class="empty"><span class="big">📈</span>Le suivi hebdomadaire s'appuie sur les phases du BTE.<br>
      <div class="row" style="justify-content:center;margin-top:10px"><button class="btn primary" data-act="goto" data-view="bte">Construire le BTE</button>
      <button class="btn" data-act="importFichier">📥 Importer un BTE SMAC</button></div></div></div>`;
  }
  const sem = ui.semaine;
  const calc = calcSuivi(db, c.id, sem);
  const precedent = calcSuivi(db, c.id, addDays(sem, -1));
  const entreesSem = deCh(db.suivi).filter(s => s.semaine === sem);
  const totalSem = entreesSem.reduce((t, s) => t + num(s.heures), 0);
  const nSem = c.dateDebut ? Math.floor((new Date(sem) - new Date(lundi(c.dateDebut))) / (7 * 86400000)) + 1 : null;

  let ouvCourant = null;
  const lignes = calc.rows.map((r, i) => {
    const e = entreesSem.find(s => s.ouvrage === r.ouvrage && s.phase === r.phase);
    const prev = precedent.rows[i];
    const g = r.ouvrage !== ouvCourant ? `<tr class="group"><td colspan="10">🏢 ${esc(r.ouvrage)}</td></tr>` : '';
    ouvCourant = r.ouvrage;
    const valPct = e && e.pct !== null && e.pct !== undefined ? Math.round(num(e.pct) * 1000) / 10 : '';
    return g + `<tr>
      <td><b>${esc(r.phase)}</b></td>
      <td class="num">${fmt(r.budget)}</td>
      <td class="num nowrap"><input class="input num" type="number" inputmode="decimal" min="0" max="100" step="5" placeholder="${Math.round(prev.pct * 100)}"
            value="${valPct}" data-change="suiviPct" data-o="${esc(r.ouvrage)}" data-p="${esc(r.phase)}">
          <button class="icon-btn" title="Calculer depuis les quantités" data-act="suiviQte" data-o="${esc(r.ouvrage)}" data-p="${esc(r.phase)}">📐</button></td>
      <td class="num"><input class="input num" type="number" inputmode="decimal" min="0" step="0.5" value="${e && num(e.heures) ? num(e.heures) : ''}"
            data-change="suiviH" data-o="${esc(r.ouvrage)}" data-p="${esc(r.phase)}"></td>
      <td class="num"><b>${pc(r.pct)}</b></td>
      <td class="num">${fmt(r.heures)}</td>
      <td class="num ${cls(r.ecartH)}"><b>${signe(r.ecartH)}</b></td>
      <td class="num ${cls(r.impact)}">${signeE(r.impact)}</td>
      <td class="num ${cls(r.ecartProj)}">${signe(r.ecartProj)}</td>
      <td class="num ${cls(r.impactProj)}">${signeE(r.impactProj)}</td>
    </tr>`;
  }).join('');
  const T = calc.tot;

  // Historique des semaines saisies
  const semaines = [...new Set(deCh(db.suivi).map(s => s.semaine))].sort();
  const hist = semaines.length ? `
    <div class="card"><h3 style="margin-bottom:8px">Historique des saisies</h3>
    <div class="table-wrap"><table class="t"><thead><tr><th>Phase</th>${semaines.map(w => `<th class="num"><a href="#" data-act="allerSemaine" data-s="${w}">S${semISO(w)}</a><div class="small">${fmtDate(w).slice(0, 5)}</div></th>`).join('')}</tr></thead>
    <tbody>${phases.map(p => `<tr><td>${esc(p.ouvrage)} · <b>${esc(p.phase)}</b></td>${semaines.map(w => {
      const e = deCh(db.suivi).find(s => s.semaine === w && s.ouvrage === p.ouvrage && s.phase === p.phase);
      if (!e) return '<td class="num muted">–</td>';
      return `<td class="num small">${e.pct !== null && e.pct !== undefined ? pc(e.pct) : '·'}<br><span class="muted">${fmt(e.heures)} h</span></td>`;
    }).join('')}</tr>`).join('')}</tbody></table></div></div>` : '';

  return `
  <div class="card-head"><h2>📈 Suivi hebdomadaire</h2></div>
  <div class="help">Chaque semaine : renseignez le <b>% d'avancement cumulé</b> de chaque phase (une approximation suffit) et les <b>heures pointées dans la semaine</b>
    (le total doit être cohérent avec le pointage RH). Écart = heures budgétées × % réalisé − heures pointées. Positif = gain, négatif = dépassement.</div>
  <div class="card">
    <div class="row">
      <button class="btn" data-act="semNav" data-d="-7">◀</button>
      <input type="date" class="input" style="max-width:170px" value="${sem}" data-change="semDate">
      <button class="btn" data-act="semNav" data-d="7">▶</button>
      <button class="btn sm" data-act="semNav" data-d="0">Cette semaine</button>
      <span class="grow"></span>
      <span class="badge blue">Semaine ${semISO(sem)} · du ${fmtDate(sem)} au ${fmtDate(addDays(sem, 6))}${nSem ? ` · semaine n°${nSem} du chantier` : ''}</span>
    </div>
  </div>
  <div class="card">
    <div class="table-wrap"><table class="t">
      <thead><tr><th>Phase</th><th class="num">Objectif (h)</th><th class="num">% cumulé</th><th class="num">H. semaine</th>
        <th class="num">% réalisé</th><th class="num">H. pointées</th><th class="num">Écart h</th><th class="num">Impact €</th><th class="num">Écart projeté h</th><th class="num">Impact projeté</th></tr></thead>
      <tbody>${lignes}
        <tr class="total"><td>TOTAL</td><td class="num">${fmt(T.budget)}</td><td></td><td class="num">${fmt(totalSem)}</td><td class="num">${pc(T.pct)}</td>
          <td class="num">${fmt(T.heures)}</td><td class="num ${cls(T.ecartH)}">${signe(T.ecartH)}</td><td class="num ${cls(T.impact)}">${signeE(T.impact)}</td>
          <td class="num ${cls(T.ecartProj)}">${signe(T.ecartProj)}</td><td class="num ${cls(T.impactProj)}">${signeE(T.impactProj)}</td></tr>
      </tbody></table></div>
    <p class="small muted">Total heures saisies cette semaine : <b>${fmt(totalSem)} h</b> — à rapprocher du pointage RH. Valeurs cumulées jusqu'au ${fmtDate(addDays(sem, 6))}. Taux horaire : ${fmtE(calc.taux)}/h.</p>
  </div>
  ${hist}`;
}

/* ---------------------------------- BTE ---------------------------------- */
function vBTE(c) {
  const ops = deCh(db.ops);
  const hj = hjDe(c);
  const taux = num(c.tauxHoraire);
  let tH = 0, tB = 0, tD = 0, ouvCourant = null;
  const lignes = ops.map(op => {
    const h = heuresOp(op, c);
    const b = h * taux;
    const d = num(op.devis);
    tH += h; tB += b; tD += d;
    const calcule = num(op.cadence) > 0 && num(op.metre) > 0;
    const g = op.ouvrage !== ouvCourant ? `<tr class="group"><td colspan="11">🏢 ${esc(op.ouvrage)}</td></tr>` : '';
    ouvCourant = op.ouvrage;
    return g + `<tr>
      <td>${esc(op.phase)}</td>
      <td><b>${esc(op.operation)}</b>${op.designation ? `<div class="small muted">${esc(op.designation)}</div>` : ''}</td>
      <td class="num"><input class="input num" type="number" inputmode="decimal" value="${num(op.metre) || ''}" data-change="opField" data-f="metre" data-id="${esc(op.id)}"></td>
      <td>${esc(op.unite)}</td>
      <td class="num"><input class="input num" type="number" inputmode="decimal" value="${num(op.cadence) ? Math.round(num(op.cadence) * 100) / 100 : ''}" data-change="opField" data-f="cadence" data-id="${esc(op.id)}" title="${esc(op.unite)} / jour / homme"></td>
      <td class="num">${calcule ? `<b>${fmt(h)}</b>` : `<input class="input num" type="number" inputmode="decimal" value="${num(op.heuresForfait) || ''}" data-change="opField" data-f="heuresForfait" data-id="${esc(op.id)}" title="Heures au forfait">`}</td>
      <td class="num">${fmtE(b)}</td>
      <td class="num"><input class="input num" type="number" inputmode="decimal" value="${num(op.devis) || ''}" data-change="opField" data-f="devis" data-id="${esc(op.id)}"></td>
      <td class="num ${d ? cls(d - b) : ''}">${d ? signeE(d - b) : ''}</td>
      <td class="nowrap"><button class="icon-btn" data-act="opEdit" data-id="${esc(op.id)}" title="Modifier">✏️</button><button class="icon-btn" data-act="opSuppr" data-id="${esc(op.id)}" title="Supprimer">🗑</button></td>
    </tr>`;
  }).join('');

  const equipe = Math.max(1, num(ui.equipe) || 1);
  const jours = tH / (hj * equipe);
  const partMO = num(c.marcheHT) ? tB / num(c.marcheHT) : 0;

  return `
  <div class="card-head"><h2>🧮 Budget technique d'exécution</h2>
    <div class="row">
      <button class="btn primary" data-act="opNew">➕ Opération</button>
      <button class="btn" data-act="biblio">📚 Cadences standard</button>
      <button class="btn" data-act="importFichier">📥 Importer un BTE (.xlsx)</button>
    </div>
  </div>
  <div class="grid grid-kpi" style="margin-bottom:14px">
    ${kpi('Heures budgétées', fmt(tH) + ' h', `${fmt(tH / hj)} jours-homme`)}
    ${kpi('Budget main d\'œuvre', fmtE(tB), partMO ? `${pc(partMO)} du marché` : '')}
    ${kpi('Devis MO (hors marge)', tD ? fmtE(tD) : '–')}
    ${kpi('Gain / perte vs devis', tD ? signeE(tD - tB) : '–', tD ? pc((tD - tB) / tD) : '', tD ? cls(tD - tB) : '')}
    <div class="kpi"><div class="lbl">Durée indicative</div><div class="val">${fmt(jours, 1)} j</div>
      <div class="sub">avec <input class="input" type="number" min="1" style="width:54px;padding:2px 4px;display:inline" value="${equipe}" data-change="equipe"> compagnon(s) · ${fmt(jours / 5, 1)} sem.</div></div>
  </div>
  <div class="card">
    <div class="row small" style="margin-bottom:10px">
      <label>Taux horaire équipe (€/h) <input class="input" style="width:90px;display:inline" type="number" step="0.5" value="${num(c.tauxHoraire) || ''}" data-change="chField" data-f="tauxHoraire"></label>
      <label>Heures / jour <input class="input" style="width:70px;display:inline" type="number" step="0.25" value="${hj}" data-change="chField" data-f="heuresJour"></label>
      <label>Marché HT (€) <input class="input" style="width:120px;display:inline" type="number" value="${num(c.marcheHT) || ''}" data-change="chField" data-f="marcheHT"></label>
    </div>
    ${ops.length ? `<div class="table-wrap"><table class="t">
      <thead><tr><th>Phase</th><th>Opération</th><th class="num">Métré</th><th>U</th><th class="num">Cadence<br><span class="small">u/j/homme</span></th><th class="num">Heures</th><th class="num">Budget</th><th class="num">Devis</th><th class="num">Écart</th><th></th></tr></thead>
      <tbody>${lignes}
      <tr class="total"><td colspan="5">TOTAL MAIN D'ŒUVRE</td><td class="num">${fmt(tH)}</td><td class="num">${fmtE(tB)}</td><td class="num">${tD ? fmtE(tD) : ''}</td><td class="num ${tD ? cls(tD - tB) : ''}">${tD ? signeE(tD - tB) : ''}</td><td></td></tr>
      </tbody></table></div>`
    : `<div class="empty"><span class="big">🧮</span>Aucune opération. Ajoutez-les une par une, depuis la bibliothèque de cadences standard, ou importez votre BTE Excel SMAC.</div>`}
    <p class="small muted">Heures = métré ÷ cadence × ${hj} h. Sans métré ni cadence (installation, appro…), saisissez directement les heures au forfait. Écart = devis − budget (positif = gain).</p>
  </div>`;
}

/* -------------------------------- Journal -------------------------------- */
function vJournal(_c) {
  const js = deCh(db.journal).sort((a, b) => b.date.localeCompare(a.date));
  const nI = js.filter(j => j.intemperie).length;
  const hT = js.reduce((t, j) => t + num(j.heures), 0);
  return `
  <div class="card-head"><h2>📒 Journal de chantier</h2><button class="btn primary" data-act="journalNew">➕ Nouvelle entrée</button></div>
  <div class="grid grid-kpi" style="margin-bottom:14px">
    ${kpi('Entrées', js.length)}${kpi('Jours d\'intempéries', nI, '', nI ? 'neg' : '')}${kpi('Heures déclarées', fmt(hT) + ' h')}
  </div>
  ${js.length ? js.map(j => `
    <div class="entry ${j.intemperie ? 'intemp' : ''}">
      <div class="entry-head">
        <div><b>${fmtDate(j.date)}</b> ${j.meteo ? `<span class="badge">${esc(j.meteo)}</span>` : ''} ${j.intemperie ? '<span class="badge warn">🌧️ Intempérie</span>' : ''}
          ${num(j.effectif) ? `<span class="badge blue">👷 ${num(j.effectif)}</span>` : ''} ${num(j.heures) ? `<span class="badge">${fmt(j.heures)} h</span>` : ''}</div>
        <div><button class="icon-btn" data-act="journalEdit" data-id="${esc(j.id)}">✏️</button><button class="icon-btn" data-act="journalSuppr" data-id="${esc(j.id)}">🗑</button></div>
      </div>
      ${j.intemperie && j.cause ? `<p class="small"><b>Cause :</b> ${esc(j.cause)}${(j.verifs || []).length ? ` · ${j.verifs.length} bonne(s) pratique(s) vérifiée(s)` : ''}</p>` : ''}
      ${j.texte ? `<p>${esc(j.texte)}</p>` : ''}
      <div class="small muted" style="margin-top:4px">${esc(j.auteur || '')}</div>
    </div>`).join('') : '<div class="card empty"><span class="big">📒</span>Aucune entrée. Consignez chaque jour l\'effectif, la météo, les travaux et les événements.</div>'}`;
}

/* -------------------------------- Qualité -------------------------------- */
function vQualite(c) {
  const t = ui.qualiteTab;
  const res = deCh(db.reserves);
  const ouv = res.filter(r => r.statut !== 'levée').length;
  const cdt = nbChecklist(c.id, 'cdt');
  const fin = nbChecklist(c.id, 'fin');
  const seg = `<div class="seg" style="margin-bottom:12px">
    <button class="${t === 'reserves' ? 'on' : ''}" data-act="qTab" data-t="reserves">Réserves / OPR (${ouv})</button>
    <button class="${t === 'cdt' ? 'on' : ''}" data-act="qTab" data-t="cdt">Check-list CDT ${cdt.faits}/${cdt.total}</button>
    <button class="${t === 'fin' ? 'on' : ''}" data-act="qTab" data-t="fin">Fin de chantier ${fin.faits}/${fin.total}</button></div>`;
  let corps = '';
  if (t === 'reserves') {
    const f = ui.reserveFiltre;
    const auj = aujourdHui();
    const liste = res.filter(r => f === 'toutes' || (f === 'ouvertes' ? r.statut !== 'levée' : r.statut === 'levée'))
      .sort((a, b) => (a.echeance || '9').localeCompare(b.echeance || '9'));
    corps = `<div class="row" style="margin-bottom:10px">
        <div class="seg">${['ouvertes', 'levées', 'toutes'].map(x => `<button class="${f === x ? 'on' : ''}" data-act="resFiltre" data-f="${x}">${x[0].toUpperCase() + x.slice(1)}</button>`).join('')}</div>
        <span class="grow"></span><button class="btn primary" data-act="resNew">➕ Réserve</button></div>
      ${liste.length ? liste.map(r => {
        const retard = r.statut !== 'levée' && r.echeance && r.echeance < auj;
        return `<div class="entry">
          <div class="entry-head"><div><b>${esc(r.zone || 'Sans zone')}</b> <span class="badge">${esc(r.origine || '')}</span>
            ${r.statut === 'levée' ? `<span class="badge ok">Levée le ${fmtDate(r.leveeLe)}</span>` : `<span class="badge ${retard ? 'ko' : 'warn'}">${retard ? 'En retard' : 'Ouverte'}${r.echeance ? ' · échéance ' + fmtDate(r.echeance) : ''}</span>`}</div>
            <div class="nowrap"><button class="btn sm" data-act="resLever" data-id="${esc(r.id)}">${r.statut === 'levée' ? '↩️ Rouvrir' : '✅ Lever'}</button>
            <button class="icon-btn" data-act="resEdit" data-id="${esc(r.id)}">✏️</button><button class="icon-btn" data-act="resSuppr" data-id="${esc(r.id)}">🗑</button></div></div>
          <p>${esc(r.description)}</p>
          <div class="small muted">${r.responsable ? 'Responsable : ' + esc(r.responsable) + ' · ' : ''}créée le ${fmtDate(r.creeLe)}</div>
        </div>`;
      }).join('') : '<div class="card empty">Aucune réserve dans cette vue.</div>'}`;
  } else {
    const liste = t === 'cdt' ? REF.checklistCDT : REF.qualiteFinChantier;
    const st = ((db.checklists[c.id] || {})[t]) || {};
    corps = (t === 'fin' ? '<div class="help">Contrôle qualité de fin de chantier (à réaliser avant le DGD). Base générique à adapter à votre formulaire agence.</div>' : '')
      + liste.map((s, si) => `<div class="cl-section"><h4>${esc(s.section)}</h4>${s.items.map((it, ii) => {
        const k = si + '-' + ii; const v = st[k];
        return `<div class="cl-item ${v ? 'done' : ''}"><label class="check"><input type="checkbox" ${v ? 'checked' : ''} data-change="clToggle" data-l="${t}" data-k="${k}"><span>${esc(it)}</span></label>
          ${v ? `<div class="meta">Fait le ${fmtDate(v.date)}${v.par ? ' par ' + esc(v.par) : ''}</div>` : ''}</div>`;
      }).join('')}</div>`).join('');
  }
  return `<div class="card-head"><h2>🛡️ Qualité & conformité</h2></div>${seg}<div class="card">${corps}</div>`;
}

/* -------------------------- Chantiers & données -------------------------- */
function vChantiers() {
  const liste = db.chantiers.map(c => {
    const s = calcSuivi(db, c.id);
    const t = statsTerrain(db, c.id);
    return `<div class="entry">
      <div class="entry-head">
        <div><b style="font-size:1.05rem">${esc(c.nom)}</b> ${c.id === ui.chantierId ? '<span class="badge ok">Actif</span>' : ''}
          ${badgeEquipe(c)}
          <div class="small muted">${esc([c.client, c.metier, c.conducteur && 'CDT : ' + c.conducteur].filter(Boolean).join(' · '))}</div></div>
        <div class="row">
          ${c.id !== ui.chantierId ? `<button class="btn sm primary" data-act="chantierOuvrir" data-id="${esc(c.id)}">Ouvrir</button>` : ''}
          ${!c.equipeId && Synchro.connecte() ? `<button class="btn sm" data-act="partager" data-id="${esc(c.id)}">☁️ Partager</button>` : ''}
          <button class="icon-btn" data-act="chantierEdit" data-id="${esc(c.id)}">✏️</button>
          <button class="icon-btn" data-act="chantierSuppr" data-id="${esc(c.id)}">🗑</button>
        </div>
      </div>
      <div class="grid grid-2" style="margin-top:8px">
        <div><div class="small muted">Avancement BTE ${pc(s.tot.pct)} · écart ${signe(s.tot.ecartH)} h</div><div class="bar"><i style="width:${s.tot.pct * 100}%"></i></div></div>
        <div><div class="small muted">Terrain ${t.faites}/${t.total}</div><div class="bar ok"><i style="width:${t.pct * 100}%"></i></div></div>
      </div>
    </div>`;
  }).join('');
  return `
  <div class="card-head"><h2>⚙️ Chantiers & données</h2><button class="btn primary" data-act="chantierNew">➕ Nouveau chantier</button></div>
  <div class="card">${liste || '<div class="empty">Aucun chantier.</div>'}</div>
  ${vSynchro()}
  <div class="grid grid-2">
    <div class="card">
      <h3 style="margin-bottom:8px">📥 Importer</h3>
      <p class="small muted">Détection automatique : <b>BTE standard SMAC</b> (.xlsx — opérations, métrés, cadences et suivi hebdo),
        <b>liste terrain</b> (.csv / .xlsx — colonnes <code>Chantier;Zone;Lot;Tache;Fait;Observation</code>, « Support » accepté pour « Zone ») ou <b>sauvegarde</b> (.json).</p>
      <button class="btn block" data-act="importFichier">Choisir un fichier…</button>
    </div>
    <div class="card">
      <h3 style="margin-bottom:8px">📤 Exporter / sauvegarder</h3>
      <div class="grid">
        <button class="btn block" data-act="exportJSON">💾 Sauvegarde complète (.json)</button>
        <button class="btn block" data-act="exportExcel" ${ch() ? '' : 'disabled'}>📗 Chantier actif en Excel</button>
        <button class="btn block" data-act="rapportPDF" ${ch() ? '' : 'disabled'}>📄 Rapport PDF du chantier actif</button>
      </div>
    </div>
    <div class="card">
      <h3 style="margin-bottom:8px">👤 Utilisateur</h3>
      <p class="small">${user ? `<b>${esc(nomUser())}</b> — ${esc(user.role || '')}` : 'Non identifié'}</p>
      <button class="btn block" data-act="identite">Modifier</button>
    </div>
    <div class="card">
      <h3 style="margin-bottom:8px">🧰 Divers</h3>
      <div class="grid">
        <button class="btn block" data-act="demo">🎓 Ajouter la démo (cas CIGV)</button>
        <button class="btn block danger" data-act="toutEffacer">🗑️ Effacer toutes les données</button>
      </div>
      <p class="small muted">Astuce : sur smartphone, « Ajouter à l'écran d'accueil » installe l'application, utilisable hors-ligne.</p>
    </div>
  </div>`;
}

/* ------------------------- Synchronisation en ligne ----------------------- */
function badgeEquipe(c) {
  if (!c.equipeId) return '<span class="badge">📱 Sur cet appareil</span>';
  const eq = Synchro.equipes.find(e => e.id === c.equipeId);
  return `<span class="badge blue">☁️ ${esc(eq ? eq.nom : 'Équipe')}</span>`;
}

function vSynchro() {
  if (!Synchro.disponible()) return '';
  if (!Synchro.connecte()) {
    return `<div class="card"><h3 style="margin-bottom:6px">☁️ Synchronisation en ligne</h3>
      <p class="small muted" style="margin-top:0">Connectez-vous pour partager des chantiers avec votre équipe : chaque appareil
        (téléphone du chef de chantier, PC du conducteur…) voit les mêmes données, mises à jour en direct. Sans réseau, l'application
        continue de fonctionner et envoie les saisies au retour de la connexion.</p>
      <button class="btn primary" data-act="syncConnexion">Se connecter avec mon e-mail</button></div>`;
  }
  const eqs = Synchro.equipes.map(e => {
    const nb = db.chantiers.filter(c => c.equipeId === e.id).length;
    return `<div class="entry"><div class="entry-head">
      <div><b>${esc(e.nom)}</b> <span class="badge ${e.role === 'admin' ? 'accent' : ''}">${e.role === 'admin' ? 'Administrateur' : 'Membre'}</span>
        <div class="small muted">${nb} chantier(s) partagé(s)</div></div>
      <button class="btn sm" data-act="equipeGerer" data-id="${esc(e.id)}">👥 Membres</button></div></div>`;
  }).join('');
  const etat = Synchro.etat === 'erreur' ? `<div class="warnbox">⚠️ ${esc(Synchro.erreur)}</div>` : '';
  return `<div class="card" id="syncCard">
    <div class="card-head"><h3>☁️ Synchronisation en ligne</h3>
      <div class="row"><button class="btn sm" data-act="syncMaintenant">🔄 Synchroniser</button><button class="btn sm" data-act="syncDeconnexion">Se déconnecter</button></div></div>
    <p class="small muted" style="margin-top:0">Connecté : <b>${esc(Synchro.email())}</b>${Synchro.derniere ? ` · dernière synchronisation ${Synchro.derniere.toLocaleTimeString('fr-FR')}` : ''}</p>
    ${etat}
    ${eqs || '<p class="small">Vous ne faites partie d\'aucune équipe. Créez-en une, ou demandez à un administrateur de vous inviter avec cette adresse e-mail.</p>'}
    <div class="row" style="margin-top:8px"><input class="input grow" id="nouvelleEquipe" placeholder="Nom d'une nouvelle équipe (ex : Agence Normandie - Étanchéité)">
      <button class="btn primary" data-act="equipeCreer">➕ Créer l'équipe</button></div>
    <p class="small muted">Pour partager un chantier existant : bouton « ☁️ Partager » dans la liste ci-dessus.</p>
  </div>`;
}

function modalConnexion() {
  const etape2 = !!Synchro.emailEnAttente;
  ouvrirModal('☁️ Connexion', `
    <p class="small muted" style="margin-top:0">Pas de mot de passe : vous recevez un e-mail de connexion.</p>
    ${champ('cxEmail', 'Adresse e-mail', Synchro.emailEnAttente || (user && user.email) || '', 'email', 'autocomplete="email"')}
    <button class="btn primary block" data-act="syncEnvoyer">📧 Recevoir l'e-mail de connexion</button>
    <div id="cxEtape2" class="${etape2 ? '' : 'hidden'}" style="margin-top:14px">
      <div class="help">Ouvrez l'e-mail reçu <b>sur cet appareil</b> et touchez le lien — ou saisissez ci-dessous le code à 6 chiffres s'il figure dans l'e-mail.</div>
      <div class="row">${'<input class="input grow" id="cxCode" inputmode="numeric" autocomplete="one-time-code" placeholder="Code à 6 chiffres">'}
        <button class="btn" data-act="syncCode">Valider le code</button></div>
    </div>`, `<button class="btn" data-act="fermerModal">Fermer</button>`);
}

async function modalEquipe(equipeId) {
  const eq = Synchro.equipes.find(e => e.id === equipeId);
  if (!eq) return;
  ouvrirModal(`👥 ${esc(eq.nom)}`, '<p class="muted">Chargement…</p>', `<button class="btn" data-act="fermerModal">Fermer</button>`, { pasDeFocus: true });
  try {
    const { membres, invitations } = await Synchro.membres(equipeId);
    const admin = eq.role === 'admin';
    const moi = Synchro.session.user.id;
    const enAttente = invitations.filter(i => !i.acceptee_le);
    $('#modalRoot .modal-body').innerHTML = `
      <h4 style="margin:0 0 6px">Membres (${membres.length})</h4>
      ${membres.map(m => `<div class="entry"><div class="entry-head"><div>${esc(m.email)} <span class="badge ${m.role === 'admin' ? 'accent' : ''}">${m.role === 'admin' ? 'Admin' : 'Membre'}</span>${m.user_id === moi ? ' <span class="badge ok">Vous</span>' : ''}</div>
        ${(admin && m.user_id !== moi) || m.user_id === moi ? `<button class="btn sm danger" data-act="membreRetirer" data-eq="${esc(equipeId)}" data-u="${esc(m.user_id)}">${m.user_id === moi ? 'Quitter l\'équipe' : 'Retirer'}</button>` : ''}</div></div>`).join('')}
      ${enAttente.length ? `<h4 style="margin:12px 0 6px">Invitations en attente</h4>${enAttente.map(i => `<div class="entry"><div class="entry-head"><div>${esc(i.email)} <span class="badge warn">En attente</span></div>
        ${admin ? `<button class="btn sm" data-act="invitationAnnuler" data-eq="${esc(equipeId)}" data-email="${esc(i.email)}">Annuler</button>` : ''}</div></div>`).join('')}` : ''}
      ${admin ? `<div class="sep"></div><h4 style="margin:0 0 6px">Inviter une personne</h4>
        <div class="row"><input class="input grow" id="invEmail" type="email" placeholder="e-mail de la personne">
          <select class="input" id="invRole" style="width:auto"><option value="membre">Membre</option><option value="admin">Administrateur</option></select>
          <button class="btn primary" data-act="equipeInviter" data-eq="${esc(equipeId)}">Inviter</button></div>
        <p class="small muted">La personne ouvre l'application, se connecte avec <b>cette adresse</b> et rejoint automatiquement l'équipe.
          Envoyez-lui le lien de l'application : <code>${esc(location.origin + location.pathname)}</code></p>` : ''}`;
  } catch (e) { $('#modalRoot .modal-body').innerHTML = `<div class="warnbox">${esc(e.message || e)}</div>`; }
}

function modalPartager(c) {
  const eqs = Synchro.equipes;
  if (!eqs.length) return toast('Créez d\'abord une équipe (Chantiers & données → Synchronisation en ligne).');
  ouvrirModal('☁️ Partager le chantier', `
    <p style="margin-top:0">« <b>${esc(c.nom)}</b> » et toutes ses données (BTE, suivi, terrain, journal, réserves, check-lists)
      seront visibles et modifiables par les membres de l'équipe choisie.</p>
    ${selectHTML('pgEquipe', 'Équipe', eqs.map(e => e.nom), eqs[0].nom)}
    <input type="hidden" id="pgChantier" value="${esc(c.id)}">
    <p class="small muted">Un chantier partagé ne peut pas être déplacé vers une autre équipe.</p>`,
    `<button class="btn" data-act="fermerModal">Annuler</button><button class="btn primary" data-act="partagerValider">Partager</button>`);
}

/* ================================ Modales ================================ */
let modalVerrou = false;
function ouvrirModal(titre, corps, pied = '', opts = {}) {
  modalVerrou = !!opts.verrou;
  $('#modalRoot').innerHTML = `<div class="modal-back"><div class="modal ${opts.large ? 'wide' : ''}" role="dialog" aria-modal="true">
    <div class="modal-head"><h3>${titre}</h3>${opts.verrou ? '' : '<button class="icon-btn" data-act="fermerModal" aria-label="Fermer">✕</button>'}</div>
    <div class="modal-body">${corps}</div>${pied ? `<div class="modal-foot">${pied}</div>` : ''}</div></div>`;
  const first = $('#modalRoot input:not([type=checkbox]), #modalRoot select, #modalRoot textarea');
  if (first && !opts.pasDeFocus) setTimeout(() => first.focus(), 50);
}
function fermerModal() { $('#modalRoot').innerHTML = ''; modalVerrou = false; arreterScan(); }
const val = id => { const el = document.getElementById(id); return el ? el.value.trim() : ''; };
const champ = (id, label, value = '', type = 'text', extra = '') =>
  `<div class="field"><label class="f" for="${id}">${label}</label><input class="input" id="${id}" type="${type}" value="${esc(value)}" ${extra}></div>`;
const selectHTML = (id, label, options, value) =>
  `<div class="field"><label class="f" for="${id}">${label}</label><select class="input" id="${id}">${options.map(o => `<option ${o === value ? 'selected' : ''}>${esc(o)}</option>`).join('')}</select></div>`;

function modalIdentite(verrou) {
  ouvrirModal('👤 Identification', `
    <p class="small muted" style="margin-top:0">Votre nom est enregistré sur les saisies (tâches cochées, journal, check-lists).</p>
    ${champ('idPrenom', 'Prénom', user && user.prenom)}${champ('idNom', 'Nom', user && user.nom)}
    ${selectHTML('idRole', 'Rôle', ['Conducteur de travaux', 'Chargé d\'affaires', 'Chef de chantier', 'Chef d\'équipe', 'Compagnon', 'Direction', 'Autre'], user && user.role)}`,
    `<button class="btn primary" data-act="saveIdentite">Valider</button>`, { verrou });
}

function modalChantier(c) {
  const e = c || { metier: 'Étanchéité', support: 'Béton', tauxHoraire: REF.tauxHoraireDefaut, heuresJour: REF.heuresJourDefaut, conducteur: nomUser() };
  ouvrirModal(c ? '✏️ Modifier le chantier' : '➕ Nouveau chantier', `
    <input type="hidden" id="chId" value="${esc(c ? c.id : '')}">
    ${champ('chNom', 'Nom du chantier *', e.nom)}
    <div class="grid grid-2">${champ('chClient', 'Client / maître d\'ouvrage', e.client)}${champ('chAdresse', 'Adresse', e.adresse)}</div>
    <div class="grid grid-2">${selectHTML('chMetier', 'Métier', ['Étanchéité', 'Façade', 'Autre'], e.metier)}${selectHTML('chSupport', 'Support', ['Béton', 'Acier', 'Bois', 'Parpaing', 'Autre'], e.support)}</div>
    <div class="grid grid-2">${champ('chImput', 'N° d\'imputation', e.imputation)}${champ('chAgence', 'Agence', e.agence)}</div>
    <div class="grid grid-2">${champ('chCdt', 'Conducteur de travaux', e.conducteur)}${champ('chChef', 'Chef de chantier', e.chef)}</div>
    <div class="grid grid-2">${champ('chMarche', 'Montant marché HT (€)', e.marcheHT || '', 'number')}${champ('chMarge', 'Marge commerciale (%)', e.margeCommerciale ? Math.round(num(e.margeCommerciale) * 1000) / 10 : '', 'number', 'step="0.1"')}</div>
    <div class="grid grid-2">${champ('chTaux', 'Taux horaire équipe (€/h)', e.tauxHoraire, 'number', 'step="0.5"')}${champ('chHj', 'Heures par journée', e.heuresJour, 'number', 'step="0.25"')}</div>
    <div class="grid grid-2">${champ('chDebut', 'Date de début', e.dateDebut, 'date')}${champ('chFin', 'Date de fin prévue', e.dateFin, 'date')}</div>`,
    `<button class="btn" data-act="fermerModal">Annuler</button><button class="btn primary" data-act="saveChantier">Enregistrer</button>`);
}

function phasesPour(c) {
  const std = Object.keys(REF.metiers[c.metier] || REF.metiers['Étanchéité']);
  const exist = [...new Set(deCh(db.ops).map(o => o.phase))];
  return [...new Set([...std, ...exist])];
}

function modalOp(op) {
  const c = ch();
  const e = op || { unite: 'm²' };
  const ouvrages = [...new Set(deCh(db.ops).map(o => o.ouvrage))];
  const phases = phasesPour(c);
  const opsStd = [...new Set(Object.values(REF.metiers).flatMap(m => Object.values(m).flat()))];
  ouvrirModal(op ? '✏️ Opération' : '➕ Nouvelle opération', `
    <input type="hidden" id="opId" value="${esc(op ? op.id : '')}">
    <div class="grid grid-2">
      ${champ('opOuvrage', 'Complexe / ouvrage *', e.ouvrage || ouvrages[0] || '', 'text', 'list="dlOuvrages" placeholder="ex : Toiture A, Bât. B façade nord"')}
      ${selectHTML('opPhase', 'Phase chantier', phases, e.phase || phases[0])}
    </div>
    <datalist id="dlOuvrages">${ouvrages.map(o => `<option value="${esc(o)}">`).join('')}</datalist>
    <datalist id="dlOps">${opsStd.map(o => `<option value="${esc(o)}">`).join('')}</datalist>
    ${champ('opOperation', 'Opération *', e.operation, 'text', 'list="dlOps"')}
    ${champ('opDesignation', 'Désignation / matériau', e.designation)}
    <div class="grid grid-2">
      ${champ('opMetre', 'Métré / DGPF', num(e.metre) || '', 'number', 'step="any"')}
      ${selectHTML('opUnite', 'Unité', ['m²', 'mL', 'U', 'h', 'forfait'], e.unite)}
    </div>
    <div class="grid grid-2">
      ${champ('opCadence', 'Cadence cible (unités / jour / homme)', num(e.cadence) || '', 'number', 'step="any"')}
      ${champ('opForfait', 'ou heures au forfait', num(e.heuresForfait) || '', 'number', 'step="any"')}
    </div>
    ${champ('opDevis', 'Devis MO hors marge (€)', num(e.devis) || '', 'number', 'step="any"')}`,
    `<button class="btn" data-act="fermerModal">Annuler</button><button class="btn primary" data-act="saveOp">Enregistrer</button>`);
}

function modalBiblio() {
  const c = ch();
  const ouvrages = [...new Set(deCh(db.ops).map(o => o.ouvrage))];
  ouvrirModal('📚 Cadences standard SMAC', `
    <div class="help">Cadences issues des simulateurs SMAC (journée de ${hjDe(c)} h). Le <b>coefficient chantier</b> pondère la cadence
      (surface, émergences, coactivité, hauteur, exigence qualité / sécurité…) : 1,10 = 10 % plus lent.</div>
    <div class="grid grid-2">
      ${champ('biOuvrage', 'Ajouter dans l\'ouvrage', ouvrages[0] || 'Ouvrage 1', 'text', 'list="dlOuvB"')}
      ${champ('biMetre', 'Métré', '', 'number', 'step="any"')}
    </div>
    <datalist id="dlOuvB">${ouvrages.map(o => `<option value="${esc(o)}">`).join('')}</datalist>
    <div class="grid grid-2">
      ${champ('biCoef', 'Coefficient chantier', '1', 'number', 'step="0.01"')}
      <div class="field"><label class="f">Métier / support</label><div class="row">
        <select class="input" id="biMetier" data-change="biblioFiltre" style="flex:1">${['Étanchéité', 'Façade'].map(m => `<option ${m === c.metier ? 'selected' : ''}>${m}</option>`).join('')}</select>
        <select class="input" id="biSupport" data-change="biblioFiltre" style="flex:1">${['Tous supports', 'Béton', 'Acier', 'Parpaing'].map(s => `<option ${s === c.support ? 'selected' : ''}>${s}</option>`).join('')}</select>
      </div></div>
    </div>
    <input class="input" id="biRecherche" placeholder="Rechercher (isolant, relevé, cassette…)" data-input="biblioFiltre">
    <div id="biListe" style="margin-top:10px"></div>`, '', { large: true, pasDeFocus: true });
  renderBiblio();
}

function renderBiblio() {
  const c = ch();
  const m = val('biMetier'), s = val('biSupport'), q = norm(val('biRecherche'));
  const hj = hjDe(c);
  const liste = REF.cadences.filter(x => x.m === m && (s === 'Tous supports' || x.s === 'Tous' || x.s === s) && (!q || norm(x.lib + ' ' + x.op + ' ' + x.phase).includes(q)));
  $('#biListe').innerHTML = `<div class="table-wrap"><table class="t"><thead><tr><th>Phase · opération</th><th>Désignation</th><th>Support</th><th class="num">h/u</th><th class="num">Cadence</th><th></th></tr></thead><tbody>
    ${liste.map(x => `<tr><td>${esc(x.phase)}<div class="small muted">${esc(x.op)}</div></td><td>${esc(x.lib)}</td><td>${esc(x.s)}</td>
      <td class="num">${fmt(x.h, 3)}</td><td class="num nowrap"><b>${fmt(hj / x.h, 0)}</b> ${esc(x.u)}/j</td>
      <td><button class="btn sm primary" data-act="biblioAjout" data-i="${REF.cadences.indexOf(x)}">Ajouter</button></td></tr>`).join('')}
  </tbody></table></div>`;
}

function modalJournal(j) {
  const e = j || { date: aujourdHui(), meteo: 'Beau', effectif: '', heures: '', intemperie: false, verifs: [] };
  ouvrirModal(j ? '✏️ Entrée du journal' : '📒 Nouvelle entrée', `
    <input type="hidden" id="jId" value="${esc(j ? j.id : '')}">
    <div class="grid grid-2">${champ('jDate', 'Date', e.date, 'date')}${selectHTML('jMeteo', 'Météo', REF.meteo, e.meteo)}</div>
    <div class="grid grid-2">${champ('jEff', 'Effectif présent', e.effectif, 'number', 'min="0"')}${champ('jH', 'Heures travaillées (équipe)', e.heures, 'number', 'step="0.5" min="0"')}</div>
    <label class="check field"><input type="checkbox" id="jIntemp" ${e.intemperie ? 'checked' : ''} data-change="jIntemp"><span><b>Arrêt / perte pour intempérie</b></span></label>
    <div id="jIntempBloc" class="${e.intemperie ? '' : 'hidden'}">
      ${champ('jCause', 'Cause (pluie, vent, gel…)', e.cause)}
      <div class="warnbox"><b>Avant de se déclarer en intempéries, vérifier :</b>
        ${REF.intemperies.map((it, i) => `<label class="check" style="margin-top:6px"><input type="checkbox" class="jVerif" value="${i}" ${(e.verifs || []).includes(i) ? 'checked' : ''}><span class="small">${esc(it)}</span></label>`).join('')}
      </div>
    </div>
    <div class="field"><label class="f" for="jTexte">Travaux réalisés / événements / visites</label><textarea class="input" id="jTexte" rows="5">${esc(e.texte)}</textarea></div>`,
    `<button class="btn" data-act="fermerModal">Annuler</button><button class="btn primary" data-act="saveJournal">Enregistrer</button>`);
}

function modalReserve(r) {
  const e = r || { origine: 'OPR', statut: 'ouverte' };
  const zones = zonesDe(ui.chantierId);
  ouvrirModal(r ? '✏️ Réserve' : '➕ Nouvelle réserve', `
    <input type="hidden" id="rId" value="${esc(r ? r.id : '')}">
    ${champ('rZone', 'Zone / localisation', e.zone, 'text', 'list="dlZones"')}
    <datalist id="dlZones">${zones.map(z => `<option value="${esc(z)}">`).join('')}</datalist>
    <div class="field"><label class="f" for="rDesc">Description *</label><textarea class="input" id="rDesc" rows="3">${esc(e.description)}</textarea></div>
    <div class="grid grid-2">${selectHTML('rOrigine', 'Origine', ['OPR', 'Autocontrôle', 'Visite CDT', 'Client / MOE', 'Bureau de contrôle', 'GPA'], e.origine)}${champ('rResp', 'Responsable', e.responsable)}</div>
    ${champ('rEch', 'Échéance de levée', e.echeance, 'date')}`,
    `<button class="btn" data-act="fermerModal">Annuler</button><button class="btn primary" data-act="saveReserve">Enregistrer</button>`);
}

function modalGenTaches() {
  const c = ch();
  const zones = zonesDe(c.id);
  ouvrirModal('⚙️ Générer la liste zones × tâches', `
    <div class="help">Chaque tâche est créée pour chaque zone (les doublons existants sont ignorés). Exemples de zones :
      terrasses, façades, travées, supports, niveaux, logements.</div>
    <div class="grid grid-2">
      <div class="field"><label class="f" for="gZones">Zones (une par ligne)</label><textarea class="input" id="gZones" rows="9" placeholder="Terrasse 01&#10;Terrasse 02">${esc(zones.join('\n'))}</textarea>
        <div class="row small" style="margin-top:6px">Série : <input class="input" id="gPref" style="width:90px" placeholder="T"> de <input class="input" id="gDe" type="number" style="width:60px" value="1"> à <input class="input" id="gA" type="number" style="width:60px" value="10">
          <button class="btn sm" data-act="genSerie">+ Ajouter</button></div></div>
      <div class="field"><label class="f" for="gTaches">Tâches (une par ligne, « Lot | Tâche » possible)</label><textarea class="input" id="gTaches" rows="9" placeholder="Pare-vapeur | Vernis&#10;Hors d'eau | Isolant"></textarea>
        <button class="btn sm" style="margin-top:6px" data-act="genDepuisBTE" ${deCh(db.ops).length ? '' : 'disabled'}>↙ Reprendre les opérations du BTE</button></div>
    </div>`,
    `<button class="btn" data-act="fermerModal">Annuler</button><button class="btn primary" data-act="genValider">Générer</button>`, { large: true });
}

/* ================================ Actions ================================ */
const ACT = {
  goto: el => { ui.view = el.dataset.view; render(); scrollTo(0, 0); },
  fermerModal,
  identite: () => modalIdentite(false),
  saveIdentite: () => {
    const prenom = val('idPrenom'), nom = val('idNom');
    if (!prenom && !nom) return toast('Indiquez au moins un nom.');
    user = { prenom, nom: nom.toUpperCase(), role: val('idRole') };
    localStorage.setItem(USER_KEY, JSON.stringify(user));
    fermerModal(); render(); toast(`Bonjour ${prenom || nom} 👋`);
  },

  // Chantiers
  chantierNew: () => modalChantier(null),
  chantierEdit: el => modalChantier(db.chantiers.find(c => c.id === el.dataset.id)),
  chantierOuvrir: el => { ui.chantierId = el.dataset.id; ui.zone = null; ui.view = 'tableau'; render(); },
  chantierSuppr: el => {
    const c = db.chantiers.find(x => x.id === el.dataset.id);
    if (!c || !confirm(`Supprimer définitivement le chantier « ${c.nom} » et toutes ses données ?${c.equipeId ? '\n\n⚠️ Chantier partagé : il sera supprimé pour TOUTE l\'équipe.' : ''}`)) return;
    supprimerChantier(c.id); save(); render(); toast('Chantier supprimé');
  },
  saveChantier: () => {
    const nom = val('chNom');
    if (!nom) return toast('Le nom du chantier est obligatoire.');
    const id = val('chId');
    const data = {
      nom, client: val('chClient'), adresse: val('chAdresse'), metier: val('chMetier'), support: val('chSupport'),
      imputation: val('chImput'), agence: val('chAgence'), conducteur: val('chCdt'), chef: val('chChef'),
      marcheHT: num(val('chMarche')), margeCommerciale: num(val('chMarge')) / 100, tauxHoraire: num(val('chTaux')),
      heuresJour: num(val('chHj')) || REF.heuresJourDefaut, dateDebut: val('chDebut'), dateFin: val('chFin')
    };
    if (id) Object.assign(db.chantiers.find(c => c.id === id), data);
    else { const c = Object.assign({ id: uid(), creeLe: new Date().toISOString() }, data); db.chantiers.push(c); ui.chantierId = c.id; ui.view = 'bte'; }
    save(); fermerModal(); render(); toast('Chantier enregistré');
  },

  // Terrain
  terrainMode: el => { ui.terrainMode = el.dataset.mode; render(); },
  zoneNav: el => {
    const zs = zonesDe(ui.chantierId);
    const i = zs.indexOf(ui.zone) + Number(el.dataset.dir);
    if (i < 0 || i >= zs.length) return toast(i < 0 ? 'Première zone' : 'Dernière zone');
    ui.zone = zs[i]; ui.filtreTache = ''; render();
  },
  ouvrirZone: el => { ui.zone = el.dataset.zone; ui.terrainMode = 'liste'; render(); },
  zonePicker: () => {
    ouvrirModal('📍 Choisir une zone', `<input class="input" id="zpFiltre" placeholder="Rechercher…" data-input="zpFiltre"><div class="zone-list" id="zpListe" style="margin-top:10px"></div>`);
    renderZonePicker();
  },
  choisirZone: el => { ui.zone = el.dataset.zone; ui.filtreTache = ''; fermerModal(); render(); },
  cocherZone: el => {
    const v = el.dataset.v === '1';
    deCh(db.taches).filter(t => t.zone === ui.zone).forEach(t => marquer(t, v));
    save(); renderListeTaches();
  },
  toggleCell: el => { const t = db.taches.find(x => x.id === el.dataset.id); if (t) { marquer(t, !estFait(t.fait)); save(); render(); } },
  tacheSuppr: el => {
    const t = db.taches.find(x => x.id === el.dataset.id);
    if (t && confirm(`Supprimer la tâche « ${t.tache} » de ${t.zone} ?`)) { db.taches = db.taches.filter(x => x !== t); save(); render(); }
  },
  tacheAjout: () => ouvrirModal('➕ Travail non prévu', `
      <p class="small muted" style="margin-top:0">Zone : <b>${esc(ui.zone)}</b></p>
      ${champ('taIntitule', 'Intitulé *', '', 'text', 'placeholder="ex : Reprise relevé suite dégradation"')}
      ${champ('taLot', 'Lot / phase', '')}
      <label class="check"><input type="checkbox" id="taFait" checked><span>Déjà réalisé</span></label>`,
    `<button class="btn" data-act="fermerModal">Annuler</button><button class="btn primary" data-act="saveTacheAjout">Ajouter</button>`),
  saveTacheAjout: () => {
    const intitule = val('taIntitule');
    if (!intitule) return toast('Saisissez un intitulé.');
    const t = { id: uid(), chantierId: ui.chantierId, zone: ui.zone, lot: val('taLot'), tache: intitule, fait: false, faitLe: '', faitPar: '', obs: '', ajout: true };
    marquer(t, $('#taFait').checked);
    db.taches.push(t); save(); fermerModal(); render(); toast('Travail ajouté');
  },
  copierRecap: async () => {
    const auj = aujourdHui();
    const faites = deCh(db.taches).filter(t => estFait(t.fait) && t.faitLe === auj);
    if (!faites.length) return toast('Aucune tâche validée aujourd\'hui.');
    const parZone = {};
    faites.forEach(t => (parZone[t.zone] = parZone[t.zone] || []).push(t));
    let txt = `${ch().nom} — travaux du ${fmtDate(auj)}${nomUser() ? ' (' + nomUser() + ')' : ''}\n\n`;
    Object.entries(parZone).forEach(([z, ts]) => { txt += `📍 ${z}\n` + ts.map(t => `- ${t.tache}${t.obs ? ' (obs : ' + t.obs + ')' : ''}`).join('\n') + '\n\n'; });
    try { await navigator.clipboard.writeText(txt.trim()); toast('📋 Récap copié — collez-le dans WhatsApp / mail'); }
    catch (_e) { ouvrirModal('Récap du jour', `<textarea class="input" rows="12">${esc(txt.trim())}</textarea>`); }
  },
  genTaches: () => modalGenTaches(),
  genSerie: () => {
    const p = $('#gPref').value, de = num($('#gDe').value), a = num($('#gA').value);
    if (a < de || a - de > 500) return toast('Série invalide');
    const largeur = String(a).length;
    const lignes = [];
    for (let i = de; i <= a; i++) lignes.push(p + String(i).padStart(largeur, '0'));
    const ta = $('#gZones');
    ta.value = (ta.value.trim() ? ta.value.trim() + '\n' : '') + lignes.join('\n');
  },
  genDepuisBTE: () => {
    const lignes = [...new Set(deCh(db.ops).map(o => `${o.phase} | ${o.operation}`))];
    $('#gTaches').value = lignes.join('\n');
  },
  genValider: () => {
    const zones = [...new Set($('#gZones').value.split('\n').map(s => s.trim()).filter(Boolean))];
    const taches = $('#gTaches').value.split('\n').map(s => s.trim()).filter(Boolean).map(l => {
      const p = l.split('|'); return p.length > 1 ? { lot: p[0].trim(), tache: p.slice(1).join('|').trim() } : { lot: '', tache: l };
    });
    if (!zones.length || !taches.length) return toast('Renseignez au moins une zone et une tâche.');
    const exist = new Set(deCh(db.taches).map(t => t.zone + '||' + t.tache));
    let n = 0;
    zones.forEach(z => taches.forEach(t => {
      if (exist.has(z + '||' + t.tache)) return;
      db.taches.push({ id: uid(), chantierId: ui.chantierId, zone: z, lot: t.lot, tache: t.tache, fait: false, faitLe: '', faitPar: '', obs: '', ajout: false });
      n++;
    }));
    save(); fermerModal(); ui.view = 'terrain'; render(); toast(`${n} tâche(s) créée(s)`);
  },

  // Suivi
  semNav: el => { const d = Number(el.dataset.d); ui.semaine = d === 0 ? lundi(aujourdHui()) : addDays(ui.semaine, d); render(); },
  allerSemaine: el => { ui.semaine = el.dataset.s; render(); scrollTo(0, 0); },
  suiviQte: el => {
    const o = el.dataset.o, p = el.dataset.p;
    const ph = phasesBTE(db, ui.chantierId).find(x => x.ouvrage === o && x.phase === p);
    ouvrirModal('📐 Avancement depuis les quantités', `
      <p class="small muted" style="margin-top:0">${esc(o)} · <b>${esc(p)}</b></p>
      <div class="grid grid-2">${champ('qFait', `Quantité réalisée (cumul)`, '', 'number', 'step="any"')}${champ('qTotal', `Quantité totale (${esc(ph && ph.unite || '')})`, ph ? ph.metreMax : '', 'number', 'step="any"')}</div>
      <input type="hidden" id="qO" value="${esc(o)}"><input type="hidden" id="qP" value="${esc(p)}">`,
      `<button class="btn" data-act="fermerModal">Annuler</button><button class="btn primary" data-act="suiviQteOk">Appliquer</button>`);
  },
  suiviQteOk: () => {
    const f = num(val('qFait')), t = num(val('qTotal'));
    if (t <= 0) return toast('Quantité totale invalide');
    majSuivi(val('qO'), val('qP'), { pct: Math.min(1, f / t) });
    fermerModal(); render();
  },

  // BTE
  opNew: () => modalOp(null),
  opEdit: el => modalOp(db.ops.find(o => o.id === el.dataset.id)),
  opSuppr: el => {
    const op = db.ops.find(o => o.id === el.dataset.id);
    if (op && confirm(`Supprimer l'opération « ${op.operation} » ?`)) { db.ops = db.ops.filter(o => o !== op); save(); render(); }
  },
  saveOp: () => {
    const ouvrage = val('opOuvrage'), operation = val('opOperation');
    if (!ouvrage || !operation) return toast('Ouvrage et opération sont obligatoires.');
    const id = val('opId');
    const data = {
      ouvrage, phase: val('opPhase'), operation, designation: val('opDesignation'), metre: num(val('opMetre')), unite: val('opUnite'),
      cadence: num(val('opCadence')), heuresForfait: num(val('opForfait')), devis: num(val('opDevis'))
    };
    if (id) Object.assign(db.ops.find(o => o.id === id), data);
    else insererOp(Object.assign({ id: uid(), chantierId: ui.chantierId }, data));
    save(); fermerModal(); render();
  },
  biblio: () => modalBiblio(),
  biblioAjout: el => {
    const x = REF.cadences[Number(el.dataset.i)];
    const c = ch();
    const coef = num(val('biCoef')) || 1;
    const ouvrage = val('biOuvrage') || 'Ouvrage 1';
    const cadence = x.h > 0 ? hjDe(c) / (x.h * coef) : 0;
    insererOp({ id: uid(), chantierId: c.id, ouvrage, phase: x.phase, operation: x.op, designation: x.lib, metre: num(val('biMetre')), unite: x.u, cadence: Math.round(cadence * 100) / 100, heuresForfait: 0, devis: 0 });
    save(); render(); toast(`« ${x.op} » ajouté à ${ouvrage}`);
  },

  // Journal
  journalNew: () => modalJournal(null),
  journalEdit: el => modalJournal(db.journal.find(j => j.id === el.dataset.id)),
  journalSuppr: el => { if (confirm('Supprimer cette entrée ?')) { db.journal = db.journal.filter(j => j.id !== el.dataset.id); save(); render(); } },
  saveJournal: () => {
    const id = val('jId');
    const data = {
      date: val('jDate') || aujourdHui(), meteo: val('jMeteo'), effectif: num(val('jEff')), heures: num(val('jH')),
      intemperie: $('#jIntemp').checked, cause: val('jCause'), verifs: $$('.jVerif').filter(x => x.checked).map(x => Number(x.value)), texte: val('jTexte')
    };
    if (id) Object.assign(db.journal.find(j => j.id === id), data);
    else db.journal.push(Object.assign({ id: uid(), chantierId: ui.chantierId, auteur: nomUser() }, data));
    save(); fermerModal(); render(); toast('Journal enregistré');
  },

  // Qualité
  qTab: el => { ui.qualiteTab = el.dataset.t; render(); },
  resFiltre: el => { ui.reserveFiltre = el.dataset.f; render(); },
  resNew: () => modalReserve(null),
  resEdit: el => modalReserve(db.reserves.find(r => r.id === el.dataset.id)),
  resSuppr: el => { if (confirm('Supprimer cette réserve ?')) { db.reserves = db.reserves.filter(r => r.id !== el.dataset.id); save(); render(); } },
  resLever: el => {
    const r = db.reserves.find(x => x.id === el.dataset.id);
    if (!r) return;
    if (r.statut === 'levée') { r.statut = 'ouverte'; r.leveeLe = ''; } else { r.statut = 'levée'; r.leveeLe = aujourdHui(); r.leveePar = nomUser(); }
    save(); render();
  },
  saveReserve: () => {
    const description = val('rDesc');
    if (!description) return toast('Décrivez la réserve.');
    const id = val('rId');
    const data = { zone: val('rZone'), description, origine: val('rOrigine'), responsable: val('rResp'), echeance: val('rEch') };
    if (id) Object.assign(db.reserves.find(r => r.id === id), data);
    else db.reserves.push(Object.assign({ id: uid(), chantierId: ui.chantierId, statut: 'ouverte', creeLe: aujourdHui(), creePar: nomUser(), leveeLe: '' }, data));
    save(); fermerModal(); render(); toast('Réserve enregistrée');
  },

  // Synchronisation
  syncConnexion: () => modalConnexion(),
  syncEnvoyer: async el => {
    const email = val('cxEmail');
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return toast('Adresse e-mail invalide');
    el.disabled = true;
    try { await Synchro.demanderCode(email); $('#cxEtape2').classList.remove('hidden'); toast('📧 E-mail envoyé à ' + email); }
    catch (e) { toast('❌ ' + (e.message || e)); }
    el.disabled = false;
  },
  syncCode: async () => {
    const code = val('cxCode');
    if (!/^\d{6,10}$/.test(code)) return toast('Code invalide');
    try { await Synchro.verifierCode(code); fermerModal(); toast('✅ Connecté'); }
    catch (e) { toast('❌ ' + (e.message || e)); }
  },
  syncDeconnexion: async () => {
    if (!confirm('Se déconnecter ? Les chantiers partagés restent sur cet appareil mais ne seront plus synchronisés.')) return;
    await Synchro.deconnecter(); render();
  },
  syncMaintenant: () => { Synchro.planifier(0); toast('🔄 Synchronisation…'); },
  syncBouton: () => { ui.view = 'chantiers'; render(); const card = $('#syncCard'); if (card) card.scrollIntoView({ behavior: 'smooth' }); },
  equipeCreer: async () => {
    const nom = val('nouvelleEquipe');
    if (!nom) return toast('Donnez un nom à l\'équipe');
    try { await Synchro.creerEquipe(nom); render(); toast(`Équipe « ${nom} » créée`); }
    catch (e) { toast('❌ ' + (e.message || e)); }
  },
  equipeGerer: el => modalEquipe(el.dataset.id),
  equipeInviter: async el => {
    const email = val('invEmail').toLowerCase();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return toast('Adresse e-mail invalide');
    try { await Synchro.inviter(el.dataset.eq, email, val('invRole')); toast(`✉️ ${email} invité(e)`); modalEquipe(el.dataset.eq); }
    catch (e) { toast('❌ ' + (/duplicate/i.test(e.message || '') ? 'Déjà invité(e)' : (e.message || e))); }
  },
  invitationAnnuler: async el => {
    try { await Synchro.annulerInvitation(el.dataset.eq, el.dataset.email); modalEquipe(el.dataset.eq); }
    catch (e) { toast('❌ ' + (e.message || e)); }
  },
  membreRetirer: async el => {
    const moi = el.dataset.u === Synchro.session.user.id;
    if (!confirm(moi ? 'Quitter cette équipe ? Ses chantiers resteront sur cet appareil sans être synchronisés.' : 'Retirer ce membre de l\'équipe ?')) return;
    try {
      await Synchro.retirerMembre(el.dataset.eq, el.dataset.u);
      if (moi) {
        db.chantiers.filter(c => c.equipeId === el.dataset.eq).forEach(c => { delete c.equipeId; });
        Synchro.oublierEtat(el.dataset.eq); enregistrerLocal();
        await Synchro.chargerEquipes(); fermerModal(); render();
      } else modalEquipe(el.dataset.eq);
    } catch (e) { toast('❌ ' + (e.message || e)); }
  },
  partager: el => modalPartager(db.chantiers.find(c => c.id === el.dataset.id)),
  partagerValider: () => {
    const c = db.chantiers.find(x => x.id === val('pgChantier'));
    const eq = Synchro.equipes.find(e => e.nom === val('pgEquipe'));
    if (!c || !eq) return;
    c.equipeId = eq.id;
    save(); fermerModal(); render(); toast(`☁️ « ${c.nom} » partagé avec ${eq.nom}`);
  },

  // QR
  scanQR: () => lancerScan(),
  qrEtiquettes: () => etiquettesQR(),
  imprimer: () => print(),

  // Données
  importFichier: () => choisirFichier(),
  exportJSON: () => {
    telecharger(`omsmk_sauvegarde_${aujourdHui()}.json`, JSON.stringify(db, null, 1), 'application/json');
    toast('Sauvegarde téléchargée');
  },
  exportExcel: () => exporterExcel(),
  rapportPDF: () => rapportPDF(),
  demo: () => {
    const d = construireDemo(lundi(aujourdHui()));
    db.chantiers.push(d.chantier); db.ops.push(...d.ops); db.suivi.push(...d.suivi); db.taches.push(...d.taches);
    db.journal.push(...d.journal); db.reserves.push(...d.reserves); Object.assign(db.checklists, d.checklists);
    ui.chantierId = d.chantier.id; ui.view = 'tableau'; ui.zone = null; ui.semaine = lundi(aujourdHui());
    save(); render(); toast('Démo CIGV chargée');
  },
  toutEffacer: () => {
    if (!confirm('Effacer TOUTES les données de l\'application sur cet appareil ?\n(Les chantiers partagés restent en ligne et reviendront à la prochaine synchronisation.)')) return;
    if (!confirm('Dernière confirmation : cette action est irréversible. Pensez à exporter une sauvegarde.')) return;
    Synchro.oublierEtat();
    db = dbVide(); ui.chantierId = null; save(); render(); toast('Données effacées');
  }
};

const CHG = {
  toggleTache: el => {
    const t = db.taches.find(x => x.id === el.dataset.id);
    if (!t) return;
    marquer(t, el.checked); save(); renderListeTaches();
  },
  obsTache: el => { const t = db.taches.find(x => x.id === el.dataset.id); if (t) { t.obs = el.value.trim(); save(); } },
  suiviPct: el => {
    const v = el.value.trim();
    majSuivi(el.dataset.o, el.dataset.p, { pct: v === '' ? null : Math.max(0, Math.min(100, num(v))) / 100 });
    render();
  },
  suiviH: el => { majSuivi(el.dataset.o, el.dataset.p, { heures: Math.max(0, num(el.value)) }); render(); },
  semDate: el => { if (el.value) { ui.semaine = lundi(el.value); render(); } },
  opField: el => {
    const op = db.ops.find(o => o.id === el.dataset.id);
    if (!op) return;
    op[el.dataset.f] = num(el.value);
    save(); render();
  },
  chField: el => { const c = ch(); c[el.dataset.f] = num(el.value); save(); render(); },
  equipe: el => { ui.equipe = Math.max(1, num(el.value)); render(); },
  biblioFiltre: () => renderBiblio(),
  jIntemp: el => $('#jIntempBloc').classList.toggle('hidden', !el.checked),
  clToggle: el => {
    const cid = ui.chantierId, l = el.dataset.l, k = el.dataset.k;
    db.checklists[cid] = db.checklists[cid] || {};
    db.checklists[cid][l] = db.checklists[cid][l] || {};
    if (el.checked) db.checklists[cid][l][k] = { date: aujourdHui(), par: nomUser() };
    else delete db.checklists[cid][l][k];
    save(); render();
  }
};

const INP = {
  filtreTache: el => { ui.filtreTache = el.value; renderListeTaches(); },
  zpFiltre: () => renderZonePicker(),
  biblioFiltre: () => renderBiblio()
};

/* ============================ Helpers d'action =========================== */
function marquer(t, fait) {
  const deja = estFait(t.fait);
  t.fait = !!fait;
  if (fait && !deja) { t.faitLe = aujourdHui(); t.faitPar = nomUser(); }
  if (!fait) { t.faitLe = ''; t.faitPar = ''; }
}

function majSuivi(ouvrage, phase, champs) {
  const cid = ui.chantierId, sem = ui.semaine;
  let e = db.suivi.find(s => s.chantierId === cid && s.semaine === sem && s.ouvrage === ouvrage && s.phase === phase);
  // Identifiant déterministe : deux appareils saisissant la même phase la même semaine modifient la même saisie
  if (!e) { e = { id: `s|${cid}|${sem}|${empreinte(ouvrage + '|' + phase)}`, chantierId: cid, semaine: sem, ouvrage, phase, pct: null, heures: 0 }; db.suivi.push(e); }
  Object.assign(e, champs);
  if ((e.pct === null || e.pct === undefined) && !num(e.heures)) db.suivi = db.suivi.filter(s => s !== e);
  save();
}

function insererOp(op) {
  let idx = -1;
  db.ops.forEach((o, i) => { if (o.chantierId === op.chantierId && o.ouvrage === op.ouvrage && o.phase === op.phase) idx = i; });
  if (idx < 0) db.ops.forEach((o, i) => { if (o.chantierId === op.chantierId && o.ouvrage === op.ouvrage) idx = i; });
  if (idx < 0) db.ops.push(op); else db.ops.splice(idx + 1, 0, op);
}

function supprimerChantier(cid) {
  db.chantiers = db.chantiers.filter(c => c.id !== cid);
  ['ops', 'suivi', 'taches', 'journal', 'reserves'].forEach(k => { db[k] = db[k].filter(x => x.chantierId !== cid); });
  delete db.checklists[cid];
  if (ui.chantierId === cid) ui.chantierId = db.chantiers[0] ? db.chantiers[0].id : null;
}

function renderZonePicker() {
  const f = norm(val('zpFiltre'));
  const taches = deCh(db.taches);
  $('#zpListe').innerHTML = zonesDe(ui.chantierId).filter(z => !f || norm(z).includes(f)).map(z => {
    const ts = taches.filter(t => t.zone === z);
    const n = ts.filter(t => estFait(t.fait)).length;
    return `<button class="zone-item ${z === ui.zone ? 'active' : ''} ${n === ts.length ? 'complete' : ''}" data-act="choisirZone" data-zone="${esc(z)}">
      <span>${esc(z)}</span><span class="badge ${n === ts.length ? 'ok' : ''}">${n}/${ts.length}</span></button>`;
  }).join('') || '<div class="empty">Aucune zone</div>';
}

/* ============================ Import fichiers ============================ */
function choisirFichier() {
  const inp = document.createElement('input');
  inp.type = 'file';
  inp.accept = '.xlsx,.xlsm,.xls,.csv,.txt,.json';
  inp.onchange = () => { if (inp.files[0]) importerFichier(inp.files[0]); };
  inp.click();
}

async function importerFichier(file) {
  const nom = file.name.toLowerCase();
  try {
    if (nom.endsWith('.json')) {
      const d = JSON.parse(await file.text());
      if (!d || !Array.isArray(d.chantiers)) throw new Error('Fichier de sauvegarde invalide');
      if (!confirm(`Restaurer cette sauvegarde (${d.chantiers.length} chantier(s)) ?\nOK = remplacer les données actuelles.`)) return;
      Synchro.oublierEtat();
      db = Object.assign(dbVide(), d); ui.chantierId = null; save(); fermerModal(); render(); toast('Sauvegarde restaurée');
      return;
    }
    if (nom.endsWith('.csv') || nom.endsWith('.txt')) {
      importerTerrain(parseCSV(await file.text()));
      return;
    }
    if (typeof XLSX === 'undefined') throw new Error('Bibliothèque Excel non chargée (connectez-vous une première fois à Internet).');
    const wb = XLSX.read(await file.arrayBuffer(), { type: 'array' });
    if (wb.SheetNames.some(n => /main d.?(oe|œ)uvre/i.test(n))) importerBTE(wb, file.name);
    else importerTerrain(XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, raw: false, defval: '' }));
  } catch (e) {
    console.error(e);
    toast('❌ Import impossible : ' + (e.message || e));
  }
}

function importerTerrain(rows) {
  if (!rows.length) throw new Error('Fichier vide');
  const h = rows[0].map(norm);
  const col = (...noms) => h.findIndex(x => noms.includes(x));
  const iC = col('chantier'), iZ = col('zone', 'support', 'repere', 'localisation', 'emplacement'), iL = col('lot', 'phase'),
    iT = col('tache', 'taches', 'travaux', 'operation'), iF = col('fait', 'realise', 'etat'), iO = col('observation', 'observations', 'obs', 'commentaire');
  if (iT < 0 || iZ < 0) throw new Error('Colonnes « Zone » (ou « Support ») et « Tache » obligatoires');
  if (iC < 0 && !ch()) throw new Error('Pas de colonne « Chantier » : créez ou ouvrez d\'abord un chantier');
  const exist = new Set(db.taches.map(t => t.chantierId + '||' + t.zone + '||' + t.tache));
  let n = 0, nc = 0, cible = null;
  rows.slice(1).forEach(r => {
    const tache = String(r[iT] ?? '').trim(), zone = String(r[iZ] ?? '').trim();
    if (!tache || !zone) return;
    let c = ch();
    if (iC >= 0 && String(r[iC] ?? '').trim()) {
      const nomC = String(r[iC]).trim();
      c = db.chantiers.find(x => norm(x.nom) === norm(nomC));
      if (!c) {
        c = { id: uid(), nom: nomC, metier: 'Étanchéité', support: 'Béton', tauxHoraire: REF.tauxHoraireDefaut, heuresJour: REF.heuresJourDefaut, creeLe: new Date().toISOString() };
        db.chantiers.push(c); nc++;
      }
    }
    cible = cible || c;
    if (exist.has(c.id + '||' + zone + '||' + tache)) return;
    exist.add(c.id + '||' + zone + '||' + tache);
    const fait = iF >= 0 && estFait(r[iF]);
    db.taches.push({ id: uid(), chantierId: c.id, zone, lot: iL >= 0 ? String(r[iL] ?? '').trim() : '', tache, fait, faitLe: fait ? aujourdHui() : '', faitPar: '', obs: iO >= 0 ? String(r[iO] ?? '').trim() : '', ajout: false });
    n++;
  });
  if (cible) ui.chantierId = cible.id;
  ui.view = 'terrain'; ui.zone = null;
  save(); fermerModal(); render();
  toast(`${n} tâche(s) importée(s)${nc ? `, ${nc} chantier(s) créé(s)` : ''}`);
}

// Import du BTE standard SMAC (onglets Synthèse, 1a Main d'œuvre, Étape 2 - Objectifs et suivi)
function importerBTE(wb, nomFichier) {
  const sn = wb.SheetNames;
  const lignes = n => XLSX.utils.sheet_to_json(wb.Sheets[n], { header: 1, raw: true, defval: null, blankrows: true });
  const shMO = sn.find(n => /main d.?(oe|œ)uvre/i.test(n));
  const shSy = sn.find(n => /synth/i.test(n));
  const shSu = sn.find(n => /suivi/i.test(n));

  // 1. Synthèse : informations chantier
  const info = {};
  if (shSy) {
    const R = lignes(shSy);
    const pick = re => {
      for (const row of R) for (let i = 0; i < row.length; i++) {
        if (typeof row[i] === 'string' && re.test(row[i])) {
          for (let j = i + 1; j < row.length; j++) if (row[j] !== null && row[j] !== '') return row[j];
          return null;
        }
      }
      return null;
    };
    info.nom = pick(/^\s*chantier\s*:/i); info.conducteur = pick(/conducteur/i); info.imputation = pick(/imputation/i);
    info.agence = pick(/^\s*agence/i); info.marcheHT = pick(/march.*sign/i); info.marge = pick(/marge commerciale/i); info.taux = pick(/taux horaire/i);
  }

  // 2. Main d'œuvre : opérations
  const R = lignes(shMO);
  let hj = REF.heuresJourDefaut, cols = null, bloc = '';
  R.forEach((row, r) => row.forEach((v, i) => {
    if (typeof v === 'string' && /heures par journ/i.test(v)) {
      const sous = R[r + 1] && R[r + 1][i];
      if (num(sous) > 0) hj = num(sous);
      else { const n = row.slice(i + 1).find(x => num(x) > 0 && num(x) < 24); if (n) hj = num(n); }
    }
  }));
  const ops = [];
  R.forEach(row => {
    const estEntete = row.some(v => typeof v === 'string' && /phase chantier/i.test(v));
    if (estEntete) {
      const f = re => row.findIndex(v => typeof v === 'string' && re.test(v));
      cols = { cx: f(/^\s*complexe/i), ph: f(/phase chantier/i), op: f(/op[ée]rations/i), me: f(/m[ée]tr[ée]/i), ca: f(/cadence/i), h: f(/nbr d.?heures/i), dv: f(/devis/i) };
      return;
    }
    if (typeof row[0] === 'string' && /^\s*\d+\.\s*$/.test(row[0]) && row[1]) { bloc = String(row[1]).trim(); return; }
    if (!cols || cols.op < 0) return;
    const opNom = row[cols.op];
    if (typeof opNom !== 'string' || !opNom.trim() || /total/i.test(opNom)) return;
    const metre = num(row[cols.me]), cad = num(row[cols.ca]), h = num(row[cols.h]);
    if (metre <= 0 && h <= 0) return;
    let ouvrage = cols.cx >= 0 && row[cols.cx] ? String(row[cols.cx]).trim() : '';
    if (!ouvrage || ouvrage === '0') ouvrage = bloc && bloc !== '0' ? bloc : 'Ouvrage 1';
    let phase = cols.ph >= 0 && row[cols.ph] ? String(row[cols.ph]).trim() : '';
    if (!phase || phase === '0') phase = phaseDeOperation(opNom) || 'Non classé';
    const calcule = metre > 0 && cad > 0;
    ops.push({
      ouvrage, phase, operation: opNom.trim(), designation: '', metre, unite: calcule ? uniteDe(opNom) : (metre > 0 ? uniteDe(opNom) : 'h'),
      cadence: calcule ? cad : 0, heuresForfait: calcule ? 0 : h, devis: cols.dv >= 0 ? num(row[cols.dv]) : 0
    });
  });
  if (!ops.length) throw new Error('aucune opération renseignée dans l\'onglet « 1a Main d\'œuvre » (modèle de BTE vierge ?)');

  // 3. Suivi hebdomadaire (Étape 2)
  const suivi = [];
  if (shSu) {
    const S = lignes(shSu);
    let semCols = [];
    S.forEach(row => {
      const sc = [];
      row.forEach((v, i) => { const m = typeof v === 'string' && v.match(/^\s*semaine\s*(\d+)/i); if (m) sc.push({ k: Number(m[1]), col: i }); });
      if (sc.length) { semCols = sc; return; }
      const ouv = row[1], ph = row[2];
      if (!semCols.length || typeof ph !== 'string' || !ph.trim() || /phase chantier/i.test(ph)) return;
      semCols.forEach(({ k, col }) => {
        const p = row[col], hh = num(row[col + 1]);
        const aPct = p !== null && p !== '' && num(p) > 0;
        if (aPct || hh > 0) suivi.push({ k, ouvrage: String(ouv || bloc).trim(), phase: ph.trim(), pct: aPct ? num(p) : null, heures: hh });
      });
    });
  }

  const nomC = String(info.nom || nomFichier.replace(/\.[^.]+$/, '')).trim();
  let c = db.chantiers.find(x => norm(x.nom) === norm(nomC));
  if (c) {
    if (!confirm(`Le chantier « ${c.nom} » existe déjà.\nOK = remplacer son BTE${suivi.length ? ' et son suivi hebdo' : ''} par ceux du fichier.`)) return;
    db.ops = db.ops.filter(o => o.chantierId !== c.id);
    if (suivi.length) db.suivi = db.suivi.filter(s => s.chantierId !== c.id);
  } else {
    const facade = ops.some(o => /ossature|bardage|peau|cassette|clin/i.test(o.operation + o.phase));
    c = { id: uid(), nom: nomC, metier: facade ? 'Façade' : 'Étanchéité', support: 'Béton', creeLe: new Date().toISOString() };
    db.chantiers.push(c);
  }
  Object.assign(c, {
    conducteur: info.conducteur ? String(info.conducteur) : c.conducteur, imputation: info.imputation ? String(info.imputation) : c.imputation,
    agence: info.agence ? String(info.agence) : c.agence, marcheHT: num(info.marcheHT) || c.marcheHT,
    margeCommerciale: num(info.marge) || c.margeCommerciale, tauxHoraire: num(info.taux) || c.tauxHoraire || REF.tauxHoraireDefaut, heuresJour: hj
  });
  ops.forEach(o => db.ops.push(Object.assign({ id: uid(), chantierId: c.id }, o)));
  if (suivi.length) {
    const kMax = Math.max(...suivi.map(s => s.k));
    if (!c.dateDebut) c.dateDebut = addDays(lundi(aujourdHui()), -7 * (kMax - 1));
    const base = lundi(c.dateDebut);
    suivi.forEach(s => db.suivi.push({ id: uid(), chantierId: c.id, semaine: addDays(base, 7 * (s.k - 1)), ouvrage: s.ouvrage, phase: s.phase, pct: s.pct, heures: s.heures }));
  }
  ui.chantierId = c.id; ui.view = 'bte';
  save(); fermerModal(); render();
  toast(`BTE importé : ${ops.length} opération(s)${suivi.length ? `, ${suivi.length} saisie(s) de suivi` : ''}`);
}

function phaseDeOperation(op) {
  const n = norm(op);
  for (const m of Object.values(REF.metiers)) for (const [ph, ops] of Object.entries(m)) if (ops.some(o => norm(o) === n || n.includes(norm(o)))) return ph;
  if (/hors d.?eau/.test(n)) return "Hors d'eau";
  if (/2.{0,4}couche|releve/.test(n)) return '2nd couche et relevés';
  return '';
}
function uniteDe(op) {
  const n = norm(op);
  if (/^(ep|crosses?|lanterneaux?)$/.test(n) || /lanterneau|crosse/.test(n)) return 'U';
  if (/releve|equerre|solin|couvertine|garde|joint|acrotere|encadrement|bavette|angle|costiere|rive/.test(n)) return 'mL';
  return 'm²';
}

/* ================================ Exports ================================ */
function exporterExcel() {
  const c = ch();
  if (!c) return;
  if (typeof XLSX === 'undefined') return toast('Bibliothèque Excel non chargée (réseau requis au premier lancement).');
  const wb = XLSX.utils.book_new();
  const add = (nom, rows) => XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), nom);
  add('BTE', [['Ouvrage', 'Phase', 'Opération', 'Désignation', 'Métré', 'Unité', 'Cadence (u/j/homme)', 'Heures', 'Budget €', 'Devis €'],
    ...deCh(db.ops).map(o => { const h = heuresOp(o, c); return [o.ouvrage, o.phase, o.operation, o.designation, num(o.metre), o.unite, num(o.cadence), +h.toFixed(2), +(h * num(c.tauxHoraire)).toFixed(2), num(o.devis)]; })]);
  const s = calcSuivi(db, c.id);
  add('Avancement', [['Ouvrage', 'Phase', 'Objectif h', '% réalisé', 'H. pointées', 'Écart h à date', 'Impact € à date', 'Écart h projeté', 'Impact € projeté'],
    ...s.rows.map(r => [r.ouvrage, r.phase, +r.budget.toFixed(2), +r.pct.toFixed(3), r.heures, +r.ecartH.toFixed(2), +r.impact.toFixed(2), +r.ecartProj.toFixed(2), +r.impactProj.toFixed(2)]),
    ['TOTAL', '', +s.tot.budget.toFixed(2), +s.tot.pct.toFixed(3), s.tot.heures, +s.tot.ecartH.toFixed(2), +s.tot.impact.toFixed(2), +s.tot.ecartProj.toFixed(2), +s.tot.impactProj.toFixed(2)]]);
  add('Suivi hebdo', [['Semaine (lundi)', 'N° semaine', 'Ouvrage', 'Phase', '% cumulé', 'Heures pointées'],
    ...deCh(db.suivi).sort((a, b) => a.semaine.localeCompare(b.semaine)).map(e => [e.semaine, semISO(e.semaine), e.ouvrage, e.phase, e.pct ?? '', num(e.heures)])]);
  add('Terrain', [['Chantier', 'Zone', 'Lot', 'Tache', 'Fait', 'Fait le', 'Par', 'Observation', 'Non prévu'],
    ...deCh(db.taches).map(t => [c.nom, t.zone, t.lot, t.tache, estFait(t.fait) ? 'VRAI' : 'FAUX', t.faitLe, t.faitPar, t.obs, t.ajout ? 'oui' : ''])]);
  add('Journal', [['Date', 'Météo', 'Effectif', 'Heures', 'Intempérie', 'Cause', 'Texte', 'Auteur'],
    ...deCh(db.journal).sort((a, b) => a.date.localeCompare(b.date)).map(j => [j.date, j.meteo, num(j.effectif), num(j.heures), j.intemperie ? 'oui' : '', j.cause, j.texte, j.auteur])]);
  add('Réserves', [['Zone', 'Description', 'Origine', 'Responsable', 'Échéance', 'Statut', 'Créée le', 'Levée le'],
    ...deCh(db.reserves).map(r => [r.zone, r.description, r.origine, r.responsable, r.echeance, r.statut, r.creeLe, r.leveeLe])]);
  XLSX.writeFile(wb, `OmSmK_${c.nom.replace(/[^\w-]+/g, '_')}_${aujourdHui()}.xlsx`);
}

// jsPDF (polices standard) : remplacer les espaces insécables et caractères hors Latin-1
// deno-lint-ignore no-control-regex
const pdfTxt = s => String(s ?? '').replace(/[\u202f\u00a0]/g, ' ').replace(/[’‘]/g, "'").replace(/[“”]/g, '"').replace(/[–—]/g, '-').replace(/œ/g, 'oe').replace(/Œ/g, 'OE').replace(/[^\x00-\xFF€]/g, '');

async function rapportPDF() {
  const c = ch();
  if (!c) return;
  if (!globalThis.jspdf) return toast('Bibliothèque PDF non chargée (réseau requis au premier lancement).');
  const { jsPDF } = globalThis.jspdf;
  const doc = new jsPDF();
  const s = calcSuivi(db, c.id);
  const t = statsTerrain(db, c.id);
  const P = [30, 58, 95];
  const T = (rows) => rows.map(r => r.map(pdfTxt));

  doc.setFillColor(...P); doc.rect(0, 0, 210, 26, 'F');
  doc.setTextColor(255, 255, 255); doc.setFontSize(15);
  doc.text(pdfTxt('RAPPORT D\'AVANCEMENT CHANTIER'), 14, 12);
  doc.setFontSize(11); doc.text(pdfTxt(c.nom), 14, 20);
  doc.setTextColor(40, 40, 40); doc.setFontSize(9.5);
  const infos = [`Client : ${c.client || '-'}`, `Conducteur : ${c.conducteur || '-'}   Chef de chantier : ${c.chef || '-'}`,
    `Édité le ${new Date().toLocaleDateString('fr-FR')} par ${nomUser() || '-'}`];
  infos.forEach((l, i) => doc.text(pdfTxt(l), 14, 33 + i * 5));

  const opt = (startY, head, body, extra = {}) => doc.autoTable(Object.assign({
    startY, head: [head.map(pdfTxt)], body: T(body), theme: 'grid',
    headStyles: { fillColor: P, textColor: 255, fontSize: 8.5 }, styles: { fontSize: 8.5, cellPadding: 2 }, margin: { left: 14, right: 14 }
  }, extra));
  const y = () => doc.lastAutoTable.finalY + 8;
  const titre = (txt, yy) => { if (yy > 270) { doc.addPage(); yy = 20; } doc.setFontSize(11); doc.setTextColor(...P); doc.text(pdfTxt(txt), 14, yy); doc.setTextColor(40, 40, 40); return yy + 3; };

  opt(50, ['Indicateur', 'Valeur'], [
    ['Avancement pondéré', pc(s.tot.pct)], ['Heures budgétées', fmt(s.tot.budget) + ' h'], ['Heures pointées', fmt(s.tot.heures) + ' h'],
    ['Écart heures à date', `${signe(s.tot.ecartH)} h (${signeE(s.tot.impact)})`], ['Écart projeté fin de chantier', `${signe(s.tot.ecartProj)} h (${signeE(s.tot.impactProj)})`],
    ['Avancement terrain', `${t.faites} / ${t.total} (${pc(t.pct)})`], ['Réserves ouvertes', String(deCh(db.reserves).filter(r => r.statut !== 'levée').length)],
    ['Jours d\'intempéries', String(deCh(db.journal).filter(j => j.intemperie).length)]
  ], { columnStyles: { 0: { cellWidth: 70, fontStyle: 'bold' } } });

  if (s.rows.length) {
    opt(titre('Avancement par phase (BTE)', y()), ['Ouvrage', 'Phase', 'Objectif h', '% réalisé', 'H. pointées', 'Écart h', 'Impact €', 'Projeté €'],
      [...s.rows.map(r => [r.ouvrage, r.phase, fmt(r.budget), pc(r.pct), fmt(r.heures), signe(r.ecartH), signeE(r.impact), signeE(r.impactProj)]),
        ['TOTAL', '', fmt(s.tot.budget), pc(s.tot.pct), fmt(s.tot.heures), signe(s.tot.ecartH), signeE(s.tot.impact), signeE(s.tot.impactProj)]]);
  }
  const zones = zonesDe(c.id);
  if (zones.length) {
    opt(titre('Avancement terrain par zone', y()), ['Zone', 'Faites', 'Total', '%', 'Reste à faire'], zones.map(z => {
      const ts = deCh(db.taches).filter(x => x.zone === z);
      const f = ts.filter(x => estFait(x.fait));
      const reste = ts.filter(x => !estFait(x.fait)).map(x => x.tache);
      return [z, String(f.length), String(ts.length), pc(ts.length ? f.length / ts.length : 0), reste.slice(0, 4).join(', ') + (reste.length > 4 ? '…' : '')];
    }));
  }
  const ouvertes = deCh(db.reserves).filter(r => r.statut !== 'levée');
  if (ouvertes.length) {
    opt(titre('Réserves ouvertes', y()), ['Zone', 'Description', 'Origine', 'Responsable', 'Échéance'],
      ouvertes.map(r => [r.zone, r.description, r.origine, r.responsable, fmtDate(r.echeance)]));
  }
  const js = deCh(db.journal).sort((a, b) => b.date.localeCompare(a.date)).slice(0, 10);
  if (js.length) {
    opt(titre('Journal (10 dernières entrées)', y()), ['Date', 'Météo', 'Eff.', 'Intemp.', 'Observations'],
      js.map(j => [fmtDate(j.date), j.meteo, String(num(j.effectif) || ''), j.intemperie ? 'Oui' : '', (j.cause ? j.cause + ' - ' : '') + (j.texte || '')]),
      { columnStyles: { 4: { cellWidth: 100 } } });
  }
  const n = doc.getNumberOfPages();
  for (let i = 1; i <= n; i++) { doc.setPage(i); doc.setFontSize(8); doc.setTextColor(140); doc.text(pdfTxt(`OmSmK - ${c.nom} - page ${i}/${n}`), 14, 290); }

  const nom = `Rapport_${c.nom.replace(/[^\w-]+/g, '_')}_${aujourdHui()}.pdf`;
  const blob = doc.output('blob');
  try {
    const file = new File([blob], nom, { type: 'application/pdf' });
    if (navigator.canShare && navigator.canShare({ files: [file] }) && /Android|iPhone|iPad/i.test(navigator.userAgent)) {
      await navigator.share({ files: [file], title: 'Rapport chantier', text: `Rapport d'avancement – ${c.nom}` });
      return;
    }
  } catch (e) { if (e.name === 'AbortError') return; }
  doc.save(nom);
}

/* ================================ QR codes =============================== */
let qrStream = null, qrTimer = null;
function urlZone(c, z) {
  return `${location.origin}${location.pathname}?c=${encodeURIComponent(c.nom)}&z=${encodeURIComponent(z)}`;
}

async function lancerScan() {
  ouvrirModal('📷 Scanner un QR code', `<video id="qrVideo" autoplay playsinline muted></video><p id="qrStatut" class="small muted" style="text-align:center">Accès à la caméra…</p>`,
    `<button class="btn" data-act="fermerModal">Fermer</button>`);
  if (!('BarcodeDetector' in window)) {
    $('#qrStatut').innerHTML = 'Le scan intégré n\'est pas supporté par ce navigateur.<br>Scannez l\'étiquette avec l\'appareil photo du téléphone : le lien ouvre directement la bonne zone.';
    return;
  }
  try {
    qrStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
    const v = $('#qrVideo'); if (!v) return arreterScan();
    v.srcObject = qrStream; await v.play();
    $('#qrStatut').textContent = 'Visez le QR code de la zone…';
    const det = new BarcodeDetector({ formats: ['qr_code'] });
    qrTimer = setInterval(async () => {
      try {
        const v2 = $('#qrVideo'); if (!v2) return arreterScan();
        const codes = await det.detect(v2);
        if (codes.length) { const txt = codes[0].rawValue; fermerModal(); traiterCible(txt); }
      } catch (_e) { /* image pas prête */ }
    }, 350);
  } catch (e) { $('#qrStatut').textContent = '❌ Caméra inaccessible : ' + (e.message || e); }
}
function arreterScan() {
  clearInterval(qrTimer); qrTimer = null;
  if (qrStream) { qrStream.getTracks().forEach(t => t.stop()); qrStream = null; }
}

// Formats acceptés : URL ?c=…&z=… (ou chantier / zone / support), « Chantier|Zone », ou zone seule
function traiterCible(texte) {
  let cNom = '', zNom = String(texte || '').trim();
  try {
    if (/^https?:/i.test(zNom) || zNom.includes('?')) {
      const u = new URL(zNom, location.href);
      cNom = u.searchParams.get('c') || u.searchParams.get('chantier') || '';
      zNom = u.searchParams.get('z') || u.searchParams.get('zone') || u.searchParams.get('support') || '';
    } else if (zNom.includes('|')) { [cNom, zNom] = zNom.split('|').map(s => s.trim()); }
  } catch (_e) { /* texte brut */ }
  if (cNom) {
    const c = db.chantiers.find(x => x.id === cNom || norm(x.nom) === norm(cNom));
    if (!c) return toast(`Chantier « ${cNom} » introuvable sur cet appareil`);
    ui.chantierId = c.id;
  }
  if (zNom) {
    const z = zonesDe(ui.chantierId).find(x => norm(x) === norm(zNom));
    if (!z) { render(); return toast(`Zone « ${zNom} » introuvable`); }
    ui.zone = z; ui.view = 'terrain'; ui.terrainMode = 'liste'; ui.filtreTache = '';
    toast(`📍 ${z}`);
  }
  render();
}

function etiquettesQR() {
  const c = ch();
  const zones = zonesDe(c.id);
  if (!zones.length) return toast('Aucune zone : générez d\'abord la liste terrain.');
  if (typeof QRCode === 'undefined') return toast('Bibliothèque QR non chargée (réseau requis au premier lancement).');
  const html = `<div class="qr-sheet">${zones.map((z, i) => `<div class="qr-label"><div class="z">${esc(z)}</div><div class="qr-box" id="qrb_%P_${i}"></div><div class="c">${esc(c.nom)}</div></div>`).join('')}</div>`;
  $('#printArea').innerHTML = html.replace(/%P/g, 'p');
  ouvrirModal(`🏷️ Étiquettes QR (${zones.length})`, `<p class="small muted" style="margin-top:0">Collez une étiquette par zone : le scan ouvre directement la saisie de la zone.</p>${html.replace(/%P/g, 'm')}`,
    `<button class="btn" data-act="fermerModal">Fermer</button><button class="btn primary" data-act="imprimer">🖨️ Imprimer</button>`, { large: true });
  zones.forEach((z, i) => ['p', 'm'].forEach(k => {
    const el = document.getElementById(`qrb_${k}_${i}`);
    if (el) new QRCode(el, { text: urlZone(c, z), width: 240, height: 240, correctLevel: QRCode.CorrectLevel.M });
  }));
}

/* ============================== Démarrage =============================== */
document.addEventListener('click', e => {
  if (e.target.classList.contains('modal-back') && !modalVerrou) return fermerModal();
  const el = e.target.closest('[data-act]');
  if (el && ACT[el.dataset.act]) { e.preventDefault(); ACT[el.dataset.act](el, e); }
});
document.addEventListener('change', e => {
  const el = e.target.closest('[data-change]');
  if (el && CHG[el.dataset.change]) CHG[el.dataset.change](el, e);
});
document.addEventListener('input', e => {
  const el = e.target.closest('[data-input]');
  if (el && INP[el.dataset.input]) INP[el.dataset.input](el, e);
});
document.addEventListener('keydown', e => { if (e.key === 'Escape' && !modalVerrou && $('#modalRoot').innerHTML) fermerModal(); });

$('#tabs').addEventListener('click', e => {
  const b = e.target.closest('.tab');
  if (b) { ui.view = b.dataset.view; render(); scrollTo(0, 0); }
});
$('#chantierSelect').addEventListener('change', e => { ui.chantierId = e.target.value; ui.zone = null; render(); });
$('#userChip').addEventListener('click', () => modalIdentite(false));
$('#syncBtn').addEventListener('click', () => (Synchro.connecte() ? ACT.syncBouton() : modalConnexion()));
addEventListener('online', () => { renderHeader(); toast('🌐 Connexion rétablie'); });
addEventListener('offline', () => { renderHeader(); toast('📴 Hors-ligne : vos saisies restent enregistrées sur l\'appareil'); });

if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  navigator.serviceWorker.register('sw.js').catch(() => { /* pas bloquant */ });
}

(function demarrer() {
  render();
  const p = new URLSearchParams(location.search);
  const cible = p.get('c') || p.get('chantier'), zone = p.get('z') || p.get('zone') || p.get('support');
  if (cible || zone) {
    traiterCible(`${location.origin}${location.pathname}?${p.toString()}`);
    history.replaceState({}, document.title, location.pathname);
  }
  if (!user) modalIdentite(true);
})();

/* --------------------------- Branchement synchro ------------------------- */
let renduEnAttente = false;
// Après réception de données : rafraîchir sans perturber une saisie en cours
function rafraichirApresSynchro() {
  const a = document.activeElement;
  if (a && a.matches && a.matches('#view input, #view textarea, #view select')) { renduEnAttente = true; return; }
  render();
}
document.addEventListener('focusout', () => setTimeout(() => {
  if (renduEnAttente && !(document.activeElement && document.activeElement.matches('#view input, #view textarea, #view select'))) { renduEnAttente = false; render(); }
}, 50));

Synchro.base = () => db;
Synchro.enregistrerBase = () => enregistrerLocal();
Synchro.onChange = n => { rafraichirApresSynchro(); toast(`☁️ ${n} mise(s) à jour reçue(s)`); };
Synchro.onStatut = () => { renderHeader(); if (ui.view === 'chantiers' && !$('#modalRoot').innerHTML) rafraichirApresSynchro(); };
document.addEventListener('DOMContentLoaded', () => { Synchro.init().then(() => renderHeader()).catch(e => console.error(e)); });
