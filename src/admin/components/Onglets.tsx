// La barre d'onglets d'une fiche. Les deux fiches — prospect et client — partagent
// la même ossature : ce qui est vrai, ce qu'on va faire, ce qui s'est passé.

import { cn } from "@/lib/utils";

export interface Onglet {
  cle: string;
  label: string;
}

export default function Onglets({
  onglets,
  actif,
  onChange,
}: {
  onglets: Onglet[];
  actif: string;
  onChange: (cle: string) => void;
}) {
  return (
    <div role="tablist" className="flex gap-1 border-b border-border">
      {onglets.map((o) => {
        const ouvert = o.cle === actif;
        return (
          <button
            key={o.cle}
            type="button"
            role="tab"
            aria-selected={ouvert}
            onClick={() => onChange(o.cle)}
            className={cn(
              "-mb-px border-b-2 px-4 py-2.5 text-[13.5px] font-bold transition-colors",
              ouvert
                ? "border-avisdoc-teal text-avisdoc-teal"
                : "border-transparent text-muted-foreground hover:text-avisdoc-ink",
            )}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
