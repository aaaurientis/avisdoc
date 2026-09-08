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

/** Découpe une adresse libre en { rue, cp, ville } via le code postal FR (5 chiffres). */
export function splitAdresse(full?: string): { rue: string; cp: string; ville: string } {
  const s = (full ?? "").trim();
  const m = s.match(/\b(\d{5})\b/);
  if (!m || m.index === undefined) return { rue: s, cp: "", ville: "" };
  const cp = m[1];
  const rue = s.slice(0, m.index).replace(/[,\s]+$/, "").trim();
  const ville = s.slice(m.index + cp.length).replace(/^[,\s]+/, "").trim();
  return { rue, cp, ville };
}

/** Recompose une adresse complète « rue, CP ville » à partir des 3 champs. */
export function joinAdresse(rue?: string, cp?: string, ville?: string): string {
  const loc = [(cp ?? "").trim(), (ville ?? "").trim()].filter(Boolean).join(" ");
  return [(rue ?? "").trim(), loc].filter(Boolean).join(", ");
}

/** Taille de fichier lisible, format fr : 1234567 → "1,2 Mo". */
export function humanSize(bytes: number): string {
  if (!bytes || bytes < 0) return "0 Ko";
  if (bytes < 1024) return `${bytes} o`;
  const ko = bytes / 1024;
  if (ko < 1024) return `${ko < 10 ? ko.toFixed(1) : Math.round(ko)} Ko`.replace(".", ",");
  const mo = ko / 1024;
  if (mo < 1024) return `${mo < 10 ? mo.toFixed(1) : Math.round(mo)} Mo`.replace(".", ",");
  const go = mo / 1024;
  return `${go.toFixed(1)} Go`.replace(".", ",");
}

/** Nom de fichier « slugifié » sûr pour une clé Storage (sans accents ni espaces). */
export function safeFileName(name: string): string {
  return (
    name
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "") // diacritiques (marques combinantes)
      .replace(/[^a-zA-Z0-9._-]+/g, "_")
      .replace(/_+/g, "_")
      .replace(/^_|_$/g, "") || "fichier"
  );
}

/** Chemin d'un document dans le bucket `admin-documents` : `<id>/v<version>-<nom sûr>`. */
export function docStoragePath(id: string, version: number, name: string): string {
  return `${id}/v${version}-${safeFileName(name)}`;
}

/** Identifiant unique (uuid si dispo, fallback sinon). */
export function uid(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return "id-" + Math.random().toString(36).slice(2) + Date.now().toString(36);
}
