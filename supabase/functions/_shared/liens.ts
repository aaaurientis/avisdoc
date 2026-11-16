// Les « liens » d'un praticien, cherchés automatiquement dès son entrée dans le
// tableau : coordonnées de ses lieux (carte), fiches Google Maps, lien Doctolib.
// Rien n'est deviné : voir google-correspondance.ts et doctolib.ts.

/* eslint-disable @typescript-eslint/no-explicit-any */
import { chercherFiches, cleGoogle, compterAppel, PLAFONDS, type PraticienPourGoogle } from "./google-places.ts";
import { choisirDoctolib } from "./doctolib.ts";
import { urlsDoctolib } from "./doctolib-recherche.ts";
import type { Niveau } from "./suivi.ts";
import { completerGeo } from "./geo.ts";

const SELECT = "id, nom, prenom, population, etat, google_statut, google_place_ids, doctolib_statut, doctolib_infos, " +
  "admin_reseau_lieux(id, departement, raison_sociale, adresse, code_postal, commune, lat, lng, geo_tente, geo_type)";

export interface LigneJournal { texte: string; niveau: Niveau }

/**
 * Ce qu'on cherche : « tout » (entrée dans le tableau), seulement les fiches Google,
 * seulement Doctolib, ou le « rapprochement » : revérifier les fiches Google non
 * tranchées (à confirmer, trouvées, introuvables) contre les adresses RPPS.
 */
export type Volet = "tout" | "google" | "doctolib" | "rapprochement";
export const VOLETS: Volet[] = ["tout", "google", "doctolib", "rapprochement"];
export const A_RAPPROCHER = ["a_confirmer", "trouvee_auto", "introuvable"];

/**
 * Cherche ce qui manque pour un praticien. `departements` : ceux où chercher la fiche
 * Google (par défaut, ceux de ses lieux d'exercice). Ne touche jamais un choix déjà
 * fait par un opérateur (statuts autres que « a_chercher »).
 */
export async function chercherLiens(db: any, praticienId: string, departements?: string[], volet: Volet = "tout"): Promise<LigneJournal[]> {
  const lignes: LigneJournal[] = [];
  const { data: p } = await db.from("admin_reseau_praticiens").select(SELECT).eq("id", praticienId).maybeSingle();
  if (!p || p.etat === "exclu") return lignes;
  const qui = `${p.prenom} ${p.nom}`;
  // 1. Carte et validation par la position : coordonnées des lieux (et leur précision).
  const lieux: any[] = await completerGeo(db, p.admin_reseau_lieux ?? []);
  p.admin_reseau_lieux = lieux;
  const deps = departements?.length ? departements : [...new Set(lieux.map((l) => l.departement).filter(Boolean))] as string[];


  // 2. Fiches Google, dans le département concerné.
  if (volet === "rapprochement" && A_RAPPROCHER.includes(p.google_statut) && cleGoogle()) {
    lignes.push(...(await rapprocher(db, p, deps)));
  }
  if ((volet === "tout" || volet === "google") && p.google_statut === "a_chercher" && cleGoogle()) {
    if (!(await compterAppel(db, "recherche"))) {
      lignes.push({ texte: `Plafond Google du jour atteint (${PLAFONDS.recherche} recherches) : ${qui} sera cherché demain`, niveau: "ecarte" });
    } else {
      const candidats = await chercherFiches(p as PraticienPourGoogle, deps, cleGoogle());
      const retenues = candidats.filter((c) => c.force === "certaine" || c.force === "forte");
      const moyennes = candidats.filter((c) => c.force === "moyenne");
      let maj: Record<string, unknown>;
      if (retenues.length) {
        const ids = [...new Set(retenues.map((c) => c.place_id))];
        // Toutes à une adresse RPPS (nom + code postal + voie) : validées d'office (décision du 14/11).
        const certaines = retenues.every((c) => c.force === "certaine");
        maj = {
          google_statut: certaines ? "confirmee" : "trouvee_auto", google_place_ids: ids, google_place_id: ids[0],
          google_aucune_fiche: false, google_rattache_par: certaines ? "automatique (adresse RPPS)" : "automatique", google_rattache_le: new Date().toISOString(),
        };
        lignes.push({
          texte: `Google : ${ids.length} fiche${ids.length > 1 ? "s" : ""} ${certaines ? "validée" : "trouvée"}${ids.length > 1 ? "s" : ""} pour ${qui}${certaines ? " (adresse RPPS)" : ", à vérifier"}`,
          niveau: "ok",
        });
      } else if (moyennes.length) {
        maj = { google_statut: "a_confirmer" };
        lignes.push({ texte: `Google : à confirmer pour ${qui} (${moyennes.length} fiche${moyennes.length > 1 ? "s" : ""} au même nom, autre commune)`, niveau: "info" });
      } else {
        maj = { google_statut: "introuvable" };
        lignes.push({ texte: `Google : aucune fiche au nom de ${qui} dans le département`, niveau: "info" });
      }
      await db.from("admin_reseau_praticiens").update({ ...maj, google_cherche_le: new Date().toISOString() })
        .eq("id", p.id).eq("google_statut", "a_chercher");
    }
  }

  // 3. Lien Doctolib (adresses des résultats de recherche seulement, jamais les pages).
  if ((volet === "tout" || volet === "doctolib") && p.doctolib_statut === "a_chercher" && Deno.env.get("ANTHROPIC_API_KEY")) {
    if (!(await compterAppel(db, "doctolib"))) {
      lignes.push({ texte: `Plafond Doctolib du jour atteint (${PLAFONDS.doctolib} recherches) : ${qui} sera cherché demain`, niveau: "ecarte" });
    } else {
      const communes = [...new Set(lieux.map((l) => l.commune).filter(Boolean))] as string[];
      // Les pages signalées « n'existe plus » ne sont jamais reproposées.
      const disparues = new Set<string>(Array.isArray(p.doctolib_infos?.pages_disparues) ? p.doctolib_infos.pages_disparues : []);
      const urls = (await urlsDoctolib({ nom: p.nom, prenom: p.prenom, population: p.population, communes }))
        .filter((u) => !disparues.has(u.split("?")[0].replace(/\/+$/, "")));
      const c = choisirDoctolib(urls, { nom: p.nom, prenom: p.prenom, communes });
      const maj: Record<string, unknown> = c.statut === "trouve_auto"
        ? { doctolib_statut: "trouve_auto", doctolib_url: c.url, doctolib_par: "automatique", doctolib_le: new Date().toISOString() }
        : { doctolib_statut: c.statut };
      lignes.push(c.statut === "trouve_auto"
        ? { texte: `Doctolib : fiche trouvée pour ${qui}`, niveau: "ok" }
        : c.statut === "a_confirmer"
        ? { texte: `Doctolib : à confirmer pour ${qui}`, niveau: "info" }
        : { texte: `Doctolib : aucune fiche au nom de ${qui}`, niveau: "info" });
      await db.from("admin_reseau_praticiens").update({ ...maj, doctolib_cherche_le: new Date().toISOString() })
        .eq("id", p.id).eq("doctolib_statut", "a_chercher");
    }
  }
  return lignes;
}

