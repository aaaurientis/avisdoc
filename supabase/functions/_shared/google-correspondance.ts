// Rattachement automatique des fiches Google Maps : logique PURE (testée).
//
// Rien n'est deviné. Seules comptent les fiches situées en France, dans le
// département concerné (code postal). Au nom du praticien ET à l'adresse d'un de ses
// lieux d'exercice RPPS (code postal + voie) : validée d'office (décision du 14/11).
// Au nom et au code postal seulement : rattachée, à vérifier. Il peut y en avoir
// plusieurs (cabinet et hôpital). Une fiche qui ne porte pas le nom n'est jamais mise
// en avant. Sinon, un opérateur choisit, une ou plusieurs fiches.

export interface CandidatFiche {
  place_id: string;
  nom: string;
  adresse: string;
  ferme: boolean;
}

export type Correspondance =
  /** confirmee : toutes les fiches retenues sont à l'adresse RPPS — validées d'office. */
  | { statut: "confirmee" | "trouvee_auto"; placeIds: string[] }
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

/** Préfixe de code postal d'un département (la Corse partage 20xxx, les DOM 97x). */
function prefixeCp(departement: string): string {
  if (departement === "2A" || departement === "2B") return "20";
  return departement;
}

/** La fiche est-elle en France, dans le département ? (d'après son adresse). */
export function dansLeDepartement(adresse: string, departements: string[]): boolean {
  if (!/\bFrance\s*$/i.test(adresse.trim())) return false;
  const cps: string[] = adresse.match(/\b\d{5}\b/g) ?? [];
  return cps.some((cp) => departements.some((d) => cp.startsWith(prefixeCp(d))));
}

export function filtrerDepartement<T extends CandidatFiche>(candidats: T[], departements: string[]): T[] {
  return candidats.filter((c) => dansLeDepartement(c.adresse, departements));
}

export type Force = "certaine" | "forte" | "moyenne" | "faible";

/** Un lieu d'exercice RPPS, pour comparer les adresses. */
export interface LieuRpps { codePostal: string | null; adresse: string | null }

const TYPES_VOIE = /\b(rue|avenue|av|boulevard|bd|chemin|route|allee|allees|place|quai|cours|impasse|montee|square|voie|passage|esplanade|parvis|promenade|rond point|faubourg|chaussee|traverse|clos|residence)\b/;
const MOTS_VIDES = new Set(["de", "du", "des", "la", "le", "les", "l", "d", "et", "en", "sur", "sous", "aux", "au", "bp", "cs", "cedex"]);

/** Les mots qui nomment la voie d'une adresse RPPS (« 12 Rue DES ALPES, BP 56 » → alpes). */
export function motsDeLaVoie(adresse: string): string[] {
  for (const partie of norm(adresse).split(/\s{2,}|,/).map((x) => x.trim())) {
    const m = partie.match(TYPES_VOIE);
    if (!m || m.index === undefined) continue;
    const apres = partie.slice(m.index + m[0].length).split(" ").filter((w) => w && !/^\d+$/.test(w) && !MOTS_VIDES.has(w));
    if (apres.length) return apres;
  }
  return [];
}

/** La fiche Google est-elle à l'adresse RPPS : même code postal et même voie ? */
export function memeAdresse(adresseGoogle: string, lieu: LieuRpps): boolean {
  if (!lieu.codePostal || !new RegExp(`\\b${lieu.codePostal}\\b`).test(adresseGoogle)) return false;
  const voie = motsDeLaVoie(lieu.adresse ?? "");
  const g = ` ${norm(adresseGoogle)} `;
  return voie.length > 0 && voie.every((w) => g.includes(` ${w} `));
}

/**
 * Force de la correspondance d'une fiche (déjà dans le département) :
 *   certaine — nom du praticien ET adresse RPPS (code postal + voie), fiche ouverte : validée d'office ;
 *   forte    — nom du praticien ET code postal d'un lieu RPPS, fiche ouverte : rattachée, à vérifier ;
 *   moyenne  — nom du praticien, autre commune du département (ou fiche fermée) : proposée ;
 *   faible   — le nom n'y figure pas : jamais mise en avant.
 */
export function forceFiche(c: CandidatFiche, nomFamille: string, lieux: LieuRpps[]): Force {
  if (!porteLeNom(c.nom, nomFamille)) return "faible";
  if (c.ferme) return "moyenne";
  if (lieux.some((l) => memeAdresse(c.adresse, l))) return "certaine";
  const memeCp = lieux.some((l) => l.codePostal && new RegExp(`\\b${l.codePostal}\\b`).test(c.adresse));
  return memeCp ? "forte" : "moyenne";
}

const RANG: Record<Force, number> = { certaine: 0, forte: 1, moyenne: 2, faible: 3 };

/** Les candidats du département, qualifiés et triés : les plus sûrs d'abord. */
export function qualifierFiches<T extends CandidatFiche>(
  candidats: T[], nomFamille: string, lieux: LieuRpps[], departements: string[],
): (T & { force: Force })[] {
  return filtrerDepartement(candidats, departements)
    .map((c) => ({ ...c, force: forceFiche(c, nomFamille, lieux) }))
    .sort((a, b) => RANG[a.force] - RANG[b.force]);
}

export function choisirFiche(
  candidats: CandidatFiche[],
  nomFamille: string,
  lieux: LieuRpps[],
  departements: string[],
): Correspondance {
  const q = qualifierFiches(candidats, nomFamille, lieux, departements);
  const retenues = q.filter((c) => c.force === "certaine" || c.force === "forte");
  if (retenues.length > 0) {
    return {
      statut: retenues.every((c) => c.force === "certaine") ? "confirmee" : "trouvee_auto",
      placeIds: [...new Set(retenues.map((c) => c.place_id))],
    };
  }
  const moyennes = q.filter((c) => c.force === "moyenne");
  // Des fiches sans le nom du praticien ne suffisent pas à le dire « à confirmer ».
  if (moyennes.length > 0) return { statut: "a_confirmer", candidats: moyennes.length };
  return { statut: "introuvable" };
}
