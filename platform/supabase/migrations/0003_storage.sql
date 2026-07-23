-- ============================================================================
-- AvisDoc — Plateforme client · Storage
-- ----------------------------------------------------------------------------
-- Trois buckets. Convention de chemin : {client_id}/{fichier}.
--   logos             (privé)  : logos téléversés par l'admin. Lu par le service.
--   documents-public  (public) : documents de niveau 'public', lien direct.
--   documents-client  (privé)  : documents de niveau 'client', cloisonnés.
-- Aucun bucket pour 'hds' : ces documents ne transitent jamais par ici.
-- ============================================================================

insert into storage.buckets (id, name, public)
values
  ('logos',            'logos',            false),
  ('documents-public', 'documents-public', true),
  ('documents-client', 'documents-client', false)
on conflict (id) do nothing;

-- ----------------------------------------------------------------------------
-- logos : admin uniquement (le service_role contourne la RLS).
-- ----------------------------------------------------------------------------
drop policy if exists logos_admin on storage.objects;
create policy logos_admin on storage.objects
  for all to authenticated
  using (bucket_id = 'logos' and is_admin())
  with check (bucket_id = 'logos' and is_admin());

-- ----------------------------------------------------------------------------
-- documents-public : lecture par tous (anon inclus).
-- ----------------------------------------------------------------------------
drop policy if exists docs_public_lecture on storage.objects;
create policy docs_public_lecture on storage.objects
  for select to anon, authenticated
  using (bucket_id = 'documents-public');

-- ----------------------------------------------------------------------------
-- documents-client : lecture par l'utilisateur rattaché au client dont l'id
-- est le premier segment du chemin ; plus l'admin.
-- ----------------------------------------------------------------------------
drop policy if exists docs_client_lecture on storage.objects;
create policy docs_client_lecture on storage.objects
  for select to authenticated
  using (
    bucket_id = 'documents-client'
    and (
      is_admin()
      or (storage.foldername(name))[1] = current_client_id()::text
    )
  );
