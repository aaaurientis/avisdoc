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
/** Résultat positif (correspondance trouvée, signaux retenus) : pas de nouvelle recherche avant 180 jours (décision du 19/11). */
export const JOURS_SI_POSITIF = 180;

/**
 * Toutes les lignes d'une requête, par pages de 1 000 : au-delà, Supabase tronque la réponse
 * en silence (un département de plus de 1 000 lieux n'était traité qu'en partie).
 */
export async function toutLireServeur<T = any>(page: (de: number, a: number) => PromiseLike<{ data: T[] | null; error: any }>): Promise<T[]> {
  const out: T[] = [];
  for (let de = 0; ; de += 1000) {
    const { data, error } = await page(de, de + 999);
    if (error) throw new Error(error.message);
    out.push(...(data ?? []));
    if (!data || data.length < 1000) return out;
  }
}

/** Sans activité depuis ce délai, une tâche « en cours » est considérée interrompue (fonction arrêtée en route). */
export const INACTIVITE_MAX_MS = 10 * 60_000;

/** Dernière activité d'une tâche : sa dernière ligne de journal, sinon son début. */
export function derniereActivite(job: { debut?: string | null; journal?: { le?: string }[] | null }): number {
  const journal = Array.isArray(job.journal) ? job.journal : [];
  const dates = [job.debut, ...journal.map((l) => l?.le)].map((d) => (d ? Date.parse(d) : NaN)).filter((t) => !Number.isNaN(t));
  return dates.length ? Math.max(...dates) : 0;
}

/**
 * Une fiche Google n'est pas revérifiée (validation) ni recherchée à nouveau (rapprochement) avant
 * ce délai, si rien n'a changé : on ne repaie pas Google pour la même réponse (décision du 19/11).
 */
export const JOURS_SANS_REVERIFIER = 30;

/** Les praticiens dont la validation des fiches trouvées a été tentée récemment, avec les mêmes fiches. */
async function validationsRecentes(db: any, ids: string[], fiches: Map<string, string[]>): Promise<Set<string>> {
  const depuis = new Date(Date.now() - JOURS_SANS_REVERIFIER * 86_400_000).toISOString();
  const out = new Set<string>();
  for (let i = 0; i < ids.length; i += 200) {
    const { data } = await db.from("admin_reseau_historique").select("praticien_id, detail")
      .eq("action", "google_validation_tentee").in("praticien_id", ids.slice(i, i + 200)).gt("le", depuis);
    for (const h of data ?? []) {
      const avant = [...(h.detail?.place_ids ?? [])].sort().join(",");
      const maintenant = [...(fiches.get(h.praticien_id) ?? [])].sort().join(",");
      if (avant === maintenant) out.add(h.praticien_id);
    }
  }
  return out;
}

/** Les praticiens du département à traiter. */
export async function praticiensATraiter(
  db: any, type: TypeFile, departement: string, opts: { inclureRecents?: boolean; volet?: Volet } = {},
): Promise<string[]> {
  const lieux = await toutLireServeur((de, a) =>
    db.from("admin_reseau_lieux").select("praticien_id, lat, geo_tente").eq("departement", departement).order("id").range(de, a));
  const ici = [...new Set<string>((lieux ?? []).map((l: any) => l.praticien_id as string))];
  const sansGeo = new Set((lieux ?? []).filter((l: any) => l.lat == null && !l.geo_tente).map((l: any) => l.praticien_id));
  const out: string[] = [];
  const limite = Date.now() - JOURS_SANS_REVERIFIER * 86_400_000;
  const limitePositif = Date.now() - JOURS_SI_POSITIF * 86_400_000;
  const fichesDe = new Map<string, string[]>();
  for (let i = 0; i < ici.length; i += 200) {
    const { data, error } = await db.from("admin_reseau_praticiens")
      .select("id, google_statut, doctolib_statut, google_cherche_le, google_place_ids").in("id", ici.slice(i, i + 200)).neq("etat", "exclu");
    if (error) throw new Error(error.message);
    for (const p of data ?? []) {
      if (type === "ia_departement") out.push(p.id);
      else {
        const v = opts.volet ?? "tout";
        const a = v === "google" ? p.google_statut === "a_chercher"
          : v === "doctolib" ? p.doctolib_statut === "a_chercher"
          : v === "rapprochement" ? A_RAPPROCHER.includes(p.google_statut)
            // Fiche déjà trouvée (même nom, même code postal) : résultat positif, 180 jours ; sinon 30.
            && !(p.google_cherche_le && Date.parse(p.google_cherche_le) > (p.google_statut === "trouvee_auto" ? limitePositif : limite))
          : v === "validation" ? p.google_statut === "trouvee_auto"
          : p.google_statut === "a_chercher" || p.doctolib_statut === "a_chercher" || sansGeo.has(p.id);
        if (a) out.push(p.id);
        if (a && v === "validation") fichesDe.set(p.id, p.google_place_ids ?? []);
      }
    }
  }
  if (type === "google_departement" && opts.volet === "validation" && out.length) {
    const recentes = await validationsRecentes(db, out, fichesDe);
    return out.filter((id) => !recentes.has(id));
  }
  if (type === "ia_departement" && !opts.inclureRecents && out.length) {
    // Recherche récente (30 jours), ou recherche qui a trouvé des signaux (180 jours) : pas relancée.
    const depuis = new Date(Date.now() - JOURS_SI_POSITIF * 86_400_000).toISOString();
    const limiteIa = Date.now() - JOURS_IA_RECENTE * 86_400_000;
    const recents = new Set<string>();
    for (let i = 0; i < out.length; i += 200) {
      const { data } = await db.from("admin_reseau_recherches_ia").select("praticien_id, debut, resultat")
        .eq("type", "praticien").in("praticien_id", out.slice(i, i + 200)).gt("debut", depuis).neq("statut", "echec");
      for (const r of data ?? []) {
        if (Date.parse(r.debut) > limiteIa || (r.resultat?.retenues ?? 0) > 0) recents.add(r.praticien_id);
      }
    }
    return out.filter((id) => !recents.has(id));
  }
  return out;
}

/** Crée la tâche et commence le travail en tâche de fond. Une seule tâche du même type à la fois par département. */
export async function lancerFile(
  db: any, type: TypeFile, departement: string, ids: string[], acteur: string, volet: Volet = "tout",
): Promise<{ id: string; total: number; deja: boolean } | null> {
  const { data: enCours } = await db.from("admin_reseau_recherches_ia").select("id, file, debut, journal")
    .eq("departement", departement).eq("type", type).eq("statut", "en_cours");
  for (const j of enCours ?? []) {
    // Une tâche sans activité depuis 10 min s'est arrêtée en route : elle ne bloque plus le département.
    if (Date.now() - derniereActivite(j) > INACTIVITE_MAX_MS) {
      const journal = [...(Array.isArray(j.journal) ? j.journal : []),
        { le: new Date().toISOString(), texte: "Interrompue (plus d'activité depuis 10 min) : remplacée par une nouvelle tâche", niveau: "ecarte" }].slice(-40);
      await db.from("admin_reseau_recherches_ia").update({ statut: "echec", fin: new Date().toISOString(), etape: "Interrompue", journal })
        .eq("id", j.id).eq("statut", "en_cours");
      continue;
    }
    return { id: j.id, total: j.file?.length ?? 0, deja: true };
  }
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
    : ({ tout: "Carte, fiches Google et Doctolib", google: "Fiches Google Maps", doctolib: "Liens Doctolib", rapprochement: "Rapprochement Google / RPPS", validation: "Validation des fiches Google trouvées" } as const)[volet];

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
