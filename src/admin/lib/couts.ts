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

/**
 * Modèle retenu quand la demande ne dit pas lequel a servi — les demandes d'avant le
 * 22/09/2026, faites du temps où Merx n'en utilisait qu'un.
 */
export const MODELE_PAR_DEFAUT = "claude-haiku-4-5";

/** Le nom des modèles en clair, pour l'écran des coûts : « claude-opus-5 » ne parle à personne. */
export const NOM_MODELE: Record<string, string> = {
  "claude-haiku-4-5": "Haiku 4.5",
  "claude-sonnet-5": "Sonnet 5",
  "claude-opus-5": "Opus 5",
};

/** Ce que Merx appelle aujourd'hui, par sorte de demande. Affiché dans l'écran des coûts. */
export const MODELES_ACTUELS: Record<string, string> = {
  recherche: "claude-sonnet-5",
  approfondissement: "claude-opus-5",
  email: "claude-sonnet-5",
};

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

/** Un montant en dollars, à la française, lisible même quand il est minuscule. */
export function euroDollar(montant: number): string {
  if (montant === 0) return "0 $";
  const decimales = montant < 0.01 ? 3 : 2;
  return `${montant.toLocaleString("fr-FR", { minimumFractionDigits: decimales, maximumFractionDigits: decimales })} $`;
}

/**
 * Ordres de grandeur affichés AVANT la première mesure, pour que le commercial sache
 * ce qu'il engage en cliquant. Repris des essais réels menés sur la vitrine AvisDoc
 * (approfondissement mesuré entre 0,06 $ et 0,075 $) ; la rédaction d'un e-mail ne fait
 * qu'un appel court, sans recherche web. Dès la première demande enregistrée, c'est la
 * moyenne réellement observée qui s'affiche à la place.
 */
export const ESTIMATIONS: Record<string, number> = {
  approfondissement: 0.07,
  email: 0.005,
};

/** Moyenne observée pour une sorte de demande ; à défaut, l'ordre de grandeur ci-dessus. */
export function coutMoyen(
  demandes: { kind: string; usage: Consommation | null }[],
  kind: string,
): { montant: number; mesure: boolean } {
  const siennes = demandes.filter((d) => d.kind === kind);
  if (!siennes.length) return { montant: ESTIMATIONS[kind] ?? 0, mesure: false };
  const total = siennes.reduce((s, d) => s + coutDe(d.usage).total, 0);
  return { montant: total / siennes.length, mesure: true };
}
