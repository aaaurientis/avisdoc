// Merx au travail : une demande, un traitement, sous la coupure de l'hébergeur.
//   recherche         — une requête au modèle, deux recherches web au plus, rend une liste de fiches légères ;
//   approfondissement — à la demande, sur une fiche : l'annuaire officiel et le site de l'entreprise (gratuits)
//                       d'abord, le modèle ne cherche plus que ce qui manque (trois recherches web au plus).
// Budget : une edge function Supabase tient 150 s (400 s en payant) ; on se borne à 120 s pour finir proprement.

import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { agencesDe, headcountLabel, lookup, searchByCriteria, TOUS_DEPARTEMENTS, type Company, type Criteria, type Establishment, type Found } from "./annuaire.ts";
import {
  appendConversationMessage,
  claimRequest,
  failRequest,
  finishRequest,
  completeProspect,
  marquerTentative,
  getProspectForEnrichment,
  loadProspect,
  identitesConnues,
  insertLightProspects,
  nomReduit,
  contactsALApprofondissement,
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
  enregistrerDossier,
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
import { devinerSite, readSiteContacts, type SiteContacts } from "./site-contacts.ts";
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
    return "la recherche était trop large pour aboutir : reprenez-la sur une région ou une ville, ou un seul métier.";
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
// L'approfondissement travaille en arrière-plan (l'écran n'attend pas la réponse) : la
// limite de l'hébergeur y est de 400 s sur l'offre Pro, pas 150. À 140 s, les grosses
// entreprises (Campenon Bernard, Würth, 21/10) échouaient faute de temps ; on lui laisse
// 240 s, en dessous d'une coupure signalée vers 200-400 s par d'autres utilisateurs.
const BUDGET_APPROFONDIR_MS = 240_000;

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
// Quatre recherches, plus six. La recherche remet désormais au modèle l'identité,
// l'effectif, les dirigeants et l'adresse : il dépensait ses appels à retrouver ce
// qu'on venait de lui donner, et l'approfondissement durait près de deux minutes.
const ENRICH_WEB_SEARCHES = 5;
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
    const out = await complete<{ section: string; codes_naf: string[]; departements: string[]; effectif_min: number; effectif_max: number }>(
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
    return {
      section,
      nafCodes,
      departments,
      minHeadcount: out.effectif_min > 0 ? out.effectif_min : null,
      maxHeadcount: out.effectif_max > 0 ? out.effectif_max : null,
    };
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
function populationDuSite(local: Establishment, c: Found, parAgence = false) {
  const duSite = local.headcountBand && local.headcountBand !== "NN" ? local.headcountBand : null;
  // Une agence : son effectif à elle, ou rien — jamais celui du groupe (audit du 19/10).
  if (parAgence) return populationScore(duSite, true, local.headcountYear, local.employeur);
  return duSite
    ? populationScore(duSite, true, local.headcountYear, local.employeur)
    : populationScore(c.headcountBand, false, c.headcountYear, local.employeur);
}

/** Mots d'une adresse qui ne la distinguent pas d'une autre. */
const MOTS_VIDES = new Set(["rue", "avenue", "av", "boulevard", "bd", "chemin", "route", "place", "allee", "impasse", "quai", "cours", "zone", "za", "zi", "zac", "parc", "rond", "point", "lieu", "dit", "france", "cedex", "bis", "ter"]);
const motsAdresse = (t: string) =>
  t.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);

/**
 * L'adresse que Google rend est-elle celle de l'établissement au registre ? Même code
 * postal, même numéro dans la voie s'il y en a un, et au moins un mot du nom de la voie.
 */
function memeAdresse(local: Establishment, google: string | null): boolean {
  if (!google || !local.address) return false;
  const g = motsAdresse(google);
  const r = motsAdresse(local.address);
  const cp = local.postalCode ?? r.find((m) => /^\d{5}$/.test(m)) ?? null;
  if (!cp || !g.includes(cp)) return false;
  const numero = r.find((m) => /^\d{1,4}$/.test(m));
  if (numero && !g.includes(numero)) return false;
  const ville = new Set(motsAdresse(local.city ?? ""));
  const voie = r.filter((m) => m.length >= 4 && !/^\d+$/.test(m) && !MOTS_VIDES.has(m) && !ville.has(m));
  return voie.length === 0 || voie.some((m) => g.includes(m));
}

/** Le nom que Google donne porte-t-il un mot distinctif du nom de la société ? */
function memeNom(societe: string, google: string | null): boolean {
  if (!google) return false;
  const formes = new Set(["sa", "sas", "sasu", "sarl", "eurl", "snc", "sci", "groupe", "group", "france", "societe", "ste", "et", "de", "des", "du", "la", "le", "les"]);
  const g = new Set(motsAdresse(google));
  return motsAdresse(societe).filter((m) => m.length >= 3 && !formes.has(m)).some((m) => g.has(m));
}

/** La clé d'un lieu Google : l'établissement visé, sinon l'entreprise. */
const cleLieu = (c: Found) => c.localSites[0]?.siret ?? c.siren;

/**
 * `parAgence` : chaque entrée est UNE AGENCE d'une société (« les agences Bouygues
 * Immobilier »). Sa fiche ne porte alors que ce qui la concerne, elle : l'adresse de
 * l'agence au registre, le standard de l'agence trouvé par Google à son adresse. Ni le
 * siège, ni le dirigeant du groupe, ni les numéros lus sur le site national — Olivier,
 * 19/10 : « s'il n'y a pas, tu mets rien ». Le site internet, lui, est celui de la société.
 */
async function versFiches(trouvees: Found[], budgetSitesMs = 90_000, parAgence = false): Promise<LightProspect[]> {
  // Le standard, l'adresse exacte et le site officiel de toutes les entreprises d'un
  // coup. Sans cela la recherche rendait des fiches sans un numéro à composer — moins
  // utiles qu'une recherche Google, et personne n'en faisait rien.
  // Deux sources en parallèle, chacune pour ce qu'elle sait faire. Google Places donne
  // le standard et l'adresse exacte ; Pappers donne le site officiel, le téléphone et
  // parfois l'adresse électronique. Aucune ne suffit seule, et l'une comme l'autre peut
  // échouer sans conséquence — ce qui manque sera dit, plus jamais tu.
  const [lieux, pappers] = await Promise.all([
    // Une clé par établissement : les agences d'une même société ont chacune leur standard.
    // Une agence : on donne à Google son adresse exacte au registre, pas seulement la ville.
    chercherLieux(
      trouvees.map((c) => ({
        cle: cleLieu(c),
        nom: c.name,
        ville: parAgence ? (c.localSites[0]?.address ?? c.localSites[0]?.city ?? null) : (c.localSites[0] ?? c.headOffice).city,
      })),
    ),
    chercherPappersEnLot([...new Set(trouvees.map((c) => c.siren).filter(Boolean))]),
  ]);

  // Les sites officiels : devinés, puis lus. C'est là que sont les adresses
  // électroniques et les standards, et personne d'autre ne les donne — le registre
  // ne publie pas d'adresse web, la formule Pappers non plus, et Google refuse les
  // appels du serveur. Sur quatre sites trouvés dans nos essais, quatre adresses
  // électroniques et trois téléphones.
  //
  // C'est lent — deviner un domaine demande jusqu'à quatre essais, le lire en demande
  // sept. On y consacre donc un budget fixe et l'on s'arrête quand il est dépassé : ce
  // qui n'a pas été trouvé le sera au bouton « Compléter », fiche par fiche.
  const sites = new Map<string, SiteContacts>();
  const debutSites = Date.now();
  // Vingt de front, et quatre-vingt-dix secondes : de quoi couvrir une recherche
  // entière. Le commercial ne doit pas avoir à cliquer fiche par fiche pour obtenir un
  // numéro — ce qui est trouvable l'est à la recherche, pas sur demande.
  const BUDGET_SITES_MS = budgetSitesMs;
  /** Les sociétés dont on a déjà cherché le site, trouvé ou non : une seule tentative chacune. */
  const tentees = new Set<string>();
  const DE_FRONT = 20;
  // Les meilleures d'abord : si le temps manque, ce sont celles-là qui auront leurs
  // coordonnées, pas les dernières de la liste.
  const parPotentiel = [...trouvees].sort((a, b) => {
    const poids = (c: Found) => (metierDe(c.activityCode)?.soleil === "majorite_dehors" ? 2 : 1) * (c.openEstablishments ?? 1);
    return poids(b) - poids(a);
  });
  for (let i = 0; i < parPotentiel.length && Date.now() - debutSites < BUDGET_SITES_MS; i += DE_FRONT) {
    // Un site par société : ses agences le partagent, inutile de le lire cent fois.
    const vague = parPotentiel.slice(i, i + DE_FRONT).filter((c) => !tentees.has(c.siren) && tentees.add(c.siren));
    await Promise.all(
      vague.map(async (c) => {
        const connu = pappers.get(c.siren)?.site ?? lieux.get(cleLieu(c))?.site ?? (await devinerSite(c.name));
        if (!connu) return;
        // Lecture rapide : la page d'accueil, le contact et les mentions légales.
        // Dix-neuf pages pour cent entreprises dépasseraient le budget de la fonction.
        const lu = await readSiteContacts(connu, true);
        if (lu) sites.set(c.siren, lu);
      }),
    );
  }

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
    // Une agence ne garde la fiche Google que si c'est bien SON adresse : sinon c'est le
    // standard du siège ou d'une autre agence, et l'on préfère ne rien mettre (19/10).
    const trouveParGoogle = lieux.get(cleLieu(c)) ?? null;
    const lieu = parAgence && trouveParGoogle && !(memeAdresse(local, trouveParGoogle.adresse) && memeNom(c.name, trouveParGoogle.nom)) ? null : trouveParGoogle;
    const pap = pappers.get(c.siren) ?? null;
    const lu = sites.get(c.siren) ?? null;
    // Le dirigeant du registre : sur cent entreprises de travaux publics, quatre-vingt-
    // une en publient un, et nous ne l'affichions pas. Pappers complète quand il a mieux.
    const dirigeant = parAgence ? null : (c.leaders[0] ?? (pap?.dirigeants[0] ? { name: pap.dirigeants[0].nom, role: pap.dirigeants[0].role } : null));
    // Ce que l'entreprise publie elle-même passe devant. Une agence : son seul standard.
    const telephone = parAgence ? (lieu?.telephone ?? null) : (lu?.phones[0] ?? pap?.telephone ?? lieu?.telephone ?? null);
    const courriel = parAgence ? null : (lu?.emails[0] ?? pap?.email ?? null);
    // Une agence : seul le site que Pappers rattache à SON SIREN — un domaine deviné
    // pourrait être celui d'une autre société (audit du 19/10).
    const site = parAgence ? (pap?.site ?? null) : (lu?.readOn ?? pap?.site ?? lieu?.site ?? null);

    const score: Score = {
      // Étape 2 — la pertinence, que le registre suffit à établir.
      exposition: expositionScore(metier.soleil, metier.pourquoi, source),
      population: populationDuSite(local, c, parAgence),
      peau: peauScore(metier.affinite, metier.pourquoi, source),
      deploiement: deploiementScore(c.openEstablishments),
      // Étape 3 — ce que l'État publie déjà de leurs démarches, gratuitement.
      politique_sst: signauxOfficiels(c.signals),
      instances: indexEgalite(c.signals.egalite),
      // Étape 4 — un dirigeant nommé vaut mieux qu'une fiche sans personne à qui parler.
      interlocuteur: dirigeantScore(dirigeant),
      coordonnees: telephone || courriel
        ? {
            points: courriel && telephone ? 4 : 2,
            justification: [telephone, courriel].filter(Boolean).join(" · ") +
              ` — ${lu ? "site officiel de l’entreprise" : pap?.telephone ? "fiche Pappers" : "fiche d’établissement Google"}.`,
            source: lu?.readOn ?? pap?.source ?? lieu?.source ?? null,
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
      // L'objet social de Pappers dit ce que l'entreprise fait VRAIMENT — « élevage et
      // commercialisation d'huîtres » plutôt que « Aquaculture en mer ». Le libellé
      // officiel reste en secours.
      activity: pap?.objetSocial || libelleNaf(c.activityCode) || metier.activite || null,
      sector: secteurDe(c.activityCode),
      siren: c.siren,
      website: site,
      contactName: dirigeant?.name ?? null,
      contactRole: dirigeant?.role ?? null,
      contactPhone: telephone,
      contactEmail: courriel,
      siteContacts: parAgence ? null : lu,
      contactSource: parAgence ? (lieu?.telephone ? lieu.source : null) : (pap?.source ?? lieu?.source ?? null),
      // Une agence : SON adresse au registre (jamais celle du siège).
      headOffice: parAgence
        ? { address: local.address, city: local.city, department: local.department }
        : { address: lieu?.adresse ?? c.headOffice.address, city: c.headOffice.city, department: c.headOffice.department },
      leaders: parAgence ? null : c.leaders,
      // Ce que l'État publie et qu'on ne sait pas encore afficher : on le garde.
      // Une agence garde son SIRET d'établissement et la marque « agence » : un
      // approfondissement ou une complétion n'y remettra pas le siège (db.ts).
      // Les chiffres et la position du groupe ne sont pas ceux de l'agence : on ne les garde pas.
      registre: parAgence ? { ...c.registre, finances: null, coordonnees: null, siret: local.siret, agence: true } : c.registre,
      // Si le registre dit que l'établissement n'emploie personne, on n'écrit pas
      // l'effectif du groupe à sa place : ce serait afficher mille cinq cents salariés
      // sur un siège vide.
      // Une agence : son effectif publié, sinon rien (pas celui du groupe).
      headcountBand: !local.employeur ? null : local.headcountBand && local.headcountBand !== "NN" ? local.headcountBand : parAgence ? null : c.headcountBand,
      headcountYear: parAgence ? (local.headcountBand && local.headcountBand !== "NN" ? local.headcountYear : null) : (local.headcountYear ?? c.headcountYear),
      openEstablishments: parAgence ? null : c.openEstablishments,
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
          siteRecoupe: Boolean(lu && (pap?.site || lieu?.site)),
          dirigeant: dirigeant?.name ?? null,
          dirigeantRecoupe: Boolean(c.leaders[0] && pap?.dirigeants.length),
          email: courriel,
          telephone,
          telephoneRecoupe: parAgence ? false : [lu?.phones[0], pap?.telephone, lieu?.telephone].filter(Boolean).length >= 2,
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
  zone: { totalZone: number; totalQualifiees: number },
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
      suitePrompt(demande, { total: fiches.length, ecartees, sansEffectif, ...zone }, meilleures),
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
  await marquerTentative(sb, req.prospectId!);

  // Le SIREN de la fiche, ou celui que son nom permet de retrouver au registre.
  const candidats = p.siren ? await lookup(p.siren) : await lookup([p.name, p.city].filter(Boolean).join(" "));
  const c = candidats[0] ?? null;
  if (!c) return { found: 0, message: "Aucune entreprise du registre officiel ne correspond : identité non confirmée." };

  const [pap, lieu] = await Promise.all([
    chercherPappers(c.siren),
    chercherLieu(c.name, c.headOffice.city),
  ]);

  // Le site officiel : celui qu'on connaît, celui que Pappers ou Google donnent, ou
  // celui qu'on devine. Une fois trouvé, on le LIT — c'est là que sont l'adresse
  // électronique et le standard. Château Cheval Blanc publie « 05 57 55 55 55 » et
  // « contact@chateau-chevalblanc.com » sur sa page contact : deux secondes, gratuit.
  const siteConnu = p.website ?? pap?.site ?? lieu?.site ?? (await devinerSite(c.name));
  const lu = siteConnu ? await readSiteContacts(siteConnu) : null;

  const dirigeant = c.leaders[0] ?? (pap?.dirigeants[0] ? { name: pap.dirigeants[0].nom, role: pap.dirigeants[0].role } : null);
  // Le site officiel passe devant : un numéro publié par l'entreprise elle-même vaut
  // mieux qu'un standard trouvé ailleurs.
  const telephone = lu?.phones[0] ?? pap?.telephone ?? lieu?.telephone ?? null;
  const email = lu?.emails[0] ?? pap?.email ?? null;
  const site = siteConnu;

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
      email: email ?? p.contactEmail ?? null,
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
    contactEmail: email,
    contactSource: lu?.readOn ?? pap?.source ?? lieu?.source ?? null,
    siteContacts: lu,
    reliability: note?.note ?? null,
    reliabilityDetail: note?.details ?? null,
  });

  const trouve = [
    dirigeant ? "dirigeant" : null,
    telephone ? "téléphone" : null,
    email ? "e-mail" : null,
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

/** Les départements d'une zone dite en clair (« en Alsace », « autour de Toulouse »). */
const nuVille = (t: string) =>
  t.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

const ZONE_SYSTEM = `Tu traduis une zone de France dite en clair par un commercial.
Rends ses départements (codes : 01 à 95, 2A, 2B, 971 à 976) et, si c'est une ville ou une commune précise, son nom dans « ville ».
- Une région : tous ses départements, « ville » vide.
- Un département (nom ou numéro) : lui seul, « ville » vide.
- Une ville : son département, et son nom dans « ville ».
- Toute la France, ou rien de précis : liste vide, « ville » vide.
Ne réponds que par le JSON demandé.`;
const ZONE_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["departements", "ville"],
  properties: { departements: { type: "array", items: { type: "string" } }, ville: { type: "string" } },
};

/**
 * La zone d'une recherche d'agences : ses départements, et sa ville si c'en est une.
 * Liste VIDE = toute la France. `null` = on n'a pas pu la comprendre — et alors
 * seulement on ne cherche pas.
 */
async function lireLaZone(zone: string, onUsage: (u: LlmUsage) => void): Promise<{ departements: string[]; ville: string } | null> {
  // « France », « France entière », « toute la France », « national », « partout » : pas
  // besoin du modèle. C'est ce qu'il avait mal compris le 19/10 (« Vinci, France entière »).
  const z = zone.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z ]/g, " ").replace(/\s+/g, " ").trim();
  if (/metropol/.test(z) && /france|hexagone/.test(z)) return { departements: TOUS_DEPARTEMENTS.filter((d) => !d.startsWith("97")), ville: "" };
  if (/^(en |dans |sur )?(toute (la )?)?(la )?france( entiere)?$|^(partout|national|nationale|tout le territoire|toutes regions|toutes les regions)$/.test(z)) return { departements: [], ville: "" };
  try {
    const out = await complete<{ departements: string[]; ville: string }>(`Zone : ${zone}`, ZONE_SCHEMA as unknown as Record<string, unknown>, {
      usage: "recherche",
      system: ZONE_SYSTEM,
      onUsage,
      timeoutMs: 25_000,
    });
    const departements = (out.departements ?? []).map((d) => department(d)).filter((d): d is string => d !== null);
    // Une zone qui n'est pas nationale (reconnue plus haut) et qui ne donne aucun
    // département est une zone mal comprise : on ne la change pas en « toute la France ».
    return departements.length ? { departements, ville: (out.ville ?? "").trim() } : null;
  } catch {
    return null;
  }
}

