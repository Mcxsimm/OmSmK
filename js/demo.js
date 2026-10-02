/* ==========================================================================
   Jeu de données de démonstration — cas pratique CIGV (formation
   Excellence Opérationnelle SMAC) : étanchéité bicouche sous gravillons,
   toiture terrasse béton du bâtiment A, R+7. 410 m² / 96 mL.
   ========================================================================== */

// deno-lint-ignore no-unused-vars
function construireDemo(lundiCourant) {
  const id = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  const addDays = (s, n) => { const d = new Date(s + 'T00:00:00'); d.setDate(d.getDate() + n); return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10); };
  const s1 = addDays(lundiCourant, -7);
  const s2 = lundiCourant;
  const cid = id();

  const chantier = {
    id: cid, nom: 'CIGV – Phase 1', client: 'CIGV', adresse: '', metier: 'Étanchéité', support: 'Béton',
    imputation: '12345678', agence: 'Excellence', conducteur: 'Marc', chef: '',
    marcheHT: 22650, margeCommerciale: 0.2, tauxHoraire: 30, heuresJour: 7.5,
    dateDebut: s1, dateFin: addDays(s1, 34), creeLe: new Date().toISOString()
  };

  // [ouvrage, phase, opération, désignation, métré, unité, cadence (u/j/homme), heures forfait, devis €]
  const lignes = [
    ['Toiture A', 'Installation / Appro', 'Approvisionnement', '', 0, 'h', 0, 16, 0],
    ['Toiture A', 'Pare-vapeur', 'Vernis', 'Vernis (EIF - ANTAC)', 410, 'm²', 490, 0, 184.5],
    ['Toiture A', 'Pare-vapeur', 'Pare-vapeur', 'Hyrène 25/25 TS', 410, 'm²', 210, 0, 492],
    ['Toiture A', 'Pare-vapeur', 'Equerre PV', 'Hyrène PY 35', 96, 'mL', 123, 0, 97.92],
    ['Toiture A', "Hors d'eau", 'Isolant', 'PU posé libre', 410, 'm²', 294, 0, 639.6],
    ['Toiture A', "Hors d'eau", '1ère couche (+ écran)', 'Protection lourde - Hyrène TS', 410, 'm²', 196, 0, 774.9],
    ['Toiture A', "Hors d'eau", 'Equerre de renfort', 'Hyrène PY 35', 96, 'mL', 123, 0, 97.92],
    ['Toiture A', "Hors d'eau", 'EP', 'Évacuations EP', 3, 'U', 14, 0, 45],
    ['Toiture A', "Hors d'eau", 'Crosses', 'Crosses', 3, 'U', 14, 0, 45],
    ['Toiture A', '2nd couche et relevés', '2nd couche', 'Hyrène 25/25 TS', 410, 'm²', 210, 0, 492],
    ['Toiture A', '2nd couche et relevés', 'Relevés non isolés', 'ARMA ALU', 96, 'mL', 92, 0, 299.52],
    ['Toiture A', 'Finitions', 'Solins', 'Solin ALU', 96, 'mL', 53, 0, 446.4],
    ['Toiture A', 'Finitions', 'Couvertines', 'Couvertine acier galva', 96, 'mL', 37, 0, 596.16]
  ];
  const ops = lignes.map(l => ({
    id: id(), chantierId: cid, ouvrage: l[0], phase: l[1], operation: l[2], designation: l[3],
    metre: l[4], unite: l[5], cadence: l[6], heuresForfait: l[7], devis: l[8]
  }));

  // Suivi hebdo issu du cas pratique (semaine 1 et 2)
  const suivi = [
    [s1, 'Installation / Appro', 1, 7.5],
    [s1, 'Pare-vapeur', 0.75, 15],
    [s1, "Hors d'eau", 0.4, 22.5],
    [s2, 'Pare-vapeur', 1, 10],
    [s2, "Hors d'eau", 1, 22.5],
    [s2, '2nd couche et relevés', 0.4, 7.5]
  ].map(s => ({ id: id(), chantierId: cid, semaine: s[0], ouvrage: 'Toiture A', phase: s[1], pct: s[2], heures: s[3] }));

  // Terrain : terrasses x opérations (repérage du métré)
  const zones = ['Terrasse 01', 'Terrasse 02', 'Terrasse 03', 'Terrasse 04'];
  const taches = [];
  const ordre = [
    ['Pare-vapeur', 'Vernis'], ['Pare-vapeur', 'Pare-vapeur + équerres PV'],
    ["Hors d'eau", 'Isolant'], ["Hors d'eau", '1ère couche'], ["Hors d'eau", 'EP / crosses'],
    ['2nd couche et relevés', '2nd couche'], ['2nd couche et relevés', 'Relevés'],
    ['Finitions', 'Solins / couvertines'], ['Protection', 'Gravillons']
  ];
  const faitesParZone = { 'Terrasse 01': 7, 'Terrasse 02': 5, 'Terrasse 03': 4, 'Terrasse 04': 2 };
  zones.forEach(z => ordre.forEach(([lot, t], i) => {
    const fait = i < faitesParZone[z];
    taches.push({
      id: id(), chantierId: cid, zone: z, lot, tache: t, fait,
      faitLe: fait ? addDays(s1, Math.min(i + 1, 9)) : '', faitPar: fait ? 'Chef de chantier' : '', obs: '', ajout: false
    });
  }));

  const journal = [
    { id: id(), chantierId: cid, date: addDays(s1, 0), meteo: 'Beau', effectif: 2, heures: 15, intemperie: false, cause: '', verifs: [], texte: 'Installation, approvisionnement terminé. Début vernis + pare-vapeur.', auteur: 'Démo' },
    { id: id(), chantierId: cid, date: addDays(s1, 2), meteo: 'Pluie', effectif: 2, heures: 0, intemperie: true, cause: 'Pluie continue', verifs: [0, 2, 3], texte: 'Arrêt intempéries l\'après-midi. Prédécoupe des équerres en temps masqué.', auteur: 'Démo' },
    { id: id(), chantierId: cid, date: addDays(s2, 1), meteo: 'Nuageux', effectif: 2, heures: 15, intemperie: false, cause: '', verifs: [], texte: 'Hors d\'eau terminé. Démarrage 2nd couche et relevés (~140 m²).', auteur: 'Démo' }
  ];

  const reserves = [
    { id: id(), chantierId: cid, zone: 'Terrasse 01', description: 'Recouvrement insuffisant en pied de relevé angle nord-est', origine: 'Autocontrôle', responsable: 'Chef de chantier', echeance: addDays(s2, 4), statut: 'ouverte', creeLe: addDays(s2, 1), leveeLe: '' },
    { id: id(), chantierId: cid, zone: 'Terrasse 02', description: 'Crapaudine EP manquante', origine: 'Visite CDT', responsable: 'Chef de chantier', echeance: addDays(s2, 2), statut: 'levée', creeLe: addDays(s1, 3), leveeLe: addDays(s2, 0) }
  ];

  const checklists = {};
  checklists[cid] = {
    cdt: { '0-0': { date: addDays(s1, -21), par: 'Marc' }, '1-3': { date: addDays(s1, -14), par: 'Marc' }, '2-0': { date: addDays(s1, -7), par: 'Marc' } },
    fin: {}
  };

  // Gestion financière : budgets d'achats (synthèse du BTE CIGV), décomposition du marché, situations, commandes
  chantier.budget = { materiaux: 9721.28, soustraitance: 2562.5, materiel: 500, divers: 1000 };
  chantier.finances = { rg: 5, prorata: 0, tva: 20 };
  chantier.catalogue = [
    { designation: 'Vernis EIF', unite: 'L', quantite: 82, pu: 1.9 }, { designation: 'Hyrène 25/25 TS', unite: 'm²', quantite: 902, pu: 2.39 },
    { designation: 'Isolant PU 120 mm', unite: 'm²', quantite: 430, pu: 10.75 }, { designation: 'Hyrène PY 35 (équerres)', unite: 'mL', quantite: 202, pu: 1.16 },
    { designation: 'Gravillons roulés 5/15', unite: 't', quantite: 25, pu: 38 }, { designation: 'Couvertine acier galvanisé', unite: 'mL', quantite: 100, pu: 14.5 }
  ];
  const postesDef = [['01', 'Installation et sécurités', 1500], ['02', 'Pare-vapeur', 3200], ['03', 'Isolation thermique', 5200], ['04', 'Étanchéité bicouche', 7350], ['05', 'Relevés, solins et couvertines', 4200], ['06', 'Protection gravillons', 1200]];
  const postes = postesDef.map(([code, designation, montant]) => ({ id: id(), chantierId: cid, code, designation, montant, avenant: false }));
  postes.push({ id: id(), chantierId: cid, code: 'TS 01', designation: 'Crapaudines et trop-pleins supplémentaires', montant: 480, avenant: true });
  const pcts1 = {}, pcts2 = {};
  [1, 0.75, 0.3, 0, 0, 0, 0].forEach((v, i) => { pcts1[postes[i].id] = v; });
  [1, 1, 1, 0.45, 0.2, 0, 0.5].forEach((v, i) => { pcts2[postes[i].id] = v; });
  const moisS1 = s1.slice(0, 7), moisS2 = addDays(s1, 14).slice(0, 7);
  const situations = [
    { id: id(), chantierId: cid, numero: 1, mois: moisS1, date: addDays(s1, 9), statut: 'validee', pcts: pcts1, transmiseLe: addDays(s1, 9), valideeLe: addDays(s1, 12), auteur: 'Marc' },
    { id: id(), chantierId: cid, numero: 2, mois: moisS2 === moisS1 ? addDays(s1, 40).slice(0, 7) : moisS2, date: addDays(s2, 3), statut: 'brouillon', pcts: pcts2, auteur: 'Marc' }
  ];
  const commandes = [
    { id: id(), chantierId: cid, numero: 'CMD-001', fournisseur: 'Négoce Étanchéité Ouest', objet: 'Pare-vapeur, équerres et membranes', categorie: 'Matériaux', date: addDays(s1, -10), statut: 'livree', livraisonPrevue: addDays(s1, -2), livraisonReelle: addDays(s1, -2),
      lignes: [{ designation: 'Vernis EIF', quantite: 82, unite: 'L', pu: 1.9 }, { designation: 'Hyrène 25/25 TS', quantite: 902, unite: 'm²', pu: 2.39 }, { designation: 'Hyrène PY 35 (équerres)', quantite: 202, unite: 'mL', pu: 1.16 }] },
    { id: id(), chantierId: cid, numero: 'CMD-002', fournisseur: 'Isolation Distribution', objet: 'Isolant PU 120 mm', categorie: 'Matériaux', date: addDays(s1, -8), statut: 'livree', livraisonPrevue: addDays(s1, 3), livraisonReelle: addDays(s1, 4),
      lignes: [{ designation: 'Isolant PU 120 mm', quantite: 430, unite: 'm²', pu: 10.75 }] },
    { id: id(), chantierId: cid, numero: 'CMD-003', fournisseur: 'Négoce Étanchéité Ouest', objet: 'Gravillons et couvertines', categorie: 'Matériaux', date: addDays(s2, -3), statut: 'confirmee', livraisonPrevue: addDays(s2, -1),
      lignes: [{ designation: 'Gravillons roulés 5/15', quantite: 25, unite: 't', pu: 38 }, { designation: 'Couvertine acier galvanisé', quantite: 100, unite: 'mL', pu: 14.5 }] },
    { id: id(), chantierId: cid, numero: 'CMD-004', fournisseur: 'Levage Services', objet: 'Grue mobile — levage des matériaux R+7', categorie: 'Matériel', date: addDays(s1, -5), statut: 'facturee', livraisonPrevue: s1, livraisonReelle: s1,
      lignes: [{ designation: 'Grue mobile avec opérateur', quantite: 1, unite: 'jour', pu: 480 }] }
  ];

  return { chantier, ops, suivi, taches, journal, reserves, checklists, postes, situations, commandes };
}
