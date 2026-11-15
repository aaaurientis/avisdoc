// Réseau d'aval : grille des signaux, contrôle des sources et score de probabilité
// d'adhésion. Logique PURE, partagée entre les Edge Functions et le front.
//
// Réf. : docs/reseau-aval-lot0.md, §6 (sources, rien d'inventé) et §8 bis (score).

export type TypeSignal =
  | "orientation" | "nouveaux_patients" | "motif_exerese" | "dermoscopie"
  | "chirurgie_sur_place" | "circuit_rapide" | "prevention" | "plaintes_delais"
  | "du_dermoscopie" | "signal_depart" | "teleexpertise" | "creneau_doctolib";

export interface DefinitionSignal {
  libelle: string;
  valeurs: string[];
  /** Où l'opérateur le lit d'habitude. */
  source: string;
  /** L'IA peut-elle le proposer ? (les avis Google se lisent à la main : pas de verbatim). */
  parIa: boolean;
}

export const VALEUR_LIBELLE: Record<string, string> = {
  oui: "Oui", non: "Non", inconnu: "Inconnu", sur_courrier: "Sur courrier",
  medicale: "Médicale", mixte: "Mixte", esthetique_dominante: "Esthétique dominante", inconnue: "Inconnue",
  moins_7j: "Moins de 7 jours", "7_30j": "7 à 30 jours", plus_30j: "Plus de 30 jours", aucun_nouveau: "Aucun pour un nouveau patient",
};

export const SIGNAUX: Record<TypeSignal, DefinitionSignal> = {
  orientation: { libelle: "Orientation de l'activité", valeurs: ["medicale", "mixte", "esthetique_dominante", "inconnue"], source: "Fiche Google, site du cabinet", parIa: true },
  nouveaux_patients: { libelle: "Accepte de nouveaux patients", valeurs: ["oui", "non", "sur_courrier", "inconnu"], source: "Site du cabinet", parIa: true },
  motif_exerese: { libelle: "Propose « lésion suspecte » ou « exérèse »", valeurs: ["oui", "non", "inconnu"], source: "Site du cabinet", parIa: true },
  dermoscopie: { libelle: "Dermoscopie ou cartographie des nævus", valeurs: ["oui", "non", "inconnu"], source: "Site du cabinet", parIa: true },
  chirurgie_sur_place: { libelle: "Chirurgie cutanée sur place", valeurs: ["oui", "non", "inconnu"], source: "Site, établissement", parIa: true },
  circuit_rapide: { libelle: "Circuit rapide ou contact réservé aux médecins", valeurs: ["oui", "non", "inconnu"], source: "Site de l'hôpital ou de la clinique", parIa: true },
  prevention: { libelle: "Actions de prévention", valeurs: ["oui", "non", "inconnu"], source: "Presse locale", parIa: true },
  plaintes_delais: { libelle: "Plaintes répétées sur les délais", valeurs: ["oui", "non", "inconnu"], source: "Avis de la fiche Google, lus par l'opérateur", parIa: false },
  du_dermoscopie: { libelle: "DU ou formation en dermoscopie", valeurs: ["oui", "non", "inconnu"], source: "Site du cabinet", parIa: true },
  signal_depart: { libelle: "Signal de départ (successeur, fermeture)", valeurs: ["oui", "non", "inconnu"], source: "Annonces, fiche Google", parIa: true },
  teleexpertise: { libelle: "Pratique la télé-expertise (futur requérant)", valeurs: ["oui", "non", "inconnu"], source: "Site du cabinet", parIa: true },
  // Relevé par l'opérateur sur la fiche Doctolib : le Hub ne lit jamais Doctolib.
  creneau_doctolib: { libelle: "Premier créneau Doctolib (nouveau patient)", valeurs: ["moins_7j", "7_30j", "plus_30j", "aucun_nouveau", "inconnu"], source: "Fiche Doctolib, relevé par l'opérateur", parIa: false },
};

export const TYPES_SIGNAL = Object.keys(SIGNAUX) as TypeSignal[];

export function estTypeSignal(t: unknown): t is TypeSignal {
  return typeof t === "string" && Object.prototype.hasOwnProperty.call(SIGNAUX, t);
}

export function valeurAdmise(type: TypeSignal, valeur: unknown): boolean {
  return typeof valeur === "string" && SIGNAUX[type].valeurs.includes(valeur);
}

/** Une URL web complète, sans espace. */
export function urlValide(u: unknown): u is string {
  if (typeof u !== "string" || !/^https?:\/\/[^\s]+$/.test(u)) return false;
  try {
    const p = new URL(u);
    return Boolean(p.hostname && p.hostname.includes("."));
  } catch {
    return false;
  }
}

