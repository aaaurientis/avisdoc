// La barre d'onglets d'une fiche, dans le dessin de celle du Pipeline : un trait
// sous l'onglet ouvert, et le compte entre parenthèses là où il y a de quoi compter.
//
// Les deux fiches — prospect et client — partagent la même ossature : ce qui est
// vrai, ce qu'on va faire, ce qui s'est passé.

import { cn } from "@/lib/utils";

export interface Onglet {
  cle: string;
  label: string;
  /** Affiché en pastille à droite du libellé ; rien quand il n'y a rien à compter. */
  compte?: number | null;
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
    <div role="tablist" className="flex items-center gap-1 overflow-x-auto border-b border-border px-3 pt-2">
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
              "flex shrink-0 items-center gap-2 rounded-t-xl border-b-[3px] px-5 py-3 text-[14px] font-bold transition-colors",
              ouvert
                ? "border-avisdoc-teal bg-avisdoc-teal/10 text-avisdoc-teal"
                : "border-transparent text-muted-foreground hover:bg-muted hover:text-avisdoc-ink",
            )}
          >
            {o.label}
            {o.compte != null && o.compte > 0 && (
              <span
                className={cn(
                  "rounded-full px-2 py-0.5 text-[11px] font-bold",
                  ouvert ? "bg-avisdoc-teal text-white" : "bg-muted text-muted-foreground",
                )}
              >
                {o.compte}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
