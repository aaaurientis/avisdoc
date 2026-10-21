// Registre officiel des entreprises : annuaire public de l'État (données Sirene et RNE), gratuit et sans clé.
// Ce n'est pas une IA : c'est la source du fait légal (identité, activité, effectif, adresse, dirigeants).
// Décision d'Olivier du 21/09/2026 : on reste sur le gratuit ; Pappers (payant, déjà en place dans le Hub)
// n'est appelé qu'en dernier recours, sur action explicite.

const BASE = Deno.env.get("ANNUAIRE_ENTREPRISES_URL") ?? "https://recherche-entreprises.api.gouv.fr";
const CANDIDATES = 5; // entreprises proposées au modèle, qui choisit la bonne (ou aucune)
const TIMEOUT_MS = 8_000; // l'annuaire ne doit pas manger le temps d'un approfondissement
const RETRIES_429 = 2; // l'API limite le nombre d'appels par seconde : on patiente puis on réessaie

// Tranches d'effectif salarié de l'INSEE. La valeur est celle du 31/12 de l'année N-2 : elle a donc au moins
// deux ans. À lire en clair : sans ce tableau, le code « 42 » se lit « 42 salariés » au lieu de « 1 000 à 1 999 ».
export const HEADCOUNT_BANDS: { code: string; label: string }[] = [
  { code: "NN", label: "Non employeuse" },
  { code: "00", label: "0 salarié" },
  { code: "01", label: "1 ou 2 salariés" },
  { code: "02", label: "3 à 5 salariés" },
  { code: "03", label: "6 à 9 salariés" },
  { code: "11", label: "10 à 19 salariés" },
  { code: "12", label: "20 à 49 salariés" },
  { code: "21", label: "50 à 99 salariés" },
  { code: "22", label: "100 à 199 salariés" },
  { code: "31", label: "200 à 249 salariés" },
  { code: "32", label: "250 à 499 salariés" },
  { code: "41", label: "500 à 999 salariés" },
  { code: "42", label: "1 000 à 1 999 salariés" },
  { code: "51", label: "2 000 à 4 999 salariés" },
  { code: "52", label: "5 000 à 9 999 salariés" },
  { code: "53", label: "10 000 salariés et plus" },
];

const BAND_BY_CODE = new Map(HEADCOUNT_BANDS.map((b) => [b.code, b.label]));
export const headcountLabel = (code: string | null): string | null => (code && BAND_BY_CODE.get(code)) || null;

export interface Establishment {
  siret: string;
  address: string | null;
  postalCode: string | null;
  city: string | null;
  department: string | null;
  /**
   * L'établissement est-il encore ouvert ?
   *
   * L'annuaire répond au filtre « département 67 » avec les établissements FERMÉS
   * autant qu'avec les ouverts — le paramètre d'état ne vaut que pour l'entreprise.
   * BB GR ressortait ainsi comme prospect strasbourgeois par un établissement fermé
   * en octobre 2000. Sans ce champ, rien ne distingue les deux.
   */
  active: boolean;
  /**
   * L'établissement emploie-t-il quelqu'un ?
   *
   * Le registre le dit — « caractere_employeur » — et nous ne le lisions pas. Une
   * holding comme GLOBE déclare mille cinq cents salariés au niveau du groupe et son
   * unique établissement n'en emploie aucun : nous affichions « 1 000 à 1 999
   * salariés » sur un siège vide, avec vingt-sept millions de chiffre d'affaires en
   * face. Dix-huit mille euros par salarié : personne ne peut y croire.
   */
  employeur: boolean;
  headcountBand: string | null;
  headcountYear: number | null;
  isHeadOffice: boolean;
}

