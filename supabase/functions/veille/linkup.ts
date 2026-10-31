// Rester sous le plafond mensuel de Linkup : chaque tournée quotidienne a droit à sa part de ce qui reste
// dans le mois, et ce qui dépasse s'enlève en commençant par les réseaux sociaux (décision d'Olivier, 31/10).

const SUPPORTS_PAR_RANG = ["facebook", "instagram", "x", "youtube", "linkedin"];

/** La part d'aujourd'hui : ce qui reste du mois, réparti sur les jours restants (aujourd'hui compris). */
export function partDuJour(deja: number, plafond: number, joursRestants: number) {
  return Math.max(0, Math.floor((plafond - deja) / Math.max(1, joursRestants)));
}

/** L'ordre d'enlèvement : d'abord les réseaux, puis la presse régionale, le reste en dernier. */
function rang(cle: string) {
  const reseau = SUPPORTS_PAR_RANG.indexOf(cle.startsWith("linkup:expression:") ? cle.split(":")[3] ?? "" : "");
  if (reseau >= 0) return reseau;
  if (cle.startsWith("linkup:reseau:") || cle.startsWith("linkedin:")) return SUPPORTS_PAR_RANG.length;
  if (cle.startsWith("site-pqr-")) return SUPPORTS_PAR_RANG.length + 1;
  return SUPPORTS_PAR_RANG.length + 2;
}

/** Garde au plus `part` recherches Linkup ; les étapes qui ne passent pas par Linkup restent toutes. */
export function reduire<T extends { cle: string }>(etapes: T[], parLinkup: (e: T) => boolean, part: number) {
  const linkup = etapes.filter(parLinkup);
  const trop = linkup.length - part;
  if (trop <= 0) return { gardees: etapes, enlevees: 0 };
  const parties = new Set([...linkup].sort((a, b) => rang(a.cle) - rang(b.cle)).slice(0, trop));
  return { gardees: etapes.filter((e) => !parties.has(e)), enlevees: parties.size };
}
