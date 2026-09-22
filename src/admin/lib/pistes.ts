// Les pistes proposées à côté du chat : des croisements secteur × zone que personne n'a encore demandés.
//
// Aucun modèle n'est appelé pour les produire — ce serait payer pour deviner. On croise les secteurs
// d'Olivier et les zones où AvisDoc peut organiser une journée, on écarte celles qu'une demande passée
// couvre déjà, et on prend les premières. Une piste lancée disparaît, la suivante prend sa place.

/** Secteur : son libellé, et les mots qui le reconnaissent dans une demande déjà faite. */
const SECTEURS_PISTE: { label: string; mots: string[] }[] = [
  { label: "travaux publics et BTP", mots: ["btp", "travaux publics", "terrassement", "batiment", "chantier", "voirie"] },
  { label: "espaces verts", mots: ["espaces verts", "paysagiste", "jardin", "elagage", "parc"] },
  { label: "agriculture et viticulture", mots: ["agricole", "agriculture", "viticole", "viticulture", "vigne", "exploitation"] },
  { label: "collectivités", mots: ["collectivite", "mairie", "commune", "ville de", "departement", "agglomeration"] },
];

/** Zones couvertes, les mêmes que la grille de notation. */
const ZONES_PISTE: { label: string; mots: string[] }[] = [
  { label: "en Gironde", mots: ["gironde", "bordeaux", "33"] },
  { label: "en Île-de-France", mots: ["ile de france", "paris", "idf"] },
  { label: "en Occitanie", mots: ["occitanie", "toulouse", "montpellier"] },
  { label: "en Provence-Alpes-Côte d’Azur", mots: ["provence", "paca", "marseille", "nice", "aix"] },
];

/** Sans accents, sans ponctuation : la comparaison ne doit pas buter sur « Côte d'Azur ». */
const normaliser = (t: string) =>
  t
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

/**
 * Les `combien` premières pistes encore inexplorées.
 *
 * Une piste est considérée comme explorée dès qu'une demande passée parle à la fois de son secteur
 * et de sa zone — même formulée autrement (« du terrassement autour de Bordeaux » couvre
 * « travaux publics et BTP en Gironde »).
 *
 * Le parcours est diagonal : on change de zone à chaque secteur, pour varier les propositions
 * plutôt que d'épuiser un secteur avant de passer au suivant.
 */
export function pistes(dejaDemandees: string[], combien = 5): string[] {
  const vues = dejaDemandees.map(normaliser);
  const couvre = (mots: string[]) => (demande: string) => mots.some((m) => demande.includes(normaliser(m)));

  const candidates: { texte: string; secteur: string[]; zone: string[] }[] = [];
  for (let decalage = 0; decalage < ZONES_PISTE.length; decalage++) {
    for (let i = 0; i < SECTEURS_PISTE.length; i++) {
      const s = SECTEURS_PISTE[i];
      const z = ZONES_PISTE[(i + decalage) % ZONES_PISTE.length];
      const texte = `Des entreprises du secteur ${s.label} ${z.label}`;
      if (!candidates.some((c) => c.texte === texte)) candidates.push({ texte, secteur: s.mots, zone: z.mots });
    }
  }

  return candidates
    .filter((c) => !vues.some((d) => couvre(c.secteur)(d) && couvre(c.zone)(d)))
    .slice(0, combien)
    .map((c) => c.texte);
}
