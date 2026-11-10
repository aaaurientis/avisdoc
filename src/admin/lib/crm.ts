// Le CRM de la page (Olivier, 09/11) : chaque fiche — prospect, affaire, client — appartient à un CRM.
// Les écrans sont communs aux quatre CRM ; l'adresse dit lequel (?crm=…), et chacun ne montre que ses fiches.

import { useSearchParams } from "react-router-dom";

export const CRMS_FICHES = ["demarcher", "collectivites", "mutuelles", "intermediaires"] as const;
export type CrmFiche = (typeof CRMS_FICHES)[number];
const estCrm = (v: string | null | undefined): v is CrmFiche => CRMS_FICHES.includes(v as CrmFiche);

/** Le CRM de l'adresse ; null hors d'un CRM ou dans la CRM Synthèse (toutes les fiches). */
export function useCrm(): CrmFiche | null {
  const crm = useSearchParams()[0].get("crm");
  return estCrm(crm) ? crm : null;
}

/** Cette fiche se montre-t-elle ici ? Sans CRM dans l'adresse (Synthèse, lien direct), toutes se montrent. */
export const dansLeCrm = (crmDeLaFiche: string | null | undefined, crm: CrmFiche | null) =>
  !crm || (crmDeLaFiche ?? "demarcher") === crm;

/** Le CRM d'une fiche qu'on crée : celui de la page ouverte, sinon CRM Entreprise. */
export function crmPourFiche(): CrmFiche {
  const requete = typeof window === "undefined" ? "" : window.location.hash.split("?")[1] ?? "";
  const crm = new URLSearchParams(requete).get("crm");
  return estCrm(crm) ? crm : "demarcher";
}
