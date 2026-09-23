// La corbeille du Commercial : prospects, affaires et fiches clients supprimés.
//
// Supprimer pose une date. La fiche quitte son tableau, se retrouve ici, et se
// restaure d'un clic. Ce qui a dépassé la garde part pour de bon — la purge se fait à
// l'ouverture de l'écran, sans tâche planifiée à surveiller.

import { supabaseAdmin } from "../data/supabaseAdmin";

/**
 * Trente jours : on ne s'aperçoit pas toujours en deux semaines qu'un dossier manque,
 * surtout si la personne qui l'a jeté est partie entre-temps.
 */
export const JOURS_DE_GARDE = 30;

export type Origine = "prospect" | "affaire" | "client" | "note";

const TABLE: Record<Origine, string> = {
  prospect: "admin_prospects",
  affaire: "admin_clients",
  client: "admin_accounts",
  note: "admin_notes_dictees",
};

export const LIBELLE: Record<Origine, string> = {
  prospect: "Prospection",
  affaire: "Pipeline",
  client: "Clients",
  note: "Débrief",
};

export interface Jetee {
  id: string;
  origine: Origine;
  nom: string;
  detail: string | null;
  supprimeLe: string;
}

/** Le jour où une fiche jetée aujourd'hui partira définitivement. */
export const purgeLe = (supprimeLe: string) =>
  new Date(new Date(supprimeLe).getTime() + JOURS_DE_GARDE * 86_400_000);

export const joursRestants = (supprimeLe: string) =>
  Math.max(0, Math.ceil((purgeLe(supprimeLe).getTime() - Date.now()) / 86_400_000));

/** Met à la corbeille. Rien n'est détruit. */
export async function jeter(origine: Origine, ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  const { error } = await supabaseAdmin
    .from(TABLE[origine])
    .update({ deleted_at: new Date().toISOString() })
    .in("id", ids);
  if (error) throw new Error(error.message);
}

/** Remet une fiche dans son tableau. */
export async function restaurer(origine: Origine, ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  const { error } = await supabaseAdmin.from(TABLE[origine]).update({ deleted_at: null }).in("id", ids);
  if (error) throw new Error(error.message);
}

/** Supprime pour de bon. Sans retour possible. */
export async function detruire(origine: Origine, ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  // Une note emporte son enregistrement : sans cela, la voix resterait au coffre
  // indéfiniment, invisible et payée.
  if (origine === "note") await effacerLesAudios(ids);
  const { error } = await supabaseAdmin.from(TABLE[origine]).delete().in("id", ids);
  if (error) throw new Error(error.message);
}

/** Retire du coffre les enregistrements des notes qu'on s'apprête à détruire. */
async function effacerLesAudios(ids: string[]): Promise<void> {
  const { data } = await supabaseAdmin.from("admin_notes_dictees").select("audio_path").in("id", ids);
  const chemins = (data ?? []).map((n) => n.audio_path as string | null).filter(Boolean) as string[];
  if (chemins.length > 0) await supabaseAdmin.storage.from("admin-dictee").remove(chemins);
}

/** Tout ce qui est à la corbeille, du plus récemment jeté au plus ancien. */
export async function chargerCorbeille(monEmail?: string): Promise<Jetee[]> {
  // Les débriefs de l'équipe se lisent (migration 0039), mais ne se restaurent que
  // par leur auteur : montrer ceux des autres ici n'offrirait qu'un bouton qui échoue.
  const mesNotes = supabaseAdmin
    .from("admin_notes_dictees")
    .select("id, titre, duree_s, audio_path, deleted_at")
    .not("deleted_at", "is", null);

  const [prospects, affaires, clients, notes] = await Promise.all([
    supabaseAdmin.from("admin_prospects").select("id, name, city, activity, deleted_at").not("deleted_at", "is", null),
    supabaseAdmin.from("admin_clients").select("id, company, ville, stage, deleted_at").not("deleted_at", "is", null),
    supabaseAdmin.from("admin_accounts").select("id, name, sector, deleted_at").not("deleted_at", "is", null),
    monEmail ? mesNotes.ilike("owner_email", monEmail) : mesNotes,
  ]);

  const lignes: Jetee[] = [
    ...((prospects.data ?? []) as { id: string; name: string; city: string | null; activity: string | null; deleted_at: string }[]).map(
      (p) => ({
        id: p.id,
        origine: "prospect" as const,
        nom: p.name,
        detail: [p.activity, p.city].filter(Boolean).join(" · ") || null,
        supprimeLe: p.deleted_at,
      }),
    ),
    ...((affaires.data ?? []) as { id: string; company: string; ville: string | null; stage: string; deleted_at: string }[]).map((c) => ({
      id: c.id,
      origine: "affaire" as const,
      nom: c.company,
      detail: [c.stage, c.ville].filter(Boolean).join(" · ") || null,
      supprimeLe: c.deleted_at,
    })),
    ...((notes.data ?? []) as { id: string; titre: string | null; duree_s: number | null; audio_path: string | null; deleted_at: string }[]).map(
      (n) => ({
        id: n.id,
        origine: "note" as const,
        nom: n.titre ?? "Débrief",
        detail: [n.duree_s != null ? `${n.duree_s} s` : null, n.audio_path ? "avec l’enregistrement" : "texte seul"]
          .filter(Boolean)
          .join(" · "),
        supprimeLe: n.deleted_at,
      }),
    ),
    ...((clients.data ?? []) as { id: string; name: string; sector: string | null; deleted_at: string }[]).map((a) => ({
      id: a.id,
      origine: "client" as const,
      nom: a.name,
      detail: a.sector,
      supprimeLe: a.deleted_at,
    })),
  ];

  return lignes.sort((x, y) => new Date(y.supprimeLe).getTime() - new Date(x.supprimeLe).getTime());
}