// ── Domaines que l'IA ne consulte jamais (règle 2 du brief) ─────────────────
// Google passe par l'API Places ; Doctolib, LinkedIn et les sites d'avis restent exclus.
export const DOMAINES_EXCLUS = [
  "doctolib.fr", "linkedin.com", "google.com", "google.fr", "maps.google.com",
  "trustpilot.com", "pagesjaunes.fr", "facebook.com", "instagram.com",
];

export function domaineExclu(u: string): boolean {
  try {
    const h = new URL(u).hostname.toLowerCase();
    return DOMAINES_EXCLUS.some((d) => h === d || h.endsWith(`.${d}`));
  } catch {
    return true;
  }
}

// ── Contrôle des extraits : rien d'inventé ──────────────────────────────────

/** Texte lisible d'une page HTML (balises, scripts et entités retirés). */
export function texteDeHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;|&#160;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;|&rsquo;|&#8217;/gi, "'")
    .replace(/&laquo;|&raquo;/gi, '"')
    .replace(/&eacute;/gi, "é").replace(/&egrave;/gi, "è").replace(/&agrave;/gi, "à").replace(/&ccedil;/gi, "ç")
    .replace(/&#(\d+);/g, (_m, n) => String.fromCharCode(Number(n)));
}

/** Normalisation pour comparer : casse, accents, apostrophes, guillemets et espaces. */
export function normaliser(t: string): string {
  return t
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[’‘`´]/g, "'")
    .replace(/[“”«»]/g, '"')
    .replace(/[‐-―]/g, "-")
    .replace(/\s+/g, " ")
    .trim();
}

export const LONGUEUR_MIN_EXTRAIT = 20;

/**
 * L'extrait figure-t-il mot pour mot dans la page ? Trop court, il ne prouve rien :
 * refusé. C'est le garde-fou qui écarte toute valeur que l'IA aurait inventée.
 */
export function extraitPresent(extrait: string, textePage: string): boolean {
  const e = normaliser(extrait ?? "");
  if (e.length < LONGUEUR_MIN_EXTRAIT) return false;
  return normaliser(textePage).includes(e);
}

// ── Score : probabilité d'adhésion au réseau ────────────────────────────────
// Régression logistique lisible à la main : z = base + Σ contributions,
// probabilité = 1 / (1 + e^(−z)). Les pondérations ci-dessous sont l'estimation
// A PRIORI de la note du lot 0 (§8 bis), non calibrée. Décision reportée par
// AvisDoc (14/11) : à valider, puis à réapprendre sur les issues réelles.

export const SCORE_CONFIG = {
  version: "v0.1, pondérations proposées le 15/11/2026",
  calibre: false,
  tauxDeBase: 0.2,
  /** Contribution par signal validé et par valeur. Une valeur absente vaut 0 (« inconnu » ne pénalise pas). */
  poids: {
    nouveaux_patients: { oui: 0.8, sur_courrier: 0.4, non: -1.0 },
    motif_exerese: { oui: 0.6 },
    dermoscopie: { oui: 0.4 },
    chirurgie_sur_place: { oui: 0.4 },
    circuit_rapide: { oui: 0.8 },
    prevention: { oui: 0.5 },
    plaintes_delais: { oui: -0.6 },
    orientation: { mixte: -0.3 },
    signal_depart: { oui: -1.5 },
    du_dermoscopie: { oui: 0.3 },
    creneau_doctolib: { moins_7j: 0.5, "7_30j": 0.2, plus_30j: -0.5, aucun_nouveau: -0.8 },
  } as Partial<Record<TypeSignal, Record<string, number>>>,
  /**
   * Présence en ligne (demande du 15/11) : un praticien joignable et visible adhère plus
   * facilement. Fiche Google confirmée (ou trouvée, à vérifier) ; lien Doctolib avec prise
   * de rendez-vous en ligne. Une page Doctolib « non réservable » ne rapporte rien.
   */
  presence: {
    google: { confirmee: 0.3, trouvee_auto: 0.2 } as Record<string, number>,
    doctolib: { reservable: 0.3, a_verifier: 0.2 },
  },
} as const;

/** Ce que le score lit du praticien pour la présence en ligne (facultatif). */
export interface PresencePourScore {
  googleStatut?: string;
  googlePlaceIds?: string[];
  doctolibStatut?: string;
  doctolibUrl?: string | null;
  doctolibInfos?: { reservable?: boolean | null } | null;
}

/** Points de présence en ligne, chacun avec son lien (fiche Google, page Doctolib). */
export function contributionsPresence(p: PresencePourScore): Contribution[] {
  const out: Contribution[] = [];
  const g = p.googleStatut ? SCORE_CONFIG.presence.google[p.googleStatut] : undefined;
  const placeId = p.googlePlaceIds?.[0];
  if (g && placeId) {
    out.push({
      libelle: "Fiche Google Maps", valeur: p.googleStatut === "confirmee" ? "confirmée" : "trouvée, à vérifier",
      points: g, url: `https://www.google.com/maps/place/?q=place_id:${encodeURIComponent(placeId)}`,
    });
  }
  if (p.doctolibUrl && p.doctolibInfos?.reservable !== false && (p.doctolibStatut === "confirme" || p.doctolibStatut === "trouve_auto")) {
    const confirme = p.doctolibStatut === "confirme";
    out.push({
      libelle: "Prise de rendez-vous Doctolib", valeur: confirme ? "lien confirmé" : "lien trouvé, à vérifier",
      points: confirme ? SCORE_CONFIG.presence.doctolib.reservable : SCORE_CONFIG.presence.doctolib.a_verifier, url: p.doctolibUrl,
    });
  }
  return out;
}

