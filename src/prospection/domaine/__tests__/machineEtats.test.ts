import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { pr40TransitionAutorisee, pr41TransitionsDepuis, TRANSITIONS } from "../machineEtats";

describe("machine à états du contact", () => {
  it("suit le parcours nominal et la disqualification manuelle", () => {
    expect(pr40TransitionAutorisee("a_qualifier", "a_contacter")).toBe(true);
    expect(pr40TransitionAutorisee("a_contacter", "invite")).toBe(true);
    expect(pr40TransitionAutorisee("invite", "accepte")).toBe(true);
    expect(pr40TransitionAutorisee("accepte", "en_conversation")).toBe(true);
    expect(pr40TransitionAutorisee("en_conversation", "partenaire")).toBe(true);
    expect(pr40TransitionAutorisee("a_contacter", "arrete")).toBe(true);
  });

  it("refuse toute autre transition", () => {
    expect(pr40TransitionAutorisee("a_qualifier", "invite")).toBe(false);
    expect(pr40TransitionAutorisee("a_qualifier", "partenaire")).toBe(false);
    expect(pr40TransitionAutorisee("partenaire", "a_qualifier")).toBe(false);
    expect(pr40TransitionAutorisee("arrete", "invite")).toBe(false);
    expect(pr41TransitionsDepuis("refus")).toEqual([]);
  });

  it("est le miroir exact de prospection.transition_autorisee() (SQL)", () => {
    const sql = readFileSync(
      resolve(__dirname, "../../../../supabase-prospection/supabase/migrations/0001_prospection_schema.sql"), "utf8");
    const debut = sql.indexOf("select (p_de::text, p_vers::text) in (");
    const fin = sql.indexOf("$$;", debut);
    const corps = sql.slice(debut, fin);
    const enSql = new Set([...corps.matchAll(/\('([a-z_]+)', '([a-z_]+)'\)/g)].map((m) => `${m[1]}>${m[2]}`));
    const enTs = new Set(TRANSITIONS.map(([d, v]) => `${d}>${v}`));
    expect(enTs).toEqual(enSql);
  });
});
