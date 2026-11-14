import { describe, expect, it } from "vitest";
import {
  calculerScore,
  domaineExclu,
  estTypeSignal,
  extraitPresent,
  texteDeHtml,
  urlValide,
  valeurAdmise,
} from "../../../supabase/functions/_shared/reseau-signaux";

const U = "https://cabinet-fictif.example.fr/page";

describe("réseau d'aval : sources des signaux", () => {
  it("refuse un signal sans URL valide (recette 4)", () => {
    expect(urlValide(U)).toBe(true);
    expect(urlValide("")).toBe(false);
    expect(urlValide("cabinet-fictif.fr")).toBe(false);
    expect(urlValide("https://exemple .fr")).toBe(false);
    expect(urlValide("javascript:alert(1)")).toBe(false);
  });

  it("n'admet que les valeurs de la grille", () => {
    expect(estTypeSignal("nouveaux_patients")).toBe(true);
    expect(estTypeSignal("honoraires")).toBe(false);
    expect(valeurAdmise("nouveaux_patients", "sur_courrier")).toBe(true);
    expect(valeurAdmise("motif_exerese", "peut-etre")).toBe(false);
  });

  it("écarte les domaines exclus, sous-domaines compris (règle 2)", () => {
    expect(domaineExclu("https://www.doctolib.fr/dermatologue/grenoble")).toBe(true);
    expect(domaineExclu("https://fr.linkedin.com/in/x")).toBe(true);
    expect(domaineExclu("https://www.google.com/maps/place/x")).toBe(true);
    expect(domaineExclu(U)).toBe(false);
    expect(domaineExclu("pas une url")).toBe(true);
  });
});

describe("réseau d'aval : rien d'inventé", () => {
  const html = `<html><head><script>var x = "Nous acceptons tout le monde";</script></head>
    <body><h1>Cabinet fictif</h1><p>Le cabinet n&#39;accepte de nouveaux patients
    que <b>sur courrier</b> de leur m&eacute;decin traitant.</p></body></html>`;
  const texte = texteDeHtml(html);

  it("retrouve un extrait mot pour mot, aux espaces, balises, accents et apostrophes près", () => {
    expect(extraitPresent("Le cabinet n’accepte de nouveaux patients que sur courrier", texte)).toBe(true);
    expect(extraitPresent("que sur courrier de leur médecin traitant", texte)).toBe(true);
  });

  it("refuse un extrait absent, reformulé ou trop court", () => {
    expect(extraitPresent("Le cabinet accepte volontiers de nouveaux patients", texte)).toBe(false);
    expect(extraitPresent("sur courrier", texte)).toBe(false); // trop court pour prouver quoi que ce soit
    expect(extraitPresent("Nous acceptons tout le monde", texte)).toBe(false); // dans un script, pas dans la page lue
  });
});

describe("réseau d'aval : score de probabilité d'adhésion", () => {
  const actif = { etat: "identifie", vuAuDernierImport: true };

  it("part du taux de base quand rien n'est connu (inconnu ne pénalise pas)", () => {
    const s = calculerScore(actif, [{ type: "nouveaux_patients", valeur: "inconnu", url: U }]);
    expect(s.base).toBe(-1.39);
    expect(s.z).toBe(-1.39);
    expect(s.contributions).toHaveLength(0);
    expect(Math.round(s.probabilite * 100)).toBe(20);
  });

  it("se recalcule à la main à partir du détail affiché (recette 5)", () => {
    const s = calculerScore(actif, [
      { type: "nouveaux_patients", valeur: "oui", url: U },
      { type: "motif_exerese", valeur: "oui", url: U },
    ]);
    const z = s.base + s.contributions.reduce((t, c) => t + c.points, 0);
    expect(s.z).toBeCloseTo(z, 10);
    expect(s.probabilite).toBeCloseTo(1 / (1 + Math.exp(-z)), 10);
    expect(Math.round(s.probabilite * 100)).toBe(50); // l'exemple de la note du lot 0
    expect(s.contributions.every((c) => c.url === U)).toBe(true);
  });

  it("baisse avec un signal défavorable", () => {
    const s = calculerScore(actif, [{ type: "signal_depart", valeur: "oui", url: U }]);
    expect(s.z).toBe(-2.89);
    expect(s.probabilite).toBeLessThan(0.06);
  });

  it("vaut 0 avec son motif sur un critère éliminatoire", () => {
    expect(calculerScore({ etat: "exclu" }, []).elimine).toBe("Exclu du réseau");
    const esth = calculerScore(actif, [{ type: "orientation", valeur: "esthetique_dominante", url: U }]);
    expect(esth.probabilite).toBe(0);
    expect(esth.elimine).toBe("Activité esthétique dominante");
    expect(calculerScore({ etat: "identifie", vuAuDernierImport: false }, []).probabilite).toBe(0);
  });

  it("annonce une estimation non calibrée", () => {
    expect(calculerScore(actif, []).calibre).toBe(false);
  });
});

describe("réseau d'aval : premier créneau Doctolib", () => {
  const actif = { etat: "identifie", vuAuDernierImport: true };
  const maintenant = new Date("2026-11-14T12:00:00Z");
  it("compte un relevé récent, ignore un relevé de plus de 14 jours", () => {
    const recent = calculerScore(actif, [{ type: "creneau_doctolib", valeur: "moins_7j", url: U, le: "2026-11-10T10:00:00Z" }], maintenant);
    expect(recent.z).toBe(-0.89);
    const vieux = calculerScore(actif, [{ type: "creneau_doctolib", valeur: "moins_7j", url: U, le: "2026-10-20T10:00:00Z" }], maintenant);
    expect(vieux.z).toBe(-1.39);
    expect(vieux.contributions).toHaveLength(0);
  });
});
