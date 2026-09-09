// Chargeur unique de l'API Google Maps JavaScript.
//
// Charge le script une seule fois (mémoïsé) et résout quand `google.maps` est
// prêt. La clé est publique (front) : la restreindre par référent HTTP dans la
// console Google Cloud. Sans clé, on rejette proprement pour que l'UI affiche
// un message de configuration plutôt que d'échouer en silence.

/* eslint-disable @typescript-eslint/no-explicit-any */

import { ADMIN_BACKEND, GOOGLE_MAPS_KEY } from "./config";
import { supabaseAdmin } from "../data/supabaseAdmin";

let loader: Promise<any> | null = null;
let keyCache: string | null = null;

/**
 * Récupère la clé Maps : priorité à VITE_GOOGLE_MAPS_KEY (utile en dev local),
 * sinon via l'Edge Function `maps-cle` qui lit le secret Supabase (réservée aux
 * comptes @avisdoc.fr). Renvoie "" si aucune source n'est disponible → l'UI
 * affiche alors un message de configuration.
 */
export async function fetchMapsKey(): Promise<string> {
  if (GOOGLE_MAPS_KEY) return GOOGLE_MAPS_KEY;
  if (keyCache !== null) return keyCache;
  if (ADMIN_BACKEND !== "supabase") return "";
  try {
    const { data, error } = await supabaseAdmin.functions.invoke("maps-cle");
    if (error) return "";
    keyCache = (data as { key?: string } | null)?.key ?? "";
    return keyCache;
  } catch {
    return "";
  }
}

export function loadGoogleMaps(key: string): Promise<any> {
  if (typeof window === "undefined") return Promise.reject(new Error("no-window"));
  const w = window as any;
  if (w.google?.maps) return Promise.resolve(w.google);
  if (!key) return Promise.reject(new Error("missing-key"));
  if (loader) return loader;

  loader = new Promise((resolve, reject) => {
    const cbName = "__avisdocGmapsInit";
    w[cbName] = () => resolve(w.google);
    const script = document.createElement("script");
    const params = new URLSearchParams({
      key,
      libraries: "marker",
      loading: "async",
      language: "fr",
      region: "FR",
      callback: cbName,
    });
    script.src = `https://maps.googleapis.com/maps/api/js?${params.toString()}`;
    script.async = true;
    script.onerror = () => {
      loader = null; // permet une nouvelle tentative
      reject(new Error("script-load-failed"));
    };
    document.head.appendChild(script);
  });
  return loader;
}
