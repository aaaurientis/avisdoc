// L'historique d'une fiche : ce que l'équipe a fait, et ce qui s'est fait tout seul.
//
// Une affaire change de table en avançant (prospect → Pipeline → fichier client).
// Les clés déjà posées permettent de recoller le fil : on lit tous les échanges
// rattachés à l'une ou l'autre de ses identités, et on les range par date.

import { supabaseAdmin } from "../data/supabaseAdmin";

export type GenreEchange = "appel" | "email" | "rdv" | "note";

export interface Echange {
  id: string;
  kind: GenreEchange;
  titre: string;
  detail: string | null;
  au: string;
  par: string;
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
  { valeur: "note", label: "Note" },
];

export const libelleGenre = (g: GenreEchange) => GENRES.find((x) => x.valeur === g)?.label ?? g;

/** Un jalon n'est pas stocké : il se déduit des dates déjà portées par la fiche. */
export interface Jalon {
  libelle: string;
  detail?: string;
  au: string;
}

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
  const { data, error } = await supabaseAdmin
    .from("admin_echanges")
    .select("id, kind, titre, detail, au, par")
    .or(ou)
    .order("au", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as Echange[];
}

/**
 * Noter un échange. Il se rattache à l'identité la plus avancée de l'affaire :
 * une fiche du fichier client garde son fil même si le prospect d'origine est effacé.
 */
export async function ajouterEchange(
  cles: ClesFiche,
  saisie: { kind: GenreEchange; titre: string; detail: string; au: string; par: string },
): Promise<void> {
  const champ = cles.accountId ? "account_id" : cles.clientId ? "client_id" : "prospect_id";
  const id = cles.accountId ?? cles.clientId ?? cles.prospectId;
  // Sans fiche, c'est une action libre : préparer une tournée, passer au salon. Elle
  // a sa place au planning sans concerner d'entreprise (migration 0038).
  const { error } = await supabaseAdmin.from("admin_echanges").insert({
    ...(id ? { [champ]: id } : {}),
    kind: saisie.kind,
    titre: saisie.titre.trim(),
    detail: saisie.detail.trim() || null,
    au: saisie.au,
    par: saisie.par,
  });
  if (error) throw new Error(error.message);
}

export async function supprimerEchange(id: string): Promise<void> {
  const { error } = await supabaseAdmin.from("admin_echanges").delete().eq("id", id);
  if (error) throw new Error(error.message);
}

/** Déplacer ou corriger une action déjà notée : on décale un appel, on précise un objet. */
export async function modifierEchange(
  id: string,
  saisie: { titre: string; detail: string; au: string },
): Promise<void> {
  const { error } = await supabaseAdmin
    .from("admin_echanges")
    .update({ titre: saisie.titre.trim(), detail: saisie.detail.trim() || null, au: saisie.au })
    .eq("id", id);
  if (error) throw new Error(error.message);
}

/** Les actions À VENIR d'une fiche : ce qui reste à faire, et qu'on peut encore déplacer. */
export async function actionsAVenir(cles: ClesFiche): Promise<Echange[]> {
  const ou = filtre(cles);
  if (!ou) return [];
  const { data, error } = await supabaseAdmin
    .from("admin_echanges")
    .select("id, kind, titre, detail, au, par")
    .or(ou)
    .gte("au", new Date().toISOString())
    .order("au", { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []) as Echange[];
}
