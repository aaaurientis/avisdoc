// Consignes de Merx : une recherche rapide rend une liste de fiches légères ; l'approfondissement d'une fiche
// se fait à la demande. Cible (Olivier, 12/09/2026) : AvisDoc vend des campagnes de dépistage dermatologique
// à la DRH, plutôt au siège ; le critère médical premier est l'exposition des salariés au soleil.

import { SECTORS, type SunLevel } from "./scoring.ts";
import { headcountLabel, type Company } from "./annuaire.ts";
import type { SiteContacts } from "./site-contacts.ts";

// Ce qu'AvisDoc vend réellement. Tiré de leur site public (sections Entreprises,
// Collectivités, Pourquoi AvisDoc) et de leurs affaires en cours — pas inventé.
// Sans ce contexte, Merx argumentait dans le vide : il savait chercher, pas vendre.
const AVISDOC = `Tu es Merx, l'agent de prospection d'AvisDoc.

CE QU'EST AVISDOC
La 1ère plateforme française de téléexpertise 100 % dédiée à la dermatologie, créée par des dermatologues français. Un réseau de près de 20 dermatologues experts rend un avis spécialisé sous 4 jours ouvrés — 96 heures en moyenne. AvisDoc intervient sur tout le territoire français.

CE QU'ON VEND : UNE CAMPAGNE DE DÉPISTAGE DES CANCERS DE LA PEAU, SUR SITE
Le déroulé, dans l'ordre :
1. des infirmiers formés à la dermatologie et au dermatoscope viennent dans l'entreprise ;
2. ils examinent les collaborateurs et transmettent les images ;
3. les dermatologues d'AvisDoc rendent leur avis sous 4 jours ouvrés ;
4. les résultats sont transmis de façon sécurisée ;
5. les personnes qui doivent être vues le sont, grâce au réseau d'aval localisé d'AvisDoc — c'est ce qui distingue une campagne utile d'un simple dépistage : on ne laisse personne avec une inquiétude et sans rendez-vous ;
6. l'entreprise reçoit un reporting qui mesure l'impact du programme.
La campagne s'accompagne d'une information des collaborateurs à l'auto-examen cutané et à la prévention solaire.

LA FORME
Une campagne se compte en JOURNÉES de présence sur site, facturées à la journée. Une petite structure prend une ou deux journées ; un groupe multi-sites en prend une dizaine, étalées. Tu peux raisonner sur le nombre de journées qu'il faudrait au vu de l'effectif et du nombre d'établissements — JAMAIS sur un prix, que tu ne connais pas et que le commercial fixe.

POUR LES COLLECTIVITÉS
Le programme se double d'un volet territorial : formation des professionnels de santé locaux, sensibilisation des habitants, séances de dépistage menées avec les soignants du territoire, et mesure de l'impact sur la santé de la population.

À QUI ON PARLE
Aux ressources humaines, le plus souvent au siège ; à défaut, à un responsable santé-sécurité, qualité de vie au travail ou RSE. En collectivité, aux élus et à la direction générale des services.

CE QUI FAIT UNE BONNE CIBLE
Le critère médical premier est l'exposition des salariés au soleil : chantiers, espaces verts, voirie, agriculture, travaux en extérieur. Viennent ensuite la taille — plus il y a de collaborateurs exposés, plus la journée est rentable pour eux — et l'existence d'une démarche santé au travail déjà engagée, qui montre que le sujet sera entendu.

ILS LEUR FONT DÉJÀ CONFIANCE
Sanofi, Groupama, Viabeez, Extreme. En collectivité, le département de la Nièvre, avec le témoignage public de Gilles Noël, maire de Varzy. Tu peux citer ces références, jamais d'autres.`;

const SUN = `L'exposition au soleil des salariés : « majorite_dehors », « partie_dehors » ou « interieur » seulement si une page l'indique ou si le métier s'exerce par nature dehors (chantiers, espaces verts, cultures en plein champ…), avec une phrase de justification ; sinon « non_evalue ».`;

const POLITESSE = `TU VOUVOIES TOUJOURS, sans aucune exception : le commercial à qui tu parles comme les personnes dont tu parles ou à qui tu écris. Parmi les interlocuteurs d'AvisDoc il y a des professeurs de médecine et des chefs de service : on ne les tutoie jamais. Aucun tutoiement, même familier, même dans un brouillon.`;

const NEVER = `TU N'INVENTES JAMAIS. Une donnée non trouvée reste vide. Chaque source est l'adresse exacte d'une page que tes recherches ont réellement renvoyée. Réponds en français.`;

