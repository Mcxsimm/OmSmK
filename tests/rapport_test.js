import { assertAlmostEquals, assertEquals, assertStringIncludes } from 'jsr:@std/assert@1';
import { charger } from './charger.js';

const R = charger(['js/calculs.js', 'js/demo.js'], ['syntheseMois', 'genererICS', 'rappelsDus', 'finDuMois', 'moisPrecedent', 'construireDemo']);

function demo() {
  const d = R.construireDemo('2026-09-28');
  return { b: { chantiers: [d.chantier], ops: d.ops, suivi: d.suivi, pointages: d.pointages, compagnons: d.compagnons, journal: d.journal, reserves: d.reserves, securite: d.securite, actions: d.actions, reunions: d.reunions }, cid: d.chantier.id };
}

Deno.test('mois : dernier jour et mois précédent', () => {
  assertEquals(R.finDuMois('2026-02'), '2026-02-28');
  assertEquals(R.finDuMois('2026-09'), '2026-09-30');
  assertEquals(R.moisPrecedent('2026-01'), '2025-12');
});

Deno.test('synthèse du mois : avancement, effectif pointé, intempéries, sécurité', () => {
  const { b, cid } = demo();
  const s = R.syntheseMois(b, cid, '2026-09');
  assertEquals(s.avancement.debut, 0);
  assertAlmostEquals(s.avancement.gain, s.avancement.fin, 1e-9);   // gain = fin − début (0)
  assertEquals(s.phases.find(p => p.phase === 'Pare-vapeur').fin, 1);
  assertEquals(s.effectif.heures, 45);             // semaine 1 pointée (6 jours-homme)
  assertEquals(s.effectif.joursHomme, 6);
  assertEquals(s.effectif.jours, 3);
  assertEquals(s.joursIntemperie, 1);              // mercredi 23 septembre
  assertEquals(s.securite.causeries, 1);
  assertEquals(s.securite.accueils, 2);
  assertEquals(s.reserves.levees, 1);
});

Deno.test('agenda .ics : événements datés, jour entier, rappels et échappement', () => {
  const ics = R.genererICS([
    { uid: 'r1', titre: 'Réunion de chantier ; CIGV', date: '2026-10-08', heure: '09:00', duree: 90, lieu: 'Base vie, bât. A' },
    { uid: 'a1', titre: 'Action : relancer le BET', date: '2026-10-09' }
  ], 'Chantiers', new Date('2026-10-04T10:00:00Z'));
  assertStringIncludes(ics, 'BEGIN:VCALENDAR\r\n');
  assertStringIncludes(ics, 'DTSTART;TZID=Europe/Paris:20261008T090000');
  assertStringIncludes(ics, 'DTEND;TZID=Europe/Paris:20261008T103000');
  assertStringIncludes(ics, 'SUMMARY:Réunion de chantier \; CIGV');
  assertStringIncludes(ics, 'LOCATION:Base vie\\, bât. A');
  assertStringIncludes(ics, 'DTSTART;VALUE=DATE:20261009');
  assertStringIncludes(ics, 'DTEND;VALUE=DATE:20261010');
  assertStringIncludes(ics, 'TRIGGER:-PT60M');
  assertStringIncludes(ics, 'TRIGGER:-PT420M');
  assertEquals(ics.split('BEGIN:VEVENT').length - 1, 2);
  assertStringIncludes(ics, 'BEGIN:VTIMEZONE\r\nTZID:Europe/Paris');
  // Lignes repliées à 75 octets au plus
  const enc = new TextEncoder();
  const long = R.genererICS([{ uid: 'x', titre: 'é'.repeat(120), date: '2026-10-09' }]);
  assertEquals(long.split('\r\n').every(l => enc.encode(l).length <= 75), true);
  assertStringIncludes(long.replace(/\r\n /g, ''), 'SUMMARY:' + 'é'.repeat(120));
});

Deno.test('rappels : actions échues, permis de feu non surveillé, pointage manquant après 17 h', () => {
  const { b, cid } = demo();
  const matin = R.rappelsDus(b, new Date(2026, 9, 2, 9, 0));     // vendredi 2 octobre
  assertEquals(matin.filter(r => r.id.startsWith('act|')).length, 3);
  assertEquals(matin.some(r => r.id.startsWith('pt|')), false);
  const soir = R.rappelsDus(b, new Date(2026, 9, 2, 18, 0));
  assertEquals(soir.some(r => r.id === `pt|${cid}|2026-10-02`), true);
  b.securite.push({ id: 'pf2', chantierId: cid, type: 'permis', date: '2026-10-02', zone: 'T3', surveillance: { fait: false } });
  assertEquals(R.rappelsDus(b, new Date(2026, 9, 2, 9, 0)).some(r => r.id.startsWith('pf|pf2')), true);
});
