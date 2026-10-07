// Pré-étiquetage automatique d'un document à l'import — 100 % local, sans tiers.
//
// Règle : on normalise (minuscules, sans accents) le nom de fichier + la
// catégorie + la sous-catégorie, puis on suggère chaque tag disponible dont le
// libellé (ou l'un de ses synonymes) apparaît dans ce texte. Les tags
// personnalisés sont donc pris en charge par simple correspondance de nom.

function normalize(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // retire les diacritiques
    .replace(/[_\-.]+/g, " ");
}

// Synonymes des tags par défaut → déclenchent la suggestion du tag correspondant.
const SYNONYMES: Record<string, string[]> = {
  "À valider": ["a valider", "brouillon", "draft", "projet de", "v0", "wip", "en cours"],
  "Validé": ["valide", "final", "finale", "vf", "version finale", "approuve", "ok"],
  "Signé": ["signe", "signee", "signed", "signature", "paraphe"],
  "Confidentiel": ["confidentiel", "confidential", "prive", "secret", "nda", "rgpd"],
  "Modèle": ["modele", "template", "gabarit", "type", "trame", "standard"],
  "Prioritaire": ["prioritaire", "urgent", "priority", "important", "asap"],
  "Archivé": ["archive", "archivee", "ancien", "obsolete", "old", "perime"],
};

/**
 * Suggère des tags parmi `available` pour un document donné.
 * @returns la liste (ordonnée comme `available`) des tags détectés.
 */
export function suggestTags(
  filename: string,
  parent: string,
  sub: string,
  available: string[],
): string[] {
  const hay = normalize([filename, parent, sub].filter(Boolean).join(" "));
  const trouve = (needle: string) => {
    const n = normalize(needle);
    return n.length >= 3 && hay.includes(n);
  };
  return available.filter(
    (tag) => trouve(tag) || (SYNONYMES[tag] ?? []).some((kw) => trouve(kw)),
  );
}
