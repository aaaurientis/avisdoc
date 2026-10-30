// Les collecteurs : chacun interroge une source sur une période et rend des
// articles bruts. Aucune IA ici : ce sont des faits (titre, lien, date) tels
// que la source les publie. Le tri et le résumé viennent après.

import { INTERMEDIAIRES } from "./certificats.ts";
import { lireAdressePublique } from "./verifier.ts";

/* eslint-disable @typescript-eslint/no-explicit-any */

export type Nature ="etude" | "preprint" | "essai" | "officiel" | "appel_offres" | "presse" | "web";

export interface Article {
  cle: string;        // ce qui le rend unique : doi:, pmid:, nct:, boamp:, url:
  url: string;
  titre: string;
  source: string;     // cle de la source
  nature: Nature;
  publie_le: string | null;
  extrait: string;
}

export interface Periode {
  debut: Date;
  fin: Date;
}

const MAX_PAR_SOURCE = 60;
const DELAI_MS = 25_000;
const AGENT = "AvisDoc-Veille/1.0 (+https://admin.avisdoc.fr)";

const jour = (d: Date) => d.toISOString().slice(0, 10);
const nettoyer = (t: string) => t.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
const couper = (t: string, n = 600) => (t.length > n ? t.slice(0, n - 1) + "…" : t);

const clients = new Map<string, unknown>();
/** Un client qui connaît l'intermédiaire manquant, pour les sites qui l'oublient (voir certificats.ts). */
function clientPour(url: string) {
  const hote = new URL(url).hostname;
  const pem = INTERMEDIAIRES[hote];
  if (!pem) return undefined;
  if (!clients.has(hote)) clients.set(hote, (Deno as any).createHttpClient({ caCerts: [pem] }));
  return clients.get(hote);
}

async function lire(url: string, init?: RequestInit): Promise<Response> {
  const client = clientPour(url);
  const r = await fetch(url, { ...init, ...(client ? { client } : {}), headers: { "User-Agent": AGENT, ...(init?.headers ?? {}) }, signal: AbortSignal.timeout(DELAI_MS) } as RequestInit);
  if (!r.ok) throw new Error(`${new URL(url).host} a répondu ${r.status}`);
  return r;
}

/** Une adresse ramenée à sa forme stable : sans traqueurs, sans ancre, sans barre finale. */
export function normaliserUrl(u: string): string {
  try {
    const x = new URL(u.trim());
    x.hash = "";
    for (const k of [...x.searchParams.keys()]) if (/^(utm_|fbclid|gclid|mc_|ref$|xtor)/i.test(k)) x.searchParams.delete(k);
    x.hostname = x.hostname.replace(/^www\./, "");
    return `${x.protocol}//${x.hostname}${x.pathname.replace(/\/+$/, "")}${x.search}`.toLowerCase();
  } catch {
    return u.trim().toLowerCase();
  }
}

/** Enlève les retours de la même adresse. */
const uniques = (a: Article[]) => [...new Map(a.map((x) => [x.cle, x])).values()];

