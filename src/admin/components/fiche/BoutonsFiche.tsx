// La rangée de boutons sous l'en-tête, la même sur les trois fiches.
//
// « Les fiches ne se ressemblent pas : dans Pipeline, on ne peut pas enrichir une
//   fiche par exemple. » — Olivier, 09/10. L'action propre à l'étape d'abord (mettre
// au Pipeline, remettre au Pipeline…), puis Approfondir et Écrire, toujours à la
// même place.

import type { ReactNode } from "react";
import { Loader2, PenLine, Search } from "lucide-react";

const bouton =
  "inline-flex items-center gap-1.5 rounded-full border border-border px-5 py-2.5 text-sm font-bold text-avisdoc-ink transition-colors hover:border-avisdoc-teal disabled:opacity-60";

export default function BoutonsFiche({
  etape,
  approfondie,
  onApprofondir,
  onEcrire,
  enCours,
}: {
  /** L'action propre à l'étape : « Mettre dans le Pipeline », « Remettre au Pipeline »… */
  etape?: ReactNode;
  approfondie: boolean;
  onApprofondir: () => void;
  onEcrire: () => void;
  /** Ce qui tourne en ce moment : le bouton concerné affiche son sablier, les autres attendent. */
  enCours: string | null;
}) {
  return (
    <>
      {etape}
      <button type="button" onClick={onApprofondir} disabled={enCours !== null} className={bouton}>
        {enCours === "approfondir" ? <Loader2 className="size-4 animate-spin" /> : <Search className="size-4" />}
        {enCours === "approfondir" ? "Merx approfondit… une bonne minute" : approfondie ? "Approfondir à nouveau" : "Approfondir"}
      </button>
      <button
        type="button"
        onClick={onEcrire}
        disabled={enCours !== null}
        title="Merx rédige un brouillon à partir de cette fiche. Rien n'est envoyé."
        className={bouton}
      >
        {enCours === "email" ? <Loader2 className="size-4 animate-spin" /> : <PenLine className="size-4" />}
        Écrire un e-mail personnalisé
      </button>
    </>
  );
}