export interface Company {
  siren: string;
  name: string;
  /** Enseignes, nom commercial, sigle : c'est souvent sous eux que Google connaît l'entreprise. */
  autresNoms: string[];
  activityCode: string | null; // code NAF ; l'annuaire ne renvoie pas son libellé
  headcountBand: string | null; // effectif de l'entreprise entière
  headcountYear: number | null; // année de la donnée (valeur au 31/12 de N-2)
  category: string | null; // PME, ETI, GE
  openEstablishments: number | null;
  headOffice: Establishment;
  leaders: { name: string; role: string | null }[]; // nom et qualité seulement (minimisation RGPD)
  /**
   * Ce que l'État publie déjà sur les démarches de l'entreprise.
   *
   * Ces indicateurs arrivent dans la même réponse que tout le reste, gratuitement, et
   * nous les jetions : sur cent entreprises de travaux publics en Gironde, soixante-
   * quatre en portent au moins un. Les faire chercher par un modèle à douze centimes
   * la fiche revenait à payer pour ce qu'on avait déjà.
   */
  signals: {
    /** Bilan gaz à effet de serre publié — l'entreprise mesure et déclare. */
    ges: boolean;
    /** Reconnu Garant de l'Environnement. */
    rge: boolean;
    /** A reçu une aide de l'ADEME. */
    ademe: boolean;
    /** Index d'égalité professionnelle publié — une fonction RH qui suit ses indicateurs. */
    egalite: boolean;
    /** Engagement d'achats responsables. */
    achatsResponsables: boolean;
    /** Économie sociale et solidaire. */
    ess: boolean;
    /** Convention collective renseignée : elle dit le métier réel des salariés. */
    conventionConnue: boolean;
  };
  /**
   * Tout le reste de ce que l'État publie, conservé tel quel.
   *
   * Le chiffre d'affaires de Colas France — quatre milliards sept — arrivait dans la
   * même réponse que son nom, et nous le jetions. L'ancienneté, la catégorie, le SIRET,
   * les conventions collectives aussi. On ne jette plus rien de ce qu'on a reçu : ce
   * qu'on ne sait pas encore afficher, on le garde.
   */
  registre: {
    /** Chiffre d'affaires et résultat net, par exercice. */
    finances: Record<string, { ca?: number; resultat_net?: number }> | null;
    dateCreation: string | null;
    /** PME, ETI ou GE, au sens de l'INSEE. */
    categorie: string | null;
    siret: string | null;
    /** « latitude,longitude » du siège. */
    coordonnees: string | null;
    /** Conventions collectives appliquées : elles disent le métier réel des salariés. */
    idcc: string[];
    tva: string | null;
    natureJuridique: string | null;
    etablissements: number | null;
  };
}

/* eslint-disable @typescript-eslint/no-explicit-any */

/** Département d'une commune à partir de son code INSEE (outre-mer : trois caractères). */
const departmentOf = (commune: string | null | undefined) =>
  commune ? (commune.startsWith("97") ? commune.slice(0, 3) : commune.slice(0, 2)) : null;

const year = (value: string | null | undefined) => (value ? Number(value) : null);

function toEstablishment(e: any): Establishment {
  return {
    siret: e.siret,
    address: e.adresse ?? null,
    postalCode: e.code_postal ?? null,
    city: e.libelle_commune ?? null,
    department: e.departement ?? departmentOf(e.commune),
    active: e.etat_administratif !== "F",
    // « N » veut dire : cet établissement n'emploie personne. L'absence d'information
    // ne vaut pas refus : seul un « N » explicite compte.
    employeur: e.caractere_employeur !== "N",
    headcountBand: e.tranche_effectif_salarie ?? null,
    headcountYear: year(e.annee_tranche_effectif_salarie),
    isHeadOffice: Boolean(e.est_siege),
  };
}

export function toCompany(r: any): Company {
  return {
    siren: r.siren,
    name: r.nom_complet,
    autresNoms: [...(r.siege?.liste_enseignes ?? []), r.siege?.nom_commercial, r.sigle].filter((n: unknown): n is string => typeof n === "string" && n.trim().length > 1),
    activityCode: r.activite_principale ?? null,
    headcountBand: r.tranche_effectif_salarie ?? null,
    headcountYear: year(r.annee_tranche_effectif_salarie),
    category: r.categorie_entreprise ?? null,
    openEstablishments: r.nombre_etablissements_ouverts ?? null,
    headOffice: toEstablishment({ ...r.siege, est_siege: true }),
    leaders: (r.dirigeants ?? [])
      // L'annuaire range aussi les commissaires aux comptes parmi les dirigeants : ce ne sont pas des interlocuteurs.
      .filter((d: any) => !/commissaire aux comptes/i.test(d.qualite ?? ""))
      .map((d: any) => ({ name: (d.denomination ?? [d.prenoms, d.nom].filter(Boolean).join(" ")).trim(), role: d.qualite ?? null }))
      .filter((d: any) => d.name),
    signals: {
      ges: Boolean(r.complements?.bilan_ges_renseigne),
      rge: Boolean(r.complements?.est_rge),
      ademe: Boolean(r.complements?.a_aide_ademe),
      egalite: Boolean(r.complements?.egapro_renseignee),
      achatsResponsables: Boolean(r.complements?.est_achats_responsables),
      ess: Boolean(r.complements?.est_ess),
      conventionConnue: Boolean(r.complements?.convention_collective_renseignee),
    },
    registre: {
      finances: r.finances ?? null,
      dateCreation: r.date_creation ?? null,
      categorie: r.categorie_entreprise ?? null,
      siret: r.siege?.siret ?? null,
      coordonnees: r.siege?.coordonnees ?? null,
      idcc: r.siege?.liste_idcc ?? r.complements?.liste_idcc ?? [],
      tva: (r.tva ?? [])[0] ?? null,
      natureJuridique: r.nature_juridique ?? null,
      etablissements: r.nombre_etablissements ?? null,
    },
  };
}

