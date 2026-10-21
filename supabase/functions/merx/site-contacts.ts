// Ce que le site officiel d'une entreprise publie sur lui-même : coordonnées, et QUI dirige.
//
// Deux secondes, gratuit, et sans erreur possible là où le modèle cherchait longtemps.
//
// On lisait les liens `mailto:` et `tel:` — et rien d'autre. Résultat : sur un site qui
// publie sa direction complète avec noms et fonctions, Merx ne trouvait « aucun
// interlocuteur » et conseillait d'appeler le standard. On lit donc aussi les pages qui
// présentent l'équipe, et on en remonte les passages nommant une personne : c'est le
// modèle qui décidera laquelle aborder, mais encore faut-il qu'il les voie.

const PAGES = [
  "", "contact", "nous-contacter", "contactez-nous", "mentions-legales",
  "equipe", "notre-equipe", "equipe-dirigeante", "direction", "gouvernance",
  "qui-sommes-nous", "a-propos", "notre-entreprise",
  // Les pages de recrutement sont la meilleure source d'adresses RH : c'est là
  // qu'une entreprise publie « recrutement@ », « rh@ », et souvent le nom de la
  // personne qui reçoit les candidatures.
  "recrutement", "carrieres", "carriere", "nous-rejoindre", "rejoignez-nous", "emploi", "offres-emploi",
];

/** Les fonctions qui nous intéressent : celles qui décident d'une campagne de dépistage. */
const FONCTIONS =
  /(directeur|directrice|DRH|ressources humaines|qualité de vie au travail|QVT|santé au travail|HSE|QHSE|sécurité|président|gérant|dirigeant|responsable)/gi;
const PAGE_TIMEOUT_MS = 5_000; // pages lues en parallèle : l'ensemble reste sous 5 s
const MAX_HTML = 2_000_000; // pas de troncature courte : des liens de contact se trouvent très bas dans la page
// Un e-mail de brique logicielle ou d'image n'est pas un contact.
const JUNK = /(sentry|wixpress|squarespace|example\.(com|org)|@2x|\.(png|jpe?g|gif|svg|webp)$)/i;

export interface SiteContacts {
  emails: string[];
  /** Le standard d'abord : pages de contact, puis mentions légales, puis accueil. */
  phones: string[];
  /** Extraits des pages d'équipe où une personne est nommée avec sa fonction. */
  equipe: string[];
  readOn: string;
  /**
   * Le SIREN de l'entreprise est écrit sur ce site (mentions légales, pied de page) :
   * c'est bien SON site. Sans cette preuve, un site trouvé n'est qu'un candidat —
   * « recre-action.fr » n'était pas le site de Récré'Action (21/10).
   */
  prouve: boolean;
  /** La page où le SIREN a été lu. */
  preuve: string | null;
}

