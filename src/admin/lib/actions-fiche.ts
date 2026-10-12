// Ce qu'on peut noter sur une fiche, et ce que cela fait au Pipeline.
//
// Repris de la fiche du hub Onetip (12/10) : cinq boutons, le reste dans « Autre… »,
// et un compte rendu en trois questions — ça a donné quoi, ce qui s'est dit, et après.

import type { GenreEchange } from "./echanges";

export const BOUTONS_ACTION: GenreEchange[] = ["appel", "rdv", "presentation", "email", "note"];
export const AUTRES_ACTIONS: GenreEchange[] = ["salon", "sms", "linkedin", "devis"];

/** Le nom d'un bouton : court. */
export const LIBELLE_BOUTON: Partial<Record<GenreEchange, string>> = {
  appel: "Appel",
  rdv: "Rendez-vous",
  presentation: "Présentation",
  email: "Mail",
  note: "Note",
};

/** Ce qu'on invite à écrire dans le compte rendu. */
export const INVITE: Partial<Record<GenreEchange, string>> = {
  appel: "Ce qui s'est dit…",
  email: "Ce qu'on a écrit, et à qui…",
  sms: "Ce qu'on a envoyé…",
  linkedin: "Ce qu'on a écrit…",
  salon: "Quel salon, avec qui, ce qui s'est dit…",
  rdv: "Où, avec qui, ce qui en ressort…",
  presentation: "Ce qu'on a montré, la réaction…",
  devis: "Ce qui a été proposé…",
  tache: "Ce qu'il y a à faire…",
  note: "Votre note…",
};

/** « Ça a donné quoi ? » — un clic. Seuls ces trois genres ont un résultat ; pour eux il est obligatoire. */
export const RESULTATS: Partial<Record<GenreEchange, string[]>> = {
  appel: ["Joint", "Pas joint", "Messagerie", "Pas intéressé"],
  rdv: ["Fait", "Reporté", "Annulé"],
  presentation: ["Intéressé", "À relancer", "Pas intéressé"],
};

/** Ce qu'on peut programmer ensuite, depuis « Et après ? ». */
export const SUITES: GenreEchange[] = ["appel", "rdv", "presentation", "email"];

export const resultatNegatif = (r: string) => r.startsWith("Pas") || r === "Annulé";

/**
 * L'étape que la fiche PROPOSE après une action — jamais appliquée sans le clic du
 * commercial. Elle ne fait qu'avancer et ne propose jamais « Signé » : signer crée la
 * fiche client, cela ne se fait pas d'une case cochée.
 *
 * `colonnes` : celles du pipeline de l'affaire, dans l'ordre. `actuelle` : null pour
 * un prospect qui n'est pas encore au Pipeline.
 */
export function etapeProposee(
  genre: GenreEchange,
  resultat: string | null,
  suite: GenreEchange | null,
  actuelle: string | null,
  colonnes: string[],
): string | null {
  let cible: string | null = null;
  if (suite === "rdv" || (genre === "rdv" && resultat === "Fait")) cible = "RDV";
  else if (genre === "presentation" && resultat === "Intéressé") cible = "Proposition";
  else if ((genre === "appel" && resultat === "Joint") || genre === "email") cible = "Contacté";
  if (!cible) return null;
  const rang = (nom: string) => colonnes.findIndex((c) => c.trim().toLowerCase() === nom.toLowerCase());
  const visee = rang(cible);
  if (visee < 0) return null;
  const ici = actuelle ? rang(actuelle) : -1;
  return visee > ici ? colonnes[visee] : null;
}

/**
 * Un rendez-vous est pris : la fiche passe d'elle-même dans la colonne « RDV »
 * (Olivier, 12/10 : « si on colle un rendez-vous, ça va dans la colonne rendez-vous »).
 * Sans case à cocher, mais jamais en arrière : une affaire déjà en Proposition y reste.
 */
export function colonneRdvSiAvance(actuelle: string | null, colonnes: string[]): string | null {
  const rang = (nom: string) => colonnes.findIndex((c) => c.trim().toLowerCase() === nom.trim().toLowerCase());
  const rdv = colonnes.find((c) => c.trim().toLowerCase() === "rdv");
  if (!rdv) return null;
  return rang(rdv) > (actuelle ? rang(actuelle) : -1) ? rdv : null;
}

/**
 * Mettre une action sur un prospect le fait entrer au Pipeline (Olivier, 12/10 :
 * « quand on commence à lui mettre une action, automatiquement elle rentre dans le
 * pipeline »). Une note, elle, ne le bouge pas.
 */
export const faitEntrerAuPipeline = (genre: GenreEchange) => genre !== "note";

/** La colonne d'entrée : « Contacté » quand l'échange a eu lieu, la première sinon. */
export function colonneDEntree(fait: boolean, colonnes: string[]): string {
  const contacte = colonnes.find((c) => c.trim().toLowerCase() === "contacté");
  return (fait && contacte) || colonnes[0] || "Contacté";
}

// ── Les dates, à l'heure de Paris ────────────────────────────────────────────

export const jourISO = (d: Date) => d.toLocaleDateString("sv-SE", { timeZone: "Europe/Paris" });
export const heureISO = (d: Date) => d.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Paris" });
export const quandCourt = (iso: string) =>
  new Date(iso).toLocaleDateString("fr-FR", { day: "numeric", month: "short", timeZone: "Europe/Paris" });

/**
 * Un jour et une heure lus à l'heure de Paris — comme le formulaire les affiche —,
 * en instant ISO. Le fuseau du navigateur n'y entre pas.
 */
export const instant = (jour: string, heure: string) => {
  const commeUTC = Date.parse(`${jour}T${heure || "12:00"}:00Z`);
  const d = new Date(commeUTC);
  const ecart = Date.parse(d.toLocaleString("en-US", { timeZone: "Europe/Paris" })) - Date.parse(d.toLocaleString("en-US", { timeZone: "UTC" }));
  return new Date(commeUTC - ecart).toISOString();
};

/** Un lien de visio acceptable : http(s), sans espace ni guillemet. */
export const lienValide = (l: string) => !l.trim() || /^https?:\/\/[^\s"'<>]+$/i.test(l.trim());

/** « olivier.deguyenro@avisdoc.fr » → « Olivier ». */
export const prenomDe = (email: string | null | undefined) => {
  const p = (email ?? "").split("@")[0].split(/[._-]+/)[0] ?? "";
  return p ? p.charAt(0).toUpperCase() + p.slice(1) : "";
};
