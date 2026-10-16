/* ==========================================================================
   OmSmK — sauvegarde automatique de nuit vers Google Drive

   Appelée chaque nuit par le traitement planifié (pg_cron, voir
   supabase/migrations/20261016090000_omsmk_sauvegarde_drive.sql), avec la clé
   d'appel générée dans la base. Elle dépose dans le Drive de l'entreprise :
   - « OmSmK — Sauvegardes automatiques / omsmk_serveur_AAAA-MM-JJ.json » :
     toutes les données des équipes, au format « Restaurer une sauvegarde » de
     l'application (30 copies quotidiennes, puis une par mois pendant 12 mois) ;
   - « … / Photos / <équipe> / <chantier> / » : les nouvelles photos (copie
     incrémentale ; une photo supprimée dans l'application reste sur le Drive).

   Secrets à renseigner une fois (Supabase → Edge Functions → Secrets) :
   GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REFRESH_TOKEN
   (autorisation « drive.file » : la fonction ne voit que ce qu'elle a créé).
   Facultatif : GOOGLE_DRIVE_DOSSIER = identifiant d'un dossier Drive parent.
   ========================================================================== */
import postgres from 'npm:postgres@3.4.4';
import { copiesAPurger, egal, nomCopie, nomDossier, reconstruireBase } from './logique.ts';

const DRIVE = 'https://www.googleapis.com/drive/v3';
const UPLOAD = 'https://www.googleapis.com/upload/drive/v3';
const RACINE = 'OmSmK — Sauvegardes automatiques';
const PHOTOS_PAR_PASSAGE = 150;
const DUREE_MAX_MS = 110_000;

const env = (k: string) => Deno.env.get(k) || '';
const sql = postgres(env('SUPABASE_DB_URL'), { max: 2, prepare: false });

/* ------------------------------------------------------------ Google Drive */
async function jetonGoogle(): Promise<string> {
  const r = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: env('GOOGLE_CLIENT_ID'), client_secret: env('GOOGLE_CLIENT_SECRET'),
      refresh_token: env('GOOGLE_REFRESH_TOKEN'), grant_type: 'refresh_token'
    })
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || !j.access_token) {
    throw new Error(`Autorisation Google refusée (${j.error || r.status}${j.error === 'invalid_grant' ? ' : jeton expiré ou révoqué, à régénérer' : ''})`);
  }
  return j.access_token;
}

class Drive {
  constructor(private jeton: string) {}
  async api(url: string, init: RequestInit = {}): Promise<Response> {
    const r = await fetch(url, { ...init, headers: { Authorization: `Bearer ${this.jeton}`, ...(init.headers || {}) } });
    if (!r.ok) {
      let m = '';
      try { m = (await r.json()).error.message; } catch (_e) { /* corps illisible */ }
      throw new Error(`Google Drive : ${m || r.status}`);
    }
    return r;
  }
  async chercher(q: string): Promise<{ id: string; name: string }[]> {
    const out: { id: string; name: string }[] = [];
    let page = '';
    do {
      const r = await this.api(`${DRIVE}/files?q=${encodeURIComponent(q + ' and trashed=false')}&fields=nextPageToken,files(id,name)&pageSize=1000${page ? '&pageToken=' + page : ''}`);
      const j = await r.json();
      out.push(...(j.files || []));
      page = j.nextPageToken || '';
    } while (page);
    return out;
  }
  async creerDossier(nom: string, parent?: string): Promise<string> {
    const meta: Record<string, unknown> = { name: nom, mimeType: 'application/vnd.google-apps.folder' };
    if (parent) meta.parents = [parent];
    return (await (await this.api(`${DRIVE}/files?fields=id`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(meta) })).json()).id;
  }
  async deposer(nom: string, parent: string, type: string, contenu: Uint8Array): Promise<string> {
    const limite = 'omsmk' + crypto.randomUUID();
    const enc = new TextEncoder();
    const tete = enc.encode(`--${limite}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify({ name: nom, parents: [parent] })}\r\n--${limite}\r\nContent-Type: ${type}\r\n\r\n`);
    const pied = enc.encode(`\r\n--${limite}--`);
    const corps = new Uint8Array(tete.length + contenu.length + pied.length);
    corps.set(tete); corps.set(contenu, tete.length); corps.set(pied, tete.length + contenu.length);
    return (await (await this.api(`${UPLOAD}/files?uploadType=multipart&fields=id`, { method: 'POST', headers: { 'Content-Type': `multipart/related; boundary=${limite}` }, body: corps })).json()).id;
  }
  async supprimer(id: string) { await this.api(`${DRIVE}/files/${id}`, { method: 'DELETE' }); }
  async existe(id: string): Promise<boolean> {
    try {
      const r = await this.api(`${DRIVE}/files/${id}?fields=id,trashed`);
      return !(await r.json()).trashed;
    } catch (_e) { return false; }
  }
}

