// La grille de qualification commerciale d'AvisDoc.
//
// Elle vient de l'équipe commerciale d'AvisDoc, établie le 24/09/2026 et livrée en
// tableur. Nous l'appliquons telle qu'elle l'a écrite : ce sont eux qui vendent, et une
// grille que le commercial n'a pas faite est une grille qu'il ne suivra pas. Elle est
// faite pour être ajustée au fil des retours du terrain.
//
// Son principe : « éliminer d'abord les faux positifs, puis scorer la pertinence
// AvisDoc, la maturité prévention et l'accessibilité commerciale. »
//
//   Étape 1  filtres éliminatoires — aucun point : on passe ou l'on sort
//   Étape 2  pertinence AvisDoc ......... 60 points
//   Étape 3  maturité prévention ........ 25 points
//   Étape 4  accessibilité commerciale .. 15 points
//
// Sa phrase de conclusion tient lieu de règle : « Le score ne remplace pas le jugement
// commercial. La note de fiabilité des données doit rester visible séparément : une
// fiche à 80/100 fondée sur des données douteuses n'est pas un bon prospect. » C'est
// pourquoi la fiabilité vit dans son propre fichier et ne touche jamais à ce score.

export type Category = "pertinence" | "maturite" | "accessibilite";
export type CriterionId =
  | "exposition"
  | "population"
  | "peau"
  | "deploiement"
  | "politique_sst"
  | "actions_recentes"
  | "instances"
  | "interlocuteur"
  | "coordonnees"
  | "actualite_contact";

export const CATEGORIES: { id: Category; label: string; criteria: CriterionId[] }[] = [
  { id: "pertinence", label: "Pertinence AvisDoc", criteria: ["exposition", "population", "peau", "deploiement"] },
  { id: "maturite", label: "Maturité prévention", criteria: ["politique_sst", "actions_recentes", "instances"] },
  { id: "accessibilite", label: "Accessibilité commerciale", criteria: ["interlocuteur", "coordonnees", "actualite_contact"] },
];

export const CRITERIA: Record<CriterionId, { label: string; max: number; aide: string }> = {
  exposition: {
    label: "Exposition solaire professionnelle",
    max: 25,
    aide: "Part significative de salariés travaillant régulièrement en extérieur. Intensité, fréquence et nombre de salariés concernés.",
  },
  population: {
    label: "Taille de la population concernée",
    max: 15,
    aide: "Collaborateurs potentiellement bénéficiaires sur le site. Cible idéale de cent à mille — sans favoriser artificiellement les très grands groupes.",
  },
  peau: {
    label: "Adéquation santé / peau",
    max: 10,
    aide: "Activité ou population présentant un intérêt direct pour la prévention cutanée. Qualifie aussi des prospects sans forte exposition aux UV.",
  },
  deploiement: {
    label: "Potentiel de déploiement",
    max: 10,
    aide: "Plusieurs sites ou périmètre groupe accessible depuis l’interlocuteur. Ne compte que si le premier site est lui-même pertinent.",
  },
  politique_sst: {
    label: "Politique santé-sécurité structurée",
    max: 10,
    aide: "QHSE, MASE, ISO, prévention formalisée. Mesure la capacité de l’entreprise à intégrer une action de prévention de plus.",
  },
  actions_recentes: {
    label: "Actions récentes de prévention",
    max: 10,
    aide: "Semaines sécurité, QVCT, ateliers, interventions SPST, OPPBTP, MSA, Carsat. Un signal concret récent vaut mieux qu’une déclaration RSE générale.",
  },
  instances: {
    label: "Implication RH, CSE, santé au travail",
    max: 5,
    aide: "Instances ou fonctions susceptibles de porter, cofinancer ou relayer l’action.",
  },
  interlocuteur: {
    label: "Interlocuteur pertinent identifiable",
    max: 7,
    aide: "QHSE, médecin ou infirmier santé au travail, RH, RSE selon le contexte. La personne réellement compétente, pas un titre générique.",
  },
  coordonnees: {
    label: "Coordonnées directes",
    max: 5,
    aide: "E-mail nominatif, ligne directe ou standard coopératif. Une adresse vérifiée n’est pas une adresse déduite.",
  },
  actualite_contact: {
    label: "Actualité du contact",
    max: 3,
    aide: "Fonction confirmée récemment. Un ancien contact non confirmé ne rapporte aucun point.",
  },
};

/** Note d'un critère : null = non évalué (0 point). */
export interface CriterionScore {
  points: number | null;
  justification: string;
  source: string | null;
}
export type Score = Partial<Record<CriterionId, CriterionScore>>;

export const total = (s: Score): number =>
  Object.values(s).reduce((t, c) => t + (c?.points ?? 0), 0);

