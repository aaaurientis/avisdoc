// File de traitement des travaux groupés d'un département, suivie à l'écran comme
// une recherche IA (étape, pourcentage, journal) :
//   • « google_departement » — les liens de chaque praticien : carte, fiches Google,
//     lien Doctolib (chercherLiens) ;
//   • « ia_departement »     — la recherche IA des signaux de chaque praticien.
//
// Une fonction serveur ne peut pas tourner des heures : chaque appel traite des
// praticiens quelques minutes (plusieurs en parallèle), retire de la file ceux qui
// sont faits, puis se relance lui-même (fonction `reseau-file`, action « suite »)
// tant qu'il en reste. L'opérateur peut arrêter la tâche à tout moment.

/* eslint-disable @typescript-eslint/no-explicit-any */
import { A_RAPPROCHER, chercherLiens, type Volet } from "./liens.ts";
import { echouer, rechercherPraticien } from "./ia.ts";
import { enTacheDeFond, Suivi } from "./suivi.ts";

export type TypeFile = "google_departement" | "ia_departement";

const PARALLELE: Record<TypeFile, number> = { google_departement: 4, ia_departement: 3 };
/** Au-delà, on ne commence plus de nouveau lot dans cet appel : on passe la main à l'appel suivant. */
const BUDGET_MS: Record<TypeFile, number> = { google_departement: 150_000, ia_departement: 120_000 };
/** Une recherche IA de moins de 30 jours n'est pas relancée (sauf demande expresse). */
const JOURS_IA_RECENTE = 30;

/** Les praticiens du département à traiter. */
export async function praticiensATraiter(
  db: any, type: TypeFile, departement: string, opts: { inclureRecents?: boolean; volet?: Volet } = {},
): Promise<string[]> {
  const { data: lieux } = await db.from("admin_reseau_lieux").select("praticien_id, lat, geo_tente").eq("departement", departement).limit(20000);
  const ici = [...new Set<string>((lieux ?? []).map((l: any) => l.praticien_id as string))];
  const sansGeo = new Set((lieux ?? []).filter((l: any) => l.lat == null && !l.geo_tente).map((l: any) => l.praticien_id));
  const out: string[] = [];
  for (let i = 0; i < ici.length; i += 200) {
    const { data, error } = await db.from("admin_reseau_praticiens")
      .select("id, google_statut, doctolib_statut").in("id", ici.slice(i, i + 200)).neq("etat", "exclu");
    if (error) throw new Error(error.message);
    for (const p of data ?? []) {
      if (type === "ia_departement") out.push(p.id);
      else {
        const v = opts.volet ?? "tout";
        const a = v === "google" ? p.google_statut === "a_chercher"
          : v === "doctolib" ? p.doctolib_statut === "a_chercher"
          : v === "rapprochement" ? A_RAPPROCHER.includes(p.google_statut)
          : p.google_statut === "a_chercher" || p.doctolib_statut === "a_chercher" || sansGeo.has(p.id);
        if (a) out.push(p.id);
      }
    }
  }
  if (type === "ia_departement" && !opts.inclureRecents && out.length) {
    const depuis = new Date(Date.now() - JOURS_IA_RECENTE * 86_400_000).toISOString();
    const recents = new Set<string>();
    for (let i = 0; i < out.length; i += 200) {
      const { data } = await db.from("admin_reseau_recherches_ia").select("praticien_id")
        .eq("type", "praticien").in("praticien_id", out.slice(i, i + 200)).gt("debut", depuis).neq("statut", "echec");
      for (const r of data ?? []) recents.add(r.praticien_id);
    }
    return out.filter((id) => !recents.has(id));
  }
  return out;
}

/** Crée la tâche et commence le travail en tâche de fond. Une seule tâche du même type à la fois par département. */
export async function lancerFile(
  db: any, type: TypeFile, departement: string, ids: string[], acteur: string, volet: Volet = "tout",
): Promise<{ id: string; total: number; deja: boolean } | null> {
  const { data: enCours } = await db.from("admin_reseau_recherches_ia").select("id, file")
    .eq("departement", departement).eq("type", type).eq("statut", "en_cours").limit(1);
  if (enCours?.length) return { id: enCours[0].id, total: enCours[0].file?.length ?? 0, deja: true };
  if (!ids.length) return null;
  const { data: r, error } = await db.from("admin_reseau_recherches_ia").insert({
    type, departement, lance_par: acteur, file: ids,
    resultat: { total: ids.length, faits: 0, ...(type === "google_departement" ? { volet } : {}) },
    etape: "En attente", progression: 0,
  }).select("id").single();
  if (error) throw new Error(error.message);
  enTacheDeFond(traiterFile(db, r.id));
  return { id: r.id, total: ids.length, deja: false };
}

/** Relance la fonction pour poursuivre la file (nouvel appel, nouveau temps d'exécution). */
async function relancer(id: string) {
  const cle = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  await fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/reseau-file`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${cle}`, "x-reseau-interne": cle },
    body: JSON.stringify({ action: "suite", job_id: id }),
  }).catch((e) => console.error("relance de la file", e));
}

