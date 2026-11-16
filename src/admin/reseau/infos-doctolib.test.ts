import { describe, expect, it } from "vitest";
import { normaliserInfosDoctolib } from "./reseauRepo";

describe("informations Doctolib partielles", () => {
  it("un import CSV (réservable + créneaux seulement) donne des listes vides, jamais undefined", () => {
    const i = normaliserInfosDoctolib({ reservable: true, disponibilites: { creneaux: 0, sous7Jours: 0, parJour: [], premier: null, releve_le: "2026-11-16T12:00:00Z" } })!;
    expect(i.langues).toEqual([]);
    expect(i.tarifs).toEqual([]);
    expect(i.expertises).toEqual([]);
    expect(i.reservable).toBe(true);
    expect(i.disponibilites?.parJour).toEqual([]);
  });
  it("vide ou absent : null", () => {
    expect(normaliserInfosDoctolib(null)).toBeNull();
  });
});
