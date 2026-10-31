// Quelles tournées signaler : échouée, bloquée, ou terminée avec des étapes abandonnées (décision d'Olivier, 31/10).

/** Une tournée pas finie après ce délai est signalée comme bloquée (la quotidienne se termine dans la matinée). */
const TOURNEE_BLOQUEE_H = 4;

export function tourneesEnPanne<T extends { id: string; statut: string; periode_fin: string }, E extends { rapport_id: string }>(recentes: T[], abandons: E[], maintenant: Date) {
  return recentes.map((r) => {
    const fini = r.statut === "termine" || r.statut === "echec";
    const etapes = abandons.filter((e) => e.rapport_id === r.id);
    const bloquee = !fini && maintenant.getTime() - new Date(r.periode_fin).getTime() > TOURNEE_BLOQUEE_H * 3_600_000;
    return { ...r, etapes, bloquee, enPanne: bloquee || (fini && (r.statut === "echec" || etapes.length > 0)) };
  }).filter((r) => r.enPanne);
}
