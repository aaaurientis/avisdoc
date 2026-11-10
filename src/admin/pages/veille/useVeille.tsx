// La veille de la page (commerciale ou de marché), lue dans l'adresse : /veille/commerciale/… ou /veille/marche/….
// Les anciennes adresses (/veille/direct, /veille/<rapport>…, reçues par mail avant le 02/11) mènent à la veille commerciale.

import type { ReactNode } from "react";
import { Navigate, useLocation, useParams } from "react-router-dom";
import { estVeille, type NomVeille } from "../../lib/veille";

export function useVeille(): NomVeille {
  const { veille } = useParams();
  return estVeille(veille) ? veille : "commerciale";
}

/** Une adresse sans veille valide est renvoyée vers la même page de la veille commerciale. */
export function GardeVeille({ children }: { children: ReactNode }) {
  const { veille } = useParams();
  const { pathname, search } = useLocation();
  if (estVeille(veille)) return <>{children}</>;
  return <Navigate to={`${pathname.replace(/^\/veille/, "/veille/commerciale")}${search}`} replace />;
}
