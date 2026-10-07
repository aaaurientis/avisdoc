-- ============================================================================
-- Arborescence documentaire : renommage EN CASCADE + réordonnancement.
--
-- Renommer une catégorie ou une sous-catégorie met à jour, dans la même
-- opération, les sous-catégories rattachées et les documents concernés — aucun
-- document ne reste rattaché à un ancien libellé.
-- Le réordonnancement écrit la colonne `position` (ordre d'affichage, 0054).
--
-- SECURITY INVOKER (défaut) → soumis à la RLS (@avisdoc.fr).
-- À exécuter dans le SQL Editor du projet admin (wtovhzxymlqnfxyjxrdq).
-- ============================================================================

-- Renommer une catégorie (niveau 1) : la catégorie, ses sous-catégories, et les
-- documents qui la citent.
create or replace function public.renommer_doc_categorie(p_old text, p_new text)
returns void
language plpgsql
as $$
begin
  update public.admin_doc_types set name = p_new where parent is null and name = p_old;
  update public.admin_doc_types set parent = p_new where parent = p_old;
  update public.admin_documents set cat_parent = p_new where cat_parent = p_old;
end;
$$;

-- Renommer une sous-catégorie (sous un parent donné) + les documents concernés.
create or replace function public.renommer_doc_sous_categorie(p_parent text, p_old text, p_new text)
returns void
language plpgsql
as $$
begin
  update public.admin_doc_types set name = p_new where parent = p_parent and name = p_old;
  update public.admin_documents set cat = p_new where cat_parent = p_parent and cat = p_old;
end;
$$;

-- Réordonner les lignes d'un même niveau : `p_parent` null pour les catégories,
-- sinon le nom de la catégorie parente. `p_names` = l'ordre voulu.
create or replace function public.reordonner_doc_types(p_parent text, p_names text[])
returns void
language plpgsql
as $$
declare
  i int;
begin
  if p_names is null then return; end if;
  for i in 1 .. array_length(p_names, 1) loop
    update public.admin_doc_types
      set position = i * 10
      where coalesce(parent, '') = coalesce(p_parent, '') and name = p_names[i];
  end loop;
end;
$$;
