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
  siteContacts?: unknown;
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

export async function insertLightProspects(
  sb: SupabaseClient,
  demandeId: string,
  owner: string,
  prospects: LightProspect[],
  /** Agences d'une société : connue seulement si MÊME nom ET MÊME ville (sinon c'est une autre agence). */
  options: { parVille?: boolean } = {},
): Promise<number> {
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
    sb.from("admin_prospects").select("name, city, siren, siret:registre->>siret"),
    sb.from("admin_clients").select("company, ville, siren"),
    sb.from("admin_accounts").select("name"),
  ]);
  // Sans la liste des fiches existantes, on ne sait pas ce qui serait un doublon : on n'écrit rien.
  const lecture = [enProspection, auPipeline, auFichier].find((r) => r.error)?.error;
  if (lecture) throw new Error(`Lecture des fiches existantes impossible : ${lecture.message}`);

  const connus: { nom: string; ville: string; siren: string; siret?: string }[] = [
    ...(enProspection.data ?? []).map((r) => ({
      nom: nu(r.name as string),
      ville: nu((r.city as string) ?? ""),
      siren: chiffres(r.siren as string),
      siret: chiffres((r as { siret?: string | null }).siret ?? null),
    })),
    ...(auPipeline.data ?? []).map((r) => ({ nom: nu(r.company as string), ville: nu((r.ville as string) ?? ""), siren: chiffres(r.siren as string) })),
    ...(auFichier.data ?? []).map((r) => ({ nom: nu(r.name as string), ville: "", siren: "" })),
  ];

  /**
   * Même nom : c'est la même entreprise, SAUF si les deux villes sont connues et
   * différentes. Une ville manquante d'un côté ne suffit pas à en faire deux maisons —
   * c'est précisément ce qui avait laissé passer un doublon d'ONETIP.
   */
  const dejaConnue = (nom: string, ville: string | null, siren: string | null, siret: string | null = null) => {
    const n = nu(nom);
    const v = nu(ville ?? "");
    const s = chiffres(siren);
    const e = chiffres(siret);
    return connus.some((c) => {
      // Une agence se reconnaît à son SIRET : deux agences d'une même ville sont deux
      // fiches. Sans SIRET connu de l'autre côté : même nom et même ville.
      if (options.parVille) return e && c.siret ? c.siret === e : c.nom === n && c.ville === v;
      if (s && c.siren && s === c.siren) return true;
      if (c.nom !== n) return false;
      return !(v && c.ville && v !== c.ville);
    });
  };

  let ajoutes = 0;
  for (const p of prospects) {
    const siret = options.parVille ? ((p.registre as { siret?: string } | null)?.siret ?? null) : null;
    if (dejaConnue(p.name, p.city, p.siren ?? null, siret)) continue;
    // Une autre agence porte déjà ce nom dans cette ville : on la distingue par sa rue
    // (la base n'admet qu'une fiche par nom et par ville).
    if (options.parVille && connus.some((c) => c.nom === nu(p.name) && c.ville === nu(p.city ?? ""))) {
      const rue = ((p.headOffice as { address?: string | null } | null)?.address ?? "").replace(/\s*\d{5}.*$/, "").trim();
      p.name = rue ? `${p.name} — ${rue}` : `${p.name} — ${siret ?? "autre agence"}`;
    }
    connus.push({ nom: nu(p.name), ville: nu(p.city ?? ""), siren: chiffres(p.siren ?? null), siret: chiffres(siret) });
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
      site_contacts: p.siteContacts ?? null,
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

/** Toutes les lignes d'une lecture, page par page : le serveur n'en rend que mille d'un coup. */
async function toutLire<T>(lire: (de: number, a: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>): Promise<T[]> {
  const tout: T[] = [];
  for (let de = 0; ; de += 1000) {
    const { data, error } = await lire(de, de + 999);
    if (error) throw new Error(`Lecture des fiches existantes impossible : ${error.message}`);
    tout.push(...(data ?? []));
    if (!data || data.length < 1000) return tout;
  }
}

/**
 * Ce qui est déjà dans les fiches — entreprises (SIREN), établissements (SIRET), et noms
 * (avec ville quand on l'a) — pour ne pas payer d'enrichissement sur ce qu'on a déjà, et
 * pour que « les 100 suivantes » prenne vraiment les suivantes.
 */
export async function identitesConnues(sb: SupabaseClient): Promise<{ sirens: Set<string>; sirets: Set<string>; noms: Set<string>; nomsVilles: Set<string> }> {
  const [p, c, a] = await Promise.all([
    toutLire<{ name: string; city: string | null; siren: string | null; siret: string | null }>((de, j) => sb.from("admin_prospects").select("name, city, siren, siret:registre->>siret").range(de, j)),
    toutLire<{ company: string; ville: string | null; siren: string | null }>((de, j) => sb.from("admin_clients").select("company, ville, siren").range(de, j)),
    toutLire<{ name: string }>((de, j) => sb.from("admin_accounts").select("name").range(de, j)),
  ]);
  const chiffres = (t: unknown) => String(t ?? "").replace(/\D/g, "");
  return {
    sirens: new Set([...p.map((r) => chiffres(r.siren)), ...c.map((r) => chiffres(r.siren))].filter(Boolean)),
    sirets: new Set(p.map((r) => chiffres(r.siret)).filter(Boolean)),
    noms: new Set([...p.map((r) => nomReduit(r.name)), ...c.map((r) => nomReduit(r.company)), ...a.map((r) => nomReduit(r.name))]),
    nomsVilles: new Set([...p.map((r) => `${nomReduit(r.name)}|${nomReduit(r.city ?? "")}`), ...c.map((r) => `${nomReduit(r.company)}|${nomReduit(r.ville ?? "")}`)]),
  };
}

/** Le nom réduit des doublons (le même que insertLightProspects) : sans accents, ponctuation, forme juridique. */
export const nomReduit = (t: string) =>
  t
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\b(sarl|sas|sasu|eurl|sa|sci|scop|snc|earl|gaec|ets|etablissements?)\b/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

/**
 * Une fiche approfondie entre dans la file FullEnrich : 2 interlocuteurs et leur e-mail
 * (Olivier, 20/10 : FullEnrich à l'approfondissement seulement, jamais à la prospection).
 * Une fiche déjà passée sans résultat (rien facturé) est relancée ; une fiche qui a déjà
 * eu ses contacts ne l'est pas (« Chercher 2 autres contacts » est là pour ça). Si la
 * table n'existe pas encore, l'approfondissement n'en souffre pas.
 */
export async function contactsALApprofondissement(sb: SupabaseClient, prospectId: string, par: string): Promise<void> {
  const { data: deja } = await sb.from("admin_fullenrich").select("id, statut, credits").eq("prospect_id", prospectId).eq("kind", "contacts").maybeSingle();
  if (!deja) {
    await sb.from("admin_fullenrich").insert({ prospect_id: prospectId, kind: "contacts", demande_par: par });
    return;
  }
  if (["termine", "echec", "bloque"].includes(deja.statut as string) && !Number(deja.credits)) {
    await sb
      .from("admin_fullenrich")
      .update({ statut: "en_attente", message: null, traite_le: null, mois: null, reserve: 0, demande_par: par })
      .eq("id", deja.id);
  }
}

export async function listFoundNames(sb: SupabaseClient, demandeId: string, avecVille = false): Promise<string[]> {
  const { data } = await sb.from("admin_prospects").select("name, city").eq("found_by", demandeId).order("score_total", { ascending: false });
  return (data ?? []).map((r: { name: string; city: string | null }) => (avecVille && r.city ? `${r.name} — ${r.city}` : r.name));
}

export interface ProspectToEnrich {
  siren?: string | null;
  headcountBand?: string | null;
  contactName?: string | null;
  contactRole?: string | null;
  contactPhone?: string | null;
  /** L'adresse de la fiche (celle d'une agence pour une fiche d'agence). */
  headOffice?: { address?: string | null; city?: string | null } | null;
  id: string;
  name: string;
  city: string | null;
  activity: string | null;
  website: string | null;
  department: string | null;
  score: Score;
}

export async function getProspectForEnrichment(sb: SupabaseClient, id: string): Promise<ProspectToEnrich | null> {
  // On relit aussi ce que la recherche a déjà établi : le modèle ne doit pas dépenser
  // ses recherches web à retrouver un SIREN et un dirigeant qu'on vient de lui donner.
  const { data, error } = await sb
    .from("admin_prospects")
    .select("id, name, city, activity, website, department, score, siren, headcount_band, contact_name, contact_role, contact_phone, head_office")
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return null;
  const r = data as Record<string, unknown>;
  return {
    ...(data as ProspectToEnrich),
    headcountBand: (r.headcount_band as string) ?? null,
    contactName: (r.contact_name as string) ?? null,
    contactRole: (r.contact_role as string) ?? null,
    contactPhone: (r.contact_phone as string) ?? null,
    headOffice: (r.head_office as ProspectToEnrich["headOffice"]) ?? null,
  } as ProspectToEnrich;
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
  /** Toutes les personnes trouvées, avec leurs coordonnées et leur degré de certitude. */
  personnes: unknown;
  siteContacts: SiteContacts | null;
  approach: string | null;
  /** Le dossier commercial : ce qu'il faut pour décrocher son téléphone. */
  dossier: unknown;
  sources: string[];
  score: Score;
  scoreTotal: number;
  /** La fiabilité recalculée sur ce que l'approfondissement a établi. */
  fiabilite?: { note: number; details: unknown } | null;
}

/** Un approfondissement n'efface jamais une donnée déjà là : chaque champ vide laisse l'ancien en place. */
/**
 * Ce qu'on complète sur une fiche existante, sans modèle.
 *
 * On n'écrase jamais une information déjà présente : `coalesce` côté base garderait
 * l'ancienne, mais Supabase n'en offre pas l'équivalent — on ne transmet donc que les
 * champs réellement trouvés, et l'appelant décide de ce qu'il envoie.
 */
/**
 * Noter qu'on a tenté de compléter cette fiche.
 *
 * Posé AVANT le travail, pas après : le chemin qui rebouclait le plus était celui
 * où le registre ne reconnaît pas l'entreprise — il sortait sans rien écrire, donc
 * sans rien retenir, et repartait au prochain affichage de l'écran. Une tentative
 * dépensée est une tentative marquée, même si elle échoue (migration 0052).
 */
export async function marquerTentative(sb: SupabaseClient, id: string): Promise<void> {
  await sb.from("admin_prospects").update({ completed_at: new Date().toISOString() }).eq("id", id);
}

/**
 * Une fiche saisie à la main (sans demande Merx d'origine) appartient au commercial.
 *
 * Olivier, 19/10 : « c'est mon prospect, il est sous ma responsabilité ». Quand il
 * demande à Merx de l'enrichir, Merx remplit ce qui est VIDE et ajoute ce qu'il
 * trouve en plus (interlocuteurs, numéros), mais ne remplace rien de ce qui a été
 * saisi. Une fiche trouvée par Merx, elle, se met à jour comme avant.
 */
const SAISIS = [
  "siren", "legal_name", "headcount_band", "head_office", "leaders", "website",
  "contact_name", "contact_role", "contact_email", "contact_phone", "contact_source",
] as const;

const rempliTot = (v: unknown) =>
  v !== null && v !== undefined && !(typeof v === "string" && !v.trim()) && !(Array.isArray(v) && v.length === 0);

async function garderLaSaisie(sb: SupabaseClient, id: string, patch: Record<string, unknown>): Promise<void> {
  const { data: avant, error } = await sb
    .from("admin_prospects")
    .select(`found_by, personnes, site_contacts, registre, ${SAISIS.join(", ")}`)
    .eq("id", id)
    .maybeSingle();
  // Sans pouvoir relire la fiche, on n'écrit pas : écraser la saisie serait pire.
  if (error) throw new Error(`Fiche illisible avant enrichissement : ${error.message}`);
  // Colonnes choisies à l'exécution : le type de la ligne n'est pas connu d'avance.
  const a = avant as unknown as Record<string, unknown> | null;
  if (!a) return;

  // Une AGENCE d'une société (recherche « les agences de X ») : l'approfondissement et la
  // complétion lisent la société entière, donc son siège. Rien de ce qui est propre au
  // siège n'entre sur la fiche de l'agence — adresse, dirigeant, standard, personnes
  // du site national (Olivier, 19/10). Son SIRET et sa marque « agence » restent.
  const registre = a.registre as { agence?: boolean; siret?: string } | null;
  if (registre?.agence) {
    for (const k of ["head_office", "leaders", "contact_name", "contact_role", "contact_email", "contact_phone", "contact_source", "site_contacts", "personnes", "headcount_band", "headcount_year", "open_establishments"]) delete patch[k];
    if (patch.registre && typeof patch.registre === "object") patch.registre = { ...(patch.registre as object), siret: registre.siret, agence: true };
    return;
  }
  if (a.found_by) return;
  // Le siège : on complète ses cases vides (une ville seule n'empêche pas d'ajouter l'adresse).
  if (patch.head_office && a.head_office && typeof a.head_office === "object") {
    const av = a.head_office as Record<string, unknown>;
    const nv = patch.head_office as Record<string, unknown>;
    const fusion: Record<string, unknown> = { ...nv };
    for (const [k, v] of Object.entries(av)) if (rempliTot(v)) fusion[k] = v;
    patch.head_office = fusion;
    a.head_office = null; // traité ici : ne pas le retirer plus bas
  }
  for (const k of SAISIS) if (k in patch && rempliTot(a[k])) delete patch[k];
  // Le contact saisi garde sa source : on ne la remplace que si on a posé le contact.
  if (!("contact_name" in patch) && !("contact_email" in patch) && !("contact_phone" in patch)) delete patch.contact_source;

  // Les interlocuteurs : ceux du commercial d'abord — Merx ne fait que remplir leurs
  // cases vides —, puis ceux que Merx a trouvés en plus.
  if (Array.isArray(patch.personnes) && Array.isArray(a.personnes) && a.personnes.length) {
    type P = Record<string, unknown> & { nom: string };
    const trouves = new Map((patch.personnes as P[]).map((q) => [q.nom.trim().toLowerCase(), q]));
    const connus = (a.personnes as P[]).map((q) => {
      const m = trouves.get(q.nom.trim().toLowerCase());
      if (!m) return q;
      const plus: Record<string, unknown> = {};
      for (const k of ["fonction", "email", "telephone", "mobile"]) if (!rempliTot(q[k]) && rempliTot(m[k])) plus[k] = m[k];
      return { ...q, ...plus };
    });
    const noms = new Set(connus.map((q) => q.nom.trim().toLowerCase()));
    patch.personnes = [...connus, ...(patch.personnes as P[]).filter((q) => !noms.has(q.nom.trim().toLowerCase()))];
  }
  // Les numéros et adresses : ceux du commercial d'abord (le standard est le premier).
  // Seulement s'il s'agit du même site : les coordonnées d'un site abandonné ne reviennent pas.
  const hote = (v: unknown) => String((v as { readOn?: string } | null)?.readOn ?? "").replace(/^https?:\/\/(www\.)?/, "");
  if (patch.site_contacts && a.site_contacts && hote(patch.site_contacts) === hote(a.site_contacts)) {
    const av = a.site_contacts as { emails?: string[]; phones?: string[]; equipe?: string[]; readOn?: string };
    const nv = patch.site_contacts as typeof av;
    const unir = (x?: string[], y?: string[]) => [...new Set([...(x ?? []), ...(y ?? [])])];
    patch.site_contacts = { ...nv, emails: unir(av.emails, nv.emails), phones: unir(av.phones, nv.phones), equipe: unir(av.equipe, nv.equipe), readOn: av.readOn ?? nv.readOn };
  }
}

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
    siteContacts: unknown;
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
    site_contacts: e.siteContacts,
    reliability: e.reliability,
    reliability_detail: e.reliabilityDetail,
  };
  for (const k of Object.keys(patch)) if (patch[k] === null || patch[k] === undefined) delete patch[k];
  // Posé APRÈS le nettoyage des champs vides, et toujours : une complétion qui n'a
  // rien trouvé n'en trouvera pas davantage la fois suivante, et c'est elle qui
  // repartait indéfiniment — 4 662 appels pour 255 fiches le 30 septembre
  // (migration 0052).
  patch.completed_at = new Date().toISOString();
  await garderLaSaisie(sb, id, patch);
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
  // L'ancien dossier repris garde ses textes, mais JAMAIS son ancien standard : le standard
  // et le numéro de la fiche d'appel sont toujours ceux qu'on vient d'établir (21/10).
  const nouveau = (e.dossier ?? {}) as { standard?: unknown };
  const ancien = before?.dossier as Record<string, unknown> | null;
  const dossier = dossierUtile(e.dossier)
    ? e.dossier
    : dossierUtile(ancien)
      ? {
          ...ancien,
          standard: nouveau.standard ?? null,
          fiche_appel: { ...((ancien?.fiche_appel as object) ?? {}), numero: (nouveau.standard as { principal?: { numero?: string } } | null)?.principal?.numero ?? "" },
        }
      : (e.dossier ?? null);

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
    personnes: e.personnes,
    site_contacts: e.siteContacts,
    approach: e.approach,
    dossier,
    sources,
    score: scoreFusionne,
    score_total: totalFusionne,
    enriched_at: new Date().toISOString(),
  };
  if (e.fiabilite !== undefined) {
    patch.reliability = e.fiabilite?.note ?? null;
    patch.reliability_detail = e.fiabilite?.details ?? null;
  }
  // Ce que l'approfondissement établit sur le site et le standard REMPLACE l'ancien, même
  // quand il n'a rien trouvé : un ancien numéro faux ou le site d'une autre entreprise ne
  // doivent pas survivre parce que la nouvelle recherche est vide (Barde Sud-Ouest,
  // Récré'Action, 21/10). La saisie du commercial reste protégée par garderLaSaisie.
  const remplaces = new Set(["website", "contact_phone", "site_contacts", "reliability", "reliability_detail"]);
  // L'e-mail aussi, quand l'ancien venait du site qu'on abandonne.
  const ancienSite = (await sb.from("admin_prospects").select("contact_email, contact_phone, contact_source, site_contacts, score").eq("id", id).maybeSingle()).data as
    | { contact_email: string | null; contact_phone: string | null; site_contacts: { emails?: string[]; phones?: string[] } | null; score: unknown; contact_source: string | null }
    | null;
  if (ancienSite?.contact_email && ancienSite.site_contacts?.emails?.includes(ancienSite.contact_email)) remplaces.add("contact_email");
  // Un numéro que le commercial a saisi ou corrigé lui-même reste : c'est lui qui a appelé.
  // Merx ne remplace — ou n'efface — que les numéros qu'il a lui-même posés : ceux de son
  // dossier (fiche d'appel, standard) ou de sa note, et ceux dont la source est une adresse
  // web (Merx pose toujours la page où il a lu le numéro). La fiche de saisie marque
  // « saisi à la main » tout téléphone qu'elle change.
  const neuf = (t: string) => t.replace(/\D/g, "").slice(-9);
  const ancienTel = ancienSite?.contact_phone ? neuf(ancienSite.contact_phone) : "";
  const saisiALaMain = /saisi à la main/i.test(ancienSite?.contact_source ?? "");
  const merxLAvait =
    !saisiALaMain &&
    ([before?.dossier, ancienSite?.score].map((v) => JSON.stringify(v ?? "").replace(/\D/g, "")).some((chiffres) => chiffres.includes(ancienTel)) ||
      /^https?:\/\//i.test(ancienSite?.contact_source ?? ""));
  if (ancienTel.length === 9 && !merxLAvait) {
    delete patch.contact_phone;
    delete patch.contact_source;
  }
  for (const k of Object.keys(patch)) if ((patch[k] === null && !remplaces.has(k)) || patch[k] === undefined) delete patch[k];
  // Posé APRÈS le nettoyage des champs vides, et toujours : une complétion qui n'a
  // rien trouvé n'en trouvera pas davantage la fois suivante, et c'est elle qui
  // repartait indéfiniment — 4 662 appels pour 255 fiches le 30 septembre
  // (migration 0052).
  patch.completed_at = new Date().toISOString();
  await garderLaSaisie(sb, id, patch);
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