/**
 * La demande « les agences de telle société », telle que le chat l'écrit (index.ts) et
 * que la recherche la relit. Lisible tel quel dans l'historique et le CAP.
 */
export const demandeSociete = (nom: string, zone: string, nombre = 100) =>
  `Agences de « ${nom.trim()} »${zone.trim() ? ` — ${zone.trim()}` : " — toute la France"}${nombre !== 100 ? ` (${nombre} fiches)` : ""}`;
const SOCIETE = /^Agences de « (.+?) » — (.*)$/s;
/** « … (200 fiches) » : combien de fiches nouvelles la demande veut. 100 par défaut. */
export const nombreDe = (demande: string): number => {
  const m = demande.match(/\((\d{1,3}) fiches\)\s*$/);
  return m ? Math.min(300, Math.max(1, Number(m[1]))) : REGISTRE_MAX;
};
const sansNombre = (t: string) => t.replace(/\s*\(\d{1,3} fiches\)\s*$/, "");
/** Le nom de la société d'une demande d'agences, ou null pour une recherche par métier. */
export const societeDe = (demande: string): { nom: string; zone: string } | null => {
  const m = sansNombre(demande).match(SOCIETE);
  return m ? { nom: m[1], zone: m[2] === "toute la France" ? "" : m[2] } : null;
};

