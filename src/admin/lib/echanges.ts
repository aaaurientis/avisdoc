// L'historique d'une fiche : ce que l'équipe a fait, et ce qui est programmé.
//
// Une affaire change de table en avançant (prospect → Pipeline → fichier client).
// Les clés déjà posées permettent de recoller le fil : on lit tous les échanges
// rattachés à l'une ou l'autre de ses identités, et on les range par date.
//
// Depuis la fiche « façon Onetip » (migration 0069), une action est soit
// PROGRAMMÉE (`prevu`), soit NOTÉE parce qu'elle a eu lieu. Une action programmée
// se clôt par son compte rendu (`traite_le`). Ce qui a été noté ne se réécrit
// plus : on ajoute une précision en dessous.

import { supabaseAdmin } from "../data/supabaseAdmin";

// « tache » : ce qui n'est ni un appel, ni un e-mail, ni un rendez-vous —
// préparer une tournée, passer au salon. Une action qui n'a pas d'autre nom.
export type GenreEchange =
  | "appel"
  | "email"
  | "rdv"
  | "note"
  | "tache"
  | "presentation"
  | "salon"
  | "sms"
  | "linkedin"
  | "devis";

export type ModeRdv = "visio" | "sur_place";

export interface Echange {
  id: string;
  kind: GenreEchange;
  titre: string;
  detail: string | null;
  au: string;
  par: string;
  prevu: boolean;
  traite_le: string | null;
  resultat: string | null;
  avec: string | null;
  rdv_mode: ModeRdv | null;
  rdv_lien: string | null;
  created_at: string;
}

/** Les identités successives d'une même affaire ; celles qu'on connaît suffisent. */
export interface ClesFiche {
  prospectId?: string | null;
  clientId?: string | null;
  accountId?: string | null;
}

export const GENRES: { valeur: GenreEchange; label: string }[] = [
  { valeur: "appel", label: "Appel" },
  { valeur: "email", label: "E-mail" },
  { valeur: "rdv", label: "Rendez-vous" },
  { valeur: "presentation", label: "Présentation" },
  { valeur: "tache", label: "À faire" },
  { valeur: "note", label: "Note" },
  { valeur: "salon", label: "Rencontré sur un salon" },
  { valeur: "sms", label: "SMS ou WhatsApp" },
  { valeur: "linkedin", label: "Message LinkedIn" },
  { valeur: "devis", label: "Devis envoyé" },
];

export const libelleGenre = (g: GenreEchange) => GENRES.find((x) => x.valeur === g)?.label ?? g;

/** Un jalon n'est pas stocké : il se déduit des dates déjà portées par la fiche. */
export interface Jalon {
  libelle: string;
  detail?: string;
  au: string;
}

const COLONNES = "id, kind, titre, detail, au, par, prevu, traite_le, resultat, avec, rdv_mode, rdv_lien, created_at";

function filtre(cles: ClesFiche): string | null {
  const morceaux = [
    cles.prospectId ? `prospect_id.eq.${cles.prospectId}` : "",
    cles.clientId ? `client_id.eq.${cles.clientId}` : "",
    cles.accountId ? `account_id.eq.${cles.accountId}` : "",
  ].filter(Boolean);
  return morceaux.length ? morceaux.join(",") : null;
}

