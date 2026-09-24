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
  kind: "recherche" | "approfondissement" | "completion";
  request: string;
  prospectId: string | null;
  conversationId: string | null;
  requestedBy: string;
}

export interface LightProspect {
  name: string;
  /** L'identifiant légal : sans lui, aucune fiche n'est vérifiable ni dédoublonnable. */
  siren?: string | null;
  /**
   * Ce que la recherche sait désormais remplir sans rien deviner : le dirigeant publié
   * au registre, le standard et le site trouvés par la fiche d'établissement, l'adresse
   * exacte, l'effectif. Une fiche sans numéro à composer ne sert à personne.
   */
  contactName?: string | null;
  contactRole?: string | null;
  contactPhone?: string | null;
  contactEmail?: string | null;
  contactSource?: string | null;
  headOffice?: unknown;
  leaders?: unknown;
  /** Tout ce que le registre publie, conservé tel quel — on ne jette plus rien. */
  registre?: unknown;
  /** Peut-on croire ce que la fiche avance ? Null quand il n'y a rien à noter. */
  fiabilite?: { note: number; details: unknown } | null;
  headcountBand?: string | null;
  headcountYear?: number | null;
  openEstablishments?: number | null;
  city: string | null;
  department: string | null;
  activity: string | null;
  sector: string;
  website: string | null;
  rationale: string | null;
  sources: string[];
  score: Score;
  scoreTotal: number | null;
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
/**
 * Le secteur d'une fiche est son MÉTIER, écrit tel qu'il est.
 *
 * Il n'y a jamais eu de raison de le restreindre : une usine automobile a autant le
 * droit de faire dépister ses salariés qu'une entreprise de terrassement. La colonne
 * portait pourtant une liste fermée de cinq valeurs — le jour où le code en a proposé
 * une sixième, la base a refusé chaque fiche, et deux cent cinquante entreprises
 * trouvées au registre ne sont jamais entrées.
 *
 * La migration 0041 lève cette limite. On n'écrit donc plus « autre » à la place du
 * vrai métier ; le repli ci-dessous ne sert qu'à ne pas écrire une valeur vide.
 */
const secteurSur = (secteur: string): string => secteur.trim() || "Non précisé";

export async function insertLightProspects(sb: SupabaseClient, demandeId: string, owner: string, prospects: LightProspect[]): Promise<number> {
  if (!prospects.length) return 0;

  // On compare sur un nom RÉDUIT : sans accents, sans ponctuation, sans forme juridique.
  // « Jardin Eau Bois », « JARDIN-EAU-BOIS » et « Jardin Eau Bois SARL » sont la même maison.
  const nu = (t: string) =>
    t
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/\b(sarl|sas|sasu|eurl|sa|sci|scop|snc|earl|gaec|ets|etablissements?)\b/g, " ")
      .replace(/[^a-z0-9]+/g, " ")
      .trim();
  const chiffres = (t: string | null) => (t ?? "").replace(/\D/g, "");

  // Une entreprise déjà connue peut l'être N'IMPORTE OÙ : en prospection, au Pipeline ou
  // au fichier client. La chercher dans les seuls prospects laissait passer les doublons.
  const [enProspection, auPipeline, auFichier] = await Promise.all([
    sb.from("admin_prospects").select("name, city, siren"),
    sb.from("admin_clients").select("company, ville, siren"),
    sb.from("admin_accounts").select("name"),
  ]);

  const connus: { nom: string; ville: string; siren: string }[] = [
    ...(enProspection.data ?? []).map((r) => ({ nom: nu(r.name as string), ville: nu((r.city as string) ?? ""), siren: chiffres(r.siren as string) })),
    ...(auPipeline.data ?? []).map((r) => ({ nom: nu(r.company as string), ville: nu((r.ville as string) ?? ""), siren: chiffres(r.siren as string) })),
    ...(auFichier.data ?? []).map((r) => ({ nom: nu(r.name as string), ville: "", siren: "" })),
  ];

