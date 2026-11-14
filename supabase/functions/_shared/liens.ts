// Les « liens » d'un praticien, cherchés automatiquement dès son entrée dans le
// tableau : coordonnées de ses lieux (carte), fiches Google Maps, lien Doctolib.
// Rien n'est deviné : voir google-correspondance.ts et doctolib.ts.

/* eslint-disable @typescript-eslint/no-explicit-any */
import { chercherFiches, cleGoogle, compterAppel, type PraticienPourGoogle } from "./google-places.ts";
import { choisirDoctolib } from "./doctolib.ts";
import { urlsDoctolib } from "./doctolib-recherche.ts";
import type { Niveau } from "./suivi.ts";

const SELECT = "id, nom, prenom, population, etat, google_statut, doctolib_statut, " +
  "admin_reseau_lieux(id, departement, adresse, code_postal, commune, lat, lng, geo_tente)";

/** Géocodage par l'API Adresse (BAN, data.gouv.fr) : gratuit, sans clé, adresses françaises. */
async function geocoder(l: any): Promise<{ lat: number; lng: number } | null> {
  const q = [l.adresse, l.code_postal, l.commune].filter(Boolean).join(" ");
  if (!q.trim()) return null;
  const u = new URL("https://api-adresse.data.gouv.fr/search/");
  u.searchParams.set("q", q);
  u.searchParams.set("limit", "1");
  if (/^\d{5}$/.test(l.code_postal ?? "")) u.searchParams.set("postcode", l.code_postal);
  try {
    const r = await fetch(u, { signal: AbortSignal.timeout(8000) });
    if (!r.ok) return null;
    const c = (await r.json())?.features?.[0]?.geometry?.coordinates;
    return Array.isArray(c) && c.length === 2 ? { lat: c[1], lng: c[0] } : null;
  } catch {
    return null;
  }
}

export interface LigneJournal { texte: string; niveau: Niveau }

/**
 * Cherche ce qui manque pour un praticien. `departements` : ceux où chercher la fiche
 * Google (par défaut, ceux de ses lieux d'exercice). Ne touche jamais un choix déjà
 * fait par un opérateur (statuts autres que « a_chercher »).
 */
export async function chercherLiens(db: any, praticienId: string, departements?: string[]): Promise<LigneJournal[]> {
  const lignes: LigneJournal[] = [];
  const { data: p } = await db.from("admin_reseau_praticiens").select(SELECT).eq("id", praticienId).maybeSingle();
  if (!p || p.etat === "exclu") return lignes;
  const qui = `${p.prenom} ${p.nom}`;
  const lieux: any[] = p.admin_reseau_lieux ?? [];
  const deps = departements?.length ? departements : [...new Set(lieux.map((l) => l.departement).filter(Boolean))] as string[];

  // 1. Carte : coordonnées des lieux, une seule tentative par lieu.
  for (const l of lieux.filter((x) => x.lat == null && !x.geo_tente)) {
    const g = await geocoder(l);
    await db.from("admin_reseau_lieux").update({ ...(g ?? {}), geo_tente: true }).eq("id", l.id);
  }

  // 2. Fiches Google, dans le département concerné.
  if (p.google_statut === "a_chercher" && cleGoogle()) {
    if (!(await compterAppel(db, "recherche"))) {
      lignes.push({ texte: `Quota Google du jour atteint : ${qui} sera cherché demain`, niveau: "ecarte" });
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
  if (p.doctolib_statut === "a_chercher" && Deno.env.get("ANTHROPIC_API_KEY")) {
    if (!(await compterAppel(db, "doctolib"))) {
      lignes.push({ texte: `Quota Doctolib du jour atteint : ${qui} sera cherché demain`, niveau: "ecarte" });
    } else {
      const communes = [...new Set(lieux.map((l) => l.commune).filter(Boolean))] as string[];
      const c = choisirDoctolib(await urlsDoctolib({ nom: p.nom, prenom: p.prenom, population: p.population, communes }), { nom: p.nom, prenom: p.prenom, communes });
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
