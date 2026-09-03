// Garde-fous des messages générés — vérifiés par le code, pas seulement
// demandés au modèle. Rien ne part sans relecture ; ici on refuse ce qui ne
// doit jamais partir.
import type { TypeCompte } from "../data/types";

export type GenreMessage = "invitation" | "message";

/** Note d'invitation : 300 caractères. Message : 600. */
export const LONGUEUR_MAX: Record<GenreMessage, number> = { invitation: 300, message: 600 };

export type CodeViolation =
  | "vide"
  | "longueur"
  | "tiret_cadratin"
  | "apostrophe_courbe"
  | "espace_insecable"
  | "vocabulaire_interdit"
  | "description_clinique"
  | "promesse_resultat"
  | "ciblage_sante"
  | "confidentialite_rh_absente";

export type Violation = { code: CodeViolation; extrait?: string };

/** Vocabulaire imposé : « repérage de lésions suspectes », jamais « dépistage du cancer ». */
const VOCABULAIRE_INTERDIT: RegExp[] = [
  /d[ée]pistages?\s+(du|des|de\s+la|d['’])\s*cancers?/i,
  /d[ée]tection\s+(du|des|de\s+la|d['’])\s*cancers?/i,
  /diagnostic/i,
];

/** Toute photo ou description clinique. */
const DESCRIPTION_CLINIQUE: RegExp[] = [
  /\bphotos?\b/i, /\bclich[ée]s?\b/i, /\bimages?\s+de\b/i,
  /m[ée]lanome/i, /carcinome/i, /biopsie/i, /tumeur/i, /m[ée]tastase/i, /dermatoscop/i,
  /grains?\s+de\s+beaut[ée]/i,
];

/** Toute promesse de résultat. */
const PROMESSE_RESULTAT: RegExp[] = [
  /garanti/i, /100\s?%/i, /z[ée]ro\s+risque/i, /sauve[rz]?\s+des\s+vies/i,
  /d[ée]tecte\s+tou[st]/i, /assur[ée]s?\s+de\s+(d[ée]tecter|trouver)/i, /aucun\s+cancer\s+ne/i,
];

/** Tout ciblage fondé sur un critère de santé (le destinataire ou ses salariés). */
const CIBLAGE_SANTE: RegExp[] = [
  /votre\s+(peau|sant[ée]|risque|grain|ant[ée]c[ée]dent|l[ée]sion)/i,
  /vos\s+(grains|ant[ée]c[ée]dents|l[ée]sions|sympt[oô]mes)/i,
  /vous\s+(êtes|etes|seriez)\s+(malade|[àa]\s+risque|expos[ée])/i,
  /salari[ée]s?\s+(malades?|[àa]\s+risque|atteints?)/i,
];

function premierExtrait(texte: string, regexes: RegExp[]): string | undefined {
  for (const r of regexes) {
    const m = r.exec(texte);
    if (m) return m[0];
  }
  return undefined;
}

/**
 * PR-30 : liste des violations d'un texte. Vide = conforme.
 * `destinataireRh` : le rappel de la promesse de confidentialité est obligatoire.
 */
export function pr30GardeFousMessage(texte: string, genre: GenreMessage, destinataireRh: boolean): Violation[] {
  const t = texte ?? "";
  const violations: Violation[] = [];
  if (t.trim().length === 0) return [{ code: "vide" }];
  if (t.length > LONGUEUR_MAX[genre]) violations.push({ code: "longueur", extrait: String(t.length) });
  if (/—/.test(t)) violations.push({ code: "tiret_cadratin" });
  if (/[’‘]/.test(t)) violations.push({ code: "apostrophe_courbe" });
  if (/[\u00a0\u202f][?!:;]/.test(t)) violations.push({ code: "espace_insecable" });
  const voc = premierExtrait(t, VOCABULAIRE_INTERDIT);
  if (voc) violations.push({ code: "vocabulaire_interdit", extrait: voc });
  const clin = premierExtrait(t, DESCRIPTION_CLINIQUE);
  if (clin) violations.push({ code: "description_clinique", extrait: clin });
  const prom = premierExtrait(t, PROMESSE_RESULTAT);
  if (prom) violations.push({ code: "promesse_resultat", extrait: prom });
  const cib = premierExtrait(t, CIBLAGE_SANTE);
  if (cib) violations.push({ code: "ciblage_sante", extrait: cib });
  if (destinataireRh && !/confidenti/i.test(t)) violations.push({ code: "confidentialite_rh_absente" });
  return violations;
}

export type CleObjection =
  | "courtier_donnees_sante"
  | "intermediaire_valeur_ajoutee"
  | "entreprise_temps_confidentialite";

/** PR-31 : objection attendue selon le cercle de cible (et le type de compte). */
export function pr31ObjectionAttendue(typeCompte: TypeCompte | null | undefined, cercle: number | null | undefined): CleObjection {
  if (cercle === 1 || typeCompte === "courtier") return "courtier_donnees_sante";
  if (cercle === 3 || typeCompte === "entreprise") return "entreprise_temps_confidentialite";
  return "intermediaire_valeur_ajoutee";
}

/**
 * PR-32 : corrections typographiques sans perte pour un texte LinkedIn
 * (apostrophes droites, espaces simples). Le tiret cadratin n'est pas corrigé
 * automatiquement : il demande une reformulation, il est signalé.
 */
export function pr32NormaliserTypographieLinkedin(texte: string): string {
  return texte
    .replace(/[’‘]/g, "'")
    .replace(/[\u00a0\u202f]/g, " ")
    .replace(/[ \t]+\n/g, "\n")
    .trim();
}
