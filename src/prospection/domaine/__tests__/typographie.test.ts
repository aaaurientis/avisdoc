import { describe, expect, it } from "vitest";
import { L } from "../../i18n/libelles";
import { pr90VerifierTypographie, pr91Franciser } from "../typographie";

function chaines(o: unknown, chemin = "L"): Array<[string, string]> {
  if (typeof o === "string") return [[chemin, o]];
  if (o && typeof o === "object") return Object.entries(o).flatMap(([k, v]) => chaines(v, `${chemin}.${k}`));
  return [];
}

describe("typographie française", () => {
  it("francise un texte saisi à plat", () => {
    expect(pr91Franciser("Qui relancer aujourd'hui ? Détail : « oui »...")).toBe(
      "Qui relancer aujourd’hui ? Détail : « oui »…",
    );
    expect(pr91Franciser("Ouvert à 10:30, voir https://www.avisdoc.fr")).toBe("Ouvert à 10:30, voir https://www.avisdoc.fr");
  });

  it("repère les fautes", () => {
    expect(pr90VerifierTypographie("Bonjour — l'avis : oui ?")).toEqual(
      expect.arrayContaining(["tiret_cadratin", "apostrophe_droite", "insecable_manquante"]),
    );
  });

  it("tous les libellés du module sont conformes", () => {
    const fautes = chaines(L).flatMap(([chemin, s]) => pr90VerifierTypographie(s).map((c) => `${chemin} : ${c}`));
    expect(fautes).toEqual([]);
  });
});
