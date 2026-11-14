// Réseau d'aval : tous les libellés à l'écran, au même endroit.

export {
  DEPARTEMENTS,
  JOURS_PEREMPTION,
  POPULATION_LIBELLE,
  estPerime,
  type Population,
  type Role,
} from "../../../supabase/functions/_shared/reseau-rpps";
import type { Population, Role } from "../../../supabase/functions/_shared/reseau-rpps";

export type EtatDepartement = "a_ouvrir" | "importe" | "en_qualification" | "en_contact" | "couvert" | "en_veille";
export type EtatPraticien =
  | "identifie" | "qualifie" | "a_contacter" | "contacte" | "en_discussion"
  | "accord" | "refus" | "injoignable" | "exclu" | "sorti";
export type MotifExclusion = "opposition" | "esthetique_dominante" | "n_exerce_plus" | "autre";

export const ETATS_DEPARTEMENT: EtatDepartement[] = ["a_ouvrir", "importe", "en_qualification", "en_contact", "couvert", "en_veille"];

export const ETAT_DEPARTEMENT_LABEL: Record<EtatDepartement, string> = {
  a_ouvrir: "À ouvrir",
  importe: "Importé",
  en_qualification: "En qualification",
  en_contact: "En contact",
  couvert: "Couvert",
  en_veille: "En veille",
};

export const ETAT_DEPARTEMENT_BADGE: Record<EtatDepartement, string> = {
  a_ouvrir: "bg-slate-100 text-slate-700",
  importe: "bg-sky-100 text-sky-800",
  en_qualification: "bg-amber-100 text-amber-800",
  en_contact: "bg-violet-100 text-violet-800",
  couvert: "bg-emerald-100 text-emerald-800",
  en_veille: "bg-slate-200 text-slate-600",
};

export const ETATS_PRATICIEN: EtatPraticien[] = [
  "identifie", "qualifie", "a_contacter", "contacte", "en_discussion",
  "accord", "refus", "injoignable", "exclu", "sorti",
];

export const ETAT_PRATICIEN_LABEL: Record<EtatPraticien, string> = {
  identifie: "Identifié",
  qualifie: "Qualifié",
  a_contacter: "À contacter",
  contacte: "Contacté",
  en_discussion: "En discussion",
  accord: "Accord",
  refus: "Refus",
  injoignable: "Injoignable",
  exclu: "Exclu",
  sorti: "Sorti",
};

export const ETAT_PRATICIEN_BADGE: Record<EtatPraticien, string> = {
  identifie: "bg-slate-100 text-slate-700",
  qualifie: "bg-sky-100 text-sky-800",
  a_contacter: "bg-amber-100 text-amber-800",
  contacte: "bg-violet-100 text-violet-800",
  en_discussion: "bg-indigo-100 text-indigo-800",
  accord: "bg-emerald-100 text-emerald-800",
  refus: "bg-rose-100 text-rose-800",
  injoignable: "bg-orange-100 text-orange-800",
  exclu: "bg-rose-200 text-rose-900",
  sorti: "bg-slate-200 text-slate-600",
};

export const POPULATIONS: Population[] = ["DERM", "ORL", "PLAST", "CHIR", "MG_DERM"];

/** Libellé court, au pluriel, pour les compteurs. */
export const POPULATION_PLURIEL: Record<Population, string> = {
  DERM: "dermatologues",
  ORL: "ORL",
  PLAST: "chirurgiens plasticiens",
  CHIR: "chirurgiens généralistes",
  MG_DERM: "généralistes (dermoscopie)",
};

export const ROLES: Role[] = ["consultation", "dermoscopie", "exerese", "requerant"];

export const ROLE_LABEL: Record<Role, string> = {
  consultation: "Consultation",
  dermoscopie: "Dermoscopie",
  exerese: "Exérèse",
  requerant: "Futur requérant",
};

export const MOTIF_EXCLUSION_LABEL: Record<MotifExclusion, string> = {
  opposition: "Opposition du praticien",
  esthetique_dominante: "Activité esthétique dominante",
  n_exerce_plus: "N'exerce plus",
  autre: "Autre motif",
};

export const SOURCE_RPPS = {
  libelle: "Extraction RPPS en libre accès (Annuaire Santé, ANS)",
  url: "https://www.data.gouv.fr/datasets/annuaire-sante-extractions-des-donnees-en-libre-acces-des-professionnels-intervenant-dans-le-systeme-de-sante-rpps",
};

export const TEXTES = {
  titre: "Trouver des médecins",
  sousTitre: "Réseau d'aval, département par département",
  ajouterDepartement: "Ajouter un département",
  importer: "Importer depuis le RPPS",
  rafraichir: "Rafraîchir l'import",
  importEnCours: "Import en cours…",
  exclure: "Exclure définitivement",
  aucunDepartement: "Aucun département pour l'instant. Ajoutez-en un pour commencer.",
  aucunPraticien: "Aucun praticien ne correspond aux filtres.",
  pasEncoreImporte: "Ce département n'a pas encore été importé.",
  dejaDansLaListe: "Déjà dans la liste",
  absentExtraction: "Absent de la dernière extraction",
  perime: `Données de plus de ${90} jours : relancez l'import.`,
  motifImportEnCours: "Un import est en cours : patientez.",
  motifLectureSeule: "Vue en lecture seule.",
} as const;

/** Date d'un horodatage complet (« 9 novembre 2026 »). `frDate` attend une date seule. */
export function dateFr(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" });
}
