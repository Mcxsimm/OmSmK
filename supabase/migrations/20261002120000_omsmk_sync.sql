-- ============================================================================
-- OmSmK : synchronisation multi-appareils
-- Équipes, membres (comptes Supabase Auth par e-mail), invitations et
-- enregistrements synchronisés (un enregistrement = un objet de l'application :
-- chantier, opération BTE, saisie hebdo, tâche, journal, réserve, check-list).
-- Résolution des conflits : la modification la plus récente gagne (colonne maj).
-- ============================================================================

create schema if not exists omsmk_priv;
revoke all on schema omsmk_priv from public, anon;
grant usage on schema omsmk_priv to authenticated;

-- ---------------------------------------------------------------- tables
create table public.omsmk_equipes (
  id uuid primary key default gen_random_uuid(),
  nom text not null check (char_length(nom) between 1 and 120),
  cree_par uuid references auth.users (id) on delete set null,
  cree_le timestamptz not null default now()
);

create table public.omsmk_membres (
  equipe_id uuid not null references public.omsmk_equipes (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  email text not null,
  role text not null default 'membre' check (role in ('admin', 'membre')),
  ajoute_le timestamptz not null default now(),
  primary key (equipe_id, user_id)
);
create index omsmk_membres_user_idx on public.omsmk_membres (user_id);

create table public.omsmk_invitations (
  equipe_id uuid not null references public.omsmk_equipes (id) on delete cascade,
  email text not null check (email = lower(email) and position('@' in email) > 1),
  role text not null default 'membre' check (role in ('admin', 'membre')),
  invite_par uuid default auth.uid() references auth.users (id) on delete set null,
  invite_le timestamptz not null default now(),
  acceptee_le timestamptz,
  primary key (equipe_id, email)
);
create index omsmk_invitations_email_idx on public.omsmk_invitations (email);

create table public.omsmk_records (
  equipe_id uuid not null references public.omsmk_equipes (id) on delete cascade,
  id text not null check (char_length(id) between 1 and 200),
  kind text not null check (kind in ('chantier', 'op', 'suivi', 'tache', 'journal', 'reserve', 'checklist')),
  chantier_id text,
  data jsonb,
  maj bigint not null,
  supprime boolean not null default false,
  updated_at timestamptz not null default clock_timestamp(),
  updated_by uuid default auth.uid(),
  primary key (equipe_id, id)
);
create index omsmk_records_pull_idx on public.omsmk_records (equipe_id, updated_at);

-- ------------------------------------------------------- fonctions internes
create function omsmk_priv.est_membre(p_equipe uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.omsmk_membres m
    where m.equipe_id = p_equipe and m.user_id = (select auth.uid())
  );
$$;

create function omsmk_priv.est_admin(p_equipe uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.omsmk_membres m
    where m.equipe_id = p_equipe and m.user_id = (select auth.uid()) and m.role = 'admin'
  );
$$;

revoke all on function omsmk_priv.est_membre(uuid), omsmk_priv.est_admin(uuid) from public, anon;
grant execute on function omsmk_priv.est_membre(uuid), omsmk_priv.est_admin(uuid) to authenticated;

-- Horodatage serveur (curseur de synchronisation) et auteur
create function omsmk_priv.records_touch() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.updated_at := clock_timestamp();
  new.updated_by := auth.uid();
  return new;
end;
$$;
create trigger omsmk_records_touch before insert or update on public.omsmk_records
  for each row execute function omsmk_priv.records_touch();

-- ------------------------------------------------------------ RPC publiques
-- Créer une équipe : le créateur en devient administrateur
create function public.omsmk_creer_equipe(p_nom text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_id uuid;
begin
  if auth.uid() is null then raise exception 'Connexion requise'; end if;
  insert into public.omsmk_equipes (nom, cree_par) values (trim(p_nom), auth.uid()) returning id into v_id;
  insert into public.omsmk_membres (equipe_id, user_id, email, role)
    values (v_id, auth.uid(), lower(coalesce(auth.jwt() ->> 'email', '')), 'admin');
  return v_id;
end;
$$;

-- Rejoindre les équipes où l'e-mail (vérifié par la connexion) a été invité.
-- Les invitations acceptées sont conservées (historique) et marquées.
create function public.omsmk_accepter_invitations() returns integer
language plpgsql security definer set search_path = '' as $$
declare
  v_email text := lower(coalesce(auth.jwt() ->> 'email', ''));
  v_n integer;
begin
  if auth.uid() is null or v_email = '' then return 0; end if;
  insert into public.omsmk_membres (equipe_id, user_id, email, role)
    select i.equipe_id, auth.uid(), v_email, i.role
    from public.omsmk_invitations i where i.email = v_email and i.acceptee_le is null
    on conflict (equipe_id, user_id) do nothing;
  get diagnostics v_n = row_count;
  update public.omsmk_invitations set acceptee_le = now() where email = v_email and acceptee_le is null;
  return v_n;
end;
$$;

-- Envoi d'un lot d'enregistrements : la version la plus récente (maj) gagne
create function public.omsmk_push(p_equipe uuid, p_recs jsonb) returns integer
language plpgsql security invoker set search_path = '' as $$
declare
  v_n integer;
begin
  if not omsmk_priv.est_membre(p_equipe) then raise exception 'Accès refusé à cette équipe'; end if;
  insert into public.omsmk_records as r (equipe_id, id, kind, chantier_id, data, maj, supprime)
    select p_equipe, x.id, x.kind, x.chantier_id, x.data, x.maj, coalesce(x.supprime, false)
    from jsonb_to_recordset(p_recs) as x (id text, kind text, chantier_id text, data jsonb, maj bigint, supprime boolean)
  on conflict (equipe_id, id) do update
    set kind = excluded.kind, chantier_id = excluded.chantier_id, data = excluded.data,
        maj = excluded.maj, supprime = excluded.supprime
    where excluded.maj >= r.maj;
  get diagnostics v_n = row_count;
  return v_n;
end;
$$;

revoke all on function public.omsmk_creer_equipe(text), public.omsmk_accepter_invitations(), public.omsmk_push(uuid, jsonb) from public, anon;
grant execute on function public.omsmk_creer_equipe(text), public.omsmk_accepter_invitations(), public.omsmk_push(uuid, jsonb) to authenticated;

-- ------------------------------------------------------------------- RLS
alter table public.omsmk_equipes enable row level security;
alter table public.omsmk_membres enable row level security;
alter table public.omsmk_invitations enable row level security;
alter table public.omsmk_records enable row level security;

revoke all on public.omsmk_equipes, public.omsmk_membres, public.omsmk_invitations, public.omsmk_records from anon, authenticated;
grant select, update on public.omsmk_equipes to authenticated;
grant select, update, delete on public.omsmk_membres to authenticated;
grant select, insert, delete on public.omsmk_invitations to authenticated;
grant select, insert, update on public.omsmk_records to authenticated;

create policy "equipes_lecture_membres" on public.omsmk_equipes for select to authenticated
  using (omsmk_priv.est_membre(id));
create policy "equipes_modif_admin" on public.omsmk_equipes for update to authenticated
  using (omsmk_priv.est_admin(id)) with check (omsmk_priv.est_admin(id));

create policy "membres_lecture_membres" on public.omsmk_membres for select to authenticated
  using (omsmk_priv.est_membre(equipe_id));
create policy "membres_role_admin" on public.omsmk_membres for update to authenticated
  using (omsmk_priv.est_admin(equipe_id)) with check (omsmk_priv.est_admin(equipe_id));
create policy "membres_retrait_admin_ou_soi" on public.omsmk_membres for delete to authenticated
  using (omsmk_priv.est_admin(equipe_id) or user_id = (select auth.uid()));

create policy "invitations_lecture_membres" on public.omsmk_invitations for select to authenticated
  using (omsmk_priv.est_membre(equipe_id));
create policy "invitations_creation_admin" on public.omsmk_invitations for insert to authenticated
  with check (omsmk_priv.est_admin(equipe_id));
create policy "invitations_annulation_admin" on public.omsmk_invitations for delete to authenticated
  using (omsmk_priv.est_admin(equipe_id));

-- Pas de suppression physique des données : une suppression est un enregistrement « supprime = true »
create policy "records_lecture_membres" on public.omsmk_records for select to authenticated
  using (omsmk_priv.est_membre(equipe_id));
create policy "records_ajout_membres" on public.omsmk_records for insert to authenticated
  with check (omsmk_priv.est_membre(equipe_id));
create policy "records_modif_membres" on public.omsmk_records for update to authenticated
  using (omsmk_priv.est_membre(equipe_id)) with check (omsmk_priv.est_membre(equipe_id));

-- Temps réel : les autres appareils sont prévenus des changements
alter publication supabase_realtime add table public.omsmk_records;
