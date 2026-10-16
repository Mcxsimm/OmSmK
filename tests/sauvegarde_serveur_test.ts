import { assertEquals } from 'jsr:@std/assert@1';
import { charger } from './charger.js';
import { COLLECTIONS, copiesAPurger, egal, nomCopie, nomDossier, reconstruireBase } from '../supabase/functions/sauvegarde-drive/logique.ts';

const G = charger(['js/calculs.js', 'js/synchro.js'], ['SYNC_COLLECTIONS', 'collecterEnregistrements']);

Deno.test('Sauvegarde serveur : mêmes types d\'enregistrements que l\'application', () => {
  assertEquals(COLLECTIONS, G.SYNC_COLLECTIONS);
});

Deno.test('Sauvegarde serveur : les enregistrements en ligne redonnent la base de l\'application', () => {
  const base = {
    version: 1,
    chantiers: [{ id: 'c1', nom: 'Résidence (démo)', equipeId: 'e1' }],
    checklists: { c1: { cdt: { a: true } } },
    pointages: [{ id: 'p1', chantierId: 'c1', date: '2026-10-01' }],
    photos: [{ id: 'f1', chantierId: 'c1', date: '2026-10-02' }]
  };
  const lignes = G.collecterEnregistrements(base).map((r: { id: string; kind: string; chantierId: string; obj: unknown }) =>
    ({ id: r.id, kind: r.kind, chantier_id: r.chantierId, data: r.obj }));
  const b = reconstruireBase(lignes);
  assertEquals(b.chantiers, base.chantiers);
  assertEquals(b.checklists, base.checklists);
  assertEquals(b.pointages, base.pointages);
  assertEquals(b.photos, base.photos);
  assertEquals(b.commandes, []);
});

Deno.test('Sauvegarde serveur : un type inconnu est conservé à part', () => {
  const b = reconstruireBase([{ id: 'x', kind: 'nouveau', chantier_id: 'c1', data: { a: 1 } }, { id: 'y', kind: 'op', chantier_id: 'c1', data: null }]);
  assertEquals(b.enregistrementsNonClasses.length, 1);
  assertEquals(b.ops, []);
});

Deno.test('Sauvegarde serveur : 30 jours, puis la première copie de chaque mois pendant 12 mois', () => {
  const noms = ['2026-10-16', '2026-09-17', '2026-09-16', '2026-09-15', '2026-09-02', '2026-09-01', '2026-03-05', '2026-03-09', '2025-10-01', '2025-09-30'].map(nomCopie);
  noms.push('autre_fichier.json');
  assertEquals(copiesAPurger(noms, '2026-10-16').sort(), ['2025-09-30', '2026-03-09', '2026-09-02', '2026-09-15'].map(nomCopie).sort());
});

Deno.test('Sauvegarde serveur : noms de dossiers et comparaison de clé', () => {
  assertEquals(nomDossier('Agence / Rouen : "Nord"'), 'Agence Rouen Nord');
  assertEquals(nomDossier(''), 'Sans nom');
  assertEquals(egal('abc', 'abc'), true);
  assertEquals(egal('abc', 'abd'), false);
  assertEquals(egal('', ''), false);
});
