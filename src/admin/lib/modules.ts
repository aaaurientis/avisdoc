// Modules de 1er niveau du Hub — clés des droits d'accès (admin_droits).
// Un module par bloc de menu (les « 8 blocs »), sauf le Tableau de bord qui
// n'est pas un module : accessible à tous, ses widgets sont filtrés selon les
// modules autorisés.

export type Module =
  | "commercial" // Bloc Commercial (ex-crm/merx : Merx, Pipeline, Prospection, Clients…)
  | "demarche" // Bloc Veille à démarcher (Entreprises, Collectivités, Intermédiaires, Mutuelle Assurance)
  | "veille" // Bloc Veille Marché (avis AvisDoc, à ne pas manquer, concurrence, publications)
  | "sante" // Bloc Professionnels de Santé (ex-Contacts Médicaux : Requérants, Requis, Aval)
  | "journee" // Bloc Journée : extractions des journées de dépistage (bucket S3)
  | "finance"
  | "documents"
  | "admin";

export const MODULES: { key: Module; label: string }[] = [
  { key: "commercial", label: "Commercial" },
  { key: "demarche", label: "Veille à démarcher" },
  { key: "veille", label: "Veille Marché" },
  { key: "sante", label: "Professionnels de Santé" },
  { key: "journee", label: "Journée" },
  { key: "finance", label: "Finance" },
  { key: "documents", label: "Documents" },
  { key: "admin", label: "Admin" },
];

/**
 * Droits par défaut d'un utilisateur @avisdoc.fr non listé : tout sauf admin et journee.
 * « journee » s'ouvre au cas par cas (Droits d'accès) : les extractions touchent aux dépistés.
 */
export const MODULES_DEFAUT: Module[] = [
  "commercial",
  "demarche",
  "veille",
  "sante",
  "finance",
  "documents",
];
