// Merx au travail : une demande, un traitement, sous la coupure de l'hébergeur.
//   recherche         — une requête au modèle, deux recherches web au plus, rend une liste de fiches légères ;
//   approfondissement — à la demande, sur une fiche : l'annuaire officiel et le site de l'entreprise (gratuits)
//                       d'abord, le modèle ne cherche plus que ce qui manque (trois recherches web au plus).
// Budget : une edge function Supabase tient 150 s (400 s en payant) ; on se borne à 120 s pour finir proprement.

import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { headcountLabel, lookup, searchByCriteria, type Company, type Criteria, type Establishment, type Found } from "./annuaire.ts";
import {
  appendConversationMessage,
  claimRequest,
  failRequest,
  finishRequest,
  completeProspect,
  getProspectForEnrichment,
  loadProspect,
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
  suitePrompt,
  SUITE_SYSTEM,
  type ListOut,
  type Preuve,
} from "./prompts.ts";
import { readSiteContacts, type SiteContacts } from "./site-contacts.ts";
import { metierDe, secteurDe } from "./metiers.ts";
import { libelleNaf } from "./naf.ts";
import { chercherLieu, chercherLieux, echecPlaces } from "./places.ts";
import { champsPappers, chercherPappers, chercherPappersEnLot, echecPappers } from "./pappers.ts";
import { deLaRecherche, fiabilite } from "./fiabilite.ts";
import { deploiementScore, dirigeantScore, expositionScore, indexEgalite, isSector, notable, peauScore, populationScore, signauxOfficiels, surPreuve, total, type CriterionScore, type Score } from "./scoring.ts";

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
/**
 * Combien de personnes sur le site où le commercial ira.
 *
 * L'annuaire donne un effectif par établissement ET un effectif d'entreprise. Alliance
 * Healthcare affiche « 1000 à 1999 salariés » quand son site de Richwiller en compte
 * six à neuf : promettre le premier chiffre à un commercial, c'est lui faire préparer
 * une campagne de dépistage pour une agence de huit personnes.
 */
function populationDuSite(local: Establishment, c: Found) {
  const duSite = local.headcountBand && local.headcountBand !== "NN" ? local.headcountBand : null;
  return duSite
    ? populationScore(duSite, true, local.headcountYear)
    : populationScore(c.headcountBand, false, c.headcountYear);
}

