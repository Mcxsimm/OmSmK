import { assertAlmostEquals, assertEquals, assertThrows } from 'jsr:@std/assert@1';
import { charger } from './charger.js';

const R = charger(['js/calculs.js'],
  ['calcRAF', 'classerNature', 'montantSAP', 'dateSAP', 'lireCoutsSAP', 'tableauTexte', 'otpCorrespond', 'repartirLineaire', 'rafPropose', 'rattachementsOTP', 'sourceCouts']);

function base() {
  const c = { id: 'c', nom: 'Test', otp: '6009435', tauxHoraire: 30, heuresJour: 7.5, marcheHT: 10000, budget: { materiaux: 3000, soustraitance: 0, materiel: 500, divers: 0 }, finances: { rg: 5, prorata: 0, tva: 20 } };
  return {
    chantiers: [c],
    ops: [{ id: 'o1', chantierId: 'c', ouvrage: 'A', phase: 'P1', operation: 'X', metre: 0, cadence: 0, heuresForfait: 100 }],
    suivi: [], taches: [], journal: [], reserves: [], checklists: {}, postes: [], devis: [],
    pointages: [
      { id: 'p1', chantierId: 'c', date: '2026-09-29', compagnonId: 'k', statut: 'present', lignes: [{ ouvrage: 'A', phase: 'P1', h: 8 }] },
      { id: 'p2', chantierId: 'c', date: '2026-10-01', compagnonId: 'k', statut: 'present', lignes: [{ ouvrage: 'A', phase: 'P1', h: 7 }] }
    ],
    situations: [{ id: 'S1', chantierId: 'c', numero: 1, mois: '2026-09', statut: 'payee', pcts: { __marche: 0.2 } }],
    commandes: [{ id: 'k1', chantierId: 'c', categorie: 'Matériaux', statut: 'livree', date: '2026-09-15', lignes: [{ quantite: 10, pu: 100 }] }],
    couts: []
  };
}

Deno.test('montants et dates au format SAP', () => {
  assertEquals(R.montantSAP('2,339.85-'), -2339.85);
  assertEquals(R.montantSAP('298.40'), 298.4);
  assertEquals(R.montantSAP('1 234,56'), 1234.56);
  assertEquals(R.montantSAP('298,40-'), -298.4);
  assertEquals(R.montantSAP('-3.945,99'), -3945.99);
  assertEquals(R.montantSAP(12.5), 12.5);
  assertEquals(R.dateSAP('30.09.2026'), '2026-09-30');
  assertEquals(R.dateSAP('1/1/2026'), '2026-01-01');
  assertEquals(R.dateSAP('2026-09-14'), '2026-09-14');
  assertEquals(R.dateSAP(''), '');
});

Deno.test('OTP : élément et sous-éléments', () => {
  assertEquals(R.otpCorrespond('6009435', '6009435'), true);
  assertEquals(R.otpCorrespond('6009435', '6009435-01'), true);
  assertEquals(R.otpCorrespond('6009435', '60094350'), false);
  assertEquals(R.otpCorrespond('', '6009435'), false);
});

Deno.test('nature comptable → poste du RAF (préfixe le plus long)', () => {
  assertEquals(R.classerNature('601100'), 'fournitures');
  assertEquals(R.classerNature('604000'), 'stcomp');
  assertEquals(R.classerNature('613500'), 'materiel');
  assertEquals(R.classerNature('621100'), 'mo');
  assertEquals(R.classerNature('618500'), 'autres');
  assertEquals(R.classerNature('990001'), 'autres');
  assertEquals(R.classerNature('990001', { '99': 'mo' }), 'mo');
});

Deno.test('lecture de l\'export SAP « postes individuels de coûts réels »', () => {
  const rows = [
    ['Mise en forme', '/SMAC-COUT'],
    [],
    ['Nom 1', 'Fourn.', 'Document d\'achat', 'Description de l\'article', 'Désignation de l\'objet', 'Elt d\'OTP', 'N° pce réf', 'Val./D.Tra', 'Val./devise périm.', 'Date de valeur', 'Saisie le', 'Utilisateur', 'Nat.cpte'],
    ['', '', '', '', 'PIP MAXIME PHILIPPE', '6009435', '', '20.77', '20.77', '30.09.2026', '30.09.2026', 'USER-SERVICE', '936400'],
    ['', '', '', '', '', '', '', '68.39', '68.39', '', '', '', ''],
    ['', '', '', '', 'PIP MAXIME PHILIPPE', '6009435', '9911445', '298.40-', '298.40-', '01.01.2026', '28.09.2026', 'USER-SERVICE', '990001'],
    ['PROMAN 120', '1053896', '4500244631', '', 'PIP MAXIME PHILIPPE', '6009435', '5001545589', '298.40', '298.40', '14.09.2026', '29.09.2026', 'USER-SERVICE', '621100']
  ];
  const l = R.lireCoutsSAP(rows);
  assertEquals(l.length, 3);
  assertEquals(l[0], { otp: '6009435', date: '2026-09-30', nature: '936400', montant: 20.77, libelle: '', fournisseur: '', codeFournisseur: '', docAchat: '', piece: '', objet: 'PIP MAXIME PHILIPPE' });
  assertEquals(l[1].montant, -298.4);
  assertEquals([l[2].fournisseur, l[2].codeFournisseur, l[2].docAchat, l[2].piece], ['PROMAN 120', '1053896', '4500244631', '5001545589']);
  assertThrows(() => R.lireCoutsSAP([['a', 'b'], ['1', '2']]));
});

