-- ============================================================================
-- Temps réel (Supabase Realtime) pour le back-office.
--
-- Ajoute les tables admin_* à la publication `supabase_realtime` : les sessions
-- abonnées reçoivent en direct les INSERT / UPDATE / DELETE. La RLS déjà en
-- place s'applique (seuls les comptes @avisdoc.fr reçoivent les événements).
--
-- Idempotent : ne rajoute une table que si elle n'est pas déjà publiée.
-- À exécuter dans le SQL Editor du projet admin (wtovhzxymlqnfxyjxrdq).
-- ============================================================================

do $$
declare
  t text;
  tables text[] := array[
    'admin_network_contacts', 'admin_clients', 'admin_client_contacts',
    'admin_client_docs', 'admin_suivis', 'admin_documents',
    'admin_doc_types', 'admin_activity'
  ];
begin
  foreach t in array tables loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I;', t);
    end if;
  end loop;
end $$;
