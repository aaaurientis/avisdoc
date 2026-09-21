// Merx au travail : une demande, un traitement, sous la coupure de l'hébergeur.
//   recherche         — une requête au modèle, deux recherches web au plus, rend une liste de fiches légères ;
//   approfondissement — à la demande, sur une fiche : l'annuaire officiel et le site de l'entreprise (gratuits)
//                       d'abord, le modèle ne cherche plus que ce qui manque (trois recherches web au plus).
// Budget : une edge function Supabase tient 150 s (400 s en payant) ; on se borne à 120 s pour finir proprement.

import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { headcountLabel, lookup, type Company } from "./annuaire.ts";
import {
  appendConversationMessage,
  claimRequest,
  failRequest,
  finishRequest,
  getProspectForEnrichment,
  insertLightProspects,
  listFoundNames,
  saveEnrichment,
  type Demande,
  type LightProspect,
} from "./db.ts";
import { complete, type LlmUsage } from "./llm.ts";
import {
  ENRICH_SCHEMA,
  ENRICH_SYSTEM,
  enrichPrompt,
  host,
  LIST_SCHEMA,
  LIST_SYSTEM,
  type EnrichOut,
  type ListOut,
} from "./prompts.ts";
import { readSiteContacts, type SiteContacts } from "./site-contacts.ts";
import { contactScore, healthScore, isSector, sitesScore, sizeScore, sunScore, total, zoneScore, type Score } from "./scoring.ts";

const BUDGET_MS = 120_000; // sous la coupure de l'hébergeur
const LIST_WEB_SEARCHES = 2; // deux recherches suffisent pour une liste
const RETRY_BEFORE_MS = 60_000; // seconde tentative seulement s'il reste le temps d'une recherche
const ENRICH_WEB_SEARCHES = 3;

// Plateformes prises à tort pour un site officiel (annuaires, recrutement, réseaux).
const PLATFORMS = ["linkedin.com", "facebook.com", "werecruit.io", "societe.com", "pappers.fr", "verif.com", "manageo.fr", "infonet.fr", "kompass.com", "pagesjaunes.fr", "usinenouvelle.com"];
const isPlatform = (url: string) => {
  const h = host(url);
  return h === null || PLATFORMS.some((p) => h === p || h.endsWith(`.${p}`));
};
const officialSite = (url: string) => (url.trim() && !isPlatform(url.trim()) ? url.trim() : null);
const department = (code: string) => (/^(\d{2}|2A|2B|97\d)$/.test(code.trim()) ? code.trim() : null);

async function runSearch(sb: SupabaseClient, req: Demande, onUsage: (u: LlmUsage) => void) {
  const started = Date.now();
  let urls: string[] = [];
  const spent: LlmUsage = { inputTokens: 0, outputTokens: 0, webSearches: 0 };
  const ask = (prompt: string) =>
    complete<ListOut>(prompt, LIST_SCHEMA as unknown as Record<string, unknown>, {
      system: LIST_SYSTEM,
      webSearch: { maxUses: LIST_WEB_SEARCHES },
      onSources: (u) => (urls = u),
      onUsage: (u) => {
        spent.inputTokens += u.inputTokens;
        spent.outputTokens += u.outputTokens;
        spent.webSearches += u.webSearches;
        onUsage({ ...spent });
      },
      timeoutMs: Math.max(5_000, BUDGET_MS - (Date.now() - started)),
    });
  let out = await ask(`Demande du commercial : ${req.request}`);
  // Réponse de mémoire, sans recherche web (vu sur une demande très large) : une seconde chance.
  if (spent.webSearches === 0 && Date.now() - started < RETRY_BEFORE_MS) {
    out = await ask(`Demande du commercial : ${req.request}\n\nTu n'as fait aucune recherche web : fais-en une avant de répondre, sur une zone ou un secteur précis de la demande.`);
  }
  const seen = new Set(urls);
  const prospects: LightProspect[] = out.prospects
    .map((p) => {
      const sun = p.exposition_soleil;
      const score: Score = {
        soleil: sunScore(sun.niveau, sun.justification.trim(), seen.has(sun.source) ? sun.source : null),
        zone: zoneScore([department(p.departement)]),
      };
      return {
        name: p.nom.trim(),
        city: p.ville.trim() || null,
        department: department(p.departement),
        activity: p.activite.trim() || null,
        sector: isSector(p.secteur) ? p.secteur : "autre",
        website: officialSite(p.site_web),
        rationale: p.pourquoi.trim() || null,
        sources: p.sources.filter((s) => seen.has(s)), // garde-fou : seules les pages réellement consultées
        score,
        scoreTotal: total(score),
      };
    })
    // Une entreprise qu'aucune page consultée ne mentionne est écartée : elle pourrait être inventée.
    .filter((p) => p.name && p.sources.length > 0);

  const inserted = await insertLightProspects(sb, req.id, req.requestedBy, prospects);
  const rejected = out.prospects.length - prospects.length;
  const notes = [
    prospects.length > inserted && `${prospects.length - inserted} déjà dans les fiches`,
    rejected > 0 && `${rejected} écartée${rejected > 1 ? "s" : ""} faute de source vérifiable`,
  ].filter(Boolean);
  return {
    found: inserted,
    message: prospects.length === 0
      ? "Aucune entreprise trouvée avec une page vérifiable : reformulez en précisant une zone ou un secteur."
      : notes.length
        ? `${notes.join(", ")}.`
        : null,
  };
}

