import { describe, expect, it } from "vitest";
import { analyserFicheDoctolib, dateProchainRdv } from "../../../supabase/functions/_shared/doctolib-fiche";

// Texte d'une fiche FICTIVE, à la manière du texte visible d'une page Doctolib.
const FICHE = `Prendre rendez-vous
Dr Claire Arnoux
Dermatologue et vénérologue
Prochain RDV le jeudi 20 novembre
Prendre rendez-vous
Carte et informations d'accès
CABINET FICTIF ARNOUX
12 rue des Tests
38000 Grenoble
Présentation
Le Dr Arnoux vous accueille pour le dépistage des cancers de la peau et le suivi des grains de beauté.
Expertises, actes et symptômes
Dermoscopie
Exérèse de lésion cutanée
Cartographie des grains de beauté
Acné
Voir plus
Tarifs
Consultation : 50 €
Conventionné secteur 2
Carte Vitale acceptée
Langues parlées
Français, Anglais et Espagnol
Informations légales
RPPS 19900000001`;

describe("réseau d'aval : analyse d'une fiche Doctolib relevée par l'opérateur", () => {
  const auj = new Date("2026-11-14T10:00:00Z");
  const f = analyserFicheDoctolib(FICHE, auj);

  it("lit les rubriques de la fiche", () => {
    expect(f.nom).toBe("Dr Claire Arnoux");
    expect(f.specialite).toBe("Dermatologue et vénérologue");
    expect(f.expertises).toEqual(["Dermoscopie", "Exérèse de lésion cutanée", "Cartographie des grains de beauté", "Acné"]);
    expect(f.langues).toEqual(["Français", "Anglais", "Espagnol"]);
    expect(f.conventionnement).toBe("Conventionné secteur 2");
    expect(f.carteVitale).toBe(true);
    expect(f.tarifs).toContain("Consultation : 50 €");
    expect(f.presentation).toMatch(/^Le Dr Arnoux vous accueille/);
  });

  it("déduit le premier créneau et propose les signaux, chacun avec son passage", () => {
    expect(f.premierCreneau).toMatchObject({ date: "2026-11-20", jours: 6, valeur: "moins_7j" });
    expect(f.signaux.map((s) => [s.type, s.valeur])).toEqual([
      ["creneau_doctolib", "moins_7j"],
      ["dermoscopie", "oui"],
      ["motif_exerese", "oui"],
    ]);
    expect(f.signaux.every((s) => s.extrait.length > 3)).toBe(true);
  });

  it("repère les fiches réservées aux patients déjà suivis et l'absence de créneau", () => {
    const g = analyserFicheDoctolib(`Dr Paul Bertin\nORL\nLa prise de rendez-vous en ligne est réservée aux patients déjà suivis par ce soignant.\nAucune disponibilité en ligne.`, auj);
    expect(g.nouveauxPatients?.valeur).toBe("non");
    expect(g.premierCreneau?.valeur).toBe("aucun_nouveau");
  });

  it("ne devine rien sur une page sans rubrique reconnue", () => {
    const h = analyserFicheDoctolib("Page sans rapport\nBienvenue", auj);
    expect(h.expertises).toEqual([]);
    expect(h.signaux).toEqual([]);
    expect(h.premierCreneau).toBeNull();
  });

  it("lit la date du prochain rendez-vous, y compris en changeant d'année", () => {
    expect(dateProchainRdv("Prochain RDV le 3 janvier", new Date("2026-12-20T10:00:00Z"))).toBe("2027-01-03");
    expect(dateProchainRdv("Prochain RDV le mardi 2 déc.", auj)).toBe("2026-12-02");
    expect(dateProchainRdv("Prochain RDV bientôt", auj)).toBeNull();
  });
});

describe("fiche Doctolib non réservable", () => {
  it("repère « n'est pas sur Doctolib » et nettoie le nom", () => {
    const f = analyserFicheDoctolib([
      "Dr. Remi Achin n'est pas sur Doctolib",
      "Dermatologue et vénérologue",
      "10 Avenue de la Liberté, 63530 Volvic",
      "Ce soignant n'est pas réservable en ligne sur Doctolib.",
      "Accéder à la recherche",
    ].join("\n"), new Date("2026-11-15"));
    expect(f.reservable).toBe(false);
    expect(f.nom).toBe("Dr. Remi Achin");
    expect(f.specialite).toBe("Dermatologue et vénérologue");
    expect(f.adresses).toEqual(["10 Avenue de la Liberté, 63530 Volvic"]);
  });
  it("une fiche avec prise de rendez-vous est réservable", () => {
    expect(analyserFicheDoctolib("Dr Claire Arnoux\nDermatologue\nPrendre rendez-vous", new Date("2026-11-15")).reservable).toBe(true);
  });
});
