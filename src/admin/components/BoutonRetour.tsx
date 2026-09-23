// Le même bouton de retour, au même endroit, sur tous les écrans qui en ont un.
//
// Il y en avait deux formes : un petit lien discret en bas du Débrief écrit, et un
// « Retour au Hub » en bas de la Dictée. Deux tailles, deux places, deux libellés
// pour un seul geste — on hésite, on cherche, on perd le fil de ce qu'on faisait.
//
// Il revient parfois en arrière DANS l'écran (le Débrief écrit retourne au choix),
// parfois vers un autre écran (la Dictée retourne au Débrief) : d'où les deux formes,
// pour un rendu identique.

import { Link } from "react-router-dom";
import { ArrowLeft } from "lucide-react";

const classe =
  "inline-flex items-center gap-1.5 rounded-full border border-border px-5 py-2.5 text-sm font-bold text-avisdoc-ink transition-colors hover:border-avisdoc-ink";

export default function BoutonRetour({
  vers,
  onRetour,
  libelle = "Retour",
}: {
  /** L'écran où revenir. Absent si le retour se fait sur place. */
  vers?: string;
  /** Le retour se fait dans l'écran même — revenir au choix, par exemple. */
  onRetour?: () => void;
  libelle?: string;
}) {
  if (vers) {
    return (
      <Link to={vers} className={classe}>
        <ArrowLeft className="size-4" /> {libelle}
      </Link>
    );
  }
  return (
    <button type="button" onClick={onRetour} className={classe}>
      <ArrowLeft className="size-4" /> {libelle}
    </button>
  );
}