// ---------------------------------------------------------------------------
// PubMed (NCBI E-utilities) — date d'entrée dans PubMed sur la période.
// ---------------------------------------------------------------------------
export async function pubmed(params: { requete: string }, p: Periode): Promise<Article[]> {
  const f = (d: Date) => jour(d).replaceAll("-", "/");
  const cle = Deno.env.get("NCBI_API_KEY");
  const base = "https://eutils.ncbi.nlm.nih.gov/entrez/eutils";
  const q = new URLSearchParams({ db: "pubmed", term: params.requete, datetype: "edat", mindate: f(p.debut), maxdate: f(p.fin), retmode: "json", retmax: String(MAX_PAR_SOURCE), sort: "relevance", ...(cle && { api_key: cle }) });
  const ids: string[] = (await (await lire(`${base}/esearch.fcgi?${q}`)).json()).esearchresult?.idlist ?? [];
  if (!ids.length) return [];
  const s = await (await lire(`${base}/esummary.fcgi?db=pubmed&retmode=json&id=${ids.join(",")}${cle ? `&api_key=${cle}` : ""}`)).json();
  return ids.map((id) => s.result?.[id]).filter(Boolean).map((r: any) => ({
    cle: r.elocationid?.startsWith("doi:") ? `doi:${r.elocationid.slice(5).trim().toLowerCase()}` : `pmid:${r.uid}`,
    url: `https://pubmed.ncbi.nlm.nih.gov/${r.uid}/`,
    titre: nettoyer(r.title ?? ""),
    source: "pubmed",
    nature: "etude" as const,
    publie_le: r.sortpubdate ? new Date(r.sortpubdate.replace(/\//g, "-")).toISOString() : null,
    extrait: couper([r.fulljournalname, r.pubdate, (r.authors ?? []).slice(0, 3).map((a: any) => a.name).join(", ")].filter(Boolean).join(" · ")),
  })).filter((a) => a.titre);
}

// ---------------------------------------------------------------------------
// Europe PMC — première publication sur la période ; le résumé est fourni.
// ---------------------------------------------------------------------------
export async function europepmc(params: { requete: string }, p: Periode): Promise<Article[]> {
  const query = `${params.requete} AND FIRST_PDATE:[${jour(p.debut)} TO ${jour(p.fin)}]`;
  const q = new URLSearchParams({ query, format: "json", pageSize: String(MAX_PAR_SOURCE), resultType: "core" });
  const r = await (await lire(`https://www.ebi.ac.uk/europepmc/webservices/rest/search?${q}`)).json();
  return (r.resultList?.result ?? []).map((x: any) => {
    const preprint = x.source === "PPR";
    return {
      cle: x.doi ? `doi:${String(x.doi).toLowerCase()}` : x.pmid ? `pmid:${x.pmid}` : `epmc:${x.source}:${x.id}`,
      url: x.doi ? `https://doi.org/${x.doi}` : `https://europepmc.org/article/${x.source}/${x.id}`,
      titre: nettoyer(x.title ?? ""),
      source: "europepmc",
      nature: preprint ? "preprint" as const : "etude" as const,
      publie_le: x.firstPublicationDate ? new Date(x.firstPublicationDate).toISOString() : null,
      extrait: couper(nettoyer(x.abstractText ?? x.journalInfo?.journal?.title ?? "")),
    };
  }).filter((a: Article) => a.titre);
}

// ---------------------------------------------------------------------------
// medRxiv — prépublications de la période, gardées dans les catégories voulues.
// ---------------------------------------------------------------------------
export async function medrxiv(params: { categories: string[] }, p: Periode): Promise<Article[]> {
  const voulues = new Set(params.categories.map((c) => c.toLowerCase()));
  const out: Article[] = [];
  for (let curseur = 0; curseur < 1000; curseur += 100) {
    const r = await (await lire(`https://api.medrxiv.org/details/medrxiv/${jour(p.debut)}/${jour(p.fin)}/${curseur}`)).json();
    const lot = r.collection ?? [];
    for (const x of lot) {
      if (!voulues.has(String(x.category ?? "").toLowerCase())) continue;
      out.push({
        cle: `doi:${String(x.doi).toLowerCase()}`,
        url: `https://www.medrxiv.org/content/${x.doi}v${x.version ?? 1}`,
        titre: nettoyer(x.title ?? ""),
        source: "medrxiv",
        nature: "preprint",
        publie_le: x.date ? new Date(x.date).toISOString() : null,
        extrait: couper(nettoyer(x.abstract ?? "")),
      });
    }
    if (lot.length < 100) break;
  }
  return uniques(out).slice(0, MAX_PAR_SOURCE);
}

// ---------------------------------------------------------------------------
// ClinicalTrials.gov — essais mis à jour sur la période.
// ---------------------------------------------------------------------------
export async function clinicaltrials(params: { condition: string; pays?: string }, p: Periode): Promise<Article[]> {
  const q = new URLSearchParams({
    "query.cond": params.condition,
    ...(params.pays && { "query.locn": params.pays }),
    "filter.advanced": `AREA[LastUpdatePostDate]RANGE[${jour(p.debut)},${jour(p.fin)}]`,
    pageSize: String(MAX_PAR_SOURCE),
    fields: "NCTId,BriefTitle,OverallStatus,LastUpdatePostDate,BriefSummary",
  });
  const r = await (await lire(`https://clinicaltrials.gov/api/v2/studies?${q}`)).json();
  return (r.studies ?? []).map((s: any) => {
    const ps = s.protocolSection ?? {};
    const id = ps.identificationModule?.nctId;
    return {
      cle: `nct:${id}`,
      url: `https://clinicaltrials.gov/study/${id}`,
      titre: nettoyer(ps.identificationModule?.briefTitle ?? ""),
      source: "clinicaltrials",
      nature: "essai" as const,
      publie_le: ps.statusModule?.lastUpdatePostDateStruct?.date ? new Date(ps.statusModule.lastUpdatePostDateStruct.date).toISOString() : null,
      extrait: couper([ps.statusModule?.overallStatus, nettoyer(ps.descriptionModule?.briefSummary ?? "")].filter(Boolean).join(" · ")),
    };
  }).filter((a: Article) => a.titre && !a.cle.endsWith("undefined"));
}

// ---------------------------------------------------------------------------
// BOAMP — avis de marchés publics parus sur la période, par mots.
// ---------------------------------------------------------------------------
export async function boamp(params: { mots: string[] }, p: Periode): Promise<Article[]> {
  const esc = (s: string) => s.replace(/"/g, '\\"');
  const mots = params.mots.map((m) => `search("${esc(m)}")`).join(" or ");
  const where = `(${mots}) and dateparution >= "${jour(p.debut)}" and dateparution <= "${jour(p.fin)}"`;
  const q = new URLSearchParams({ where, limit: "100", select: "idweb,objet,dateparution,url_avis,nomacheteur,type_marche" });
  const r = await (await lire(`https://boamp-datadila.opendatasoft.com/api/explore/v2.1/catalog/datasets/boamp/records?${q}`)).json();
  return (r.results ?? []).map((x: any) => ({
    cle: `boamp:${x.idweb}`,
    url: x.url_avis ?? `https://www.boamp.fr/pages/avis/?q=idweb:${x.idweb}`,
    titre: nettoyer(x.objet ?? ""),
    source: "boamp",
    nature: "appel_offres" as const,
    publie_le: x.dateparution ? new Date(x.dateparution).toISOString() : null,
    extrait: couper([x.nomacheteur, Array.isArray(x.type_marche) ? x.type_marche.join(", ") : x.type_marche].filter(Boolean).join(" · ")),
  })).filter((a: Article) => a.titre).slice(0, MAX_PAR_SOURCE);
}

// ---------------------------------------------------------------------------
// Flux RSS / Atom — les entrées publiées sur la période.
// ---------------------------------------------------------------------------
const balise = (bloc: string, nom: string) => {
  const m = bloc.match(new RegExp(`<${nom}(?:\\s[^>]*)?>([\\s\\S]*?)</${nom}>`, "i"));
  return m ? m[1].replace(/^<!\[CDATA\[|\]\]>$/g, "").trim() : "";
};
const entites = (t: string) =>
  t.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(+n)).replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)));