  /**
   * Même nom : c'est la même entreprise, SAUF si les deux villes sont connues et
   * différentes. Une ville manquante d'un côté ne suffit pas à en faire deux maisons —
   * c'est précisément ce qui avait laissé passer un doublon d'ONETIP.
   */
  const dejaConnue = (nom: string, ville: string | null, siren: string | null) => {
    const n = nu(nom);
    const v = nu(ville ?? "");
    const s = chiffres(siren);
    return connus.some((c) => {
      if (s && c.siren && s === c.siren) return true;
      if (c.nom !== n) return false;
      return !(v && c.ville && v !== c.ville);
    });
  };

  let ajoutes = 0;
  for (const p of prospects) {
    if (dejaConnue(p.name, p.city, null)) continue;
    connus.push({ nom: nu(p.name), ville: nu(p.city ?? ""), siren: "" });
    const ligne = (secteur: string) => ({
      found_by: demandeId,
      owner_email: owner,
      name: p.name,
      city: p.city,
      department: p.department,
      activity: p.activity,
      sector: secteur,
      website: p.website,
      rationale: p.rationale,
      sources: p.sources,
      score: p.score,
      score_total: p.scoreTotal,
      siren: p.siren ?? null,
      contact_name: p.contactName ?? null,
      contact_role: p.contactRole ?? null,
      contact_phone: p.contactPhone ?? null,
      contact_email: p.contactEmail ?? null,
      contact_source: p.contactSource ?? null,
      head_office: p.headOffice ?? null,
      leaders: p.leaders ?? null,
      registre: p.registre ?? null,
      reliability: p.fiabilite?.note ?? null,
      reliability_detail: p.fiabilite?.details ?? null,
      headcount_band: p.headcountBand ?? null,
      headcount_year: p.headcountYear ?? null,
      open_establishments: p.openEstablishments ?? null,
    });

    let { error } = await sb.from("admin_prospects").insert(ligne(secteurSur(p.sector)));

    // Tant que la migration 0047 n'est pas collée, la colonne « registre » n'existe
    // pas et la base refuse toute la ligne. Une fiche sans ce complément vaut mieux
    // qu'une recherche qui ne rend rien.
    if (error && /registre|reliability/i.test(error.message)) {
      const sansRegistre = ligne(secteurSur(p.sector)) as Record<string, unknown>;
      delete sansRegistre.registre;
      delete sansRegistre.reliability;
      delete sansRegistre.reliability_detail;
      ({ error } = await sb.from("admin_prospects").insert(sansRegistre));
    }


    // Tant que la migration 0041 n'est pas collée, la base refuse tout métier qui
    // n'est pas dans son ancienne liste. On réessaie alors sous « autre » — non pas
    // parce que c'est juste, mais parce qu'une fiche rangée approximativement vaut
    // mieux qu'une entreprise qui n'apparaît nulle part. Une fois la migration passée,
    // ce rattrapage ne sert plus jamais et le vrai métier est conservé.
    if (error && /sector/i.test(error.message)) {
      ({ error } = await sb.from("admin_prospects").insert(ligne("autre")));
    }

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

/** La fiche telle qu'elle est, pour la compléter sans rien effacer. */
export async function loadProspect(
  sb: SupabaseClient,
  id: string,
): Promise<{ name: string; city: string | null; siren: string | null; website: string | null; contactName: string | null; contactEmail: string | null; contactPhone: string | null } | null> {
  const { data, error } = await sb
    .from("admin_prospects")
    .select("name, city, siren, website, contact_name, contact_email, contact_phone")
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return null;
  const r = data as Record<string, string | null>;
  return {
    name: r.name ?? "",
    city: r.city,
    siren: r.siren,
    website: r.website,
    contactName: r.contact_name,
    contactEmail: r.contact_email,
    contactPhone: r.contact_phone,
  };
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
  /** Le dossier commercial : ce qu'il faut pour décrocher son téléphone. */
  dossier: unknown;
  sources: string[];
  score: Score;
  scoreTotal: number;
}

/** Un approfondissement n'efface jamais une donnée déjà là : chaque champ vide laisse l'ancien en place. */
/**
 * Ce qu'on complète sur une fiche existante, sans modèle.
 *
 * On n'écrase jamais une information déjà présente : `coalesce` côté base garderait
 * l'ancienne, mais Supabase n'en offre pas l'équivalent — on ne transmet donc que les
 * champs réellement trouvés, et l'appelant décide de ce qu'il envoie.
 */
export async function completeProspect(
  sb: SupabaseClient,
  id: string,
  e: {
    siren: string | null;
    legalName: string | null;
    headcountBand: string | null;
    headcountYear: number | null;
    openEstablishments: number | null;
    headOffice: unknown;
    leaders: unknown;
    registre: unknown;
    website: string | null;
    contactName: string | null;
    contactRole: string | null;
    contactPhone: string | null;
    contactEmail: string | null;
    contactSource: string | null;
    reliability: number | null;
    reliabilityDetail: unknown;
  },
): Promise<void> {
  const patch: Record<string, unknown> = {
    siren: e.siren,
    legal_name: e.legalName,
    headcount_band: e.headcountBand,
    headcount_year: e.headcountYear,
    open_establishments: e.openEstablishments,
    head_office: e.headOffice,
    leaders: e.leaders,
    registre: e.registre,
    website: e.website,
    contact_name: e.contactName,
    contact_role: e.contactRole,
    contact_phone: e.contactPhone,
    contact_email: e.contactEmail,
    contact_source: e.contactSource,
    reliability: e.reliability,
    reliability_detail: e.reliabilityDetail,
  };
  for (const k of Object.keys(patch)) if (patch[k] === null || patch[k] === undefined) delete patch[k];
  const { error } = await sb.from("admin_prospects").update(patch).eq("id", id);
  if (error) throw new Error(error.message);
}

export async function saveEnrichment(sb: SupabaseClient, id: string, e: Enrichment): Promise<void> {
  const { data: before } = await sb.from("admin_prospects").select("sources, score, dossier").eq("id", id).maybeSingle();
  const sources = [...new Set([...((before?.sources as string[]) ?? []), ...e.sources])];

  // ── Ce qui a été trouvé une fois ne se reperd pas ────────────────────────
  //
  // Un second approfondissement peut tomber sur moins de choses que le premier :
  // un site en panne, une page retirée, une recherche moins chanceuse. Il ne doit
  // pas pour autant effacer ce qu'on savait.

  /** Un dossier sans rien dedans n'est pas un dossier : il ne remplace pas le précédent. */
  const dossierUtile = (d: unknown): boolean => {
    if (!d || typeof d !== "object") return false;
    const o = d as Record<string, unknown>;
    const texte = (v: unknown) => typeof v === "string" && v.trim().length > 0;
    const liste = (v: unknown) => Array.isArray(v) && v.length > 0;
    return texte(o.accroche) || texte(o.qui_aborder) || texte(o.offre) || liste(o.a_retenir) || liste(o.arguments) || liste(o.objections);
  };
  const dossier = dossierUtile(e.dossier) ? e.dossier : dossierUtile(before?.dossier) ? (before?.dossier as unknown) : null;

  // La note se fusionne critère par critère : un critère qu'on n'a pas su juger
  // cette fois garde son jugement d'avant, et le total suit.
  const ancienScore = (before?.score ?? {}) as Record<string, { points: number | null; justification?: string }>;
  const nouveauScore = e.score as unknown as Record<string, { points: number | null; justification?: string }>;
  const scoreFusionne: Record<string, unknown> = { ...ancienScore };
  for (const [critere, valeur] of Object.entries(nouveauScore)) {
    const avant = ancienScore[critere];
    const vaut = valeur && (valeur.points !== null || (valeur.justification ?? "").trim().length > 0);
    const valaitAvant = avant && (avant.points !== null || (avant.justification ?? "").trim().length > 0);
    // On ne remplace un jugement établi que par un autre jugement établi.
    if (vaut || !valaitAvant) scoreFusionne[critere] = valeur;
  }
  const totalFusionne = Object.values(scoreFusionne).reduce(
    (somme: number, c) => somme + ((c as { points: number | null } | undefined)?.points ?? 0),
    0,
  );
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
    dossier,
    sources,
    score: scoreFusionne,
    score_total: totalFusionne,
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
