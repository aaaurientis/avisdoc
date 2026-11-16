// API Google Places (New) pour le réseau d'aval : recherche des fiches candidates
// (en France, dans le département concerné), quota quotidien.
// Seul l'identifiant de la fiche (place_id) est enregistré, jamais son contenu.

/* eslint-disable @typescript-eslint/no-explicit-any */
import { POPULATION_LIBELLE } from "./reseau-rpps.ts";
import { type CandidatFiche, distanceAuLieu, type Force, qualifierFiches } from "./google-correspondance.ts";
import { lieuxPourComparaison } from "./geo.ts";
import { DEPARTEMENTS } from "./reseau-rpps.ts";
import { verifierFichesIa } from "./google-ia.ts";

const RECHERCHE = "https://places.googleapis.com/v1/places:searchText";
// La clé du projet est restreinte aux appels venant du Hub (référent HTTP), comme pour Merx.
export const REFERENT_HUB = "https://admin.avisdoc.fr/";
// Plafonds quotidiens. Google relevé à 10 000 par type le 16/11 (≈ 50 000 requêtes pour
// 100 $, selon l'utilisateur) : un simple garde-fou contre un emballement, le budget se
// pilote dans la console Google Cloud. Doctolib (recherche web par l'IA) relevé de même le 16/11.
export const PLAFONDS = {
  recherche: Number(Deno.env.get("RESEAU_GOOGLE_PLAFOND_RECHERCHE") ?? 10000),
  doctolib: Number(Deno.env.get("RESEAU_DOCTOLIB_PLAFOND") ?? 10000),
  details: Number(Deno.env.get("RESEAU_GOOGLE_PLAFOND_DETAILS") ?? 10000),
  details_avis: Number(Deno.env.get("RESEAU_GOOGLE_PLAFOND_AVIS") ?? 10000),
};
const CHAMPS_RECHERCHE = "places.id,places.displayName,places.formattedAddress,places.primaryTypeDisplayName,places.businessStatus,places.location";

const QUOTA_LIBELLE: Record<keyof typeof PLAFONDS, string> = {
  recherche: "recherches de fiches Google Maps",
  details: "affichages de fiches Google Maps",
  details_avis: "affichages d'avis Google",
  doctolib: "recherches de liens Doctolib",
};
/** Message clair : quel plafond, combien, quand il revient. Plafonds fixés pour tenir le budget (50 €/mois). */
export function quotaAtteint(type: keyof typeof PLAFONDS): string {
  return `Plafond du jour atteint : ${PLAFONDS[type]} ${QUOTA_LIBELLE[type]} par jour, fixé pour tenir le budget Google. ` +
    "Le compteur repart à zéro à 1 h du matin (heure de Paris).";
}
/** Compatibilité : message générique. */
export const QUOTA_ATTEINT = quotaAtteint("recherche");

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
  admin_reseau_lieux?: { commune: string | null; code_postal: string | null; adresse?: string | null; departement?: string | null; raison_sociale?: string | null; lat?: number | null; lng?: number | null; geo_type?: string | null }[];
}

/** La requête : nom, spécialité, commune d'exercice dans le département, nom du département. */
export function requeteFiche(p: PraticienPourGoogle, departements: string[]): string {
  const lieux = (p.admin_reseau_lieux ?? []).filter((l) => !l.departement || departements.includes(l.departement));
  const communes = [...new Set(lieux.map((l) => l.commune).filter(Boolean))];
  return [`Dr ${p.prenom} ${p.nom}`, POPULATION_LIBELLE[p.population as keyof typeof POPULATION_LIBELLE], communes[0], DEPARTEMENTS[departements[0]]]
    .filter(Boolean).join(" ");
}

/**
 * Les requêtes à essayer, dans l'ordre, tant qu'aucune fiche ne porte le nom du praticien :
 *   1. « Dr Prénom Nom, spécialité, commune, département » (sans position) ;
 *   2. pour chaque lieu RPPS géocodé du département : le nom de famille seul, autour du point
 *      (rayon 3 km) — rattrape « Cabinet Dermatologie Dr VENAULT - Pôle Santé » ;
 *   3. « Nom spécialité commune » pour chaque autre commune d'exercice.
 */
