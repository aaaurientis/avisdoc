import { describe, expect, it } from "vitest";
import { partDuJour, reduire } from "../../../supabase/functions/veille/linkup";
import { tourneesEnPanne } from "../../../supabase/functions/veille/pannes";
import { lignePassages } from "./veille";

const expression = (i: number, support?: string) => ({ cle: `linkup:expression:${i}${support ? `:${support}` : ""}` });

describe("plafond Linkup", () => {
  it("répartit ce qui reste sur les jours restants", () => {
    expect(partDuJour(0, 3500, 30)).toBe(116);
    expect(partDuJour(3400, 3500, 1)).toBe(100);
    expect(partDuJour(3600, 3500, 3)).toBe(0);
  });

  it("ne touche à rien sous la part du jour", () => {
    const etapes = [expression(1), expression(1, "x")];
    expect(reduire(etapes, () => true, 2)).toEqual({ gardees: etapes, enlevees: 0 });
  });

  it("enlève les réseaux d'abord, LinkedIn après les autres, la presse régionale ensuite", () => {
    const etapes = [{ cle: "pubmed" }, expression(1), { cle: "site-pqr-sudouest-fr" }, expression(1, "linkedin"), expression(1, "facebook"), expression(1, "x")];
    const parLinkup = (e: { cle: string }) => e.cle !== "pubmed";
    expect(reduire(etapes, parLinkup, 3).gardees.map((e) => e.cle)).toEqual(["pubmed", "linkup:expression:1", "site-pqr-sudouest-fr", "linkup:expression:1:linkedin"]);
    expect(reduire(etapes, parLinkup, 1).gardees.map((e) => e.cle)).toEqual(["pubmed", "linkup:expression:1"]);
  });
});

describe("ligne d'En direct", () => {
  const midi = new Date("2026-10-31T12:19:00Z");
  it("dit le dernier passage et le prochain, à l'heure de Paris", () => {
    expect(lignePassages("2026-10-31T11:00:00Z", midi)).toBe("Dernier passage aujourd'hui à 12 h · prochain à 15 h");
    expect(lignePassages("2026-10-30T20:00:00Z", midi)).toBe("Dernier passage hier à 21 h · prochain à 15 h");
    expect(lignePassages("2026-10-29T20:00:00Z", midi)).toBe("Dernier passage le 29/10 à 21 h · prochain à 15 h");
  });
  it("annonce la tournée de 7 h", () => {
    expect(lignePassages("2026-10-31T05:00:00Z", new Date("2026-10-31T05:30:00Z"))).toBe("Dernier passage aujourd'hui à 6 h · prochain à 7 h");
  });
  it("passe à minuit après 21 h", () => {
    expect(lignePassages("2026-10-31T20:00:00Z", new Date("2026-10-31T22:30:00Z"))).toBe("Dernier passage aujourd'hui à 21 h · prochain à 0 h");
  });
});

describe("tournées à signaler", () => {
  const maintenant = new Date("2026-10-31T12:00:00Z");
  const tournee = (id: string, statut: string, fin: string) => ({ id, statut, periode_fin: fin });
  const ids = (r: { id: string }[]) => r.map((x) => x.id);

  it("ne signale rien quand tout va bien, ni une tournée encore normale", () => {
    expect(tourneesEnPanne([tournee("a", "termine", "2026-10-31T06:00:00Z"), tournee("b", "synthese", "2026-10-31T09:00:00Z")], [], maintenant)).toEqual([]);
  });
  it("signale l'échec, le blocage et les étapes abandonnées", () => {
    const r = tourneesEnPanne([tournee("a", "echec", "2026-10-31T06:00:00Z"), tournee("b", "collecte", "2026-10-31T06:00:00Z"), tournee("c", "termine", "2026-10-31T09:00:00Z")], [{ rapport_id: "c" }], maintenant);
    expect(ids(r)).toEqual(["a", "b", "c"]);
    expect(r[1].bloquee).toBe(true);
  });
  it("attend la fin d'une tournée en cours avant de parler de ses étapes abandonnées", () => {
    expect(tourneesEnPanne([tournee("a", "collecte", "2026-10-31T09:00:00Z")], [{ rapport_id: "a" }], maintenant)).toEqual([]);
  });
});
