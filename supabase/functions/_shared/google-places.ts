// API Google Places (New) pour le réseau d'aval : recherche des fiches candidates
// (en France, dans le département concerné), quota quotidien.
// Seul l'identifiant de la fiche (place_id) est enregistré, jamais son contenu.

/* eslint-disable @typescript-eslint/no-explicit-any */
import { POPULATION_LIBELLE } from "./reseau-rpps.ts";
import { type CandidatFiche, type Force, qualifierFiches } from "./google-correspondance.ts";
import { DEPARTEMENTS } from "./reseau-rpps.ts";

const RECHERCHE = "https://places.googleapis.com/v1/places:searchText";
// La clé du projet est restreinte aux appels venant du Hub (référent HTTP), comme pour Merx.
export const REFERENT_HUB = "https://admin.avisdoc.fr/";
export const PLAFONDS = {
  recherche: Number(Deno.env.get("RESEAU_GOOGLE_PLAFOND_RECHERCHE") ?? 200),
  doctolib: Number(Deno.env.get("RESEAU_DOCTOLIB_PLAFOND") ?? 200),
  details: Number(Deno.env.get("RESEAU_GOOGLE_PLAFOND_DETAILS") ?? 300),
  details_avis: Number(Deno.env.get("RESEAU_GOOGLE_PLAFOND_AVIS") ?? 100),
};
const CHAMPS_RECHERCHE = "places.id,places.displayName,places.formattedAddress,places.primaryTypeDisplayName,places.businessStatus";

export const QUOTA_ATTEINT = "Quota du jour atteint : la suite reprend demain.";

export function cleGoogle(): string {
  return (Deno.env.get("GOOGLE_PLACES_KEY") ?? Deno.env.get("GOOGLE_MAPS_KEY") ?? "").trim();
}

/** Compte un appel dans le quota du jour ; false si le plafond est atteint. */
export async function compterAppel(db: any, type: keyof typeof PLAFONDS): Promise<boolean> {
  const { data, error } = await db.rpc("admin_reseau_compter_appel_google", { t: type, plafond: PLAFONDS[type] });
  if (error) throw new Error(error.message);
  return data === true;
}

export async function appelGoogle(url: string, init: RequestInit, cle: string, masque: string): Promise<any> {
  const r = await fetch(url, {
    ...init,
    signal: AbortSignal.timeout(10_000),
    headers: { ...(init.headers ?? {}), "X-Goog-Api-Key": cle, "X-Goog-FieldMask": masque, Referer: REFERENT_HUB },
  });
  if (!r.ok) {
    console.error("Google Places", r.status, (await r.text().catch(() => "")).slice(0, 200));
    if (r.status === 403) throw new Error("Google refuse la clé : vérifiez que l'API Places (New) est activée pour la clé serveur.");
    throw new Error(`Google Maps a répondu ${r.status}. Réessayez.`);
  }
  return r.json();
}

export interface PraticienPourGoogle {
  id: string;
  nom: string;
  prenom: string;
  population: string;
  admin_reseau_lieux?: { commune: string | null; code_postal: string | null; adresse?: string | null; departement?: string | null }[];
}

/** La requête : nom, spécialité, commune d'exercice dans le département, nom du département. */
export function requeteFiche(p: PraticienPourGoogle, departements: string[]): string {
  const lieux = (p.admin_reseau_lieux ?? []).filter((l) => !l.departement || departements.includes(l.departement));
  const communes = [...new Set(lieux.map((l) => l.commune).filter(Boolean))];
  return [`Dr ${p.prenom} ${p.nom}`, POPULATION_LIBELLE[p.population as keyof typeof POPULATION_LIBELLE], communes[0], DEPARTEMENTS[departements[0]]]
    .filter(Boolean).join(" ");
}

/**
 * Les fiches candidates EN FRANCE et DANS LE DÉPARTEMENT, qualifiées (forte, moyenne,
 * faible) et triées : les plus sûres d'abord. Le contenu n'est jamais enregistré.
 */
export async function chercherFiches(
  p: PraticienPourGoogle, departements: string[], cle: string,
): Promise<(CandidatFiche & { categorie: string | null; force: Force })[]> {
  const d = await appelGoogle(RECHERCHE, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ textQuery: requeteFiche(p, departements), languageCode: "fr", regionCode: "FR", maxResultCount: 10 }),
  }, cle, CHAMPS_RECHERCHE);
  const bruts = (d?.places ?? []).map((x: any) => ({
    place_id: x.id as string,
    nom: (x.displayName?.text ?? "") as string,
    adresse: (x.formattedAddress ?? "") as string,
    categorie: (x.primaryTypeDisplayName?.text ?? null) as string | null,
    ferme: x.businessStatus === "CLOSED_PERMANENTLY",
  }));
  const lieux = (p.admin_reseau_lieux ?? []).map((l) => ({ codePostal: l.code_postal, adresse: l.adresse ?? null }));
  return qualifierFiches(bruts, p.nom, lieux, departements);
}