// ── Les seuils de décision, tels qu'AvisDoc les a posés ──────────────────
export const DECISIONS: { min: number; libelle: string; action: string }[] = [
  { min: 70, libelle: "Prioritaire", action: "Approfondir immédiatement : contact actuel, coordonnées, angle personnalisé, preuves récentes." },
  { min: 55, libelle: "À qualifier", action: "Approfondir si un critère stratégique est fort — UV, taille, prévention — ou si la recherche coûte peu." },
  { min: 40, libelle: "Piste secondaire", action: "Garder au vivier ; pas de recherche nominative longue sans signal supplémentaire." },
  { min: 0, libelle: "Faible priorité", action: "Ne pas approfondir, sauf information nouvelle ou demande particulière." },
];
/**
 * La décision se prend sur ce qui a PU être évalué, pas sur cent.
 *
 * Les seuils d'AvisDoc valent pour une fiche complète. Une fiche brute ne dispose que
 * des soixante points de l'étape 2 : Vogel TP, trente-sept sur soixante — six chantiers
 * de travaux publics sur dix —, sortait « faible priorité » et se retrouvait au fond du
 * vivier. On ramène donc la note à l'échelle de ce qui était mesurable.
 */
export const decision = (t: number, sur = 100) =>
  DECISIONS.find((d) => (sur > 0 ? (100 * t) / sur : 0) >= d.min)!;

/**
 * Les points maximum atteignables avec ce qui a été ÉVALUÉ.
 *
 * Un critère non qualifié — « on ne sait pas » — ne compte ni au numérateur ni au
 * dénominateur. Sans cela il pénaliserait comme un zéro, et une entreprise dont le
 * métier recouvre des situations trop variées pour qu'on tranche serait punie de notre
 * propre ignorance.
 */
export const maxEvalue = (s: Score): number =>
  (Object.keys(s) as CriterionId[]).reduce((t, id) => t + (s[id]?.points !== null && s[id] ? CRITERIA[id].max : 0), 0);

// ── Étape 2 : la pertinence, ce que le registre suffit à établir ─────────

export type SunLevel = "majorite_dehors" | "partie_dehors" | "interieur" | "non_evalue";
const EXPOSITION: Record<SunLevel, number | null> = {
  majorite_dehors: 25,
  partie_dehors: 12,
  interieur: 0,
  non_evalue: null,
};

export type AffinityLevel = "metier_de_la_peau" | "secteur_sante" | "aucune" | "non_evalue";
const PEAU: Record<AffinityLevel, number | null> = {
  metier_de_la_peau: 10, // esthétique, dermatologie, protection solaire : le sujet EST leur métier
  secteur_sante: 6, // santé ou bien-être au sens large : le sujet leur parle
  aucune: 0,
  non_evalue: null,
};

export function expositionScore(niveau: SunLevel, justification: string, source: string | null): CriterionScore {
  return {
    points: EXPOSITION[niveau],
    justification:
      justification ||
      (niveau === "non_evalue"
        ? "Exposition non qualifiée : ce métier recouvre des situations trop différentes pour trancher sans approfondir."
        : "Aucun salarié ne travaille en extérieur."),
    source,
  };
}

export function peauScore(niveau: AffinityLevel, justification: string, source: string | null): CriterionScore {
  return {
    points: PEAU[niveau],
    justification:
      justification ||
      (niveau === "non_evalue" ? "Lien avec la peau non qualifié : à trancher à l’approfondissement." : "Aucun lien direct avec la peau."),
    source,
  };
}

/**
 * La taille de la population concernée, sur quinze.
 *
 * « Cible idéale ≈ 100–1 000 ; ne pas éliminer mécaniquement <100 si pertinence métier
 * très forte » — et « valoriser la masse critique sans favoriser artificiellement les
 * très grands groupes ». Le barème monte donc jusqu'à mille puis cesse de monter : un
 * groupe de dix mille ne remplit pas dix fois mieux une journée de dépistage.
 */
const POPULATION: Record<string, { clair: string; points: number }> = {
  "53": { clair: "10 000 et plus", points: 13 },
  "52": { clair: "5 000 à 9 999", points: 13 },
  "51": { clair: "2 000 à 4 999", points: 14 },
  "42": { clair: "1 000 à 1 999", points: 15 },
  "41": { clair: "500 à 999", points: 15 },
  "32": { clair: "250 à 499", points: 14 },
  "31": { clair: "200 à 249", points: 13 },
  "22": { clair: "100 à 199", points: 12 },
  // Sous cent, on n'élimine pas : la pertinence métier peut compenser.
  "21": { clair: "50 à 99", points: 7 },
  "12": { clair: "20 à 49", points: 3 },
  "11": { clair: "10 à 19", points: 1 },
  "03": { clair: "6 à 9", points: 0 },
  "02": { clair: "3 à 5", points: 0 },
  "01": { clair: "1 à 2", points: 0 },
  "00": { clair: "0 salarié", points: 0 },
};

export function populationScore(band: string | null, duSite: boolean, annee: number | null): CriterionScore {
  const p = band ? POPULATION[band] : undefined;
  if (!p) return { points: null, justification: "Effectif non connu de l'annuaire officiel.", source: null };
  return {
    points: p.points,
    justification: `${p.clair} ${duSite ? "sur ce site" : "pour l’entreprise entière — effectif du site non publié"}${annee ? ` (donnée ${annee})` : ""}.`,
    source: null,
  };
}

