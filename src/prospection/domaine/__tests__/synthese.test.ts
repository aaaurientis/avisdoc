import { describe, expect, it } from "vitest";
import { pr80ComparerReference, pr81ExporterCsv, pr82CumulerSyntheses, pr83MatriceParCercle, pr85LundiDe, REFERENCE_CAMPAGNE } from "../synthese";

describe("synthèse", () => {
  it("compare à la référence de campagne", () => {
    expect(pr80ComparerReference(30, REFERENCE_CAMPAGNE.tauxAcceptationPct)).toBe("dans");
    expect(pr80ComparerReference(10, REFERENCE_CAMPAGNE.tauxAcceptationPct)).toBe("sous");
    expect(pr80ComparerReference(60, REFERENCE_CAMPAGNE.tauxAcceptationPct)).toBe("au_dessus");
    expect(pr80ComparerReference(null, 10)).toBeNull();
  });

  it("exporte un CSV tableur (BOM, point-virgule, guillemets)", () => {
    const csv = pr81ExporterCsv(["a", "b"], [["x;y", 1], [null, 'dit "oui"']]);
    expect(csv).toBe('﻿a;b\r\n"x;y";1\r\n;"dit ""oui"""\r\n');
  });

  it("cumule les semaines et calcule le taux", () => {
    const c = pr82CumulerSyntheses([
      { id: "1", semaine: "2026-08-24", invitations: 10, acceptations: 3, taux_acceptation: 30, conversations_ouvertes: 1, partenariats: 0, relances_oubliees: 0, par_cercle: [], genere_le: "" },
      { id: "2", semaine: "2026-08-31", invitations: 20, acceptations: 6, taux_acceptation: 30, conversations_ouvertes: 2, partenariats: 1, relances_oubliees: 1, par_cercle: [], genere_le: "" },
    ]);
    expect(c).toEqual({ invitations: 30, acceptations: 9, conversations: 3, partenariats: 1, tauxAcceptationPct: 30 });
  });

  it("construit la matrice cercle × statut", () => {
    const m = pr83MatriceParCercle([
      { cercle: 1, statut: "invite", nombre: 4 }, { cercle: 1, statut: "accepte", nombre: 2 }, { cercle: null, statut: "a_qualifier", nombre: 7 },
    ]);
    expect(m[1]).toEqual({ total: 6, invite: 4, accepte: 2 });
    expect(m[0]?.total).toBe(7);
  });

  it("trouve le lundi d'une semaine", () => {
    expect(pr85LundiDe(new Date(2026, 8, 3))).toBe("2026-08-31"); // jeudi 3 sept. 2026
    expect(pr85LundiDe(new Date(2026, 8, 6))).toBe("2026-08-31"); // dimanche
  });
});