/**
 * Les agences d'une société nommée — elles seules (Olivier, 19/10). Jamais de repli
 * sur le métier : si la société n'a pas d'agence dans la zone, on le dit, et on
 * PROPOSE d'élargir ; c'est le commercial qui décide.
 */
async function runSearchSociete(sb: SupabaseClient, req: Demande, nom: string, zone: string, onUsage: (u: LlmUsage) => void) {
  // Sans zone : toute la France. Avec une zone : ses départements, et sa ville si c'en est une.
  const debut = Date.now();
  const lue = zone ? await lireLaZone(zone, onUsage) : { departements: [], ville: "" };
  // Une zone qu'on n'a pas PU comprendre ne devient pas « toute la France » : ce serait
  // élargir sans son accord. On s'arrête et on le dit.
  if (lue === null) {
    return { found: 0, message: `Je n’ai pas compris la zone « ${zone} ». Redites-la-moi (une région ou une ville), ou rien pour toute la France.` };
  }
  const departements = lue.departements.length ? lue.departements : TOUS_DEPARTEMENTS;
  const ou = lue.departements.length ? `à ${lue.ville || zone}`.replace(/^à (en|dans) /i, "$1 ") : "dans toute la France";
  const resultat = await agencesDe(nom, departements, 35_000);
  if (resultat.agences.length === 0 && resultat.echecs > 0) {
    throw new Error("l’annuaire des entreprises n’a pas répondu ; relancez dans quelques minutes");
  }
  // Une ville : ses agences à elle. S'il n'y en a pas, on le dit, sans élargir de soi-même.
  let agences = resultat.agences;
  if (lue.ville) {
    const v = nuVille(lue.ville);
    const dansLaVille = agences.filter((a) => {
      const c = nuVille(a.localSites[0]?.city ?? "");
      return c === v || c.startsWith(`${v} `);
    });
    if (dansLaVille.length === 0 && agences.length > 0) {
      return {
        found: 0,
        message:
          `Je n’ai trouvé aucune agence de ${nom} à ${lue.ville} même. Il y en a ${agences.length} autour : ` +
          "voulez-vous que je les ajoute ? Je n’ajoute rien sans votre accord.",
      };
    }
    agences = dansLaVille;
  }
  const nombre = nombreDe(req.request);
  const proposer = `Voulez-vous que j’élargisse à d’autres entreprises comparables à ${nom} (même métier, ${ou}) ? Je ne les ajouterai que si vous me le confirmez.`;
  const partiel = resultat.tronquee || resultat.incomplete;
  if (agences.length === 0) {
    return {
      found: 0,
      message: `${partiel ? "Dans la partie que j’ai pu parcourir, je n’ai" : "Je n’ai"} trouvé aucune agence ouverte de ${nom} ${ou}. Je n’ai ajouté aucune autre entreprise.\n\n${proposer}`,
    };
  }
  // Celles qu'on a déjà ne repassent pas par l'enrichissement payant : « les 100
  // suivantes » prend les suivantes, pas les mêmes.
  const connues = await identitesConnues(sb);
  const nouvelles = agences.filter(
    (a) =>
      !connues.sirets.has((a.localSites[0]?.siret ?? "").replace(/\D/g, "")) &&
      // Une agence déjà en fiche sans SIRET (créée avant le 19/10) se reconnaît à son nom et sa ville.
      !connues.nomsVilles.has(`${nomReduit(a.name)}|${nomReduit(a.localSites[0]?.city ?? "")}`),
  );
  const retenues = nouvelles.slice(0, nombre);
  // Le temps qui reste pour les sites, sous le budget de la fonction (Places et
  // l'insertion passent aussi dedans) : jamais plus que pour une recherche par métier.
  const reste = BUDGET_MS - (Date.now() - debut) - 45_000;
  const fiches = await versFiches(retenues, Math.max(10_000, Math.min(90_000, reste)), true);
  const inserted = await insertLightProspects(sb, req.id, req.requestedBy, fiches, { parVille: true });
  const deja = agences.length - nouvelles.length + (fiches.length - inserted);
  const restantes = nouvelles.length - retenues.length;
  const constat = [
    `J’ai trouvé ${agences.length} agence${agences.length > 1 ? "s" : ""} de ${nom} ${ou}`,
    `${inserted} ajoutée${inserted > 1 ? "s" : ""} en Prospection`,
    deja > 0 ? `${deja} que vous aviez déjà` : null,
    restantes > 0 ? `${restantes} autre${restantes > 1 ? "s" : ""} à ajouter : demandez-moi « les suivantes »` : null,
    partiel ? "la liste peut être incomplète : précisez une région pour aller plus loin" : null,
  ].filter(Boolean).join(" · ") + ".";
  return { found: inserted, message: `${constat}\n\n${proposer}` };
}

