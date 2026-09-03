// Import CSV multi-listes : analyse du fichier, proposition de mapping des
// colonnes, construction des lignes envoyées à prospection.importer().
// Le dédoublonnage et l'exclusion sont faits côté serveur, en une transaction.
import type { NiveauContact, TypeCompte } from "../data/types";
import { calculerScore } from "./signaux";

export type Csv = { entetes: string[]; lignes: string[][]; separateur: string };

/** PR-60 : analyse RFC 4180 tolérante (guillemets, CRLF, BOM, séparateur détecté). */
export function pr60AnalyserCsv(texte: string): Csv {
  const src = texte.replace(/^\uFEFF/, "");
  const premiereLigne = src.split(/\r?\n/, 1)[0] ?? "";
  const separateur = [";", ",", "\t"]
    .map((s) => ({ s, n: premiereLigne.split(s).length }))
    .sort((a, b) => b.n - a.n)[0]?.s ?? ",";

  const lignes: string[][] = [];
  let ligne: string[] = [];
  let champ = "";
  let entreGuillemets = false;
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (entreGuillemets) {
      if (c === '"') {
        if (src[i + 1] === '"') { champ += '"'; i++; } else { entreGuillemets = false; }
      } else {
        champ += c;
      }
      continue;
    }
    if (c === '"') { entreGuillemets = true; continue; }
    if (c === separateur) { ligne.push(champ); champ = ""; continue; }
    if (c === "\r") continue;
    if (c === "\n") { ligne.push(champ); lignes.push(ligne); ligne = []; champ = ""; continue; }
    champ += c;
  }
  if (champ.length > 0 || ligne.length > 0) { ligne.push(champ); lignes.push(ligne); }

  const nonVides = lignes.filter((l) => l.some((v) => v.trim() !== ""));
  const entetes = (nonVides.shift() ?? []).map((e) => e.trim());
  return { entetes, lignes: nonVides.map((l) => l.map((v) => v.trim())), separateur };
}

export const CHAMPS_IMPORT = [
  "prenom", "nom", "fonction", "email", "contact_linkedin_url", "anciennete_poste_mois",
  "compte_nom", "compte_linkedin_url", "site_web", "region", "secteur", "effectif",
] as const;
export type ChampImport = (typeof CHAMPS_IMPORT)[number];

/** Mapping champ → index de colonne du CSV. */
export type MappingImport = Partial<Record<ChampImport, number>>;

const SYNONYMES: Record<ChampImport, RegExp[]> = {
  prenom: [/^pr[ée]nom$/i, /^first ?name$/i, /^firstname$/i],
  nom: [/^nom$/i, /^last ?name$/i, /^lastname$/i, /^nom de famille$/i],
  fonction: [/^fonction$/i, /^poste$/i, /^titre$/i, /^title$/i, /^position$/i, /^intitul[ée]/i, /^job ?title$/i],
  email: [/^e-?mail/i, /^courriel$/i, /^adresse e-?mail/i, /^email address$/i],
  contact_linkedin_url: [/^(url|lien|profil|profile)?\s*linkedin( url)?$/i, /^url$/i, /^profile url$/i, /^lien du profil$/i, /^linkedin profile/i],
  anciennete_poste_mois: [/ancienne?t[ée].*(poste|mois)/i, /^months? in (position|role)$/i, /^time in role/i],
  compte_nom: [/^(entreprise|soci[ée]t[ée]|company|organisation|organization|account|compte|employeur)( name)?$/i, /^current company$/i, /^nom de l.entreprise$/i],
  compte_linkedin_url: [/company.*(url|linkedin)/i, /(url|linkedin).*(entreprise|company|soci[ée]t[ée])/i, /^page entreprise$/i],
  site_web: [/^(site ?web|website|site|url du site)$/i],
  region: [/^(r[ée]gion|localisation|location|ville|zone|g[ée]ographie|geography)$/i],
  secteur: [/^(secteur|industrie|industry|activit[ée])/i],
  effectif: [/^(effectif|taille|employees?|company size|headcount|nombre d.employ[ée]s)/i],
};

/** PR-61 : propose un mapping à partir des en-têtes ; l'utilisateur confirme. */
export function pr61ProposerMapping(entetes: string[]): MappingImport {
  const mapping: MappingImport = {};
  for (const champ of CHAMPS_IMPORT) {
    const idx = entetes.findIndex((e, i) =>
      !Object.values(mapping).includes(i) && SYNONYMES[champ].some((r) => r.test(e.trim())));
    if (idx >= 0) mapping[champ] = idx;
  }
  return mapping;
}

