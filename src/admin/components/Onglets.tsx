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
              "flex shrink-0 items-center gap-1.5 rounded-t-lg border-b-2 px-3.5 py-2.5 text-[12.5px] font-bold transition-colors",
              ouvert ? "border-avisdoc-teal text-avisdoc-ink" : "border-transparent text-muted-foreground hover:text-avisdoc-ink",
            )}
          >
            {o.label}
            {o.compte != null && o.compte > 0 && (
              <span className="rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-bold text-muted-foreground">{o.compte}</span>
            )}
          </button>
        );
      })}
    </div>
  );
}
