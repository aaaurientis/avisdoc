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
export type MotifExclusion = "hors_cible" | "opposition" | "esthetique_dominante" | "n_exerce_plus" | "autre";

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
  hors_cible: "Non concerné (autre spécialité, hors cible)",
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

export type StatutGoogle = "a_chercher" | "trouvee_auto" | "confirmee" | "a_confirmer" | "introuvable" | "aucune";

export const STATUTS_GOOGLE: StatutGoogle[] = ["confirmee", "trouvee_auto", "a_confirmer", "introuvable", "aucune", "a_chercher"];

export const GOOGLE_LABEL: Record<StatutGoogle, string> = {
  confirmee: "Fiche confirmée",
  trouvee_auto: "Fiche trouvée",
  a_confirmer: "Sans correspondance",
  introuvable: "Introuvable",
  aucune: "Pas de fiche",
  a_chercher: "À chercher",
};

export const GOOGLE_BADGE: Record<StatutGoogle, string> = {
  confirmee: "bg-emerald-100 text-emerald-800",
  trouvee_auto: "bg-emerald-50 text-emerald-700",
  a_confirmer: "bg-slate-100 text-slate-600",
  introuvable: "bg-slate-100 text-slate-600",
  aucune: "bg-slate-100 text-slate-600",
  a_chercher: "bg-slate-50 text-slate-500",
};

/** Ce que le badge veut dire, au survol. */
export const GOOGLE_AIDE: Record<StatutGoogle, string> = {
  confirmee: "Fiche Google choisie ou confirmée par un opérateur.",
  trouvee_auto: "Rattachée automatiquement : un seul résultat au même nom et au même code postal. À vérifier sur la fiche.",
  a_confirmer: "Aucune fiche à une adresse RPPS : seulement des fiches au même nom dans une autre commune du département. Vous pouvez en choisir une sur la fiche.",
  introuvable: "Google n'a renvoyé aucune fiche. Cela ne pénalise pas.",
  aucune: "Un opérateur a indiqué qu'aucune fiche ne correspond. Cela ne pénalise pas.",
  a_chercher: "Pas encore cherchée : la recherche automatique s'en charge.",
};

export type StatutDoctolib = "a_chercher" | "trouve_auto" | "confirme" | "a_confirmer" | "introuvable" | "aucun";

export const STATUTS_DOCTOLIB: StatutDoctolib[] = ["confirme", "trouve_auto", "a_confirmer", "introuvable", "aucun", "a_chercher"];

export const DOCTOLIB_LABEL: Record<StatutDoctolib, string> = {
  confirme: "Lien confirmé",
  trouve_auto: "Lien trouvé",
  a_confirmer: "Fiche à choisir",
  introuvable: "Introuvable",
  aucun: "Pas sur Doctolib",
  a_chercher: "À chercher",
};

export const DOCTOLIB_BADGE: Record<StatutDoctolib, string> = {
  confirme: "bg-sky-100 text-sky-800",
  trouve_auto: "bg-sky-50 text-sky-700",
  a_confirmer: "bg-amber-100 text-amber-800",
  introuvable: "bg-slate-100 text-slate-600",
  aucun: "bg-slate-100 text-slate-600",
  a_chercher: "bg-slate-50 text-slate-500",
};

export const DOCTOLIB_AIDE: Record<StatutDoctolib, string> = {
  confirme: "Lien vérifié par un opérateur.",
  trouve_auto: "Trouvé automatiquement : la seule fiche Doctolib au nom, au prénom et dans une commune d'exercice du praticien. À vérifier.",
  a_confirmer: "Plusieurs fiches Doctolib portent son nom, aucune n'est sûre : choisissez la bonne (ou « Pas sur Doctolib »).",
  introuvable: "Aucune fiche Doctolib à son nom dans les résultats de recherche.",
  aucun: "Un opérateur a indiqué qu'il n'est pas sur Doctolib.",
  a_chercher: "Pas encore cherché : la recherche automatique s'en charge.",
};

/** Une page Doctolib existe, mais « n'est pas sur Doctolib » : aucun rendez-vous en ligne. */
export const nonReservableDoctolib = (p: { doctolibUrl: string | null; doctolibInfos: { reservable?: boolean | null } | null }) =>
  !!p.doctolibUrl && p.doctolibInfos?.reservable === false;
export const NON_RESERVABLE = {
  label: "Non réservable",
  aide: "Page Doctolib sans prise de rendez-vous en ligne (« n'est pas sur Doctolib »).",
  badge: "bg-rose-100 text-rose-800",
  picto: "text-rose-600",
} as const;

/** Plafonds quotidiens par défaut (variables RESEAU_GOOGLE_PLAFOND_* / RESEAU_DOCTOLIB_PLAFOND côté serveur). */
export const PLAFONDS_JOUR = { recherche: 10000, details: 10000, details_avis: 10000, doctolib: 10000 } as const;

/** Une information Doctolib a déjà été récupérée (relevé, import) : le lien n'est plus « à choisir ». */
export const doctolibRenseigne = (p: { doctolibUrl: string | null; doctolibInfos: object | null }) => !!p.doctolibUrl && !!p.doctolibInfos;

/**
 * Statut Doctolib tel qu'il s'affiche : « non réservable » d'abord, puis « fiche relevée »
 * dès qu'une information a été récupérée, sinon le statut du lien.
 */
export function affichageDoctolib(p: { doctolibStatut: StatutDoctolib; doctolibUrl: string | null; doctolibInfos: { reservable?: boolean | null } | null }):
  { label: string; badge: string; aide: string; picto: string } {
  if (nonReservableDoctolib(p)) return { label: NON_RESERVABLE.label, badge: NON_RESERVABLE.badge, aide: NON_RESERVABLE.aide, picto: NON_RESERVABLE.picto };
  if (doctolibRenseigne(p) && p.doctolibStatut !== "confirme") {
    return { label: "Fiche relevée", badge: "bg-sky-100 text-sky-800", aide: "Des informations ont été récupérées sur cette fiche Doctolib (relevé ou import).", picto: "text-sky-700" };
  }
  return { label: DOCTOLIB_LABEL[p.doctolibStatut], badge: DOCTOLIB_BADGE[p.doctolibStatut], aide: DOCTOLIB_AIDE[p.doctolibStatut], picto: DOCTOLIB_PICTO[p.doctolibStatut] };
}

export const DOCTOLIB_PICTO: Record<StatutDoctolib, string> = {
  confirme: "text-sky-700",
  trouve_auto: "text-sky-500",
  a_confirmer: "text-amber-500",
  introuvable: "text-slate-300",
  aucun: "text-slate-300",
  a_chercher: "text-slate-200",
};

export const FORCE_LABEL = { certaine: "Nom et adresse RPPS", forte: "Nom et code postal", moyenne: "Nom, autre commune", faible: "Sans le nom du praticien" } as const;
