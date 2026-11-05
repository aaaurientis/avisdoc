import { describe, expect, it } from "vitest";
import {
  compterPar,
  etatDe,
  grilleDuMois,
  journeesEntre,
  lundiDe,
  moisDecale,
  contrats,
  dansLaPeriode,
  dateDansLeNom,
  decouperCsv,
  jourDe,
  lireExtraction,
  manques,
  nettoyer,
  parMois,
  preparation,
  separateurProbable,
} from "./journees";
import { REGLES_DEFAUT } from "./typologies";

// Même forme que l'export réel (en-têtes, guillemets, ="…" d'Excel), avec des données fictives.
const ENTETE =
  '"Date création","Client","Nombre de journées","Numéro devis","Dermatologue","Expert","Date événement","Date facture","Lieu","Numéro journée","Nom du contact","Téléphone du contact","Email du contact","Salle","Accès","Autres informations","Confirmation client","Date confirmation client","Confirmation consentements","Date confirmation consentements","Confirmation requérant","Date confirmation requérant","Numéro envoi dermatoscope","Date envoi dermatoscope","Numéro retour dermatoscope","Date retour dermatoscope"';
const ligne = (o: { client: string; devis: string; nb: number; date: string; num: number; expert: string; conf?: string; envoi?: string }) =>
  `"2026-09-01T08:00:00.000Z","${o.client}",${o.nb},"${o.devis}","Infirmière Test","${o.expert}","${o.date}T00:00:00.000Z","2026-09-01T02:00:00.000Z","Ville",${o.num},"Contact","=""0600000000""","c@exemple.fr","","","","${o.conf ?? "Non"}","2026-09-01T02:00:00.000Z","Non","2026-09-01T02:00:00.000Z","${o.conf ?? "Non"}","2026-09-01T02:00:00.000Z","${o.envoi ?? ""}","2026-09-01T02:00:00.000Z","","2026-09-01T02:00:00.000Z"`;

const CSV = [
  ENTETE,
  ligne({ client: "ACME", devis: "DEV 1", nb: 3, date: "2026-09-10", num: 1, expert: "Dr A" }),
  ligne({ client: "ACME", devis: "DEV 1", nb: 3, date: "2026-11-20", num: 2, expert: "Dr B", conf: "Oui", envoi: "42" }),
  ligne({ client: "Mairie", devis: "D-2", nb: 1, date: "2026-11-05", num: 1, expert: "Dr A" }),
].join("\n");

describe("lecture CSV", () => {
  it("devine le séparateur", () => {
    expect(separateurProbable("nom;age\nA;3")).toBe(";");
    expect(separateurProbable('"a;b",c,d')).toBe(",");
  });

  it("gère guillemets doublés, retours à la ligne et BOM", () => {
    const csv = '\uFEFFnom;commentaire\r\n"Dupont";"dit ""bonjour""\nsur 2 lignes"\r\n\r\n';
    expect(decouperCsv(csv)).toEqual([["nom", "commentaire"], ["Dupont", 'dit "bonjour"\nsur 2 lignes']]);
  });

  it("retire l'enrobage Excel des numéros", () => {
    expect(nettoyer('="1234567899"')).toBe("1234567899");
    expect(nettoyer('=""')).toBe("");
  });

  it("lit les dates sans glisser de jour", () => {
    expect(jourDe("2026-09-21T00:00:00.000Z")).toBe("2026-09-21");
    expect(jourDe("2026-11-01T03:00:00.000Z")).toBe("2026-11-01");
    expect(jourDe("21/09/2026")).toBe("2026-09-21");
    expect(jourDe("")).toBe("");
  });

  it("date du fichier dans son nom", () => {
    expect(dateDansLeNom("journees-depistage/2026-11-05.csv")).toBe("2026-11-05");
    expect(dateDansLeNom("export.csv")).toBeNull();
  });
});

