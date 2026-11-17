import { describe, expect, it } from "vitest";
import { cleJournee, dansLaPeriode, delais, lireExpertises, parJournee, parMois, parRequis, rapportPossible, resumer } from "./expertises";
import { lireExtraction } from "./journees";

// Même forme que l'export réel des expertises, données fictives.
const ENTETE =
  '"Identifiant dossier","Date d\'envoi","Date d\'affectation","Date de réponse","Délai de traitement (h)","Requérant","Profession requérant","Requis","Recommandation","Délai recommandé (jours)","Urgence","Statut","Date événement","Lieu","Numéro journée"';
const ligne = (id: string, envoi: string, o: { delai?: string; reco?: string; reco_j?: string; urgent?: string; journee?: [string, string, number]; requis?: string } = {}) =>
  [
    `"${id}"`, `"${envoi}"`, `"${envoi}"`, `""`, `"${o.delai ?? ""}"`, `"Infirmière X"`, `"Infirmier(e)"`, `"${o.requis ?? "Dr A"}"`,
    `"${o.reco ?? "Consultation dermatologique non indispensable"}"`, `"${o.reco_j ?? ""}"`, `"${o.urgent ?? "Non"}"`, `"Avis rendu"`,
    `"${o.journee ? o.journee[0] + "T00:00:00.000Z" : ""}"`, `"${o.journee?.[1] ?? ""}"`, `"${o.journee?.[2] ?? ""}"`,
  ].join(",");

const CSV = [
  ENTETE,
  ligne("1", "2026-09-10 10:00", { delai: "5", journee: ["2026-09-10", "Quimper", 1] }),
  ligne("2", "2026-09-10 11:00", { delai: "30", reco: "Exérèse indispensable", reco_j: "30", urgent: "Oui", journee: ["2026-09-10", "QUIMPER", 1] }),
  ligne("3", "2026-11-02 09:00", { delai: "50", requis: "Dr B" }),
  ligne("4", "2025-01-15 09:00"),
].join("\n");

describe("issue d'un avis", () => {
  it("classe les trois recommandations", async () => {
    const { issueDe } = await import("./expertises");
    const e = (recommandation: string) => ({ recommandation }) as Parameters<typeof issueDe>[0];
    expect(issueDe(e("Consultation dermatologique non indispensable"))).toBe("non-indispensable");
    expect(issueDe(e("Consultation dermatologique"))).toBe("consultation");
    expect(issueDe(e("Exérèse indispensable"))).toBe("exerese");
    expect(issueDe(e(""))).toBeNull();
  });
});

describe("expertises", () => {
  const { expertises, colonnesManquantes } = lireExpertises(CSV);

  it("lit l'extraction : une ligne = un avis", () => {
    expect(colonnesManquantes).toEqual([]);
    expect(expertises).toHaveLength(4);
    expect(expertises[1]).toMatchObject({ id: "2", delaiH: 30, urgent: true, date: "2026-09-10", lieu: "QUIMPER", numero: 1, delaiRecoJours: 30 });
    expect(expertises[3]).toMatchObject({ date: "", numero: null, delaiH: null });
  });

  it("rattache aux journées par date + lieu + numéro (lieu sans casse ni accents)", () => {
    const journees = lireExtraction(
      '"Client","Date événement","Lieu","Numéro journée"\n"ACME","2026-09-10T00:00:00.000Z","Quimper",1\n"ACME","2026-09-10T00:00:00.000Z","Quimper",2',
    ).journees;
    const index = parJournee(expertises);
    expect(index.get(cleJournee(journees[0]))?.map((e) => e.id)).toEqual(["1", "2"]);
    expect(index.get(cleJournee(journees[1]))).toBeUndefined();
  });

  it("résume : urgences, recommandations, délais", () => {
    const r = resumer(expertises);
    expect(r.total).toBe(4);
    expect(r.urgentes).toBe(1);
    expect(r.enJournee).toBe(2);
    expect(r.recommandations[0]).toEqual({ cle: "Consultation dermatologique non indispensable", nombre: 3 });
    expect(r.delaiRecoMedian).toBe(30);
    expect(delais(expertises)).toMatchObject({ mesures: 3, mediane: 30, sous24h: 1, sous48h: 2 });
  });

  it("mois sans trou, requis", () => {
    const m = parMois(expertises);
    expect(m[0]).toEqual({ mois: "2025-01", total: 1, enJournee: 0 });
    expect(m.find((x) => x.mois === "2026-09")).toEqual({ mois: "2026-09", total: 2, enJournee: 2 });
    expect(m).toHaveLength(23);
    expect(parRequis(expertises)[0]).toMatchObject({
      requis: "Dr A",
      total: 3,
      renseignes: 3,
      nonIndispensables: 2,
      consultations: 0,
      exereses: 1,
      orientations: 1,
      urgentes: 1,
    });
  });

  it("période et seuil du rapport", () => {
    expect(dansLaPeriode(expertises, "12m", new Date("2026-11-14")).map((e) => e.id)).toEqual(["1", "2", "3"]);
    expect(rapportPossible(10)).toBe(false);
    expect(rapportPossible(11)).toBe(true);
  });
});