/** Le texte d'une page, débarrassé du balisage et des scripts. */
function texteDe(html: string): string {
  return html
    .replace(/<(script|style|noscript)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Les passages qui nomment quelqu'un avec sa fonction.
 *
 * On ne tente pas d'extraire le nom nous-mêmes : une expression régulière prendrait
 * « Directeur Général » pour un patronyme une fois sur trois. On remonte le passage
 * entier, et c'est le modèle qui lit — il sait faire la différence.
 */
function passagesNommes(texte: string): string[] {
  const trouves: string[] = [];
  for (const m of texte.matchAll(FONCTIONS)) {
    const i = m.index ?? 0;
    const extrait = texte.slice(Math.max(0, i - 90), i + 130).trim();
    // Un passage sans majuscule isolée ne contient pas de nom propre.
    if (/\b[A-ZÀ-Ü][a-zà-ÿ]+\s+[A-ZÀ-Ü]/.test(extrait)) trouves.push(extrait);
    if (trouves.length >= 12) break;
  }
  return [...new Set(trouves)];
}

/**
 * Les seules pages qui portent presque toujours un numéro et une adresse.
 *
 * Lire les dix-neuf pages de PAGES pour cent entreprises dépasse le budget de la
 * fonction. À la recherche on se limite à ces trois-là ; l'approfondissement, qui ne
 * traite qu'une fiche, lit tout.
 */
const PAGES_RAPIDES = ["", "contact", "nous-contacter", "mentions-legales"];

/** « 01.60.35.45.75 », « +33 1 60 35 45 75 » → « 01 60 35 45 75 ». */
function numeroFrancais(brut: string): string | null {
  const d = brut.replace(/\D/g, "").replace(/^0033/, "33").replace(/^330(?=[1-9]\d{8}$)/, "33").replace(/^33(?=[1-9]\d{8}$)/, "0");
  return /^0[1-9]\d{8}$/.test(d) ? d.replace(/(\d{2})(?=\d)/g, "$1 ") : null;
}

/**
 * Les numéros écrits dans le texte, pas seulement les liens « tel: » : la plupart des
 * sites écrivent « Tél. 01 60 35 45 75 » sans lien (recreaction.fr, 21/10). Un numéro
 * précédé de « fax » ou « télécopie » n'est pas un standard.
 */
function numerosDuTexte(texte: string): string[] {
  const trouves: string[] = [];
  for (const m of texte.matchAll(/(?<![\d+])(?:\+33\s?(?:\(0\)\s?)?|0)[1-9](?:[\s.\-]?\d{2}){4}(?!\d)/g)) {
    const avant = texte.slice(Math.max(0, (m.index ?? 0) - 25), m.index ?? 0);
    if (/fax|t[ée]l[ée]copie/i.test(avant)) continue;
    const n = numeroFrancais(m[0]);
    if (n) trouves.push(n);
  }
  return trouves;
}

/** Le SIREN (ou le SIRET, ou la TVA intracommunautaire qui le contient) est-il écrit ici ? */
function porteLeSiren(texte: string, siren: string): boolean {
  const colle = texte.replace(/(\d)[\s.\u00a0]+(?=\d)/g, "$1");
  return new RegExp(`(?<!\\d)${siren}(?:\\d{5})?(?!\\d)|FR\\s?\\d{2}${siren}(?!\\d)`).test(colle);
}

/** Les liens de la page d'accueil vers le contact et les mentions légales, quel que soit leur chemin. */
function liensUtiles(html: string, base: URL): string[] {
  const liens = new Set<string>();
  for (const m of html.matchAll(/<a\b[^>]*href=["']([^"'#]+)["'][^>]*>([\s\S]{0,200}?)<\/a>/gi)) {
    const cible = `${m[1]} ${m[2].replace(/<[^>]+>/g, " ")}`;
    if (!/contact|mentions|l[ée]gal|imprint/i.test(cible)) continue;
    try {
      const u = new URL(m[1], base);
      if (u.host.replace(/^www\./, "") === base.host.replace(/^www\./, "")) liens.add(u.href);
    } catch {
      // lien mal formé : on passe
    }
    if (liens.size >= 4) break;
  }
  return [...liens];
}

export async function readSiteContacts(site: string | null, rapide = false, siren: string | null = null): Promise<SiteContacts | null> {
  if (!site) return null;
  let base: URL;
  try {
    base = new URL(/^https?:\/\//.test(site) ? site : `https://${site}`);
  } catch {
    return null;
  }
  const lire = async (url: URL | string): Promise<{ html: string; url: string } | null> => {
    try {
      const res = await fetch(url, {
        signal: AbortSignal.timeout(PAGE_TIMEOUT_MS),
        headers: { "user-agent": "Mozilla/5.0 (compatible; AvisDocHub/1.0)" },
      });
      if (!res.ok) return null;
      return { html: (await res.text()).slice(0, MAX_HTML), url: res.url || String(url) };
    } catch {
      return null; // page absente, site injoignable ou trop lent
    }
  };

  // L'accueil d'abord : c'est lui qui dit où sont vraiment le contact et les mentions
  // légales (« /nous-contacter/ », « /contact-2 », « /fr/mentions »…).
  // Accueil en panne : on lit quand même les pages habituelles.
  const accueil = await lire(base);
  const origine = accueil ? new URL(accueil.url) : base;
  const chemins = new Set<string>(accueil ? liensUtiles(accueil.html, origine) : []);
  for (const page of rapide ? PAGES_RAPIDES : PAGES) if (page) chemins.add(new URL(page, origine).href);
  const pages = [...(accueil ? [{ ...accueil, chemin: "" }] : []), ...(await Promise.all([...chemins].map(async (c) => {
    const lu = await lire(c);
    return lu ? { ...lu, chemin: c } : null;
  }))).filter((x): x is { html: string; url: string; chemin: string } => x !== null)];
  if (!pages.length) return null;

  const emails = new Set<string>();
  const equipe = new Set<string>();
  // Le standard est sur la page de contact, puis dans les mentions légales, puis sur l'accueil.
  const rang = (url: string) => (/contact/i.test(url) ? 0 : /mentions|l[ée]gal/i.test(url) ? 1 : url === accueil?.url ? 2 : 3);
  const numeros: { n: string; rang: number }[] = [];
  let preuve: string | null = null;
  for (const { html, url } of pages) {
    for (const m of html.matchAll(/mailto:([^"'?\s>&]+@[^"'?\s>&]+)/gi)) {
      let email: string;
      try {
        email = decodeURIComponent(m[1]).toLowerCase().replace(/[.,;]$/, "");
      } catch {
        continue; // lien mal formé : il ne doit pas faire échouer toute la lecture
      }
      if (!JUNK.test(email) && email.length < 90) emails.add(email);
    }
    const texte = texteDe(html);
    const r = rang(url);
    for (const m of html.matchAll(/tel:(\+?[\d\s().-]{8,20})/gi)) {
      const n = numeroFrancais(m[1]);
      if (n) numeros.push({ n, rang: r });
    }
    for (const n of numerosDuTexte(texte)) numeros.push({ n, rang: r + 0.5 });
    if (siren && !preuve && porteLeSiren(texte, siren)) preuve = url;
    // Les pages d'équipe : on remonte qui y est nommé, et à quel titre.
    if (url !== accueil?.url && r !== 1) {
      for (const extrait of passagesNommes(texte)) equipe.add(extrait);
    }
  }
  const phones = [...new Set(numeros.sort((a, b) => a.rang - b.rang).map((x) => x.n))];
  if (!emails.size && !phones.length && !equipe.size && !preuve) return null;
  return {
    emails: [...emails].slice(0, 5),
    phones: phones.slice(0, 3),
    equipe: [...equipe].slice(0, 10),
    readOn: origine.origin,
    prouve: preuve !== null,
    preuve,
  };
}

// ── Trouver le site quand personne ne nous le donne ──────────────────────
//
// Le registre ne publie pas les adresses web ; Pappers, dans la formule souscrite, non
// plus ; Google Places est refusé depuis un serveur. Restait une piste qu'on n'avait
// jamais essayée : le deviner.
//
// Mesuré sur huit entreprises réelles — quatre trouvées. Ce n'est pas suffisant seul,
// mais c'est gratuit, immédiat, et sur les quatre sites trouvés le lecteur a ramené
// quatre adresses électroniques et trois téléphones. Château Cheval Blanc :
// « contact@chateau-chevalblanc.com » et « 05 57 55 55 55 », en deux secondes.

/** Les formes de nom de domaine qu'une entreprise a des chances d'avoir prises. */
function domainesProbables(nom: string): string[] {
  const sansAccent = nom
    .toUpperCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\(.*?\)/g, " ")
    // Les formes juridiques ne font jamais partie du domaine.
    .replace(/\b(SARL|SAS|SASU|SA|SCEA|EARL|GAEC|SCI|SC|EURL|SNC|SOC|SOCIETE|CIVILE|ETS|ETABLISSEMENTS|GROUPE)\b/g, " ");
  const mots = sansAccent.split(/[^A-Z0-9]+/).filter((m) => m.length > 1);
  if (mots.length === 0 || mots.length > 5) return [];
  const avecTirets = mots.join("-").toLowerCase();
  const colle = mots.join("").toLowerCase();
  const bases = [...new Set([avecTirets, colle])];
  return bases.flatMap((b) => [`${b}.com`, `${b}.fr`]).slice(0, 4);
}

/**
 * Le site officiel probable, vérifié : on ne rend une adresse que si elle répond.
 *
 * Un domaine qui existe mais renvoie une page de parking n'est pas retenu — le lecteur
 * qui suit n'y trouverait rien, et une fausse adresse sur une fiche vaut moins que pas
 * d'adresse du tout.
 */
export async function devinerSite(nom: string): Promise<string | null> {
  for (const d of domainesProbables(nom)) {
    for (const prefixe of ["https://www.", "https://"]) {
      const url = prefixe + d;
      try {
        const res = await fetch(url, {
          method: "GET",
          redirect: "follow",
          signal: AbortSignal.timeout(5_000),
          headers: { "User-Agent": "Mozilla/5.0 (compatible; AvisDocMerx/1.0)" },
        });
        if (!res.ok) continue;
        const html = (await res.text()).slice(0, 200_000);
        // Une page de parking ou de vente de domaine ne compte pas.
        if (/domain (is )?for sale|acheter ce domaine|parking|parked domain|sedoparking|afternic|hostinger dns|domaine (est )?(à vendre|réservé)/i.test(html)) continue;
        return url;
      } catch {
        // domaine inexistant ou injoignable : on essaie le suivant
      }
    }
  }
  return null;
}
