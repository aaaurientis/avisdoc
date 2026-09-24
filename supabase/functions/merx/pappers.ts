// Pappers : ce que le registre ne publie pas.
//
// Le site web, le téléphone, parfois l'adresse électronique. L'annuaire de l'État donne
// l'identité, l'effectif et les dirigeants, mais jamais de quoi appeler — et une fiche
// sans numéro ne sert à personne.
//
// La clé PAPPERS_API_KEY est posée sur le projet depuis longtemps et n'était utilisée
// nulle part dans Merx. Ce module la branche.
//
// Deux leçons de Google Places, qui n'a jamais rien rendu sans que personne le sache :
// l'échec est RAPPORTÉ, jamais avalé ; et le premier appel dit quels champs la formule
// souscrite autorise réellement, plutôt que de le supposer.

const BASE = "https://api.pappers.fr/v2/entreprise";
const TIMEOUT_MS = 8_000;
/** Par paquets : cent entreprises tiennent en une dizaine de secondes. */
const PAR_VAGUE = 8;

export interface FichePappers {
  /**
   * L'objet social : ce que l'entreprise déclare faire, en toutes lettres.
   *
   * Le registre ne donne qu'un code d'activité — « Aquaculture en mer ». Pappers rend
   * la phrase des statuts : « élevage, production et commercialisation d'huîtres et de
   * moules, conditionnement et expédition ». Le commercial sait alors à qui il parle.
   */
  objetSocial: string | null;
  /** Le domaine d'activité en clair, plus large que le code. */
  domaine: string | null;
  /** Les conventions collectives : elles disent le métier réel des salariés. */
  conventions: string[];
  site: string | null;
  telephone: string | null;
  email: string | null;
  /** Dirigeants avec leur fonction, plus complets que ceux du registre. */
  dirigeants: { nom: string; role: string | null }[];
  /** Effectif au sens de Pappers, souvent renseigné quand l'INSEE se tait. */
  effectif: string | null;
  /** L'adresse de la fiche publique : c'est elle qu'on cite comme source. */
  source: string;
}

let dernierEchec: string | null = null;
/** La dernière raison pour laquelle Pappers n'a rien rendu, pour pouvoir la dire. */
export const echecPappers = () => dernierEchec;

/** Les champs que la formule souscrite a réellement renvoyés, au premier appel réussi. */
let champsVus: string[] = [];
export const champsPappers = () => champsVus;

/* eslint-disable @typescript-eslint/no-explicit-any */

const texte = (v: unknown): string | null => {
  const s = typeof v === "string" ? v.trim() : "";
  return s || null;
};

/** Ce que Pappers sait d'une entreprise, par son numéro SIREN. */
export async function chercherPappers(siren: string): Promise<FichePappers | null> {
  const cle = Deno.env.get("PAPPERS_API_KEY");
  if (!cle) {
    dernierEchec = "aucune clé PAPPERS_API_KEY sur le projet";
    return null;
  }
  if (!/^\d{9}$/.test(siren)) return null;

  try {
    const res = await fetch(`${BASE}?siren=${siren}&api_token=${encodeURIComponent(cle)}`, {
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!res.ok) {
      const detail =
        res.status === 401 ? " — clé refusée"
        : res.status === 402 ? " — crédits épuisés"
        : res.status === 429 ? " — trop d’appels d’un coup"
        : "";
      dernierEchec = `Pappers a répondu ${res.status}${detail}`;
      return null;
    }
    const d: any = await res.json();
    if (champsVus.length === 0) champsVus = Object.keys(d ?? {});

    const dirigeants = (d?.representants ?? d?.dirigeants ?? [])
      .map((r: any) => ({
        nom: texte(r?.nom_complet) ?? [texte(r?.prenom), texte(r?.nom)].filter(Boolean).join(" "),
        role: texte(r?.qualite),
      }))
      .filter((r: any) => r.nom);

    return {
      objetSocial: texte(d?.objet_social),
      domaine: texte(d?.domaine_activite),
      conventions: (d?.conventions_collectives ?? [])
        .map((c: any) => texte(c?.nom) ?? texte(c?.titre) ?? texte(c))
        .filter(Boolean) as string[],
      site: texte(d?.site_web),
      telephone: texte(d?.telephone),
      email: texte(d?.email),
      dirigeants,
      effectif: texte(d?.effectif) ?? texte(d?.tranche_effectif),
      source: `https://www.pappers.fr/entreprise/${siren}`,
    };
  } catch (e) {
    dernierEchec = `Pappers injoignable : ${e instanceof Error ? e.message : String(e)}`;
    return null;
  }
}

/**
 * Le même travail pour toute une recherche, par vagues.
 *
 * Pappers facture à l'appel : on n'interroge que les entreprises dont on a le SIREN,
 * c'est-à-dire celles que le registre a confirmées.
 */
export async function chercherPappersEnLot(sirens: string[]): Promise<Map<string, FichePappers>> {
  const trouves = new Map<string, FichePappers>();
  dernierEchec = null;
  if (!Deno.env.get("PAPPERS_API_KEY")) {
    dernierEchec = "aucune clé PAPPERS_API_KEY sur le projet";
    return trouves;
  }
  for (let i = 0; i < sirens.length; i += PAR_VAGUE) {
    const vague = sirens.slice(i, i + PAR_VAGUE);
    const fiches = await Promise.all(vague.map((s) => chercherPappers(s)));
    vague.forEach((s, j) => {
      const f = fiches[j];
      if (f) trouves.set(s, f);
    });
    // Une clé refusée ou des crédits épuisés ne se réparent pas à l'appel suivant :
    // on s'arrête plutôt que de brûler cent appels pour cent échecs.
    if (dernierEchec && trouves.size === 0 && i >= PAR_VAGUE) break;
  }
  return trouves;
}
