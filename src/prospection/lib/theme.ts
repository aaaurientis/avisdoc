// Thème clair / sombre du module (classe `dark` sur <html>), propre à l'app.
const CLE = "avisdoc-prospection-theme";

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

export function initTheme(): void {
  document.documentElement.classList.toggle("dark", themeCourant() === "dark");
}
