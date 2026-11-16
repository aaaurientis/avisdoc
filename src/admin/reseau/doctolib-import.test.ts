import { describe, expect, it } from "vitest";
import { analyserImport, COLONNES_EXPORT, lireCsv, versCsv } from "../../../supabase/functions/_shared/doctolib-import";

const auj = new Date("2026-11-16T10:00:00Z");
const entete = COLONNES_EXPORT.join(";");

describe("export / import des liens Doctolib", () => {
  it("l'export se relit à l'identique (guillemets, accents)", () => {
    const csv = versCsv([{ rpps: "10001234567", nom: "D'Arnoux; Claire", ville: "Saint-Étienne" }], COLONNES_EXPORT);
    const l = lireCsv(csv);
    expect(l[0]).toEqual([...COLONNES_EXPORT]);
    expect(l[1][1]).toBe("D'Arnoux; Claire");
    expect(l[1][4]).toBe("Saint-Étienne");
  });
  it("lit une ligne complète et déduit le premier créneau", () => {
    const r = analyserImport([entete, "10001234567;ARNOUX;Claire;DERM;Grenoble;confirme;https://www.doctolib.fr/dermatologue/grenoble/claire-arnoux;2026-11-10;oui;oui;20/11/2026;12;16/11/2026"].join("\n"), auj);
    expect(r.erreurs).toEqual([]);
    expect(r.resultats[0]).toMatchObject({ rpps: "10001234567", reservable: true, nouveauxPatients: "oui", premierCreneau: "2026-11-20", creneaux7j: 12, creneau: "moins_7j", releveLe: "2026-11-16" });
  });
  it("ignore sans erreur les lignes non remplies, refuse les lignes sans source ni date", () => {
    const r = analyserImport([
      entete,
      "10001234567;A;B;DERM;X;confirme;https://www.doctolib.fr/a/b/c;;;;;;",
      "10001234568;A;B;DERM;X;confirme;;;oui;;;;16/11/2026",
      "10001234569;A;B;DERM;X;confirme;https://www.doctolib.fr/a/b/d;;non;;;;",
      "10001234570;A;B;DERM;X;confirme;https://www.doctolib.fr/a/b/e;;peut-être;;;;16/11/2026",
    ].join("\n"), auj);
    expect(r.resultats).toEqual([]);
    expect(r.erreurs.map((e) => e.ligne)).toEqual([3, 4, 5]);
  });
  it("nouveaux patients refusés sans créneau : « aucun pour un nouveau patient »", () => {
    const r = analyserImport([entete, "10001234567;;;;;;https://www.doctolib.fr/a/b/c;;oui;non;;;2026-11-15"].join("\n"), auj);
    expect(r.resultats[0].creneau).toBe("aucun_nouveau");
  });
  it("colonnes obligatoires absentes", () => {
    expect(analyserImport("rpps;nom\n1;2", auj).erreurs[0].message).toMatch(/url_doctolib/);
  });
});

describe("import : valeurs commentées et statut de la fiche", () => {
  const h = "rpps;url_doctolib;statut_fiche;reservable;nouveaux_patients;premier_creneau;creneaux_7j;releve_le";
  it("« inconnu » vaut vide, « non (commentaire) » vaut non, date avec heure acceptée", () => {
    const r = analyserImport([h,
      "10000000001;https://www.doctolib.fr/a/b/c;fiche active;oui;inconnu;2026-11-26 16:30;0;2026-11-16T10:06:05.425Z",
      "10000000002;https://www.doctolib.fr/a/b/d;fiche active;oui;non (bloqué dans le parcours de RDV en ligne);(parcours interrompu : aucune option);;2026-11-16T10:06:05Z",
    ].join("\n"), auj);
    expect(r.erreurs).toEqual([]);
    expect(r.resultats[0]).toMatchObject({ nouveauxPatients: null, premierCreneau: "2026-11-26", creneau: "7_30j", creneaux7j: 0, releveLe: "2026-11-16" });
    expect(r.resultats[1]).toMatchObject({ nouveauxPatients: "non", premierCreneau: null, creneau: "aucun_nouveau" });
  });
  it("page disparue : signalée ; non relevée : ignorée", () => {
    const r = analyserImport([h,
      "10000000003;https://www.doctolib.fr/a/b/e;page inexistante (« Cette page n'existe plus »);non;inconnu;;;2026-11-16T10:06:05Z",
      "10000000004;https://www.doctolib.fr/a/b/f;non relevé (Doctolib a limité les requêtes);;;;;2026-11-16T10:06:05Z",
    ].join("\n"), auj);
    expect(r.resultats).toEqual([]);
    expect(r.erreurs.map((e) => e.ligne)).toEqual([2]);
  });
});

describe("export : date du dernier relevé", () => {
  it("un fichier exporté avant l'ajout de la colonne s'importe toujours", () => {
    const ancien = "rpps;nom;prenom;population;ville;statut_lien;url_doctolib;reservable;nouveaux_patients;premier_creneau;creneaux_7j;releve_le";
    const r = analyserImport([ancien, "10001234567;A;B;DERM;X;confirme;https://www.doctolib.fr/a/b/c;oui;oui;;;16/11/2026"].join("\n"), auj);
    expect(r.erreurs).toEqual([]);
    expect(r.resultats).toHaveLength(1);
  });
  it("« dernier_releve » seul ne compte pas comme un résultat", () => {
    const r = analyserImport([entete, "10001234567;A;B;DERM;X;confirme;https://www.doctolib.fr/a/b/c;2026-11-10;;;;;"].join("\n"), auj);
    expect(r).toEqual({ resultats: [], erreurs: [] });
  });
});
