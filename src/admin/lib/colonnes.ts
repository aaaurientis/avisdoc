// Les colonnes d'un pipeline : leur ordre, leur nom, leur place.
//
// Toutes les colonnes de tous les pipelines vivent dans une même liste. Chaque
// opération doit donc se borner au pipeline concerné : déplacer une colonne de
// Stéphan ne doit jamais toucher l'ordre de Général.

import type { PipelineStage } from "../types";

/** Les colonnes d'un pipeline, dans leur ordre. */
export const colonnesTriees = (stages: PipelineStage[], pipelineId: string): PipelineStage[] =>
  stages.filter((s) => s.pipelineId === pipelineId).sort((a, b) => a.position - b.position);

/**
 * Décale une colonne d'un cran (sens -1 : à gauche, +1 : à droite) DANS son pipeline,
 * et renumérote ce pipeline seul. Rend la liste complète, et les positions à écrire.
 */
export function deplacerColonne(
  stages: PipelineStage[],
  id: string,
  sens: -1 | 1,
): { stages: PipelineStage[]; aEcrire: { id: string; position: number }[] } | null {
  const colonne = stages.find((s) => s.id === id);
  if (!colonne) return null;
  const duTableau = colonnesTriees(stages, colonne.pipelineId);
  const i = duTableau.findIndex((s) => s.id === id);
  const j = i + sens;
  if (j < 0 || j >= duTableau.length) return null;
  [duTableau[i], duTableau[j]] = [duTableau[j], duTableau[i]];
  const positions = new Map(duTableau.map((s, k) => [s.id, k + 1]));
  return {
    stages: stages.map((s) => (positions.has(s.id) ? { ...s, position: positions.get(s.id)! } : s)),
    aEcrire: duTableau.map((s) => ({ id: s.id, position: positions.get(s.id)! })),
  };
}

/** La position d'une nouvelle colonne : après la dernière de son pipeline. */
export const positionSuivante = (stages: PipelineStage[], pipelineId: string): number =>
  Math.max(0, ...stages.filter((s) => s.pipelineId === pipelineId).map((s) => s.position)) + 1;

/** Un nom de colonne n'est unique qu'à l'intérieur de son pipeline. */
export const nomPris = (stages: PipelineStage[], pipelineId: string, nom: string, sauf?: string): boolean =>
  stages.some((s) => s.pipelineId === pipelineId && s.id !== sauf && s.label.trim().toLowerCase() === nom.trim().toLowerCase());
