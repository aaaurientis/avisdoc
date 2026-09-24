// Affichage des fiches de prospection (module Merx).
// Miroir d’affichage de la grille de notation : la source de vérité, celle qui calcule, est dans
// `supabase/functions/merx/scoring.ts`. On ne garde ici que les libellés et les maximums.

export const SECTEURS = [
  { id: "btp", label: "Travaux publics et BTP", tone: "coral" },
  { id: "espaces_verts", label: "Espaces verts", tone: "emerald" },
  { id: "agriculture", label: "Agriculture et viticulture", tone: "teal" },
  { id: "collectivites", label: "Collectivités", tone: "violet" },
  // Instituts, pharmacies, dermatologie : personne au soleil, mais le sujet EST leur métier.
  { id: "sante_beaute", label: "Santé et beauté", tone: "coral" },
  { id: "autre", label: "Autre", tone: "slate" },
] as const;

export type Secteur = (typeof SECTEURS)[number]["id"];

/**
 * La grille de qualification commerciale d'AvisDoc, établie avec l'équipe commerciale d'AvisDoc le 24/09/2026.
 *
 * Elle est reprise telle quelle : ce sont eux qui vendent, et une grille que le
 * commercial n'a pas faite est une grille qu'il ne suivra pas. Elle s'ajuste au fil
 * des retours du terrain. Les anciens critères
 * (« zone géographique », « sensibilité santé au travail ») ont disparu avec elle ;
 * les fiches d'avant les portent encore et s'affichent telles quelles.
 */
export type CritereId =
  | "exposition"
  | "population"
  | "peau"
  | "deploiement"
  | "politique_sst"
  | "actions_recentes"
  | "instances"
  | "interlocuteur"
  | "coordonnees"
  | "actualite_contact";

export const CATEGORIES: { id: string; label: string; criteres: CritereId[]; sur: number }[] = [
  { id: "pertinence", label: "Pertinence AvisDoc", criteres: ["exposition", "population", "peau", "deploiement"], sur: 60 },
  { id: "maturite", label: "Maturité prévention", criteres: ["politique_sst", "actions_recentes", "instances"], sur: 25 },
  { id: "accessibilite", label: "Accessibilité commerciale", criteres: ["interlocuteur", "coordonnees", "actualite_contact"], sur: 15 },
];

export const CRITERES: Record<CritereId, { label: string; max: number }> = {
  exposition: { label: "Exposition solaire professionnelle", max: 25 },
  population: { label: "Taille de la population concernée", max: 15 },
  peau: { label: "Adéquation santé / peau", max: 10 },
  deploiement: { label: "Potentiel de déploiement", max: 10 },
  politique_sst: { label: "Politique santé-sécurité structurée", max: 10 },
  actions_recentes: { label: "Actions récentes de prévention", max: 10 },
  instances: { label: "Implication RH, CSE, santé au travail", max: 5 },
  interlocuteur: { label: "Interlocuteur pertinent identifiable", max: 7 },
  coordonnees: { label: "Coordonnées directes", max: 5 },
  actualite_contact: { label: "Actualité du contact", max: 3 },
};

/** Les seuils de décision, tels qu'AvisDoc les a posés. */
export const DECISIONS: { min: number; libelle: string; action: string; ton: string }[] = [
  { min: 70, libelle: "Prioritaire", action: "Approfondir immédiatement : contact actuel, coordonnées, angle personnalisé, preuves récentes.", ton: "bg-emerald-100 text-emerald-700" },
  { min: 55, libelle: "À qualifier", action: "Approfondir si un critère stratégique est fort — UV, taille, prévention — ou si la recherche coûte peu.", ton: "bg-amber-100 text-amber-800" },
  { min: 40, libelle: "Piste secondaire", action: "Garder au vivier ; pas de recherche nominative longue sans signal supplémentaire.", ton: "bg-sky-100 text-sky-800" },
  { min: 0, libelle: "Faible priorité", action: "Ne pas approfondir, sauf information nouvelle ou demande particulière.", ton: "bg-muted text-muted-foreground" },
];
/**
 * Les points maximum atteignables avec ce qui a été évalué.
 *
 * Une fiche brute ne dispose que des soixante points de la pertinence : la juger sur
 * cent enverrait au fond du vivier une entreprise de travaux publics qui en coche six
 * sur dix. On ramène donc la note à l'échelle de ce qui était mesurable.
 */
