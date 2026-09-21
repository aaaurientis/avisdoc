-- ============================================================================
-- 0025 — Notes dictées (le dictaphone du commercial)
-- ----------------------------------------------------------------------------
-- Le commercial dicte depuis son téléphone, à la sortie d'un rendez-vous.
-- L'audio est déposé dans un compartiment privé ; Merx le relira plus tard pour
-- en tirer un compte rendu et le ranger dans la bonne fiche (client ou prospect),
-- après validation humaine — rien ne s'écrit tout seul.
--
-- L'audio est effacé une fois la note transcrite et validée : on garde le texte,
-- pas la voix.
--
-- À exécuter dans le SQL Editor du projet admin (wtovhzxymlqnfxyjxrdq).
-- ============================================================================

create table if not exists public.admin_notes_dictees (
  id           uuid primary key default gen_random_uuid(),
  owner_email  text not null,
  -- Chemin de l'audio dans le compartiment `admin-dictee` ; vidé quand l'audio est effacé.
  audio_path   text,
  duree_s      int,
  statut       text not null default 'recue'
    check (statut in ('recue', 'transcrite', 'classee', 'echec')),
  message      text,                       -- motif d'un échec, en clair
  -- Ce que Merx en tire (étape suivante) : rien n'est écrit sans validation.
  transcription text,
  titre        text,
  compte_rendu text,
  prochaine_action      text,
  prochaine_action_date date,
  -- La fiche à laquelle la note se rattache, une fois validée.
  cible_type   text check (cible_type in ('client', 'prospect')),
  cible_id     uuid,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index if not exists idx_notes_dictees_owner
  on public.admin_notes_dictees (lower(owner_email), created_at desc);

drop trigger if exists trg_notes_dictees_updated on public.admin_notes_dictees;
create trigger trg_notes_dictees_updated
  before update on public.admin_notes_dictees
  for each row execute function public.set_updated_at();

-- ----------------------------------------------------------------------------
-- Sécurité — une note appartient à celui qui l'a dictée.
-- ----------------------------------------------------------------------------
alter table public.admin_notes_dictees enable row level security;

drop policy if exists "notes_dictees_proprietaire" on public.admin_notes_dictees;
create policy "notes_dictees_proprietaire" on public.admin_notes_dictees
  for all to authenticated
  using (
    public.is_avisdoc_user()
    and lower(owner_email) = lower(coalesce(auth.jwt() ->> 'email', ''))
  )
  with check (
    public.is_avisdoc_user()
    and lower(owner_email) = lower(coalesce(auth.jwt() ->> 'email', ''))
  );

-- ----------------------------------------------------------------------------
-- Le compartiment audio, privé, sur le modèle de `admin-documents`.
-- ----------------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('admin-dictee', 'admin-dictee', false)
on conflict (id) do nothing;

drop policy if exists "avisdoc_read_dictee" on storage.objects;
create policy "avisdoc_read_dictee" on storage.objects
  for select to authenticated
  using (bucket_id = 'admin-dictee' and public.is_avisdoc_user());

drop policy if exists "avisdoc_write_dictee" on storage.objects;
create policy "avisdoc_write_dictee" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'admin-dictee' and public.is_avisdoc_user());

drop policy if exists "avisdoc_delete_dictee" on storage.objects;
create policy "avisdoc_delete_dictee" on storage.objects
  for delete to authenticated
  using (bucket_id = 'admin-dictee' and public.is_avisdoc_user());
