// La barre d'onglets d'une fiche, dans le dessin de celle du Pipeline : un trait
// sous l'onglet ouvert, et le compte entre parenthèses là où il y a de quoi compter.
//
// Les deux fiches — prospect et client — partagent la même ossature : ce qui est
// vrai, ce qu'on va faire, ce qui s'est passé.

import { Fragment } from "react";
import { cn } from "@/lib/utils";

export interface Onglet {
  cle: string;
  label: string;
  /** Affiché en pastille à droite du libellé ; rien quand il n'y a rien à compter. */
  compte?: number | null;
  /** Les nouveautés, en pastille rouge au-dessus du libellé ; rien quand il n'y en a pas. */
  pastille?: number | null;
}

export default function Onglets({
  onglets,
  actif,
  onChange,
  aLaLigne,
  coupureApres,
}: {
  onglets: Onglet[];
  actif: string;
  onChange: (cle: string) => void;
  /** Beaucoup d'onglets : ils passent à la ligne plutôt que de se cacher à droite. */
  aLaLigne?: boolean;
  /** Avec `aLaLigne` : la ligne suivante commence après cet onglet. */
  coupureApres?: string;
}) {
  return (
    <div role="tablist" className={cn("flex items-center gap-1 border-b border-border px-3 pt-2", aLaLigne ? "flex-wrap" : "overflow-x-auto overscroll-x-contain")}>
      {onglets.map((o) => {
        const ouvert = o.cle === actif;
        return (
          <Fragment key={o.cle}>
          <button
            key={o.cle}
            type="button"
            role="tab"
            aria-selected={ouvert}
            onClick={() => onChange(o.cle)}
            className={cn(
              "relative flex shrink-0 items-center gap-2 rounded-t-xl border-b-[3px] px-5 py-3 text-[14px] font-bold transition-colors",
              ouvert
                ? "border-avisdoc-teal bg-avisdoc-teal/10 text-avisdoc-teal"
                : "border-transparent text-muted-foreground hover:bg-muted hover:text-avisdoc-ink",
            )}
          >
            {o.pastille != null && o.pastille > 0 && (
              <span className="absolute right-1 top-0 min-w-[18px] rounded-full bg-red-600 px-1.5 text-center text-[10px] font-bold leading-[18px] text-white">{o.pastille}</span>
            )}
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
          {aLaLigne && coupureApres === o.cle && <span aria-hidden className="h-0 basis-full" />}
          </Fragment>
        );
      })}
    </div>
  );
}
