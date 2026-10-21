// Le standard d'une entreprise : trouvé par le code, VÉRIFIÉ, jamais par le modèle.
//
// Olivier, 21/10 : « il lui faut d'abord le standard, marqué en gros, ultra vérifié — et
// si pas sûr, le mettre en gros ». Deux fiches l'ont montré le même jour : INEO Réseaux
// Nord Est (numéro Pages Jaunes non attribué) et Barde Sud-Ouest (le bon numéro était
// sous l'enseigne « Citeos Toulouse », introuvable sous le nom légal).
//
// Méthode :
//  1. Google Maps sous TOUS les noms de l'entreprise — enseigne, sigle, nom légal —, dans
//     sa ville ; plusieurs résultats par nom, pas seulement le premier.
//  2. Chaque fiche Google est rapprochée du registre officiel : même code postal ET même
//     rue que le siège → « vérifié ». Même ville et même nom, autre adresse → l'accueil
//     d'un autre établissement, « à vérifier ».
//  3. Un numéro que le site officiel de l'entreprise publie aussi est « vérifié » (deux
//     sources indépendantes).
//  4. Rien de sûr : on le dit, en gros. Jamais un numéro d'annuaire présenté comme sûr.
//
// Coût : une recherche Google Maps par nom (trois au plus), environ 0,035 $ chacune.

const URL_RECHERCHE = "https://places.googleapis.com/v1/places:searchText";
const TIMEOUT_MS = 6_000;

export type StatutStandard = "verifie" | "a_verifier";

export interface NumeroTrouve {
  numero: string;
  statut: StatutStandard;
  /** Ce que c'est : « Google Maps — Citeos Toulouse, 7 rue Joseph Cugnot, Muret ». */
  libelle: string;
  /** La page à ouvrir pour le contrôler. */
  source: string | null;
}

export interface Standard {
  /** Le numéro à composer, le plus sûr. */
  principal: NumeroTrouve | null;
  /** Les autres numéros trouvés, chacun avec sa source et son statut. */
  autres: NumeroTrouve[];
  /** Pourquoi rien de sûr n'a été trouvé, quand c'est le cas. */
  pourquoi: string | null;
  /** Date du relevé (AAAA-MM-JJ). */
  releve_le: string;
  /** Le site web de la fiche Google retenue, quand elle en donne un. */
  site?: string | null;
}

/* eslint-disable @typescript-eslint/no-explicit-any */

const sansAccent = (t: string) => t.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const national = (t: string) => t.replace(/\D/g, "").replace(/^33(?=\d{9}$)/, "0");
const MOTS_VIDES = new Set(["entreprise", "societe", "ste", "sas", "sa", "sarl", "eurl", "snc", "groupe", "france", "et", "de", "des", "du", "la", "le", "les", "l", "d"]);
/** Les mots de type de voie : ils ne distinguent pas une rue d'une autre. */
const VOIES = new Set(["rue", "avenue", "boulevard", "chemin", "route", "allee", "impasse", "place", "quai", "cours", "zone", "zac", "parc", "lieu", "dit", "bis", "ter", "general", "saint", "sainte", "grand", "grande", "petit", "petite", "cedex", "france"]);
const motsUtiles = (t: string) => sansAccent(t).split(/[^a-z0-9]+/).filter((m) => m.length >= 3 && !MOTS_VIDES.has(m));

/** « ENTREPRISE BARDE SUD-OUEST (CITEOS) (BSO) » → « ENTREPRISE BARDE SUD-OUEST », « CITEOS », « BSO ». */
export function nomsDeLEntreprise(nom: string, autres: (string | null | undefined)[] = []): string[] {
  const entreParentheses = [...nom.matchAll(/\(([^)]+)\)/g)].map((m) => m[1].trim());
  const base = nom.replace(/\s*\([^)]*\)/g, "").trim();
  const tous = [...autres, ...entreParentheses, base].filter((n): n is string => Boolean(n && n.trim()));
  const vus = new Set<string>();
  return tous.filter((n) => {
    const k = sansAccent(n).trim();
    if (!k || vus.has(k)) return false;
    vus.add(k);
    return true;
  });
}