async function runSearch(sb: SupabaseClient, req: Demande, onUsage: (u: LlmUsage) => void) {
  const societe = societeDe(req.request);
  if (societe) return runSearchSociete(sb, req, societe.nom, societe.zone, onUsage);
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
  const nombre = nombreDe(req.request);
  const criteres = await lireLesCriteres(sansNombre(req.request), (u) => {
    spent.inputTokens += u.inputTokens;
    spent.outputTokens += u.outputTokens;
    onUsage({ ...spent });
  });
  if (criteres) {
    // On en lit davantage qu'on n'en veut : celles qu'il a déjà sont écartées AVANT
    // l'enrichissement payant, et « les 100 suivantes » prend vraiment les suivantes.
    const connues = await identitesConnues(sb);
    const { found: lues, ignores, totalZone, totalQualifiees, sansEffectifPublie } = await searchByCriteria(criteres, nombre, connues.sirens);
    // Déjà là sous un autre nom de fichier (client saisi sans SIREN) : on ne repaie pas.
    const nouvelles = lues.filter((c) => !connues.noms.has(nomReduit(c.name)));
    const trouvees = nouvelles.slice(0, nombre);
    // Tout ce que le registre connaît pour cette demande est déjà dans les fiches : on le
    // dit, sans partir sur le web chercher autre chose.
    if (trouvees.length === 0 && Math.max(totalZone, totalQualifiees) > 0) {
      return { found: 0, message: "Toutes les entreprises que je trouve pour cette recherche sont déjà dans vos fiches. Essayez un métier voisin ou une autre zone." };
    }
    const fiches = await versFiches(trouvees);
    if (fiches.length > 0) {
      const inserted = await insertLightProspects(sb, req.id, req.requestedBy, fiches);
      const deja = fiches.length - inserted;

      // Pappers a-t-il servi à quelque chose ? Sinon on le dit, avec ce qu'il a envoyé.
      // Le bilan dans la langue du commercial (Olivier, 19/10) : ce qui est ajouté, ce
      // qu'il avait déjà, s'il en reste. Les pannes techniques ne le regardent pas : elles
      // restent dans la trace de la demande (echecPlaces, echecPappers) pour nous.
      const total = Math.max(totalZone, totalQualifiees);
      const compte = [
        `${inserted} entreprise${inserted > 1 ? "s" : ""} ajoutée${inserted > 1 ? "s" : ""} en Prospection`,
        deja + (lues.length - nouvelles.length) > 0 ? `${deja + (lues.length - nouvelles.length)} que vous aviez déjà` : null,
        total > lues.length ? `il y en a environ ${total} en tout` : null,
        nouvelles.length > trouvees.length || total > lues.length ? "demandez-moi « les suivantes » pour continuer" : null,
        sansEffectifPublie > 0 ? `${sansEffectifPublie} dont la taille n’est pas connue, à vérifier` : null,
      ].filter(Boolean).join(" · ") + ".";

      // Un compteur n'est pas un accompagnement. Merx nomme les meilleures, dit ce qui
      // saute aux yeux, et propose ce que le commercial peut demander ensuite — un
      // effectif, un métier voisin, un autre département. Un appel court, quelques
      // centimes, et le commercial sait par où commencer.
      const suite = await accompagner(req.request, fiches, ignores, { totalZone, totalQualifiees }, (u) => {
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
    timeoutMs: Math.max(5_000, BUDGET_APPROFONDIR_MS - (Date.now() - started)),
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

  /**
   * Toutes les personnes trouvées, gardées telles quelles.
   *
   * Un responsable des ressources humaines repéré dans un annuaire d'affaires finissait
   * cité dans une justification, en bas de page, quand le commercial le cherchait en
   * haut de la fiche. Une personne dont on n'est pas sûr reste une piste : on la garde,
   * on dit d'où elle vient, et le commercial décide.
   */
  const personnes = (out.contacts ?? [])
    .filter((x) => x.nom.trim())
    .map((x) => ({
      nom: x.nom.trim(),
      fonction: x.fonction.trim() || null,
      email: x.email.trim() || null,
      telephone: x.telephone.trim() || null,
      mobile: x.mobile.trim() || null,
      source: x.source.trim() || null,
      sur: x.confiance === "sure" && sourceFiable(x.source),
    }));

  // Celle qu'on met en avant : une fonction du service concerné d'abord, et dont la
  // source tient. À défaut, la première dont la source tient.
  const UTILE = /qhse|hse|qsse|sécurit|securit|préven|preven|santé|sante|infirm|médec|medec|rh\b|ressources humaines|drh|rse|qvct/i;
  const meilleure =
    personnes.find((x) => x.sur && UTILE.test(x.fonction ?? "")) ??
    personnes.find((x) => x.sur) ??
    personnes.find((x) => UTILE.test(x.fonction ?? "")) ??
    personnes[0] ?? null;

  const c = {
    nom: meilleure?.nom ?? "",
    fonction: meilleure?.fonction ?? "",
    email: meilleure?.email ?? "",
    telephone: meilleure?.telephone ?? "",
    source: meilleure?.source ?? "",
  };
  const named = meilleure?.sur ? { name: c.nom, role: c.fonction, source: c.source } : null;

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
    // Toutes les personnes, pas seulement celle qu'on met en avant.
    personnes: personnes.length ? personnes : null,
    siteContacts: site,
    approach: out.angle_approche.trim() || null,
    dossier: enregistrerDossier(out.dossier),
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
    // FullEnrich n'agit qu'à l'APPROFONDISSEMENT, jamais à la prospection (Olivier, 20/10) :
    // une fois que Merx a approfondi la fiche, il y ajoute ses 2 interlocuteurs et leur e-mail.
    if (req.kind === "approfondissement" && req.prospectId) await contactsALApprofondissement(sb, req.prospectId, req.requestedBy);
    if (req.kind === "recherche" && req.conversationId) {
      await appendConversationMessage(sb, req.conversationId, {
        role: "assistant",
        // Des agences d'une même société ne se distinguent que par leur ville.
        content: resultMessage(req.request, result, await listFoundNames(sb, req.id, Boolean(societeDe(req.request)))),
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
  // Agences d'une société : le bilan est déjà écrit pour le commercial ; on y ajoute les noms.
  if (societeDe(request)) {
    const shown = names.slice(0, NAMES_SHOWN).map((n) => `• ${n}`).join("\n");
    const rest = result.found - Math.min(names.length, NAMES_SHOWN);
    // Le bilan, puis les noms, puis la proposition d'élargir (dernier paragraphe).
    const [bilan, ...suite] = (result.message ?? "").split("\n\n");
    const liste = result.found ? shown + (rest > 0 ? `\n… et ${rest} autre${rest > 1 ? "s" : ""}` : "") : "";
    return [bilan, liste, ...suite].filter(Boolean).join("\n\n");
  }
  if (!result.found) return `Aucun nouveau prospect pour « ${request} ». ${result.message ?? ""}`.trim();
  const shown = names.slice(0, NAMES_SHOWN);
  const rest = result.found - shown.length;
  const list = shown.map((n) => `• ${n}`).join("\n");
  return [
    `Trouvé ${result.found} prospect${result.found > 1 ? "s" : ""} pour « ${request} » :`,
    list + (rest > 0 ? `\n… et ${rest} autre${rest > 1 ? "s" : ""}` : ""),
    `Ils sont dans Prospection.${result.message ? ` ${result.message}` : ""}`,
  ].join("\n\n");
}
