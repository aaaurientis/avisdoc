// Vérifier qu'un lien trouvé sur le web mène bien à ce qu'on en dit.
//
// Les articles des sources officielles (PubMed, Europe PMC, medRxiv,
// ClinicalTrials.gov, BOAMP, flux RSS) viennent d'une base qui fait foi : leur
// lien est construit à partir de leur identifiant. Ceux du web (Linkup,
// Perplexity) sont ouverts pour de vrai : la page doit répondre, et son texte
// doit contenir l'essentiel du titre annoncé. Sinon l'article est écarté.
//
// La page lue n'est pas de confiance : chaque redirection est contrôlée AVANT
// d'être suivie, et chaque nom est résolu pour refuser une adresse interne.
// On lit au plus TAILLE_MAX octets, jamais la page entière d'un coup.

const SOURCES_SURES = new Set(["pubmed", "europepmc", "medrxiv", "clinicaltrials", "boamp"]);
const DELAI_MS = 10_000;
const TAILLE_MAX = 1_500_000;
const REDIRECTIONS_MAX = 5;

export const aVerifier = (source: string) => !SOURCES_SURES.has(source) && !source.startsWith("rss-");

// Un site qui refuse les robots (Cloudflare & co) s'ouvre très bien pour une personne : vérifié le 17/10
// sur La Voix du Nord, Europe PMC, JAAD, LaingBuisson et Courrier picard. On garde l'article, on le signale.
const REFUS_ROBOTS = new Set([401, 403, 429]);

const ipPrivee4 = (ip: string) =>
  /^(0|10|127)\./.test(ip) || /^192\.168\./.test(ip) || /^169\.254\./.test(ip) || /^172\.(1[6-9]|2\d|3[01])\./.test(ip) ||
  /^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./.test(ip) || /^(22[4-9]|2[3-5]\d)\./.test(ip);
const ipPrivee6 = (ip: string) => /^(::1?|fc|fd|fe8|fe9|fea|feb|::ffff:)/i.test(ip);

/** L'adresse vise-t-elle bien l'internet public ? Le nom est résolu : un nom public qui pointe vers 127.0.0.1 est refusé. */
export async function adressePublique(u: URL): Promise<boolean> {
  if (!/^https?:$/.test(u.protocol)) return false;
  const h = u.hostname.toLowerCase();
  if (h === "localhost" || h.endsWith(".local") || h.endsWith(".internal") || !h.includes(".")) return false;
  if (h.startsWith("[") || /^\d+\.\d+\.\d+\.\d+$/.test(h)) return false; // pas d'adresse IP brute dans un lien d'article
  try {
    const [v4, v6] = await Promise.all([
      Deno.resolveDns(h, "A").catch(() => [] as string[]),
      Deno.resolveDns(h, "AAAA").catch(() => [] as string[]),
    ]);
    if (!v4.length && !v6.length) return false;
    return !v4.some(ipPrivee4) && !v6.some(ipPrivee6);
  } catch {
    return false;
  }
}

const mots = (t: string) =>
  t.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().split(/[^a-z0-9]+/).filter((m) => m.length > 4);

const entites = (t: string) =>
  t.replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(+n));

