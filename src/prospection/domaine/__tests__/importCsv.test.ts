import { describe, expect, it } from "vitest";
import {
  pr60AnalyserCsv, pr61ProposerMapping, pr62DeduireNiveau, pr63EffectifDepuisTexte, pr64NormaliserLinkedin,
  pr65ConstruireLignes, pr66MappingSuffisant,
} from "../importCsv";

const CSV = [
  "﻿First Name;Last Name;Title;Company;Profile URL;Company Size;Geography",
  'Alice;Recette;"Associée, gérante";Recette Courtage Est;https://www.linkedin.com/in/alice-recette/;11-50;Grand Est',
  "Bruno;Recette;DRH;Recette Industrie;linkedin.com/in/bruno-recette?trk=x;1 001-5 000;Grand Est",
  "",
].join("\r\n");

describe("import CSV", () => {
  it("analyse un export Sales Navigator (BOM, guillemets, point-virgule)", () => {
    const csv = pr60AnalyserCsv(CSV);
    expect(csv.separateur).toBe(";");
    expect(csv.entetes).toEqual(["First Name", "Last Name", "Title", "Company", "Profile URL", "Company Size", "Geography"]);
    expect(csv.lignes).toHaveLength(2);
    expect(csv.lignes[0]?.[2]).toBe("Associée, gérante");
  });

  it("propose un mapping que l'utilisateur confirme", () => {
    const m = pr61ProposerMapping(pr60AnalyserCsv(CSV).entetes);
    expect(m).toMatchObject({ prenom: 0, nom: 1, fonction: 2, compte_nom: 3, contact_linkedin_url: 4, effectif: 5, region: 6 });
    expect(pr66MappingSuffisant(m)).toBe(true);
    expect(pr66MappingSuffisant({ prenom: 0 })).toBe(false);
  });

  it("déduit le niveau et la fourchette d'effectif", () => {
    expect(pr62DeduireNiveau("Associée, gérante")).toBe("associe");
    expect(pr62DeduireNiveau("DRH")).toBe("directeur");
    expect(pr62DeduireNiveau("Responsable QVCT")).toBe("responsable");
    expect(pr62DeduireNiveau("Chargée de prévention")).toBe("charge");
    expect(pr63EffectifDepuisTexte("1 001-5 000")).toEqual({ min: 1001, max: 5000 });
    expect(pr63EffectifDepuisTexte("10 001+")).toEqual({ min: 10001, max: null });
    expect(pr63EffectifDepuisTexte("250")).toEqual({ min: 250, max: 250 });
  });

  it("normalise les URL LinkedIn comme le serveur", () => {
    expect(pr64NormaliserLinkedin("linkedin.com/in/bruno-recette?trk=x")).toBe("https://www.linkedin.com/in/bruno-recette");
    expect(pr64NormaliserLinkedin("HTTPS://FR.LINKEDIN.COM/IN/Alice/")).toBe("https://www.linkedin.com/in/alice");
    expect(pr64NormaliserLinkedin("  ")).toBeNull();
  });

  it("construit les lignes pour prospection.importer() avec un score de tri", () => {
    const csv = pr60AnalyserCsv(CSV);
    const lignes = pr65ConstruireLignes(csv, pr61ProposerMapping(csv.entetes), { type_compte: "courtier", cercle: 1, expose: false }, new Date(2026, 8, 3));
    expect(lignes[0]?.contact).toMatchObject({ prenom: "Alice", nom: "Recette", niveau: "associe", linkedin_url: "https://www.linkedin.com/in/alice-recette" });
    expect(lignes[0]?.compte).toMatchObject({ nom: "Recette Courtage Est", type: "courtier", cercle: 1, effectif_min: 11, effectif_max: 50 });
    expect(lignes[0]?.contact.score).toBe(20 + 8); // cercle 1 + niveau associé
    expect(lignes[1]?.compte).toMatchObject({ effectif_min: 1001, effectif_max: 5000 });
  });
});