async function runEnrichment(sb: SupabaseClient, req: Demande, onUsage: (u: LlmUsage) => void) {
  const started = Date.now();
  const p = req.prospectId ? await getProspectForEnrichment(sb, req.prospectId) : null;
  if (!p) throw new Error("Fiche introuvable.");
  // Les deux sources gratuites d'abord : l'annuaire de l'État pour le légal, le site pour les coordonnées.
  // La ville donnée par la recherche n'est pas toujours celle du siège : sans résultat avec la ville, on
  // cherche le nom seul.
  const searchRegistry = async (): Promise<Company[]> => {
    const withCity = p.city ? await lookup(`${p.name} ${p.city}`).catch(() => []) : [];
    return withCity.length ? withCity : await lookup(p.name).catch(() => []);
  };
  const [candidates, siteAtStart] = await Promise.all([searchRegistry(), readSiteContacts(p.website)]);
  let site: SiteContacts | null = siteAtStart;
  let urls: string[] = [];

  const out = await complete<EnrichOut>(enrichPrompt(p, candidates, site), ENRICH_SCHEMA as unknown as Record<string, unknown>, {
    system: ENRICH_SYSTEM,
    webSearch: { maxUses: ENRICH_WEB_SEARCHES },
    onSources: (u) => (urls = u),
    onUsage,
    timeoutMs: Math.max(5_000, BUDGET_MS - (Date.now() - started)),
  });

  const company = candidates.find((c) => c.siren === out.siren.trim()) ?? null;
  const seenHosts = new Set(urls.map(host).filter(Boolean));
  const proposed = officialSite(out.site_web);
  // Un site proposé par le modèle n'est retenu que si ses recherches y sont réellement passées.
  const website = p.website ?? (proposed && seenHosts.has(host(proposed)) ? proposed : null);
  const ownHost = website ? host(website) : null;
  // Site officiel découvert pendant l'approfondissement : on y lit à notre tour e-mail et téléphone.
  if (!site && website && website !== p.website) site = await readSiteContacts(website);
  const seen = new Set(urls);
  const allowed = (source: string) => seen.has(source) || (ownHost !== null && host(source) === ownHost);

  // Consigne tenue en code : un contact nommé n'est gardé que s'il vient du site de l'entreprise elle-même.
  const c = out.contact;
  const named = c.nom.trim() && ownHost && host(c.source) === ownHost ? { name: c.nom.trim(), role: c.fonction.trim(), source: c.source } : null;
  const email = (named && c.email.trim()) || site?.emails[0] || null;
  const phone = (named && c.telephone.trim()) || site?.phones[0] || null;

  const previous = (p.score ?? {}) as Score;
  const sun = out.exposition_soleil;
  const score: Score = {
    soleil: sun.niveau !== "non_evalue"
      ? sunScore(sun.niveau, sun.justification.trim(), allowed(sun.source) ? sun.source : null)
      : (previous.soleil ?? sunScore("non_evalue", "", null)),
    sante_travail: healthScore(out.sante_travail.trouve && allowed(out.sante_travail.source), out.sante_travail.justification.trim(), out.sante_travail.source),
    salaries: sizeScore(company?.headcountBand ?? null, headcountLabel(company?.headcountBand ?? null), company?.headcountYear ?? null),
    interlocuteur: contactScore(named, (company?.leaders.length ?? 0) > 0),
    sites: sitesScore(company?.openEstablishments ?? null),
    zone: zoneScore([company?.headOffice.department ?? null, p.department]),
  };

  await saveEnrichment(sb, req.prospectId!, {
    siren: company?.siren ?? null,
    legalName: company?.name ?? null,
    headcountBand: company?.headcountBand ?? null,
    headcountYear: company?.headcountYear ?? null,
    openEstablishments: company?.openEstablishments ?? null,
    headOffice: company ? { address: company.headOffice.address, city: company.headOffice.city, department: company.headOffice.department } : null,
    leaders: company?.leaders ?? null,
    website,
    contactName: named?.name ?? null,
    contactRole: named?.role || null,
    contactEmail: email,
    contactPhone: phone,
    contactSource: named?.source ?? (site && (email || phone) ? site.readOn : null),
    siteContacts: site,
    approach: out.angle_approche.trim() || null,
    sources: out.sources.filter(allowed),
    score,
    scoreTotal: total(score),
  });
  return { found: company ? 1 : 0, message: company ? null : "Aucune entreprise de l'annuaire officiel ne correspond : identité non confirmée." };
}

