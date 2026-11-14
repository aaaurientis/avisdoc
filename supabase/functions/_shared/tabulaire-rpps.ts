// Accès à l'extraction RPPS (Annuaire Santé, ANS) par l'API tabulaire de
// data.gouv.fr : seules les lignes utiles sont lues, le fichier n'est jamais
// téléchargé. Commun à l'import d'un département, à l'ajout par RPPS et au
// rapprochement des généralistes trouvés par la recherche IA.

import { bornesCodePostal, type LigneRpps } from "./reseau-rpps.ts";

// Fichier « ps-libreacces-personne-activite » du jeu ANS sur data.gouv.fr.
const RESSOURCE = Deno.env.get("RPPS_RESSOURCE_ID") ?? "fffda7e9-0ea2-4c35-bba0-4496f3af935d";
export const TABULAIRE = `https://tabular-api.data.gouv.fr/api/resources/${RESSOURCE}`;
const COL_CP = "Code postal (coord. structure)";

// deno-lint-ignore no-explicit-any
export async function lireJson(url: string): Promise<any> {
  let derniere = "";
  for (let essai = 1; essai <= 4; essai++) {
    try {
      const r = await fetch(url, { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(60_000) });
      if (r.ok) return await r.json();
      derniere = `réponse ${r.status}`;
      if (r.status < 500 && r.status !== 429) break; // erreur de requête : inutile d'insister
    } catch (e) {
      derniere = e instanceof Error ? e.message : String(e);
    }
    await new Promise((ok) => setTimeout(ok, 1500 * essai));
  }
  throw new Error(`L'API de data.gouv.fr ne répond pas (${derniere}). Réessayez dans quelques minutes.`);
}

/** Toutes les pages d'une requête filtrée. */
async function toutesLesLignes(params: Record<string, string>): Promise<LigneRpps[]> {
  let url: string | null = `${TABULAIRE}/data/?${new URLSearchParams({ ...params, page_size: "200" })}`;
  const lignes: LigneRpps[] = [];
  for (let page = 0; url && page < 100; page++) {
    const d = await lireJson(url);
    lignes.push(...(Array.isArray(d?.data) ? d.data : []));
    url = d?.links?.next ?? null;
  }
  return lignes;
}

/** Bornes de code postal élargies d'une unité : le tri final se fait sur le département du lieu. */
function filtreDepartement(departement: string): Record<string, string> {
  const { min, max } = bornesCodePostal(departement);
  return {
    [`${COL_CP}__greater`]: String(Number(min) - 1).padStart(5, "0"),
    [`${COL_CP}__less`]: String(Number(max) + 1).padStart(5, "0"),
  };
}

/** Les lignes d'une spécialité dont le code postal tombe dans le département. */
export function lignesSpecialiteDepartement(code: string, departement: string): Promise<LigneRpps[]> {
  return toutesLesLignes({ "Code savoir-faire__exact": code, ...filtreDepartement(departement) });
}

/** Toutes les lignes d'un praticien, tous lieux confondus. */
export function lignesDuRpps(rpps: string): Promise<LigneRpps[]> {
  return toutesLesLignes({ "Identifiant PP__exact": rpps });
}

/** Les lignes d'un nom d'exercice dans un département (rapprochement d'un nom trouvé sur le web). */
export function lignesDuNom(nom: string, departement: string): Promise<LigneRpps[]> {
  return toutesLesLignes({ "Nom d'exercice__exact": nom, ...filtreDepartement(departement) });
}

/** Date de l'extraction indexée par l'API (fraîcheur affichée sur chaque fiche). */
export async function dateExtraction(): Promise<string | null> {
  const meta = await lireJson(`${TABULAIRE}/`).catch(() => null);
  return meta?.created_at ?? null;
}
