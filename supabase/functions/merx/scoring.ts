// Grille de notation des prospects d'AvisDoc — arrêtée avec Olivier le 12/09/2026 « pour commencer, on
// améliorera ensuite ». Trois catégories, six critères, 100 points. Un critère sans information vaut 0 point
// et s'affiche « non évalué » : rien n'est deviné.
// Deux critères sont jugés par le modèle (exposition au soleil, sensibilité santé au travail), avec une
// justification et une source ; les quatre autres sont calculés ici, à partir de données vérifiables.

export type Category = "sante" | "commercial" | "faisabilite";
export type CriterionId = "soleil" | "sante_travail" | "salaries" | "interlocuteur" | "sites" | "zone";

export const CATEGORIES: { id: Category; label: string; criteria: CriterionId[] }[] = [
  { id: "sante", label: "Santé", criteria: ["soleil", "sante_travail"] },
  { id: "commercial", label: "Commercial", criteria: ["salaries", "interlocuteur", "sites"] },
  { id: "faisabilite", label: "Faisabilité", criteria: ["zone"] },
];

export const CRITERIA: Record<CriterionId, { label: string; max: number }> = {
  soleil: { label: "Concernés par le dépistage", max: 35 },
  sante_travail: { label: "Sensibilité santé au travail", max: 10 },
  salaries: { label: "Nombre de salariés", max: 20 },
  interlocuteur: { label: "Interlocuteur trouvé", max: 10 },
  sites: { label: "Plusieurs sites", max: 10 },
  zone: { label: "Zone géographique", max: 15 },
};

/** Note d'un critère : null = non évalué (0 point). */
export interface CriterionScore {
  points: number | null;
  justification: string;
  source: string | null;
}
export type Score = Partial<Record<CriterionId, CriterionScore>>;

// Zones où AvisDoc peut organiser des journées de dépistage (Olivier, 12/09/2026 : « on améliorera ») :
// Gironde, Île-de-France, Occitanie, Provence-Alpes-Côte d'Azur. Départements relevés sur geo.api.gouv.fr.
export const COVERED_ZONES: { label: string; departments: string[] }[] = [
  { label: "Gironde", departments: ["33"] },
  { label: "Île-de-France", departments: ["75", "77", "78", "91", "92", "93", "94", "95"] },
  { label: "Occitanie", departments: ["09", "11", "12", "30", "31", "32", "34", "46", "48", "65", "66", "81", "82"] },
  { label: "Provence-Alpes-Côte d'Azur", departments: ["04", "05", "06", "13", "83", "84"] },
];

export type SunLevel = "majorite_dehors" | "partie_dehors" | "interieur" | "non_evalue";
const SUN_POINTS: Record<SunLevel, number | null> = { majorite_dehors: 35, partie_dehors: 15, interieur: 0, non_evalue: null };

/**
 * Le second chemin vers le critère médical premier.
 *
 * Un institut de beauté, une pharmacie, un laboratoire de dermatologie n'ont
 * personne au soleil : avec la seule exposition, ils sortaient à quinze sur cent et
 * le commercial les écartait. Or ce sont des cibles — leur métier touche la peau,
 * le sujet leur parle, et ils orientent leurs clients.
 *
 * On ne crée pas un septième critère : on ouvre une seconde porte vers le même.
 */
export type AffinityLevel = "metier_de_la_peau" | "secteur_sante" | "aucune" | "non_evalue";
const AFFINITY_POINTS: Record<AffinityLevel, number | null> = {
  metier_de_la_peau: 35, // esthétique, dermatologie, protection solaire : le sujet EST leur métier
  secteur_sante: 20, // santé ou bien-être au sens large : le sujet leur parle
  aucune: 0,
  non_evalue: null,
};

/**
 * Concernés par le dépistage : par l'exposition de leurs salariés, ou par leur métier.
 * On retient le meilleur des deux — une entreprise n'a pas à cumuler pour être une cible.
 */
