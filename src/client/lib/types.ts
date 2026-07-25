export type NiveauAcces = "public" | "client";
export type PhaseCampagne =
  | "cadrage" | "annonce" | "relance" | "preparation" | "jour-j" | "bilan";

export interface GeneratedDoc {
  id: string;
  client_id: string;
  doc_catalogue_id: string;
  titre: string;
  acces: NiveauAcces;
  phase: PhaseCampagne;
  format: string;
  version: string;
  storage_bucket: string;
  storage_path: string;
}

export const PHASES: { valeur: PhaseCampagne; libelle: string }[] = [
  { valeur: "cadrage", libelle: "Cadrage" },
  { valeur: "annonce", libelle: "Annonce" },
  { valeur: "relance", libelle: "Relance" },
  { valeur: "preparation", libelle: "Préparation" },
  { valeur: "jour-j", libelle: "Jour J" },
  { valeur: "bilan", libelle: "Bilan" },
];

// --- Classification métier de la bibliothèque ---------------------------------
// Regroupe les documents en catégories parlantes pour le client.
export type CategorieId =
  | "affiches" | "collaborateurs" | "rh" | "consentement" | "autres";

export const CATEGORIES: { id: CategorieId; libelle: string; description: string }[] = [
  { id: "affiches", libelle: "Affiches", description: "À imprimer et afficher sur vos sites." },
  { id: "collaborateurs", libelle: "Documents collaborateurs", description: "À diffuser aux salariés." },
  { id: "rh", libelle: "Documents RH", description: "Pour l'équipe RH et l'organisation." },
  { id: "consentement", libelle: "Consentement", description: "Notice d'information et formulaire patient." },
  { id: "autres", libelle: "Autres documents", description: "" },
];

// Rattachement doc_catalogue_id → catégorie.
// Source de vérité des ids : le CATALOGUE de build.py (service de génération).
const CATEGORIE_PAR_DOC: Record<string, CategorieId> = {
  "affiche-1": "affiches", "affiche-2": "affiches", "affiche-3": "affiches",
  "affiche-4": "affiches", "affiche-5": "affiches",
  "kit-collaborateur": "collaborateurs", "kit-collaborateur-ppt": "collaborateurs",
  "kit-com-interne": "rh",
  "notice-consentement": "consentement", "formulaire-consentement": "consentement",
};

export function categorieDe(docCatalogueId: string): CategorieId {
  return CATEGORIE_PAR_DOC[docCatalogueId] ?? "autres";
}

// Documents non exposés dans la bibliothèque client :
//   - "emails" : servi par l'onglet « E-mails » (copier-coller), pas en PDF ;
//   - "correspondants" (Réseau d'aval) : non destiné à l'espace client.
export const DOCS_EXCLUS = new Set(["emails", "correspondants"]);