export const maxEvalue = (score: Partial<Record<CritereId, NoteCritere>>): number =>
  (Object.keys(score) as CritereId[]).reduce(
    // Un critère non qualifié ne compte ni au numérateur ni au dénominateur : sans
    // cela il pénaliserait comme un zéro, et la fiche serait punie de notre ignorance.
    (t, id) => t + (score[id] && score[id]!.points !== null && CRITERES[id] ? CRITERES[id].max : 0),
    0,
  );

export const decision = (total: number | null, sur: number) =>
  total === null || sur <= 0 ? null : DECISIONS.find((d) => (100 * total) / sur >= d.min)!;

/** D'où sort la note sur cent — la première bulle. */
export const EXPLICATION_NOTE = `Cette note vient de la grille de qualification commerciale d’AvisDoc. Dix critères, trois étapes.
Elle peut s’ajuster au fil des retours du terrain.

PERTINENCE — 60 points
• Exposition solaire professionnelle (25)
• Taille de la population du site (15) — cible de 100 à 1 000
• Adéquation santé / peau (10)
• Potentiel de déploiement, multi-sites (10)

MATURITÉ PRÉVENTION — 25 points
• Politique santé-sécurité structurée : QHSE, MASE, ISO (10)
• Actions récentes de prévention, 2024-2026 (10)
• Implication RH, CSE, santé au travail (5)

ACCESSIBILITÉ — 15 points
• Interlocuteur pertinent identifiable (7)
• Coordonnées directes (5)
• Actualité du contact (3)

Les quatre critères de pertinence se lisent au registre dès la recherche. Les six autres exigent que l’on approfondisse la fiche de l’entreprise.
Une fiche non approfondie plafonne donc à 60, une fiche approfondie peut être notée 100.`;

/** D'où sort la consigne — la deuxième bulle. */
export const EXPLICATION_CONSIGNE = `La consigne dit quoi faire : c’est le croisement de la note et de ce qui a pu être vérifié.
Pas une moyenne, ces deux mesures ne se compensent pas.

Les seuils sont rapportés à ce qui était mesurable : une fiche non approfondie se juge sur 60, pas sur 100.

PRIORITAIRE — 70 % et plus. Approfondir immédiatement.
À QUALIFIER — 55 à 69 %. Approfondir si un critère est fort, ou si la recherche coûte peu.
PISTE SECONDAIRE — 40 à 54 %. Garder au vivier.
FAIBLE PRIORITÉ — moins de 40 %. Ne pas approfondir.

Le score ne remplace pas le jugement du commercial.

Chaque point est justifié dans la fiche, avec la page qui l’atteste. Un critère sans preuve vaut zéro.`;

/** D'où sort la note de fiabilité — la troisième bulle. */
export const EXPLICATION_FIABILITE = `Cette note donne la fiabilité des informations d’une fiche. Elle ne juge pas l’entreprise : c’est le rôle de la note sur 100.

LE CALCUL.
Huit informations sont notées : identité, implantation, activité, effectif du site, site web, interlocuteur, e-mail, téléphone. Chacune reçoit :
• 2 points quand deux sources différentes disent la même chose
• 1 point quand une seule source sérieuse le dit
• 0 quand rien ne le prouve
Le total est ramené sur 10.

POURQUOI DEUX SOURCES. Le registre de l’État est sûr pour l’identité et l’activité d’une entreprise. Il l’est moins pour les adresses, qu’il met parfois des années à mettre à jour. Une adresse n’obtient donc 2 points que si une autre source la confirme.

UNE FICHE COURTE PEUT AVOIR 10 SUR 10. Cette note ne compte pas ce qui manque, seulement ce qui est écrit. Une fiche qui dit peu de choses, mais toutes vérifiées, vaut 10.`;