export function sunScore(
  level: SunLevel,
  justification: string,
  source: string | null,
  affinity?: { niveau: AffinityLevel; justification: string; source: string | null },
): CriterionScore {
  const parSoleil = SUN_POINTS[level];
  const parMetier = affinity ? AFFINITY_POINTS[affinity.niveau] : null;

  if (parMetier !== null && (parSoleil === null || parMetier > parSoleil)) {
    return { points: parMetier, justification: affinity!.justification, source: affinity!.source };
  }
  return { points: parSoleil, justification, source };
}

export function healthScore(found: boolean, justification: string, source: string | null): CriterionScore {
  return found ? { points: 10, justification, source } : { points: null, justification: "Aucune démarche publiée trouvée.", source: null };
}

// Paliers sur les tranches INSEE de l'entreprise entière : 250 et plus 20 ; 100 à 249 15 ; 50 à 99 10 ;
// 10 à 49 5 ; moins de 10 0.
const SIZE_POINTS: Record<string, number> = {
  "53": 20, "52": 20, "51": 20, "42": 20, "41": 20, "32": 20,
  "31": 15, "22": 15,
  "21": 10,
  "12": 5, "11": 5,
  "03": 0, "02": 0, "01": 0, "00": 0, NN: 0,
};

export function sizeScore(band: string | null, label: string | null, year: number | null): CriterionScore {
  if (!band || !(band in SIZE_POINTS)) return { points: null, justification: "Effectif non connu de l'annuaire officiel.", source: null };
  return { points: SIZE_POINTS[band], justification: `${label ?? band}${year ? ` (donnée ${year})` : ""}, annuaire officiel.`, source: null };
}

export function sitesScore(openEstablishments: number | null): CriterionScore {
  if (openEstablishments === null) return { points: null, justification: "Nombre de sites non connu.", source: null };
  const points = openEstablishments >= 3 ? 10 : openEstablishments === 2 ? 5 : 0;
  return { points, justification: `${openEstablishments} établissement${openEstablishments > 1 ? "s" : ""} ouvert${openEstablishments > 1 ? "s" : ""}, annuaire officiel.`, source: null };
}

export function zoneScore(departments: (string | null)[]): CriterionScore {
  const known = departments.filter((d): d is string => Boolean(d));
  if (!known.length) return { points: null, justification: "Département non connu.", source: null };
  const zone = COVERED_ZONES.find((z) => known.some((d) => z.departments.includes(d)));
  return zone ? { points: 15, justification: `Présente en zone couverte : ${zone.label}.`, source: null } : { points: 0, justification: "Hors des zones couvertes par AvisDoc.", source: null };
}

export function contactScore(contact: { name: string; role: string; source: string } | null, hasLeader: boolean): CriterionScore {
  if (contact) return { points: 10, justification: `${contact.name}${contact.role ? `, ${contact.role}` : ""}.`, source: contact.source };
  if (hasLeader) return { points: 5, justification: "Seulement le dirigeant inscrit à l'annuaire officiel.", source: null };
  return { points: null, justification: "Aucun interlocuteur trouvé.", source: null };
}

export function total(score: Score): number {
  return Object.values(score).reduce((sum, c) => sum + (c?.points ?? 0), 0);
}

// Secteurs du kanban Prospects (Olivier, 12/09/2026 : « vas-y on ajustera »).
export const SECTORS = [
  { id: "btp", label: "Travaux publics et BTP" },
  { id: "espaces_verts", label: "Espaces verts" },
  { id: "agriculture", label: "Agriculture et viticulture" },
  { id: "collectivites", label: "Collectivités" },
  { id: "sante_beaute", label: "Santé et beauté" },
  { id: "autre", label: "Autre" },
] as const;

export type Sector = (typeof SECTORS)[number]["id"];
export const isSector = (v: string): v is Sector => SECTORS.some((s) => s.id === v);
