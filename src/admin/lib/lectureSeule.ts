// CRM Synthèse = une vue seule (Olivier, 09/11) : tant qu'on y est, le Hub refuse toute écriture.
// Le garde est posé sur le client de base (data/supabaseAdmin.ts), donc il vaut pour tous les écrans,
// fiches ouvertes depuis la Synthèse comprises. La barre de menu l'allume et l'éteint selon l'adresse ;
// les écrans qui le savent (useVueSeule) cachent en plus leurs boutons de modification.

import { useSyncExternalStore } from "react";

let actif = false;
const abonnes = new Set<() => void>();
export const lectureSeuleActive = () => actif;
export const reglerLectureSeule = (v: boolean) => {
  if (actif === v) return;
  actif = v;
  abonnes.forEach((f) => f());
};
/** Vrai tant qu'on est dans la CRM Synthèse : l'écran se redessine quand on y entre ou en sort. */
const sAbonner = (f: () => void) => {
  abonnes.add(f);
  return () => {
    abonnes.delete(f);
  };
};
export const useVueSeule = () => useSyncExternalStore(sAbonner, lectureSeuleActive);

/** Les lectures qui passent par une fonction de la base (POST), seules permises en vue seule. */
const LECTURES_RPC = new Set(["veille_cpr", "veille_cout_par_veille"]);
export const MESSAGE_LECTURE_SEULE = "CRM Synthèse : c'est une vue seule, rien ne se modifie ici. Ouvrez le CRM du marché pour modifier.";

/** Vrai si cette requête écrirait quelque chose (fiche, action, appel à Merx, fichier…). */
export function estEcriture(url: string, methode: string) {
  const m = methode.toUpperCase();
  if (m === "GET" || m === "HEAD" || m === "OPTIONS") return false;
  const chemin = new URL(url, "http://x").pathname;
  if (chemin.startsWith("/auth/")) return false;
  const rpc = chemin.match(/\/rest\/v1\/rpc\/([a-z_]+)/);
  if (rpc && LECTURES_RPC.has(rpc[1])) return false;
  return chemin.startsWith("/rest/") || chemin.startsWith("/functions/") || chemin.startsWith("/storage/");
}