/** Les échanges de la fiche, du plus récent au plus ancien. */
export async function chargerEchanges(cles: ClesFiche): Promise<Echange[]> {
  const ou = filtre(cles);
  if (!ou) return [];
  const { data, error } = await supabaseAdmin.from("admin_echanges").select(COLONNES).or(ou).order("au", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as Echange[];
}

/** Ce qu'on précise en plus d'un genre, d'un titre et d'une date. */
export interface Precisions {
  prevu?: boolean;
  resultat?: string | null;
  avec?: string | null;
  rdvMode?: ModeRdv | null;
  rdvLien?: string | null;
}

/**
 * Noter un échange. Il se rattache à l'identité la plus avancée de l'affaire :
 * une fiche du fichier client garde son fil même si le prospect d'origine est effacé.
 *
 * Sans `prevu` explicite, une action datée dans le futur est programmée : c'est ce
 * que font le Planning et le Débrief quand ils posent une action à faire.
 */
export async function ajouterEchange(
  cles: ClesFiche,
  saisie: { kind: GenreEchange; titre: string; detail: string; au: string; par: string } & Precisions,
): Promise<string> {
  const champ = cles.accountId ? "account_id" : cles.clientId ? "client_id" : "prospect_id";
  const id = cles.accountId ?? cles.clientId ?? cles.prospectId;
  const prevu = saisie.prevu ?? (saisie.kind !== "note" && new Date(saisie.au).getTime() > Date.now() + 60_000);
  // Sans fiche, c'est une action libre : préparer une tournée, passer au salon. Elle
  // a sa place au planning sans concerner d'entreprise (migration 0038).
  const { data, error } = await supabaseAdmin
    .from("admin_echanges")
    .insert({
      ...(id ? { [champ]: id } : {}),
      kind: saisie.kind,
      titre: saisie.titre.trim(),
      detail: saisie.detail.trim() || null,
      au: saisie.au,
      par: saisie.par,
      prevu,
      resultat: saisie.resultat || null,
      avec: saisie.avec?.trim() || null,
      rdv_mode: saisie.rdvMode ?? null,
      rdv_lien: saisie.rdvMode === "visio" ? saisie.rdvLien?.trim() || null : null,
    })
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  return data.id as string;
}

/** Une action PROGRAMMÉE se supprime ; ce qui a eu lieu, jamais. */
export async function supprimerEchange(id: string): Promise<void> {
  const { error } = await supabaseAdmin.from("admin_echanges").delete().eq("id", id).eq("prevu", true).is("traite_le", null);
  if (error) throw new Error(error.message);
}

/**
 * Déplacer ou corriger une action programmée : on décale un appel, on précise un
 * objet. Le rappel par mail repart pour la nouvelle heure.
 */
export async function modifierEchange(
  id: string,
  saisie: { titre: string; detail: string; au: string } & Omit<Precisions, "prevu" | "resultat">,
): Promise<void> {
  const { error } = await supabaseAdmin
    .from("admin_echanges")
    .update({
      titre: saisie.titre.trim(),
      detail: saisie.detail.trim() || null,
      au: saisie.au,
      rappel_envoye_le: null,
      ...(saisie.avec !== undefined ? { avec: saisie.avec?.trim() || null } : {}),
      ...(saisie.rdvMode !== undefined
        ? { rdv_mode: saisie.rdvMode, rdv_lien: saisie.rdvMode === "visio" ? saisie.rdvLien?.trim() || null : null }
        : {}),
    })
    .eq("id", id)
    .eq("prevu", true)
    .is("traite_le", null);
  if (error) throw new Error(error.message);
}

/** L'action programmée a eu lieu : son compte rendu est noté, elle quitte « À venir ». */
export async function marquerTraitee(id: string): Promise<void> {
  const { error } = await supabaseAdmin.from("admin_echanges").update({ traite_le: new Date().toISOString() }).eq("id", id);
  if (error) throw new Error(error.message);
}

/**
 * Ajouter une précision à ce qui a été noté. Le texte d'origine ne bouge pas :
 * on écrit en dessous, daté et signé.
 */
export async function ajouterPrecision(e: Echange, ajout: string, qui: string): Promise<void> {
  const jour = new Date().toLocaleDateString("fr-FR", { day: "numeric", month: "long", timeZone: "Europe/Paris" });
  const suite = `— Ajout du ${jour} (${qui}) : ${ajout.trim()}`;
  const detail = e.detail?.trim() ? `${e.detail.trim()}\n\n${suite}` : suite;
  const { error } = await supabaseAdmin.from("admin_echanges").update({ detail }).eq("id", e.id);
  if (error) throw new Error(error.message);
}

/** Les actions À VENIR d'une fiche : programmées, et pas encore faites. */
export async function actionsAVenir(cles: ClesFiche): Promise<Echange[]> {
  const ou = filtre(cles);
  if (!ou) return [];
  const { data, error } = await supabaseAdmin
    .from("admin_echanges")
    .select(COLONNES)
    .or(ou)
    .eq("prevu", true)
    .is("traite_le", null)
    .order("au", { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []) as Echange[];
}