/** Traite une demande : celle indiquée, ou la plus ancienne en attente. */
export async function runAgentTick(sb: SupabaseClient, requestId?: string): Promise<{ processed: string | null }> {
  const req = await claimRequest(sb, requestId);
  if (!req) return { processed: null };
  let usage: LlmUsage = { inputTokens: 0, outputTokens: 0, webSearches: 0 };
  const onUsage = (u: LlmUsage) => (usage = u);
  try {
    const result = req.kind === "recherche" ? await runSearch(sb, req, onUsage) : await runEnrichment(sb, req, onUsage);
    await finishRequest(sb, req.id, { foundCount: result.found, message: result.message, usage });
    if (req.kind === "recherche" && req.conversationId) {
      await appendConversationMessage(sb, req.conversationId, {
        role: "assistant",
        content: resultMessage(req.request, result, await listFoundNames(sb, req.id)),
      });
    }
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    await failRequest(sb, req.id, message, usage);
    if (req.kind === "recherche" && req.conversationId) {
      await appendConversationMessage(sb, req.conversationId, {
        role: "assistant",
        content: `La recherche « ${req.request} » n'a pas abouti : ${message} Vous pouvez la relancer.`,
      });
    }
  }
  return { processed: req.id };
}

const NAMES_SHOWN = 10; // noms cités dans le chat ; les autres sont comptés

/** Ce que Merx écrit dans le chat à la fin d'une recherche. */
export function resultMessage(request: string, result: { found: number; message: string | null }, names: string[]): string {
  if (!result.found) return `Aucun nouveau prospect pour « ${request} ». ${result.message ?? ""}`.trim();
  const shown = names.slice(0, NAMES_SHOWN);
  const rest = result.found - shown.length;
  const list = shown.map((n) => `• ${n}`).join("\n");
  return [
    `Trouvé ${result.found} prospect${result.found > 1 ? "s" : ""} pour « ${request} » :`,
    list + (rest > 0 ? `\n… et ${rest} autre${rest > 1 ? "s" : ""}` : ""),
    `Ils sont dans Prospects.${result.message ? ` ${result.message}` : ""}`,
  ].join("\n\n");
}
