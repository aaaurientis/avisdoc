// La case à cocher d'une carte, en haut à gauche.
//
// Elle ne se montre qu'au survol tant que rien n'est coché, pour ne pas alourdir les
// tableaux ; dès qu'une fiche est cochée, toutes les cases apparaissent — on voit alors
// d'un coup d'œil où on en est.

import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

export default function CaseFiche({
  cochee,
  onBascule,
  libelle,
  /** true dès qu'une fiche est cochée dans le tableau : les cases restent visibles. */
  visible,
}: {
  cochee: boolean;
  onBascule: () => void;
  libelle: string;
  visible: boolean;
}) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={cochee}
      aria-label={`Cocher ${libelle}`}
      onClick={(e) => {
        e.stopPropagation();
        onBascule();
      }}
      className={cn(
        "flex size-[18px] shrink-0 items-center justify-center rounded-[5px] border transition-all",
        cochee
          ? "border-avisdoc-teal bg-avisdoc-teal text-white"
          : "border-border bg-card text-transparent hover:border-avisdoc-teal",
        !cochee && !visible && "opacity-0 group-hover:opacity-100",
      )}
    >
      <Check className="size-3" strokeWidth={3} />
    </button>
  );
}
