// Ce que la colonne commune des fiches affiche : les notes.
//
// Une entreprise garde la même fiche du premier repérage au contrat. La colonne dit
// d'un coup d'œil ce qu'elle vaut : qualification et fiabilité.

/** Les trois repères de la fiche. Rien de tout cela n'existe sur une fiche jamais évaluée. */
export interface NotesFiche {
  qualification: number | null;
  fiabilite: number | null;
  approfondieLe: string | null;
}

/** Les notes d'un prospect, d'où qu'on ouvre l'entreprise. */
export const notesDe = (
  p: { score_total: number | null; reliability?: number | null; enriched_at: string | null } | null | undefined,
): NotesFiche | null => (p ? { qualification: p.score_total, fiabilite: p.reliability ?? null, approfondieLe: p.enriched_at } : null);

/** Le ton d'une note de fiabilité sur 10, sur le modèle de celui de la qualification. */
export function tonFiabilite(f: number | null): string {
  if (f === null) return "bg-muted text-muted-foreground";
  if (f >= 8) return "bg-emerald-100 text-emerald-700";
  if (f >= 5) return "bg-amber-100 text-amber-800";
  return "bg-rose-100 text-rose-700";
}

/** Une personne telle que le bloc « Interlocuteurs » l'affiche. */
export interface PersonneFiche {
  id?: string;
  nom: string;
  fonction: string | null;
  email: string | null;
  telephone: string | null;
  aConfirmer?: boolean;
  source?: string | null;
}

/**
 * Les personnes qu'une fiche de prospection connaît : l'interlocuteur retenu, puis
 * toutes celles que Merx a trouvées. `deja` : celles déjà listées (saisies sur
 * l'affaire), qu'on ne répète pas.
 */
export function personnesDuProspect(
  p: {
    contact_name: string | null;
    contact_role: string | null;
    contact_email: string | null;
    contact_phone: string | null;
    personnes: { nom: string; fonction: string | null; email: string | null; telephone: string | null; mobile: string | null; source: string | null; sur: boolean }[] | null;
  } | null | undefined,
  deja: PersonneFiche[] = [],
): PersonneFiche[] {
  if (!p) return [];
  const vus = new Set(deja.map((q) => q.nom.trim().toLowerCase()));
  const sortie: PersonneFiche[] = [];
  // Une même personne peut figurer deux fois (contact principal ET personnes trouvées) :
  // on fusionne, en complétant les cases vides — sans quoi le téléphone trouvé par
  // l'approfondissement disparaissait de la colonne (Olivier, 20/10).
  const garder = (q: PersonneFiche) => {
    const cle = q.nom.trim().toLowerCase();
    if (!cle || vus.has(cle)) return;
    const deja2 = sortie.find((x) => x.nom.trim().toLowerCase() === cle);
    if (deja2) {
      deja2.fonction ||= q.fonction;
      deja2.email ||= q.email;
      deja2.telephone ||= q.telephone;
      if (deja2.aConfirmer && !q.aConfirmer) deja2.aConfirmer = false;
      return;
    }
    sortie.push({ ...q });
  };
  if (p.contact_name) garder({ nom: p.contact_name, fonction: p.contact_role, email: p.contact_email, telephone: p.contact_phone });
  for (const q of p.personnes ?? []) {
    garder({ nom: q.nom, fonction: q.fonction, email: q.email, telephone: q.telephone ?? q.mobile, aConfirmer: !q.sur, source: q.source });
  }
  return sortie;
}