Deno.test('fichier texte SAP à colonnes « | »', () => {
  const t = '----------\n| Elt d\'OTP | Nat.cpte | Date de valeur | Val./D.Tra |\n|----------|\n| 6009435 | 601000 | 14.09.2026 | 1.234,50 |\n';
  const l = R.lireCoutsSAP(R.tableauTexte(t));
  assertEquals(l.length, 1);
  assertEquals([l[0].nature, l[0].montant], ['601000', 1234.5]);
});

Deno.test('RAF depuis OmSmK : pointage × taux et commandes, CA mérité, FAE', () => {
  const b = base();
  assertEquals(R.sourceCouts(b, 'c'), 'omsmk');
  b.chantiers[0].raf = { postes: { mo: { raf: 1000 }, fournitures: { raf: 500 } } };
  const r = R.calcRAF(b, 'c', '2026-10');
  const mo = r.postes.find(p => p.k === 'mo'), fo = r.postes.find(p => p.k === 'fournitures');
  assertEquals([mo.reelM, mo.reelCumul, mo.fin], [210, 450, 1450]);
  assertEquals([fo.reelM, fo.reelCumul, fo.budget, fo.fin, fo.ecart], [0, 1000, 3000, 1500, 1500]);
  assertEquals(r.tot.reelCumul, 1450);
  assertEquals(r.tot.fin, 2950);
  assertAlmostEquals(r.avancement, 1450 / 2950);
  assertAlmostEquals(r.ca.merite, 10000 * 1450 / 2950, 1e-6);
  assertEquals(r.ca.factureCumul, 2000);
  assertAlmostEquals(r.fae, r.ca.merite - 2000, 1e-6);
  assertEquals(r.pca, 0);
  assertEquals(r.marge.fin, 10000 - 2950);
  // Le réel de septembre exclut le pointage d'octobre
  assertEquals(R.calcRAF(b, 'c', '2026-09').postes.find(p => p.k === 'mo').reelCumul, 240);
});

Deno.test('RAF depuis les coûts SAP importés, poste forcé, répartition mensuelle', () => {
  const b = base();
  b.couts = [
    { id: '1', chantierId: 'c', source: 'sap', date: '2026-10-02', nature: '601000', montant: 400 },
    { id: '2', chantierId: 'c', source: 'sap', date: '2025-12-10', nature: '604000', montant: 1000 },
    { id: '3', chantierId: 'c', source: 'sap', date: '2026-10-03', nature: '618500', montant: 50, poste: 'etudes' }
  ];
  b.chantiers[0].raf = { resteAObtenir: 500, postes: { fournitures: { raf: 600, mois: { '2026-11': 200, '2026-12': 100 } } } };
  assertEquals(R.sourceCouts(b, 'c'), 'sap');
  const r = R.calcRAF(b, 'c', '2026-10');
  const p = k => r.postes.find(x => x.k === k);
  assertEquals([p('fournitures').reelM, p('stcomp').reelExercice, p('stcomp').reelCumul, p('etudes').reelCumul, p('mo').reelCumul], [400, 0, 1000, 50, 0]);
  assertEquals(p('fournitures').aRepartir, 300);
  assertEquals(r.tot.mois['2026-11'], 200);
  assertEquals(r.ca.fin, 10500);
  b.chantiers[0].raf.source = 'omsmk';
  assertEquals(R.calcRAF(b, 'c', '2026-10').postes.find(x => x.k === 'mo').reelCumul, 450);
});

Deno.test('RAF proposé et lissage linéaire', () => {
  const b = base();
  const r = R.calcRAF(b, 'c', '2026-10');
  const prop = R.rafPropose(r);
  assertEquals(prop.fournitures, 2000);
  assertEquals(prop.materiel, 500);
  assertEquals(R.repartirLineaire(100, ['2026-11', '2026-12', '2027-01']), { '2026-11': 33.33, '2026-12': 33.33, '2027-01': 33.34 });
  const l = R.rattachementsOTP(b, 'c');
  assertEquals([l.pointage.heures, l.commandes.montant, l.facturation.montant, l.couts.n], [15, 1000, 2000, 0]);
});
