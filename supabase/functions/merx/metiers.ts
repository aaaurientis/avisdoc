// Ce que dit le code d'activité : le métier, et donc l'exposition.
//
// Le registre donne le code NAF de chaque entreprise. Un terrassier est dehors, une
// esthéticienne fait un métier de la peau : ce sont des faits, pas des jugements, et
// on n'a pas besoin d'un modèle pour les établir. C'est ce qui permet de noter deux
// cents fiches en une seconde là où il fallait deux minutes pour en deviner sept.
//
// Les correspondances vont du plus précis au plus général : « 43.91 » l'emporte sur
// « 43 ». Un code qu'on ne connaît pas ne reçoit RIEN — ni secteur, ni exposition —
// plutôt qu'une supposition : la fiche s'affiche « non évalué », et l'approfondissement
// tranchera. On ne devine pas.

import type { AffinityLevel, Sector, SunLevel } from "./scoring.ts";

export interface Metier {
  secteur: Sector;
  soleil: SunLevel;
  affinite: AffinityLevel;
  /** Ce que fait l'entreprise, en clair — l'annuaire ne rend que le code. */
  activite: string;
  /** Pourquoi c'est une cible, en une phrase, vraie pour tout le métier. */
  pourquoi: string;
}

const DEHORS: Pick<Metier, "soleil" | "affinite"> = { soleil: "majorite_dehors", affinite: "aucune" };
const PARTIE_DEHORS: Pick<Metier, "soleil" | "affinite"> = { soleil: "partie_dehors", affinite: "aucune" };
const PEAU: Pick<Metier, "soleil" | "affinite"> = { soleil: "interieur", affinite: "metier_de_la_peau" };
const SANTE: Pick<Metier, "soleil" | "affinite"> = { soleil: "interieur", affinite: "secteur_sante" };
/** À l'abri, et sans lien particulier avec le sujet : évalué, et évalué à zéro. */
const INTERIEUR: Pick<Metier, "soleil" | "affinite"> = { soleil: "interieur", affinite: "aucune" };