/** Entreprises actives dont le nom (et la ville) correspondent, les plus probables d'abord. */
export async function lookup(query: string): Promise<Company[]> {
  const params = new URLSearchParams({ q: query, etat_administratif: "A", per_page: String(CANDIDATES) });
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(`${BASE}/search?${params}`, { signal: AbortSignal.timeout(TIMEOUT_MS) });
    if (res.ok) return ((await res.json()) as { results: any[] }).results.map(toCompany);
    if (res.status !== 429 || attempt >= RETRIES_429) throw new Error(`Annuaire des entreprises : réponse HTTP ${res.status}.`);
    await new Promise((r) => setTimeout(r, 1000 * (Number(res.headers.get("retry-after")) || 1)));
  }
}

// ── Recherche de masse : le registre plutôt que le web ───────────────────────
//
// Chercher des noms d'entreprises sur le web avec un modèle, c'était deux minutes
// pour en rendre sept. Le registre en rend deux cents en une seconde, exactes, avec
// leur effectif et l'adresse de leurs établissements. Le web reste utile pour ce que
// le registre ne dit pas — un chantier en cours, une certification — mais il ne doit
// plus servir à établir une liste.

/** Tranches INSEE, de la plus petite à la plus grande : sert à filtrer « plus de N salariés ». */
const BANDS_ASC = ["NN", "00", "01", "02", "03", "11", "12", "21", "22", "31", "32", "41", "42", "51", "52", "53"];
/** Le plancher de chaque tranche, pour traduire « plus de 50 salariés ». */
const BAND_FLOOR: Record<string, number> = {
  NN: 0, "00": 0, "01": 1, "02": 3, "03": 6, "11": 10, "12": 20,
  "21": 50, "22": 100, "31": 200, "32": 250, "41": 500, "42": 1000,
  "51": 2000, "52": 5000, "53": 10000,
};

/** Les tranches qui atteignent au moins cet effectif. */
export const bandsFrom = (minimum: number): string[] =>
  BANDS_ASC.filter((b) => BAND_FLOOR[b] >= minimum);

export interface Criteria {
  /** Section NAF (F = construction, A = agriculture…) — large. */
  section?: string | null;
  /** Codes NAF précis (81.30Z, 96.02B…) — étroit, prioritaire sur la section. */
  nafCodes?: string[] | null;
  departments: string[];
  /** Effectif minimum de l'entreprise, en salariés. */
  minHeadcount?: number | null;
  /** Effectif maximum (« de 20 à 249 »), en salariés. */
  maxHeadcount?: number | null;
}

/** Ce que rend une recherche : les entreprises retenues, et celles qui ne sont plus là. */
export interface SearchResult {
  found: Found[];
  /** Entreprises écartées faute d'un établissement encore ouvert dans la zone. */
  ignores: number;
  /**
   * Ce que la zone compte vraiment, et ce que le filtre d'effectif en laisse passer.
   *
   * L'annuaire ne publie l'effectif que d'une entreprise sur cinq cents dans la
   * viticulture, une sur cent dans la beauté. Demander « plus de dix salariés »
   * écartait donc mille cinq cent soixante-quinze domaines alsaciens sur mille cinq
   * cent soixante-dix-huit — non parce qu'ils sont petits, mais parce qu'on ne sait
   * pas. Merx doit pouvoir le dire au commercial plutôt que de rendre cinq fiches
   * après deux minutes d'attente.
   */
  totalZone: number;
  /** Combien répondent au critère d'effectif tel qu'il a été demandé. */
  totalQualifiees: number;
  /** Combien de fiches rendues n'ont pas d'effectif publié. */
  sansEffectifPublie: number;
}

