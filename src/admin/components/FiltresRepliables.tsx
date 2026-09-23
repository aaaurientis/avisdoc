// Les filtres, repliés sur un téléphone.
//
// Quatre listes déroulantes tiennent sur une ligne devant un ordinateur ; sur un
// écran de 375 pixels, elles en prennent trois et repoussent les fiches hors de vue.
// On ouvre l'écran pour voir ses fiches, pas pour voir des filtres.
//
// Sur grand écran, rien ne change : ils restent dépliés.

import { useState } from "react";
import { SlidersHorizontal } from "lucide-react";
import { cn } from "@/lib/utils";

export default function FiltresRepliables({
  children,
  /** Nombre de filtres actifs : sans lui, on ne saurait pas qu'un tri est en cours une fois replié. */
  actifs = 0,
}: {
  children: React.ReactNode;
  actifs?: number;
}) {
  const [ouvert, setOuvert] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOuvert((o) => !o)}
        aria-expanded={ouvert}
        className={cn(
          "mb-3 inline-flex items-center gap-1.5 rounded-full border px-4 py-2 text-[13px] font-bold transition-colors sm:hidden",
          actifs > 0 ? "border-avisdoc-teal bg-avisdoc-teal/10 text-avisdoc-teal" : "border-border text-avisdoc-ink",
        )}
      >
        <SlidersHorizontal className="size-3.5" />
        Filtres
        {actifs > 0 && ` (${actifs})`}
      </button>

      <div className={cn(ouvert ? "block" : "hidden", "sm:block")}>{children}</div>
    </>
  );
}
