import { assertAlmostEquals, assertEquals } from 'jsr:@std/assert@1';
import { charger } from './charger.js';

const G = charger(['js/calculs.js', 'js/synchro.js', 'js/demo.js'],
  ['personnesEquipe', 'besoinEffectif', 'affectesSemaine', 'idAffectation', 'devisARelancer', 'montantDevis', 'echeanceSituation', 'situationsImpayees', 'etatPreparation', 'documentsEnAttente', 'bilanChantier', 'construireDemo']);

function base() {
  const c = { id: 'c', heuresJour: 7.5, tauxHoraire: 30, dateDebut: '2026-09-28', dateFin: '2026-10-16', marcheHT: 10000,
    planning: { 'A||P1': { debut: '2026-10-05', fin: '2026-10-09' }, 'A||P2': { debut: '2026-10-12', fin: '2026-10-16' } } };
  return {
    chantiers: [c, { id: 'd', heuresJour: 7.5 }],
    ops: [{ id: 'o1', chantierId: 'c', ouvrage: 'A', phase: 'P1', operation: 'Pose', metre: 300, unite: 'm²', cadence: 100, heuresForfait: 0 },
      { id: 'o2', chantierId: 'c', ouvrage: 'A', phase: 'P2', heuresForfait: 37.5 }],
    suivi: [], pointages: [], journal: [], reserves: [], securite: [], pvs: [], postes: [], commandes: [],
    compagnons: [{ id: 'k1', chantierId: 'c', prenom: 'Karim', nom: 'Benali' }, { id: 'k2', chantierId: 'd', prenom: 'karim', nom: 'BENALI' }, { id: 'k3', chantierId: 'c', prenom: 'Lucas', nom: 'Morel' }, { id: 'k4', chantierId: 'c', prenom: 'Ex', nom: 'Parti', actif: false }],
    affectations: [{ id: 'a', chantierId: 'c', personne: 'karim benali', semaine: '2026-10-05', statut: 'chantier' }, { id: 'b', chantierId: 'c', personne: 'lucas morel', semaine: '2026-10-05', statut: 'conge' }],
    situations: [
      { id: 's1', chantierId: 'c', numero: 1, mois: '2026-08', statut: 'facturee', factureeLe: '2026-08-31', pcts: {} },
      { id: 's2', chantierId: 'c', numero: 2, mois: '2026-09', statut: 'payee', factureeLe: '2026-09-30', pcts: {} }
    ],
    devis: [
      { id: 'v1', chantierId: 'c', statut: 'emis', dateEmission: '2026-09-10', relances: [], lignes: [{ quantite: 2, pu: 150 }] },
      { id: 'v2', chantierId: 'c', statut: 'emis', dateEmission: '2026-09-10', relances: ['2026-09-28'], montant: 500 },
      { id: 'v3', chantierId: 'c', statut: 'accepte', dateEmission: '2026-08-01', montant: 900 }
    ],
    documents: [{ id: 'p1', chantierId: 'c', statut: 'diffuse', diffuseLe: '2026-09-01' }, { id: 'p2', chantierId: 'c', statut: 'diffuse', diffuseLe: '2026-10-01' }, { id: 'p3', chantierId: 'c', statut: 'vise', diffuseLe: '2026-08-01' }],
    checklists: { c: { prep: { '0-0': { statut: 'fait' }, '0-1': { statut: 'so' }, '1-0': { statut: 'encours', echeance: '2026-10-01' } } } }
  };
}

Deno.test('plan de charge : personnes dédoublonnées entre chantiers, inactifs exclus', () => {
  const p = G.personnesEquipe(base());
  assertEquals(p.map(x => x.cle), ['karim benali', 'lucas morel']);
  assertEquals(p[0].chantiers, ['c', 'd']);
});

