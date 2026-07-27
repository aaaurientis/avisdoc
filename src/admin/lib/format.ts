// Helpers de formatage partagés par le back-office.

/** Montant en euros, format fr : 4 800 €. */
export function euro(n: number): string {
  return n.toLocaleString("fr-FR") + " €";
}

/** Date ISO → libellé fr court : "2026-07-23" → "23 juil. 2026". */
export function frDate(iso: string | null): string {
  if (!iso) return "Sans échéance";
  const d = new Date(iso + "T00:00:00");
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("fr-FR", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

/** Initiales à partir d'un nom (le préfixe "Dr " est ignoré). */
export function initials(name: string): string {
  const parts = name.replace(/^Dr /, "").split(" ").filter(Boolean);
  if (parts.length === 0) return "?";
  return (parts[0][0] + (parts[1] ? parts[1][0] : "")).toUpperCase();
}

/** Extension déduite d'un nom de fichier. */
export function extFromName(name: string): "PDF" | "DOC" | "XLS" {
  const n = name.toLowerCase();
  if (n.endsWith(".xlsx") || n.endsWith(".xls")) return "XLS";
  if (n.endsWith(".docx") || n.endsWith(".doc")) return "DOC";
  return "PDF";
}

/** Date du jour au format ISO court (YYYY-MM-DD), pour comparer les échéances. */
export function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

/** Libellé fr court de la date du jour : "15 juil.". */
export function todayLabel(): string {
  return new Date().toLocaleDateString("fr-FR", {
    day: "numeric",
    month: "short",
  });
}

/** Identifiant unique (uuid si dispo, fallback sinon). */
export function uid(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return "id-" + Math.random().toString(36).slice(2) + Date.now().toString(36);
}
