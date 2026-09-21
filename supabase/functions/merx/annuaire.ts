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
