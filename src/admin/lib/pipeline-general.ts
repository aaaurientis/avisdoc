// « Général » : la vue d'ensemble de tous les pipelines.
//
// « Tous et Général, c'est redondant : supprime Tous, et Général tu lui mets les
//   mêmes colonnes que tous les pipelines, comme s'ils étaient fusionnés. » — 09/10.
//
// Général reste un tableau à part entière — il a ses affaires, et ses colonnes
// donnent l'ordre de la vue. Il montre en plus les affaires des autres pipelines.
// Une colonne qu'un autre pipeline a et que Général n'a pas s'affiche au bout :
// une affaire ne doit jamais disparaître de la vue d'ensemble faute de colonne.

import type { Client, Pipeline, PipelineStage } from "../types";
import { nu } from "./import-colonnes";

export const estGeneral = (p: Pick<Pipeline, "nom"> | null | undefined): boolean => Boolean(p) && nu(p!.nom) === "general";

/** Les colonnes de la vue d'ensemble : celles de Général, puis celles qui lui manquent. */
export function colonnesFusionnees(stages: PipelineStage[], generalId: string): PipelineStage[] {
  const parPosition = [...stages].sort((a, b) => a.position - b.position);
  const fusion = parPosition.filter((s) => s.pipelineId === generalId);
  const vues = new Set(fusion.map((s) => s.label));
  for (const s of parPosition) {
    if (vues.has(s.label)) continue;
    vues.add(s.label);
    fusion.push(s);
  }
  return fusion;
}

/**
 * Où une affaire peut-elle aller depuis la vue d'ensemble ? Seulement dans une
 * colonne que son propre pipeline possède : rien ne bouge en douce chez un autre.
 */
export function peutAllerDans(c: Pick<Client, "pipelineId">, colonne: string, stages: PipelineStage[], generalId: string): boolean {
  if (c.pipelineId === generalId) return stages.some((s) => s.pipelineId === generalId && s.label === colonne);
  return stages.some((s) => s.pipelineId === c.pipelineId && s.label === colonne);
}
