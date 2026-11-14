// API Google Places (New) pour le réseau d'aval : recherche des fiches candidates,
// quota quotidien, et recherche automatique des fiches d'une liste de praticiens.
// Seul l'identifiant de la fiche (place_id) est enregistré, jamais son contenu.

/* eslint-disable @typescript-eslint/no-explicit-any */
import { POPULATION_LIBELLE } from "./reseau-rpps.ts";
import { type CandidatFiche, choisirFiche } from "./google-correspondance.ts";
import type { Suivi } from "./suivi.ts";

const RECHERCHE = "https://places.googleapis.com/v1/places:searchText";
// La clé du projet est restreinte aux appels venant du Hub (référent HTTP), comme pour Merx.
export const REFERENT_HUB = "https://admin.avisdoc.fr/";
export const PLAFONDS = {
  recherche: Number(Deno.env.get("RESEAU_GOOGLE_PLAFOND_RECHERCHE") ?? 200),
  details: Number(Deno.env.get("RESEAU_GOOGLE_PLAFOND_DETAILS") ?? 300),
  details_avis: Number(Deno.env.get("RESEAU_GOOGLE_PLAFOND_AVIS") ?? 100),
};
const CHAMPS_RECHERCHE = "places.id,places.displayName,places.formattedAddress,places.primaryTypeDisplayName,places.businessStatus";

export const QUOTA_ATTEINT = "Quota Google du jour atteint : la suite reprend demain.";

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
  admin_reseau_lieux?: { commune: string | null; code_postal: string | null }[];
}

export function requeteFiche(p: PraticienPourGoogle): string {
  const communes = [...new Set((p.admin_reseau_lieux ?? []).map((l) => l.commune).filter(Boolean))];
  return [`Dr ${p.prenom} ${p.nom}`, POPULATION_LIBELLE[p.population as keyof typeof POPULATION_LIBELLE], communes[0]]
    .filter(Boolean).join(" ");
}

/** Les fiches candidates (affichage) — le contenu n'est jamais enregistré. */
export async function chercherFiches(p: PraticienPourGoogle, cle: string): Promise<(CandidatFiche & { categorie: string | null })[]> {
  const d = await appelGoogle(RECHERCHE, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ textQuery: requeteFiche(p), languageCode: "fr", regionCode: "FR", maxResultCount: 5 }),
  }, cle, CHAMPS_RECHERCHE);
  return (d?.places ?? []).map((x: any) => ({
    place_id: x.id,
    nom: x.displayName?.text ?? "",
    adresse: x.formattedAddress ?? "",
    categorie: x.primaryTypeDisplayName?.text ?? null,
    ferme: x.businessStatus === "CLOSED_PERMANENTLY",
  }));
}

const SELECT = "id, nom, prenom, population, google_statut, admin_reseau_lieux(commune, code_postal)";

/**
 * Cherche automatiquement la fiche Google des praticiens donnés (ou de ceux du
 * département encore « à chercher »), dans la limite du quota du jour. Rattache
 * d'office les correspondances sans ambiguïté, marque les autres « à confirmer »
 * ou « introuvable ». Ne touche jamais une fiche choisie par un opérateur.
 */
