// Synthèse hebdomadaire, vue par cercle, export. Fonctions pures.
import type { LigneParCercle, StatutContact, SyntheseHebdo } from "../data/types";
import { ORDRE_STATUTS } from "./machineEtats";

/** Ordre de grandeur de référence d'une campagne (note LinkedIn). */
export const REFERENCE_CAMPAGNE = {
  courtiersTravailles: 30,
  tauxAcceptationPct: 30,
  conversations: 10,
  partenariatsMin: 3,
  partenariatsMax: 4,
} as const;

export type EcartReference = "sous" | "dans" | "au_dessus";

/** PR-80 : position d'une valeur par rapport à une cible, avec tolérance en %. */
export function pr80ComparerReference(valeur: number | null | undefined, cible: number, tolerancePct = 20): EcartReference | null {
  if (valeur === null || valeur === undefined || Number.isNaN(valeur)) return null;
  const marge = (cible * tolerancePct) / 100;
  if (valeur < cible - marge) return "sous";
  if (valeur > cible + marge) return "au_dessus";
  return "dans";
}

/** PR-81 : CSV pour tableur (séparateur ;, BOM, CRLF, guillemets). */
export function pr81ExporterCsv(colonnes: string[], lignes: Array<Array<string | number | null | undefined>>): string {
  const cellule = (v: string | number | null | undefined): string => {
    if (v === null || v === undefined) return "";
    const s = String(v);
    return /[";\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const corps = [colonnes, ...lignes].map((l) => l.map(cellule).join(";")).join("\r\n");
  return `\uFEFF${corps}\r\n`;
}

export type CumulSyntheses = { invitations: number; acceptations: number; conversations: number; partenariats: number; tauxAcceptationPct: number | null };

/** PR-82 : cumul de plusieurs semaines, pour la comparaison à la référence. */
export function pr82CumulerSyntheses(syntheses: SyntheseHebdo[]): CumulSyntheses {
  const c = syntheses.reduce(
    (acc, s) => ({
      invitations: acc.invitations + s.invitations,
      acceptations: acc.acceptations + s.acceptations,
      conversations: acc.conversations + s.conversations_ouvertes,
      partenariats: acc.partenariats + s.partenariats,
    }),
    { invitations: 0, acceptations: 0, conversations: 0, partenariats: 0 },
  );
  return { ...c, tauxAcceptationPct: c.invitations > 0 ? Math.round((1000 * c.acceptations) / c.invitations) / 10 : null };
}

export type MatriceCercle = Record<number, Partial<Record<StatutContact, number>> & { total: number }>;

/** PR-83 : matrice cercle × statut à partir de la vue v_par_cercle. */
export function pr83MatriceParCercle(lignes: LigneParCercle[]): MatriceCercle {
  const m: MatriceCercle = {};
  for (const l of lignes) {
    const cercle = l.cercle ?? 0;
    const statut = l.statut;
    const n = l.nombre ?? 0;
    if (!m[cercle]) m[cercle] = { total: 0 };
    if (statut) m[cercle][statut] = (m[cercle][statut] ?? 0) + n;
    m[cercle].total += n;
  }
  return m;
}

/** PR-84 : statuts dans l'ordre du parcours, pour les en-têtes de matrice. */
export function pr84StatutsOrdonnes(): readonly StatutContact[] {
  return ORDRE_STATUTS;
}

/** PR-85 : lundi de la semaine d'une date (ISO). */
export function pr85LundiDe(d: Date): string {
  const jour = (d.getDay() + 6) % 7; // lundi = 0
  const lundi = new Date(d.getFullYear(), d.getMonth(), d.getDate() - jour);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${lundi.getFullYear()}-${p(lundi.getMonth() + 1)}-${p(lundi.getDate())}`;
}
