// Un prospect devient une affaire du Pipeline. Deux écrans le font — la fiche, et le
// brouillon d'e-mail au moment de l'envoi — et ils doivent en faire exactement autant.

import type { Client } from "../types";
import { uid } from "./format";
import { effectifLabel, type Prospect } from "./merx";

/** L'affaire telle qu'elle entre dans le Pipeline, avec ce que Merx a trouvé. */
export function clientDepuisProspect(p: Prospect, etape: string): Client {
  return {
    id: uid(),
    company: p.legal_name || p.name,
    siren: p.siren ?? "",
    siret: "",
    naf: "",
    adresse: p.head_office?.address ?? "",
    codePostal: "",
    ville: p.head_office?.city ?? p.city ?? "",
    effectif: effectifLabel(p.headcount_band) ?? "",
    stage: etape,
    jours: 1,
    tarif: 0,
    depistes: 0,
    orientes: 0,
    resultat: null,
    statutPropo: "Brouillon",
    contacts: [],
    docs: [],
    suivis: [],
  };
}

/** L'interlocuteur trouvé par Merx suit l'affaire, ou rien si on n'en a pas. */
export function contactDepuisProspect(p: Prospect): { prenom: string; nom: string; role: string; email: string } | null {
  if (!p.contact_name) return null;
  const [prenom, ...reste] = p.contact_name.trim().split(" ");
  return { prenom, nom: reste.join(" "), role: p.contact_role ?? "", email: p.contact_email ?? "" };
}