export async function rss(cle: string, params: { url: string }, p: Periode): Promise<Article[]> {
  // Adresse saisie par quelqu'un : chaque redirection contrôlée, jamais le réseau interne, taille bornée (comme un site).
  return lireFlux(cle, (await lireAdressePublique(params.url, clientPour)).corps, p);
}

/** Ce qu'est une publication, d'après la source qui la porte. */
function natureDe(cle: string): Nature {
  if (cle === "rss-jaad") return "etude";
  if (/^(rss-(has|ansm|spf|inca)|site-(anses|inrs|ameli|sfd))/.test(cle)) return "officiel";
  return "presse";
}

function lireFlux(cle: string, xml: string, p: Periode): Article[] {
  const blocs = xml.match(/<item[\s>][\s\S]*?<\/item>|<entry[\s>][\s\S]*?<\/entry>/gi) ?? [];
  const out: Article[] = [];
  for (const b of blocs) {
    const lien = balise(b, "link") || (b.match(/<link[^>]*href="([^"]+)"/i)?.[1] ?? "");
    const date = balise(b, "pubDate") || balise(b, "updated") || balise(b, "published") || balise(b, "dc:date");
    const t = date ? new Date(date) : null;
    // Une entrée sans date ne peut pas être rangée dans une période : on l'écarte plutôt que de la republier sans fin.
    if (!t || isNaN(t.getTime()) || t < p.debut || t >= p.fin) continue;
    const url = entites(lien.trim());
    if (!/^https?:\/\//i.test(url)) continue;
    out.push({
      cle: `url:${normaliserUrl(url)}`,
      url,
      titre: nettoyer(entites(balise(b, "title"))),
      source: cle,
      nature: natureDe(cle),
      publie_le: t.toISOString(),
      extrait: couper(nettoyer(entites(balise(b, "description") || balise(b, "summary") || balise(b, "content")))),
    });
  }
  return uniques(out).slice(0, MAX_PAR_SOURCE);
}

// ---------------------------------------------------------------------------
// Linkup — presse et web français, sur une expression ou un compte.
// ---------------------------------------------------------------------------
export async function linkup(q: string, p: Periode, domaines?: string[]): Promise<Article[]> {
  const cle = Deno.env.get("LINKUP_API_KEY");
  if (!cle) throw new Error("LINKUP_API_KEY non configurée");
  const r = await (await lire("https://api.linkup.so/v1/search", {
    method: "POST",
    headers: { Authorization: `Bearer ${cle}`, "Content-Type": "application/json" },
    body: JSON.stringify({ q, depth: "standard", outputType: "searchResults", fromDate: jour(p.debut), toDate: jour(p.fin), maxResults: 10, ...(domaines?.length && { includeDomains: domaines }) }),
  })).json();
  return (r.results ?? []).filter((x: any) => x.type === "text" && x.url).map((x: any) => ({
    cle: `url:${normaliserUrl(x.url)}`,
    url: x.url,
    titre: nettoyer(x.name ?? x.url),
    source: "linkup",
    nature: "presse" as const,
    // Linkup filtre sur la période mais ne rend pas la date de chaque page ; pour LinkedIn, elle figure dans le titre.
    publie_le: String(x.name ?? "").match(/LinkedIn Post - (\d{4}-\d{2}-\d{2}T[\d:.]+Z)/)?.[1] ?? null,
    extrait: couper(nettoyer(x.content ?? "")),
  }));
}

// ---------------------------------------------------------------------------
// Un site ou un blog : son flux s'il en a un (la page l'annonce, ou c'est déjà un
// flux), sinon une recherche Linkup limitée à ce site.
// ---------------------------------------------------------------------------
/** La question posée à Linkup sur un site sans flux : de qui on parle, et ce qui intéresse AvisDoc. */
const questionSite = (nom: string) =>
  `Articles et actualités récents publiés par ${nom} sur la prévention santé, les cancers de la peau, la dermatologie, la santé et le bien-être des salariés`;

export async function site(cle: string, params: { url: string }, p: Periode, nom?: string): Promise<Article[]> {
  const url = new URL(params.url);
  const surLeSite = async () => {
    const trouves = await linkup(questionSite(nom || url.hostname.replace(/^www\./, "")), p, [url.hostname.replace(/^www\./, "")]);
    return trouves.map((a) => ({ ...a, source: cle }));
  };
  // Adresse saisie par quelqu'un : lue sans jamais viser le réseau interne, et bornée en taille.
  // Un site qui refuse les robots (403…) ou ne répond pas : on cherche sur le site plutôt que d'abandonner.
  let page: Awaited<ReturnType<typeof lireAdressePublique>>;
  try {
    page = await lireAdressePublique(url.toString());
  } catch (e) {
    if (e instanceof Error && e.message.startsWith("adresse non publique")) throw e;
    return surLeSite();
  }
  const { type, corps, finale } = page;
  if (/xml|rss|atom/i.test(type) || /^\s*<\?xml|<rss[\s>]|<feed[\s>]/i.test(corps.slice(0, 500))) return lireFlux(cle, corps, p);
  const annonce = corps.match(/<link[^>]+type=["']application\/(?:rss|atom)\+xml["'][^>]*>/i)?.[0].match(/href=["']([^"']+)["']/i)?.[1];
  if (annonce) {
    try {
      const flux = await lireAdressePublique(new URL(entites(annonce), finale).toString());
      return lireFlux(cle, flux.corps, p);
    } catch {
      /* flux annoncé mais illisible : on cherche sur le site */
    }
  }
  return surLeSite();
}
