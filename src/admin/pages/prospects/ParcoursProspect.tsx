// Le parcours d'un prospect, dans le bandeau d'avancement du Pipeline.
//
// Les quatre étapes ne sont pas des colonnes : ce sont les dates que la fiche porte
// déjà. Une étape sans date n'est pas atteinte, et affiche « — » comme chez eux.

import { Fragment } from "react";
import { Card } from "../../components/ui";
import { TONES } from "../../lib/ui-tokens";
import type { StageTone } from "../../types";
import { cn } from "@/lib/utils";

export interface EtapeParcours {
  label: string;
  /** La date de passage, ou null si l'étape n'a pas eu lieu. */
  au: string | null;
  tone: StageTone;
}

const leJour = (iso: string) =>
  new Date(iso).toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" });

/** Le temps écoulé entre deux étapes, dit simplement. */
function duree(ms: number): string {
  const jours = Math.round(ms / 86_400_000);
  if (jours <= 0) return "le jour même";
  if (jours === 1) return "1 jour";
  if (jours < 31) return `${jours} jours`;
  const mois = Math.round(jours / 30.4);
  return mois <= 1 ? "1 mois" : `${mois} mois`;
}

export default function ParcoursProspect({ etapes }: { etapes: EtapeParcours[] }) {
  const dernierAtteint = etapes.reduce((acc, e, i) => (e.au ? i : acc), -1);

  return (
    <Card className="p-4">
      <div className="mb-3 text-[11px] font-bold uppercase tracking-[0.06em] text-muted-foreground">Avancement</div>

      <div className="flex items-start overflow-x-auto pb-1">
        {etapes.map((e, i) => {
          const atteinte = Boolean(e.au);
          const active = i === dernierAtteint;
          const precedente = i > 0 ? etapes[i - 1].au : null;
          const ecart = atteinte && precedente && e.au ? new Date(e.au).getTime() - new Date(precedente).getTime() : null;

          return (
            <Fragment key={e.label}>
              {i > 0 && (
                <div className="flex min-w-[44px] flex-1 flex-col items-center pt-2.5">
                  <div className={cn("h-[2px] w-full", atteinte ? TONES[e.tone].dot : "bg-border")} />
                  {ecart != null && (
                    <span className="mt-1 whitespace-nowrap text-[10.5px] font-medium text-muted-foreground">
                      {duree(ecart)}
                    </span>
                  )}
                </div>
              )}

              <div className="flex min-w-[84px] shrink-0 flex-col items-center text-center">
                <div
                  className={cn(
                    "flex size-7 items-center justify-center rounded-full border-2 text-[11px] font-bold transition-colors",
                    atteinte
                      ? cn(TONES[e.tone].dot, "border-transparent text-white")
                      : "border-border bg-card text-muted-foreground",
                  )}
                >
                  {i + 1}
                </div>
                <span
                  className={cn(
                    "mt-1.5 text-[12px]",
                    active ? "font-bold text-avisdoc-ink" : atteinte ? "font-semibold text-avisdoc-ink" : "text-muted-foreground",
                  )}
                >
                  {e.label}
                </span>
                <span className="mt-0.5 whitespace-nowrap text-[10.5px] text-muted-foreground">
                  {e.au ? leJour(e.au) : "—"}
                </span>
              </div>
            </Fragment>
          );
        })}
      </div>
    </Card>
  );
}
