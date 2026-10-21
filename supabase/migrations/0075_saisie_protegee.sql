-- Ce qu'un commercial a saisi à la main sur une fiche, Merx n'y touche plus (Olivier, 21/10 :
-- « tout ce qu'il a mis à la main, tu n'y touches pas ; le reste, tu peux changer »).
--
-- La base retient elle-même QUELLES cases ont été remplies ou corrigées à la main : toute
-- modification faite depuis l'écran (rôle « authenticated ») ajoute la colonne changée à
-- champs_saisis (à la création ou à l'import : toutes les cases remplies). Une modification faite par Merx ou FullEnrich (rôle « service_role ») ne
-- peut plus changer ces colonnes : la base remet l'ancienne valeur. Les personnes et les
-- coordonnées du site saisies sont fusionnées (on y ajoute, on n'enlève rien) — par la base
-- aussi, au cas où le commercial écrit pendant qu'un approfondissement tourne. Une case
-- vidée à la main redevient libre.
--
-- Les modifications faites dans le SQL Editor (ni l'un ni l'autre) ne sont pas concernées.
-- Avant cette migration, rien ne disait qui avait rempli quoi : seules les corrections
-- faites à partir de maintenant sont protégées par ce mécanisme.

alter table public.admin_prospects
  add column if not exists champs_saisis text[] not null default '{}';

-- Une case vide (rien, « », [], {}) n'est pas une saisie : le formulaire en envoie pour les
-- cases qu'on n'a pas remplies, et Merx doit pouvoir les remplir ensuite.
create or replace function public.admin_jsonb_vide(v jsonb)
returns boolean
language sql
immutable
as $$
  select v is null or v = 'null'::jsonb or v = '[]'::jsonb or v = '{}'::jsonb
      or (jsonb_typeof(v) = 'string' and btrim(v #>> '{}') = '');
$$;

create or replace function public.admin_prospects_saisie_protegee()
returns trigger
language plpgsql
as $$
declare
  role_appel text := coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb->>'role', '');
  suivis constant text[] := array[
    'name', 'siren', 'sector', 'activity', 'headcount_band', 'city', 'department', 'head_office',
    'website', 'leaders', 'contact_name', 'contact_role', 'contact_email', 'contact_phone',
    'personnes', 'site_contacts', 'rationale', 'referent'
  ];
  c text;
  avant jsonb;
  apres jsonb := to_jsonb(new);
begin
  -- Une fiche créée ou importée depuis l'écran : tout ce qu'elle porte a été saisi.
  if tg_op = 'INSERT' then
    if role_appel = 'authenticated' then
      foreach c in array suivis loop
        if not public.admin_jsonb_vide(apres->c) and not (c = any(new.champs_saisis)) then
          new.champs_saisis := array_append(new.champs_saisis, c);
        end if;
      end loop;
    end if;
    return new;
  end if;
  avant := to_jsonb(old);
  if role_appel = 'authenticated' then
    foreach c in array suivis loop
      if (apres->c) is distinct from (avant->c) then
        if public.admin_jsonb_vide(apres->c) then
          -- Vidée à la main : Merx pourra la remplir de nouveau.
          new.champs_saisis := array_remove(new.champs_saisis, c);
        elsif not (c = any(new.champs_saisis)) then
          new.champs_saisis := array_append(new.champs_saisis, c);
        end if;
      end if;
    end loop;
  elsif role_appel = 'service_role' then
    foreach c in array old.champs_saisis loop
      if c = 'head_office' and jsonb_typeof(avant->c) = 'object' and jsonb_typeof(apres->c) = 'object' then
        -- L'adresse : ce qui a été saisi reste, les cases restées vides peuvent se remplir.
        apres := jsonb_set(apres, array[c], (apres->c) || jsonb_strip_nulls(avant->c));
      elsif c = 'personnes' and jsonb_typeof(avant->c) = 'array' then
        -- Les personnes saisies restent toutes, telles quelles ; Merx n'ajoute que des nouvelles.
        apres := jsonb_set(apres, array[c], (avant->c) || coalesce((
          select jsonb_agg(q) from jsonb_array_elements(case when jsonb_typeof(apres->c) = 'array' then apres->c else '[]'::jsonb end) q
          where not exists (
            select 1 from jsonb_array_elements(avant->c) o
            where lower(btrim(o->>'nom')) = lower(btrim(q->>'nom'))
          )
        ), '[]'::jsonb));
      elsif c = 'site_contacts' and jsonb_typeof(avant->c) = 'object' then
        -- Les numéros et adresses saisis restent en tête ; ceux de Merx s'ajoutent après.
        apres := jsonb_set(apres, array[c], coalesce(case when jsonb_typeof(apres->c) = 'object' then apres->c end, avant->c) || jsonb_build_object(
          'phones', coalesce((select jsonb_agg(distinct_v) from (
            select v as distinct_v from (
              select v, min(ord) ord from (
                select v, ord from jsonb_array_elements(coalesce(avant->c->'phones', '[]')) with ordinality t(v, ord)
                union all
                select v, ord + 1000 from jsonb_array_elements(coalesce(apres->c->'phones', '[]')) with ordinality t(v, ord)
              ) u group by v
            ) w order by ord
          ) x), '[]'::jsonb),
          'emails', coalesce((select jsonb_agg(distinct_v) from (
            select v as distinct_v from (
              select v, min(ord) ord from (
                select v, ord from jsonb_array_elements(coalesce(avant->c->'emails', '[]')) with ordinality t(v, ord)
                union all
                select v, ord + 1000 from jsonb_array_elements(coalesce(apres->c->'emails', '[]')) with ordinality t(v, ord)
              ) u group by v
            ) w order by ord
          ) x), '[]'::jsonb)
        ));
      elsif c not in ('personnes', 'site_contacts') and (apres ? c) and (apres->c) is distinct from (avant->c) then
        apres := jsonb_set(apres, array[c], coalesce(avant->c, 'null'::jsonb));
      end if;
    end loop;
    new := jsonb_populate_record(new, apres);
    new.champs_saisis := old.champs_saisis;
  end if;
  return new;
end;
$$;

drop trigger if exists admin_prospects_saisie_protegee on public.admin_prospects;
create trigger admin_prospects_saisie_protegee
  before insert or update on public.admin_prospects
  for each row execute function public.admin_prospects_saisie_protegee();

notify pgrst, 'reload schema';