/** Le potentiel de déploiement : plusieurs sites, donc plusieurs journées. */
export function deploiementScore(ouverts: number | null): CriterionScore {
  if (ouverts === null) return { points: null, justification: "Nombre d’établissements non connu.", source: null };
  const points = ouverts >= 20 ? 10 : ouverts >= 10 ? 8 : ouverts >= 5 ? 6 : ouverts >= 2 ? 3 : 0;
  return {
    points,
    justification: ouverts <= 1 ? "Établissement unique." : `${ouverts} établissements ouverts, annuaire officiel.`,
    source: null,
  };
}

// ── Étapes 3 et 4 : ce qui ne se découvre qu'en lisant ───────────────────
//
// Ces critères n'existent qu'après approfondissement : c'est le modèle qui les
// établit, avec une justification et une page à l'appui. Sans preuve, zéro point —
// « un ancien contact non confirmé ne doit pas rapporter de points ».

/** Un critère jugé sur pièces : sans source vérifiée, il ne vaut rien. */
export function surPreuve(
  id: CriterionId,
  trouve: boolean,
  niveau: number,
  justification: string,
  source: string | null,
): CriterionScore {
  const max = CRITERIA[id].max;
  if (!trouve || !source) {
    return { points: 0, justification: justification || "Rien de tel n’a été trouvé.", source: null };
  }
  return { points: Math.max(0, Math.min(max, Math.round(niveau))), justification, source };
}

/**
 * Ce que l'État publie déjà des démarches de l'entreprise.
 *
 * Un bilan gaz à effet de serre déposé, un label RGE, une aide de l'ADEME, un index
 * d'égalité professionnelle publié : ce ne sont pas des politiques santé-sécurité, et
 * il serait malhonnête de les compter comme telles. Mais une entreprise qui mesure,
 * déclare et se fait certifier a les habitudes et les fonctions pour porter une action
 * de prévention de plus. C'est un indice sérieux, pas une preuve : il plafonne à
 * quatre points sur dix, et l'approfondissement va chercher la vraie politique QHSE.
 */
export function signauxOfficiels(s: {
  ges: boolean; rge: boolean; ademe: boolean; achatsResponsables: boolean;
}): CriterionScore {
  const trouves = [
    s.ges && "bilan gaz à effet de serre publié",
    s.rge && "label RGE",
    s.ademe && "aide de l’ADEME",
    s.achatsResponsables && "engagement d’achats responsables",
  ].filter(Boolean) as string[];
  if (trouves.length === 0) {
    return { points: null, justification: "Aucune démarche publiée aux registres officiels — à vérifier sur leur site.", source: null };
  }
  return {
    points: Math.min(4, 1 + trouves.length),
    justification: `${trouves.join(", ")} — l’entreprise mesure et déclare, elle a les habitudes pour porter une action de prévention. Reste à vérifier sa politique santé-sécurité.`,
    source: null,
  };
}

/** L'index d'égalité professionnelle : une fonction RH qui suit et publie ses indicateurs. */
export function indexEgalite(publie: boolean): CriterionScore {
  return publie
    ? { points: 2, justification: "Index d’égalité professionnelle publié : une fonction RH structurée, qui suit ses indicateurs.", source: null }
    : { points: null, justification: "Relais internes non identifiés — à chercher sur leur site.", source: null };
}

/**
 * L'interlocuteur tiré du registre : un dirigeant nommé, avec sa fonction.
 *
 * Il vaut moins qu'un responsable QHSE trouvé sur le site — il décide, mais il faudra
 * qu'il transmette. Il vaut infiniment mieux que rien : sur cent entreprises de travaux
 * publics, quatre-vingt-une en ont un, et nous ne l'affichions pas.
 */
export function dirigeantScore(leader: { name: string; role: string | null } | null): CriterionScore {
  if (!leader) return { points: null, justification: "Aucun dirigeant publié au registre.", source: null };
  return {
    points: 3,
    justification: `${leader.name}${leader.role ? `, ${leader.role}` : ""} — dirigeant au registre officiel. Il décide, mais il faudra qu’il transmette au bon service.`,
    source: null,
  };
}

// ── Les secteurs, pour ranger les fiches ─────────────────────────────────
export const SECTORS = [
  { id: "btp", label: "Travaux publics et BTP" },
  { id: "espaces_verts", label: "Espaces verts" },
  { id: "agriculture", label: "Agriculture et viticulture" },
  { id: "collectivites", label: "Collectivités" },
  { id: "sante_beaute", label: "Santé et beauté" },
  { id: "autre", label: "Autre" },
] as const;
export type Sector = (typeof SECTORS)[number]["id"];
export const isSector = (v: string): v is Sector => SECTORS.some((s) => s.id === v);