/** La description que la page donne d'elle-même, sinon son premier vrai paragraphe. */
function extraitDe(html: string): string {
  const meta = html.match(/<meta[^>]+(?:name|property)=["'](?:og:description|description)["'][^>]*content=["']([^"']{40,})["']/i)
    ?? html.match(/<meta[^>]+content=["']([^"']{40,})["'][^>]*(?:name|property)=["'](?:og:description|description)["']/i);
  if (meta) return entites(meta[1]).replace(/\s+/g, " ").trim().slice(0, 600);
  for (const p of html.match(/<p[\s>][\s\S]*?<\/p>/gi) ?? []) {
    const t = entites(p.replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();
    if (t.length >= 80) return t.slice(0, 600);
  }
  return "";
}

export async function lireBorne(r: Response): Promise<string> {
  if (!r.body) return "";
  const lecteur = r.body.getReader();
  const morceaux: Uint8Array[] = [];
  let total = 0;
  while (total < TAILLE_MAX) {
    const { done, value } = await lecteur.read();
    if (done || !value) break;
    morceaux.push(value);
    total += value.length;
  }
  await lecteur.cancel().catch(() => {});
  const tout = new Uint8Array(Math.min(total, TAILLE_MAX));
  let i = 0;
  for (const m of morceaux) {
    const part = m.subarray(0, tout.length - i);
    tout.set(part, i);
    i += part.length;
    if (i >= tout.length) break;
  }
  return new TextDecoder().decode(tout);
}

export interface Verification {
  ok: boolean;
  raison?: string;
  /** Ce que la page dit d'elle-même : remplace un résumé écrit par un moteur. */
  extrait?: string;
  /** Le site refuse les robots : le lien s'ouvre dans un navigateur, on proposera de le copier. */
  protege?: boolean;
}

export async function verifier(url: string, titre: string): Promise<Verification> {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return { ok: false, raison: "adresse invalide" };
  }
  let r: Response | null = null;
  for (let saut = 0; saut <= REDIRECTIONS_MAX; saut++) {
    if (!(await adressePublique(u))) return { ok: false, raison: "adresse non publique" };
    try {
      r = await fetch(u, { redirect: "manual", headers: { "User-Agent": "Mozilla/5.0 (compatible; AvisDoc-Veille/1.0)" }, signal: AbortSignal.timeout(DELAI_MS) });
    } catch {
      return { ok: false, raison: "page injoignable" };
    }
    const vers = r.status >= 300 && r.status < 400 ? r.headers.get("location") : null;
    if (!vers) break;
    await r.body?.cancel().catch(() => {});
    try {
      u = new URL(vers, u);
    } catch {
      return { ok: false, raison: "redirection invalide" };
    }
    r = null;
  }
  if (!r) return { ok: false, raison: "trop de redirections" };
  if (REFUS_ROBOTS.has(r.status)) {
    await r.body?.cancel().catch(() => {});
    return { ok: true, protege: true };
  }
  if (r.status >= 400) return { ok: false, raison: `page en erreur (${r.status})` };
  const type = r.headers.get("content-type") ?? "";
  if (type.includes("pdf")) {
    await r.body?.cancel().catch(() => {});
    return { ok: true }; // un PDF ne se lit pas ici ; il répond, on le garde
  }
  const html = await lireBorne(r);
  const propre = html.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, " ");
  const page = new Set(mots(propre.replace(/<[^>]+>/g, " ")));
  const attendus = [...new Set(mots(titre))];
  const trouves = attendus.filter((m) => page.has(m)).length;
  // La moitié des mots du titre au moins : les titres réécrits par un moteur restent reconnaissables.
  if (attendus.length && trouves / attendus.length < 0.5) return { ok: false, raison: "le contenu de la page ne correspond pas au titre" };
  return { ok: true, extrait: extraitDe(propre) };
}

/**
 * Lire une adresse saisie par quelqu'un (un site, un blog) sans jamais viser le réseau interne :
 * chaque redirection est contrôlée avant d'être suivie, la page est lue par morceaux et bornée.
 * Rend le texte, le type et l'adresse finale (pour résoudre les liens relatifs).
 */
export async function lireAdressePublique(adresse: string, clientPour?: (url: string) => unknown): Promise<{ statut: number; type: string; corps: string; finale: URL }> {
  let u = new URL(adresse);
  for (let saut = 0; saut <= REDIRECTIONS_MAX; saut++) {
    if (!(await adressePublique(u))) throw new Error(`adresse non publique : ${u.hostname}`);
    const client = clientPour?.(u.toString());
    const r = await fetch(u, { redirect: "manual", ...(client ? { client } : {}), headers: { "User-Agent": "Mozilla/5.0 (compatible; AvisDoc-Veille/1.0)" }, signal: AbortSignal.timeout(20_000) } as RequestInit);
    const vers = r.status >= 300 && r.status < 400 ? r.headers.get("location") : null;
    if (vers) {
      await r.body?.cancel().catch(() => {});
      u = new URL(vers, u);
      continue;
    }
    if (!r.ok) {
      await r.body?.cancel().catch(() => {});
      throw new Error(`${u.hostname} a répondu ${r.status}`);
    }
    return { statut: r.status, type: r.headers.get("content-type") ?? "", corps: await lireBorne(r), finale: u };
  }
  throw new Error("trop de redirections");
}