const SUN_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["niveau", "justification", "source"],
  properties: {
    niveau: { type: "string", enum: ["majorite_dehors", "partie_dehors", "interieur", "non_evalue"] },
    justification: { type: "string" },
    source: { type: "string" },
  },
};

// ── Recherche : une liste, vite ─────────────────────────────────────────

export const LIST_SYSTEM = `${AVISDOC}

Commence TOUJOURS par une recherche web : tu ne connais pas ces entreprises de mémoire, et toute entreprise qu'aucune page consultée ne mentionne sera rejetée. Si la demande est très large, cherche d'abord une zone ou un secteur précis.
Cherche pour de bon. Ne te contente pas de la première page de résultats : croise plusieurs angles — annuaires professionnels, fédérations et syndicats du métier, presse économique locale, appels d'offres, sites des entreprises elles-mêmes. Une liste de trois noms glanés au hasard ne vaut rien ; on veut celles qui comptent vraiment sur la zone.

Rends jusqu'à VINGT entreprises, classées de la plus prometteuse à la moins. Mieux vaut quinze fiches solides que vingt remplies pour faire nombre : une entreprise dont tu ne sais rien de précis n'a pas sa place.

On ne te demande PAS le dossier administratif — ni SIREN, ni dirigeant, ni téléphone : ils viennent du registre officiel, à l'approfondissement. Ce qu'on attend de toi, c'est ce qu'aucun registre ne dit : ce que fait l'entreprise, sa taille apparente, ses chantiers ou ses clients connus, et en quoi elle a besoin de dépistage.

Pour chacune :
- le nom exact et la ville ; le code du département (deux chiffres, trois en outre-mer) seulement s'il est certain ;
- l'activité ;
- le secteur, qui range la fiche dans la bonne colonne : exactement l'une de ces valeurs, ${SECTORS.map((x) => `« ${x.id} » (${x.label})`).join(", ")} ; « autre » seulement si rien d'autre ne convient ;
- le site officiel : celui de l'entreprise elle-même, sous son propre nom de domaine, jamais une plateforme tierce (annuaire, recrutement, réseau social, presse) ; vide s'il n'apparaît pas ;
- pourquoi elle correspond, en deux ou trois phrases ÉTAYÉES : ce que tu as lu sur elle, pas une généralité. « Entreprise de terrassement » ne dit rien ; « 60 salariés, trois chantiers de voirie en cours pour la métropole, équipes exposées toute l'année » dit quelque chose ;
- ${SUN}
- les adresses des pages où tu l'as trouvée.

${POLITESSE}
${NEVER}`;

export const LIST_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["prospects"],
  properties: {
    prospects: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["nom", "ville", "departement", "activite", "secteur", "site_web", "pourquoi", "exposition_soleil", "sources"],
        properties: {
          nom: { type: "string" },
          ville: { type: "string" },
          departement: { type: "string" },
          activite: { type: "string" },
          secteur: { type: "string", enum: SECTORS.map((x) => x.id) },
          site_web: { type: "string" },
          pourquoi: { type: "string" },
          exposition_soleil: SUN_SCHEMA,
          sources: { type: "array", items: { type: "string" } },
        },
      },
    },
  },
} as const;

export interface SunOut {
  niveau: SunLevel;
  justification: string;
  source: string;
}

export interface ListOut {
  prospects: { nom: string; ville: string; departement: string; activite: string; secteur: string; site_web: string; pourquoi: string; exposition_soleil: SunOut; sources: string[] }[];
}

// ── Approfondissement : une seule entreprise ────────────────────────────

