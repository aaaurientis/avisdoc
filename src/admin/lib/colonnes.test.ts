import { describe, expect, it } from "vitest";
import type { PipelineStage } from "../types";
import { colonnesTriees, deplacerColonne, nomPris, positionSuivante } from "./colonnes";

const col = (pipelineId: string, label: string, position: number): PipelineStage => ({ id: `${pipelineId}-${label}`, label, position, tone: "slate", pipelineId });
// Une liste mêlée, triée par position, comme elle arrive de la base.
const stages = [col("G", "Nouveau", 1), col("S", "Contacté", 1), col("G", "Qualifié", 2), col("O", "Qualifié", 2), col("S", "RDV", 2), col("G", "Contacté", 3), col("O", "Contacté", 3)];
const ordre = (s: PipelineStage[], p: string) => colonnesTriees(s, p).map((x) => x.label);

describe("colonnes d'un pipeline", () => {
  it("déplace dans son pipeline seulement", () => {
    const r = deplacerColonne(stages, "S-RDV", -1)!;
    expect(ordre(r.stages, "S")).toEqual(["RDV", "Contacté"]);
    expect(ordre(r.stages, "G")).toEqual(["Nouveau", "Qualifié", "Contacté"]); // intact
    expect(ordre(r.stages, "O")).toEqual(["Qualifié", "Contacté"]); // intact
    expect(r.aEcrire.map((x) => x.id).sort()).toEqual(["S-Contacté", "S-RDV"]);
  });

  it("ne sort pas des bords", () => {
    expect(deplacerColonne(stages, "G-Nouveau", -1)).toBeNull();
    expect(deplacerColonne(stages, "G-Contacté", 1)).toBeNull();
  });

  it("place une nouvelle colonne après la dernière de son pipeline", () => {
    expect(positionSuivante(stages, "S")).toBe(3);
    expect(positionSuivante(stages, "G")).toBe(4);
    expect(positionSuivante(stages, "neuf")).toBe(1);
  });

  it("juge un nom pris dans son pipeline seulement", () => {
    expect(nomPris(stages, "O", "nouveau")).toBe(false); // « Nouveau » est à Général
    expect(nomPris(stages, "G", " nouveau ")).toBe(true);
    expect(nomPris(stages, "G", "Nouveau", "G-Nouveau")).toBe(false); // elle-même
  });
});
