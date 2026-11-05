import { describe, expect, it } from "vitest";
import { exigences, normaliserNom, rapprocher, reglesDe, typologieDuClient, type Affectation, type Typologie } from "./typologies";

const typo = (id: string, p: Partial<Typologie>): Typologie => ({
  id,
  nom: id,
  description: "",
  exige_requerant: true,
  exige_expert: true,
  exige_client: false,
  exige_consentements: false,
  exige_dermatoscope: false,
  par_defaut: false,
  position: 0,
  ...p,
});
const TYPOLOGIES = [typo("direct", { par_defaut: true }), typo("partenaire", { exige_requerant: false })];
const AFFECTATIONS: Affectation[] = [
  { qonto_client_id: "q1", nom_qonto: "Viabeez SAS", typologie_id: "partenaire", alias: [] },
  { qonto_client_id: "q2", nom_qonto: "Fédération départementale des caisses locales", typologie_id: "direct", alias: ["FED DEPART CAISSES LOCALES ASSUR DU CHER"] },
  { qonto_client_id: "q3", nom_qonto: "Groupama Rhône-Alpes-Auvergne", typologie_id: "direct", alias: [] },
  { qonto_client_id: "q4", nom_qonto: "Groupama Paris", typologie_id: "partenaire", alias: [] },
];

describe("typologies", () => {
  it("normalise : accents, casse, ponctuation, forme juridique", () => {
    expect(normaliserNom("Viabeez SAS")).toBe("viabeez");
    expect(normaliserNom("Groupama Rhône-Alpes-Auvergne")).toBe("groupama rhone alpes auvergne");
  });

  it("rapproche par nom, alias, puis approche unique", () => {
    expect(rapprocher("VIABEEZ", AFFECTATIONS)).toMatchObject({ par: "nom", affectation: { qonto_client_id: "q1" } });
    expect(rapprocher("FED DEPART CAISSES LOCALES ASSUR DU CHER", AFFECTATIONS)).toMatchObject({ par: "alias" });
    expect(rapprocher("Groupama Rhône-Alpes-Auvergne Loire", AFFECTATIONS)).toMatchObject({ par: "approche", affectation: { qonto_client_id: "q3" } });
    // « Groupama » seul correspond à deux clients : on ne devine pas.
    expect(rapprocher("Groupama", AFFECTATIONS)).toBeNull();
    expect(rapprocher("ENGIE", AFFECTATIONS)).toBeNull();
  });

  it("typologie du client, sinon celle par défaut", () => {
    expect(typologieDuClient("VIABEEZ", AFFECTATIONS, TYPOLOGIES)?.id).toBe("partenaire");
    expect(typologieDuClient("ENGIE", AFFECTATIONS, TYPOLOGIES)?.id).toBe("direct");
    expect(typologieDuClient("ENGIE", AFFECTATIONS, [])).toBeNull();
  });

  it("règles et exigences en clair", () => {
    expect(exigences(reglesDe(TYPOLOGIES[1]))).toEqual(["expert"]);
    expect(exigences(reglesDe(null))).toEqual(["requérant", "expert"]);
  });
});
