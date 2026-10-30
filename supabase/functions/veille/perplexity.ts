// Perplexity — la recherche approfondie, en arrière-plan (Agent API).
//
// Documentation lue le 17/10/2026 (docs.perplexity.ai) : l'ancien mode
// asynchrone de Sonar n'est plus pris en charge ; on crée une réponse avec
// `background: true` sur POST /v1/agent, puis on la relit par GET /v1/agent/{id}
// jusqu'à un état final (completed, failed, cancelled, incomplete).
// Le préréglage « high » est l'équivalent de Sonar Deep Research. Les dates
// se filtrent sur l'outil web_search, au format MM/JJ/AAAA.
//
// Garde-fou : on ne garde que les adresses que Perplexity a réellement
// consultées (bloc search_results). Une adresse citée mais jamais ouverte est
// écartée.

import { type Article, normaliserUrl, type Periode } from "./sources.ts";

const BASE = "https://api.perplexity.ai/v1/agent";
const PRESET = () => Deno.env.get("VEILLE_PERPLEXITY_PRESET") ?? "high";

const cle = () => {
  const k = Deno.env.get("PERPLEXITY_API_KEY");
  if (!k) throw new Error("PERPLEXITY_API_KEY non configurée");
  return k;
};
const mmjjaaaa = (d: Date) => {
  const [a, m, j] = d.toISOString().slice(0, 10).split("-");
  return `${m}/${j}/${a}`;
};

export interface Consigne {
  rubriques: { nom: string; description: string }[];
  comptes: { nom: string; site: string | null; notes: string; genre?: string }[];
  reseaux?: { nom: string; plateforme: string; url: string | null }[];
  expressions: string[];
}

/** La seconde recherche : les entreprises et collectivités qui parlent de la santé de leurs salariés (26/10). */
function questionSignaux(c: Consigne, p: Periode): string {
  const concurrents = c.comptes.filter((x) => x.genre === "concurrent").map((x) => x.nom);
  return `Tu repères des clients potentiels pour AvisDoc, société française qui organise des campagnes de dépistage des cancers de la peau pour les salariés des entreprises et les agents des collectivités.

Cherche les publications parues entre le ${p.debut.toISOString().slice(0, 10)} et le ${p.fin.toISOString().slice(0, 10)} (inclus), en France, où :
- une ENTREPRISE ou une COLLECTIVITÉ montre qu'elle se soucie de la santé ou du bien-être de ses salariés ou agents : qualité de vie au travail, prévention santé, semaine de la santé, bilans ou dépistages offerts, arrêts maladie en hausse, accidents du travail, salariés travaillant en extérieur, canicule, engagement RSE santé ;
- une COLLECTIVITÉ (mairie, communauté de communes, département, région) parle de désert médical, du manque de médecins et surtout de dermatologues, ou cherche une solution pour que ses habitants se fassent soigner (téléconsultation, centre de santé, maison de santé, contrat local de santé).

Où chercher : presse locale et régionale, blogs et pages actualités d'entreprises, communiqués, sites des collectivités, offres d'emploi qui mettent en avant ces engagements.
${concurrents.length ? `Ignore ces concurrents d'AvisDoc : ${concurrents.join(", ")}.` : ""}

Règles : uniquement des publications de la période ; une ligne par publication, avec son adresse exacte ; rien que tu n'aies lu toi-même ; aucun chiffre qui ne figure pas dans la source.

Réponds UNIQUEMENT par un tableau JSON : [{"titre": "...", "url": "https://...", "date": "AAAA-MM-JJ", "source": "nom du média ou du site", "entreprise": "nom de l'entreprise ou de la collectivité", "ville": "ville ou département", "resume": "deux phrases factuelles : ce qu'elle a dit ou fait"}]`;
}

function question(c: Consigne, p: Periode): string {
  return `Tu fais la veille d'AvisDoc, société française de téléexpertise dermatologique : campagnes de dépistage des cancers de la peau en entreprise et pour les collectivités (infirmiers sur place, dermatologues à distance).

Cherche tout ce qui a été PUBLIÉ entre le ${p.debut.toISOString().slice(0, 10)} et le ${p.fin.toISOString().slice(0, 10)} (inclus) et qui compte pour AvisDoc, en France d'abord, puis en Europe :
${c.rubriques.map((r) => `- ${r.nom} : ${r.description}`).join("\n")}

Comptes à surveiller (ce qu'ils publient, annoncent, lèvent, signent) :
${c.comptes.map((x) => `- ${x.nom}${x.site ? ` (${x.site})` : ""}${x.notes ? ` — ${x.notes}` : ""}`).join("\n") || "- aucun"}

${c.reseaux?.length ? `Pages de réseaux sociaux à surveiller (ce qui en est public) :\n${c.reseaux.map((r) => `- ${r.nom} (${r.plateforme}${r.url ? `, ${r.url}` : ""})`).join("\n")}\n\n` : ""}Expressions à surveiller :
${c.expressions.map((e) => `- « ${e} »`).join("\n") || "- aucune"}

Règles : uniquement des publications de la période ; une ligne par publication, avec son adresse exacte ; rien que tu n'aies lu toi-même ; aucun chiffre qui ne figure pas dans la source. Si tu ne trouves rien sur un point, n'invente rien.

Réponds UNIQUEMENT par un tableau JSON : [{"titre": "...", "url": "https://...", "date": "AAAA-MM-JJ", "source": "nom du média ou de l'organisme", "resume": "deux phrases factuelles"}]`;
}

/** Lance la recherche ; rend son identifiant. */
export async function lancer(c: Consigne, p: Periode, mode: "veille" | "signaux" = "veille"): Promise<string> {
  const r = await fetch(BASE, {
    method: "POST",
    headers: { Authorization: `Bearer ${cle()}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      preset: PRESET(),
      input: mode === "signaux" ? questionSignaux(c, p) : question(c, p),
      background: true,
      tools: [{ type: "web_search", filters: { search_after_date_filter: mmjjaaaa(p.debut), search_before_date_filter: mmjjaaaa(p.fin) } }],
    }),
    signal: AbortSignal.timeout(30_000),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || !j.id) throw new Error(`Perplexity ${r.status} : ${JSON.stringify(j).slice(0, 300)}`);
  return j.id;
}

