-- ============================================================================
-- OmSmK : sauvegarde automatique de nuit vers Google Drive (en plus de Supabase)
-- Chaque nuit, le traitement planifié appelle la fonction « sauvegarde-drive »,
-- qui dépose dans le Drive de l'entreprise une copie complète des données des
-- équipes (JSON restaurable dans l'application) et les nouvelles photos.
-- Les identifiants Google sont des secrets de la fonction, jamais dans la base.
-- ============================================================================

create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;

-- Clé d'appel du traitement planifié (générée ici, ne quitte jamais le serveur)
create table omsmk_priv.sauvegarde_config (
  id int primary key default 1 check (id = 1),
  cle text not null default encode(extensions.gen_random_bytes(32), 'hex')
);
insert into omsmk_priv.sauvegarde_config (id) values (1) on conflict (id) do nothing;

-- Journal des sauvegardes
create table omsmk_priv.sauvegarde_journal (
  id bigint generated always as identity primary key,
  debut timestamptz not null default now(),
  fin timestamptz,
  statut text not null default 'en_cours' check (statut in ('en_cours', 'ok', 'partielle', 'erreur')),
  equipes int not null default 0,
  enregistrements int not null default 0,
  photos int not null default 0,
  photos_restantes int not null default 0,
  message text
);

-- Dossiers Drive déjà créés (chemin logique → identifiant Drive) et photos déjà copiées
create table omsmk_priv.sauvegarde_dossiers (
  chemin text primary key,
  drive_id text not null
);
create table omsmk_priv.sauvegarde_photos (
  chemin text primary key,
  drive_id text not null,
  copie_le timestamptz not null default now()
);

alter table omsmk_priv.sauvegarde_config enable row level security;
alter table omsmk_priv.sauvegarde_journal enable row level security;
alter table omsmk_priv.sauvegarde_dossiers enable row level security;
alter table omsmk_priv.sauvegarde_photos enable row level security;
revoke all on omsmk_priv.sauvegarde_config, omsmk_priv.sauvegarde_journal, omsmk_priv.sauvegarde_dossiers, omsmk_priv.sauvegarde_photos
  from public, anon, authenticated;

-- État de la dernière sauvegarde, lisible par les membres d'une équipe (aucune donnée sensible)
create function public.omsmk_etat_sauvegarde() returns jsonb
language sql stable security definer set search_path = '' as $$
  select case when exists (select 1 from public.omsmk_membres m where m.user_id = (select auth.uid())) then (
    select jsonb_build_object(
      'derniere', (select to_jsonb(j) - 'id' from omsmk_priv.sauvegarde_journal j order by j.debut desc limit 1),
      'derniere_reussie', (select max(j.fin) from omsmk_priv.sauvegarde_journal j where j.statut in ('ok', 'partielle'))
    )
  ) end;
$$;
revoke all on function public.omsmk_etat_sauvegarde() from public, anon;
grant execute on function public.omsmk_etat_sauvegarde() to authenticated;

-- Traitement planifié : chaque nuit à 2 h 30 UTC (3 h 30 ou 4 h 30, heure de Paris)
select cron.schedule('omsmk-sauvegarde-drive', '30 2 * * *', $job$
  select net.http_post(
    url := 'https://pykyvpxxwsegxbqhvxvu.supabase.co/functions/v1/sauvegarde-drive',
    headers := jsonb_build_object('Content-Type', 'application/json',
      'x-sauvegarde-cle', (select cle from omsmk_priv.sauvegarde_config where id = 1)),
    body := '{}'::jsonb,
    timeout_milliseconds := 30000
  );
$job$);