// Dossier Drive pour un chemin logique (créé au besoin, mémorisé dans la base)
async function dossier(d: Drive, chemin: string[], parentRacine?: string): Promise<string> {
  let parent = parentRacine;
  for (let i = 0; i < chemin.length; i++) {
    const cle = chemin.slice(0, i + 1).join('/');
    const [connu] = await sql`select drive_id from omsmk_priv.sauvegarde_dossiers where chemin = ${cle}`;
    if (connu && (i > 0 || await d.existe(connu.drive_id))) { parent = connu.drive_id; continue; }
    const id = await d.creerDossier(nomDossier(chemin[i]), parent);
    await sql`insert into omsmk_priv.sauvegarde_dossiers (chemin, drive_id) values (${cle}, ${id})
      on conflict (chemin) do update set drive_id = excluded.drive_id`;
    if (i === 0) await sql`delete from omsmk_priv.sauvegarde_dossiers where chemin like ${cle + '/%'}`;
    parent = id;
  }
  return parent as string;
}

/* ------------------------------------------------------------- Sauvegarde */
async function sauvegarder(journalId: number) {
  const debut = Date.now();
  const d = new Drive(await jetonGoogle());
  const parent = env('GOOGLE_DRIVE_DOSSIER') || undefined;
  const racine = await dossier(d, [RACINE], parent);

  // 1. Données : toutes les équipes, au format de l'application
  const equipes = await sql`select id, nom, cree_le from public.omsmk_equipes order by cree_le`;
  const membres = await sql`select equipe_id, email, role from public.omsmk_membres`;
  const lignes = await sql`select equipe_id, id, kind, chantier_id, data, maj, updated_at
    from public.omsmk_records where not supprime order by updated_at`;
  const base = reconstruireBase(lignes as never);
  base.sauvegardeServeur = {
    format: 'omsmk-sauvegarde-serveur', version: 1, date: new Date().toISOString(),
    equipes: equipes.map(e => ({ id: e.id, nom: e.nom, membres: membres.filter(m => m.equipe_id === e.id).map(m => ({ email: m.email, role: m.role })) })),
    enregistrements: lignes.length
  };
  const auj = new Date().toISOString().slice(0, 10);
  const nom = nomCopie(auj);
  const existantes = await d.chercher(`'${racine}' in parents and mimeType='application/json'`);
  for (const f of existantes.filter(f => f.name === nom)) await d.supprimer(f.id);   // relance le même jour : on remplace
  await d.deposer(nom, racine, 'application/json', new TextEncoder().encode(JSON.stringify(base)));
  for (const n of copiesAPurger(existantes.map(f => f.name), auj)) {
    for (const f of existantes.filter(f => f.name === n)) await d.supprimer(f.id).catch(() => { /* sans gravité */ });
  }
  await sql`update omsmk_priv.sauvegarde_journal set equipes = ${equipes.length}, enregistrements = ${lignes.length} where id = ${journalId}`;

  // 2. Photos : copie incrémentale (les vignettes « _t » ne sont pas copiées)
  const aCopier = await sql`select o.name from storage.objects o
    where o.bucket_id = 'omsmk-photos' and o.name not like '%\\_t.jpg'
      and not exists (select 1 from omsmk_priv.sauvegarde_photos p where p.chemin = o.name)
    order by o.created_at`;
  const nomsEquipe = new Map(equipes.map(e => [String(e.id), String(e.nom)]));
  const chantiers = new Map((base.chantiers as { id: string; nom: string }[]).map(c => [String(c.id), String(c.nom || c.id)]));
  const datesPhoto = new Map((base.photos as { id: string; date?: string }[]).map(p => [String(p.id), p.date || '']));
  let copiees = 0;
  for (const o of aCopier.slice(0, PHOTOS_PAR_PASSAGE)) {
    if (Date.now() - debut > DUREE_MAX_MS) break;
    const [eq, ch, fichier] = String(o.name).split('/');
    if (!eq || !ch || !fichier) continue;
    const r = await fetch(`${env('SUPABASE_URL')}/storage/v1/object/omsmk-photos/${o.name.split('/').map(encodeURIComponent).join('/')}`,
      { headers: { Authorization: `Bearer ${env('SUPABASE_SERVICE_ROLE_KEY')}` } });
    if (!r.ok) continue;
    const contenu = new Uint8Array(await r.arrayBuffer());
    const cible = await dossier(d, [RACINE, 'Photos', `${nomsEquipe.get(eq) || 'Équipe'} (${eq.slice(0, 8)})`, `${chantiers.get(ch) || 'Chantier'} (${ch.slice(0, 8)})`], parent);
    const idPhoto = fichier.replace(/\.jpg$/, '');
    const id = await d.deposer(`${datesPhoto.get(idPhoto) ? datesPhoto.get(idPhoto) + '_' : ''}${fichier}`, cible, 'image/jpeg', contenu);
    await sql`insert into omsmk_priv.sauvegarde_photos (chemin, drive_id) values (${o.name}, ${id}) on conflict (chemin) do nothing`;
    copiees++;
  }
  const restantes = aCopier.length - copiees;
  await sql`update omsmk_priv.sauvegarde_journal set fin = now(), statut = ${restantes ? 'partielle' : 'ok'},
    photos = ${copiees}, photos_restantes = ${restantes},
    message = ${restantes ? `${restantes} photo(s) seront copiées lors des prochaines sauvegardes` : null}
    where id = ${journalId}`;
}