/** Une entreprise trouvée par le registre, avec ses établissements OUVERTS dans la zone. */
export interface Found extends Company {
  /** Les établissements qui répondent au filtre : c'est là que le commercial ira. */
  localSites: Establishment[];
}

const PER_PAGE = 25; // maximum autorisé par l'annuaire

/**
 * Les entreprises du registre qui répondent aux critères, établissements locaux compris.
 *
 * On pagine jusqu'à `max` : au-delà, le commercial ne traite plus, et chaque page est
 * un appel de plus. L'annuaire limite le débit, d'où l'attente entre deux pages.
 */
/**
 * `dejaConnues` : les SIREN déjà dans les fiches. Elles sont sautées SANS compter, et l'on
 * continue de tourner les pages : « les 100 suivantes » va vraiment plus loin dans la
 * liste au lieu de relire le même début (audit du 19/10). Quarante pages au plus.
 */
export async function searchByCriteria(c: Criteria, max = 100, dejaConnues: Set<string> = new Set()): Promise<SearchResult> {
  const found: Found[] = [];
  let ignores = 0;
  let totalZone = 0;
  let totalQualifiees = 0;

  /** Les paramètres de l'annuaire, avec ou sans le filtre d'effectif. */
  const params = (page: number, avecEffectif: boolean) => {
    const p = new URLSearchParams({ etat_administratif: "A", per_page: String(PER_PAGE), page: String(page) });
    if (c.nafCodes?.length) p.set("activite_principale", c.nafCodes.join(","));
    else if (c.section) p.set("section_activite_principale", c.section);
    if (c.departments.length) p.set("departement", c.departments.join(","));
    if (avecEffectif && (c.minHeadcount || c.maxHeadcount)) {
      const bands = bandsFrom(c.minHeadcount ?? 0).filter((b) => !c.maxHeadcount || BAND_FLOOR[b] <= c.maxHeadcount);
      if (bands.length) p.set("tranche_effectif_salarie", bands.join(","));
    }
    return p;
  };

  const interroger = async (p: URLSearchParams): Promise<any> => {
    for (let attempt = 0; ; attempt++) {
      try {
        const res = await fetch(`${BASE}/search?${p}`, { signal: AbortSignal.timeout(TIMEOUT_MS) });
        if (res.status === 429 && attempt < RETRIES_429) {
          await new Promise((r) => setTimeout(r, 1_100));
          continue;
        }
        if (!res.ok) return null;
        return await res.json();
      } catch {
        return null;
      }
    }
  };

  const vus = new Set<string>();
  /** Retenir une page de résultats. Rend false quand le quota est atteint. */
  /** `tailleInconnueSeulement` : la seconde passe, sans filtre d'effectif, ne fait entrer QUE
   *  les entreprises dont l'annuaire ne publie pas la taille — jamais une plus petite. */
  const retenir = (results: any[], tailleInconnueSeulement = false): boolean => {
    for (const r of results) {
      if (vus.has(r.siren) || dejaConnues.has(String(r.siren))) continue;
      const company = toCompany(r);
      if (tailleInconnueSeulement && company.headcountBand && company.headcountBand !== "NN") continue;
      vus.add(r.siren);
      const tous = ((r.matching_etablissements ?? []) as any[]).map(toEstablishment);
      const ouverts = tous.filter((e) => e.active && (!c.departments.length || (e.department !== null && c.departments.includes(e.department))));
      // Une zone demandée : il faut un établissement ouvert DANS la zone. Sans lui, on
      // n'affiche pas le siège d'ailleurs à sa place (audit du 19/10).
      if (c.departments.length && ouverts.length === 0) {
        ignores++;
        continue;
      }
      found.push({ ...company, localSites: ouverts });
      if (found.length >= max) return false;
    }
    return true;
  };

  // D'abord celles qui répondent strictement à la demande.
  for (let page = 1; page <= Math.min(40, Math.ceil((max + dejaConnues.size) / PER_PAGE)); page++) {
    const data = await interroger(params(page, true));
    if (page === 1) totalQualifiees = data?.total_results ?? 0;
    if (!data?.results?.length) break;
    if (!retenir(data.results)) break;
    if (page >= (data.total_pages ?? 1)) break;
  }

  // Puis, si le filtre d'effectif a presque tout écarté, celles dont on ignore la
  // taille. Elles ne sont pas plus petites : l'annuaire ne les renseigne pas. Le
  // commercial préfère cinq cents fiches à qualifier que cinq fiches et deux minutes
  // d'attente — et il saura d'où vient la différence.
  if ((c.minHeadcount || c.maxHeadcount) && found.length < max) {
    for (let page = 1; page <= Math.min(40, Math.ceil((max + dejaConnues.size) / PER_PAGE)); page++) {
      const data = await interroger(params(page, false));
      if (page === 1) totalZone = data?.total_results ?? 0;
      if (!data?.results?.length) break;
      if (!retenir(data.results, true)) break;
      if (page >= (data.total_pages ?? 1)) break;
    }
  } else {
    totalZone = totalQualifiees;
  }

  const sansEffectifPublie = found.filter((f) => !f.headcountBand || f.headcountBand === "NN").length;
  return { found, ignores, totalZone: Math.max(totalZone, totalQualifiees), totalQualifiees, sansEffectifPublie };
}