async function versFiches(trouvees: Found[]): Promise<LightProspect[]> {
  // Le standard, l'adresse exacte et le site officiel de toutes les entreprises d'un
  // coup. Sans cela la recherche rendait des fiches sans un numéro à composer — moins
  // utiles qu'une recherche Google, et personne n'en faisait rien.
  // Deux sources en parallèle, chacune pour ce qu'elle sait faire. Google Places donne
  // le standard et l'adresse exacte ; Pappers donne le site officiel, le téléphone et
  // parfois l'adresse électronique. Aucune ne suffit seule, et l'une comme l'autre peut
  // échouer sans conséquence — ce qui manque sera dit, plus jamais tu.
  const [lieux, pappers] = await Promise.all([
    chercherLieux(trouvees.map((c) => ({ cle: c.siren, nom: c.name, ville: (c.localSites[0] ?? c.headOffice).city }))),
    chercherPappersEnLot(trouvees.map((c) => c.siren).filter(Boolean)),
  ]);

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
      activite: "",
      pourquoi: "",
    };

    // L'établissement de la zone demandée prime sur le siège : c'est là qu'on ira.
    const local = c.localSites[0] ?? c.headOffice;
    const source = `https://annuaire-entreprises.data.gouv.fr/entreprise/${c.siren}`;

    // L'étape 2 de la grille commerciale — la pertinence AvisDoc, soixante points —
    // est la seule que le registre suffise à établir. Maturité prévention et
    // accessibilité commerciale se lisent sur le site de l'entreprise : elles restent
    // non évaluées tant que la fiche n'est pas approfondie, et la note le montre.
    const lieu = lieux.get(c.siren) ?? null;
    const pap = pappers.get(c.siren) ?? null;
    // Le dirigeant du registre : sur cent entreprises de travaux publics, quatre-vingt-
    // une en publient un, et nous ne l'affichions pas. Pappers complète quand il a mieux.
    const dirigeant = c.leaders[0] ?? (pap?.dirigeants[0] ? { name: pap.dirigeants[0].nom, role: pap.dirigeants[0].role } : null);
    const telephone = pap?.telephone ?? lieu?.telephone ?? null;
    const site = pap?.site ?? lieu?.site ?? null;

    const score: Score = {
      // Étape 2 — la pertinence, que le registre suffit à établir.
      exposition: expositionScore(metier.soleil, metier.pourquoi, source),
      population: populationDuSite(local, c),
      peau: peauScore(metier.affinite, metier.pourquoi, source),
      deploiement: deploiementScore(c.openEstablishments),
      // Étape 3 — ce que l'État publie déjà de leurs démarches, gratuitement.
      politique_sst: signauxOfficiels(c.signals),
      instances: indexEgalite(c.signals.egalite),
      // Étape 4 — un dirigeant nommé vaut mieux qu'une fiche sans personne à qui parler.
      interlocuteur: dirigeantScore(dirigeant),
      coordonnees: telephone || pap?.email
        ? {
            points: pap?.email && telephone ? 4 : 2,
            justification: [telephone, pap?.email].filter(Boolean).join(" · ") +
              ` — ${pap?.telephone || pap?.email ? "fiche Pappers" : "fiche d’établissement Google"}.`,
            source: pap?.source ?? lieu?.source ?? null,
          }
        : { points: null, justification: "Aucun numéro trouvé : l’approfondissement ira le chercher.", source: null },
    };

    const autresSites = c.localSites.length > 1 ? `${metier.pourquoi ? " · " : ""}${c.localSites.length} établissements dans la zone` : "";
    fiches.push({
      name: c.name,
      city: local.city ?? c.headOffice.city,
      department: local.department ?? c.headOffice.department,
      // Deux niveaux, qui ne disent pas la même chose : le SECTEUR situe l'entreprise
      // (Construction, Santé, Industrie…), l'ACTIVITÉ dit son métier (construction de
      // routes, fabrication de matériel médical). Le secteur se déduit du code
      // d'activité et couvre toute la nomenclature : aucune fiche n'en manque.
      // Le libellé officiel d'abord : l'annuaire rend « 21.20Z », le commercial lit
      // « Fabrication de préparations pharmaceutiques ». Jamais le code nu en colonne.
      activity: libelleNaf(c.activityCode) || metier.activite || null,
      sector: secteurDe(c.activityCode),
      siren: c.siren,
      website: site,
      contactName: dirigeant?.name ?? null,
      contactRole: dirigeant?.role ?? null,
      contactPhone: telephone,
      contactEmail: pap?.email ?? null,
      contactSource: pap?.source ?? lieu?.source ?? null,
      headOffice: { address: lieu?.adresse ?? c.headOffice.address, city: c.headOffice.city, department: c.headOffice.department },
      leaders: c.leaders,
      // Ce que l'État publie et qu'on ne sait pas encore afficher : on le garde.
      registre: c.registre,
      headcountBand: local.headcountBand && local.headcountBand !== "NN" ? local.headcountBand : c.headcountBand,
      headcountYear: local.headcountYear ?? c.headcountYear,
      openEstablishments: c.openEstablishments,
      rationale: `${metier.pourquoi}${autresSites}`.trim() || null,
      sources: [source, lieu?.source, pap?.source].filter(Boolean) as string[],
      // La note de fiabilité n'a de sens que depuis que la fiche est remplie : le
      // registre, Pappers et Google se recoupent, et c'est ce recoupement qu'elle
      // mesure. Une fiche sans rien d'établi n'obtient pas une mauvaise note : aucune.
      fiabilite: fiabilite(
        deLaRecherche({
          siren: c.siren,
          villeConfirmee: c.localSites.length > 0,
          activite: c.activityCode,
          effectifDuSite: Boolean(local.headcountBand && local.headcountBand !== "NN"),
          effectif: local.headcountBand ?? c.headcountBand,
          site,
          siteRecoupe: Boolean(pap?.site && lieu?.site),
          dirigeant: dirigeant?.name ?? null,
          dirigeantRecoupe: Boolean(c.leaders[0] && pap?.dirigeants.length),
          email: pap?.email ?? null,
          telephone,
          telephoneRecoupe: Boolean(pap?.telephone && lieu?.telephone),
        }),
      ),
      score,
      // Pas de note sur une fiche qu'on ne peut pas juger. Sans savoir ce que fait
      // l'entreprise ni combien de personnes y travaillent, toute note serait inventée.
      scoreTotal: notable(score) ? total(score) : null,
    });
  }
  return fiches;
}

