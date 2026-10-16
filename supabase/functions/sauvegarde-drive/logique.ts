/* Sauvegarde automatique vers Google Drive : logique pure (testée dans tests/). */

// Type d'enregistrement en ligne → collection de la base de l'application (identique à js/synchro.js)
export const COLLECTIONS: Record<string, string> = {
  op: 'ops', suivi: 'suivi', tache: 'taches', journal: 'journal', reserve: 'reserves', poste: 'postes', situation: 'situations',
  commande: 'commandes', compagnon: 'compagnons', pointage: 'pointages', contact: 'contacts', reunion: 'reunions', action: 'actions',
  securite: 'securite', photo: 'photos', pv: 'pvs', affectation: 'affectations', devis: 'devis', document: 'documents', cout: 'couts'
};

export interface Ligne { id: string; kind: string; chantier_id: string | null; data: unknown }
// deno-lint-ignore no-explicit-any
export type Base = Record<string, any>;

/* Reconstruit une base au format de l'application (celui de « Restaurer une sauvegarde »)
   à partir des enregistrements en ligne. Les types inconnus sont rangés à part pour ne rien perdre. */
export function reconstruireBase(lignes: Ligne[]): Base {
  const base: Base = { version: 1, chantiers: [], checklists: {} };
  Object.values(COLLECTIONS).forEach(c => { base[c] = []; });
  const autres: Ligne[] = [];
  for (const l of lignes) {
    if (l.data === null || l.data === undefined) continue;
    if (l.kind === 'chantier') base.chantiers.push(l.data);
    else if (l.kind === 'checklist') base.checklists[l.id.replace(/^cl\|/, '')] = l.data;
    else if (COLLECTIONS[l.kind]) base[COLLECTIONS[l.kind]].push(l.data);
    else autres.push(l);
  }
  if (autres.length) base.enregistrementsNonClasses = autres;
  return base;
}

export const PREFIXE = 'omsmk_serveur_';
export const nomCopie = (jour: string) => `${PREFIXE}${jour}.json`;

/* Copies à supprimer : on garde les 30 derniers jours, puis la première copie de chaque mois pendant 12 mois. */
export function copiesAPurger(noms: string[], auj: string, jours = 30, mois = 12): string[] {
  const t = Date.parse(auj + 'T00:00:00Z');
  const limiteJours = new Date(t - jours * 86400000).toISOString().slice(0, 10);
  const d = new Date(t);
  const limiteMois = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - mois, 1)).toISOString().slice(0, 7);
  const re = new RegExp(`^${PREFIXE}(\\d{4}-\\d{2}-\\d{2})\\.json$`);
  const dates = noms.map(n => re.exec(n)).filter((m): m is RegExpExecArray => !!m).map(m => m[1]).sort();
  const premiereDuMois = new Map<string, string>();
  dates.forEach(j => { if (!premiereDuMois.has(j.slice(0, 7))) premiereDuMois.set(j.slice(0, 7), j); });
  return dates.filter(j => {
    if (j >= limiteJours) return false;
    if (premiereDuMois.get(j.slice(0, 7)) === j && j.slice(0, 7) >= limiteMois) return false;
    return true;
  }).map(nomCopie);
}

// Nom de dossier Drive lisible et sans caractère gênant
export function nomDossier(s: string): string {
  return Array.from(String(s || '')).filter(c => c >= ' ').join('').replace(/[\\/:*?"<>|]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 100) || 'Sans nom';
}

// Comparaison à temps constant (clé d'appel du traitement planifié)
export function egal(a: string, b: string): boolean {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length || !a.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}