export interface NoteCritere {
  points: number | null;
  justification: string;
  source: string | null;
}

/** Le dossier commercial monté par Merx : de quoi décrocher son téléphone. */
export interface Dossier {
  a_retenir?: string[];
  qui_aborder?: string;
  accroche?: string;
  arguments?: { argument: string; parce_que: string }[];
  objections?: { objection: string; reponse: string }[];
  offre?: string;
  a_verifier?: string[];
}

export interface Prospect {
  id: string;
  owner_email: string;
  name: string;
  city: string | null;
  department: string | null;
  activity: string | null;
  website: string | null;
  rationale: string | null;
  sources: string[];
  sector: Secteur | null;
  score_total: number | null;
  score: Partial<Record<CritereId, NoteCritere>>;
  /**
   * La confiance qu'on peut faire à ce que la fiche avance, sur dix.
   *
   * Vide tant qu'un barème n'a pas été éprouvé : le premier sortait toutes les
   * fiches à dix sur dix. La colonne reste en place — elle dit ce qui manque.
   */
  reliability: number | null;
  siren: string | null;
  legal_name: string | null;
  headcount_band: string | null;
  headcount_year: number | null;
  open_establishments: number | null;
  head_office: { address?: string | null; city?: string | null; department?: string | null } | null;
  leaders: { name: string; role: string | null }[] | null;
  contact_name: string | null;
  contact_role: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  contact_source: string | null;
  approach: string | null;
  /** Le dossier commercial monté par Merx à l'approfondissement (migration 0033). */
  dossier: Dossier | null;
  enriched_at: string | null;
  /** Première ouverture de la fiche : tant qu'elle est vide, la fiche est « nouvelle ». */
  opened_at: string | null;
  /** La demande de recherche qui a trouvé cette fiche. */
  found_by: string | null;
  /** L'affaire née de ce prospect (migration 0026), s'il est passé au Pipeline. */
  converted_client_id: string | null;
  converted_at: string | null;
  status: string;
  created_at: string;
}

/** Colonne où ranger une fiche : son secteur, « Autre » à défaut. */
export const secteurDe = (p: Prospect): Secteur => (p.sector && SECTEURS.some((s) => s.id === p.sector) ? p.sector : "autre");

/**
 * Le secteur tel qu'on l'affiche.
 *
 * Il porte aujourd'hui le libellé réel — « Construction », « Santé et action
 * sociale » —, mais les fiches d'avant portent encore un identifiant (« btp »,
 * « espaces_verts ») : on leur rend leur libellé plutôt que d'afficher du code.
 */
export function secteurLisible(sector: string | null): string {
  const brut = (sector ?? "").trim();
  if (!brut) return "—";
  return SECTEURS.find((s) => s.id === brut)?.label ?? brut;
}

/** Couleur de la note : elle suit le total sur 100, sans jamais rien inventer quand il est absent. */
export function tonNote(total: number | null): string {
  if (total === null) return "bg-muted text-muted-foreground";
  if (total >= 70) return "bg-emerald-100 text-emerald-700";
  if (total >= 45) return "bg-amber-100 text-amber-800";
  return "bg-muted text-muted-foreground";
}

/** Effectif en clair, tel que l’annuaire officiel le publie (tranche INSEE). */
export const TRANCHES: Record<string, string> = {
  NN: "Non employeuse",
  "00": "0 salarié",
  "01": "1 ou 2 salariés",
  "02": "3 à 5 salariés",
  "03": "6 à 9 salariés",
  "11": "10 à 19 salariés",
  "12": "20 à 49 salariés",
  "21": "50 à 99 salariés",
  "22": "100 à 199 salariés",
  "31": "200 à 249 salariés",
  "32": "250 à 499 salariés",
  "41": "500 à 999 salariés",
  "42": "1 000 à 1 999 salariés",
  "51": "2 000 à 4 999 salariés",
  "52": "5 000 à 9 999 salariés",
  "53": "10 000 salariés et plus",
};

export const effectifLabel = (band: string | null): string | null => (band && TRANCHES[band]) || null;
