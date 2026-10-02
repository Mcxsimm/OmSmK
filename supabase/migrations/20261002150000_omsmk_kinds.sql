-- Types d'enregistrements synchronisés : contrôle de format plutôt qu'une liste figée,
-- pour que de nouveaux objets (commandes, situations, postes du marché…) ne nécessitent pas de migration.
alter table public.omsmk_records drop constraint omsmk_records_kind_check;
alter table public.omsmk_records add constraint omsmk_records_kind_check check (kind ~ '^[a-z]{2,20}$');
