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

describe("requis masqués", () => {
  it("leurs avis sont retirés des résultats, pas des volumes", async () => {
    const { pourResultats, requisMasque } = await import("./masquage");
    definirAffichageStats({ resultatsDermato: true, noms: "clair", requisMasques: ["Dr Alice Martin"] });
    const avis = [{ requis: "Dr Alice Martin" }, { requis: "Dr Bruno Petit" }, { requis: " Dr Alice Martin " }];
    expect(pourResultats(avis)).toEqual([{ requis: "Dr Bruno Petit" }]);
    expect(requisMasque("Dr Alice Martin")).toBe(true);
    expect(requisMasque("Dr Bruno Petit")).toBe(false);
  });
});
