// Recherche entreprise via Pappers.
//
// - Mode démo : renvoie une entreprise de la petite base simulée.
// - Mode supabase : appelle l'Edge Function `pappers-search`, qui détient la
//   clé API Pappers côté serveur (jamais exposée au navigateur).

import type { PappersResult } from "../types";
import { ADMIN_BACKEND } from "../lib/config";
import { PAPPERS_DEMO } from "./seed";
import { supabaseAdmin } from "./supabaseAdmin";

export async function searchPappers(query: string): Promise<PappersResult> {
  const q = query.trim();
  if (!q) throw new Error("Requête vide");

  if (ADMIN_BACKEND === "supabase") {
    const { data, error } = await supabaseAdmin.functions.invoke(
      "pappers-search",
      { body: { query: q } },
    );
    if (error) throw error;
    return data as PappersResult;
  }

  // Mode démo — latence simulée + correspondance approximative.
  await new Promise((r) => setTimeout(r, 700));
  const norm = (s: string) => s.toLowerCase().replace(/\s/g, "");
  const found = PAPPERS_DEMO.find(
    (p) =>
      p.company.toLowerCase().includes(q.toLowerCase()) ||
      norm(p.siren).includes(norm(q)),
  );
  return found ?? { ...PAPPERS_DEMO[0], company: q };
}