describe("extraction", () => {
  const { journees, colonnesManquantes } = lireExtraction(CSV);

  it("une ligne = une journée, colonnes reconnues par leur nom", () => {
    expect(colonnesManquantes).toEqual([]);
    expect(journees).toHaveLength(3);
    expect(journees[1]).toMatchObject({
      client: "ACME",
      commandees: 3,
      devis: "DEV 1",
      expert: "Dr B",
      date: "2026-11-20",
      numero: 2,
      contactTel: "0600000000",
      confClient: true,
      confConsentements: false,
      envoiDermatoscope: "42",
    });
  });

  it("signale les colonnes absentes", () => {
    expect(lireExtraction('"Client","Lieu"\n"X","Y"').colonnesManquantes).toContain("date evenement");
  });

  it("contrats : commandées, planifiées, passées, prochaine", () => {
    expect(contrats(journees, "2026-11-05")).toEqual([
      { client: "ACME", devis: "DEV 1", commandees: 3, planifiees: 2, passees: 1, prochaine: "2026-11-20" },
      { client: "Mairie", devis: "D-2", commandees: 1, planifiees: 1, passees: 0, prochaine: "2026-11-05" },
    ]);
  });

  it("période : à venir compte la journée du jour", () => {
    expect(dansLaPeriode(journees, "avenir", "2026-11-05").map((j) => j.date)).toEqual(["2026-11-20", "2026-11-05"]);
    expect(dansLaPeriode(journees, "30j", "2026-11-05")).toHaveLength(2);
  });

  it("comptes, mois sans trou, préparation", () => {
    expect(compterPar(journees, (j) => j.expert)).toEqual([
      { cle: "Dr A", nombre: 2 },
      { cle: "Dr B", nombre: 1 },
    ]);
    expect(parMois(journees)).toEqual([
      { cle: "2026-09", nombre: 1 },
      { cle: "2026-10", nombre: 0 },
      { cle: "2026-11", nombre: 2 },
    ]);
    expect(preparation(journees)).toEqual({
      total: 3,
      confirmees: 1,
      criteres: [
        { cle: "requerant", label: "Requérant confirmé", exigees: 3, acquises: 1 },
        { cle: "expert", label: "Expert désigné", exigees: 3, acquises: 3 },
      ],
    });
    // Typologie sans requérant (partenaire sans CPS) : l'expert suffit.
    const sansRequerant = { ...REGLES_DEFAUT, requerant: false };
    expect(manques(journees[0], sansRequerant)).toEqual([]);
    expect(preparation(journees, () => sansRequerant).confirmees).toBe(3);
    // Requérant confirmé + expert désigné : confirmée, même sans consentements.
    expect(manques(journees[1])).toEqual([]);
    expect(manques(journees[0])).toEqual(["requérant"]);
    expect(manques({ ...journees[1], expert: "" })).toEqual(["expert"]);
  });
});

describe("calendrier", () => {
  it("lundi de la semaine", () => {
    expect(lundiDe("2026-11-05")).toBe("2026-11-02"); // jeudi → lundi
    expect(lundiDe("2026-11-08")).toBe("2026-11-02"); // dimanche → lundi d'avant
    expect(lundiDe("2026-11-02")).toBe("2026-11-02");
  });

  it("grille de 6 semaines commençant un lundi", () => {
    const g = grilleDuMois("2026-11");
    expect(g).toHaveLength(42);
    expect(g[0]).toBe("2026-10-26");
    expect(g).toContain("2026-11-30");
  });

  it("mois décalé, à cheval sur l'année", () => {
    expect(moisDecale("2026-12", 1)).toBe("2027-01");
    expect(moisDecale("2026-01", -1)).toBe("2025-12");
  });

  it("journées entre deux dates, état", () => {
    const { journees } = lireExtraction(CSV);
    expect(journeesEntre(journees, "2026-11-02", "2026-11-08").map((j) => j.client)).toEqual(["Mairie"]);
    expect(etatDe(journees[0], "2026-11-05")).toBe("passee");
    expect(etatDe(journees[1], "2026-11-05")).toBe("prete");
    expect(etatDe(journees[2], "2026-11-05")).toBe("a-confirmer");
  });
});
