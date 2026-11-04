// Filet de sécurité commun aux applications (Hub, espaces client / pro / requérant).
//
// Sans lui, une erreur pendant l'affichage démonte toute l'application : il ne reste
// qu'une page blanche, sans rien pour comprendre. Ici, on affiche l'erreur, l'écran
// et le navigateur — de quoi faire un diagnostic à distance — et un bouton pour recharger.

import { Component, type ErrorInfo, type ReactNode } from "react";

interface Etat {
  erreur: Error | null;
}

const CLE_RECHARGE = "avisdoc.recharge-apres-deploiement";

/** Une nouvelle version a été mise en ligne : l'ancienne page cherche des fichiers qui n'existent plus. */
function estVersionPerimee(e: Error): boolean {
  return /dynamically imported module|Importing a module script failed|Failed to fetch dynamically|ChunkLoadError|Loading chunk/i.test(
    e?.message ?? "",
  );
}

export default class EcranErreur extends Component<{ children: ReactNode }, Etat> {
  state: Etat = { erreur: null };

  static getDerivedStateFromError(erreur: Error): Etat {
    return { erreur };
  }

  componentDidCatch(erreur: Error, info: ErrorInfo) {
    console.error("[AvisDoc] Erreur d'affichage :", erreur, info.componentStack);
    // Version périmée : un rechargement suffit. Une seule fois, pour ne pas boucler.
    if (estVersionPerimee(erreur)) {
      try {
        if (!sessionStorage.getItem(CLE_RECHARGE)) {
          sessionStorage.setItem(CLE_RECHARGE, "1");
          window.location.reload();
        }
      } catch {
        /* stockage indisponible : on affiche l'écran d'erreur */
      }
    }
  }

  render() {
    const { erreur } = this.state;
    if (!erreur) return this.props.children;

    const detail = [
      `Erreur : ${erreur.message || String(erreur)}`,
      `Page : ${window.location.href}`,
      `Écran : ${window.innerWidth}×${window.innerHeight} (zoom ${Math.round(window.devicePixelRatio * 100)} %)`,
      `Navigateur : ${navigator.userAgent}`,
      `Date : ${new Date().toLocaleString("fr-FR")}`,
    ].join("\n");

    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: 24, background: "#f7f7f5", fontFamily: "system-ui, sans-serif", color: "#1b2a3a" }}>
        <div style={{ maxWidth: 640, width: "100%", background: "#fff", border: "1px solid #e3e3df", borderRadius: 16, padding: 28 }}>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700 }}>L'écran n'a pas pu s'afficher</h1>
          <p style={{ marginTop: 8, fontSize: 14, color: "#5b6672" }}>
            Une erreur s'est produite. Rechargez la page ; si le problème revient, envoyez le détail ci-dessous à
            l'équipe AvisDoc.
          </p>
          <pre style={{ marginTop: 16, padding: 14, background: "#f3f4f6", borderRadius: 10, fontSize: 12, whiteSpace: "pre-wrap", wordBreak: "break-word", maxHeight: 260, overflow: "auto" }}>
            {detail}
          </pre>
          <div style={{ marginTop: 18, display: "flex", gap: 10, flexWrap: "wrap" }}>
            <button
              type="button"
              onClick={() => window.location.reload()}
              style={{ padding: "10px 18px", borderRadius: 999, border: "none", background: "#1b2a3a", color: "#fff", fontWeight: 600, cursor: "pointer" }}
            >
              Recharger la page
            </button>
            <button
              type="button"
              onClick={() => void navigator.clipboard?.writeText(detail)}
              style={{ padding: "10px 18px", borderRadius: 999, border: "1px solid #c9ccd1", background: "#fff", color: "#1b2a3a", fontWeight: 600, cursor: "pointer" }}
            >
              Copier le détail
            </button>
          </div>
        </div>
      </div>
    );
  }
}