/** Un champ de la fiche, tel qu'on le montre avant de décider. */
export interface Champ {
  label: string;
  valeur: string;
}

/** Les destinations possibles d'une restauration : on avance dans le parcours, jamais l'inverse. */
export const DESTINATIONS: Record<Origine, { cle: Origine; label: string; ou: string }[]> = {
  prospect: [{ cle: "prospect", label: "Prospection", ou: "Elle reprend sa place parmi les fiches trouvées par Merx." }],
  affaire: [{ cle: "affaire", label: "Pipeline", ou: "Elle retrouve la colonne qu’elle occupait, sans rien perdre." }],
  client: [{ cle: "client", label: "Clients", ou: "Elle reprend sa place dans le fichier commun de l’équipe." }],
  note: [{ cle: "note", label: "Débrief", ou: "Elle réapparaît dans ce que vous avez raconté, avec son enregistrement." }],
};

const vide = (v: unknown) => v === null || v === undefined || String(v).trim() === "" || String(v) === "{}";

/** Les libellés des colonnes, pour que la fiche se lise sans connaître la base. */
const LIBELLES: Record<string, string> = {
  name: "Entreprise", company: "Entreprise", legal_name: "Raison sociale", siren: "SIREN", siret: "SIRET",
  naf: "Code NAF", activity: "Activité", sector: "Secteur", city: "Ville", ville: "Ville",
  department: "Département", code_postal: "Code postal", adresse: "Adresse", website: "Site",
  effectif: "Effectif", headcount_band: "Tranche d’effectif", rationale: "Pourquoi c’est une cible",
  approach: "Angle d’approche", contact_name: "Interlocuteur", contact_role: "Fonction",
  contact_email: "E-mail", contact_phone: "Téléphone", score_total: "Note", status: "Statut",
  stage: "Étape", jours: "Journées", tarif: "Tarif par journée", statut_propo: "Proposition",
  depistes: "Dépistés", orientes: "Orientés", signed_on: "Client depuis", created_at: "Créée le",
  enriched_at: "Approfondie le", converted_at: "Passée au Pipeline le", owner_email: "Trouvée par",
};

/** Les champs lisibles d'une ligne, dans l'ordre où ils viennent. */
function champsDe(ligne: Record<string, unknown>, libelles: Record<string, string>): Champ[] {
  const champs: Champ[] = [];
  for (const [cle, brut] of Object.entries(ligne)) {
    if (["id", "deleted_at", "updated_at", "score", "sources", "leaders", "head_office", "site_contacts", "data"].includes(cle)) continue;
    if (vide(brut)) continue;
    const label = libelles[cle];
    if (!label) continue;
    const valeur = /_at$|^signed_on$/.test(cle) ? new Date(String(brut)).toLocaleDateString("fr-FR") : String(brut);
    champs.push({ label, valeur });
  }

  // Les colonnes libres du fichier client vivent dans `data`.
  const libres = ligne.data as Record<string, string> | undefined;
  if (libres && typeof libres === "object") {
    for (const [cle, v] of Object.entries(libres)) if (!vide(v)) champs.push({ label: cle, valeur: String(v) });
  }
  return champs;
}

/**
 * Ce que porte une fiche jetée, pour décider en connaissance de cause.
 *
 * Une fiche du fichier client ne porte souvent que son nom et sa date : tout ce qu'on
 * sait de l'entreprise — SIREN, adresse, journées, montant — est sur l'AFFAIRE dont
 * elle vient. On va donc la chercher, sinon on ne montre rien d'utile.
 */
export async function chargerDetail(origine: Origine, id: string): Promise<Champ[]> {
  const { data, error } = await supabaseAdmin.from(TABLE[origine]).select("*").eq("id", id).maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return [];

  const ligne = data as Record<string, unknown>;
  const champs = champsDe(ligne, LIBELLES);

  const affaireLiee = origine === "client" ? (ligne.client_id as string | null) : null;
  if (affaireLiee) {
    const { data: affaire } = await supabaseAdmin.from("admin_clients").select("*").eq("id", affaireLiee).maybeSingle();
    if (affaire) {
      const vus = new Set(champs.map((c) => c.label));
      for (const c of champsDe(affaire as Record<string, unknown>, LIBELLES)) if (!vus.has(c.label)) champs.push(c);
    }
  }

  return champs;
}

/** L'étape du Pipeline où une affaire retournera : on le dit avant de restaurer. */
export async function etapeDeLAffaire(id: string): Promise<string | null> {
  const { data } = await supabaseAdmin.from("admin_clients").select("stage").eq("id", id).maybeSingle();
  return (data?.stage as string) ?? null;
}