/** Préfixe de code NAF → métier. L'ordre importe peu : on retient le préfixe le plus long qui colle. */
const TABLE: Record<string, Metier> = {
  // ── Construction : gros œuvre et génie civil, dehors toute l'année ──
  "41.2": { secteur: "btp", ...DEHORS, activite: "Construction de bâtiments", pourquoi: "Leurs équipes sont sur les chantiers toute l’année, exposées au rayonnement solaire." },
  "42.1": { secteur: "btp", ...DEHORS, activite: "Construction de routes et de voies ferrées", pourquoi: "Travaux de voirie en plein air, sans ombre et sur revêtement réfléchissant." },
  "42.2": { secteur: "btp", ...DEHORS, activite: "Construction de réseaux", pourquoi: "Pose de réseaux en extérieur, sur tranchées ouvertes." },
  "42.9": { secteur: "btp", ...DEHORS, activite: "Autres ouvrages de génie civil", pourquoi: "Chantiers de génie civil à ciel ouvert." },
  "43.1": { secteur: "btp", ...DEHORS, activite: "Démolition et terrassement", pourquoi: "Terrassement et démolition en plein air, souvent l’été." },
  "43.91": { secteur: "btp", ...DEHORS, activite: "Travaux de couverture", pourquoi: "Les couvreurs travaillent sur les toits : l’exposition y est maximale, sans ombre possible." },
  "43.99": { secteur: "btp", ...DEHORS, activite: "Maçonnerie et travaux spécialisés", pourquoi: "Maçonnerie et structures : l’essentiel du temps de travail est en extérieur." },
  // Installation et finition : une partie du temps dehors, une partie en intérieur.
  "43.2": { secteur: "btp", ...PARTIE_DEHORS, activite: "Travaux d’installation", pourquoi: "Interventions partagées entre chantiers ouverts et bâtiments clos." },
  "43.3": { secteur: "btp", ...PARTIE_DEHORS, activite: "Travaux de finition", pourquoi: "Façades, peinture et vitrerie exposent une partie des équipes." },

  // ── Agriculture, viticulture, forêt ──
  "01.1": { secteur: "agriculture", ...DEHORS, activite: "Cultures non permanentes", pourquoi: "Travail aux champs du printemps à l’automne, aux heures les plus ensoleillées." },
  "01.2": { secteur: "agriculture", ...DEHORS, activite: "Cultures permanentes", pourquoi: "Vigne et vergers : saisons entières passées dehors, penchés vers le sol." },
  "01.3": { secteur: "agriculture", ...DEHORS, activite: "Multiplication de plantes", pourquoi: "Pépinières et plein champ : exposition continue en saison." },
  "01.4": { secteur: "agriculture", ...DEHORS, activite: "Élevage", pourquoi: "Pâtures, parcours et bâtiments ouverts : les équipes sont dehors." },
  "01.5": { secteur: "agriculture", ...DEHORS, activite: "Polyculture et élevage", pourquoi: "Travail aux champs et aux bâtiments, en extérieur l’essentiel de la saison." },
  "01.6": { secteur: "agriculture", ...DEHORS, activite: "Services de soutien à l’agriculture", pourquoi: "Prestataires agricoles : ils suivent les travaux de saison, toujours dehors." },
  "02.": { secteur: "agriculture", ...DEHORS, activite: "Sylviculture et exploitation forestière", pourquoi: "Bûcheronnage et travaux forestiers en plein air toute l’année." },

  // ── Vin et boissons : les caves coopératives ont leurs équipes aux vignes ──
  //
  // Le jeu de calibration d'AvisDoc l'a révélé : Wolfberger et Bestheim, deux
  // coopératives alsaciennes de cent cinquante personnes, sortaient sans aucun point.
  // Nous couvrions la culture de la vigne (01.2) mais pas la vinification — comme si
  // une cave coopérative n'employait personne dehors.
  "11.02": { secteur: "agriculture", ...PARTIE_DEHORS, activite: "Vinification", pourquoi: "Cave et vignoble : une partie des équipes suit les parcelles toute la saison." },
  "11.03": { secteur: "agriculture", ...PARTIE_DEHORS, activite: "Fabrication de cidre et de vins de fruits", pourquoi: "Vergers et pressoirs : les équipes alternent atelier et plein champ." },

  // ── Espaces verts ──
  "81.3": { secteur: "espaces_verts", ...DEHORS, activite: "Aménagement paysager", pourquoi: "Jardiniers et paysagistes : dehors du premier au dernier jour de la saison." },

  // ── Dehors sans être du bâtiment ──
  "03.": { secteur: "agriculture", ...DEHORS, activite: "Pêche et aquaculture", pourquoi: "Pont, bassins et estran : le travail est en plein air, avec la réverbération de l’eau." },
  "38.1": { secteur: "collectivites", ...DEHORS, activite: "Collecte des déchets", pourquoi: "Les équipes de collecte sont sur la voie publique toute la journée." },
  "49.41": { secteur: "autre", ...PARTIE_DEHORS, activite: "Transports routiers de fret", pourquoi: "Chargement, bâchage et attente sur quai exposent les conducteurs." },
  "71.12": { secteur: "btp", ...PARTIE_DEHORS, activite: "Ingénierie et études techniques", pourquoi: "Géomètres et conducteurs de travaux passent une part de leur temps sur les chantiers." },
  "80.10": { secteur: "autre", ...PARTIE_DEHORS, activite: "Sécurité privée", pourquoi: "Rondes et surveillance de sites se font en extérieur." },

  // ── Collectivités ──
  "84.1": { secteur: "collectivites", ...PARTIE_DEHORS, activite: "Administration publique", pourquoi: "Services techniques, voirie et espaces verts municipaux travaillent en extérieur." },

  // ── Santé et beauté : personne au soleil, mais le sujet est leur métier ──
  "96.02": { secteur: "sante_beaute", ...PEAU, activite: "Coiffure et soins de beauté", pourquoi: "Elles voient la peau et le cuir chevelu de leurs clients toute la journée : le dépistage parle directement à leur métier." },
  "96.04": { secteur: "sante_beaute", ...PEAU, activite: "Entretien corporel et spas", pourquoi: "Le soin de la peau est leur métier ; leurs clients viennent pour elle." },
  "47.73": { secteur: "sante_beaute", ...PEAU, activite: "Pharmacie", pourquoi: "Ils conseillent la protection solaire au comptoir : la prévention du mélanome prolonge ce qu’ils font déjà." },
  "47.74": { secteur: "sante_beaute", ...PEAU, activite: "Commerce d’articles médicaux", pourquoi: "Public et clientèle sensibles aux sujets de santé." },
  "47.75": { secteur: "sante_beaute", ...PEAU, activite: "Parfumerie et produits de beauté", pourquoi: "Leur clientèle vient pour la peau : le sujet leur est naturel." },
  "20.42": { secteur: "sante_beaute", ...PEAU, activite: "Fabrication de produits d’hygiène et de beauté", pourquoi: "La protection de la peau est l’objet même de leurs produits." },
  "86.": { secteur: "sante_beaute", ...SANTE, activite: "Activités pour la santé humaine", pourquoi: "Professionnels de santé : le dépistage leur parle, et ils orientent leurs patients." },
  "87.": { secteur: "sante_beaute", ...SANTE, activite: "Hébergement médico-social", pourquoi: "Établissements de soin : sujet de santé entendu, personnel nombreux." },
  "93.13": { secteur: "sante_beaute", ...SANTE, activite: "Centres de culture physique", pourquoi: "Clientèle attentive à sa santé, et pratiques sportives souvent en extérieur." },
  "21.": { secteur: "sante_beaute", ...SANTE, activite: "Industrie pharmaceutique", pourquoi: "Secteur de la santé : le sujet est cohérent avec leur métier et leur image." },
  "32.50": { secteur: "sante_beaute", ...SANTE, activite: "Fabrication de matériel médical", pourquoi: "Dispositifs médicaux : le dépistage relève de leur univers, et leurs équipes y sont sensibles." },
  "46.46": { secteur: "sante_beaute", ...SANTE, activite: "Commerce de gros pharmaceutique", pourquoi: "Distribution de produits de santé : sujet entendu, réseau de clients à sensibiliser." },
  "47.78A": { secteur: "sante_beaute", ...SANTE, activite: "Optique", pourquoi: "Santé visuelle : même logique de dépistage en proximité, clientèle réceptive." },
};


