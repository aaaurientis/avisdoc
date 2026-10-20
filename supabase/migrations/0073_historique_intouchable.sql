-- L'historique d'une fiche est intouchable (décision de la direction, 20/10).
--
-- Une action faite, une note, un compte rendu : une fois enregistrés, on ne les
-- modifie plus et on ne les efface plus. On peut seulement AJOUTER une précision à la
-- suite du texte (« — Ajout du 20 octobre (Olivier) : … »).
--
-- Ce qui reste libre :
--   - une action PROGRAMMÉE, pas encore faite (prevu et traite_le vide) : elle se
--     déplace, s'annule (elle reste alors dans l'historique, « Annulé ») ou se clôt
--     par son compte rendu ;
--   - les champs techniques : rappel envoyé, colonne d'avant un rendez-vous ;
--   - le rattachement à une fiche (prospect, affaire, fiche client) : une fiche client
--     annulée rend son historique à l'affaire (0040) ;
--   - la destruction d'une fiche entière depuis la corbeille : ses lignes partent avec
--     elle (suppression en cascade, pg_trigger_depth() > 1).

create or replace function public.admin_echanges_intouchable()
returns trigger
language plpgsql
as $$
begin
  -- Programmée et pas encore faite : rien n'est encore figé.
  if old.prevu and old.traite_le is null then
    return case when tg_op = 'DELETE' then old else new end;
  end if;

  if tg_op = 'DELETE' then
    -- La fiche elle-même est détruite (corbeille) : ses lignes partent avec elle.
    if pg_trigger_depth() > 1 then
      return old;
    end if;
    raise exception 'L''historique ne s''efface pas : ajoutez une précision à la suite.';
  end if;

  if new.kind is distinct from old.kind
     or new.titre is distinct from old.titre
     or new.au is distinct from old.au
     or new.par is distinct from old.par
     or new.avec is distinct from old.avec
     or new.resultat is distinct from old.resultat
     or new.prevu is distinct from old.prevu
     or new.traite_le is distinct from old.traite_le
     or new.rdv_mode is distinct from old.rdv_mode
     or new.rdv_lien is distinct from old.rdv_lien
     or new.created_at is distinct from old.created_at
     -- Le texte ne fait que s'allonger : l'ancien reste mot pour mot au début.
     or (old.detail is not null and (new.detail is null or left(new.detail, length(old.detail)) <> old.detail))
  then
    raise exception 'L''historique ne se modifie pas : ajoutez une précision à la suite.';
  end if;

  return new;
end;
$$;

drop trigger if exists admin_echanges_intouchable on public.admin_echanges;
create trigger admin_echanges_intouchable
  before update or delete on public.admin_echanges
  for each row execute function public.admin_echanges_intouchable();

-- Ajouter une précision à la suite, sur le texte tel qu'il est en base À CET INSTANT :
-- deux personnes peuvent compléter la même action sans se gêner.
create or replace function public.admin_echanges_ajouter_precision(p_id uuid, p_ajout text)
returns void
language sql
security invoker
as $$
  update public.admin_echanges
     set detail = case when coalesce(detail, '') ~ '\S' then detail || E'\n\n' || p_ajout else coalesce(detail, '') || p_ajout end
   where id = p_id;
$$;

grant execute on function public.admin_echanges_ajouter_precision(uuid, text) to authenticated;
