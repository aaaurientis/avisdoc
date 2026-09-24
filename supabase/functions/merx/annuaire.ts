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
  headcountBand: string | null;
  headcountYear: number | null;
  isHeadOffice: boolean;
}

export interface Company {
  siren: string;
  name: string;
  activityCode: string | null; // code NAF ; l'annuaire ne renvoie pas son libellé
  headcountBand: string | null; // effectif de l'entreprise entière
  headcountYear: number | null; // année de la donnée (valeur au 31/12 de N-2)
  category: string | null; // PME, ETI, GE
  openEstablishments: number | null;
  headOffice: Establishment;
  leaders: { name: string; role: string | null }[]; // nom et qualité seulement (minimisation RGPD)
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
    headcountBand: e.tranche_effectif_salarie ?? null,
    headcountYear: year(e.annee_tranche_effectif_salarie),
    isHeadOffice: Boolean(e.est_siege),
  };
}

export function toCompany(r: any): Company {
  return {
    siren: r.siren,
    name: r.nom_complet,
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
}

/** Ce que rend une recherche : les entreprises retenues, et celles qui ne sont plus là. */
export interface SearchResult {
  found: Found[];
  /** Entreprises écartées faute d'un établissement encore ouvert dans la zone. */
  ignores: number;
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
export async function searchByCriteria(c: Criteria, max = 100): Promise<SearchResult> {
  const found: Found[] = [];
  let ignores = 0;
  const pages = Math.ceil(max / PER_PAGE);

  for (let page = 1; page <= pages; page++) {
    const params = new URLSearchParams({
      etat_administratif: "A",
      per_page: String(PER_PAGE),
      page: String(page),
    });
    if (c.nafCodes?.length) params.set("activite_principale", c.nafCodes.join(","));
    else if (c.section) params.set("section_activite_principale", c.section);
    if (c.departments.length) params.set("departement", c.departments.join(","));
    if (c.minHeadcount) {
      const bands = bandsFrom(c.minHeadcount);
      if (bands.length) params.set("tranche_effectif_salarie", bands.join(","));
    }

    let data: any = null;
    for (let attempt = 0; ; attempt++) {
      try {
        const res = await fetch(`${BASE}/search?${params}`, { signal: AbortSignal.timeout(TIMEOUT_MS) });
        if (res.status === 429 && attempt < RETRIES_429) {
          await new Promise((r) => setTimeout(r, 1_100));
          continue;
        }
        if (!res.ok) break;
        data = await res.json();
        break;
      } catch {
        break;
      }
    }
    if (!data?.results?.length) break;

    for (const r of data.results) {
      const company = toCompany(r);
      const tous = ((r.matching_etablissements ?? []) as any[]).map(toEstablishment);
      const ouverts = tous.filter((e) => e.active);
      // Une zone demandée sans un seul établissement ouvert dedans : l'entreprise
      // n'y est plus. La retenir, c'était envoyer le commercial à une adresse fermée.
      if (c.departments.length && tous.length > 0 && ouverts.length === 0) {
        ignores++;
        continue;
      }
      found.push({ ...company, localSites: ouverts });
      if (found.length >= max) return { found, ignores };
    }
    if (page >= (data.total_pages ?? 1)) break;
  }
  return { found, ignores };
}
