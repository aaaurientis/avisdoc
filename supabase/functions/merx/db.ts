// Accès aux tables de Merx (migration 0022), avec la clé de service : la fonction agit pour le compte du
// commercial APRÈS avoir vérifié son jeton et son domaine dans index.ts. La RLS reste en place pour tout
// ce qui vient du navigateur.

import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import type { Score } from "./scoring.ts";
import type { SiteContacts } from "./site-contacts.ts";

export const admin = (): SupabaseClient =>
  createClient(Deno.env.get("SUPABASE_URL") ?? "", Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "", {
    auth: { persistSession: false },
  });

const STALE_MINUTES = 5; // une demande « en cours » depuis plus longtemps est reprise (exécution coupée)

export interface Demande {
  id: string;
  kind: "recherche" | "approfondissement";
  request: string;
  prospectId: string | null;
  conversationId: string | null;
  requestedBy: string;
}

export interface LightProspect {
  name: string;
  city: string | null;
  department: string | null;
  activity: string | null;
  sector: string;
  website: string | null;
  rationale: string | null;
  sources: string[];
  score: Score;
  scoreTotal: number;
}

/** Prend une demande : celle indiquée, ou la plus ancienne en attente. Rend null s'il n'y a rien à faire. */
export async function claimRequest(sb: SupabaseClient, id?: string): Promise<Demande | null> {
  const stale = new Date(Date.now() - STALE_MINUTES * 60_000).toISOString();
  let q = sb
    .from("admin_merx_demandes")
    .select("id, kind, request, prospect_id, conversation_id, requested_by, status, started_at")
    .or(`status.eq.en_attente,and(status.eq.en_cours,started_at.lt.${stale})`)
    .order("created_at", { ascending: true })
    .limit(1);
  if (id) q = q.eq("id", id);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  const row = data?.[0];
  if (!row) return null;

  // Prise atomique : personne d'autre ne doit traiter la même demande.
  const { data: claimed, error: e2 } = await sb
    .from("admin_merx_demandes")
    .update({ status: "en_cours", started_at: new Date().toISOString() })
    .eq("id", row.id)
    .eq("status", row.status)
    .select("id")
    .maybeSingle();
  if (e2) throw new Error(e2.message);
  if (!claimed) return null;

  return {
    id: row.id,
    kind: row.kind,
    request: row.request,
    prospectId: row.prospect_id,
    conversationId: row.conversation_id,
    requestedBy: row.requested_by,
  };
}

/**
 * Enregistre les fiches trouvées ; celles déjà connues ne sont pas recréées. Rend le nombre ajouté.
 *
 * L'unicité est posée sur `lower(name)` et `lower(city)` (migration 0022) : c'est un index d'EXPRESSION,
 * que `on conflict (colonnes)` ne sait pas viser. On écarte donc les doublons avant d'écrire, puis on
 * insère fiche par fiche — le volume est faible (dix au plus) et une fiche refusée n'emporte pas les autres.
 */
export async function insertLightProspects(sb: SupabaseClient, demandeId: string, owner: string, prospects: LightProspect[]): Promise<number> {
  if (!prospects.length) return 0;

  const clef = (nom: string, ville: string | null) => `${nom.trim().toLowerCase()}|${(ville ?? "").trim().toLowerCase()}`;
  const { data: connus } = await sb.from("admin_prospects").select("name, city");
  const dejaLa = new Set((connus ?? []).map((r: { name: string; city: string | null }) => clef(r.name, r.city)));

  let ajoutes = 0;
  for (const p of prospects) {
    if (dejaLa.has(clef(p.name, p.city))) continue;
    dejaLa.add(clef(p.name, p.city));
    const { error } = await sb.from("admin_prospects").insert({
      found_by: demandeId,
      owner_email: owner,
      name: p.name,
      city: p.city,
      department: p.department,
      activity: p.activity,
      sector: p.sector,
      website: p.website,
      rationale: p.rationale,
      sources: p.sources,
      score: p.score,
      score_total: p.scoreTotal,
    });
    // Une fiche créée entre-temps par une autre recherche : ce n'est pas une erreur.
    if (error && !/duplicate key|unique constraint/i.test(error.message)) throw new Error(error.message);
    if (!error) ajoutes++;
  }
  return ajoutes;
}

