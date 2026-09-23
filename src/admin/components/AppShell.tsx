// Coquille applicative : le menu, et la zone de contenu.
//
// Sur un écran large, le menu est une colonne fixe. Sur un téléphone, il ne peut pas
// l'être : à 375 pixels, il occupait toute la page et repoussait chaque écran en
// dessous — il fallait faire défiler tout le menu pour atteindre le contenu, et on
// croyait que rien ne marchait. Il devient donc un tiroir, fermé par défaut.

import { useEffect, useState } from "react";
import { Outlet, useLocation, useNavigate } from "react-router-dom";
import { Menu, X } from "lucide-react";
import Sidebar from "./Sidebar";
import { lireArrivee } from "../lib/arrivee";
import AvisdocLogo from "@/components/AvisdocLogo";

/** Hors de React : un remontage de la coquille ne doit PAS relancer l'aiguillage. */
let dejaAiguille = false;

export default function AppShell() {
  const [tiroir, setTiroir] = useState(false);
  const { pathname } = useLocation();
  const naviguer = useNavigate();

  // On a choisi : le tiroir n'a plus de raison d'être ouvert.
  useEffect(() => setTiroir(false), [pathname]);

  /**
   * Ouvrir le Hub depuis un téléphone mène à la dictée.
   *
   * UNE SEULE FOIS par chargement de page, et le drapeau vit hors de React exprès.
   * La dictée est hors de la coquille : y aller démonte la coquille, et si la garde
   * renvoie au tableau de bord — ce qu'elle fait tant que les droits ne sont pas
   * arrivés de la base — la coquille se remonte et l'aiguillage repartirait. C'est
   * exactement la boucle qui a rendu l'écran blanc sur téléphone.
   */
  useEffect(() => {
    if (dejaAiguille) return;
    dejaAiguille = true;
    const surTelephone = window.matchMedia("(max-width: 767px)").matches;
    if (surTelephone && lireArrivee() === "dictee" && (pathname === "/dashboard" || pathname === "/")) {
      naviguer("/dictee", { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="ad-shell flex min-h-screen bg-background" data-tiroir={tiroir ? "ouvert" : "ferme"}>
      {/* Visible seulement sur petit écran (voir admin.css). */}
      <header className="ad-barre-mobile hidden items-center justify-between border-b border-border bg-card px-4 py-3">
        <AvisdocLogo className="h-8 w-auto" />
        <button
          type="button"
          onClick={() => setTiroir((o) => !o)}
          aria-label={tiroir ? "Fermer le menu" : "Ouvrir le menu"}
          aria-expanded={tiroir}
          className="rounded-xl border border-border p-2 text-avisdoc-ink transition-colors hover:border-avisdoc-ink"
        >
          {tiroir ? <X className="size-5" /> : <Menu className="size-5" />}
        </button>
      </header>

      {/* Le voile : un appui à côté referme le tiroir. */}
      {tiroir && (
        <button
          type="button"
          aria-label="Fermer le menu"
          onClick={() => setTiroir(false)}
          className="ad-voile hidden fixed inset-0 z-30 bg-avisdoc-ink/40"
        />
      )}

      <Sidebar ouvert={tiroir} />

      <main className="ad-content min-w-0 flex-1 px-9 py-8">
        <Outlet />
      </main>
    </div>
  );
}
