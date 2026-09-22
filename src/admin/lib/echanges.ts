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
  if (!id) throw new Error("Fiche inconnue : impossible de noter l’échange.");

  const { error } = await supabaseAdmin.from("admin_echanges").insert({
    [champ]: id,
    kind: saisie.kind,
    titre: saisie.titre.trim(),
    detail: saisie.detail.trim() || null,
    au: saisie.au,
    par: saisie.par,
  });
  if (error) throw new Error(error.message);

  // Noter un appel, un e-mail ou un rendez-vous, c’est avoir contacté : la fiche le sait.
  // Une note ne compte pas — on peut se noter quelque chose sans avoir joint personne.
  if (cles.prospectId && saisie.kind !== "note") {
    await supabaseAdmin
      .from("admin_prospects")
      .update({ last_contacted_at: saisie.au })
      .eq("id", cles.prospectId)
      .lt("last_contacted_at", saisie.au);
    // Première fois : la colonne était vide, le `lt` ne l’a pas vue.
    await supabaseAdmin
      .from("admin_prospects")
      .update({ last_contacted_at: saisie.au })
      .eq("id", cles.prospectId)
      .is("last_contacted_at", null);
  }
}

export async function supprimerEchange(id: string): Promise<void> {
  const { error } = await supabaseAdmin.from("admin_echanges").delete().eq("id", id);
  if (error) throw new Error(error.message);
}
