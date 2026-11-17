// Réglages d'affichage du module Statistiques (Admin › Réglages › Statistiques), sans dépendance :
// lus par les fonctions de calcul (resultatsVisibles) et par l'affichage des noms.

export type ModeNoms = "clair" | "flou" | "initiale";

export interface AffichageStats {
  /** Afficher les résultats dermatologiques (recommandations, taux de consultation, exérèses, délais de suivi). */
  resultatsDermato: boolean;
  /** Noms des professionnels de santé (requis, requérants). */
  noms: ModeNoms;
  /** Requis dont les résultats sont masqués (leurs avis restent comptés dans les volumes). */
  requisMasques: string[];
}

export const AFFICHAGE_DEFAUT: AffichageStats = { resultatsDermato: true, noms: "clair", requisMasques: [] };

let courant: AffichageStats = AFFICHAGE_DEFAUT;
export const affichageStats = () => courant;
export function definirAffichageStats(a: Partial<AffichageStats> | null | undefined) {
  courant = {
    resultatsDermato: a?.resultatsDermato !== false,
    noms: a?.noms === "flou" || a?.noms === "initiale" ? a.noms : "clair",
    requisMasques: Array.isArray(a?.requisMasques) ? a!.requisMasques.filter((x) => typeof x === "string") : [],
  };
}

/** Les résultats de ce requis sont-ils masqués (Admin › Réglages › Statistiques) ? */
export const requisMasque = (requis: string | null | undefined) => courant.requisMasques.includes((requis ?? "").trim());

/** Pour calculer des RÉSULTATS : les avis des requis masqués sont retirés (les volumes, eux, gardent tout). */
export const pourResultats = <T extends { requis: string }>(liste: T[]): T[] =>
  courant.requisMasques.length ? liste.filter((e) => !requisMasque(e.requis)) : liste;

const TITRES = /^(dr|docteur|pr|professeur|mme|mr|m)\.?$/i;

/** « Jean DUPONT » → « Jean D. » ; « Dr Marie-Claire MARTIN » → « Dr Marie-Claire M. » ; « jean dupont » → « jean d. ». */
export function initialeNom(nom: string): string {
  const mots = nom.trim().split(/\s+/).filter(Boolean);
  if (mots.length < 2) return mots[0] ? `${mots[0][0].toUpperCase()}.` : "";
  const titres = mots.filter((m) => TITRES.test(m));
  const reste = mots.filter((m) => !TITRES.test(m));
  // Nom de famille : les mots en capitales s'il y en a, sinon le dernier mot.
  const capitales = reste.filter((m) => m.length > 1 && m === m.toUpperCase() && /[A-Z]/i.test(m));
  const famille = capitales.length && capitales.length < reste.length ? capitales : [reste[reste.length - 1]];
  const prenoms = reste.filter((m) => !famille.includes(m));
  const initiale = `${famille[0][0].toUpperCase()}.`;
  return [...titres, ...prenoms, initiale].join(" ");
}
