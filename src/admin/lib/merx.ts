// Affichage des fiches de prospection (module Merx).
// Miroir d’affichage de la grille de notation : la source de vérité, celle qui calcule, est dans
// `supabase/functions/merx/scoring.ts`. On ne garde ici que les libellés et les maximums.

export const SECTEURS = [
  { id: "btp", label: "Travaux publics et BTP", tone: "coral" },
  { id: "espaces_verts", label: "Espaces verts", tone: "emerald" },
  { id: "agriculture", label: "Agriculture et viticulture", tone: "teal" },
  { id: "collectivites", label: "Collectivités", tone: "violet" },
  { id: "autre", label: "Autre", tone: "slate" },
] as const;

export type Secteur = (typeof SECTEURS)[number]["id"];

export type CritereId = "soleil" | "sante_travail" | "salaries" | "interlocuteur" | "sites" | "zone";

export const CATEGORIES: { id: string; label: string; criteres: CritereId[] }[] = [
  { id: "sante", label: "Santé", criteres: ["soleil", "sante_travail"] },
  { id: "commercial", label: "Commercial", criteres: ["salaries", "interlocuteur", "sites"] },
  { id: "faisabilite", label: "Faisabilité", criteres: ["zone"] },
];

export const CRITERES: Record<CritereId, { label: string; max: number }> = {
  soleil: { label: "Exposition au soleil", max: 35 },
  sante_travail: { label: "Sensibilité santé au travail", max: 10 },
  salaries: { label: "Nombre de salariés", max: 20 },
  interlocuteur: { label: "Interlocuteur trouvé", max: 10 },
  sites: { label: "Plusieurs sites", max: 10 },
  zone: { label: "Zone géographique", max: 15 },
};

export interface NoteCritere {
  points: number | null;
  justification: string;
  source: string | null;
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
