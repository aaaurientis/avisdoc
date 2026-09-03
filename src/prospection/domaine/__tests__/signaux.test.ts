import { describe, expect, it } from "vitest";
import type { ContactPourScore } from "../signaux";
import {
  calculerScore, pr00SignalEnVigueur, pr01SignalAncienneteEnPoste, pr22CritereEffectif,
  signauxDepuisJson, VALIDITE_SIGNAL_JOURS,
} from "../signaux";

const AUJOURDHUI = new Date(2026, 8, 3); // 3 septembre 2026

function ilYA(jours: number): string {
  const d = new Date(AUJOURDHUI.getFullYear(), AUJOURDHUI.getMonth(), AUJOURDHUI.getDate() - jours);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

const base: ContactPourScore = { fonction: null, niveau: null, anciennete_poste_mois: null, signaux: [] };

describe("scoring PR-xx", () => {
  it("PR-01 seul sort devant PR-08 + PR-09 (recette §8.3)", () => {
    const avecPr01 = calculerScore({ ...base, signaux: [{ code: "PR-01", constate_le: ilYA(10) }] }, null, AUJOURDHUI);
    const avecPr08Pr09 = calculerScore(
      { ...base, signaux: [{ code: "PR-08", constate_le: ilYA(2) }, { code: "PR-09", constate_le: ilYA(2) }] },
      null, AUJOURDHUI,
    );
    expect(avecPr01.total).toBeGreaterThan(avecPr08Pr09.total);
  });

  it("un signal daté de plus de quatre-vingt-dix jours ne compte plus", () => {
    const frais = { code: "PR-03" as const, constate_le: ilYA(VALIDITE_SIGNAL_JOURS) };
    const perime = { code: "PR-03" as const, constate_le: ilYA(VALIDITE_SIGNAL_JOURS + 1) };
    expect(pr00SignalEnVigueur(frais, AUJOURDHUI)).toBe(true);
    expect(pr00SignalEnVigueur(perime, AUJOURDHUI)).toBe(false);
    const score = calculerScore({ ...base, signaux: [perime] }, null, AUJOURDHUI);
    expect(score.total).toBe(0);
    expect(score.evaluations.find((e) => e.code === "PR-03")?.source).toBe("expire");
  });

  it("PR-01 se déduit de la fiche : moins de douze mois sur une fonction RH", () => {
    const e = pr01SignalAncienneteEnPoste({ ...base, fonction: "Responsable RH", anciennete_poste_mois: 6 }, AUJOURDHUI);
    expect(e.actif).toBe(true);
    expect(e.source).toBe("deduit");
    const f = pr01SignalAncienneteEnPoste({ ...base, fonction: "Directeur commercial", anciennete_poste_mois: 6 }, AUJOURDHUI);
    expect(f.actif).toBe(false);
  });

  it("les critères structurels s'ajoutent : cercle 1, secteur exposé, effectif cible, niveau", () => {
    const s = calculerScore(
      { ...base, niveau: "directeur" },
      { cercle: 1, expose: true, effectif_min: 200, effectif_max: 500 },
      AUJOURDHUI,
    );
    expect(s.total).toBe(20 + 10 + 10 + 8);
    expect(pr22CritereEffectif({ cercle: null, expose: false, effectif_min: 10, effectif_max: 50 }).actif).toBe(false);
    expect(pr22CritereEffectif({ cercle: null, expose: false, effectif_min: 5001, effectif_max: null }).actif).toBe(false);
  });

  it("la lecture du jsonb ignore les signaux mal formés", () => {
    const s = signauxDepuisJson([
      { code: "PR-02", constate_le: "2026-08-01", detail: "Offre HSE publiée" },
      { code: "PR-99", constate_le: "2026-08-01" },
      { code: "PR-03" },
      "n'importe quoi",
    ]);
    expect(s).toEqual([{ code: "PR-02", constate_le: "2026-08-01", detail: "Offre HSE publiée" }]);
  });
});
