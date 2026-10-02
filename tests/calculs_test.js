import { assertAlmostEquals, assertEquals } from 'jsr:@std/assert@1';
import { charger } from './charger.js';

const C = charger(['js/calculs.js', 'js/demo.js'],
  ['calcSuivi', 'phasesBTE', 'heuresOp', 'statsTerrain', 'parseCSV', 'num', 'lundi', 'semISO', 'construireDemo']);

// Base reproduisant l'état du BTE « cas pratique CIGV » (semaine 1 + pare-vapeur semaine 2)
function baseCIGV() {
  const d = C.construireDemo('2026-09-28');
  const s1 = '2026-09-21';
  const suivi = d.suivi.filter(s => s.semaine === s1 || s.phase === 'Pare-vapeur');
  return { chantiers: [d.chantier], ops: d.ops, suivi, taches: d.taches, journal: [], reserves: [], checklists: {}, cid: d.chantier.id };
}

Deno.test('heures d\'une opération : métré / cadence x heures par jour, sinon forfait', () => {
  const c = { heuresJour: 7.5 };
  assertAlmostEquals(C.heuresOp({ metre: 410, cadence: 210 }, c), 14.642857, 1e-5);
  assertEquals(C.heuresOp({ metre: 0, cadence: 0, heuresForfait: 16 }, c), 16);
  assertAlmostEquals(C.heuresOp({ metre: 3757, cadence: 25 }, {}), 1127.1, 1e-6); // 7,5 h par défaut
});

Deno.test('BTE CIGV : 133,5 h budgétées réparties sur 5 phases', () => {
  const b = baseCIGV();
  const p = C.phasesBTE(b, b.cid);
  assertEquals(p.map(x => x.phase), ['Installation / Appro', 'Pare-vapeur', "Hors d'eau", '2nd couche et relevés', 'Finitions']);
  assertAlmostEquals(p.reduce((t, x) => t + x.budget, 0), 133.5012, 1e-3);
  assertAlmostEquals(p[1].budget, 26.772, 1e-3);
});

Deno.test('suivi hebdo : mêmes résultats que l\'onglet « Étape 2 » du BTE SMAC', () => {
  const b = baseCIGV();
  const { rows, tot } = C.calcSuivi(b, b.cid);
  // Lignes du fichier Excel
  assertAlmostEquals(rows[0].ecartH, 8.5, 1e-6);
  assertAlmostEquals(rows[1].ecartH, 1.772, 1e-3);
  assertAlmostEquals(rows[2].ecartH, -8.4136, 1e-3);
  assertAlmostEquals(rows[2].ecartProj, -21.0341, 1e-3);
  // Indicateurs généraux
  assertAlmostEquals(tot.pct, 0.4259, 1e-4);
  assertEquals(tot.heures, 55);
  assertAlmostEquals(tot.ecartH, 1.8584, 1e-3);
  assertAlmostEquals(tot.impact, 55.7516, 1e-3);
  assertAlmostEquals(tot.ecartProj, 4.3634, 1e-3);
  assertAlmostEquals(tot.impactProj, 130.9026, 1e-3);
});

Deno.test('suivi : le % retenu est le dernier saisi, les heures sont cumulées, filtre par semaine', () => {
  const b = baseCIGV();
  const pv = C.calcSuivi(b, b.cid).rows[1];
  assertEquals(pv.pct, 1);
  assertEquals(pv.heures, 25);
  const pvS1 = C.calcSuivi(b, b.cid, '2026-09-21').rows[1];
  assertEquals(pvS1.pct, 0.75);
  assertEquals(pvS1.heures, 15);
});

Deno.test('suivi : pas d\'écart tant qu\'aucune heure n\'est pointée', () => {
  const b = baseCIGV();
  b.suivi = [{ id: 'x', chantierId: b.cid, semaine: '2026-09-21', ouvrage: 'Toiture A', phase: 'Finitions', pct: 0.5, heures: 0 }];
  const r = C.calcSuivi(b, b.cid).rows[4];
  assertEquals(r.ecartH, 0);
  assertEquals(r.pct, 0.5);
});

Deno.test('terrain : statistiques d\'avancement', () => {
  const b = baseCIGV();
  const s = C.statsTerrain(b, b.cid);
  assertEquals([s.faites, s.total], [18, 36]);
});

Deno.test('import CSV : séparateur détecté, guillemets et sauts de ligne gérés', () => {
  assertEquals(C.parseCSV('﻿ID;Chantier;Support\r\n1;THOMERY;56/25\r\n'), [['ID', 'Chantier', 'Support'], ['1', 'THOMERY', '56/25']]);
  assertEquals(C.parseCSV('a,b\n"x, y","il a dit ""ok"""\n'), [['a', 'b'], ['x, y', 'il a dit "ok"']]);
  assertEquals(C.parseCSV('a\tb\n1\t2'), [['a', 'b'], ['1', '2']]);
  assertEquals(C.parseCSV('a;b\n"ligne1\nligne2";z'), [['a', 'b'], ['ligne1\nligne2', 'z']]);
});

Deno.test('dates : lundi de la semaine et numéro ISO', () => {
  assertEquals(C.lundi('2026-10-02'), '2026-09-28');
  assertEquals(C.lundi('2026-09-28'), '2026-09-28');
  assertEquals(C.semISO('2026-09-28'), 40);
  assertEquals(C.semISO('2027-01-01'), 53);
  assertEquals(C.num('1 234,5'), 1234.5);
});
