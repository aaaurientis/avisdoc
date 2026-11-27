import { afterEach, describe, expect, it, vi } from "vitest";
import { localiserLieu } from "./geo";

type Faux = { lat: number; lng: number; dep: string; city: string };
const feature = (f: Faux) => ({ geometry: { coordinates: [f.lng, f.lat] }, properties: { context: `${f.dep}, x, y`, city: f.city, score: 0.9 } });

/** Faux service d'adresses : répond selon les paramètres demandés, et garde la trace des appels. */
function brancher(repond: (p: URLSearchParams) => Faux[], communes: (p: URLSearchParams) => Faux[] = () => []) {
  const appels: URLSearchParams[] = [];
  vi.stubGlobal("fetch", async (url: string) => {
    const p = new URL(url).searchParams;
    if (url.includes("geo.api.gouv.fr")) {
      const r = communes(p).map((c) => ({ nom: c.city, codeDepartement: c.dep, centre: { coordinates: [c.lng, c.lat] } }));
      return new Response(JSON.stringify(r), { status: 200 });
    }
    appels.push(p);
    return new Response(JSON.stringify({ features: repond(p).map(feature) }), { status: 200 });
  });
  return appels;
}

afterEach(() => vi.unstubAllGlobals());

const SAINT_JUST: Faux[] = [
  { lat: 14.8, lng: -61.0, dep: "972", city: "Saint-Just" }, // outre-mer, en tête des résultats
  { lat: 48.0, lng: -1.9, dep: "35", city: "Saint-Just" },
  { lat: 47.0, lng: 2.5, dep: "18", city: "Saint-Just" },
];

describe("localiserLieu", () => {
  it("un nom de ville : la commune, pas une rue homonyme", async () => {
    const appels = brancher((p) =>
      p.get("type") === "municipality" ? [{ lat: 45.62, lng: 6.77, dep: "73", city: "Bourg-Saint-Maurice" }] : [{ lat: 49.5, lng: 3.6, dep: "02", city: "Laon" }],
    );
    expect(await localiserLieu("Bourg-Saint-Maurice")).toMatchObject({ lat: 45.62, lng: 6.77, dep: "73" });
    expect(appels[0].get("type")).toBe("municipality");
  });

  it("commune homonyme : celle du département du client", async () => {
    brancher((p) => (p.get("type") === "municipality" ? SAINT_JUST : []));
    expect(await localiserLieu("Saint-Just", ["18"])).toMatchObject({ dep: "18" });
  });

  it("commune du client absente des 10 premiers résultats : cherchée dans son département", async () => {
    // La recherche générale ne rend pas le Saint-Just du Cher ; « Saint-Just 18 » le rend.
    const appels = brancher((p) => {
      if (p.get("type") !== "municipality") return [];
      if (p.get("q") === "Saint-Just 18") return [{ lat: 47.0, lng: 2.5, dep: "18", city: "Saint-Just" }, { lat: 49.4, lng: 2.4, dep: "60", city: "Saint-Just-en-Chaussée" }];
      return [{ lat: 43.65, lng: 4.11, dep: "34", city: "Saint-Just" }, { lat: 49.4, lng: 2.4, dep: "60", city: "Saint-Just-en-Chaussée" }];
    });
    expect(await localiserLieu("Saint-Just", ["18"])).toMatchObject({ dep: "18" });
    expect(appels[0].get("q")).toBe("Saint-Just 18");
  });

  it("commune du client : réponse exacte du Découpage administratif", async () => {
    brancher(
      () => [{ lat: 43.65, lng: 4.11, dep: "34", city: "Saint-Just" }],
      (p) => (p.get("nom") === "Saint-Just" && p.get("codeDepartement") === "18" ? [{ lat: 47.03, lng: 2.51, dep: "18", city: "Saint-Just" }] : []),
    );
    expect(await localiserLieu("Saint-Just", ["18"])).toMatchObject({ dep: "18", lat: 47.03 });
  });

  it("commune homonyme sans indice : la métropole plutôt que l'outre-mer", async () => {
    brancher((p) => (p.get("type") === "municipality" ? SAINT_JUST : []));
    expect(await localiserLieu("Saint-Just")).toMatchObject({ dep: "35" });
  });

  it("une adresse avec code postal : recherche limitée à ce code postal", async () => {
    const appels = brancher((p) => (p.get("postcode") === "58430" ? [{ lat: 47.0, lng: 4.1, dep: "58", city: "Arleuf" }] : []));
    expect(await localiserLieu("Route du Haut Morvan 58430 Arleuf")).toMatchObject({ lat: 47.0, lng: 4.1 });
    expect(appels[0].get("postcode")).toBe("58430");
  });

  it("adresse introuvable : la commune après le code postal", async () => {
    brancher((p) => (p.get("type") === "municipality" && p.get("q") === "Arleuf" ? [{ lat: 47.05, lng: 4.0, dep: "58", city: "Arleuf" }] : []));
    expect(await localiserLieu("Lieu-dit inconnu 58430 Arleuf")).toMatchObject({ lat: 47.05, lng: 4.0 });
  });

  it("ni commune ni code postal : recherche libre en dernier recours, sinon rien", async () => {
    brancher((p) => (p.get("type") ? [] : [{ lat: 48.85, lng: 2.35, dep: "75", city: "Paris" }]));
    expect(await localiserLieu("Salle des fêtes")).toMatchObject({ lat: 48.85, lng: 2.35 });
    brancher(() => []);
    expect(await localiserLieu("Introuvable")).toBeNull();
  });
});
