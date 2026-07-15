// Mapping design-system : les mêmes tokens que le site vitrine (avisdoc-*)
// complétés par la palette sémantique Tailwind pour les statuts.
// On ne code AUCUN hex ici — tout passe par le design system partagé.

import type {
  ContactStatut,
  ContactType,
  DocExt,
  PropoStatut,
  Stage,
} from "../types";

/** Badge + avatar par type de contact. */
export const TYPE_BADGE: Record<ContactType, string> = {
  Requérant: "bg-sky-100 text-sky-700",
  Expert: "bg-emerald-100 text-emerald-700",
  "Réseau d'Aval": "bg-amber-100 text-amber-700",
};

/** Point coloré (dashboard « Répartition du réseau »). */
export const TYPE_DOT: Record<ContactType, string> = {
  Requérant: "bg-avisdoc-teal",
  Expert: "bg-emerald-500",
  "Réseau d'Aval": "bg-avisdoc-coral",
};

/** Badge par statut de contact / relation. */
export const STATUT_BADGE: Record<ContactStatut, string> = {
  Accepté: "bg-emerald-100 text-emerald-700",
  "En attente": "bg-amber-100 text-amber-700",
  Refusé: "bg-rose-100 text-rose-700",
};

/** Métadonnées des étapes du pipeline CRM. */
export const STAGES: {
  name: Stage;
  dot: string; // fond du point / badge compteur (plein)
  text: string; // couleur de texte
  soft: string; // fond doux
}[] = [
  { name: "Nouveau", dot: "bg-slate-400", text: "text-slate-500", soft: "bg-slate-100" },
  { name: "Qualifié", dot: "bg-avisdoc-teal", text: "text-avisdoc-teal", soft: "bg-sky-100" },
  { name: "Proposition", dot: "bg-avisdoc-coral", text: "text-avisdoc-coral", soft: "bg-amber-100" },
  { name: "Signé", dot: "bg-emerald-500", text: "text-emerald-600", soft: "bg-emerald-100" },
];

export function stageMeta(name: Stage) {
  return STAGES.find((s) => s.name === name) ?? STAGES[0];
}

/** Couleur pastille d'extension de fichier. */
export const DOC_EXT: Record<DocExt, string> = {
  PDF: "bg-rose-500",
  DOC: "bg-blue-600",
  XLS: "bg-emerald-600",
};

export const PROPO_STATUTS: PropoStatut[] = [
  "Brouillon",
  "Envoyée",
  "Acceptée",
  "Refusée",
];