// ── Le repli par division : aucun métier ne sort à zéro faute de savoir ──
//
// La table ci-dessus dit finement ce qu'elle sait. Elle ne couvrait que dix-sept pour
// cent de la nomenclature : six cent dix métiers sur sept cent trente-deux obtenaient
// zéro point d'exposition — le critère le plus lourd de la grille — non parce qu'ils
// travaillent à l'abri, mais parce que personne n'avait répondu pour eux. Une carrière
// de pierres, une sablière, un distributeur d'électricité dont les lignards sont sur les
// pylônes toute l'année se retrouvaient au fond du vivier.
//
// Ce n'était pas une restriction : ces entreprises apparaissaient bien dans les
// résultats. C'était pire, d'une certaine façon — elles y étaient, mal notées, et
// personne n'allait les voir.
//
// Les quatre-vingt-huit divisions de la nomenclature sont donc toutes renseignées. Le
// préfixe le plus précis l'emporte : « 43.91 » avant « 43 ». Quand une division mêle des
// métiers très différents, on retient ce qui vaut pour le plus grand nombre de ses
// salariés, et l'approfondissement affine ensuite.

const DIVISIONS: Record<string, Metier> = {
  // Dehors toute l'année
  "01": { secteur: "agriculture", ...DEHORS, activite: "", pourquoi: "Travail aux champs et aux bâtiments d’élevage, du printemps à l’automne." },
  "02": { secteur: "agriculture", ...DEHORS, activite: "", pourquoi: "Bûcheronnage et travaux forestiers en plein air toute l’année." },
  "03": { secteur: "agriculture", ...DEHORS, activite: "", pourquoi: "Pont, bassins et estran : plein air, avec la réverbération de l’eau." },
  "07": { secteur: "autre", ...DEHORS, activite: "", pourquoi: "Exploitation minière : l’essentiel des équipes travaille à ciel ouvert." },
  "08": { secteur: "autre", ...DEHORS, activite: "", pourquoi: "Carrières, gravières et sablières : à ciel ouvert, sur surfaces réfléchissantes." },
  "09": { secteur: "autre", ...DEHORS, activite: "", pourquoi: "Prestataires de sites d’extraction : ils suivent les chantiers, dehors." },
  "38": { secteur: "collectivites", ...DEHORS, activite: "", pourquoi: "Collecte et tri : les équipes sont sur la voie publique ou en plate-forme ouverte." },
  "39": { secteur: "collectivites", ...DEHORS, activite: "", pourquoi: "Dépollution et assainissement de sites : interventions en extérieur." },
  "41": { secteur: "btp", ...DEHORS, activite: "", pourquoi: "Chantiers de bâtiment : les équipes y passent leurs journées." },
  "42": { secteur: "btp", ...DEHORS, activite: "", pourquoi: "Génie civil à ciel ouvert, sans ombre et sur revêtement réfléchissant." },
  "43": { secteur: "btp", ...DEHORS, activite: "", pourquoi: "Travaux spécialisés du bâtiment, l’essentiel du temps en extérieur." },
  "50": { secteur: "autre", ...DEHORS, activite: "", pourquoi: "Ponts et quais : plein air permanent, avec la réverbération de l’eau." },
  "53": { secteur: "autre", ...DEHORS, activite: "", pourquoi: "Distribution du courrier et des colis : les tournées se font dehors." },
  "81": { secteur: "espaces_verts", ...DEHORS, activite: "", pourquoi: "Aménagement paysager et entretien extérieur : dehors toute la saison." },

  // Une partie du temps dehors
  "05": { secteur: "autre", ...PARTIE_DEHORS, activite: "", pourquoi: "Découvertes et installations de surface exposent une partie des équipes." },
  "06": { secteur: "autre", ...PARTIE_DEHORS, activite: "", pourquoi: "Installations de surface et maintenance extérieure." },
  "11": { secteur: "agriculture", ...PARTIE_DEHORS, activite: "", pourquoi: "Cave et vignoble : une partie des équipes suit les parcelles." },
  "16": { secteur: "autre", ...PARTIE_DEHORS, activite: "", pourquoi: "Parcs à grumes et scieries ouvertes : une partie du travail est en extérieur." },
  "19": { secteur: "autre", ...PARTIE_DEHORS, activite: "", pourquoi: "Unités de raffinage à l’air libre : rondes et maintenance en extérieur." },
  "20": { secteur: "autre", ...PARTIE_DEHORS, activite: "", pourquoi: "Sites industriels étendus : techniciens et maintenance circulent dehors." },
  "23": { secteur: "btp", ...PARTIE_DEHORS, activite: "", pourquoi: "Centrales à béton et carrières : une partie des équipes est en extérieur." },
  "33": { secteur: "autre", ...PARTIE_DEHORS, activite: "", pourquoi: "Interventions chez le client : chantiers, toitures, sites industriels ouverts." },
  "35": { secteur: "autre", ...PARTIE_DEHORS, activite: "", pourquoi: "Réseaux, postes et lignes : les équipes d’exploitation sont en extérieur." },
  "36": { secteur: "collectivites", ...PARTIE_DEHORS, activite: "", pourquoi: "Réseaux d’eau et captages : interventions sur la voie publique." },
  "37": { secteur: "collectivites", ...PARTIE_DEHORS, activite: "", pourquoi: "Réseaux d’assainissement : interventions en extérieur." },
  "45": { secteur: "autre", ...PARTIE_DEHORS, activite: "", pourquoi: "Dépannage, convoyage et essais exposent une partie des équipes." },
  "49": { secteur: "autre", ...PARTIE_DEHORS, activite: "", pourquoi: "Chargement, bâchage et attente sur quai exposent les conducteurs." },
  "51": { secteur: "autre", ...PARTIE_DEHORS, activite: "", pourquoi: "Pistes et aires de trafic : les équipes au sol y passent leurs journées." },
  "52": { secteur: "autre", ...PARTIE_DEHORS, activite: "", pourquoi: "Quais, docks et aires de manutention, à ciel ouvert." },
  "61": { secteur: "autre", ...PARTIE_DEHORS, activite: "", pourquoi: "Techniciens réseau : pylônes, façades et tranchées." },
  "71": { secteur: "btp", ...PARTIE_DEHORS, activite: "", pourquoi: "Géomètres et conducteurs de travaux passent une part de leur temps sur les chantiers." },
  "77": { secteur: "btp", ...PARTIE_DEHORS, activite: "", pourquoi: "Livraison et maintenance de matériel sur les chantiers." },
  "78": { secteur: "autre", ...PARTIE_DEHORS, activite: "", pourquoi: "Les intérimaires placés travaillent souvent sur des chantiers ou en extérieur." },
  "80": { secteur: "autre", ...PARTIE_DEHORS, activite: "", pourquoi: "Rondes et surveillance de sites se font en extérieur." },
  "84": { secteur: "collectivites", ...PARTIE_DEHORS, activite: "", pourquoi: "Services techniques, voirie et espaces verts travaillent en extérieur." },
  "85": { secteur: "autre", ...PARTIE_DEHORS, activite: "", pourquoi: "Surveillance des cours, éducation physique et sorties : une partie du temps dehors." },
  "93": { secteur: "autre", ...PARTIE_DEHORS, activite: "", pourquoi: "Moniteurs et équipes d’installations sportives de plein air." },

  // À l'abri, mais le sujet touche leur métier
  "21": { secteur: "sante_beaute", ...SANTE, activite: "", pourquoi: "Secteur de la santé : le sujet est cohérent avec leur métier et leur image." },
  "75": { secteur: "sante_beaute", ...SANTE, activite: "", pourquoi: "Professionnels de santé animale, en partie en extérieur, sensibles à la prévention." },
  "86": { secteur: "sante_beaute", ...SANTE, activite: "", pourquoi: "Professionnels de santé : le dépistage leur parle, et ils orientent leurs patients." },
  "87": { secteur: "sante_beaute", ...SANTE, activite: "", pourquoi: "Établissements de soin : sujet entendu, personnel nombreux." },
  "88": { secteur: "sante_beaute", ...SANTE, activite: "", pourquoi: "Action sociale : public suivi et personnel sensible aux sujets de santé." },
  "96": { secteur: "sante_beaute", ...PEAU, activite: "", pourquoi: "Services à la personne tournés vers le soin du corps et de la peau." },

  // À l'abri, sans lien particulier avec le sujet
  "10": { secteur: "autre", ...INTERIEUR, activite: "", pourquoi: "" },
  "12": { secteur: "autre", ...INTERIEUR, activite: "", pourquoi: "" },
  "13": { secteur: "autre", ...INTERIEUR, activite: "", pourquoi: "" },
  "14": { secteur: "autre", ...INTERIEUR, activite: "", pourquoi: "" },
  "15": { secteur: "autre", ...INTERIEUR, activite: "", pourquoi: "" },
  "17": { secteur: "autre", ...INTERIEUR, activite: "", pourquoi: "" },
  "18": { secteur: "autre", ...INTERIEUR, activite: "", pourquoi: "" },
  "22": { secteur: "autre", ...INTERIEUR, activite: "", pourquoi: "" },
  "24": { secteur: "autre", ...INTERIEUR, activite: "", pourquoi: "" },
  "25": { secteur: "autre", ...INTERIEUR, activite: "", pourquoi: "" },
  "26": { secteur: "autre", ...INTERIEUR, activite: "", pourquoi: "" },
  "27": { secteur: "autre", ...INTERIEUR, activite: "", pourquoi: "" },
  "28": { secteur: "autre", ...INTERIEUR, activite: "", pourquoi: "" },
  "29": { secteur: "autre", ...INTERIEUR, activite: "", pourquoi: "" },
  "30": { secteur: "autre", ...INTERIEUR, activite: "", pourquoi: "" },
  "31": { secteur: "autre", ...INTERIEUR, activite: "", pourquoi: "" },
  "32": { secteur: "autre", ...INTERIEUR, activite: "", pourquoi: "" },
  "46": { secteur: "autre", ...INTERIEUR, activite: "", pourquoi: "" },
  "47": { secteur: "autre", ...INTERIEUR, activite: "", pourquoi: "" },
  "55": { secteur: "autre", ...INTERIEUR, activite: "", pourquoi: "" },
  "56": { secteur: "autre", ...INTERIEUR, activite: "", pourquoi: "" },
  "58": { secteur: "autre", ...INTERIEUR, activite: "", pourquoi: "" },
  "59": { secteur: "autre", ...INTERIEUR, activite: "", pourquoi: "" },
  "60": { secteur: "autre", ...INTERIEUR, activite: "", pourquoi: "" },
  "62": { secteur: "autre", ...INTERIEUR, activite: "", pourquoi: "" },
  "63": { secteur: "autre", ...INTERIEUR, activite: "", pourquoi: "" },
  "64": { secteur: "autre", ...INTERIEUR, activite: "", pourquoi: "" },
  "65": { secteur: "autre", ...INTERIEUR, activite: "", pourquoi: "" },
  "66": { secteur: "autre", ...INTERIEUR, activite: "", pourquoi: "" },
  "68": { secteur: "autre", ...INTERIEUR, activite: "", pourquoi: "" },
  "69": { secteur: "autre", ...INTERIEUR, activite: "", pourquoi: "" },
  "70": { secteur: "autre", ...INTERIEUR, activite: "", pourquoi: "" },
  "72": { secteur: "autre", ...INTERIEUR, activite: "", pourquoi: "" },
  "73": { secteur: "autre", ...INTERIEUR, activite: "", pourquoi: "" },
  "74": { secteur: "autre", ...INTERIEUR, activite: "", pourquoi: "" },
  "79": { secteur: "autre", ...INTERIEUR, activite: "", pourquoi: "" },
  "82": { secteur: "autre", ...INTERIEUR, activite: "", pourquoi: "" },
  "90": { secteur: "autre", ...INTERIEUR, activite: "", pourquoi: "" },
  "91": { secteur: "autre", ...INTERIEUR, activite: "", pourquoi: "" },
  "92": { secteur: "autre", ...INTERIEUR, activite: "", pourquoi: "" },
  "94": { secteur: "autre", ...INTERIEUR, activite: "", pourquoi: "" },
  "95": { secteur: "autre", ...INTERIEUR, activite: "", pourquoi: "" },
  "97": { secteur: "autre", ...INTERIEUR, activite: "", pourquoi: "" },
  "98": { secteur: "autre", ...INTERIEUR, activite: "", pourquoi: "" },
  "99": { secteur: "autre", ...INTERIEUR, activite: "", pourquoi: "" },
};

