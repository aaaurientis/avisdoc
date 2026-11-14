// Rattachement automatique d'une fiche Google Maps : logique PURE (testée).
//
// Rien n'est deviné : une fiche n'est rattachée d'office que si UN SEUL résultat
// porte le nom du praticien ET le code postal d'un de ses lieux d'exercice RPPS.
// Plusieurs résultats possibles, ou un seul mais incomplet : un opérateur confirme.

export interface CandidatFiche {
  place_id: string;
  nom: string;
  adresse: string;
  ferme: boolean;
}

export type Correspondance =
  | { statut: "trouvee_auto"; placeId: string }
  | { statut: "a_confirmer"; candidats: number }
  | { statut: "introuvable" };

const norm = (t: string) =>
  t.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

/** Le nom de famille figure-t-il, en mots entiers, dans le nom de la fiche ? (« ARNOUX-BLANC » : chaque partie). */
export function porteLeNom(nomFiche: string, nomFamille: string): boolean {
  const f = ` ${norm(nomFiche)} `;
  const parties = norm(nomFamille).split(" ").filter((m) => m.length >= 2);
  return parties.length > 0 && parties.every((m) => f.includes(` ${m} `));
}

export function choisirFiche(candidats: CandidatFiche[], nomFamille: string, codesPostaux: string[]): Correspondance {
  if (candidats.length === 0) return { statut: "introuvable" };
  const cps = codesPostaux.filter((c) => /^\d{5}$/.test(c));
  const surs = candidats.filter((c) =>
    !c.ferme && porteLeNom(c.nom, nomFamille) && cps.some((cp) => new RegExp(`\\b${cp}\\b`).test(c.adresse)));
  if (surs.length === 1) return { statut: "trouvee_auto", placeId: surs[0].place_id };
  return { statut: "a_confirmer", candidats: candidats.length };
}
