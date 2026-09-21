// Consignes de Merx : une recherche rapide rend une liste de fiches légères ; l'approfondissement d'une fiche
// se fait à la demande. Cible (Olivier, 12/09/2026) : AvisDoc vend des campagnes de dépistage dermatologique
// à la DRH, plutôt au siège ; le critère médical premier est l'exposition des salariés au soleil.

import { SECTORS, type SunLevel } from "./scoring.ts";
import { headcountLabel, type Company } from "./annuaire.ts";
import type { SiteContacts } from "./site-contacts.ts";

const AVISDOC = `Tu es Merx, l'agent de prospection d'AvisDoc, société française de téléexpertise dermatologique qui organise des campagnes de dépistage en entreprise et en collectivité. Ces campagnes se vendent à la direction des ressources humaines (DRH), le plus souvent au siège. Le critère médical premier est l'exposition des salariés au soleil.`;

const SUN = `L'exposition au soleil des salariés : « majorite_dehors », « partie_dehors » ou « interieur » seulement si une page l'indique ou si le métier s'exerce par nature dehors (chantiers, espaces verts, cultures en plein champ…), avec une phrase de justification ; sinon « non_evalue ».`;

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
Cherche RAPIDEMENT des entreprises correspondant à la demande : deux recherches web suffisent. On veut une LISTE de dix entreprises au plus, pas des dossiers : ni SIREN, ni dirigeant, ni téléphone, ils seront cherchés plus tard à la demande.

Pour chacune :
- le nom exact et la ville ; le code du département (deux chiffres, trois en outre-mer) seulement s'il est certain ;
- l'activité ;
- le secteur, qui range la fiche dans la bonne colonne : exactement l'une de ces valeurs, ${SECTORS.map((x) => `« ${x.id} » (${x.label})`).join(", ")} ; « autre » seulement si rien d'autre ne convient ;
- le site officiel : celui de l'entreprise elle-même, sous son propre nom de domaine, jamais une plateforme tierce (annuaire, recrutement, réseau social, presse) ; vide s'il n'apparaît pas ;
- une phrase qui dit pourquoi elle correspond à la demande ;
- ${SUN}
- les adresses des pages où tu l'as trouvée.

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

Trois recherches web au plus. ${NEVER}`;

export const ENRICH_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["siren", "site_web", "contact", "exposition_soleil", "sante_travail", "angle_approche", "sources"],
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
Tu ne connais pas d'entreprises de mémoire : tout ce que tu affirmes vient d'une recherche. ${NEVER}`;

// ── Garde-fous en code, par-dessus les consignes ─────────────────────────

export const host = (url: string): string | null => {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
};