/**
 * Le métier correspondant à un code d'activité. Toujours renseigné dès que le code
 * l'est : la table fine d'abord, la division ensuite. On ne rend « rien » que pour un
 * code vide ou hors nomenclature.
 */
export function metierDe(naf: string | null): Metier | null {
  if (!naf) return null;
  const code = naf.trim().toUpperCase();
  // Du préfixe le plus long au plus court : « 43.91 » avant « 43.9 » avant « 43. ».
  const prefixes = Object.keys(TABLE).sort((a, b) => b.length - a.length);
  for (const p of prefixes) if (code.startsWith(p)) return TABLE[p];
  return DIVISIONS[code.slice(0, 2)] ?? null;
}

// ── Le secteur : la famille, au-dessus du métier ─────────────────────────
//
// « Secteur » et « activité » ne disent pas la même chose : la construction de
// routes et la couverture sont deux métiers d'un même secteur, le bâtiment. La
// liste ci-dessous couvre TOUTE la nomenclature, ce qui garantit qu'aucune fiche
// n'arrive sans secteur — même une activité qu'on n'a jamais rencontrée.
//
// Les divisions viennent de la nomenclature officielle : les deux premiers
// chiffres du code d'activité suffisent à situer l'entreprise.

const SECTIONS: { de: number; a: number; label: string }[] = [
  { de: 1, a: 3, label: "Agriculture et pêche" },
  { de: 5, a: 9, label: "Industries extractives" },
  { de: 10, a: 33, label: "Industrie" },
  { de: 35, a: 35, label: "Énergie" },
  { de: 36, a: 39, label: "Eau et déchets" },
  { de: 41, a: 43, label: "Construction" },
  { de: 45, a: 47, label: "Commerce" },
  { de: 49, a: 53, label: "Transport et logistique" },
  { de: 55, a: 56, label: "Hôtellerie et restauration" },
  { de: 58, a: 63, label: "Information et communication" },
  { de: 64, a: 66, label: "Banque et assurance" },
  { de: 68, a: 68, label: "Immobilier" },
  { de: 69, a: 75, label: "Services aux entreprises" },
  { de: 77, a: 82, label: "Services administratifs et de soutien" },
  { de: 84, a: 84, label: "Administration publique" },
  { de: 85, a: 85, label: "Enseignement" },
  { de: 86, a: 88, label: "Santé et action sociale" },
  { de: 90, a: 93, label: "Arts, sport et loisirs" },
  { de: 94, a: 96, label: "Services à la personne" },
  { de: 97, a: 99, label: "Autres" },
];

/** Le secteur d'une entreprise, déduit de son code d'activité. Toujours renseigné. */
export function secteurDe(naf: string | null): string {
  const division = Number.parseInt((naf ?? "").trim().slice(0, 2), 10);
  if (Number.isNaN(division)) return "Non précisé";
  return SECTIONS.find((s) => division >= s.de && division <= s.a)?.label ?? "Non précisé";
}