// ── Les agences d'une société nommée ─────────────────────────────────────────
//
// « Les agences Colas » n'est pas un métier : chercher les travaux publics de la zone
// rendait Vinci (Olivier, 19/10). Ici, on ne cherche QUE la société nommée.
//
// L'annuaire ne liste pas tous les établissements d'une entreprise d'un coup (dix au
// plus par réponse, et Colas France en a 431). On l'interroge donc département par
// département : il rend, pour chaque société du nom, ses établissements de ce
// département.

/** Les départements de France, outre-mer compris. */
export const TOUS_DEPARTEMENTS: string[] = [
  ...Array.from({ length: 95 }, (_, i) => String(i + 1).padStart(2, "0")).filter((d) => d !== "20"),
  "2A", "2B", "971", "972", "973", "974", "976",
];

/** Les mots d'un nom : sans accents ni ligatures, sigles à points recollés (S.N.C.F. → sncf). */
const motsDe = (t: string) => {
  let x = t.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/œ/gi, "oe").replace(/æ/gi, "ae").toLowerCase();
  // « s.n.c.f. » → « sncf » : on recolle les lettres isolées séparées par des points.
  for (let i = 0; i < 6; i++) x = x.replace(/\b([a-z0-9])\.([a-z0-9])\b/g, "$1$2");
  return x.split(/[^a-z0-9]+/).filter(Boolean);
};

/** Ce qu'on ne demande jamais de retrouver dans le nom : la forme juridique, « groupe ». */
const FORMES = new Set(["sa", "sas", "sasu", "sarl", "eurl", "snc", "sca", "sci", "scop", "se", "groupe", "group", "ste", "societe"]);

/**
 * Le nom demandé est-il bien celui de cette société ? Il doit OUVRIR son nom (ou être son
 * sigle) : « Vinci » prend VINCI CONSTRUCTION FRANCE, mais pas COMMUNE D'ORANGE pour
 * « Orange » ni HOTEL DE LA POSTE pour « La Poste » (tests sur l'annuaire réel, 19/10).
 * La forme juridique de la demande (« Vinci SA », « Groupe Colas ») ne compte pas.
 */
export function porteLeNom(demande: string, r: { nom_complet?: string; nom_raison_sociale?: string; sigle?: string | null }): boolean {
  const cherches = motsDe(demande).filter((m) => !FORMES.has(m));
  if (!cherches.length) return false;
  const colle = cherches.join("");
  return [r.nom_complet, r.nom_raison_sociale, r.sigle].some((n) => {
    const mots = motsDe(n ?? "").filter((m, i) => i > 0 || !FORMES.has(m));
    if (!mots.length) return false;
    const debut = mots.slice(0, cherches.length);
    // Mot à mot au début du nom, ou collé (« La Poste » / LAPOSTE).
    // Collé, mais en mots entiers : LAPOSTE pour « La Poste », jamais VINCIER pour « Vinci ».
    return cherches.every((m, i) => debut[i] === m) || mots.some((_, k) => mots.slice(0, k + 1).join("") === colle);
  });
}