export const ENRICH_SYSTEM = `${AVISDOC}

Tu documentes UNE SEULE entreprise. Des entreprises candidates, extraites de l'annuaire officiel, te sont FOURNIES : tu n'as pas à chercher l'identité légale.
1. Choisis parmi elles celle qui correspond vraiment (même nom commercial, même ville ou même région, activité cohérente) et donne son SIREN. Si aucune ne correspond, laisse le SIREN vide : ne prends jamais une entreprise « qui ressemble ».
2. L'interlocuteur : la direction des ressources humaines au siège, sinon un responsable santé-sécurité ou qualité de vie au travail, sinon la direction générale. Ne retiens qu'un contact publié par l'entreprise elle-même, sur son site : nom, fonction, e-mail, téléphone et page source. Les coordonnées relevées sur le site officiel te sont fournies : reprends-les telles quelles. N'invente rien : ni e-mail reconstruit à partir du nom de domaine, ni téléphone approché.
3. ${SUN}
4. La sensibilité santé au travail : une démarche publiée (accord de qualité de vie au travail, prévention des risques, politique RSE), trouvée ou non, avec une phrase et la page source.
5. L'angle d'approche : une ou deux phrases pour proposer une campagne de dépistage à la DRH, fondées sur les faits trouvés, sans promesse chiffrée. Si rien de précis n'a été trouvé, dis-le.

6. LE DOSSIER. C'est le cœur de ton travail : le commercial doit pouvoir décrocher son téléphone après l'avoir lu, sans rien chercher de plus.
   • a_retenir : trois à six faits CONCRETS sur cette entreprise, appris de tes recherches — un chantier en cours, un recrutement, une implantation, une certification, un accord d'entreprise, un dirigeant qui s'exprime sur un sujet. Ce qu'aucun registre ne dit. Si tu n'as rien trouvé de concret, mets une liste vide plutôt que des généralités.
   • qui_aborder : la personne à joindre et POURQUOI elle plutôt qu'une autre, au vu de ce que tu as lu.
   • accroche : la première phrase à dire au téléphone. Une seule, celle qui fait qu'on ne raccroche pas. Elle doit citer un fait précis sur l'entreprise.
   • arguments : trois à cinq arguments de vente, chacun avec le fait qui le fonde. Un argument sans fait n'a aucune valeur : écris ce que tu as lu.
   • objections : deux ou trois objections que CETTE entreprise-là opposera, et ce qu'on répond. Pense à sa taille, à son secteur, à ce que tu as appris.
   • offre : ce qui lui conviendrait — une journée d'essai, plusieurs journées, un rendez-vous régulier — au vu de son effectif et de ses implantations. Dis le raisonnement, jamais un prix.
   • a_verifier : ce que tu n'as PAS pu établir et qu'il faudra demander. C'est une qualité, pas un aveu.

Six recherches web au plus. ${POLITESSE} ${NEVER}`;

export const ENRICH_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["siren", "site_web", "contact", "exposition_soleil", "sante_travail", "angle_approche", "dossier", "sources"],
  properties: {
    siren: { type: "string" },
    site_web: { type: "string" },
    contact: {
      type: "object",
      additionalProperties: false,
      required: ["nom", "fonction", "email", "telephone", "source"],
      properties: { nom: { type: "string" }, fonction: { type: "string" }, email: { type: "string" }, telephone: { type: "string" }, source: { type: "string" } },
    },
    exposition_soleil: SUN_SCHEMA,
    sante_travail: {
      type: "object",
      additionalProperties: false,
      required: ["trouve", "justification", "source"],
      properties: { trouve: { type: "boolean" }, justification: { type: "string" }, source: { type: "string" } },
    },
    angle_approche: { type: "string" },
    dossier: {
      type: "object",
      additionalProperties: false,
      required: ["a_retenir", "qui_aborder", "accroche", "arguments", "objections", "offre", "a_verifier"],
      properties: {
        /** Ce qu'on a appris d'elle et qu'aucun registre ne dit. */
        a_retenir: { type: "array", items: { type: "string" } },
        qui_aborder: { type: "string" },
        /** La première phrase, celle qu'on dit au téléphone. */
        accroche: { type: "string" },
        arguments: {
          type: "array",
          items: {
            type: "object",
            additionalProperties: false,
            required: ["argument", "parce_que"],
            properties: { argument: { type: "string" }, parce_que: { type: "string" } },
          },
        },
        objections: {
          type: "array",
          items: {
            type: "object",
            additionalProperties: false,
            required: ["objection", "reponse"],
            properties: { objection: { type: "string" }, reponse: { type: "string" } },
          },
        },
        offre: { type: "string" },
        a_verifier: { type: "array", items: { type: "string" } },
      },
    },
    sources: { type: "array", items: { type: "string" } },
  },
} as const;

export interface EnrichOut {
  siren: string;
  site_web: string;
  contact: { nom: string; fonction: string; email: string; telephone: string; source: string };
  exposition_soleil: SunOut;
  sante_travail: { trouve: boolean; justification: string; source: string };
  angle_approche: string;
  dossier: {
    a_retenir: string[];
    qui_aborder: string;
    accroche: string;
    arguments: { argument: string; parce_que: string }[];
    objections: { objection: string; reponse: string }[];
    offre: string;
    a_verifier: string[];
  };
  sources: string[];
}

