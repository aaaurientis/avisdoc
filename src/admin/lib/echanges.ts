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

/** En visio, sur place (chez nous), ou chez le client (migration 0070). */
export type ModeRdv = "visio" | "sur_place" | "chez_client";

/** Comment on le dit : « en visio », « sur place », « chez le client ». */
export const LIEU_RDV: Record<ModeRdv, string> = { visio: "en visio", sur_place: "sur place", chez_client: "chez le client" };

/** Un rendez-vous où il faut se déplacer : le rappel part 2 heures avant. */
export const seDeplacer = (m: ModeRdv | null | undefined) => m === "sur_place" || m === "chez_client";

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
  /** Le rendez-vous a fait passer la fiche en « RDV » : la colonne où elle était. */
  colonne_avant: string | null;
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

const COLONNES = "id, kind, titre, detail, au, par, prevu, traite_le, resultat, avec, rdv_mode, rdv_lien, colonne_avant, created_at";

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
  /** Le rendez-vous a fait passer la fiche en « RDV » : la colonne où elle était. */
  colonneAvant?: string | null;
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
      ...(saisie.colonneAvant ? { colonne_avant: saisie.colonneAvant } : {}),
    })
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  return data.id as string;
}

/**
 * Annuler une action programmée. RIEN NE S'EFFACE (Olivier, 12/10 : « on garde tout
 * dans l'historique, rien ne peut être supprimé ») : elle quitte « À venir », le
 * Planning et les rappels, et reste dans l'historique, « Annulé », avec qui et quand.
 *
 * Un rendez-vous qui avait fait passer l'affaire en « RDV » rend la colonne où elle
 * était, s'il ne reste aucun autre rendez-vous programmé sur elle : à l'appelant de
 * l'y remettre (Olivier, 12/10 : « tu lui retires son rendez-vous, tu la remets dans
 * sa case »).
 */
export async function annulerAction(id: string, qui: string): Promise<{ clientId: string; colonne: string } | null> {
  const { data: avant, error: lecture } = await supabaseAdmin.from("admin_echanges").select("kind, client_id, colonne_avant, detail").eq("id", id).maybeSingle();
  if (lecture) throw new Error(lecture.message);
  const a = avant as { kind: string; client_id: string | null; colonne_avant: string | null; detail: string | null } | null;
  if (!a) return null;
  const jour = new Date().toLocaleString("fr-FR", { day: "numeric", month: "long", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Paris" });
  const trace = `— Annulé le ${jour}${qui ? ` par ${qui}` : ""}.`;
  const { error } = await supabaseAdmin
    .from("admin_echanges")
    .update({ traite_le: new Date().toISOString(), resultat: "Annulé", detail: a.detail?.trim() ? `${a.detail.trim()}\n\n${trace}` : trace })
    .eq("id", id)
    .eq("prevu", true)
    .is("traite_le", null);
  if (error) throw new Error(error.message);
  if (a.kind !== "rdv" || !a.client_id || !a.colonne_avant) return null;
  return (await rdvEncorePrevu(a.client_id)) ? null : { clientId: a.client_id, colonne: a.colonne_avant };
}

/** Reste-t-il un rendez-vous programmé, pas encore fait, sur cette affaire ? */
export async function rdvEncorePrevu(clientId: string): Promise<boolean> {
  const { count, error } = await supabaseAdmin
    .from("admin_echanges")
    .select("id", { count: "exact", head: true })
    .eq("client_id", clientId)
    .eq("kind", "rdv")
    .eq("prevu", true)
    .is("traite_le", null);
  if (error) throw new Error(error.message);
  return Boolean(count);
}

/** La colonne « RDV » d'un pipeline, quel que soit son nom exact. */
export const estColonneRdv = (colonne: string | null | undefined) => (colonne ?? "").trim().toLowerCase() === "rdv";

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

/**
 * Corriger une action déjà notée : date, texte, avec qui, résultat.
 *
 * Olivier, 19/10 : le commercial doit pouvoir corriger ce qui a été fait, même passé.
 * L'historique n'est plus figé ; une action programmée se déplace toujours par
 * `modifierEchange`, qui réarme son rappel.
 */
export async function corrigerEchange(
  id: string,
  saisie: { detail: string; au: string; avec: string | null; resultat: string | null },
): Promise<void> {
  const { error } = await supabaseAdmin
    .from("admin_echanges")
    .update({ detail: saisie.detail.trim() || null, au: saisie.au, avec: saisie.avec?.trim() || null, resultat: saisie.resultat })
    .eq("id", id);
  if (error) throw new Error(error.message);
}

/** L'action programmée a eu lieu : son compte rendu est noté, elle quitte « À venir ». */
export async function marquerTraitee(id: string): Promise<void> {
  const { error } = await supabaseAdmin.from("admin_echanges").update({ traite_le: new Date().toISOString() }).eq("id", id);
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