Deno.test('plan de charge : besoin en compagnons par semaine d\'après le planning', () => {
  const b = base();
  // P1 : 300 m² / 100 m²/j × 7,5 h = 22,5 h sur 5 jours → 0,6 compagnon ; P2 : 37,5 h la semaine suivante → 1,0
  assertAlmostEquals(G.besoinEffectif(b, 'c', '2026-10-05', '2026-10-05'), 0.6, 1e-9);
  assertAlmostEquals(G.besoinEffectif(b, 'c', '2026-10-12', '2026-10-05'), 1, 1e-9);
  assertEquals(G.besoinEffectif(b, 'c', '2026-10-19', '2026-10-05'), 0);
  assertEquals(G.affectesSemaine(b, 'c', '2026-10-05'), 1);
  // Phase moitié faite : la moitié restante répartie sur les jours restants
  b.suivi = [{ id: 's', chantierId: 'c', semaine: '2026-10-05', ouvrage: 'A', phase: 'P1', pct: 0.5, heures: 10 }];
  assertAlmostEquals(G.besoinEffectif(b, 'c', '2026-10-05', '2026-10-07'), 0.3, 1e-9);
});

Deno.test('devis : montant par lignes, relance après 15 jours sans réponse', () => {
  const b = base();
  assertEquals(G.montantDevis(b.devis[0]), 300);
  assertEquals(G.devisARelancer(b, 'c', '2026-10-05').map(d => d.id), ['v1']);
  assertEquals(G.devisARelancer(b, 'c', '2026-10-13').map(d => d.id), ['v1', 'v2']);
});

Deno.test('situations impayées : échéance = facturation + délai de paiement', () => {
  const b = base();
  assertEquals(G.echeanceSituation(b.situations[0], b.chantiers[0]), '2026-09-30');
  const imp = G.situationsImpayees(b, 'c', '2026-10-05');
  assertEquals(imp.map(x => x.sit.id), ['s1']);
  assertEquals(imp[0].retard, 5);
  b.chantiers[0].finances = { delai: 45 };
  assertEquals(G.situationsImpayees(b, 'c', '2026-10-05').length, 0);
});

Deno.test('préparation et documents : avancement hors « sans objet », retards, visas en attente', () => {
  const b = base();
  const liste = [{ section: 'A', items: ['x', 'y', 'z'] }, { section: 'B', items: ['u'] }];
  const e = G.etatPreparation(b, 'c', liste, '2026-10-05');
  assertEquals([e.faits, e.total], [1, 3]);
  assertEquals(e.retard.map(i => i.cle), ['1-0']);
  assertEquals(G.documentsEnAttente(b, 'c', '2026-10-05').map(d => d.id), ['p1']);
});

Deno.test('bilan : démo CIGV, cadence constatée et fin réelle', () => {
  const d = G.construireDemo('2026-09-28');
  const b = { chantiers: [d.chantier], ops: d.ops, suivi: d.suivi, pointages: d.pointages, journal: d.journal, reserves: d.reserves, securite: d.securite, postes: d.postes, situations: d.situations, commandes: d.commandes, pvs: [] };
  const bl = G.bilanChantier(b, d.chantier.id, '2026-10-05');
  assertEquals(bl.heures.reel, 85);
  assertEquals(bl.qualite.levees, 1);
  assertEquals(bl.joursIntemperie, 1);
  const pv = bl.phases.find(p => p.phase === 'Pare-vapeur');
  // Opération de référence = plus grand métré (vernis, cadence 490 m²/j) ; productivité = 26,77 h produites ÷ 25 h pointées
  assertEquals(pv.cadenceCible, 490);
  assertAlmostEquals(pv.productivite, pv.budget / 25, 1e-9);
  assertAlmostEquals(pv.cadenceReelle, 490 * pv.budget / 25, 1e-9);
  assertEquals(bl.delai.finReelle <= '2026-10-05', true);
  b.pvs = [{ chantierId: d.chantier.id, type: 'reception', decision: 'avec', date: '2026-10-30' }];
  assertEquals(G.bilanChantier(b, d.chantier.id).delai.finReelle, '2026-10-30');
  assertEquals(G.bilanChantier(b, d.chantier.id).liberationRG, '2027-10-30');
});

Deno.test('démo : identifiants des affectations identiques à ceux de l\'application', () => {
  const d = G.construireDemo('2026-09-28');
  const k = d.compagnons[0];
  assertEquals(d.affectations[0].id, G.idAffectation('karim benali', '2026-09-28'));
  assertEquals(d.affectations[0].personne, G.personnesEquipe({ compagnons: [k] })[0].cle);
});
