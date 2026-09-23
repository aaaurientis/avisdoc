// Merx au travail : une demande, un traitement, sous la coupure de l'hébergeur.
//   recherche         — une requête au modèle, deux recherches web au plus, rend une liste de fiches légères ;
//   approfondissement — à la demande, sur une fiche : l'annuaire officiel et le site de l'entreprise (gratuits)
//                       d'abord, le modèle ne cherche plus que ce qui manque (trois recherches web au plus).
// Budget : une edge function Supabase tient 150 s (400 s en payant) ; on se borne à 120 s pour finir proprement.

import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { headcountLabel, lookup, searchByCriteria, type Company, type Criteria, type Found } from "./annuaire.ts";
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
import { complete, model, type LlmUsage, type Usage } from "./llm.ts";
import {
  CRITERES_SCHEMA,
  CRITERES_SYSTEM,
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
import { metierDe } from "./metiers.ts";
import { contactScore, healthScore, isSector, sitesScore, sizeScore, sunScore, total, zoneScore, type Score } from "./scoring.ts";

/** Ce que le commercial lit quand ça échoue : jamais un message technique en anglais. */
function enClair(message: string): string {
  if (/duplicate key|unique constraint/i.test(message)) return "ces entreprises sont déjà dans vos fiches.";
  if (/rate.?limit|429|overloaded/i.test(message)) return "le service est momentanément saturé, réessayez dans un instant.";
  // Un dépassement, c'est presque toujours un périmètre trop vaste. Le dire, plutôt
  // que d'annoncer un nombre de secondes qui n'apprend rien.
  if (/pas de réponse en/i.test(message)) {
    return "la recherche était trop large pour aboutir : reprenez-la sur un seul département, ou un seul métier.";
  }
  if (/ANTHROPIC_API_KEY/i.test(message)) return "la clé du modèle n'est pas configurée sur le projet.";
  // Une erreur inattendue reste consignée telle quelle dans la demande (écran Coûts) ; ici, on reste lisible.
  if (/[a-z]{4,}\s+[a-z]{4,}\s+[a-z]{4,}/i.test(message) && !/[éèàçùê]/i.test(message)) {
    return "une erreur technique est survenue ; elle est consignée dans la demande.";
  }
  return message;
}

// L'hébergeur coupe à 150 s. On s'arrête à 140 pour garder de quoi écrire le résultat :
// à 120, une recherche large partait à la poubelle après deux minutes de travail.
const BUDGET_MS = 140_000;

/** Quel modèle sert à quelle sorte de demande : sert à enregistrer le bon tarif. */
const modeleDe = (kind: string): Usage => (kind === "approfondissement" ? "approfondissement" : "recherche");
// Sonnet cherche vraiment : on lui en laisse les moyens. Deux recherches donnaient
// « trois noms à la ramasse » ; il en faut plusieurs pour croiser annuaires, presse
// locale et fédérations professionnelles.
//
// Ramené de six à quatre le 23/09, en démonstration : chaque recherche verse le
// contenu des pages dans le contexte, et à six la demande atteignait 178 000 jetons
// d'entrée pour 135 secondes — au ras du budget de 140. Une réponse en une minute et
// demie avec quatre ou cinq fiches vaut mieux qu'une réponse en deux minutes et
// quart qui risque d'expirer.
const LIST_WEB_SEARCHES = 4;
const RETRY_BEFORE_MS = 60_000; // seconde tentative seulement s'il reste le temps d'une recherche
// Approfondir, c'est le travail d'Opus : site, mentions légales, presse, réseaux.
const ENRICH_WEB_SEARCHES = 6;
// Au-delà, le commercial ne traite plus — et chaque page du registre est un appel.
const REGISTRE_MAX = 100;

// Plateformes prises à tort pour un site officiel (annuaires, recrutement, réseaux).
const PLATFORMS = ["linkedin.com", "facebook.com", "werecruit.io", "societe.com", "pappers.fr", "verif.com", "manageo.fr", "infonet.fr", "kompass.com", "pagesjaunes.fr", "usinenouvelle.com"];
const isPlatform = (url: string) => {
  const h = host(url);
  return h === null || PLATFORMS.some((p) => h === p || h.endsWith(`.${p}`));
};
const officialSite = (url: string) => (url.trim() && !isPlatform(url.trim()) ? url.trim() : null);

/** « OLIVIER DE GUYENRO » → « Olivier De Guyenro » : le registre écrit tout en capitales. */
const sansCapitales = (nom: string) =>
  nom.toLowerCase().replace(/(^|[\s'-])([a-zà-ÿ])/g, (_, avant, lettre) => avant + lettre.toUpperCase());

/** Les formes juridiques : le registre range aussi des sociétés parmi les dirigeants. */
const EST_UNE_SOCIETE = /\b(sarl|sas|sasu|sa|sci|eurl|snc|selarl|société|societe|holding|groupe|group)\b/i;

/**
 * Le dirigeant à appeler, quand aucun contact n'a été trouvé sur le web.
 *
 * On ne retient qu'une personne physique : le registre liste aussi des sociétés
 * mères comme dirigeantes, et « LES FERMES DE GALLY » ne décroche pas le téléphone.
 */
function dirigeantDuRegistre(company: Company | null): { name: string; role: string; source: string } | null {
  const d = company?.leaders.find((l) => l.name && !EST_UNE_SOCIETE.test(l.name) && l.name.trim().includes(" "));
  if (!d || !company) return null;
  return {
    name: sansCapitales(d.name.trim()),
    role: d.role ? sansCapitales(d.role) : "Dirigeant",
    source: `https://annuaire-entreprises.data.gouv.fr/entreprise/${company.siren}`,
  };
}
const department = (code: string) => (/^(\d{2}|2A|2B|97\d)$/.test(code.trim()) ? code.trim() : null);

/**
 * La demande du commercial, traduite en critères de registre.
 *
 * Un appel court — deux secondes, pas de recherche web — pour extraire ce que
 * l'annuaire sait filtrer : une famille d'activités, des départements, un effectif.
 * On ne lui demande pas de trouver des entreprises : c'est le registre qui les a.
 */
async function lireLesCriteres(demande: string, onUsage: (u: LlmUsage) => void): Promise<Criteria | null> {
  try {
    const out = await complete<{ section: string; codes_naf: string[]; departements: string[]; effectif_min: number }>(
      `Demande du commercial : ${demande}`,
      CRITERES_SCHEMA as unknown as Record<string, unknown>,
      { usage: "recherche", system: CRITERES_SYSTEM, onUsage, timeoutMs: 25_000 },
    );
    const departments = (out.departements ?? []).map((d) => department(d)).filter((d): d is string => d !== null);
    const nafCodes = (out.codes_naf ?? []).filter((c) => /^\d{2}\.\d{2}[A-Z]?$/.test(c.trim()));
    const section = /^[A-U]$/.test((out.section ?? "").trim()) ? out.section.trim() : null;
    // Le métier est indispensable ; la zone ne l'est pas. Une liste de départements
    // vide vaut « toute la France » — le registre accepte de chercher sans zone, et
    // une région n'est rien d'autre qu'une poignée de départements.
    if (!nafCodes.length && !section) return null;
    return { section, nafCodes, departments, minHeadcount: out.effectif_min > 0 ? out.effectif_min : null };
  } catch {
    return null; // le registre est un bonus : s'il échoue, la recherche web prend le relais
  }
}

/**
 * Les entreprises du registre, notées sans modèle.
 *
 * Le code d'activité dit le métier, donc l'exposition ; la tranche INSEE dit la
 * taille ; le nombre d'établissements dit l'implantation. Trois critères sur six sont
 * ainsi remplis par des faits, et non par une lecture de page.
 */
function versFiches(trouvees: Found[]): LightProspect[] {
  const fiches: LightProspect[] = [];
  for (const c of trouvees) {
    // Une activité que notre table ne connaît pas ne fait PAS disparaître l'entreprise :
    // elle existe, elle est dans la zone, elle a le bon effectif. On la garde en disant
    // qu'on n'a pas évalué son exposition — l'approfondissement tranchera. Jeter une
    // fiche faute de savoir, c'était rendre « aucun résultat » sur deux cent trente-sept
    // entreprises bien réelles.
    const metier = metierDe(c.activityCode) ?? {
      secteur: "autre" as const,
      soleil: "non_evalue" as const,
      affinite: "non_evalue" as const,
      activite: c.activityCode ? `Activité ${c.activityCode}` : "Activité non précisée",
      pourquoi: "",
    };

    // L'établissement de la zone demandée prime sur le siège : c'est là qu'on ira.
    const local = c.localSites[0] ?? c.headOffice;
    const source = `https://annuaire-entreprises.data.gouv.fr/entreprise/${c.siren}`;

    const score: Score = {
      soleil: sunScore(metier.soleil, metier.pourquoi, source, {
        niveau: metier.affinite,
        justification: metier.pourquoi,
        source,
      }),
      salaries: sizeScore(c.headcountBand, headcountLabel(c.headcountBand), c.headcountYear),
      sites: sitesScore(c.openEstablishments),
      zone: zoneScore([local.department ?? c.headOffice.department]),
    };

    const autresSites = c.localSites.length > 1 ? `${metier.pourquoi ? " · " : ""}${c.localSites.length} établissements dans la zone` : "";
    fiches.push({
      name: c.name,
      city: local.city ?? c.headOffice.city,
      department: local.department ?? c.headOffice.department,
      activity: metier.activite,
      sector: metier.secteur,
      website: null, // le registre ne le donne pas : l'approfondissement ira le chercher
      rationale: `${metier.pourquoi}${autresSites}`.trim() || null,
      sources: [source],
      score,
      scoreTotal: total(score),
    });
  }
  return fiches;
}

async function runSearch(sb: SupabaseClient, req: Demande, onUsage: (u: LlmUsage) => void) {
  const started = Date.now();
  let urls: string[] = [];
  const spent: LlmUsage = { inputTokens: 0, outputTokens: 0, webSearches: 0 };
  const ask = (prompt: string) =>
    complete<ListOut>(prompt, LIST_SCHEMA as unknown as Record<string, unknown>, {
      usage: "recherche",
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
  // Le registre d'abord : deux cents entreprises exactes en une seconde, là où le web
  // en devine sept en deux minutes. Le modèle ne sert plus qu'à lire la demande.
  const criteres = await lireLesCriteres(req.request, (u) => {
    spent.inputTokens += u.inputTokens;
    spent.outputTokens += u.outputTokens;
    onUsage({ ...spent });
  });
  if (criteres) {
    const trouvees = await searchByCriteria(criteres, REGISTRE_MAX);
    const fiches = versFiches(trouvees);
    if (fiches.length > 0) {
      const inserted = await insertLightProspects(sb, req.id, req.requestedBy, fiches);
      const deja = fiches.length - inserted;
      return {
        found: inserted,
        message: [
          `${fiches.length} entreprise${fiches.length > 1 ? "s" : ""} au registre officiel`,
          deja > 0 ? `${deja} déjà dans vos fiches` : null,
          trouvees.length > fiches.length ? `${trouvees.length - fiches.length} d’une activité non reconnue` : null,
        ].filter(Boolean).join(" · ") + ".",
      };
    }
  }

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
        // Exposé au soleil OU concerné par son métier : on retient le meilleur des deux.
        soleil: sunScore(sun.niveau, sun.justification.trim(), seen.has(sun.source) ? sun.source : null, {
          niveau: p.affinite_prevention?.niveau ?? "non_evalue",
          justification: p.affinite_prevention?.justification?.trim() ?? "",
          source: seen.has(p.affinite_prevention?.source ?? "") ? p.affinite_prevention.source : null,
        }),
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
    usage: "approfondissement",
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

  // Un contact nommé doit venir d'une page vérifiable. Le site de l'entreprise est la
  // source la plus sûre ; une page réellement consultée l'est aussi, à condition que ce
  // ne soit pas un annuaire qui recopie le registre — on n'y apprend rien et les
  // fonctions y sont souvent périmées.
  const sourceFiable = (source: string): boolean => {
    const h = host(source);
    if (!h) return false;
    if (ownHost && h === ownHost) return true;
    return seen.has(source) && !isPlatform(source);
  };

  const c = out.contact;
  const named = c.nom.trim() && sourceFiable(c.source)
    ? { name: c.nom.trim(), role: c.fonction.trim(), source: c.source }
    : null;

  // À défaut, le dirigeant du registre. Sur une PME — et l'essentiel des cibles en
  // sont —, c'est lui qui décide d'une campagne, et son nom est un fait public. Sans
  // ce repli, la fiche affichait « aucun interlocuteur » alors que le registre en
  // donnait deux, et le commercial appelait sans savoir qui demander.
  const contact = named ?? dirigeantDuRegistre(company);

  const email = (named && c.email.trim()) || site?.emails[0] || null;
  const phone = (named && c.telephone.trim()) || site?.phones[0] || null;

  const previous = (p.score ?? {}) as Score;
  const sun = out.exposition_soleil;
  const score: Score = {
    soleil: sun.niveau !== "non_evalue"
      ? sunScore(sun.niveau, sun.justification.trim(), allowed(sun.source) ? sun.source : null, {
          niveau: out.affinite_prevention?.niveau ?? "non_evalue",
          justification: out.affinite_prevention?.justification?.trim() ?? "",
          source: allowed(out.affinite_prevention?.source ?? "") ? out.affinite_prevention.source : null,
        })
      : (previous.soleil ?? sunScore("non_evalue", "", null)),
    sante_travail: healthScore(out.sante_travail.trouve && allowed(out.sante_travail.source), out.sante_travail.justification.trim(), out.sante_travail.source),
    salaries: sizeScore(company?.headcountBand ?? null, headcountLabel(company?.headcountBand ?? null), company?.headcountYear ?? null),
    interlocuteur: contactScore(contact, (company?.leaders.length ?? 0) > 0),
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
    contactName: contact?.name ?? null,
    contactRole: contact?.role || null,
    contactEmail: email,
    contactPhone: phone,
    contactSource: contact?.source ?? (site && (email || phone) ? site.readOn : null),
    siteContacts: site,
    approach: out.angle_approche.trim() || null,
    dossier: out.dossier ?? null,
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
    await finishRequest(sb, req.id, { foundCount: result.found, message: result.message, usage, model: model(modeleDe(req.kind)) });
    if (req.kind === "recherche" && req.conversationId) {
      await appendConversationMessage(sb, req.conversationId, {
        role: "assistant",
        content: resultMessage(req.request, result, await listFoundNames(sb, req.id)),
      });
    }
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    await failRequest(sb, req.id, message, usage, model(modeleDe(req.kind)));
    if (req.kind === "recherche" && req.conversationId) {
      await appendConversationMessage(sb, req.conversationId, {
        role: "assistant",
        content: `La recherche « ${req.request} » n'a pas abouti : ${enClair(message)} Vous pouvez la relancer.`,
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
