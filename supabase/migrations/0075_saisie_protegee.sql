-- Ce qu'un commercial a saisi à la main sur une fiche, Merx n'y touche plus (Olivier, 21/10 :
-- « tout ce qu'il a mis à la main, tu n'y touches pas ; le reste, tu peux changer »).
--
-- La base retient elle-même QUELLES cases ont été remplies ou corrigées à la main : toute
-- modification faite depuis l'écran (rôle « authenticated ») ajoute la colonne changée à
-- champs_saisis (à la création ou à l'import : toutes les cases remplies). Une modification faite par Merx ou FullEnrich (rôle « service_role ») ne
-- peut plus changer ces colonnes : la base remet l'ancienne valeur. Les personnes et les
-- coordonnées du site sont fusionnées par le code (on y ajoute, on n'enlève rien).
--
-- Les modifications faites dans le SQL Editor (ni l'un ni l'autre) ne sont pas concernées.
-- Avant cette migration, rien ne disait qui avait rempli quoi : seules les corrections
-- faites à partir de maintenant sont protégées par ce mécanisme.

alter table public.admin_prospects
  add column if not exists champs_saisis text[] not null default '{}';

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
        if (apres->c) is not null and (apres->c) <> 'null'::jsonb and not (c = any(new.champs_saisis)) then
          new.champs_saisis := array_append(new.champs_saisis, c);
        end if;
      end loop;
    end if;
    return new;
  end if;
  avant := to_jsonb(old);
  if role_appel = 'authenticated' then
    foreach c in array suivis loop
      if (apres->c) is distinct from (avant->c) and not (c = any(new.champs_saisis)) then
        new.champs_saisis := array_append(new.champs_saisis, c);
      end if;
    end loop;
  elsif role_appel = 'service_role' then
    foreach c in array old.champs_saisis loop
      if c not in ('personnes', 'site_contacts') and (apres ? c) and (apres->c) is distinct from (avant->c) then
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
