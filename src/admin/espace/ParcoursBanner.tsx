// Bandeau d'avancement : timeline des étapes (Nouveau → Qualifié →
// Proposition → Signé) avec date de passage et durée entre chaque étape.
import { Fragment, useEffect, useState } from "react";
import { Check } from "lucide-react";
import type { Stage } from "../types";
import { STAGES } from "../lib/ui-tokens";
import { stageRepo, type StageEvent } from "./stageRepo";
import { Card } from "../components/ui";
import { cn } from "@/lib/utils";

function dateFr(iso?: string): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" });
}

// Durée compacte entre deux instants : min / h / j / sem / mois / an.
function duree(ms: number): string {
  const m = Math.max(0, Math.round(ms / 60000));
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} h`;
  const j = Math.floor(h / 24);
  if (j < 14) return `${j} j`;
  if (j < 60) return `${Math.floor(j / 7)} sem`;
  const mo = Math.floor(j / 30);
  if (mo < 24) return `${mo} mois`;
  const a = Math.floor(j / 365);
  return `${a} an${a > 1 ? "s" : ""}`;
}

export default function ParcoursBanner({ clientId, currentStage }: { clientId: string; currentStage: Stage }) {
  const [hist, setHist] = useState<StageEvent[]>([]);

  useEffect(() => {
    let ok = true;
    stageRepo.historique(clientId).then((h) => ok && setHist(h)).catch(() => {});
    return () => { ok = false; };
  }, [clientId, currentStage]);

  // Date la plus ancienne où chaque étape a été atteinte.
  const reachedAt = new Map<string, string>();
  for (const e of hist) if (!reachedAt.has(e.stage)) reachedAt.set(e.stage, e.changed_at);
  // Étape courante non encore historisée (course avec le trigger) → « maintenant ».
  if (!reachedAt.has(currentStage)) reachedAt.set(currentStage, new Date().toISOString());

  const curRank = STAGES.findIndex((s) => s.name === currentStage);
  const firstIso = reachedAt.get(STAGES[0].name);
  const curIso = reachedAt.get(currentStage);
  const totalMs = firstIso && curIso ? new Date(curIso).getTime() - new Date(firstIso).getTime() : 0;

  return (
    <Card className="p-4">
      <div className="mb-3 flex items-center justify-between">
        <div className="text-[11px] font-bold uppercase tracking-[0.06em] text-muted-foreground">Avancement</div>
        {curRank > 0 && (
          <div className="text-[11.5px] text-muted-foreground">
            Durée totale · <span className="font-semibold text-avisdoc-ink">{duree(totalMs)}</span>
          </div>
        )}
      </div>

      <div className="flex items-start overflow-x-auto pb-1">
        {STAGES.map((s, i) => {
          const reached = i <= curRank;
          const active = i === curRank;
          const iso = reachedAt.get(s.name);
          // Durée depuis l'étape précédente atteinte.
          const prevIso = i > 0 ? reachedAt.get(STAGES[i - 1].name) : undefined;
          const segMs = reached && prevIso && iso ? new Date(iso).getTime() - new Date(prevIso).getTime() : null;

          return (
            <Fragment key={s.name}>
              {i > 0 && (
                <div className="flex min-w-[44px] flex-1 flex-col items-center pt-2.5">
                  <div className={cn("h-[2px] w-full", reached ? s.dot : "bg-border")} />
                  {segMs != null && (
                    <span className="mt-1 whitespace-nowrap text-[10.5px] font-medium text-muted-foreground">
                      {duree(segMs)}
                    </span>
                  )}
                </div>
              )}
              <div className="flex min-w-[74px] shrink-0 flex-col items-center text-center">
                <div
                  className={cn(
                    "flex size-7 items-center justify-center rounded-full border-2 text-[11px] font-bold transition-colors",
                    active
                      ? cn(s.dot, "border-transparent text-white")
                      : reached
                        ? cn(s.dot, "border-transparent text-white")
                        : "border-border bg-card text-muted-foreground",
                  )}
                >
                  {reached && !active ? <Check className="size-3.5" strokeWidth={3} /> : i + 1}
                </div>
                <span className={cn("mt-1.5 text-[12px] font-semibold", reached ? "text-avisdoc-ink" : "text-muted-foreground")}>
                  {s.name}
                </span>
                <span className="mt-0.5 text-[10.5px] text-muted-foreground/80">
                  {reached ? dateFr(iso) : "—"}
                </span>
              </div>
            </Fragment>
          );
        })}
      </div>
    </Card>
  );
}