/** PR-62 : niveau hiérarchique déduit de l'intitulé de fonction. */
export function pr62DeduireNiveau(fonction: string | null | undefined): NiveauContact | null {
  const f = (fonction ?? "").toLowerCase();
  if (!f) return null;
  if (/(associ[ée]|g[ée]rant|pr[ée]sident|fondat|founder|ceo|dirigeant|owner|partner|managing)/.test(f)) return "associe";
  if (/(vice[- ]?pr[ée]sident|\bvp\b|svp|evp)/.test(f)) return "vp";
  if (/(directeur|directrice|\bdrh\b|\bdg\b|head of|chief|\bcxo\b|\bc[a-z]o\b|director)/.test(f)) return "directeur";
  if (/(responsable|manager|lead|chef de|coordinat)/.test(f)) return "responsable";
  if (/(charg[ée]|assistant|officer|analyst|consultant|gestionnaire)/.test(f)) return "charge";
  return null;
}

/** PR-63 : « 51-200 », « 1 001 - 5 000 », « 10 001+ », « 250 » → fourchette. */
export function pr63EffectifDepuisTexte(t: string | null | undefined): { min: number | null; max: number | null } {
  const s = (t ?? "").replace(/[\s\u00a0\u202f]/g, "");
  if (!s) return { min: null, max: null };
  const plus = /^(\d+)\+$/.exec(s);
  if (plus) return { min: Number(plus[1]), max: null };
  const range = /^(\d+)[-–à]+(\d+)$/.exec(s);
  if (range) return { min: Number(range[1]), max: Number(range[2]) };
  const seul = /^(\d+)$/.exec(s);
  if (seul) return { min: Number(seul[1]), max: Number(seul[1]) };
  return { min: null, max: null };
}

/** PR-64 : URL LinkedIn canonique (miroir de prospection.normaliser_linkedin). */
export function pr64NormaliserLinkedin(url: string | null | undefined): string | null {
  const s = (url ?? "").trim().toLowerCase();
  if (!s) return null;
  const chemin = s
    .replace(/^(https?:\/\/)?([a-z]{2,3}\.)?linkedin\.com\//, "")
    .replace(/[?#].*$/, "")
    .replace(/\/+$/, "");
  return `https://www.linkedin.com/${chemin}`;
}

export type LigneImport = {
  compte: {
    nom: string | null;
    type: TypeCompte;
    cercle: number | null;
    linkedin_url: string | null;
    site_web: string | null;
    region: string | null;
    secteur: string | null;
    effectif_min: number | null;
    effectif_max: number | null;
    expose: boolean;
  };
  contact: {
    prenom: string | null;
    nom: string | null;
    fonction: string | null;
    niveau: NiveauContact | null;
    linkedin_url: string | null;
    email: string | null;
    anciennete_poste_mois: number | null;
    score: number;
  };
};

export type DefautsImport = { type_compte: TypeCompte; cercle: number | null; expose: boolean };

function valeur(ligne: string[], mapping: MappingImport, champ: ChampImport): string | null {
  const i = mapping[champ];
  if (i === undefined) return null;
  const v = (ligne[i] ?? "").trim();
  return v === "" ? null : v;
}

/** PR-65 : lignes prêtes pour prospection.importer(), score de tri calculé. */
export function pr65ConstruireLignes(csv: Csv, mapping: MappingImport, defauts: DefautsImport, aujourdhui: Date = new Date()): LigneImport[] {
  return csv.lignes.map((l) => {
    const fonction = valeur(l, mapping, "fonction");
    const eff = pr63EffectifDepuisTexte(valeur(l, mapping, "effectif"));
    const ancBrut = valeur(l, mapping, "anciennete_poste_mois");
    const anciennete = ancBrut !== null && /^\d+$/.test(ancBrut) ? Number(ancBrut) : null;
    const niveau = pr62DeduireNiveau(fonction);
    const compte: LigneImport["compte"] = {
      nom: valeur(l, mapping, "compte_nom"),
      type: defauts.type_compte,
      cercle: defauts.cercle,
      linkedin_url: pr64NormaliserLinkedin(valeur(l, mapping, "compte_linkedin_url")),
      site_web: valeur(l, mapping, "site_web"),
      region: valeur(l, mapping, "region"),
      secteur: valeur(l, mapping, "secteur"),
      effectif_min: eff.min,
      effectif_max: eff.max,
      expose: defauts.expose,
    };
    const score = calculerScore(
      { fonction, niveau, anciennete_poste_mois: anciennete, signaux: [] },
      { cercle: compte.cercle, expose: compte.expose, effectif_min: compte.effectif_min, effectif_max: compte.effectif_max },
      aujourdhui,
    ).total;
    return {
      compte,
      contact: {
        prenom: valeur(l, mapping, "prenom"),
        nom: valeur(l, mapping, "nom"),
        fonction,
        niveau,
        linkedin_url: pr64NormaliserLinkedin(valeur(l, mapping, "contact_linkedin_url")),
        email: valeur(l, mapping, "email")?.toLowerCase() ?? null,
        anciennete_poste_mois: anciennete,
        score,
      },
    };
  });
}

/** PR-66 : le mapping permet-il d'identifier un contact (nom + URL ou nom + compte) ? */
export function pr66MappingSuffisant(mapping: MappingImport): boolean {
  return mapping.nom !== undefined && (mapping.contact_linkedin_url !== undefined || mapping.compte_nom !== undefined);
}
