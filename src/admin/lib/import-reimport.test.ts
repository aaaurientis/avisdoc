import { describe, expect, it } from "vitest";
import {
  contactsACompleter,
  departementsDifferents,
  echangesDe,
  echangesNouveaux,
  ficheExistante,
  lireLignes,
  nombre,
  regrouper,
  type LigneProspection,
} from "./import-prospection";

const ligne = (cellules: Record<string, unknown>): LigneProspection => lireLignes([cellules]).lignes[0];

describe("réimport d'un fichier déjà importé", () => {
  it("n'ajoute à l'historique que les lignes qui n'y sont pas", () => {
    const l = ligne({ "Raison sociale": "SMAC", "Type de contact": "Email", "Date du contact": "01/09/2026", "Date de relance": "15/09/2026", Commentaires: "Vu le DRH" });
    const premier = echangesDe(l, false, Date.UTC(2026, 9, 14));
    expect(premier).toHaveLength(3);
    // Le même fichier revient : rien de nouveau.
    expect(echangesNouveaux(echangesDe(l, false, Date.UTC(2026, 9, 14)), premier)).toHaveLength(0);
    // Une action annulée depuis (détail modifié) n'est pas une nouvelle action.
    const annule = premier.map((x) => (x.titre.startsWith("Relance") ? { ...x, detail: "— Annulé le 16/09 par Paul" } : x));
    expect(echangesNouveaux(premier, annule)).toHaveLength(0);
    // Le fichier modifié : un commentaire changé et une date de RDV en plus arrivent seuls.
    const l2 = ligne({ "Raison sociale": "SMAC", "Type de contact": "Email", "Date du contact": "01/09/2026", "Date de relance": "15/09/2026", "Date du RDV": "20/09/2026", Commentaires: "Vu le DRH, intéressé" });
    const ajouts = echangesNouveaux(echangesDe(l2, false, Date.UTC(2026, 9, 14)), premier);
    expect(ajouts.map((x) => x.titre)).toEqual(["RDV de présentation", "Commentaires"]);
  });

  it("ne double pas un commentaire réimporté un autre jour, ni une relance devenue passée, ni après un 2e interlocuteur", () => {
    const seule = ligne({ "Raison sociale": "SMAC", Prénom: "Claire", Nom: "Dupont", "Date de relance": "30/10/2026", Commentaires: "Vu le DRH" });
    const premier = echangesDe(seule, false, Date.UTC(2026, 9, 14));
    expect(premier[0].kind).toBe("tache");
    // Un mois plus tard : la relance est passée (note), le commentaire prend une autre date.
    const plusTard = echangesDe(seule, false, Date.UTC(2026, 10, 14)).map((x) => (x.titre === "Commentaires" ? { ...x, au: "2026-11-14T12:00:00.000Z" } : x));
    expect(plusTard[0].kind).toBe("note");
    expect(echangesNouveaux(plusTard, premier)).toHaveLength(0);
    // Paul arrive dans le fichier : les lignes de Claire prennent son nom, sans doublon ; celles de Paul entrent.
    const paul = ligne({ "Raison sociale": "SMAC", Prénom: "Paul", Nom: "Martin", "Date du contact": "02/10/2026" });
    const [e] = regrouper([seule, paul]);
    const candidats = e.lignes.flatMap((l) => echangesDe(l, true, Date.UTC(2026, 9, 14)));
    expect(echangesNouveaux(candidats, premier).map((x) => x.titre)).toEqual(["Premier contact — Paul Martin"]);
  });

  it("ne fait correspondre une ligne sans nom qu'à une seule ligne nommée, dans les deux sens", () => {
    const sansNom = { kind: "email", titre: "Relance", detail: null, au: "2026-09-15T12:00:00.000Z" };
    const claire = { ...sansNom, titre: "Relance — Claire Dupont" };
    const paul = { ...sansNom, titre: "Relance — Paul Martin" };
    // Une relance sans nom existait : Claire la reprend, Paul entre.
    expect(echangesNouveaux([claire, paul], [sansNom]).map((x) => x.titre)).toEqual(["Relance — Paul Martin"]);
    // Les relances nommées existaient : la même relance réimportée sans nom ne revient pas.
    expect(echangesNouveaux([sansNom], [claire, paul])).toHaveLength(0);
  });

  it("met une relance future dans les actions à venir, jamais une note", () => {
    const l = ligne({ "Raison sociale": "SMAC", "Type de contact": "Téléphonique", "Date du contact": "01/09/2026", "Date de relance": "30/10/2026", Commentaires: "x" });
    const [contact, relance, note] = echangesDe(l, false, Date.UTC(2026, 9, 14));
    expect(contact.prevu).toBe(false);
    expect([relance.kind, relance.prevu]).toEqual(["appel", true]);
    expect(note.prevu).toBe(false);
    // Sans type de contact, la relance à venir devient un « À faire ».
    const [, sansType] = echangesDe(ligne({ "Raison sociale": "SMAC", "Date du contact": "01/09/2026", "Date de relance": "30/10/2026" }), false, Date.UTC(2026, 9, 14));
    expect([sansType.kind, sansType.prevu]).toEqual(["tache", true]);
  });

  it("complète les interlocuteurs d'une affaire sans rien écraser", () => {
    const connus = [{ id: "a", name: "Claire Dupont", role: "Contact", email: "—", tel: "03 88 00 00 00" }];
    const lignes = [
      ligne({ "Raison sociale": "SMAC", Prénom: "Claire", Nom: "Dupont", Fonction: "DRH", "E-mail": "c@smac.fr", Téléphone: "06 00 00 00 00" }),
      ligne({ "Raison sociale": "SMAC", Prénom: "Paul", Nom: "Martin", "E-mail": "p@smac.fr" }),
    ];
    const { ajouts, completes } = contactsACompleter(connus, lignes);
    expect(completes).toEqual([{ id: "a", champs: { role: "DRH", email: "c@smac.fr" } }]); // téléphone déjà rempli : gardé
    expect(ajouts).toEqual([{ prenom: "Paul", nom: "Martin", role: "Contact", email: "p@smac.fr", tel: "—" }]);
    // Un second passage avec tout déjà rempli n'apporte rien.
    const pleins = [
      { id: "a", name: "Claire Dupont", role: "DRH", email: "c@smac.fr", tel: "03 88 00 00 00" },
      { id: "b", name: "Paul Martin", role: "Contact", email: "p@smac.fr", tel: "—" },
    ];
    expect(contactsACompleter(pleins, lignes)).toEqual({ ajouts: [], completes: [] });
  });

  it("retrouve la fiche quand le département manque d'un côté, sans deviner entre deux", () => {
    const [sansDep] = regrouper([ligne({ "Raison sociale": "SMAC" })]);
    expect(ficheExistante(sansDep, [{ name: "SMAC", department: "33" }])?.department).toBe("33");
    expect(ficheExistante(sansDep, [{ name: "SMAC", department: "33" }, { name: "SMAC", department: "68" }])).toBeUndefined();
    const [en68] = regrouper([ligne({ "Raison sociale": "SMAC", Département: "68" })]);
    expect(ficheExistante(en68, [{ name: "SMAC", department: "33" }])).toBeUndefined();
    expect(ficheExistante(en68, [{ name: "SMAC", department: null }])?.name).toBe("SMAC");
  });

  it("fusionne un même nouvel interlocuteur écrit sur deux lignes", () => {
    const lignes = [
      ligne({ "Raison sociale": "SMAC", Prénom: "Paul", Nom: "Martin", "E-mail": "p@smac.fr" }),
      ligne({ "Raison sociale": "SMAC", Prénom: "Paul", Nom: "Martin", Téléphone: "06 11 11 11 11", Fonction: "QSE" }),
    ];
    expect(contactsACompleter([], lignes).ajouts).toEqual([{ prenom: "Paul", nom: "Martin", role: "QSE", email: "p@smac.fr", tel: "06 11 11 11 11" }]);
    expect(departementsDifferents("68", "33")).toBe(true);
    expect(departementsDifferents("1", "01")).toBe(false);
    expect(departementsDifferents(null, "33")).toBe(false);
  });

  it("lit les colonnes du fichier du Pipeline", () => {
    const l = ligne({ "Raison sociale": "SMAC", Pipeline: "Stéphan", Colonne: "Proposition", Ville: "Colmar", Journées: 3, "Tarif / journée": "1 200 €" });
    expect([l.pipeline, l.colonne, l.ville, l.journees, l.tarif]).toEqual(["Stéphan", "Proposition", "Colmar", 3, 1200]);
    expect(nombre("")).toBeNull();
    expect(nombre("abc")).toBeNull();
  });
});
