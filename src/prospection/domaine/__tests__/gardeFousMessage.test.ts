import { describe, expect, it } from "vitest";
import { pr30GardeFousMessage, pr31ObjectionAttendue, pr32NormaliserTypographieLinkedin } from "../gardeFousMessage";

const CONFORME =
  "Bonjour, je developpe AvisDoc, un service de reperage de lesions suspectes sur le lieu de travail, " +
  "avec avis d'un dermatologue sous 96 heures. L'employeur ne voit aucune information individuelle. " +
  "Ouvert a un echange de vingt minutes ?";

describe("garde-fous des messages générés", () => {
  it("accepte un texte conforme", () => {
    expect(pr30GardeFousMessage(CONFORME, "invitation", false)).toEqual([]);
  });

  it("refuse un tiret cadratin (recette §8.4)", () => {
    const v = pr30GardeFousMessage("Bonjour — je developpe AvisDoc.", "invitation", false);
    expect(v.map((x) => x.code)).toContain("tiret_cadratin");
  });

  it("refuse « dépistage du cancer » (recette §8.4)", () => {
    const v = pr30GardeFousMessage("Nous organisons le dépistage du cancer de la peau.", "message", false);
    expect(v.map((x) => x.code)).toContain("vocabulaire_interdit");
  });

  it("refuse apostrophe courbe et espace insécable", () => {
    const codes = pr30GardeFousMessage("L’avis arrive vite ! Intéressé ?", "message", false).map((x) => x.code);
    expect(codes).toContain("apostrophe_courbe");
    expect(codes).toContain("espace_insecable");
  });

  it("borne la longueur : 300 pour une invitation, 600 pour un message", () => {
    const long = "a".repeat(301);
    expect(pr30GardeFousMessage(long, "invitation", false).map((x) => x.code)).toContain("longueur");
    expect(pr30GardeFousMessage(long, "message", false).map((x) => x.code)).not.toContain("longueur");
    expect(pr30GardeFousMessage("a".repeat(601), "message", false).map((x) => x.code)).toContain("longueur");
  });

  it("refuse description clinique, promesse de résultat et ciblage santé", () => {
    expect(pr30GardeFousMessage("Envoyez une photo du grain de beaute.", "message", false).map((x) => x.code)).toContain("description_clinique");
    expect(pr30GardeFousMessage("Resultat garanti sous 96 heures.", "message", false).map((x) => x.code)).toContain("promesse_resultat");
    expect(pr30GardeFousMessage("Vos salaries a risque seront vus en priorite.", "message", false).map((x) => x.code)).toContain("ciblage_sante");
  });

  it("exige le rappel de confidentialité pour une fonction RH", () => {
    expect(pr30GardeFousMessage(CONFORME, "message", true).map((x) => x.code)).toContain("confidentialite_rh_absente");
    expect(pr30GardeFousMessage(CONFORME + " Confidentialite totale pour vos equipes.", "message", true)).toEqual([]);
  });

  it("choisit l'objection attendue selon le cercle", () => {
    expect(pr31ObjectionAttendue("courtier", 1)).toBe("courtier_donnees_sante");
    expect(pr31ObjectionAttendue("qvct", 2)).toBe("intermediaire_valeur_ajoutee");
    expect(pr31ObjectionAttendue("entreprise", 3)).toBe("entreprise_temps_confidentialite");
  });

  it("normalise sans perte apostrophes et espaces, pas le tiret cadratin", () => {
    expect(pr32NormaliserTypographieLinkedin("L’avis : oui — non")).toBe("L'avis : oui — non");
  });
});
