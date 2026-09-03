// Machine à états du contact — miroir exact de prospection.transition_autorisee()
// (fonction SQL). Le front s'en sert pour désactiver les actions avec un motif ;
// la transition elle-même passe toujours par la fonction serveur.
//
//   a_qualifier → a_contacter → invite → accepte → en_conversation → partenaire
//                                     ↘ refus (invite, accepte, en_conversation)
//                                     ↘ arrete (invite, accepte)
//   a_contacter → arrete (disqualification manuelle)
import type { StatutContact } from "../data/types";

export const ORDRE_STATUTS: readonly StatutContact[] = [
  "a_qualifier", "a_contacter", "invite", "accepte", "en_conversation", "partenaire", "refus", "arrete",
];

export const STATUTS_TERMINAUX: readonly StatutContact[] = ["partenaire", "refus", "arrete"];

export const TRANSITIONS: ReadonlyArray<readonly [StatutContact, StatutContact]> = [
  ["a_qualifier", "a_contacter"],
  ["a_contacter", "invite"],
  ["invite", "accepte"],
  ["accepte", "en_conversation"],
  ["en_conversation", "partenaire"],
  ["invite", "refus"],
  ["accepte", "refus"],
  ["en_conversation", "refus"],
  ["invite", "arrete"],
  ["accepte", "arrete"],
  ["a_contacter", "arrete"],
];

/** PR-40 : la transition de → vers est-elle permise ? */
export function pr40TransitionAutorisee(de: StatutContact, vers: StatutContact): boolean {
  return TRANSITIONS.some(([d, v]) => d === de && v === vers);
}

/** PR-41 : transitions possibles depuis un statut. */
export function pr41TransitionsDepuis(de: StatutContact): StatutContact[] {
  return TRANSITIONS.filter(([d]) => d === de).map(([, v]) => v);
}

/** PR-42 : le contact est-il dans la séquence de relances (invité, pas encore en conversation) ? */
export function pr42EnSequence(statut: StatutContact): boolean {
  return statut === "invite" || statut === "accepte";
}

export function pr43EstTerminal(statut: StatutContact): boolean {
  return STATUTS_TERMINAUX.includes(statut);
}
