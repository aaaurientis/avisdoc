// Modules de 1er niveau du Hub — clés des droits d'accès (admin_droits).
// Le tableau de bord n'est pas un module : accessible à tous, ses widgets
// sont filtrés selon les modules autorisés.

export type Module = "crm" | "merx" | "contacts" | "marketing" | "finance" | "documents" | "admin";

export const MODULES: { key: Module; label: string }[] = [
  { key: "crm", label: "Clients et Prospection" },
  { key: "merx", label: "Merx (prospection)" },
  { key: "contacts", label: "Contacts Médicaux" },
  { key: "marketing", label: "Marketing" },
  { key: "finance", label: "Finance" },
  { key: "documents", label: "Documents" },
  { key: "admin", label: "Admin" },
];

/** Droits par défaut d'un utilisateur @avisdoc.fr non listé : tout sauf admin. */
export const MODULES_DEFAUT: Module[] = ["crm", "contacts", "marketing", "finance", "documents"];
