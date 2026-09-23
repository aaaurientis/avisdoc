-- Une note dictée se jette comme le reste : à la corbeille, trente jours.
--
-- Elle partait définitivement, alors que prospects, affaires et fiches clients
-- transitent tous par la corbeille. Une incohérence qui se paie cher le jour où
-- quelqu'un efface la mauvaise ligne.

alter table public.admin_notes_dictees
  add column if not exists deleted_at timestamptz;

create index if not exists admin_notes_dictees_corbeille_idx
  on public.admin_notes_dictees (deleted_at)
  where deleted_at is not null;
