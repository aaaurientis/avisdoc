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
  phones: string[];
  /** Extraits des pages d'équipe où une personne est nommée avec sa fonction. */
  equipe: string[];
  readOn: string;
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

export async function readSiteContacts(site: string | null, rapide = false): Promise<SiteContacts | null> {
  if (!site) return null;
  let base: URL;
  try {
    base = new URL(/^https?:\/\//.test(site) ? site : `https://${site}`);
  } catch {
    return null;
  }
  const emails = new Set<string>();
  const phones = new Set<string>();
  const equipe = new Set<string>();
  await Promise.all(
    (rapide ? PAGES_RAPIDES : PAGES).map(async (page) => {
      try {
        const res = await fetch(new URL(page, base), {
          signal: AbortSignal.timeout(PAGE_TIMEOUT_MS),
          headers: { "user-agent": "Mozilla/5.0 (compatible; AvisDocHub/1.0)" },
        });
        if (!res.ok) return;
        const html = (await res.text()).slice(0, MAX_HTML);
        for (const m of html.matchAll(/mailto:([^"'?\s>&]+@[^"'?\s>&]+)/gi)) {
          const email = decodeURIComponent(m[1]).toLowerCase().replace(/[.,;]$/, "");
          if (!JUNK.test(email) && email.length < 90) emails.add(email);
        }
        for (const m of html.matchAll(/tel:(\+?[\d\s().-]{8,20})/gi)) phones.add(m[1].replace(/\s+/g, " ").trim());
        // Les pages d'équipe : on remonte qui y est nommé, et à quel titre.
        if (page !== "" && page !== "mentions-legales") {
          for (const extrait of passagesNommes(texteDe(html))) equipe.add(extrait);
        }
      } catch {
        // page absente, site injoignable ou trop lent : on passe
      }
    }),
  );
  if (!emails.size && !phones.size && !equipe.size) return null;
  return {
    emails: [...emails].slice(0, 5),
    phones: [...phones].slice(0, 3),
    equipe: [...equipe].slice(0, 10),
    readOn: base.origin,
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
        if (/domain (is )?for sale|acheter ce domaine|parking|sedoparking|afternic/i.test(html)) continue;
        return url;
      } catch {
        // domaine inexistant ou injoignable : on essaie le suivant
      }
    }
  }
  return null;
}
