// Un prospect devient une affaire du Pipeline. Deux écrans le font — la fiche, et le
// brouillon d'e-mail au moment de l'envoi — et ils doivent en faire exactement autant.

import type { Client } from "../types";
import { uid } from "./format";
import { effectifLabel, type Prospect } from "./merx";

/**
 * Une entreprise déjà présente dans le Pipeline, s'il y en a une.
 *
 * Une même entreprise ne doit exister qu'à un seul endroit à la fois. Sans ce
 * garde-fou, un double clic ou un second essai après une erreur créait une seconde
 * affaire du même nom — c'est arrivé, quatre fois pour la même société.
 */
export function dejaAuPipeline(p: Prospect, clients: Client[]): Client | undefined {
  const nu = (t: string) => t.trim().toLowerCase();
  const noms = [nu(p.legal_name || p.name), nu(p.name)];
  return clients.find((c) => noms.includes(nu(c.company)) || (p.siren && c.siren && c.siren === p.siren));
}

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
