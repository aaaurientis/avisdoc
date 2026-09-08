-- ============================================================================
-- Aperçu PDF des documents Office (PowerPoint) — conversion via un service
-- LibreOffice AUTO-HÉBERGÉ (Gotenberg). On mémorise le chemin du PDF généré
-- pour ne convertir qu'une fois (cache dans le bucket admin-documents).
--
-- À exécuter dans le SQL Editor du projet admin (wtovhzxymlqnfxyjxrdq).
-- ============================================================================

alter table public.admin_documents
  add column if not exists preview_path text;