export interface AgencesTrouvees {
  agences: Found[];
  /** Les sociétés du nom retenues (« COLAS FRANCE », « COLAS RAIL »…). */
  societes: string[];
  /** Un département rendait dix établissements pour une société : il y en a peut-être plus. */
  tronquee: boolean;
  /** Le temps a manqué, ou l'annuaire n'a pas répondu, avant d'avoir vu tous les départements. */
  incomplete: boolean;
  /** Combien d'appels à l'annuaire ont échoué. */
  echecs: number;
}

export async function agencesDe(nom: string, departements: string[], budgetMs: number): Promise<AgencesTrouvees> {
  const debut = Date.now();
  const appeler = async (p: URLSearchParams): Promise<any> => {
    for (let attempt = 0; ; attempt++) {
      try {
        const res = await fetch(`${BASE}/search?${p}`, { signal: AbortSignal.timeout(TIMEOUT_MS) });
        if (res.status === 429 && attempt < RETRIES_429 + 2) {
          await new Promise((r) => setTimeout(r, 1_000 * (Number(res.headers.get("retry-after")) || 1.1)));
          continue;
        }
        return res.ok ? await res.json() : null;
      } catch {
        // Une coupure réseau se retente (deux fois) : une seule faisait tout échouer.
        if (attempt < 2) {
          await new Promise((r) => setTimeout(r, 700));
          continue;
        }
        return null;
      }
    }
  };

  // Un groupe (GE, ETI) porte-t-il ce nom ? Alors on ne garde que lui : « Colas » est
  // aussi le nom d'une dizaine de petites entreprises sans rapport avec le groupe.
  const groupes = await appeler(new URLSearchParams({ q: nom, etat_administratif: "A", per_page: "25", categorie_entreprise: "GE,ETI" }));
  // Sans cette réponse, on ne sait pas s'il faut écarter les homonymes : on n'invente pas.
  if (!groupes) throw new Error("l’annuaire des entreprises n’a pas répondu");
  const seulementLesGroupes = (groupes?.results ?? []).some((r: any) => porteLeNom(nom, r));

  const agences: Found[] = [];
  const societes = new Set<string>();
  const vus = new Set<string>();
  let tronquee = false;
  let incomplete = false;
  let echecs = 0;

  const unDepartement = async (d: string) => {
    for (let page = 1; page <= 4; page++) {
      if (Date.now() - debut > budgetMs) {
        incomplete = true;
        return;
      }
      const p = new URLSearchParams({ q: nom, departement: d, etat_administratif: "A", per_page: "25", page: String(page) });
      if (seulementLesGroupes) p.set("categorie_entreprise", "GE,ETI");
      const rep = await appeler(p);
      if (!rep) {
        echecs++;
        incomplete = true;
        return;
      }
      for (const r of rep.results ?? []) {
        if (!porteLeNom(nom, r)) continue;
        const etabs: any[] = r.matching_etablissements ?? [];
        if (etabs.length >= 10) tronquee = true;
        for (const e of etabs) {
          const local = toEstablishment(e);
          // Le siège n'est pas une agence (audit du 19/10).
          if (local.isHeadOffice || local.siret === r.siege?.siret) continue;
          if (!local.active || local.department !== d || vus.has(local.siret)) continue;
          vus.add(local.siret);
          const societe = toCompany(r);
          societes.add(societe.name);
          agences.push({ ...societe, localSites: [local] });
        }
      }
      if (page >= (rep.total_pages ?? 1)) return;
      // Quatre pages lues et il en reste : la liste de ce département n'est pas complète.
      if (page === 4) incomplete = true;
    }
  };

  // Quatre départements de front : l'annuaire limite le débit, et chaque refus coûte une seconde.
  for (let i = 0; i < departements.length; i += 4) {
    if (Date.now() - debut > budgetMs) {
      incomplete = true;
      break;
    }
    await Promise.all(departements.slice(i, i + 4).map(unDepartement));
  }
  return { agences, societes: [...societes], tronquee, incomplete, echecs };
}
