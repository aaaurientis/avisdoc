import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import type { Client, PipelineStage } from "../../types";
import { colonnesFusionnees, peutAllerDans } from "../../lib/pipeline-general";
import Kanban from "./Kanban";

const col = (pipelineId: string, label: string, position: number): PipelineStage => ({ id: `${pipelineId}-${label}`, label, position, tone: "slate", pipelineId });
const stages = [col("G", "Nouveau", 1), col("G", "Contacté", 2), col("G", "Proposition", 3), col("S", "Contacté", 1), col("S", "RDV", 2)];
const affaire = (id: string, company: string, pipelineId: string, stage: string, aRepondu = false): Client => ({
  id, company, siren: "", naf: "", adresse: "", effectif: "", stage, pipelineId, jours: 1, tarif: 0, depistes: 0, orientes: 0,
  resultat: null, statutPropo: "Brouillon", contacts: [], docs: [], suivis: [], aRepondu,
});
const clients = [affaire("1", "Hager Group", "S", "Contacté", true), affaire("2", "Maison", "G", "Nouveau")];

describe("Kanban de Général", () => {
  it("étiquette, pastille, colonnes grisées et dépôt refusé", () => {
    const onDeplacer = vi.fn();
    render(
      <Kanban
        clients={clients}
        stages={colonnesFusionnees(stages, "G")}
        onSelect={() => {}}
        onDeplacer={onDeplacer}
        peutDeposer={(c, l) => peutAllerDans(c, l, stages, "G")}
        etiquette={(c) => (c.pipelineId === "G" ? null : "Stéphan")}
      />,
    );
    // Colonnes fusionnées, chacune une fois.
    expect(screen.getAllByText(/^(Nouveau|Contacté|Proposition|RDV)$/).map((e) => e.textContent)).toEqual(["Nouveau", "Contacté", "Proposition", "RDV"]);
    expect(screen.getByText("Stéphan")).toBeInTheDocument();
    expect(screen.getByText("A répondu")).toBeInTheDocument();

    const carte = screen.getByText("Hager Group").closest("[draggable]")!;
    const colonne = (l: string) => screen.getByText(l, { selector: "div" }).closest("[title], .ad-kanban > div")!;
    fireEvent.dragStart(carte);
    expect(colonne("Proposition").className).toContain("opacity-40");
    expect(colonne("RDV").className).not.toContain("opacity-40");
    fireEvent.drop(colonne("Proposition"));
    expect(onDeplacer).not.toHaveBeenCalled();
    fireEvent.dragStart(carte);
    fireEvent.drop(colonne("RDV"));
    expect(onDeplacer).toHaveBeenCalledWith("1", "RDV");
  });
});
