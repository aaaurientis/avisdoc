import { afterEach, describe, expect, it } from "vitest";
import { definirAffichageStats, initialeNom } from "./masquage";
import { rapportPossible, resultatsVisibles } from "./expertises";

afterEach(() => definirAffichageStats(null));

describe("affichage des statistiques", () => {
  it("initiale du nom de famille", () => {
    expect(initialeNom("Claire ARNOUX")).toBe("Claire A.");
    expect(initialeNom("ARNOUX Claire")).toBe("Claire A.");
    expect(initialeNom("Dr Marie-Claire MARTIN")).toBe("Dr Marie-Claire M.");
    expect(initialeNom("Jean Dupont")).toBe("Jean D.");
    expect(initialeNom("Dupont")).toBe("D.");
  });
  it("résultats dermatologiques masqués sur demande, rapport client inchangé", () => {
    expect(resultatsVisibles(50)).toBe(true);
    definirAffichageStats({ resultatsDermato: false, noms: "clair" });
    expect(resultatsVisibles(50)).toBe(false);
    expect(rapportPossible(50)).toBe(true);
  });
});
