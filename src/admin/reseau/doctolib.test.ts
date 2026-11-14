import { describe, expect, it } from "vitest";
import { choisirDoctolib, slug, urlDoctolibValide, urlPropre } from "../../../supabase/functions/_shared/doctolib";

const P = { nom: "ARNOUX", prenom: "Claire", communes: ["Grenoble", "La Tronche"] };

describe("réseau d'aval : lien Doctolib", () => {
  it("écrit les noms comme dans les adresses Doctolib", () => {
    expect(slug("Saint-Martin-d'Hères")).toBe("saint-martin-d-heres");
    expect(slug("BRUN-LÉVÊQUE")).toBe("brun-leveque");
  });

  it("n'accepte que des adresses de fiche Doctolib", () => {
    expect(urlDoctolibValide("https://www.doctolib.fr/dermatologue/grenoble/claire-arnoux")).toBe(true);
    expect(urlDoctolibValide("http://www.doctolib.fr/dermatologue/grenoble/claire-arnoux")).toBe(false);
    expect(urlDoctolibValide("https://www.doctolib.fr/dermatologue/grenoble")).toBe(false);
    expect(urlDoctolibValide("https://doctolib.fr.example.com/a/b/c")).toBe(false);
    expect(urlPropre("https://www.doctolib.fr/dermatologue/grenoble/claire-arnoux?pid=1#x")).toBe("https://www.doctolib.fr/dermatologue/grenoble/claire-arnoux");
  });

  it("rattache d'office la seule fiche au bon nom, au bon prénom et dans une commune d'exercice", () => {
    expect(choisirDoctolib([
      "https://www.doctolib.fr/dermatologue/grenoble/claire-arnoux?highlight=1",
      "https://www.doctolib.fr/dermatologue/grenoble",
      "https://www.doctolib.fr/dermatologue/lyon/paul-arnoux",
    ], P)).toEqual({ statut: "trouve_auto", url: "https://www.doctolib.fr/dermatologue/grenoble/claire-arnoux" });
    expect(choisirDoctolib(["https://www.doctolib.fr/dermatologue/la-tronche/claire-arnoux-dupont"], P).statut).toBe("trouve_auto");
  });

  it("laisse confirmer en cas de doute, ne devine rien", () => {
    expect(choisirDoctolib(["https://www.doctolib.fr/dermatologue/lyon/claire-arnoux"], P).statut).toBe("a_confirmer"); // autre ville
    expect(choisirDoctolib(["https://www.doctolib.fr/dermatologue/grenoble/marc-arnoux"], P).statut).toBe("a_confirmer"); // autre prénom
    expect(choisirDoctolib([
      "https://www.doctolib.fr/dermatologue/grenoble/claire-arnoux",
      "https://www.doctolib.fr/centre-de-sante/grenoble/claire-arnoux-centre",
    ], P)).toEqual({ statut: "a_confirmer", candidats: 2 });
    expect(choisirDoctolib([], P)).toEqual({ statut: "introuvable" });
    expect(choisirDoctolib(["https://www.pagesjaunes.fr/a/b/c"], P)).toEqual({ statut: "introuvable" });
    // Correspondance faible (autre nom) : jamais mise en avant
    expect(choisirDoctolib(["https://www.doctolib.fr/dermatologue/grenoble/paul-martin"], P)).toEqual({ statut: "introuvable" });
  });
});
