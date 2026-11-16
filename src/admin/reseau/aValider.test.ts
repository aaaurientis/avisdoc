import { describe, expect, it } from "vitest";
import { pointsAValider } from "./aValider";

const base = { etat: "identifie", vuAuDernierImport: true, googleStatut: "confirmee", doctolibStatut: "confirme", doctolibUrl: "https://www.doctolib.fr/dermatologue/x/y", doctolibInfos: null };
const auj = new Date("2026-11-16T12:00:00Z");

describe("points à valider", () => {
  it("rien à valider sur un praticien à jour", () => {
    expect(pointsAValider(base, [], auj)).toEqual([]);
  });
  it("propositions IA, Google et Doctolib trouvés automatiquement", () => {
    const pts = pointsAValider({ ...base, googleStatut: "trouvee_auto", doctolibStatut: "trouve_auto" },
      [{ type: "dermoscopie", statut: "propose", decideLe: null }, { type: "prevention", statut: "propose", decideLe: null }], auj);
    expect(pts.map((x) => x.cle)).toEqual(["ia", "google", "doctolib"]);
    expect(pts[0].libelle).toMatch(/^2 propositions/);
  });
  it("créneau périmé, hors cible, absent du RPPS ; rien pour un exclu", () => {
    const p = { ...base, doctolibUrl: "https://www.doctolib.fr/urologue/x/y", vuAuDernierImport: false };
    const pts = pointsAValider(p, [{ type: "creneau_doctolib", statut: "valide", decideLe: "2026-10-20T10:00:00Z" }], auj);
    expect(pts.map((x) => x.cle)).toEqual(["hors_cible", "creneau", "rpps"]);
    expect(pointsAValider({ ...p, etat: "exclu" }, [], auj)).toEqual([]);
  });
  it("Google sans correspondance n'est pas un point à valider", () => {
    expect(pointsAValider({ ...base, googleStatut: "a_confirmer" }, [], auj)).toEqual([]);
  });
});

describe("points à valider : Doctolib déjà renseigné", () => {
  it("une fiche relevée ou importée n'est plus « à choisir » ni « à confirmer »", () => {
    const p = { ...base, doctolibStatut: "a_confirmer", doctolibInfos: { reservable: true } };
    expect(pointsAValider(p, [], auj)).toEqual([]);
    expect(pointsAValider({ ...p, doctolibStatut: "trouve_auto" }, [], auj)).toEqual([]);
  });
});
