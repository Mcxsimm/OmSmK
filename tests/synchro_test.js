import { assert, assertEquals } from 'jsr:@std/assert@1';
import { charger } from './charger.js';

const S = charger(['js/synchro.js'], ['calculerEnvois', 'validerEnvois', 'appliquerDistants', 'collecterEnregistrements', 'empreinteObjet']);

const vide = () => ({ chantiers: [], ops: [], suivi: [], taches: [], journal: [], reserves: [], checklists: {} });
const clone = o => JSON.parse(JSON.stringify(o));

// Simule le serveur : la version la plus récente (maj) gagne, horodatage croissant
function serveur() {
  const lignes = new Map();
  let horloge = 0;
  return {
    pousser(envois) {
      envois.forEach(e => {
        const ex = lignes.get(e.id);
        if (ex && e.maj < ex.maj) return;
        lignes.set(e.id, { equipe_id: e.equipeId, id: e.id, kind: e.kind, chantier_id: e.chantier_id, data: clone(e.data), maj: e.maj, supprime: e.supprime, updated_at: ++horloge });
      });
    },
    depuis(t) { return [...lignes.values()].filter(l => l.updated_at > t).sort((a, b) => a.updated_at - b.updated_at); },
    lignes
  };
}

// Un appareil : sa base locale, son état de synchronisation, un cycle envoi puis réception
function appareil(srv) {
  const a = { base: vide(), snap: {}, curseur: 0 };
  a.sync = (t) => {
    const { envois, empreintes } = S.calculerEnvois(a.base, a.snap, t);
    srv.pousser(envois);
    S.validerEnvois(a.snap, envois, empreintes);
    const recus = srv.depuis(a.curseur);
    const n = S.appliquerDistants(a.base, a.snap, recus);
    if (recus.length) a.curseur = recus[recus.length - 1].updated_at;
    return n;
  };
  return a;
}

function chantierPartage(base) {
  base.chantiers.push({ id: 'c1', nom: 'Chantier A', equipeId: 'eq1' });
  base.taches.push({ id: 't1', chantierId: 'c1', zone: 'T01', tache: 'Vernis', fait: false });
  base.taches.push({ id: 't2', chantierId: 'c1', zone: 'T01', tache: 'Isolant', fait: false });
  base.checklists.c1 = { cdt: {} };
}

Deno.test('seuls les chantiers rattachés à une équipe sont synchronisés', () => {
  const b = vide();
  chantierPartage(b);
  b.chantiers.push({ id: 'c2', nom: 'Local' });
  b.taches.push({ id: 't9', chantierId: 'c2', zone: 'Z', tache: 'X' });
  const ids = S.collecterEnregistrements(b).map(r => r.id).sort();
  assertEquals(ids, ['c1', 'cl|c1', 't1', 't2']);
});

Deno.test('un chantier partagé arrive sur un second appareil', () => {
  const srv = serveur();
  const A = appareil(srv), B = appareil(srv);
  chantierPartage(A.base);
  A.sync(1000);
  const n = B.sync(1001);
  assertEquals(n, 4);
  assertEquals(B.base.chantiers[0].nom, 'Chantier A');
  assertEquals(B.base.taches.length, 2);
  assertEquals(B.base.checklists.c1, { cdt: {}, _m: 1000 });
  // Rien de plus à envoyer ensuite
  assertEquals(S.calculerEnvois(B.base, B.snap, 1002).envois.length, 0);
});

Deno.test('modifications de deux appareils sur des objets différents : les deux sont conservées', () => {
  const srv = serveur();
  const A = appareil(srv), B = appareil(srv);
  chantierPartage(A.base); A.sync(1000); B.sync(1001);
  A.base.taches[0].fait = true;           // A coche t1
  B.base.taches[1].fait = true;           // B coche t2
  A.sync(2000); B.sync(2001); A.sync(2002);
  for (const X of [A, B]) assertEquals(X.base.taches.map(t => t.fait), [true, true]);
});

Deno.test('conflit sur le même objet : la modification la plus récente gagne partout', () => {
  const srv = serveur();
  const A = appareil(srv), B = appareil(srv);
  chantierPartage(A.base); A.sync(1000); B.sync(1001);
  A.base.taches[0].obs = 'version A';
  B.base.taches[0].obs = 'version B';
  A.sync(2000);   // A envoie à 2000
  B.sync(3000);   // B, plus récent, écrase
  A.sync(3001);
  assertEquals(A.base.taches[0].obs, 'version B');
  assertEquals(B.base.taches[0].obs, 'version B');
});

Deno.test('une modification locale non envoyée n\'est pas écrasée par la réception', () => {
  const srv = serveur();
  const A = appareil(srv), B = appareil(srv);
  chantierPartage(A.base); A.sync(1000); B.sync(1001);
  B.base.taches[0].obs = 'distant';
  B.sync(2000);
  A.base.taches[0].obs = 'local en cours';           // saisie locale pas encore envoyée
  const recus = srv.depuis(A.curseur);
  S.appliquerDistants(A.base, A.snap, recus);           // réception seule
  assertEquals(A.base.taches[0].obs, 'local en cours');
});

Deno.test('suppression : propagée aux autres appareils', () => {
  const srv = serveur();
  const A = appareil(srv), B = appareil(srv);
  chantierPartage(A.base); A.sync(1000); B.sync(1001);
  A.base.taches = A.base.taches.filter(t => t.id !== 't2');
  A.sync(2000); B.sync(2001);
  assertEquals(B.base.taches.map(t => t.id), ['t1']);
  assert(srv.lignes.get('t2').supprime);
});

Deno.test('après réinitialisation de l\'état, les données plus récentes du serveur ne sont pas écrasées', () => {
  const srv = serveur();
  const A = appareil(srv), B = appareil(srv);
  chantierPartage(A.base); A.sync(1000); B.sync(1001);
  B.base.taches[0].obs = 'récent'; B.sync(5000);
  A.snap = {}; A.curseur = 0;                            // ex. reconnexion
  A.sync(6000);
  assertEquals(A.base.taches[0].obs, 'récent');
  assertEquals(srv.lignes.get('t1').data.obs, 'récent');
});

Deno.test('l\'empreinte ignore l\'horodatage _m', () => {
  assertEquals(S.empreinteObjet({ a: 1, _m: 5 }), S.empreinteObjet({ a: 1, _m: 9 }));
  assert(S.empreinteObjet({ a: 1 }) !== S.empreinteObjet({ a: 2 }));
});
