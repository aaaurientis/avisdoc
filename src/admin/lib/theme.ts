// Thème clair / sombre du back-office (classe `dark` sur <html>).
// Persisté par navigateur dans localStorage — propre à l'app admin.
const CLE = "avisdoc-admin-theme";

export type Theme = "light" | "dark";

export function themeCourant(): Theme {
  try {
    return localStorage.getItem(CLE) === "dark" ? "dark" : "light";
  } catch {
    return "light";
  }
}

export function appliquerTheme(t: Theme): void {
  document.documentElement.classList.toggle("dark", t === "dark");
  try { localStorage.setItem(CLE, t); } catch { /* stockage indisponible */ }
}

/** À appeler au démarrage, avant le rendu (évite le flash clair). */
export function initTheme(): void {
  document.documentElement.classList.toggle("dark", themeCourant() === "dark");
}