export function requetesFiche(p: PraticienPourGoogle, departements: string[]): { textQuery: string; locationBias?: unknown }[] {
  const lieux = (p.admin_reseau_lieux ?? []).filter((l) => !l.departement || departements.includes(l.departement));
  const specialite = POPULATION_LIBELLE[p.population as keyof typeof POPULATION_LIBELLE] ?? "";
  const out: { textQuery: string; locationBias?: unknown }[] = [{ textQuery: requeteFiche(p, departements) }];
  const vus = new Set<string>();
  for (const l of lieux) {
    if (l.lat == null || l.lng == null) continue;
    const cle = `${l.lat.toFixed(3)},${l.lng.toFixed(3)}`;
    if (vus.has(cle)) continue;
    vus.add(cle);
    out.push({ textQuery: `${p.nom} ${specialite}`.trim(), locationBias: { circle: { center: { latitude: l.lat, longitude: l.lng }, radius: 3000 } } });
  }
  for (const c of [...new Set(lieux.map((l) => l.commune).filter(Boolean))].slice(1)) out.push({ textQuery: `${p.nom} ${specialite} ${c}` });
  return out.slice(0, 5);
}

/**
 * Les fiches candidates EN FRANCE et DANS LE DÉPARTEMENT, qualifiées (certaine, forte, moyenne,
 * faible) et triées : les plus sûres d'abord. Le contenu n'est jamais enregistré.
 * `compter` : appelé avant chaque requête supplémentaire (plafond du jour) ; sans lui, une seule requête.
 */
export async function chercherFiches(
  p: PraticienPourGoogle, departements: string[], cle: string, compter?: () => Promise<boolean>,
): Promise<(CandidatFiche & { categorie: string | null; force: Force; verifieIa?: string; distance?: number | null })[]> {
  const lieux = lieuxPourComparaison(p.admin_reseau_lieux ?? []);
  const parId = new Map<string, CandidatFiche & { categorie: string | null }>();
  const requetes = requetesFiche(p, departements);
  for (let i = 0; i < requetes.length; i++) {
    if (i > 0) {
      // On s'arrête dès qu'une fiche du département porte le nom du praticien.
      const dejaAuNom = qualifierFiches([...parId.values()], p.nom, lieux, departements).some((c) => c.force !== "faible");
      if (dejaAuNom || !compter || !(await compter())) break;
    }
    const d = await appelGoogle(RECHERCHE, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...requetes[i], languageCode: "fr", regionCode: "FR", maxResultCount: 10 }),
    }, cle, CHAMPS_RECHERCHE);
    for (const x of d?.places ?? []) {
      if (parId.has(x.id)) continue;
      parId.set(x.id, {
        place_id: x.id as string,
        nom: (x.displayName?.text ?? "") as string,
        adresse: (x.formattedAddress ?? "") as string,
        categorie: (x.primaryTypeDisplayName?.text ?? null) as string | null,
        ferme: x.businessStatus === "CLOSED_PERMANENTLY",
        lat: typeof x.location?.latitude === "number" ? x.location.latitude : null,
        lng: typeof x.location?.longitude === "number" ? x.location.longitude : null,
      });
    }
  }
  const q: (CandidatFiche & { categorie: string | null; force: Force; verifieIa?: string; distance?: number | null })[] =
    qualifierFiches([...parId.values()], p.nom, lieux, departements).map((c) => ({ ...c, distance: distanceAuLieu(c, lieux) }));
  // Au nom du praticien mais adresse non reconnue mot à mot : l'IA compare les adresses.
  // Elle ne peut que confirmer (→ certaine), jamais rétrograder ni retenir une fiche sans le nom.
  const douteuses = q.filter((c) => (c.force === "forte" || c.force === "moyenne") && !c.ferme);
  if (douteuses.length) {
    const verdicts = await verifierFichesIa({ nom: p.nom, prenom: p.prenom, population: p.population, lieux: p.admin_reseau_lieux ?? [] }, douteuses);
    for (const c of douteuses) {
      const v = verdicts.get(c.place_id);
      if (v?.memePraticien && v.memeAdresse) { c.force = "certaine"; c.verifieIa = v.raison; }
    }
    q.sort((a, b) => RANG_FORCE[a.force] - RANG_FORCE[b.force]);
  }
  return q;
}

const RANG_FORCE: Record<Force, number> = { certaine: 0, forte: 1, moyenne: 2, faible: 3 };
