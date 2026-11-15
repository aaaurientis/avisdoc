import { describe, expect, it } from "vitest";
import { choisirFiche, dansLeDepartement, memeAdresse, motsDeLaVoie, porteLeNom, qualifierFiches } from "../../../supabase/functions/_shared/google-correspondance";

const fiche = (place_id: string, nom: string, adresse: string, ferme = false) => ({ place_id, nom, adresse, ferme });

describe("réseau d'aval : rattachement automatique des fiches Google", () => {
  it("reconnaît le nom de famille en mots entiers, accents et tirets compris", () => {
    expect(porteLeNom("Dr Claire Arnoux - Dermatologue", "ARNOUX")).toBe(true);
    expect(porteLeNom("Docteur Brun-Lévêque", "BRUN-LEVEQUE")).toBe(true);
    expect(porteLeNom("Cabinet Arnouxville", "ARNOUX")).toBe(false);
  });

  it("ne garde que les fiches en France et dans le département", () => {
    expect(dansLeDepartement("12 Rue des Tests, 38000 Grenoble, France", ["38"])).toBe(true);
    expect(dansLeDepartement("12 Rue des Tests, 69003 Lyon, France", ["38"])).toBe(false);
    expect(dansLeDepartement("Rue du Lac 3, 38000 Genève, Suisse", ["38"])).toBe(false);
    expect(dansLeDepartement("Cours Napoléon, 20000 Ajaccio, France", ["2A"])).toBe(true);
    expect(dansLeDepartement("Rue X, 97400 Saint-Denis, La Réunion, France", ["974"])).toBe(true);
  });

  it("rattache d'office toutes les fiches au bon nom et au bon code postal (cabinet et hôpital)", () => {
    const r = choisirFiche([
      fiche("A", "Dr Claire Arnoux", "12 Rue des Tests, 38000 Grenoble, France"),
      fiche("B", "Dr Arnoux - CHU fictif", "Avenue du CHU, 38700 La Tronche, France"),
      fiche("C", "Clinique fictive", "1 Avenue X, 38000 Grenoble, France"),
      fiche("D", "Dr Claire Arnoux", "4 Place Bellecour, 69002 Lyon, France"),
    ], "ARNOUX", [{ codePostal: "38000", adresse: "12 Rue DES TESTS" }, { codePostal: "38700", adresse: "Montee DU DOCTEUR CHAPUIS, BP 127" }], ["38"]);
    expect(r).toEqual({ statut: "trouvee_auto", placeIds: ["A", "B"] });
  });

  it("laisse choisir un opérateur en cas de doute", () => {
    expect(choisirFiche([fiche("A", "Dr Arnoux", "Rue X, 38100 Grenoble, France")], "ARNOUX", [{ codePostal: "38000", adresse: "12 Rue DES TESTS" }], ["38"]).statut).toBe("a_confirmer");
    expect(choisirFiche([fiche("A", "Dr Arnoux", "Rue X, 38000 Grenoble, France", true)], "ARNOUX", [{ codePostal: "38000", adresse: "12 Rue DES TESTS" }], ["38"]).statut).toBe("a_confirmer");
  });

  it("ne met jamais en avant une fiche sans le nom du praticien", () => {
    // Seulement des fiches sans le nom : introuvable, pas « à confirmer »
    expect(choisirFiche([fiche("A", "Centre médical", "Rue X, 38000 Grenoble, France")], "ARNOUX", [{ codePostal: "38000", adresse: "12 Rue DES TESTS" }], ["38"])).toEqual({ statut: "introuvable" });
    const q = qualifierFiches([
      fiche("F", "Centre médical", "Rue X, 38000 Grenoble, France"),
      fiche("M", "Dr Arnoux", "Rue Y, 38100 Grenoble, France"),
      fiche("S", "Dr Claire Arnoux", "Rue Z, 38000 Grenoble, France"),
      fiche("L", "Dr Claire Arnoux", "Rue Z, 69002 Lyon, France"),
    ], "ARNOUX", [{ codePostal: "38000", adresse: "12 Rue DES TESTS" }], ["38"]);
    expect(q.map((c) => [c.place_id, c.force])).toEqual([["S", "forte"], ["M", "moyenne"], ["F", "faible"]]);
  });

  it("dit introuvable quand rien n'est dans le département", () => {
    expect(choisirFiche([], "ARNOUX", [{ codePostal: "38000", adresse: "12 Rue DES TESTS" }], ["38"])).toEqual({ statut: "introuvable" });
    expect(choisirFiche([fiche("A", "Dr Arnoux", "Rue X, 69003 Lyon, France")], "ARNOUX", [{ codePostal: "38000", adresse: "12 Rue DES TESTS" }], ["38"])).toEqual({ statut: "introuvable" });
  });
});

