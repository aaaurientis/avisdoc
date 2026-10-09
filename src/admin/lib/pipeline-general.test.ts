import { describe, expect, it } from "vitest";
import type { PipelineStage } from "../types";
import { colonnesFusionnees, estGeneral, peutAllerDans } from "./pipeline-general";

const col = (pipelineId: string, label: string, position: number): PipelineStage => ({
  id: `${pipelineId}-${label}`,
  label,
  position,
  tone: "slate",
  pipelineId,
});

// Les colonnes réelles au 09/10, Général une fois complété par la migration 0066.
const stages = [
  ...["Nouveau", "Qualifié", "Contacté", "Présentation", "Proposition", "RDV", "Négociation", "Signé", "Perdu"].map((l, i) => col("G", l, i + 1)),
  ...["Qualifié", "Contacté", "Présentation", "RDV", "Signé", "Perdu"].map((l, i) => col("O", l, i + 1)),
  ...["Contacté", "RDV"].map((l, i) => col("S", l, i + 1)),
];

describe("Général, vue d'ensemble", () => {
  it("reconnaît Général", () => {
    expect(estGeneral({ nom: "Général" })).toBe(true);
    expect(estGeneral({ nom: "Olivier" })).toBe(false);
    expect(estGeneral(null)).toBe(false);
  });

  it("donne chaque colonne une seule fois, dans l'ordre de Général", () => {
    expect(colonnesFusionnees(stages, "G").map((s) => s.label)).toEqual([
      "Nouveau", "Qualifié", "Contacté", "Présentation", "Proposition", "RDV", "Négociation", "Signé", "Perdu",
    ]);
  });

  it("montre au bout une colonne que Général n'a pas", () => {
    const avecNouvelle = [...stages, col("S", "Relance", 3)];
    expect(colonnesFusionnees(avecNouvelle, "G").map((s) => s.label).at(-1)).toBe("Relance");
  });

  it("ne déplace une affaire que vers une colonne de son pipeline", () => {
    expect(peutAllerDans({ pipelineId: "S" }, "RDV", stages, "G")).toBe(true);
    expect(peutAllerDans({ pipelineId: "S" }, "Proposition", stages, "G")).toBe(false);
    expect(peutAllerDans({ pipelineId: "O" }, "Présentation", stages, "G")).toBe(true);
    expect(peutAllerDans({ pipelineId: "G" }, "Proposition", stages, "G")).toBe(true);
  });
});