/**
 * Ce que Merx dit au commercial une fois la liste rendue.
 *
 * Il nomme les meilleures, signale ce qui saute aux yeux, et propose deux ou trois
 * suites concrètes. Sans cela, la conversation s'arrête sur un compteur et le
 * commercial reste devant deux cents lignes sans savoir par où commencer.
 *
 * L'appel est court et son échec est sans conséquence : la liste est déjà enregistrée.
 */
async function accompagner(
  demande: string,
  fiches: LightProspect[],
  ecartees: number,
  onUsage: (u: LlmUsage) => void,
): Promise<string | null> {
  try {
    const meilleures = [...fiches]
      .sort((a, b) => (b.scoreTotal ?? -1) - (a.scoreTotal ?? -1))
      .slice(0, 12)
      .map((f) => ({
        nom: f.name,
        ville: f.city,
        activite: f.activity,
        effectif: headcountLabel(f.headcountBand ?? null),
        note: f.scoreTotal,
        dirigeant: f.contactName ? `${f.contactName}${f.contactRole ? `, ${f.contactRole}` : ""}` : null,
      }));
    const sansEffectif = fiches.filter((f) => !f.headcountBand || f.headcountBand === "NN").length;
    const out = await complete<{ suite: string }>(
      suitePrompt(demande, { total: fiches.length, ecartees, sansEffectif }, meilleures),
      { type: "object", additionalProperties: false, required: ["suite"], properties: { suite: { type: "string" } } },
      { system: SUITE_SYSTEM, usage: "chat", onUsage, timeoutMs: 30_000 },
    );
    return out.suite.trim() || null;
  } catch {
    return null; // la liste est enregistrée : un mot d'accompagnement manquant n'est pas une panne
  }
}

/**
 * Compléter une fiche déjà créée, sans appeler de modèle.
 *
 * Les fiches d'avant ont été créées quand la recherche ne rendait qu'un nom et une
 * ville : ni dirigeant, ni téléphone, ni note de fiabilité. Les approfondir coûterait
 * douze centimes pièce et une trentaine de secondes ; les repasser par le registre et
 * Pappers ne coûte presque rien et prend deux secondes.
 *
 * On ne remplace jamais une information déjà présente : on ne fait qu'ajouter ce qui
 * manquait, puis on note ce que la fiche avance.
 */
