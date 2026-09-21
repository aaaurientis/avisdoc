// Mapping design-system : les mêmes tokens que le site vitrine (avisdoc-*)
// complétés par la palette sémantique Tailwind pour les statuts.
// On ne code AUCUN hex ici — tout passe par le design system partagé.

import type {
  ContactStatut,
  ContactType,
  DocExt,
  PipelineStage,
  PropoStatut,
  Stage,
  StageTone,
} from "../types";

/** Rôles d'un contact : liste `types` si présente, sinon le rôle historique. */
export function typesDe(c: { type: ContactType; types?: ContactType[] }): ContactType[] {
  return c.types?.length ? c.types : [c.type];
}

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

/** Teintes possibles d'une colonne du pipeline (choisies dans « Colonnes »). */
export const TONES: Record<StageTone, { dot: string; text: string; soft: string; label: string }> = {
  slate: { dot: "bg-slate-400", text: "text-slate-500", soft: "bg-slate-100", label: "Gris" },
  teal: { dot: "bg-avisdoc-teal", text: "text-avisdoc-teal", soft: "bg-sky-100", label: "Bleu" },
  coral: { dot: "bg-avisdoc-coral", text: "text-avisdoc-coral", soft: "bg-amber-100", label: "Orange" },
  emerald: { dot: "bg-emerald-500", text: "text-emerald-600", soft: "bg-emerald-100", label: "Vert" },
  violet: { dot: "bg-violet-500", text: "text-violet-600", soft: "bg-violet-100", label: "Violet" },
  rose: { dot: "bg-rose-500", text: "text-rose-600", soft: "bg-rose-100", label: "Rose" },
};

/** Colonnes de départ — servent au mode démonstration et de repli si la table est vide. */
export const STAGES_DEFAUT: PipelineStage[] = [
  { id: "s1", label: "Nouveau", position: 1, tone: "slate" },
  { id: "s2", label: "Qualifié", position: 2, tone: "teal" },
  { id: "s3", label: "Proposition", position: 3, tone: "coral" },
  { id: "s4", label: "Signé", position: 4, tone: "emerald" },
];

/** Teintes d'une étape, à partir des colonnes de l'équipe. Une étape inconnue reste neutre. */
export function stageMeta(name: Stage, stages: PipelineStage[] = STAGES_DEFAUT) {
  const tone = stages.find((s) => s.label === name)?.tone ?? "slate";
  return { name, ...TONES[tone] };
}

/** Rang d'une étape dans le parcours ; -1 si la colonne n'existe plus. */
export const stageRank = (name: Stage, stages: PipelineStage[] = STAGES_DEFAUT) =>
  stages.findIndex((s) => s.label === name);

/** Couleur pastille d'extension de fichier. */
export const DOC_EXT: Record<DocExt, string> = {
  PDF: "bg-rose-500",
  DOC: "bg-blue-600",
  XLS: "bg-emerald-600",
  PPT: "bg-orange-500",
};

export const PROPO_STATUTS: PropoStatut[] = [
  "Brouillon",
  "Envoyée",
  "Acceptée",
  "Refusée",
];