/**
 * Rapprochement Google / RPPS d'une fiche non tranchée : nouvelle recherche dans le
 * département. Les fiches au nom ET à l'adresse RPPS sont validées d'office ; celles au
 * nom et au code postal sont rattachées « à vérifier ». Rien n'est retiré ni rétrogradé.
 */
async function rapprocher(db: any, p: any, deps: string[]): Promise<LigneJournal[]> {
  const qui = `${p.prenom} ${p.nom}`;
  if (!(await compterAppel(db, "recherche"))) return [{ texte: `Plafond Google du jour atteint (${PLAFONDS.recherche} recherches) : ${qui} sera revérifié demain`, niveau: "ecarte" }];
  const candidats = await chercherFiches(p as PraticienPourGoogle, deps, cleGoogle());
  const force = new Map(candidats.map((c) => [c.place_id, c.force]));
  const retenues = candidats.filter((c) => c.force === "certaine" || c.force === "forte").map((c) => c.place_id);
  const existantes: string[] = p.google_statut === "trouvee_auto" ? (p.google_place_ids ?? []) : [];
  const ids = [...new Set([...existantes, ...retenues])];
  const maintenant = new Date().toISOString();
  if (!retenues.length) {
    await db.from("admin_reseau_praticiens").update({ google_cherche_le: maintenant }).eq("id", p.id);
    return [{ texte: `Rapprochement : rien de sûr pour ${qui}, inchangé`, niveau: "info" }];
  }
  const certaines = ids.every((id) => force.get(id) === "certaine");
  const statut = certaines ? "confirmee" : "trouvee_auto";
  if (statut === p.google_statut && ids.length === existantes.length) {
    await db.from("admin_reseau_praticiens").update({ google_cherche_le: maintenant }).eq("id", p.id);
    return [{ texte: `Rapprochement : ${qui} reste à vérifier (même nom et code postal, autre rue)`, niveau: "info" }];
  }
  const { error } = await db.from("admin_reseau_praticiens").update({
    google_statut: statut, google_place_ids: ids, google_place_id: ids[0], google_aucune_fiche: false,
    google_rattache_par: certaines ? "automatique (adresse RPPS)" : "automatique", google_rattache_le: maintenant, google_cherche_le: maintenant,
  }).eq("id", p.id).eq("google_statut", p.google_statut);
  if (error) return [{ texte: `Rapprochement : ${qui} : ${error.message}`, niveau: "ecarte" }];
  return [{ texte: certaines ? `Rapprochement : fiche validée pour ${qui} (adresse RPPS)` : `Rapprochement : fiche trouvée pour ${qui}, à vérifier`, niveau: "ok" }];
}