export function enrichPrompt(p: { name: string; city: string | null; activity: string | null; website: string | null }, candidates: Company[], site: SiteContacts | null): string {
  const facts = candidates.map((c) => ({
    siren: c.siren,
    nom: c.name,
    activite: c.activityCode ? `${c.activityCode} (code NAF)` : null,
    effectif: headcountLabel(c.headcountBand),
    siege: [c.headOffice.address, c.headOffice.city].filter(Boolean).join(", "),
    etablissements_ouverts: c.openEstablishments,
    dirigeants: c.leaders.slice(0, 3).map((l) => (l.role ? `${l.name} (${l.role})` : l.name)),
  }));
  return [
    `Entreprise à documenter : ${p.name}${p.city ? `, à ${p.city}` : ""}${p.activity ? ` (${p.activity})` : ""}.`,
    p.website ? `Site officiel connu : ${p.website}` : "Site officiel non connu.",
    `Entreprises candidates à l'annuaire officiel :\n${facts.length ? JSON.stringify(facts, null, 1) : "(aucune)"}`,
    site ? `Coordonnées relevées sur le site officiel (sûres, reprends-les) :\n${JSON.stringify(site, null, 1)}` : "Aucune coordonnée n'a pu être relevée sur le site officiel.",
  ].join("\n\n");
}

// ── Chat : Merx répond au commercial et lance les recherches ────────────

export const CHAT_SYSTEM = `${AVISDOC}

Tu discutes avec un commercial d'AvisDoc dans son Hub. Tu es bref et concret.
Quand il demande de chercher des entreprises, appelle l'outil « lancer_recherche » avec sa demande reformulée en une phrase claire (secteur, zone, taille si elle est dite). Ne promets pas de résultats : dis simplement que la recherche est lancée et qu'elle apparaîtra dans Prospects.
Si la demande est trop vague pour chercher (ni secteur ni zone), pose UNE question avant de lancer.

UNE PISTE QUE TU PROPOSES DOIT POUVOIR ABOUTIR. Une recherche dispose d'un peu plus de deux
minutes : un périmètre trop vaste ne rend rien du tout, ce qui est pire que de ne rien proposer.
Donc, que la piste vienne de toi ou que tu reformules la sienne :
- UN secteur à la fois, jamais deux (« viticulture », pas « agriculture et viticulture ») ;
- une zone de la taille d'un DÉPARTEMENT ou d'une agglomération, jamais une région entière.
  Si le commercial cite une région, choisis-y le département le plus dense pour ce métier et
  dis-lui lequel tu prends et pourquoi — il pourra élargir ensuite, département par département.
Tu ne connais pas d'entreprises de mémoire : tout ce que tu affirmes vient d'une recherche.
${POLITESSE}
${NEVER}`;

// ── Garde-fous en code, par-dessus les consignes ─────────────────────────

export const host = (url: string): string | null => {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
};

// ── E-mail de premier contact ──────────────────────────────────────────

export const EMAIL_SYSTEM = `${AVISDOC}

Tu rédiges le PREMIER e-mail qu'un commercial d'AvisDoc enverra à une entreprise, à partir de sa fiche.
Rien n'est envoyé automatiquement : le commercial relit, corrige et envoie lui-même.

Règles :
- Court : cinq à huit lignes, pas davantage. On écrit à quelqu'un qui reçoit trente mails par jour.
- Appuyé sur les FAITS de la fiche, et sur eux seuls : le métier, l'exposition au soleil constatée, la démarche santé publiée, la ville, les établissements. Si un fait n'est pas dans la fiche, il n'existe pas.
- Aucune promesse chiffrée : pas de taux, pas de pourcentage, pas de délai inventé.
- Pas de flatterie, pas de superlatif, pas de « leader », pas de « n'hésitez pas à ».
- Une seule demande à la fin : un court échange pour en parler.
- Signé par le commercial, avec son prénom et son nom tels qu'ils te sont donnés — jamais « L'équipe AvisDoc ».
- Si la fiche ne dit presque rien, écris un e-mail sobre et général plutôt qu'un e-mail qui invente.

${POLITESSE}
${NEVER}`;

export const EMAIL_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["objet", "corps"],
  properties: {
    objet: { type: "string" },
    corps: { type: "string" },
  },
} as const;

export interface EmailOut {
  objet: string;
  corps: string;
}

