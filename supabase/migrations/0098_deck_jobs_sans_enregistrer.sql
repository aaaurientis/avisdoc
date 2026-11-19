-- Mise à la charte « sans enregistrer » (décision du 19/11) : on dépose un PPTX, on télécharge le
-- résultat, rien n'est rangé dans Documents. Le fichier transite par admin-documents/_charte-temp/
-- (invisible dans la liste, qui lit admin_documents) ; le service efface la source après
-- traitement et le Hub efface le résultat une fois téléchargé.

alter table public.admin_deck_jobs alter column document_id drop not null;
alter table public.admin_deck_jobs add column if not exists source_path text;
alter table public.admin_deck_jobs add column if not exists source_nom text;
alter table public.admin_deck_jobs add column if not exists resultat_path text;

alter table public.admin_deck_jobs drop constraint if exists deck_jobs_source;
alter table public.admin_deck_jobs add constraint deck_jobs_source
  check (document_id is not null or (source_path is not null and source_path like '\_charte-temp/%'));
