-- Clés d'accès au connecteur MCP du Hub (réseau d'aval), gérées dans Admin (décision du 16/11).
-- La clé n'est montrée qu'une fois, à sa création ; seule son empreinte SHA-256 est gardée.
-- Lecture réservée au droit « admin » ; création et révocation passent par la fonction mcp-cles.

create table if not exists public.admin_mcp_cles (
  id                    uuid primary key default gen_random_uuid(),
  nom                   text not null check (length(nom) between 1 and 80),
  empreinte             text not null unique,               -- SHA-256 (hex) de la clé
  debut                 text not null,                       -- premiers caractères, pour la reconnaître
  cree_par              text not null,
  cree_le               timestamptz not null default now(),
  derniere_utilisation  timestamptz,
  revoquee_le           timestamptz,
  revoquee_par          text
);

alter table public.admin_mcp_cles enable row level security;
drop policy if exists "mcp_cles_lecture" on public.admin_mcp_cles;
create policy "mcp_cles_lecture" on public.admin_mcp_cles for select to authenticated
  using (public.a_le_module('admin'));

comment on table public.admin_mcp_cles is
  'Clés du connecteur MCP du Hub (Cowork…). Empreinte seulement ; création et révocation par la fonction mcp-cles.';
