import { describe, expect, it } from "vitest";
import {
  colonneARepartir,
  dansLaPeriode,
  dateDansLeNom,
  decouperCsv,
  journeeDepuis,
  lireCsv,
  repartition,
  separateurProbable,
} from "./journees";

describe("lecture CSV", () => {
  it("devine le séparateur (Excel FR : point-virgule)", () => {
    expect(separateurProbable("nom;age;resultat\nA;3;ok")).toBe(";");
    expect(separateurProbable("nom,age\nA,3")).toBe(",");
    expect(separateurProbable("nom\tage")).toBe("\t");
    expect(separateurProbable('"a;b",c,d')).toBe(",");
  });

  it("gère guillemets, guillemets doublés, retours à la ligne et BOM", () => {
    const csv = '\uFEFFnom;commentaire\r\n"Dupont";"dit ""bonjour""\nsur 2 lignes"\r\n\r\n';
    expect(decouperCsv(csv)).toEqual([["nom", "commentaire"], ["Dupont", 'dit "bonjour"\nsur 2 lignes']]);
  });

  it("nomme les colonnes vides ou en double", () => {
    const t = lireCsv("nom;;nom\nA;B;C");
    expect(t.colonnes).toEqual(["nom", "Colonne 2", "nom (2)"]);
    expect(t.lignes[0]).toEqual({ nom: "A", "Colonne 2": "B", "nom (2)": "C" });
  });
});

describe("date de la journée", () => {
  it("lit les formats courants dans le nom du fichier", () => {
    expect(dateDansLeNom("extractions/journee_2026-11-05_lyon.csv")).toBe("2026-11-05");
    expect(dateDansLeNom("20261105.csv")).toBe("2026-11-05");
    expect(dateDansLeNom("depistage-05-11-2026.csv")).toBe("2026-11-05");
    expect(dateDansLeNom("2026/export.csv")).toBeNull();
    expect(dateDansLeNom("journee-2026-13-40.csv")).toBeNull();
  });

  it("se rabat sur la date de dépôt", () => {
    const j = journeeDepuis({ key: "x/export.csv", taille: 1, modifie: "2026-10-01T09:00:00Z" }, "a\n1");
    expect(j.date).toBe("2026-10-01");
    expect(j.dateDuNom).toBe(false);
  });
});

describe("statistiques", () => {
  const j1 = journeeDepuis({ key: "2026-10-01.csv", taille: 1, modifie: "" }, "id;resultat\n1;Bénin\n2;Bénin\n3;Suspect");
  const j2 = journeeDepuis({ key: "2026-11-01.csv", taille: 1, modifie: "" }, "id;resultat\n4;Bénin\n5;");

  it("choisit une colonne à peu de valeurs pour la répartition", () => {
    expect(colonneARepartir([j1, j2])).toBe("resultat");
  });

  it("compte la répartition, vides compris", () => {
    expect(repartition([j1, j2], "resultat")).toEqual([
      { valeur: "Bénin", nombre: 3 },
      { valeur: "Suspect", nombre: 1 },
      { valeur: "(vide)", nombre: 1 },
    ]);
  });

  it("regroupe la queue en « Autres »", () => {
    const parts = repartition([j1, j2], "id", 2);
    expect(parts).toHaveLength(3);
    expect(parts[2]).toEqual({ valeur: "Autres", nombre: 3 });
  });

  it("filtre par période", () => {
    expect(dansLaPeriode([j1, j2], "30j", new Date("2026-11-05")).map((j) => j.date)).toEqual(["2026-11-01"]);
    expect(dansLaPeriode([j1, j2], "tout")).toHaveLength(2);
  });
});
