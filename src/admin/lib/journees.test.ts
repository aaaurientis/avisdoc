import { describe, expect, it } from "vitest";
import {
  compterPar,
  etatDe,
  extractionsJournees,
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
      requis: "Dr B",
      date: "2026-11-20",
      numero: 2,
      contactTel: "0600000000",
      confClient: true,
      confConsentements: false,
      envoiDermatoscope: "42",
    });
  });

  it("lit les nouveaux noms de colonnes (Requérant / Requis) comme les anciens (Dermatologue / Expert)", () => {
    const nouveau = lireExtraction(CSV.replace('"Dermatologue","Expert"', '"Requérant","Requis"'));
    expect(nouveau.colonnesManquantes).toEqual([]);
    expect(nouveau.journees[1]).toMatchObject({ requerant: "Infirmière Test", requis: "Dr B" });
    expect(journees[1]).toMatchObject({ requerant: "Infirmière Test", requis: "Dr B" });
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
    expect(compterPar(journees, (j) => j.requis)).toEqual([
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
        { cle: "expert", label: "Requis désigné", exigees: 3, acquises: 3 },
      ],
    });
    // Typologie sans requérant (partenaire sans CPS) : l'expert suffit.
    const sansRequerant = { ...REGLES_DEFAUT, requerant: false };
    expect(manques(journees[0], sansRequerant)).toEqual([]);
    expect(preparation(journees, () => sansRequerant).confirmees).toBe(3);
    // Requérant confirmé + expert désigné : confirmée, même sans consentements.
    expect(manques(journees[1])).toEqual([]);
    expect(manques(journees[0])).toEqual(["requérant"]);
    expect(manques({ ...journees[1], requis: "" })).toEqual(["requis"]);
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

describe("fichiers du bucket", () => {
  const f = (key: string) => ({ key });
  it("garde les journées, écarte les expertises du même jour", () => {
    expect(
      extractionsJournees([f("journees-depistage/2026-11-14-journée.csv"), f("journees-depistage/2026-11-14-expertise.csv"), f("journees-depistage/2026-11-05.csv")]).map((x) => x.key),
    ).toEqual(["journees-depistage/2026-11-14-journée.csv"]);
  });
  it("anciens noms sans « journée » : tout sauf les expertises", () => {
    expect(extractionsJournees([f("2026-11-05.csv"), f("2026-11-05-expertise.csv")]).map((x) => x.key)).toEqual(["2026-11-05.csv"]);
  });
});

describe("journées regroupées (même client, même ville, dates consécutives)", () => {
  const j = (id: number, client: string, date: string, lieu: string) => ({ id, client, date, lieu, devis: "D1", commandees: null, numero: null } as any);
  it("deux jours de suite chez le même client dans la même ville = une journée", async () => {
    const { regrouperJournees, nbJournees, compterPar, contrats, villeDe } = await import("./journees");
    expect(villeDe("Salle B, 2 rue X, 63000 Clermont-Ferrand")).toBe("clermont ferrand");
    const l = regrouperJournees([
      j(1, "ACME", "2026-11-12", "Usine, 63000 Clermont-Ferrand"),
      j(2, "ACME", "2026-11-13", "Bureaux, 63000 CLERMONT-FERRAND"),
      j(3, "ACME", "2026-11-16", "Usine, 63000 Clermont-Ferrand"), // lundi après le vendredi : même journée
      j(4, "ACME", "2027-03-01", "Usine, 63000 Clermont-Ferrand"), // des mois plus tard : autre journée
      j(5, "ACME", "2026-11-12", "Site, 69000 Lyon"),              // autre ville
      j(6, "BETA", "2026-11-12", "Usine, 63000 Clermont-Ferrand"), // autre client
    ]);
    expect(nbJournees(l)).toBe(4);
    expect(l[0].groupe).toBe(l[2].groupe);
    expect([l[0].groupeRang, l[1].groupeRang, l[2].groupeRang, l[0].groupeTaille]).toEqual([1, 2, 3, 3]);
    expect(compterPar(l, (x) => x.client)).toEqual([{ cle: "ACME", nombre: 3 }, { cle: "BETA", nombre: 1 }]);
    expect(contrats(l, "2026-12-01").find((c) => c.client === "ACME")?.planifiees).toBe(3);
  });
});
