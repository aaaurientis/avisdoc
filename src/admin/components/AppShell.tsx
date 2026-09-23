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
import { useAuth } from "../auth/AuthContext";
import AvisdocLogo from "@/components/AvisdocLogo";

export default function AppShell() {
  const [tiroir, setTiroir] = useState(false);
  const { pathname } = useLocation();
  const naviguer = useNavigate();
  const { peut } = useAuth();

  // On a choisi : le tiroir n'a plus de raison d'être ouvert.
  useEffect(() => setTiroir(false), [pathname]);

  /**
   * Ouvrir le Hub depuis un téléphone mène à la dictée.
   *
   * L'aiguillage ne peut pas se contenter de l'adresse vide : le téléphone garde
   * « #/dashboard » en favori ou dans son historique, et on retombait sur le tableau
   * de bord. On regarde donc où l'on ARRIVE, une seule fois par ouverture — cliquer
   * ensuite sur « Tableau de bord » y mène normalement.
   */
  useEffect(() => {
    const surTelephone = window.matchMedia("(max-width: 767px)").matches;
    if (surTelephone && (pathname === "/dashboard" || pathname === "/") && peut("merx")) {
      naviguer("/dictee", { replace: true });
    }
    // Au montage seulement : c'est l'arrivée qui nous intéresse, pas les allées et venues.
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