describe("réseau d'aval : validation automatique à l'adresse RPPS", () => {
  const lieux = [{ codePostal: "38000", adresse: "12 Rue DES TESTS" }, { codePostal: "38200", adresse: "Montee DU DOCTEUR CHAPUIS, BP 127" }];

  it("lit la voie d'une adresse RPPS", () => {
    expect(motsDeLaVoie("12 Rue DES TESTS")).toEqual(["tests"]);
    expect(motsDeLaVoie("Montee DU DOCTEUR CHAPUIS, BP 127")).toEqual(["docteur", "chapuis"]);
    expect(motsDeLaVoie("CENTRE HOSPITALIER")).toEqual([]);
  });

  it("reconnaît la même adresse : code postal ET voie", () => {
    expect(memeAdresse("12 Rue des Tests, 38000 Grenoble, France", lieux[0])).toBe(true);
    expect(memeAdresse("Montée du Docteur Chapuis, 38200 Vienne, France", lieux[1])).toBe(true);
    expect(memeAdresse("3 Avenue Alsace, 38000 Grenoble, France", lieux[0])).toBe(false);
    expect(memeAdresse("12 Rue des Tests, 38100 Grenoble, France", lieux[0])).toBe(false);
  });

  it("valide d'office quand toutes les fiches retenues sont à une adresse RPPS", () => {
    expect(choisirFiche([fiche("A", "Dr Claire Arnoux", "12 Rue des Tests, 38000 Grenoble, France")], "ARNOUX", lieux, ["38"]))
      .toEqual({ statut: "confirmee", placeIds: ["A"] });
    // Une fiche à l'adresse, une autre seulement au code postal : à vérifier
    expect(choisirFiche([
      fiche("A", "Dr Claire Arnoux", "12 Rue des Tests, 38000 Grenoble, France"),
      fiche("B", "Dr Arnoux", "5 Place Victor Hugo, 38000 Grenoble, France"),
    ], "ARNOUX", lieux, ["38"])).toEqual({ statut: "trouvee_auto", placeIds: ["A", "B"] });
  });
});

describe("réseau d'aval : cas réel du 14/11 (Dr Boudet, Clermont-Ferrand)", () => {
  it("valide d'office une fiche au nom et à l'adresse RPPS", async () => {
    const { forceFiche } = await import("../../../supabase/functions/_shared/google-correspondance");
    const lieux = [
      { codePostal: "63100", adresse: "1 RUE SIMMER" },
      { codePostal: "63100", adresse: "123 Boulevard ETIENNE CLEMENTEL" },
    ];
    expect(forceFiche(
      { place_id: "x", nom: "Cabinet ORL 56 république Dr Boudet Stéphane", adresse: "1 Rue Simmer, 63100 Clermont-Ferrand, France", ferme: false },
      "BOUDET", lieux,
    )).toBe("certaine");
  });
});

describe("adresse RPPS avec complément après une virgule", () => {
  it("« 21 RUE DE SARLIEVE, LE TRIANGLE » : seule la voie compte", () => {
    expect(motsDeLaVoie("21 RUE DE SARLIEVE, LE TRIANGLE")).toEqual(["sarlieve"]);
    expect(memeAdresse("21 Rue de Sarliève, 63800 Cournon-d'Auvergne, France", { codePostal: "63800", adresse: "21 RUE DE SARLIEVE, LE TRIANGLE" })).toBe(true);
  });
});
