import { assertAlmostEquals, assertEquals } from 'jsr:@std/assert@1';
import { charger } from './charger.js';

const F = charger(['js/calculs.js', 'js/demo.js'],
  ['calcSituation', 'calcFinances', 'postesDe', 'situationsDe', 'montantCommande', 'serieFinanciere', 'commandeEngagee', 'construireDemo']);

function base() {
  const c = { id: 'c', nom: 'Test', tauxHoraire: 30, heuresJour: 7.5, marcheHT: 10000, budget: { materiaux: 3000, soustraitance: 0, materiel: 500, divers: 0 }, finances: { rg: 5, prorata: 1, tva: 20 } };
  return {
    chantiers: [c],
    ops: [{ id: 'o1', chantierId: 'c', ouvrage: 'A', phase: 'P1', operation: 'X', metre: 0, cadence: 0, heuresForfait: 100 }],
    suivi: [{ id: 's1', chantierId: 'c', semaine: '2026-09-21', ouvrage: 'A', phase: 'P1', pct: 0.5, heures: 60 }],
    taches: [], journal: [], reserves: [], checklists: {},
    postes: [
      { id: 'p1', chantierId: 'c', code: '01', designation: 'Lot 1', montant: 6000, avenant: false },
      { id: 'p2', chantierId: 'c', code: '02', designation: 'Lot 2', montant: 4000, avenant: false },
      { id: 'a1', chantierId: 'c', code: 'TS 01', designation: 'Avenant', montant: 1000, avenant: true }
    ],
    situations: [
      { id: 'S1', chantierId: 'c', numero: 1, mois: '2026-09', statut: 'payee', pcts: { p1: 0.5, p2: 0, a1: 0 } },
      { id: 'S2', chantierId: 'c', numero: 2, mois: '2026-10', statut: 'transmise', pcts: { p1: 1, p2: 0.25, a1: 1 } }
    ],
    commandes: [
      { id: 'k1', chantierId: 'c', categorie: 'Matériaux', statut: 'livree', date: '2026-09-15', lignes: [{ quantite: 10, pu: 200 }, { quantite: 4, pu: 50 }] },
      { id: 'k2', chantierId: 'c', categorie: 'Matériaux', statut: 'brouillon', date: '2026-09-20', lignes: [{ quantite: 1, pu: 999 }] },
      { id: 'k3', chantierId: 'c', categorie: 'Matériel', statut: 'facturee', date: '2026-10-02', lignes: [{ quantite: 2, pu: 400 }] }
    ]
  };
}

Deno.test('montant d\'une commande et commandes engagées', () => {
  const b = base();
  assertEquals(F.montantCommande(b.commandes[0]), 2200);
  assertEquals(F.commandeEngagee(b.commandes[1]), false);
  assertEquals(F.commandeEngagee(b.commandes[2]), true);
});

Deno.test('postes : avenants après le marché de base ; ligne unique sans décomposition', () => {
  const b = base();
  assertEquals(F.postesDe(b, 'c').map(p => p.code), ['01', '02', 'TS 01']);
  b.postes = [];
  const p = F.postesDe(b, 'c');
  assertEquals(p.length, 1);
  assertEquals(p[0].montant, 10000);
});

Deno.test('situation : montant du mois = cumul − précédent, retenue, prorata, TVA', () => {
  const b = base();
  const s1 = F.calcSituation(b, 'c', 'S1').tot;
  assertEquals(s1.cumul, 3000);
  assertEquals(s1.mois, 3000);
  const s2 = F.calcSituation(b, 'c', 'S2');
  const t = s2.tot;
  assertEquals(t.cumul, 6000 + 1000 + 1000);
  assertEquals(t.precedent, 3000);
  assertEquals(t.mois, 5000);
  assertEquals(t.rg, 250);
  assertEquals(t.prorata, 50);
  assertEquals(t.netHT, 4700);
  assertAlmostEquals(t.tva, 940, 1e-9);
  assertAlmostEquals(t.ttc, 5640, 1e-9);
  assertEquals(s2.lignes.find(l => l.poste.id === 'a1').mois, 1000);
});

Deno.test('synthèse : CA, facturé, encaissé, déboursé et fin d\'affaire', () => {
  const b = base();
  const f = F.calcFinances(b, 'c');
  assertEquals(f.ca, 11000);
  assertEquals(f.avenants, 1000);
  assertEquals(f.facture, 8000);                       // dernière situation émise (transmise)
  assertAlmostEquals(f.encaisseTTC, (3000 - 150 - 30) * 1.2, 1e-9); // seule S1 est payée
  assertEquals(f.budget.mo, 3000);                     // 100 h × 30 €
  assertEquals(f.reel.mo, 1800);                       // 60 h × 30 €
  assertEquals(f.reel.materiaux, 2200);                // brouillon exclu
  assertEquals(f.reel.materiel, 800);
  // MO fin d'affaire : 50 % pour 60 h → écart projeté −20 h → +600 €
  assertAlmostEquals(f.pfa.mo, 3600, 1e-9);
  assertEquals(f.pfa.materiaux, 3000);                 // budget > engagé
  assertEquals(f.pfa.materiel, 800);                   // engagé > budget
  assertAlmostEquals(f.pfa.total, 7400, 1e-9);
  assertEquals(f.budget.total, 6500);
  assertAlmostEquals(f.margePFA, 3600, 1e-9);
  assertEquals(f.margePrevue, 4500);
});

Deno.test('série financière mensuelle cumulée', () => {
  const b = base();
  b.chantiers[0].dateDebut = '2026-09-01';
  b.chantiers[0].dateFin = '2026-10-31';
  const pts = F.serieFinanciere(b, 'c');
  const sep = pts.find(p => p.mois === '2026-09');
  assertEquals(sep.facture, 3000);
  assertEquals(sep.depenses, 1800 + 2200);
});

Deno.test('démo CIGV : données financières cohérentes', () => {
  const d = F.construireDemo('2026-09-28');
  const b = { chantiers: [d.chantier], ops: d.ops, suivi: d.suivi, taches: d.taches, journal: [], reserves: [], checklists: {}, postes: d.postes, situations: d.situations, commandes: d.commandes };
  const f = F.calcFinances(b, d.chantier.id);
  assertEquals(f.ca, 22650 + 480);
  assertEquals(F.situationsDe(b, d.chantier.id).length, 2);
});
