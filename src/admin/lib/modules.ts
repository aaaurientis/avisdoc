// Modules de 1er niveau du Hub — clés des droits d'accès (admin_droits).
// Un module par bloc de menu, sauf le Tableau de bord qui n'est pas un module :
// accessible à tous, ses widgets sont filtrés selon les modules autorisés.
//
// Les quatre CRM (Olivier, 09/11) : « commercial » garde sa clé et devient CRM Entreprise,
// pour que les droits de ceux qui y travaillent ne bougent pas ; chaque autre CRM a la sienne.
// « veille » garde la sienne et reste la Veille Marché. « demarche » (Veille à démarcher) disparaît :
// la veille de chaque marché est dans son CRM.

export type Module =
  | "commercial" // CRM Entreprise (Merx, Planning, Veille, Prospection, Pipeline, Clients…)
  | "crm_collectivites" // CRM Collectivités Locales
  | "crm_mutuelles" // CRM Assurance Mutuelle
  | "crm_intermediaires" // CRM Intermédiaire
  | "veille" // Veille Marché (avis AvisDoc, évènements, concurrence, publications)
  | "crm_synthese" // CRM Synthèse : les CRM ensemble, en consultation seule
  | "sante" // Bloc Professionnels de Santé (ex-Contacts Médicaux : Requérants, Requis, Aval)
  | "journee" // Bloc Journée : extractions des journées de dépistage (bucket S3)
  | "finance"
  | "documents"
  | "admin";

export const MODULES: { key: Module; label: string }[] = [
  { key: "commercial", label: "CRM Entreprise" },
  { key: "crm_collectivites", label: "CRM Collectivités Locales" },
  { key: "crm_mutuelles", label: "CRM Assurance Mutuelle" },
  { key: "crm_intermediaires", label: "CRM Intermédiaire" },
  { key: "veille", label: "Veille Marché" },
  { key: "crm_synthese", label: "CRM Synthèse" },
  { key: "sante", label: "Professionnels de Santé" },
  { key: "journee", label: "Journée" },
  { key: "finance", label: "Finance" },
  { key: "documents", label: "Documents" },
  { key: "admin", label: "Admin" },
];

/** Le droit de chaque CRM, par son marché (?crm=…, ?seul=…). */
export const MODULE_DU_CRM: Record<string, Module> = {
  demarcher: "commercial",
  collectivites: "crm_collectivites",
  mutuelles: "crm_mutuelles",
  intermediaires: "crm_intermediaires",
  synthese: "crm_synthese",
};
/** Les droits qui ouvrent un CRM (les écrans de fiches sont communs aux quatre). */
export const MODULES_CRM: Module[] = ["commercial", "crm_collectivites", "crm_mutuelles", "crm_intermediaires", "crm_synthese"];

/**
 * Droits par défaut d'un utilisateur @avisdoc.fr non listé : tout sauf admin et journee.
 * « journee » s'ouvre au cas par cas (Droits d'accès) : les extractions touchent aux dépistés.
 * Les trois nouveaux CRM et la CRM Synthèse se cochent à la main (Olivier, 09/11).
 */
export const MODULES_DEFAUT: Module[] = [
  "commercial",
  "veille",
  "sante",
  "finance",
  "documents",
];
