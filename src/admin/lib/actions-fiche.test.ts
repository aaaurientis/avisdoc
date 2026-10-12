import { describe, expect, it } from "vitest";
import { colonneDEntree, etapeProposee, faitEntrerAuPipeline, instant, lienValide } from "./actions-fiche";

const COLONNES = ["Qualifié", "Contacté", "Présentation", "RDV", "Proposition", "Signé", "Perdu"];

describe("l'étape proposée après une action", () => {
  it("un appel joint propose « Contacté » à un prospect", () => {
    expect(etapeProposee("appel", "Joint", null, null, COLONNES)).toBe("Contacté");
  });
  it("un appel pas joint ne propose rien", () => {
    expect(etapeProposee("appel", "Pas joint", null, null, COLONNES)).toBeNull();
  });
  it("un rendez-vous fait, ou programmé ensuite, propose « RDV »", () => {
    expect(etapeProposee("rdv", "Fait", null, "Contacté", COLONNES)).toBe("RDV");
    expect(etapeProposee("appel", "Joint", "rdv", "Contacté", COLONNES)).toBe("RDV");
  });
  it("une présentation intéressée propose « Proposition »", () => {
    expect(etapeProposee("presentation", "Intéressé", null, "RDV", COLONNES)).toBe("Proposition");
  });
  it("ne recule jamais", () => {
    expect(etapeProposee("appel", "Joint", null, "Proposition", COLONNES)).toBeNull();
  });
  it("ne propose rien si la colonne n'existe pas dans ce pipeline", () => {
    expect(etapeProposee("rdv", "Fait", null, null, ["Qualifié", "Contacté"])).toBeNull();
  });
});

describe("l'entrée d'un prospect au Pipeline", () => {
  it("toute action sauf une note l'y fait entrer", () => {
    expect(faitEntrerAuPipeline("appel")).toBe(true);
    expect(faitEntrerAuPipeline("note")).toBe(false);
  });
  it("en « Contacté » si l'échange a eu lieu, dans la première colonne sinon", () => {
    expect(colonneDEntree(true, COLONNES)).toBe("Contacté");
    expect(colonneDEntree(false, COLONNES)).toBe("Qualifié");
  });
});

describe("les dates à l'heure de Paris", () => {
  it("lit l'heure saisie comme celle de Paris, été comme hiver", () => {
    expect(instant("2026-07-01", "10:00")).toBe("2026-07-01T08:00:00.000Z");
    expect(instant("2026-12-01", "10:00")).toBe("2026-12-01T09:00:00.000Z");
  });
});

describe("le lien de la visio", () => {
  it("accepte https, refuse le reste", () => {
    expect(lienValide("https://meet.google.com/abc-defg-hij")).toBe(true);
    expect(lienValide("")).toBe(true);
    expect(lienValide("javascript:alert(1)")).toBe(false);
    expect(lienValide("https://x.fr/\"onmouseover")).toBe(false);
  });
});
