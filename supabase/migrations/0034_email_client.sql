-- Un e-mail de Merx peut viser une FICHE CLIENT, pas seulement un prospect.
--
-- L'ancienne règle liait tout e-mail à un prospect. Écrire à quelqu'un qui est déjà
-- client était donc refusé en silence : le message sortait, mais la demande n'était
-- jamais enregistrée — et son coût jamais compté.

alter table public.admin_merx_demandes
  add column if not exists account_id uuid references public.admin_accounts(id) on delete set null;

alter table public.admin_merx_demandes
  drop constraint if exists admin_merx_demandes_check;

alter table public.admin_merx_demandes
  add constraint admin_merx_demandes_check check (
    -- Une recherche ne vise personne en particulier.
    (kind = 'recherche' and prospect_id is null and account_id is null)
    -- On n'approfondit qu'un prospect.
    or (kind = 'approfondissement' and prospect_id is not null)
    -- Un e-mail s'adresse à un prospect OU à un client.
    or (kind = 'email' and (prospect_id is not null or account_id is not null))
  );

create index if not exists admin_merx_demandes_account_idx
  on public.admin_merx_demandes (account_id)
  where account_id is not null;