export async function listFoundNames(sb: SupabaseClient, demandeId: string): Promise<string[]> {
  const { data } = await sb.from("admin_prospects").select("name").eq("found_by", demandeId).order("score_total", { ascending: false });
  return (data ?? []).map((r: { name: string }) => r.name);
}

export interface ProspectToEnrich {
  id: string;
  name: string;
  city: string | null;
  activity: string | null;
  website: string | null;
  department: string | null;
  score: Score;
}

export async function getProspectForEnrichment(sb: SupabaseClient, id: string): Promise<ProspectToEnrich | null> {
  const { data, error } = await sb.from("admin_prospects").select("id, name, city, activity, website, department, score").eq("id", id).maybeSingle();
  if (error) throw new Error(error.message);
  return data as ProspectToEnrich | null;
}

export interface Enrichment {
  siren: string | null;
  legalName: string | null;
  headcountBand: string | null;
  headcountYear: number | null;
  openEstablishments: number | null;
  headOffice: unknown;
  leaders: unknown;
  website: string | null;
  contactName: string | null;
  contactRole: string | null;
  contactEmail: string | null;
  contactPhone: string | null;
  contactSource: string | null;
  siteContacts: SiteContacts | null;
  approach: string | null;
  sources: string[];
  score: Score;
  scoreTotal: number;
}

/** Un approfondissement n'efface jamais une donnée déjà là : chaque champ vide laisse l'ancien en place. */
export async function saveEnrichment(sb: SupabaseClient, id: string, e: Enrichment): Promise<void> {
  const { data: before } = await sb.from("admin_prospects").select("sources").eq("id", id).maybeSingle();
  const sources = [...new Set([...((before?.sources as string[]) ?? []), ...e.sources])];
  const patch: Record<string, unknown> = {
    siren: e.siren,
    legal_name: e.legalName,
    headcount_band: e.headcountBand,
    headcount_year: e.headcountYear,
    open_establishments: e.openEstablishments,
    head_office: e.headOffice,
    leaders: e.leaders,
    website: e.website,
    contact_name: e.contactName,
    contact_role: e.contactRole,
    contact_email: e.contactEmail,
    contact_phone: e.contactPhone,
    contact_source: e.contactSource,
    site_contacts: e.siteContacts,
    approach: e.approach,
    sources,
    score: e.score,
    score_total: e.scoreTotal,
    enriched_at: new Date().toISOString(),
  };
  for (const k of Object.keys(patch)) if (patch[k] === null || patch[k] === undefined) delete patch[k];
  const { error } = await sb.from("admin_prospects").update(patch).eq("id", id);
  if (error) throw new Error(error.message);
}

export async function finishRequest(
  sb: SupabaseClient,
  id: string,
  r: { foundCount: number; message: string | null; usage: unknown; model?: string },
): Promise<void> {
  await sb
    .from("admin_merx_demandes")
    .update({
      status: "terminee",
      found_count: r.foundCount,
      message: r.message,
      usage: r.usage,
      model: r.model ?? null,
      finished_at: new Date().toISOString(),
    })
    .eq("id", id);
}

export async function failRequest(sb: SupabaseClient, id: string, message: string, usage: unknown, mdl?: string): Promise<void> {
  await sb
    .from("admin_merx_demandes")
    .update({ status: "echec", message, usage, model: mdl ?? null, finished_at: new Date().toISOString() })
    .eq("id", id);
}

/** Ajoute un message à une conversation (ce que Merx écrit à la fin d'une recherche). */
export async function appendConversationMessage(sb: SupabaseClient, conversationId: string, message: { role: string; content: string }): Promise<void> {
  const { data } = await sb.from("admin_merx_conversations").select("messages").eq("id", conversationId).maybeSingle();
  const messages = [...(((data?.messages as unknown[]) ?? []) as unknown[]), { ...message, at: new Date().toISOString() }];
  await sb.from("admin_merx_conversations").update({ messages }).eq("id", conversationId);
}
