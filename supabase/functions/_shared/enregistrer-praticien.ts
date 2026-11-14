// Enregistre un praticien candidat venu d'ailleurs que l'import d'un département
// (ajout par RPPS, généraliste repéré par la recherche IA). Mêmes règles que
// l'import : un praticien par RPPS, jamais un exclu, rattaché aux contacts existants.

/* eslint-disable @typescript-eslint/no-explicit-any */
import type { PraticienRpps } from "./reseau-rpps.ts";

export type ResultatEnregistrement =
  | { statut: "cree"; id: string }
  | { statut: "deja_la"; id: string }
  | { statut: "exclu" };

export async function enregistrerPraticien(
  db: any,
  p: PraticienRpps,
  opts: { origine: "manuel" | "ia"; acteur: string; extraitLe: string | null; detail?: Record<string, unknown> },
): Promise<ResultatEnregistrement> {
  const [{ data: exclu }, { data: deja }, { data: contact }] = await Promise.all([
    db.from("admin_reseau_exclusions").select("rpps").eq("rpps", p.rpps).maybeSingle(),
    db.from("admin_reseau_praticiens").select("id, etat").eq("rpps", p.rpps).maybeSingle(),
    db.from("admin_network_contacts").select("id").eq("rpps", p.rpps).limit(1),
  ]);
  if (exclu || deja?.etat === "exclu") return { statut: "exclu" };
  if (deja) return { statut: "deja_la", id: deja.id };

  const { data: cree, error } = await db
    .from("admin_reseau_praticiens")
    .insert({
      rpps: p.rpps, civilite: p.civilite, nom: p.nom, prenom: p.prenom,
      population: p.population, roles: p.roles, specialites: p.specialites,
      origine: opts.origine, contact_id: contact?.[0]?.id ?? null,
      rpps_extrait_le: opts.extraitLe, vu_au_dernier_import: true,
    })
    .select("id")
    .single();
  if (error) {
    // Course avec un import simultané : le praticien existe désormais, on le reprend.
    if (/duplicate|unique/i.test(error.message)) {
      const { data: d } = await db.from("admin_reseau_praticiens").select("id").eq("rpps", p.rpps).single();
      return { statut: "deja_la", id: d.id };
    }
    throw new Error(error.message);
  }

  if (p.lieux.length) {
    const { error: eL } = await db.from("admin_reseau_lieux").insert(p.lieux.map((l) => ({
      praticien_id: cree.id, departement: l.departement, cle: l.cle,
      raison_sociale: l.raisonSociale, adresse: l.adresse, code_postal: l.codePostal,
      commune: l.commune, code_commune: l.codeCommune, telephone: l.telephone,
      mode_exercice: l.modeExercice, secteur: l.secteur, finess: l.finess, siret: l.siret,
      rpps_extrait_le: opts.extraitLe,
    })));
    if (eL) throw new Error(eL.message);
  }
  await db.from("admin_reseau_historique").insert({
    praticien_id: cree.id, departement: p.lieux[0]?.departement ?? null, acteur: opts.acteur,
    action: opts.origine === "ia" ? "ia_cree" : "ajout_rpps", vers: "identifie", detail: opts.detail ?? null,
  });
  return { statut: "cree", id: cree.id };
}