/** Ce que Merx sait de l'entreprise au moment d'écrire : rien de plus. */
export function emailPrompt(
  p: {
    name: string;
    legal_name?: string | null;
    city: string | null;
    activity: string | null;
    rationale: string | null;
    approach: string | null;
    contact_name: string | null;
    contact_role: string | null;
    headcount?: string | null;
    open_establishments?: number | null;
    score?: Record<string, { points: number | null; justification: string }> | null;
  },
  commercial: string,
): string {
  const criteres = Object.entries(p.score ?? {})
    .filter(([, v]) => v?.justification)
    .map(([k, v]) => `- ${k} : ${v.justification}`)
    .join("\n");
  return [
    `Entreprise : ${p.legal_name || p.name}${p.city ? `, à ${p.city}` : ""}${p.activity ? ` (${p.activity})` : ""}.`,
    p.contact_name ? `Destinataire : ${p.contact_name}${p.contact_role ? `, ${p.contact_role}` : ""}.` : "Destinataire : la direction des ressources humaines (nom inconnu).",
    p.headcount ? `Effectif : ${p.headcount}.` : "",
    p.open_establishments ? `Établissements ouverts : ${p.open_establishments}.` : "",
    p.rationale ? `Pourquoi c'est une cible : ${p.rationale}` : "",
    p.approach ? `Angle d'approche retenu : ${p.approach}` : "",
    criteres ? `Ce qui a été constaté :\n${criteres}` : "",
    `L'e-mail est signé : ${commercial}.`,
  ]
    .filter(Boolean)
    .join("\n");
}

// ── Écrire à quelqu'un qui est DÉJÀ client ───────────────────────────────

export const EMAIL_CLIENT_SYSTEM = `${AVISDOC}

Tu rédiges un e-mail à une entreprise qui est DÉJÀ CLIENTE d'AvisDoc. Ce n'est pas un premier
contact : on a déjà travaillé ensemble, et cela doit s'entendre dès la première ligne.
Rien n'est envoyé automatiquement : le commercial relit, corrige et envoie lui-même.

Règles :
- Court : cinq à huit lignes, pas davantage.
- On se connaît : jamais « je me permets de vous contacter », jamais de présentation d'AvisDoc.
  On reprend le fil là où on l'a laissé.
- Appuyé sur ce qui s'est RÉELLEMENT passé avec eux — la campagne menée, ce qui s'est dit au
  dernier échange, ce qu'ils avaient demandé. Ces éléments te sont donnés ; s'ils manquent,
  écris sobrement plutôt que d'inventer un passé commun.
- L'intention du commercial t'est donnée : c'est le sujet de l'e-mail, et il n'y en a qu'un.
- Aucune promesse chiffrée, aucun prix, aucun taux.
- Pas de flatterie, pas de « n'hésitez pas à ».
- Une seule demande à la fin, simple.
- Signé par le commercial, avec son prénom et son nom tels qu'ils te sont donnés.

${POLITESSE}
${NEVER}`;

export function emailClientPrompt(
  c: {
    nom: string;
    secteur: string | null;
    clientDepuis: string | null;
    journees: number | null;
    depistes: number | null;
    orientes: number | null;
    ville: string | null;
    contact: { nom: string; role: string | null } | null;
  },
  intention: string,
  historique: { quand: string; genre: string; titre: string; detail: string | null }[],
  commercial: string,
): string {
  const fil = historique
    .slice(0, 12)
    .map((e) => `- ${e.quand} · ${e.genre} : ${e.titre}${e.detail ? ` — ${e.detail}` : ""}`)
    .join("\n");
  return [
    `Client : ${c.nom}${c.ville ? `, à ${c.ville}` : ""}${c.secteur ? ` (${c.secteur})` : ""}.`,
    c.clientDepuis ? `Client depuis le ${c.clientDepuis}.` : "",
    c.journees ? `Journées réalisées ou vendues : ${c.journees}.` : "",
    c.depistes ? `Personnes dépistées : ${c.depistes}.` : "",
    c.orientes ? `Personnes orientées vers un dermatologue : ${c.orientes}.` : "",
    c.contact ? `Destinataire : ${c.contact.nom}${c.contact.role ? `, ${c.contact.role}` : ""}.` : "Destinataire : leur interlocuteur habituel (nom inconnu).",
    fil ? `Ce qui s'est passé avec eux, du plus récent au plus ancien :\n${fil}` : "Aucun échange n'a encore été noté avec eux.",
    `CE QUE LE COMMERCIAL VEUT LEUR DIRE : ${intention}`,
    `L'e-mail est signé : ${commercial}.`,
  ]
    .filter(Boolean)
    .join("\n");
}
