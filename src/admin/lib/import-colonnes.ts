// Faire correspondre les colonnes d'un fichier Excel à celles du fichier client.
//
// Personne n'intitule ses colonnes de la même façon : « Mail pro », « Tél. », « CP ».
// Sans rapprochement, chaque variante créerait une colonne de plus, et on se
// retrouverait avec trois colonnes d'e-mails. On rapproche donc sur le sens, pas sur
// l'orthographe — et ce qui reste vraiment nouveau devient une colonne.
//
// Aucun modèle n'est appelé : ces équivalences se connaissent, il serait absurde de
// les faire deviner à chaque import.

import type { AccountField, FieldType } from "../types";

/** Minuscules, sans accents ni ponctuation : « Tél. » et « telephone » se rejoignent. */
export const nu = (t: string) =>
  t
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

/** Les façons courantes de nommer une même chose. La première est la forme de référence. */
const FAMILLES: string[][] = [
  ["etablissement", "nom", "raison sociale", "societe", "entreprise", "client", "denomination"],
  ["email", "e mail", "mail", "courriel", "adresse mail", "mail pro", "email pro", "adresse email"],
  ["telephone", "tel", "tel fixe", "fixe", "portable", "mobile", "gsm", "numero", "tel pro"],
  ["ville", "localite", "commune", "cp ville"],
  ["code postal", "cp", "codepostal", "zip"],
  ["adresse", "rue", "adresse postale", "voie"],
  ["date", "date client", "date d entree", "depuis", "signe le", "date de signature"],
  ["secteur", "activite", "domaine", "type", "categorie", "specialite"],
  ["referent", "contact", "interlocuteur", "responsable", "correspondant"],
  ["effectif", "salaries", "nombre de salaries", "taille"],
  ["siren", "siret", "numero siren"],
  ["site", "site web", "site internet", "url", "web"],
];

/** Deux intitulés désignent-ils la même chose ? */
function memeChose(a: string, b: string): boolean {
  const x = nu(a);
  const y = nu(b);
  if (x === y) return true;
  return FAMILLES.some((f) => f.includes(x) && f.includes(y));
}

export type Destination =
  | { sorte: "nom" }
  | { sorte: "existante"; champ: AccountField }
  | { sorte: "nouvelle"; type: FieldType }
  | { sorte: "ignorer" };

export interface Correspondance {
  entete: string;
  destination: Destination;
  /** Deux ou trois valeurs du fichier, pour que l'on voie de quoi on parle. */
  apercu: string[];
}

const NOMS = FAMILLES[0];

/** Le type d'une colonne se devine sur ses valeurs : on ne le demande pas. */
export function typeDevine(valeurs: string[]): FieldType {
  const v = valeurs.filter(Boolean);
  if (v.length === 0) return "texte";
  if (v.every((x) => /^[^@\s]+@[^@\s]+\.[a-z]{2,}$/i.test(x))) return "email";
  if (v.every((x) => /^https?:\/\//i.test(x))) return "lien";
  if (v.every((x) => /^[+\d][\d .()-]{7,}$/.test(x))) return "telephone";
  if (v.every((x) => /^\d{4}-\d{2}-\d{2}/.test(x) || /^\d{2}\/\d{2}\/\d{4}$/.test(x))) return "date";
  if (v.every((x) => /^-?\d+([.,]\d+)?$/.test(x))) return "nombre";
  if (v.some((x) => x.length > 60)) return "multiligne";
  return "texte";
}

/**
 * Propose une destination pour chaque colonne du fichier.
 *
 * La colonne du nom est celle qui le dit ; à défaut, la première du fichier — c'est
 * la convention de tous les exports.
 */
export function proposer(
  entetes: string[],
  valeursPar: (entete: string) => string[],
  champs: AccountField[],
): Correspondance[] {
  const enteteNom = entetes.find((e) => NOMS.includes(nu(e))) ?? entetes[0];

  return entetes.map((entete) => {
    const apercu = valeursPar(entete).filter(Boolean).slice(0, 3);
    if (entete === enteteNom) return { entete, destination: { sorte: "nom" as const }, apercu };

    const champ = champs.find((f) => f.key !== "etablissement" && memeChose(f.label, entete));
    if (champ) return { entete, destination: { sorte: "existante" as const, champ }, apercu };

    return { entete, destination: { sorte: "nouvelle" as const, type: typeDevine(apercu) }, apercu };
  });
}
