import { afterEach, describe, expect, it, vi } from "vitest";
import { localiserLieu } from "./geo";

/** Faux service d'adresses : répond selon les paramètres demandés, et garde la trace des appels. */
function brancher(repond: (p: URLSearchParams) => [number, number] | null) {
  const appels: URLSearchParams[] = [];
  vi.stubGlobal("fetch", async (url: string) => {
    const p = new URL(url).searchParams;
    appels.push(p);
    const c = repond(p);
    return new Response(JSON.stringify({ features: c ? [{ geometry: { coordinates: c } }] : [] }), { status: 200 });
  });
  return appels;
}

afterEach(() => vi.unstubAllGlobals());

describe("localiserLieu", () => {
  it("un nom de ville : cherche d'abord la commune, pas une rue homonyme", async () => {
    const appels = brancher((p) => (p.get("type") === "municipality" ? [6.77, 45.62] : [3.6, 49.5]));
    expect(await localiserLieu("Bourg-Saint-Maurice")).toEqual({ lat: 45.62, lng: 6.77 });
    expect(appels[0].get("type")).toBe("municipality");
    expect(appels[0].get("q")).toBe("Bourg-Saint-Maurice");
  });

  it("une adresse avec code postal : recherche limitée à ce code postal", async () => {
    const appels = brancher((p) => (p.get("postcode") === "58430" ? [4.1, 47.0] : null));
    expect(await localiserLieu("Route du Haut Morvan 58430 Arleuf")).toEqual({ lat: 47.0, lng: 4.1 });
    expect(appels[0].get("postcode")).toBe("58430");
  });

  it("adresse introuvable : la commune après le code postal", async () => {
    const appels = brancher((p) => (p.get("type") === "municipality" && p.get("q") === "Arleuf" ? [4.0, 47.05] : null));
    expect(await localiserLieu("Lieu-dit inconnu 58430 Arleuf")).toEqual({ lat: 47.05, lng: 4.0 });
    expect(appels.some((p) => p.get("q") === "Arleuf" && p.get("postcode") === "58430")).toBe(true);
  });

  it("ni commune ni code postal : recherche libre en dernier recours, sinon rien", async () => {
    brancher((p) => (p.get("type") ? null : [2.35, 48.85]));
    expect(await localiserLieu("Salle des fêtes")).toEqual({ lat: 48.85, lng: 2.35 });
    brancher(() => null);
    expect(await localiserLieu("Introuvable")).toBeNull();
  });
});
