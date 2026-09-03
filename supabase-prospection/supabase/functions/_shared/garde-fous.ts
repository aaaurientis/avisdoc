// Copie serveur des garde-fous de src/prospection/domaine/gardeFousMessage.ts
// (PR-30). La vérité côté écran reste la fonction du domaine ; ici on relance
// une fois le modèle quand sa sortie est refusée.
export type Genre = "invitation" | "message";
export const LONGUEUR_MAX: Record<Genre, number> = { invitation: 300, message: 600 };

const REGLES: Array<[string, RegExp]> = [
  ["tiret_cadratin", /—/],
  ["apostrophe_courbe", /[’‘]/],
  ["espace_insecable", /[\u00a0\u202f][?!:;]/],
  ["vocabulaire_interdit", /d[ée]pistages?\s+(du|des|de\s+la|d['’])\s*cancers?|d[ée]tection\s+(du|des|de\s+la|d['’])\s*cancers?|diagnostic/i],
  ["description_clinique", /\bphotos?\b|\bclich[ée]s?\b|m[ée]lanome|carcinome|biopsie|tumeur|m[ée]tastase|dermatoscop|grains?\s+de\s+beaut[ée]/i],
  ["promesse_resultat", /garanti|100\s?%|z[ée]ro\s+risque|sauve[rz]?\s+des\s+vies|d[ée]tecte\s+tou[st]/i],
  ["ciblage_sante", /votre\s+(peau|sant[ée]|risque|grain|ant[ée]c[ée]dent|l[ée]sion)|vos\s+(grains|ant[ée]c[ée]dents|l[ée]sions|sympt[oô]mes)|salari[ée]s?\s+(malades?|[àa]\s+risque|atteints?)/i],
];

export function violations(texte: string, genre: Genre, destinataireRh: boolean): string[] {
  const v: string[] = [];
  if (!texte.trim()) return ["vide"];
  if (texte.length > LONGUEUR_MAX[genre]) v.push("longueur");
  for (const [code, r] of REGLES) if (r.test(texte)) v.push(code);
  if (destinataireRh && !/confidenti/i.test(texte)) v.push("confidentialite_rh_absente");
  return v;
}

/** Corrections sans perte : apostrophes droites, espaces simples. */
export function normaliser(texte: string): string {
  return texte.replace(/[’‘]/g, "'").replace(/[\u00a0\u202f]/g, " ").replace(/^["«\s]+|["»\s]+$/g, "").trim();
}
