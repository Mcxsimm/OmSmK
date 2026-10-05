import { assertEquals } from 'jsr:@std/assert@1';
import { charger } from './charger.js';

const G = charger(['js/calculs.js', 'js/synchro.js', 'js/drive.js'], ['fusionnerBases', 'empreintesBase', 'copiesAPurger']);
const copie = o => JSON.parse(JSON.stringify(o));

function base() {
  return {
    version: 1,
    chantiers: [{ id: 'c1', nom: 'CIGV', otp: '6001234' }],
    pointages: [{ id: 'p1', chantierId: 'c1', date: '2026-10-01', statut: 'present' }],
    commandes: [],
    checklists: { c1: { cdt: { a: 1 } } }
  };
}

Deno.test('Drive : première synchronisation, rien en ligne → tout est envoyé', () => {
  const l = base();
  const f = G.fusionnerBases(l, { chantiers: [] }, {});
  assertEquals(f.base.chantiers.length, 1);
  assertEquals(f.recus, 0);
  assertEquals(f.base.checklists.c1, l.checklists.c1);
});

Deno.test('Drive : nouvel appareil vide → il reçoit tout', () => {
  const d = base();
  const f = G.fusionnerBases({ version: 1, chantiers: [], pointages: [], commandes: [], checklists: {} }, d, {});
  assertEquals(f.base, d);
  assertEquals(f.recus, 3);
});

Deno.test('Drive : saisies sur le PC et sur le téléphone, objets différents → les deux sont gardées', () => {
  const ref = base();
  const snap = G.empreintesBase(ref);
  const pc = copie(ref), tel = copie(ref);
  pc.commandes.push({ id: 'k1', chantierId: 'c1', fournisseur: 'Soprema' });
  pc.chantiers[0].nom = 'CIGV — Phase 1';
  tel.pointages.push({ id: 'p2', chantierId: 'c1', date: '2026-10-02', statut: 'present' });
  const f = G.fusionnerBases(tel, pc, snap);
  assertEquals(f.base.chantiers[0].nom, 'CIGV — Phase 1');
  assertEquals(f.base.pointages.map(p => p.id), ['p1', 'p2']);
  assertEquals(f.base.commandes.map(k => k.id), ['k1']);
  assertEquals([f.recus, f.conflits], [2, 0]);
  // L'autre appareil, avec le nouvel état, n'a plus rien à recevoir
  const g = G.fusionnerBases(copie(f.base), copie(f.base), f.snap);
  assertEquals([g.recus, g.envoyes], [0, 0]);
});

Deno.test('Drive : suppressions propagées dans les deux sens', () => {
  const ref = base();
  ref.commandes.push({ id: 'k1', chantierId: 'c1' });
  const snap = G.empreintesBase(ref);
  const local = copie(ref), distant = copie(ref);
  local.pointages = [];                 // supprimé sur cet appareil
  distant.commandes = [];               // supprimé sur l'autre appareil
  delete distant.checklists.c1;
  const f = G.fusionnerBases(local, distant, snap);
  assertEquals(f.base.pointages, []);
  assertEquals(f.base.commandes, []);
  assertEquals(f.base.checklists, {});
});

Deno.test('Drive : même objet modifié des deux côtés → version de l\'appareil, conflit signalé', () => {
  const ref = base();
  const snap = G.empreintesBase(ref);
  const local = copie(ref), distant = copie(ref);
  local.chantiers[0].otp = 'A';
  distant.chantiers[0].otp = 'B';
  const f = G.fusionnerBases(local, distant, snap);
  assertEquals(f.base.chantiers[0].otp, 'A');
  assertEquals(f.conflits, 1);
  // Supprimé ici mais modifié ailleurs : l'objet revient
  const l2 = copie(ref); l2.pointages = [];
  const d2 = copie(ref); d2.pointages[0].statut = 'conges';
  assertEquals(G.fusionnerBases(l2, d2, snap).base.pointages[0].statut, 'conges');
});

Deno.test('Drive : après effacement de l\'appareil (état oublié), les données du Drive reviennent', () => {
  const d = base();
  const f = G.fusionnerBases({ version: 1, chantiers: [], checklists: {} }, d, {});
  assertEquals(f.base.chantiers.length, 1);
  assertEquals(f.base.pointages.length, 1);
});

Deno.test('Drive : copies datées au-delà de 30 jours à supprimer', () => {
  assertEquals(G.copiesAPurger(['omsmk_2026-08-01.json', 'omsmk_2026-09-10.json', 'omsmk_donnees.json', 'autre.json'], '2026-10-05'), ['omsmk_2026-08-01.json']);
});
