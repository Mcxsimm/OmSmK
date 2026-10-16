import { assertEquals } from 'jsr:@std/assert@1';
import { charger } from './charger.js';

const G = charger(['js/referentiel.js', 'js/calculs.js'], ['REFERENTIEL', 'etatPreparation']);
const R = G.REFERENTIEL;

Deno.test('Rénovation : une phase par lot, chacune avec ses opérations, et la levée des réserves en dernier', () => {
  const phases = Object.entries(R.metiers['Rénovation']);
  assertEquals(phases.length, 13);
  phases.forEach(([, ops]) => assertEquals(ops.length > 0, true));
  assertEquals(phases[phases.length - 1][0], 'Réserves');
});

Deno.test('Rénovation : pas de cadence standard inventée', () => {
  assertEquals(R.cadences.filter(c => c.m === 'Rénovation').length, 0);
});

Deno.test('Rénovation : la préparation dédiée se suit comme celle des chantiers SMAC', () => {
  const base = { checklists: { c1: { prep: { '0-3': { statut: 'fait' }, '1-4': { statut: 'so' } } } } };
  const e = G.etatPreparation(base, 'c1', R.preparationRenovation, '2026-10-16');
  assertEquals(e.items.length, 21);
  assertEquals(e.total, 20);
  assertEquals(e.faits, 1);
  assertEquals(e.items[3].texte.startsWith("Autorisation d'urbanisme"), true);
});