async function runCompletion(sb: SupabaseClient, req: Demande) {
  const p = await loadProspect(sb, req.prospectId!);
  if (!p) return { found: 0, message: "Fiche introuvable." };

  // Le SIREN de la fiche, ou celui que son nom permet de retrouver au registre.
  const candidats = p.siren ? await lookup(p.siren) : await lookup([p.name, p.city].filter(Boolean).join(" "));
  const c = candidats[0] ?? null;
  if (!c) return { found: 0, message: "Aucune entreprise du registre officiel ne correspond : identité non confirmée." };

  const [pap, lieu] = await Promise.all([
    chercherPappers(c.siren),
    chercherLieu(c.name, c.headOffice.city),
  ]);

  const dirigeant = c.leaders[0] ?? (pap?.dirigeants[0] ? { name: pap.dirigeants[0].nom, role: pap.dirigeants[0].role } : null);
  const telephone = pap?.telephone ?? lieu?.telephone ?? null;
  const site = pap?.site ?? lieu?.site ?? null;

  const note = fiabilite(
    deLaRecherche({
      siren: c.siren,
      villeConfirmee: Boolean(c.headOffice.city && p.city && c.headOffice.city.toUpperCase() === p.city.toUpperCase()),
      activite: c.activityCode,
      effectifDuSite: false,
      effectif: c.headcountBand,
      site: site ?? p.website,
      siteRecoupe: Boolean(pap?.site && lieu?.site),
      dirigeant: dirigeant?.name ?? p.contactName ?? null,
      dirigeantRecoupe: Boolean(c.leaders[0] && pap?.dirigeants.length),
      email: pap?.email ?? p.contactEmail ?? null,
      telephone: telephone ?? p.contactPhone,
      telephoneRecoupe: Boolean(pap?.telephone && lieu?.telephone),
    }),
  );

  await completeProspect(sb, req.prospectId!, {
    siren: c.siren,
    legalName: c.name,
    headcountBand: c.headcountBand,
    headcountYear: c.headcountYear,
    openEstablishments: c.openEstablishments,
    headOffice: { address: lieu?.adresse ?? c.headOffice.address, city: c.headOffice.city, department: c.headOffice.department },
    leaders: c.leaders,
    registre: c.registre,
    website: site,
    contactName: dirigeant?.name ?? null,
    contactRole: dirigeant?.role ?? null,
    contactPhone: telephone,
    contactEmail: pap?.email ?? null,
    contactSource: pap?.source ?? lieu?.source ?? null,
    reliability: note?.note ?? null,
    reliabilityDetail: note?.details ?? null,
  });

  const trouve = [
    dirigeant ? "dirigeant" : null,
    telephone ? "téléphone" : null,
    pap?.email ? "e-mail" : null,
    site ? "site" : null,
  ].filter(Boolean);
  return {
    found: 1,
    message:
      (trouve.length ? `Complétée : ${trouve.join(", ")}.` : "Rien de plus que le registre.") +
      (note ? ` Fiabilité ${note.note}/10.` : "") +
      (echecPappers() ? ` Pappers : ${echecPappers()}.` : ""),
  };
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
    const { found: trouvees, ignores } = await searchByCriteria(criteres, REGISTRE_MAX);
    const fiches = await versFiches(trouvees);
    if (fiches.length > 0) {
      const inserted = await insertLightProspects(sb, req.id, req.requestedBy, fiches);
      const deja = fiches.length - inserted;

      // Pappers a-t-il servi à quelque chose ? Sinon on le dit, avec ce qu'il a envoyé.
      const pappersUtile = fiches.some((f) => f.contactPhone || f.contactEmail || f.website);
      const compte = [
        `${fiches.length} entreprise${fiches.length > 1 ? "s" : ""} au registre officiel`,
          `${fiches.length} entreprise${fiches.length > 1 ? "s" : ""} au registre officiel`,
          deja > 0 ? `${deja} déjà dans vos fiches` : null,
          trouvees.length > fiches.length ? `${trouvees.length - fiches.length} d’une activité non reconnue` : null,
          // Dit, jamais tu : le commercial doit savoir qu'on a écarté des entreprises
          // qui ne sont plus dans sa zone, sinon il croit la recherche incomplète.
          ignores > 0 ? `${ignores} écartée${ignores > 1 ? "s" : ""} : plus d’établissement ouvert dans la zone` : null,
          // Si le standard n'a pas pu être cherché, on le dit : une fiche sans numéro
          // n'est pas une fatalité, c'est une panne qu'il faut pouvoir réparer.
          echecPlaces() ? `Google Places : ${echecPlaces()}` : null,
          echecPappers() ? `Pappers : ${echecPappers()}` : null,
          // Pappers répond mais ne rend ni téléphone, ni e-mail, ni site : on affiche
          // ce que la formule souscrite a réellement envoyé, plutôt que de le deviner.
          !echecPappers() && champsPappers().length > 0 && !pappersUtile
            ? `Pappers a répondu sans coordonnées — champs reçus : ${champsPappers().slice(0, 25).join(", ")}`
            : null,
      ].filter(Boolean).join(" · ") + ".";

      // Un compteur n'est pas un accompagnement. Merx nomme les meilleures, dit ce qui
      // saute aux yeux, et propose ce que le commercial peut demander ensuite — un
      // effectif, un métier voisin, un autre département. Un appel court, quelques
      // centimes, et le commercial sait par où commencer.
      const suite = await accompagner(req.request, fiches, ignores, (u) => {
        spent.inputTokens += u.inputTokens;
        spent.outputTokens += u.outputTokens;
        onUsage({ ...spent });
      });

      return { found: inserted, message: suite ? `${compte}\n\n${suite}` : compte };
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
        exposition: expositionScore(sun.niveau, sun.justification.trim(), seen.has(sun.source) ? sun.source : null),
        peau: peauScore(
          p.affinite_prevention?.niveau ?? "non_evalue",
          p.affinite_prevention?.justification?.trim() ?? "",
          seen.has(p.affinite_prevention?.source ?? "") ? p.affinite_prevention.source : null,
        ),
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
  // Trois sources en parallèle : le registre pour le légal, le site pour les
  // coordonnées publiées, Google pour le téléphone du standard — celui qu'on compose.
  const [candidates, siteAtStart, lieu] = await Promise.all([
    searchRegistry(),
    readSiteContacts(p.website),
    chercherLieu(p.name, p.city),
  ]);
  let site: SiteContacts | null = siteAtStart;
  let urls: string[] = [];

  const out = await complete<EnrichOut>(enrichPrompt(p, candidates, site, lieu), ENRICH_SCHEMA as unknown as Record<string, unknown>, {
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
  const website = p.website ?? (proposed && seenHosts.has(host(proposed)) ? proposed : null) ?? officialSite(lieu?.site ?? "");
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
  // Le téléphone : celui d'une personne nommée d'abord, puis celui publié sur le
  // site, puis le standard trouvé par Google. Avant, faute des deux premiers, la
  // fiche restait sans numéro et le conseil « appelez le standard » était vide.
  const phone = (named && c.telephone.trim()) || site?.phones[0] || lieu?.telephone || null;

  const previous = (p.score ?? {}) as Score;
  const sun = out.exposition_soleil;

  /** Un critère de maturité prévention, jugé sur la page qui l'atteste. */
  const preuve = (id: "politique_sst" | "actions_recentes" | "instances" | "actualite_contact", v: Preuve) =>
    surPreuve(id, v.trouve && allowed(v.source), v.niveau, v.justification.trim(), allowed(v.source) ? v.source : null);

  /**
   * L'interlocuteur, sur sept points. La grille dit : « privilégier la personne réellement
   * compétente plutôt qu'un titre générique » — QHSE, médecin ou infirmier du travail,
   * RH, RSE. Un dirigeant tiré du registre vaut moins : il décide, mais il faudra
   * encore qu'il transmette.
   */
  const FONCTIONS_UTILES = /qhse|hse|qsse|sécurit|securit|préven|preven|santé|sante|infirm|médec|medec|rh\b|ressources humaines|drh|rse|qvct|social/i;
  const interlocuteurScore = (): CriterionScore => {
    if (!contact?.name) return { points: 0, justification: "Aucun interlocuteur identifié.", source: null };
    const pertinent = FONCTIONS_UTILES.test(contact.role ?? "");
    if (named) {
      return {
        points: pertinent ? 7 : 5,
        justification: `${contact.name}${contact.role ? `, ${contact.role}` : ""}${pertinent ? " — fonction directement concernée" : " — nommé sur une page vérifiée"}.`,
        source: named.source,
      };
    }
    return { points: 3, justification: `${contact.name}, dirigeant au registre — il décide, mais il faudra qu'il transmette.`, source: null };
  };

  /** Les coordonnées, sur cinq. Une adresse vérifiée n'est pas une adresse déduite. */
  const coordonneesScore = (): CriterionScore => {
    const nominatif = Boolean(email && named && c.email.trim() === email);
    const surSite = Boolean(email && site?.emails.includes(email));
    if (nominatif && phone) return { points: 5, justification: "E-mail nominatif et téléphone, relevés sur une page vérifiée.", source: named?.source ?? null };
    if ((nominatif || surSite) && phone) return { points: 4, justification: "E-mail publié par l'entreprise et téléphone.", source: site?.readOn ?? null };
    if (email && phone) return { points: 3, justification: "E-mail et téléphone relevés, sans certitude sur le destinataire.", source: site?.readOn ?? null };
    if (email || phone) return { points: 2, justification: email ? "E-mail seul." : "Standard seul — il faudra demander le service.", source: site?.readOn ?? null };
    return { points: 0, justification: "Aucune coordonnée trouvée.", source: null };
  };

  const score: Score = {
    // Étape 2 — la pertinence. L'approfondissement affine ce que le registre avançait,
    // mais ne l'efface pas : un critère qu'on n'a pas su juger garde son jugement d'avant.
    exposition:
      sun.niveau !== "non_evalue"
        ? expositionScore(sun.niveau, sun.justification.trim(), allowed(sun.source) ? sun.source : null)
        : (previous.exposition ?? expositionScore("non_evalue", "", null)),
    population: populationScore(company?.headcountBand ?? null, false, company?.headcountYear ?? null),
    peau:
      out.affinite_prevention?.niveau && out.affinite_prevention.niveau !== "non_evalue"
        ? peauScore(out.affinite_prevention.niveau, out.affinite_prevention.justification?.trim() ?? "", allowed(out.affinite_prevention.source) ? out.affinite_prevention.source : null)
        : (previous.peau ?? peauScore("non_evalue", "", null)),
    deploiement: deploiementScore(company?.openEstablishments ?? null),
    // Étape 3 — maturité prévention.
    politique_sst: preuve("politique_sst", out.politique_sst),
    actions_recentes: preuve("actions_recentes", out.actions_recentes),
    instances: preuve("instances", out.instances),
    // Étape 4 — accessibilité commerciale.
    interlocuteur: interlocuteurScore(),
    coordonnees: coordonneesScore(),
    actualite_contact: preuve("actualite_contact", out.contact_confirme),
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
    const result =
      req.kind === "recherche" ? await runSearch(sb, req, onUsage)
      : req.kind === "completion" ? await runCompletion(sb, req)
      : await runEnrichment(sb, req, onUsage);
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
