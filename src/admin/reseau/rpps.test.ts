import { describe, expect, it } from "vitest";
import {
  bornesCodePostal,
  departementDuLieu,
  estDepartement,
  estPerime,
  libelleModeExercice,
  normaliserRpps,
  planifierImport,
  regrouperParPraticien,
} from "../../../supabase/functions/_shared/reseau-rpps";
import { LIGNES_38, LIGNES_CORSE } from "./rpps-fictif";

describe("réseau d'aval : lecture de l'extraction RPPS", () => {
  const praticiens = regrouperParPraticien(LIGNES_38, "38");
  const par = (rpps: string) => praticiens.find((p) => p.rpps === rpps);

  it("ne garde que les médecins des spécialités retenues, exerçant dans le département", () => {
    expect(praticiens.map((p) => p.rpps)).toEqual(["19900000001", "19900000002", "19900000003", "19900000004"]);
  });

  it("ignore la chirurgie viscérale, les non-médecins, les compétences et les RPPS invalides", () => {
    for (const rpps of ["19900000005", "19900000006", "19900000007"]) expect(par(rpps)).toBeUndefined();
  });

  it("un praticien sur plusieurs lieux n'existe qu'une fois, avec un lieu par structure (recette 2)", () => {
    const arnoux = par("19900000001")!;
    expect(arnoux.lieux.map((l) => l.cle)).toEqual(["S1", "F1"]);
    expect(arnoux.lieux[0].telephone).toBe("0400000001");
    expect(arnoux.lieux[1].modeExercice).toBe("Salarié");
    expect(arnoux.lieux[0].modeExercice).toBe("Libéral");
  });

  it("ne rattache au département que les lieux qui y sont", () => {
    const dumas = par("19900000004")!;
    expect(dumas.lieux).toHaveLength(1);
    expect(dumas.lieux[0].commune).toBe("Voiron");
    // Le même praticien, importé depuis le 73, n'aura que son lieu savoyard.
    const depuis73 = regrouperParPraticien(LIGNES_38, "73");
    expect(depuis73.map((p) => p.rpps)).toEqual(["19900000004"]);
    expect(depuis73[0].lieux[0].commune).toBe("Chambéry");
  });

  it("donne la population et les rôles attendus d'après la spécialité", () => {
    expect(par("19900000001")).toMatchObject({ population: "DERM", roles: ["consultation", "dermoscopie", "exerese"] });
    expect(par("19900000002")).toMatchObject({ population: "ORL", roles: ["exerese"] });
    const carre = par("19900000003")!;
    expect(carre.population).toBe("PLAST"); // plasticien et chirurgien général : PLAST l'emporte
    expect(carre.specialites).toEqual(["Chirurgie générale", "Chirurgie plastique reconstructrice et esthétique"]);
  });

  it("départage la Corse par le code commune", () => {
    expect(regrouperParPraticien(LIGNES_CORSE, "2A").map((p) => p.nom)).toEqual(["INNOCENTI"]);
    expect(regrouperParPraticien(LIGNES_CORSE, "2B").map((p) => p.nom)).toEqual(["JOLY"]);
    expect(departementDuLieu("", "20000")).toBeNull(); // sans code commune, on ne devine pas
  });

  it("calcule les bornes de code postal et reconnaît les départements", () => {
    expect(bornesCodePostal("38")).toEqual({ min: "38000", max: "38999" });
    expect(bornesCodePostal("2B")).toEqual({ min: "20000", max: "20999" });
    expect(bornesCodePostal("974")).toEqual({ min: "97400", max: "97499" });
    expect(departementDuLieu("97411", "97400")).toBe("974");
    expect(estDepartement("2A")).toBe(true);
    expect(estDepartement("20")).toBe(false);
    expect(estDepartement("975")).toBe(false);
  });

  it("normalise le RPPS et le mode d'exercice", () => {
    expect(normaliserRpps(19900000001)).toBe("19900000001");
    expect(normaliserRpps("123")).toBeNull();
    expect(libelleModeExercice("Lib,indép,artis,com")).toBe("Libéral");
    expect(libelleModeExercice("")).toBeNull();
  });
});

describe("réseau d'aval : plan d'import", () => {
  const praticiens = regrouperParPraticien(LIGNES_38, "38");

  it("crée tout au premier import", () => {
    const plan = planifierImport(praticiens, [], []);
    expect(plan.aCreer).toHaveLength(4);
    expect(plan.aMettreAJour).toHaveLength(0);
  });

  it("est rejouable sans doublon : un RPPS connu est mis à jour (recette 1)", () => {
    const existants = praticiens.map((p, i) => ({ id: `id${i}`, rpps: p.rpps, etat: "qualifie" }));
    const plan = planifierImport(praticiens, existants, []);
    expect(plan.aCreer).toHaveLength(0);
    expect(plan.aMettreAJour.map((m) => m.id)).toEqual(["id0", "id1", "id2", "id3"]);
  });

  it("n'importe jamais un praticien exclu, même absent de la base (recette 3)", () => {
    const plan = planifierImport(praticiens, [{ id: "x", rpps: "19900000002", etat: "exclu" }], ["19900000003"]);
    expect(plan.exclusIgnores.sort()).toEqual(["19900000002", "19900000003"]);
    expect(plan.aCreer.map((p) => p.rpps)).toEqual(["19900000001", "19900000004"]);
    expect(plan.aMettreAJour).toHaveLength(0);
  });
});

describe("réseau d'aval : fraîcheur", () => {
  const maintenant = new Date("2026-11-14T12:00:00Z");
  it("marque périmée une donnée de plus de 90 jours (règle 9)", () => {
    expect(estPerime("2026-11-09T00:00:00Z", maintenant)).toBe(false);
    expect(estPerime("2026-08-16T12:00:00Z", maintenant)).toBe(false); // 90 jours pile
    expect(estPerime("2026-08-15T00:00:00Z", maintenant)).toBe(true);
    expect(estPerime(null, maintenant)).toBe(true);
  });
});

describe("réseau d'aval : ajout d'un praticien par son RPPS", () => {
  it("reprend tous ses lieux, dans chaque département", async () => {
    const { praticienDepuisLignes } = await import("../../../supabase/functions/_shared/reseau-rpps");
    const r = praticienDepuisLignes(LIGNES_38, "19900000004");
    expect("praticien" in r && r.praticien.lieux.map((l) => l.departement)).toEqual(["38", "73"]);
  });

  it("fait d'un généraliste un MG_DERM, et refuse ce qui n'entre pas dans le réseau", async () => {
    const { praticienDepuisLignes } = await import("../../../supabase/functions/_shared/reseau-rpps");
    const { ligne } = await import("./rpps-fictif");
    const mg = [ligne({ rpps: "19900000020", nom: "KLEIN", prenom: "Sophie", code: "SM53", libelle: "Spécialiste en Médecine Générale", cp: "38000", commune: "Grenoble", cc: "38185", structure: "CABINET FICTIF KLEIN" })];
    const r = praticienDepuisLignes(mg, "19900000020");
    expect("praticien" in r && r.praticien).toMatchObject({ population: "MG_DERM", roles: ["consultation", "dermoscopie"] });
    expect(praticienDepuisLignes(LIGNES_38, "19900000006")).toEqual({ refus: "Ce RPPS n'est pas celui d'un médecin." });
    expect("refus" in praticienDepuisLignes(LIGNES_38, "19900000005")).toBe(true); // chirurgie viscérale
    expect("refus" in praticienDepuisLignes([], "19900000099")).toBe(true);
  });
});
