import { assertAlmostEquals, assertEquals } from 'jsr:@std/assert@1';
import { charger } from './charger.js';

const P = charger(['js/calculs.js', 'js/demo.js'],
  ['calcSuivi', 'calcFinances', 'synthesePointage', 'suiviDepuisPointages', 'heuresPointage', 'idPointage', 'serieFinanciere', 'construireDemo']);

function base() {
  const c = { id: 'c', nom: 'Test', tauxHoraire: 30, heuresJour: 7.5, marcheHT: 10000 };
  const pt = (date, k, statut, lignes, extra = {}) => Object.assign({ id: P.idPointage('c', date, k), chantierId: 'c', compagnonId: k, date, statut, lignes, intemp: 0, panier: statut === 'present' }, extra);
  return {
    chantiers: [c],
    ops: [
      { id: 'o1', chantierId: 'c', ouvrage: 'A', phase: 'P1', heuresForfait: 40 },
      { id: 'o2', chantierId: 'c', ouvrage: 'A', phase: 'P2', heuresForfait: 60 }
    ],
    suivi: [
      { id: 's1', chantierId: 'c', semaine: '2026-09-21', ouvrage: 'A', phase: 'P1', pct: 0.5, heures: 0 },
      { id: 's2', chantierId: 'c', semaine: '2026-09-21', ouvrage: 'A', phase: 'P2', pct: null, heures: 4 }
    ],
    compagnons: [{ id: 'k1', chantierId: 'c', nom: 'Un' }, { id: 'k2', chantierId: 'c', nom: 'Deux' }],
    pointages: [
      pt('2026-09-21', 'k1', 'present', [{ ouvrage: 'A', phase: 'P1', h: 7.5 }]),
      pt('2026-09-21', 'k2', 'present', [{ ouvrage: 'A', phase: 'P1', h: 4 }, { ouvrage: 'A', phase: 'P2', h: 3.5 }]),
      pt('2026-09-22', 'k1', 'intemperie', [], { intemp: 7.5 }),
      pt('2026-09-22', 'k2', 'present', [{ ouvrage: '', phase: '', h: 2 }], { intemp: 5.5 }),
      pt('2026-09-23', 'k1', 'conge', [{ ouvrage: 'A', phase: 'P1', h: 99 }]),
      pt('2026-09-28', 'k1', 'present', [{ ouvrage: 'A', phase: 'P2', h: 7.5 }])
    ],
    taches: [], journal: [], reserves: [], checklists: {}, postes: [], situations: [], commandes: []
  };
}

Deno.test('pointage : seules les heures des présents comptent', () => {
  const b = base();
  assertEquals(P.heuresPointage(b.pointages[1]), 7.5);
  assertEquals(P.heuresPointage(b.pointages[2]), 0);
  assertEquals(P.heuresPointage(b.pointages[4]), 0); // congé : lignes ignorées
});

Deno.test('pointage : regroupement par semaine (lundi) et par phase', () => {
  const e = P.suiviDepuisPointages(base(), 'c');
  const h = (sem, ph) => e.filter(x => x.semaine === sem && x.phase === ph).reduce((t, x) => t + x.heures, 0);
  assertEquals(h('2026-09-21', 'P1'), 11.5);
  assertEquals(h('2026-09-21', 'P2'), 3.5);
  assertEquals(h('2026-09-21', ''), 2);
  assertEquals(h('2026-09-28', 'P2'), 7.5);
  assertEquals(e.every(x => x.pct === null), true);
});

Deno.test('pointage : les heures alimentent le suivi hebdo (en plus des saisies manuelles)', () => {
  const b = base();
  const s = P.calcSuivi(b, 'c', '2026-09-27');
  assertEquals(s.rows[0].heures, 11.5);
  assertEquals(s.rows[0].pct, 0.5);
  assertAlmostEquals(s.rows[0].ecartH, 40 * 0.5 - 11.5, 1e-9);
  assertEquals(s.rows[1].heures, 3.5 + 4);
  assertEquals(s.tot.horsBTE, 2);
  assertEquals(P.calcSuivi(b, 'c').rows[1].heures, 15);
});

Deno.test('pointage : la main d\'œuvre réelle inclut les heures non ventilées', () => {
  const b = base();
  const f = P.calcFinances(b, 'c');
  assertEquals(f.reel.mo, (11.5 + 15 + 2) * 30);
});

Deno.test('pointage : synthèse d\'une semaine', () => {
  const t = P.synthesePointage(base(), 'c', '2026-09-21', '2026-09-27');
  assertEquals(t.tot.heures, 17);
  assertEquals(t.tot.intemp, 13);
  assertEquals(t.tot.paniers, 3);
  assertEquals(t.tot.presences, 3);
  assertEquals(t.tot.absences, 1);
  assertEquals(t.parCompagnon.k2.heures, 9.5);
  assertEquals(t.parCompagnon.k2.jours, 2);
});

Deno.test('démo CIGV : le pointage de la semaine 1 redonne les heures du cas pratique', () => {
  const d = P.construireDemo('2026-09-28');
  const b = { chantiers: [d.chantier], ops: d.ops, suivi: d.suivi, pointages: d.pointages, compagnons: d.compagnons };
  const s = P.calcSuivi(b, d.chantier.id, '2026-09-27');
  assertEquals(s.rows.map(r => r.heures).slice(0, 3), [7.5, 15, 22.5]);
  assertEquals(P.calcSuivi(b, d.chantier.id).tot.heures, 85);
});
