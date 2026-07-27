-- ============================================================================
-- 0014 — Annuaire réseau : champs structurés par contact
-- ----------------------------------------------------------------------------
-- Chaque valeur a sa colonne au lieu d'être entassée dans name / notes :
-- prénom / nom séparés, n° RPPS, profession et spécialité (Annuaire Santé),
-- structure d'exercice, code postal, source de la fiche. `name` reste le nom
-- d'affichage complet (compat). Additif et idempotent.
-- ============================================================================
alter table public.admin_network_contacts
  add column if not exists prenom      text,
  add column if not exists nom         text,
  add column if not exists rpps        text,
  add column if not exists profession  text,
  add column if not exists specialite  text,
  add column if not exists structure   text,
  add column if not exists code_postal text,
  add column if not exists source      text default 'manuel'; -- manuel | annuaire_sante

create index if not exists idx_admin_network_contacts_rpps
  on public.admin_network_contacts (rpps) where rpps is not null;
