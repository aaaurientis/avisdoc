import { describe, expect, it } from "vitest";
import { colonnesProspect, departementDuCodePostal, erreurSaisie, FICHE_VIDE, saisieDepuisProspect } from "./fiche-saisie";
import { champsAffaire, contactsAffaire, saisieDepuisAffaire } from "./affaire-saisie";
import type { Prospect } from "./merx";
import type { Client } from "../types";

const saisie = {
  ...FICHE_VIDE,
  nom: "SMAC Colmar",
  siren: "",
  secteur: "btp" as const,
  activite: "Étanchéité",
  effectif: "21",
  adresse: "12 rue des Lilas",
  codePostal: "68000",
  ville: "Colmar",
  telephone: "03 89 00 00 00",
  email: "contact@smac.fr",
  site: "smac.fr",
  dirigeant: "Jean Martin",
  dirigeantQualite: "Directeur",
  interlocuteurs: [
    { nom: "Claire Dupont", fonction: "DRH", email: "c@smac.fr", telephone: "06 00 00 00 00" },
    { nom: "Paul Roy", fonction: "QSE", email: "", telephone: "" },
  ],
  referent: "olivier@avisdoc.fr",
  pourquoi: "Chantiers en plein soleil",
};

describe("fiche saisie à la main", () => {
  it("n'exige que le nom, pas le SIREN", () => {
    expect(erreurSaisie({ ...FICHE_VIDE, nom: "X" })).toBeNull();
    expect(erreurSaisie(FICHE_VIDE)).toMatch(/nom/);
    expect(erreurSaisie({ ...FICHE_VIDE, nom: "X", siren: "123" })).toMatch(/9 chiffres/);
    expect(erreurSaisie({ ...FICHE_VIDE, nom: "X", email: "pas-un-mail" })).toMatch(/illisible/);
  });

  it("range chaque information là où la fiche la lit", () => {
    const c = colonnesProspect(saisie);
    expect(c).toMatchObject({
      name: "SMAC Colmar",
      siren: null,
      department: "68",
      website: "https://smac.fr",
      headcount_band: "21",
      leaders: [{ name: "Jean Martin", role: "Directeur" }],
      contact_name: "Claire Dupont",
      contact_role: "DRH",
      contact_phone: "06 00 00 00 00",
      referent: "olivier@avisdoc.fr",
      rationale: "Chantiers en plein soleil",
    });
    expect((c.site_contacts as { phones: string[] }).phones[0]).toBe("03 89 00 00 00");
    expect((c.personnes as unknown[]).length).toBe(2);
  });

  it("se relit telle qu'on l'a saisie", () => {
    const relu = saisieDepuisProspect({ ...(colonnesProspect(saisie) as object), found_by: null } as unknown as Prospect);
    expect(relu.dirigeant).toBe("Jean Martin");
    expect(relu.telephone).toBe("03 89 00 00 00");
    expect(relu.interlocuteurs.map((q) => q.nom)).toEqual(["Claire Dupont", "Paul Roy"]);
    expect(relu.referent).toBe("olivier@avisdoc.fr");
  });

  it("garde le standard d'une fiche Merx sans interlocuteur", () => {
    const merx = { name: "A", contact_name: null, contact_phone: "01 02 03 04 05", contact_email: null, personnes: null, leaders: null, site_contacts: null, head_office: null } as unknown as Prospect;
    const s = saisieDepuisProspect(merx);
    expect(s.telephone).toBe("01 02 03 04 05");
    expect(colonnesProspect(s).contact_phone).toBe("01 02 03 04 05");
  });

  it("déduit le département du code postal", () => {
    expect(departementDuCodePostal("67000")).toBe("67");
    expect(departementDuCodePostal("20090")).toBe("2A");
    expect(departementDuCodePostal("20200")).toBe("2B");
    expect(departementDuCodePostal("97411")).toBe("974");
    expect(departementDuCodePostal("670")).toBe("");
  });

  it("écrit l'affaire et ses interlocuteurs, et la relit", () => {
    expect(champsAffaire(saisie)).toMatchObject({ company: "SMAC Colmar", siren: "", ville: "Colmar", codePostal: "68000", secteur: "btp", effectif: "50 à 99 salariés" });
    const contacts = contactsAffaire(saisie);
    expect(contacts[1]).toMatchObject({ name: "Paul Roy", prenom: "Paul", nom: "Roy", role: "QSE", email: "—", tel: "—" });
    const client = { company: "SMAC Colmar", siren: "", adresse: "12 rue des Lilas, 68000 Colmar", codePostal: "68000", ville: "Colmar", secteur: "btp", referent: null, contacts: [{ id: "1", name: "Luc Bon", prenom: "Luc", nom: "Bon", role: "Contact", email: "—", tel: "—" }] } as unknown as Client;
    const relu = saisieDepuisAffaire(client, null);
    expect(relu.nom).toBe("SMAC Colmar");
    expect(relu.interlocuteurs).toEqual([{ nom: "Luc Bon", fonction: "", email: "", telephone: "" }]);
  });
});