export async function rechercherFichesGoogle(
  db: any,
  cible: { departement: string } | { ids: string[] },
  suivi?: Suivi,
  limite = 150,
): Promise<{ traites: number; trouvees: number; a_confirmer: number; introuvables: number; restants: number; quota: boolean }> {
  const bilan = { traites: 0, trouvees: 0, a_confirmer: 0, introuvables: 0, restants: 0, quota: false };
  const cle = cleGoogle();
  if (!cle) throw new Error("Aucune clé Google n'est configurée sur le projet (GOOGLE_PLACES_KEY).");

  let ids: string[];
  if ("ids" in cible) ids = cible.ids;
  else {
    const { data } = await db.from("admin_reseau_lieux").select("praticien_id").eq("departement", cible.departement).limit(10000);
    ids = [...new Set<string>((data ?? []).map((x: any) => x.praticien_id as string))];
  }
  const aChercher: PraticienPourGoogle[] = [];
  for (let i = 0; i < ids.length; i += 200) {
    const { data, error } = await db.from("admin_reseau_praticiens").select(SELECT)
      .in("id", ids.slice(i, i + 200)).eq("google_statut", "a_chercher").neq("etat", "exclu");
    if (error) throw new Error(error.message);
    aChercher.push(...(data ?? []));
  }
  const lot = aChercher.slice(0, limite);
  bilan.restants = aChercher.length - lot.length;
  await suivi?.maj({ etape: `Recherche des fiches Google (0/${lot.length})`, progression: 2, ligne: `${aChercher.length} praticien${aChercher.length > 1 ? "s" : ""} sans fiche Google${bilan.restants ? ` : ${lot.length} traités maintenant, ${bilan.restants} ensuite` : ""}` });

  for (const p of lot) {
    if (!(await compterAppel(db, "recherche"))) {
      bilan.quota = true;
      bilan.restants += lot.length - bilan.traites;
      await suivi?.maj({ ligne: QUOTA_ATTEINT, niveau: "ecarte" });
      break;
    }
    const cps = (p.admin_reseau_lieux ?? []).map((l) => l.code_postal ?? "").filter(Boolean);
    let maj: Record<string, unknown>;
    let ligne: string;
    let niveau: "ok" | "info" | "ecarte" = "info";
    try {
      const c = choisirFiche(await chercherFiches(p, cle), p.nom, cps);
      if (c.statut === "trouvee_auto") {
        maj = { google_statut: "trouvee_auto", google_place_id: c.placeId, google_aucune_fiche: false, google_rattache_par: "automatique", google_rattache_le: new Date().toISOString() };
        bilan.trouvees++; ligne = `Fiche trouvée : ${p.prenom} ${p.nom}`; niveau = "ok";
      } else if (c.statut === "a_confirmer") {
        maj = { google_statut: "a_confirmer" };
        bilan.a_confirmer++; ligne = `À confirmer : ${p.prenom} ${p.nom} (${c.candidats} fiche${c.candidats > 1 ? "s" : ""} possible${c.candidats > 1 ? "s" : ""})`;
      } else {
        maj = { google_statut: "introuvable" };
        bilan.introuvables++; ligne = `Aucune fiche : ${p.prenom} ${p.nom}`;
      }
    } catch (e) {
      // Une erreur de Google arrête le lot : inutile d'épuiser le quota sur une clé refusée.
      await suivi?.maj({ ligne: `Erreur Google : ${e instanceof Error ? e.message : String(e)}`, niveau: "ecarte" });
      throw e;
    }
    // Garde-fou : on n'écrase jamais un choix fait entre-temps par un opérateur.
    await db.from("admin_reseau_praticiens").update({ ...maj, google_cherche_le: new Date().toISOString() })
      .eq("id", p.id).eq("google_statut", "a_chercher");
    bilan.traites++;
    await suivi?.maj({ etape: `Recherche des fiches Google (${bilan.traites}/${lot.length})`, progression: 2 + (96 * bilan.traites) / Math.max(1, lot.length), ligne, niveau });
  }
  return bilan;
}

/**
 * Lance en tâche de fond la recherche des fiches Google d'un département, suivie
 * comme une recherche IA (étape, pourcentage, journal). Ne fait rien si une recherche
 * est déjà en cours ou si aucune clé n'est configurée. Renvoie l'identifiant du suivi.
 */
export async function demarrerRechercheGoogle(db: any, departement: string, acteur: string): Promise<string | null> {
  if (!cleGoogle()) return null;
  const { data: enCours } = await db.from("admin_reseau_recherches_ia").select("id")
    .eq("departement", departement).eq("type", "google_departement").eq("statut", "en_cours")
    .gt("debut", new Date(Date.now() - 10 * 60_000).toISOString()).limit(1);
  if (enCours?.length) return enCours[0].id;
  const { data: r, error } = await db.from("admin_reseau_recherches_ia")
    .insert({ type: "google_departement", departement, lance_par: acteur }).select("id").single();
  if (error) throw new Error(error.message);
  const { Suivi, enTacheDeFond } = await import("./suivi.ts");
  const suivi = new Suivi(db, r.id);
  enTacheDeFond((async () => {
    try {
      const bilan = await rechercherFichesGoogle(db, { departement }, suivi);
      await suivi.maj({
        ligne: `Terminé : ${bilan.trouvees} trouvée${bilan.trouvees > 1 ? "s" : ""}, ${bilan.a_confirmer} à confirmer, ${bilan.introuvables} sans fiche${bilan.restants ? `, ${bilan.restants} restant${bilan.restants > 1 ? "s" : ""}` : ""}`,
        niveau: "ok",
      });
      await suivi.attendre();
      await db.from("admin_reseau_recherches_ia").update({
        statut: "termine", fin: new Date().toISOString(), etape: "Terminé", progression: 100,
        resultat: { propositions: bilan.traites, crees: bilan.trouvees, a_confirmer: bilan.a_confirmer, introuvables: bilan.introuvables, restants: bilan.restants, quota: bilan.quota },
      }).eq("id", r.id);
    } catch (e) {
      const erreur = e instanceof Error ? e.message : String(e);
      await suivi.maj({ ligne: `Échec : ${erreur}`, niveau: "ecarte" });
      await suivi.attendre();
      await db.from("admin_reseau_recherches_ia").update({ statut: "echec", fin: new Date().toISOString(), erreur, etape: "Échec" }).eq("id", r.id);
    }
  })());
  return r.id;
}
