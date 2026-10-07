// Chargeur Google Maps (Places) pour le portail requérant.
// Clé servie par l'Edge Function maps-cle (restriction par référent HTTP côté
// Google : requerant.avisdoc.fr doit être autorisé).

/* eslint-disable @typescript-eslint/no-explicit-any */
import { supabase } from "./supabase";

let loader: Promise<any> | null = null;
let keyCache: string | null = null;

export async function fetchMapsKey(): Promise<string> {
  const envKey = import.meta.env.VITE_GOOGLE_MAPS_KEY as string | undefined;
  if (envKey) return envKey;
  if (keyCache !== null) return keyCache;
  try {
    const { data, error } = await supabase.functions.invoke("maps-cle");
    if (error) return (keyCache = "");
    keyCache = (data as { key?: string } | null)?.key ?? "";
    return keyCache;
  } catch {
    return (keyCache = "");
  }
}

export function loadGooglePlaces(key: string): Promise<any> {
  if (typeof window === "undefined") return Promise.reject(new Error("no-window"));
  const w = window as any;
  if (w.google?.maps?.places) return Promise.resolve(w.google);
  if (!key) return Promise.reject(new Error("missing-key"));
  if (loader) return loader;

  loader = new Promise((resolve, reject) => {
    const cbName = "__avisdocReqGmapsInit";
    w[cbName] = () => resolve(w.google);
    const script = document.createElement("script");
    const params = new URLSearchParams({
      key,
      libraries: "places",
      loading: "async",
      language: "fr",
      region: "FR",
      callback: cbName,
    });
    script.src = `https://maps.googleapis.com/maps/api/js?${params.toString()}`;
    script.async = true;
    script.onerror = () => { loader = null; reject(new Error("script-load-failed")); };
    document.head.appendChild(script);
  });
  return loader;
}
