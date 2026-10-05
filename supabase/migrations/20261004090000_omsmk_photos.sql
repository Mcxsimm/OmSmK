-- Photos de chantier : stockage privé, un dossier par équipe (<equipe_id>/<chantier_id>/<photo>.jpg).
-- Seuls les membres de l'équipe peuvent lire, déposer ou supprimer les photos de son dossier.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('omsmk-photos', 'omsmk-photos', false, 5242880, array['image/jpeg'])
on conflict (id) do nothing;

create function omsmk_priv.membre_chemin(p_nom text) returns boolean
language plpgsql stable security definer set search_path = '' as $$
declare
  v_equipe uuid;
begin
  begin
    v_equipe := (storage.foldername(p_nom))[1]::uuid;
  exception when others then
    return false;
  end;
  return omsmk_priv.est_membre(v_equipe);
end;
$$;
revoke all on function omsmk_priv.membre_chemin(text) from public, anon;
grant execute on function omsmk_priv.membre_chemin(text) to authenticated;

create policy "omsmk_photos_lecture" on storage.objects for select to authenticated
  using (bucket_id = 'omsmk-photos' and omsmk_priv.membre_chemin(name));
create policy "omsmk_photos_depot" on storage.objects for insert to authenticated
  with check (bucket_id = 'omsmk-photos' and omsmk_priv.membre_chemin(name));
create policy "omsmk_photos_maj" on storage.objects for update to authenticated
  using (bucket_id = 'omsmk-photos' and omsmk_priv.membre_chemin(name))
  with check (bucket_id = 'omsmk-photos' and omsmk_priv.membre_chemin(name));
create policy "omsmk_photos_suppression" on storage.objects for delete to authenticated
  using (bucket_id = 'omsmk-photos' and omsmk_priv.membre_chemin(name));
