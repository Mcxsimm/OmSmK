import { assertEquals } from 'jsr:@std/assert@1';
import { charger } from './charger.js';

const P = charger(['js/calculs.js', 'js/demo.js'],
  ['joursOuvres', 'ajouterJoursOuvres', 'dureePhase', 'planningAuto', 'calcPlanning', 'actionEnRetard', 'actionsDe', 'construireDemo']);

function base() {
  const c = { id: 'c', heuresJour: 7.5, tauxHoraire: 30, dateDebut: '2026-09-28', dateFin: '2026-10-09' };
  return {
    chantiers: [c],
    ops: [
      { id: 'o1', chantierId: 'c', ouvrage: 'A', phase: 'P1', heuresForfait: 30 },   // 2 j à 2 compagnons
      { id: 'o2', chantierId: 'c', ouvrage: 'A', phase: 'P2', heuresForfait: 45 },   // 3 j
      { id: 'o3', chantierId: 'c', ouvrage: 'A', phase: 'P3', heuresForfait: 10 }    // 1 j
    ],
    suivi: [], pointages: []
  };
}

Deno.test('jours ouvrés : week-ends exclus', () => {
  assertEquals(P.joursOuvres('2026-09-28', '2026-10-04'), 5);   // lundi → dimanche
  assertEquals(P.joursOuvres('2026-10-02', '2026-10-05'), 2);   // vendredi → lundi
  assertEquals(P.ajouterJoursOuvres('2026-10-02', 2), '2026-10-05');
  assertEquals(P.ajouterJoursOuvres('2026-10-03', 1), '2026-10-05'); // samedi → lundi
});

Deno.test('durée d\'une phase : heures ÷ (effectif × heures par jour), arrondi au jour supérieur', () => {
  assertEquals(P.dureePhase(30, 2, 7.5), 2);
  assertEquals(P.dureePhase(31, 2, 7.5), 3);
  assertEquals(P.dureePhase(0, 2, 7.5), 1);
});

Deno.test('planning automatique : phases enchaînées sur les jours ouvrés', () => {
  const p = P.planningAuto(base(), 'c', { debut: '2026-09-28', effectif: 2 });
  assertEquals(p['A||P1'], { debut: '2026-09-28', fin: '2026-09-29' });
  assertEquals(p['A||P2'], { debut: '2026-09-30', fin: '2026-10-02' });
  assertEquals(p['A||P3'], { debut: '2026-10-05', fin: '2026-10-05' });
  const q = P.planningAuto(base(), 'c', { debut: '2026-09-28', effectif: 2, chevauchement: 0.5 });
  assertEquals(q['A||P2'].debut, '2026-09-29');
});

Deno.test('statut des phases : terminée, en retard, en cours, à venir, fin projetée', () => {
  const b = base();
  b.chantiers[0].planning = P.planningAuto(b, 'c', { debut: '2026-09-28', effectif: 2 });
  b.suivi = [
    { id: 's1', chantierId: 'c', semaine: '2026-09-28', ouvrage: 'A', phase: 'P1', pct: 1, heures: 30 },
    { id: 's2', chantierId: 'c', semaine: '2026-09-28', ouvrage: 'A', phase: 'P2', pct: 0.2, heures: 20 }
  ];
  const pl = P.calcPlanning(b, 'c', '2026-10-01');
  assertEquals(pl.rows.map(r => r.statut), ['termine', 'retard', 'a_venir']);
  // P2 : 20 % réalisé en 4 jours ouvrés (activité depuis lundi 28, suivi hebdo) → 20 jours au total
  assertEquals(pl.rows[1].finProjetee, '2026-10-23');
  assertEquals(pl.rows[1].glissement, 15);
  assertEquals(pl.retard, 10);   // fin contractuelle le 9 octobre
});

Deno.test('actions : en retard si échéance dépassée et non faite ; tri ouvertes puis échéance', () => {
  assertEquals(P.actionEnRetard({ statut: 'ouverte', echeance: '2026-10-01' }, '2026-10-02'), true);
  assertEquals(P.actionEnRetard({ statut: 'faite', echeance: '2026-10-01' }, '2026-10-02'), false);
  const b = { actions: [
    { id: 'a', chantierId: 'c', statut: 'faite', echeance: '2026-09-01' },
    { id: 'b', chantierId: 'c', statut: 'ouverte', echeance: '2026-10-10' },
    { id: 'd', chantierId: 'c', statut: 'ouverte', echeance: '2026-10-05' },
    { id: 'e', chantierId: 'x', statut: 'ouverte' }
  ] };
  assertEquals(P.actionsDe(b, 'c').map(a => a.id), ['d', 'b', 'a']);
});
