// Formatage des dates et identités, sans chaîne visible métier.

/** "2026-09-03" ou ISO complet → "3 sept. 2026". */
export function dateFr(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso.length === 10 ? `${iso}T00:00:00` : iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" });
}

/** ISO complet → "3 sept. 2026, 14:05". */
export function dateHeureFr(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString("fr-FR", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

/** Date du jour en ISO court local (YYYY-MM-DD). */
export function aujourdhuiIso(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export function initiales(prenom: string, nom: string): string {
  const a = prenom.trim()[0] ?? "";
  const b = nom.trim()[0] ?? "";
  return (a + b).toUpperCase() || "?";
}

export function nomComplet(prenom: string | null | undefined, nom: string | null | undefined): string {
  return [prenom ?? "", nom ?? ""].map((s) => s.trim()).filter(Boolean).join(" ");
}

export function nomDepuisEmail(email: string): string {
  return (email.split("@")[0] ?? "")
    .split(/[.\-_]/)
    .filter(Boolean)
    .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
    .join(" ");
}
