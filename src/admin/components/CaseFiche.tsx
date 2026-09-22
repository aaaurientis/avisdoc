// La case à cocher d'une carte, en haut à gauche.
//
// Elle ne se montre qu'au survol tant que rien n'est coché, pour ne pas alourdir les
// tableaux ; dès qu'une fiche est cochée, toutes les cases apparaissent — on voit alors
// d'un coup d'œil où on en est.

import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

/** La case d'un en-tête de colonne : coche ou décoche tout ce qu'elle contient. */
export function CaseColonne({
  liste,
  coches,
  onChanger,
  libelle,
}: {
  liste: string[];
  coches: Set<string>;
  onChanger: (suivant: Set<string>) => void;
  libelle: string;
}) {
  const toutes = liste.length > 0 && liste.every((id) => coches.has(id));
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={toutes}
      aria-label={`Cocher la colonne ${libelle}`}
      title={toutes ? "Décocher cette colonne" : "Cocher cette colonne"}
      disabled={liste.length === 0}
      onClick={() => {
        const suivant = new Set(coches);
        if (toutes) liste.forEach((id) => suivant.delete(id));
        else liste.forEach((id) => suivant.add(id));
        onChanger(suivant);
      }}
      className={cn(
        "flex size-[18px] shrink-0 items-center justify-center rounded-[5px] border transition-colors disabled:opacity-30",
        toutes ? "border-avisdoc-teal bg-avisdoc-teal text-white" : "border-border bg-card text-transparent hover:border-avisdoc-teal",
      )}
    >
      <Check className="size-3" strokeWidth={3} />
    </button>
  );
}

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
