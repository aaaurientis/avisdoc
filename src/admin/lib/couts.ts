// Ce que coûte Merx, calculé sur la consommation réellement mesurée à chaque demande
// (`admin_merx_demandes.usage`) : jetons d'entrée, jetons de sortie, recherches web.
//
// Les tarifs ci-dessous sont RELEVÉS, pas devinés. S'ils changent, on les corrige ici et tout
// l'écran se recalcule — c'est pourquoi le coût n'est pas figé en base.

/** Tarifs des modèles, en dollars par million de jetons. Relevé du 22/09/2026. */
export const TARIFS_MODELE: Record<string, { entree: number; sortie: number }> = {
  "claude-haiku-4-5": { entree: 1, sortie: 5 },
  "claude-sonnet-5": { entree: 2, sortie: 10 },
  "claude-opus-5": { entree: 5, sortie: 25 },
};

/** Modèle utilisé par Merx (variable MERX_MODEL de la fonction). */
export const MODELE_PAR_DEFAUT = "claude-haiku-4-5";

/**
 * Recherche web : 10 $ pour 1 000 recherches, en plus des jetons.
 * Source : documentation Anthropic de l'outil de recherche web, relevée le 22/09/2026.
 * Une recherche en erreur n'est pas facturée.
 */
export const TARIF_RECHERCHE_WEB = 10 / 1000;

export interface Consommation {
  inputTokens?: number;
  outputTokens?: number;
  webSearches?: number;
}

export interface Detail {
  entree: number;
  sortie: number;
  recherches: number;
  total: number;
}

/** Le coût d'une demande, poste par poste. */
export function coutDe(usage: Consommation | null | undefined, modele = MODELE_PAR_DEFAUT): Detail {
  const tarif = TARIFS_MODELE[modele] ?? TARIFS_MODELE[MODELE_PAR_DEFAUT];
  const entree = ((usage?.inputTokens ?? 0) / 1_000_000) * tarif.entree;
  const sortie = ((usage?.outputTokens ?? 0) / 1_000_000) * tarif.sortie;
  const recherches = (usage?.webSearches ?? 0) * TARIF_RECHERCHE_WEB;
  return { entree, sortie, recherches, total: entree + sortie + recherches };
}

/** Un montant en dollars, lisible même quand il est minuscule. */
export function euroDollar(montant: number): string {
  if (montant === 0) return "0 $";
  if (montant < 0.01) return `${montant.toFixed(4)} $`;
  if (montant < 1) return `${montant.toFixed(3)} $`;
  return `${montant.toFixed(2)} $`;
}