export interface SignalPourScore {
  type: TypeSignal;
  valeur: string;
  url: string;
  /** Date du relevé (validation) : un créneau Doctolib est périmé au bout de 14 jours. */
  le?: string | null;
}

/** Les créneaux bougent vite : au-delà, le relevé ne compte plus (il s'affiche « périmé »). */
export const JOURS_PEREMPTION_CRENEAU = 14;

export function releveCreneauPerime(le: string | null | undefined, maintenant: Date = new Date()): boolean {
  if (!le) return true;
  const t = new Date(le).getTime();
  return Number.isNaN(t) || maintenant.getTime() - t > JOURS_PEREMPTION_CRENEAU * 86_400_000;
}

export interface Contribution {
  libelle: string;
  valeur: string;
  points: number;
  url: string;
}

export interface Score {
  /** Entre 0 et 1. */
  probabilite: number;
  base: number;
  z: number;
  contributions: Contribution[];
  /** Critère éliminatoire : la probabilité vaut 0 et le motif s'affiche. */
  elimine: string | null;
  version: string;
  calibre: boolean;
}

const logit = (p: number) => Math.log(p / (1 - p));
const arrondi = (n: number, d = 2) => Math.round(n * 10 ** d) / 10 ** d;

/**
 * Le score d'un praticien, à partir de ses seuls signaux VALIDÉS. Fonction pure :
 * le détail renvoyé permet de refaire le calcul à la main (recette 5 du brief).
 */
export function calculerScore(
  praticien: { etat: string; vuAuDernierImport?: boolean } & PresencePourScore,
  signauxValides: SignalPourScore[],
  maintenant: Date = new Date(),
): Score {
  const base = arrondi(logit(SCORE_CONFIG.tauxDeBase));
  const commun = { base, version: SCORE_CONFIG.version, calibre: SCORE_CONFIG.calibre };
  const parType = new Map(signauxValides.map((s) => [s.type, s]));

  // Critères éliminatoires (brief, §5).
  let elimine: string | null = null;
  if (praticien.etat === "exclu") elimine = "Exclu du réseau";
  else if (parType.get("orientation")?.valeur === "esthetique_dominante") elimine = "Activité esthétique dominante";
  else if (praticien.vuAuDernierImport === false) elimine = "N'apparaît plus dans l'extraction RPPS (n'exerce plus ?)";
  if (elimine) return { ...commun, probabilite: 0, z: base, contributions: [], elimine };

  const contributions: Contribution[] = [];
  for (const s of signauxValides) {
    if (s.type === "creneau_doctolib" && releveCreneauPerime(s.le, maintenant)) continue;
    const points = SCORE_CONFIG.poids[s.type]?.[s.valeur];
    if (points === undefined || points === 0) continue;
    contributions.push({ libelle: SIGNAUX[s.type].libelle, valeur: VALEUR_LIBELLE[s.valeur] ?? s.valeur, points, url: s.url });
  }
  contributions.push(...contributionsPresence(praticien));
  contributions.sort((a, b) => b.points - a.points);
  const z = arrondi(base + contributions.reduce((t, c) => t + c.points, 0));
  return { ...commun, probabilite: 1 / (1 + Math.exp(-z)), z, contributions, elimine: null };
}