async function traiterUn(db: any, type: TypeFile, praticienId: string, acteur: string, departement: string, volet: Volet): Promise<{ texte: string; niveau: any }[]> {
  if (type === "google_departement") return await chercherLiens(db, praticienId, [departement], volet);

  // Recherche IA d'un praticien : elle a son propre suivi, visible sur sa fiche.
  const { data: p } = await db.from("admin_reseau_praticiens")
    .select("id, rpps, nom, prenom, population, etat, admin_reseau_lieux(raison_sociale, commune)").eq("id", praticienId).maybeSingle();
  if (!p || p.etat === "exclu") return [];
  const { data: r, error } = await db.from("admin_reseau_recherches_ia")
    .insert({ type: "praticien", praticien_id: p.id, lance_par: acteur }).select("id").single();
  if (error) throw new Error(error.message);
  const suivi = new Suivi(db, r.id);
  try {
    await rechercherPraticien(db, r.id, p, acteur, suivi);
    const { data: fin } = await db.from("admin_reseau_recherches_ia").select("resultat").eq("id", r.id).single();
    const n = fin?.resultat?.retenues ?? 0;
    return [{ texte: `IA : ${p.prenom} ${p.nom} : ${n} proposition${n > 1 ? "s" : ""} à valider`, niveau: n ? "ok" : "info" }];
  } catch (e) {
    await echouer(db, r.id, suivi, e);
    return [{ texte: `IA : ${p.prenom} ${p.nom} : échec`, niveau: "ecarte" }];
  }
}

export async function traiterFile(db: any, id: string): Promise<void> {
  const debut = Date.now();
  const { data: job } = await db.from("admin_reseau_recherches_ia").select("*").eq("id", id).maybeSingle();
  if (!job || job.statut !== "en_cours") return;
  const type = job.type as TypeFile;
  const total: number = job.resultat?.total ?? job.file?.length ?? 0;
  let faits: number = job.resultat?.faits ?? 0;
  const suivi = new Suivi(db, id, { etape: job.etape, progression: job.progression, journal: job.journal });
  const volet: Volet = job.resultat?.volet ?? "tout";
  const libelle = type === "ia_departement" ? "Recherche IA"
    : ({ tout: "Carte, fiches Google et Doctolib", google: "Fiches Google Maps", doctolib: "Liens Doctolib", rapprochement: "Rapprochement Google / RPPS" } as const)[volet];

  try {
    while (Date.now() - debut < BUDGET_MS[type]) {
      const { data: etat } = await db.from("admin_reseau_recherches_ia").select("statut, file").eq("id", id).single();
      if (!etat || etat.statut !== "en_cours") return; // arrêtée par l'opérateur
      const file: string[] = etat.file ?? [];
      if (!file.length) break;
      const lot = file.slice(0, PARALLELE[type]);
      await suivi.maj({ etape: `${libelle} : ${faits + 1} à ${Math.min(total, faits + lot.length)} sur ${total}`, progression: (100 * faits) / Math.max(1, total) });
      const resultats = await Promise.all(lot.map((pid) =>
        traiterUn(db, type, pid, job.lance_par, job.departement, volet).catch((e) => [{ texte: `Erreur : ${e instanceof Error ? e.message : String(e)}`, niveau: "ecarte" }])));
      faits += lot.length;
      // Retirer de la file ce qui est fait (relecture : la file a pu changer entre-temps).
      const { data: actuel } = await db.from("admin_reseau_recherches_ia").select("file").eq("id", id).single();
      const restant = (actuel?.file ?? []).filter((x: string) => !lot.includes(x));
      await db.from("admin_reseau_recherches_ia").update({ file: restant, resultat: { ...(job.resultat ?? {}), total, faits } }).eq("id", id);
      for (const l of resultats.flat()) await suivi.maj({ ligne: l.texte, niveau: l.niveau });
      await suivi.maj({ progression: (100 * faits) / Math.max(1, total) });
      if (!restant.length) break;
    }

    const { data: fin } = await db.from("admin_reseau_recherches_ia").select("statut, file").eq("id", id).single();
    if (fin?.statut !== "en_cours") return;
    if ((fin.file ?? []).length) {
      await suivi.attendre();
      await relancer(id);
      return;
    }
    await suivi.maj({ ligne: `Terminé : ${faits} praticien${faits > 1 ? "s" : ""} traité${faits > 1 ? "s" : ""}`, niveau: "ok" });
    await suivi.attendre();
    await db.from("admin_reseau_recherches_ia").update({
      statut: "termine", fin: new Date().toISOString(), etape: "Terminé", progression: 100,
      resultat: { ...(job.resultat ?? {}), total, faits },
    }).eq("id", id);
  } catch (e) {
    await echouer(db, id, suivi, e);
  }
}