async function chercher(requete: string, cle: string): Promise<any[]> {
  const res = await fetch(URL_RECHERCHE, {
    method: "POST",
    signal: AbortSignal.timeout(TIMEOUT_MS),
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": cle,
      "X-Goog-FieldMask": "places.id,places.displayName,places.formattedAddress,places.nationalPhoneNumber,places.businessStatus,places.websiteUri",
    },
    body: JSON.stringify({ textQuery: requete, languageCode: "fr", regionCode: "FR", maxResultCount: 3 }),
  });
  if (!res.ok) throw new Error(`Google Places a répondu ${res.status}`);
  return ((await res.json())?.places ?? []) as any[];
}

/**
 * Le standard, vérifié autant que possible.
 *
 * `siege` : l'adresse du registre (« ZI LE GRAND JOFFRERY 7 RUE JOSEPH CUGNOT 31600 MURET »).
 * `telephonesDuSite` : ceux que le site officiel publie (deuxième source indépendante).
 */
export async function trouverStandard(e: {
  noms: string[];
  ville: string | null;
  siege: string | null;
  telephonesDuSite?: string[];
}): Promise<Standard> {
  const releve_le = new Date().toISOString().slice(0, 10);
  const cle = Deno.env.get("GOOGLE_MAPS_KEY");
  const duSite = (e.telephonesDuSite ?? []).map(national).filter((t) => t.length === 10);
  const cpSiege = (e.siege ?? "").match(/\b\d{5}\b/)?.[0] ?? null;
  // La rue du siège : ses mots DISTINCTIFS (« joseph », « cugnot »), sans « rue » ni « général ».
  const rueSiege = motsUtiles((e.siege ?? "").replace(/\b\d{5}\b.*$/, "")).filter((m) => !VOIES.has(m));
  const numeroSiege = (e.siege ?? "").match(/\b(\d{1,4})\s+(?:bis\s+|ter\s+)?(?:rue|avenue|av|bd|boulevard|chemin|route|allee|allée|impasse|place|quai|cours|zi|za|zac)\b/i)?.[1] ?? null;
  const motsDuNom = new Set(e.noms.flatMap(motsUtiles));

  // Sans Google : le site officiel seul, à vérifier — mieux qu'aucun numéro.
  if (!cle || !e.noms.length) {
    const site = (e.telephonesDuSite ?? []).map((t) => ({ numero: t, statut: "a_verifier" as StatutStandard, libelle: "Site officiel de l'entreprise (une seule source)", source: null }));
    return {
      principal: site[0] ?? null,
      autres: site.slice(1, 4),
      pourquoi: site.length ? null : cle ? "aucun nom à chercher" : "recherche Google Maps indisponible (clé absente)",
      releve_le,
    };
  }

  // Une recherche par nom (enseigne et sigle d'abord : c'est sous eux que Google les connaît).
  const requetes = e.noms.slice(0, 3).map((n) => [n, e.ville].filter(Boolean).join(" "));
  const resultats = await Promise.all(requetes.map((q) => chercher(q, cle).catch(() => [] as any[])));
  const lieux = new Map<string, any>();
  for (const liste of resultats) for (const p of liste) if (p?.id && !lieux.has(p.id)) lieux.set(p.id, p);

  const trouves: (NumeroTrouve & { rang: number; site: string | null })[] = [];
  for (const p of lieux.values()) {
    const tel = p.nationalPhoneNumber ? String(p.nationalPhoneNumber) : null;
    if (!tel || p.businessStatus === "CLOSED_PERMANENTLY") continue;
    const nomGoogle = String(p.displayName?.text ?? "");
    const adresse = String(p.formattedAddress ?? "");
    // Le même nom, EN ENTIER : un des noms de l'entreprise se lit tout entier dans celui de
    // la fiche Google. « Ineo Infracom », dans le même immeuble qu'INEO Réseaux Nord Est,
    // n'est pas INEO Réseaux Nord Est (essai du 21/10).
    const motsGoogle = new Set(motsUtiles(nomGoogle));
    const variantes = e.noms.map(motsUtiles).filter((m) => m.length > 0);
    const nomEntier = variantes.some((m) => m.every((x) => motsGoogle.has(x)));
    if (!nomEntier) continue;
    // Un nom d'un seul mot (« BSO ») ne suffit pas hors de la ville : trop d'homonymes.
    const nomFort = variantes.some((m) => m.length >= 2 && m.every((x) => motsGoogle.has(x)));
    const cp = adresse.match(/\b\d{5}\b/)?.[0] ?? null;
    // La seule partie rue de l'adresse Google (avant le code postal) : « Paris » dans
    // « 7 Rue de Lyon, 75001 Paris » n'est pas un mot de la rue.
    const motsAdresse = new Set(motsUtiles(adresse.replace(/\b\d{5}\b[\s\S]*$/, "")).filter((m) => !VOIES.has(m)));
    const rueCommune = rueSiege.filter((m) => motsAdresse.has(m)).length;
    const memeNumero = numeroSiege ? new RegExp(`\\b${numeroSiege}\\b`).test(adresse) : false;
    // Au siège : même code postal, même nom de rue (mots distinctifs), et même numéro
    // quand le registre en donne un.
    const auSiege = Boolean(cpSiege && cp === cpSiege && rueCommune >= Math.min(2, rueSiege.length) && rueCommune >= 1 && (numeroSiege ? memeNumero : true));
    const memeVille = Boolean(e.ville && sansAccent(adresse).includes(sansAccent(e.ville)));
    // Ailleurs qu'au siège et dans une autre ville : un autre établissement, retenu
    // seulement sous un nom de plusieurs mots.
    if (!auSiege && !memeVille && !(cpSiege && cp === cpSiege) && !nomFort) continue;
    const recoupe = duSite.includes(national(tel));
    const statut: StatutStandard = auSiege || recoupe ? "verifie" : "a_verifier";
    const precision = auSiege
      ? "à l'adresse du registre officiel"
      : recoupe
        ? "même numéro sur le site officiel"
        : "autre adresse que le siège : l'accueil d'un établissement";
    trouves.push({
      numero: tel,
      statut,
      libelle: `Google Maps — ${nomGoogle}, ${adresse} (${precision})`,
      source: `https://www.google.com/maps/place/?q=place_id:${p.id}`,
      rang: auSiege ? 0 : recoupe ? 1 : 2,
      site: p.websiteUri ?? null,
    });
  }

  // Le site officiel seul : une source, pas deux.
  for (const t of e.telephonesDuSite ?? []) {
    if (trouves.some((x) => national(x.numero) === national(t))) continue;
    trouves.push({ numero: t, statut: "a_verifier", libelle: "Site officiel de l'entreprise (une seule source)", source: null, rang: 3, site: null });
  }

  // Un numéro, une ligne : la plus sûre.
  const uniques = new Map<string, NumeroTrouve & { rang: number; site: string | null }>();
  for (const t of trouves.sort((a, b) => a.rang - b.rang)) if (!uniques.has(national(t.numero))) uniques.set(national(t.numero), t);
  const tries = [...uniques.values()];
  const liste = tries.map(({ rang: _r, site: _s, ...t }) => t);
  return {
    site: tries[0]?.site ?? null,
    principal: liste[0] ?? null,
    autres: liste.slice(1, 4),
    pourquoi: liste.length ? null : "aucune fiche Google ni page officielle ne publie de numéro pour cette entreprise à cette adresse",
    releve_le,
  };
}