export type Suivi =
  | { etat: "en_cours" }
  | { etat: "fini"; articles: Article[]; coutUsd: number; brut: unknown }
  | { etat: "echec"; raison: string };

/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * Les publications annoncées. On demande un tableau JSON ; il arrive que Perplexity
 * rende un tableau Markdown (| titre | url | date | source | resume |) : on lit les deux.
 */
function lireLignes(texte: string): any[] | null {
  const m = texte.match(/\[\s*\{[\s\S]*\}\s*\]/);
  if (m) {
    try {
      return JSON.parse(m[0]);
    } catch {
      /* on essaie le tableau Markdown */
    }
  }
  const rangs = texte.split("\n").map((l) => l.trim()).filter((l) => l.startsWith("|") && l.endsWith("|"));
  if (rangs.length < 2) return null;
  const cellules = (l: string) => l.slice(1, -1).split("|").map((c) => c.trim());
  const entete = cellules(rangs[0]).map((c) => c.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, ""));
  const col = (nom: string) => entete.indexOf(nom);
  if (col("url") < 0 || col("titre") < 0) return null;
  return rangs.slice(1).filter((l) => !/^\|[\s:|-]+\|$/.test(l)).map((l) => {
    const c = cellules(l);
    return { titre: c[col("titre")], url: c[col("url")], date: c[col("date")], source: c[col("source")], resume: c[col("resume")] };
  });
}

/** Relit la recherche ; quand elle est finie, rend les articles retenus. */
export async function suivre(id: string): Promise<Suivi> {
  const r = await fetch(`${BASE}/${encodeURIComponent(id)}`, { headers: { Authorization: `Bearer ${cle()}` }, signal: AbortSignal.timeout(30_000) });
  const j: any = await r.json().catch(() => ({}));
  if (!r.ok) return { etat: "echec", raison: `Perplexity ${r.status} : ${JSON.stringify(j).slice(0, 300)}` };
  if (j.status === "queued" || j.status === "in_progress") return { etat: "en_cours" };
  if (j.status !== "completed") return { etat: "echec", raison: `Perplexity : ${j.status}${j.error ? ` — ${JSON.stringify(j.error).slice(0, 200)}` : ""}` };

  const sortie: any[] = j.output ?? [];
  const texte = sortie.filter((o) => o.type === "message").flatMap((o) => o.content ?? []).filter((c: any) => c.type === "output_text").map((c: any) => c.text).join("");
  // Les pages vues dans les résultats de recherche ET celles ouvertes en entier.
  const consultees = new Set<string>(
    sortie.flatMap((o) => (o.type === "search_results" ? o.results : o.type === "fetch_url_results" ? o.contents : null) ?? [])
      .map((x: any) => x.url).filter(Boolean).map(normaliserUrl),
  );
  // L'extrait de la page tel que le moteur de recherche l'a lu : plus sûr que le résumé écrit par Perplexity.
  const extraits = new Map<string, string>(
    sortie.flatMap((o) => (o.type === "search_results" ? o.results : o.type === "fetch_url_results" ? o.contents : null) ?? [])
      .filter((x: any) => x.url && x.snippet).map((x: any) => [normaliserUrl(x.url), String(x.snippet)]),
  );
  const lignes = lireLignes(texte);
  if (lignes === null) return { etat: "echec", raison: "Perplexity : réponse illisible (ni tableau JSON, ni tableau)." };
  const articles: Article[] = lignes
    .filter((l) => l && typeof l.url === "string" && /^https?:\/\//.test(l.url) && typeof l.titre === "string")
    .filter((l) => consultees.has(normaliserUrl(l.url)))
    .map((l) => ({
      cle: `url:${normaliserUrl(l.url)}`,
      url: l.url,
      titre: String(l.titre).slice(0, 300),
      source: "perplexity",
      nature: "web" as const,
      publie_le: /^\d{4}-\d{2}-\d{2}$/.test(l.date ?? "") ? new Date(l.date).toISOString() : null,
      // Jamais le résumé écrit par Perplexity : seulement ce que la page affichait. Sans extrait, Vigile ne juge que sur le titre.
      extrait: [l.source, extraits.get(normaliserUrl(l.url)) ?? ""].filter(Boolean).join(" — ").slice(0, 600),
    }));
  const coutUsd = Number(j.usage?.cost?.total_cost ?? j.usage?.total_cost ?? j.usage?.cost ?? 0) || 0;
  return { etat: "fini", articles, coutUsd, brut: { cout: coutUsd, lignes: lignes.length, retenues: articles.length, consultees: consultees.size } };
}
