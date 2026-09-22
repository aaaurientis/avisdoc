// La corbeille du Commercial : prospects, affaires et fiches clients supprimés.
//
// Supprimer pose une date. La fiche quitte son tableau, se retrouve ici, et se
// restaure d'un clic. Ce qui a plus de quinze jours part pour de bon — la purge se
// fait à l'ouverture de l'écran, sans tâche planifiée à surveiller.

import { supabaseAdmin } from "../data/supabaseAdmin";

/** Quinze jours : le temps qu'une information arrive ou qu'un collègue se manifeste. */
export const JOURS_DE_GARDE = 15;

export type Origine = "prospect" | "affaire" | "client";

const TABLE: Record<Origine, string> = {
  prospect: "admin_prospects",
  affaire: "admin_clients",
  client: "admin_accounts",
};

export const LIBELLE: Record<Origine, string> = {
  prospect: "Prospection",
  affaire: "Pipeline",
  client: "Clients",
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
  const { error } = await supabaseAdmin.from(TABLE[origine]).delete().in("id", ids);
  if (error) throw new Error(error.message);
}

/**
 * Vide ce qui a dépassé les quinze jours. Appelé à l'ouverture de l'écran : pas de
 * tâche planifiée, donc rien qui puisse tourner dans le vide sans qu'on le sache.
 */
export async function purger(): Promise<number> {
  const limite = new Date(Date.now() - JOURS_DE_GARDE * 86_400_000).toISOString();
  let total = 0;
  for (const table of Object.values(TABLE)) {
    const { data } = await supabaseAdmin.from(table).delete().lt("deleted_at", limite).select("id");
    total += data?.length ?? 0;
  }
  return total;
}

/** Tout ce qui est à la corbeille, du plus récemment jeté au plus ancien. */
export async function chargerCorbeille(): Promise<Jetee[]> {
  const [prospects, affaires, clients] = await Promise.all([
    supabaseAdmin.from("admin_prospects").select("id, name, city, activity, deleted_at").not("deleted_at", "is", null),
    supabaseAdmin.from("admin_clients").select("id, company, ville, stage, deleted_at").not("deleted_at", "is", null),
    supabaseAdmin.from("admin_accounts").select("id, name, sector, deleted_at").not("deleted_at", "is", null),
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
