import { describe, expect, it } from "vitest";
import { avancementDe, colonnePour, dateIso, echangesDe, ficheExistante, lireLignes, reconnaitreColonnes, regrouper, secteurDe } from "./import-prospection";

describe("import de la Prospection", () => {
  it("reconnaît les colonnes du modèle et celles du fichier d'origine", () => {
    const c = reconnaitreColonnes(["Raison sociale", "Profil contacté", "Relance contact", "Date présentation", "Avancement du contact"]);
    expect(c.get("Fonction")).toBe("Profil contacté");
    expect(c.get("Date de relance")).toBe("Relance contact");
    expect(c.get("Date du RDV")).toBe("Date présentation");
    expect(c.get("Avancement")).toBe("Avancement du contact");
  });

  it("range les avancements, et ne devine pas ce qu'il ne connaît pas", () => {
    expect(avancementDe("Contacté")).toBe("contacte");
    expect(avancementDe("Contact sans réponse ")).toBe("contacte");
    expect(avancementDe("A répondu")).toBe("repondu");
    expect(avancementDe("Contact avec échange(s)")).toBe("repondu");
    expect(avancementDe("RDV")).toBe("rdv");
    expect(avancementDe("")).toBeNull();
    expect(avancementDe("Journée à programmer")).toBeNull();
  });

  it("lit les dates sans les décaler d'un jour", () => {
    expect(dateIso("18/09/2026")?.slice(0, 10)).toBe(new Date(2026, 8, 18, 12).toISOString().slice(0, 10));
    expect(new Date(dateIso(46283)!).getDate()).toBe(18); // série Excel du 18/09/2026
    expect(new Date(dateIso(new Date(2026, 8, 18))!).getDate()).toBe(18);
    expect(dateIso("31/02/2026")).toBeNull();
    expect(dateIso("")).toBeNull();
  });

  it("classe la structure en secteur", () => {
    expect(secteurDe("Municipalité")).toBe("collectivites");
    expect(secteurDe("Maison de santé")).toBe("sante_beaute");
    expect(secteurDe("Entreprise")).toBe("autre");
    expect(secteurDe("Travaux publics et BTP")).toBe("btp"); // un export qui revient
  });

  it("garde le commentaire entier et date chaque échange", () => {
    const long = "x".repeat(2000);
    const { lignes } = lireLignes([
      { "Raison sociale": " ACME ", Nom: "DUPONT", Prénom: "Léa", Avancement: "A répondu", "Type de contact": "Email",
        "Date du contact": "18/09/2026", "Date de relance": "30/09/2026", Commentaires: long },
      { "Raison sociale": "", Nom: "ligne vide" },
      { "Raison sociale": "Sans date", Commentaires: "à garder" },
    ]);
    expect(lignes).toHaveLength(2);
    expect(lignes[0].nom).toBe("ACME");
    expect(lignes[0].ligne).toBe(2);
    const e = echangesDe(lignes[0]);
    expect(e.map((x) => [x.kind, x.titre])).toEqual([["email", "Premier contact"], ["email", "Relance"], ["note", "Commentaires"]]);
    expect(e[2].detail).toHaveLength(2000);
    expect(echangesDe(lignes[1])).toEqual([expect.objectContaining({ kind: "note", detail: "à garder" })]);
  });

  it("refuse un fichier sans raison sociale", () => {
    expect(lireLignes([{ Société2: "x" }]).manque).toBe("Raison sociale");
  });

  it("regroupe une entreprise sur plusieurs lignes et garde le plus avancé", () => {
    const { lignes } = lireLignes([
      { "Raison sociale": "BioMérieux", Nom: "BABIN", Prénom: "Carole", Avancement: "Contacté", Commentaires: "a" },
      { "Raison sociale": "Biomérieux ", Nom: "FAUST", Prénom: "Olivier", Avancement: "RDV", Commentaires: "b" },
      { "Raison sociale": "Autre", Avancement: "" },
    ]);
    const g = regrouper(lignes);
    expect(g).toHaveLength(2);
    expect(g[0].lignes).toHaveLength(2);
    expect(g[0].avancement).toBe("rdv");
    expect(g[1].avancement).toBeNull();
    expect(echangesDe(g[0].lignes[1], true)[0].titre).toBe("Commentaires — Olivier FAUST");
  });

  it("ne rattache qu'au même endroit", () => {
    const fiches = [
      { id: "a", name: "COLAS FRANCE", department: "33" },
      { id: "b", name: "COLAS FRANCE", department: "67" },
      { id: "c", name: "JEROMES CONCEPT", department: "01" },
    ];
    const une = (r: Record<string, unknown>) => regrouper(lireLignes([r]).lignes)[0];
    expect(ficheExistante(une({ "Raison sociale": "Colas France", Département: "67" }), fiches)?.id).toBe("b");
    expect(ficheExistante(une({ "Raison sociale": "Colas France", Département: "68" }), fiches)).toBeUndefined();
    expect(ficheExistante(une({ "Raison sociale": "Colas France" }), fiches)).toBeUndefined(); // lieu inconnu
    expect(ficheExistante(une({ "Raison sociale": "Jeromes Concept", Département: 1 }), fiches)?.id).toBe("c");
  });

  it("choisit la colonne du pipeline", () => {
    const stephan = [{ label: "Contacté" }, { label: "RDV" }];
    expect(colonnePour("contacte", stephan)).toBe("Contacté");
    expect(colonnePour("repondu", stephan)).toBe("Contacté"); // une pastille, pas une colonne
    expect(colonnePour("rdv", stephan)).toBe("RDV");
    expect(colonnePour("rdv", [{ label: "Nouveau" }, { label: "Signé" }])).toBeNull();
  });
});