/* ----------------------------------------------------------------- Entrée */
Deno.serve(async req => {
  if (req.method !== 'POST') return new Response('Méthode non autorisée', { status: 405 });
  const [cfg] = await sql`select cle from omsmk_priv.sauvegarde_config where id = 1`;
  if (!cfg || !egal(req.headers.get('x-sauvegarde-cle') || '', cfg.cle)) return new Response('Non autorisé', { status: 401 });

  const manquants = ['GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET', 'GOOGLE_REFRESH_TOKEN'].filter(k => !env(k));
  const [j] = await sql`insert into omsmk_priv.sauvegarde_journal default values returning id`;
  if (manquants.length) {
    const message = `Google Drive non configuré : secrets manquants (${manquants.join(', ')})`;
    await sql`update omsmk_priv.sauvegarde_journal set fin = now(), statut = 'erreur', message = ${message} where id = ${j.id}`;
    return Response.json({ ok: false, message }, { status: 503 });
  }
  const tache = sauvegarder(j.id).catch(async e => {
    console.error(e);
    await sql`update omsmk_priv.sauvegarde_journal set fin = now(), statut = 'erreur', message = ${String(e?.message || e).slice(0, 500)} where id = ${j.id}`;
  });
  // La sauvegarde continue après la réponse : l'appel planifié n'attend pas la fin
  // deno-lint-ignore no-explicit-any
  const rt = (globalThis as any).EdgeRuntime;
  if (rt?.waitUntil) { rt.waitUntil(tache); return Response.json({ ok: true, journal: j.id }, { status: 202 }); }
  await tache;
  return Response.json({ ok: true, journal: j.id });
});
