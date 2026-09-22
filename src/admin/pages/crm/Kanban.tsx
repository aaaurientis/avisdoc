import { useState } from "react";
import { GripVertical } from "lucide-react";
import type { Client, PipelineStage, Stage } from "../../types";
import { euro } from "../../lib/format";
import { COLONNE_KANBAN, TONES } from "../../lib/ui-tokens";
import { cn } from "@/lib/utils";

function joursLabel(j: number) {
  return j + (j > 1 ? " journées" : " journée");
}

export default function Kanban({
  clients,
  stages,
  onSelect,
  onDeplacer,
}: {
  clients: Client[];
  /** Colonnes définies par l'équipe (« Colonnes » dans le Pipeline). */
  stages: PipelineStage[];
  onSelect: (id: string) => void;
  /** Changement d'étape par glisser-déposer. */
  onDeplacer?: (id: string, stage: Stage) => void;
}) {
  const [saisi, setSaisi] = useState<string | null>(null);
  const [survolee, setSurvolee] = useState<Stage | null>(null);

  const deposer = (stage: Stage) => {
    const id = saisi;
    setSaisi(null);
    setSurvolee(null);
    if (!id || !onDeplacer) return;
    const client = clients.find((c) => c.id === id);
    if (client && client.stage !== stage) onDeplacer(id, stage);
  };

  return (
    // Beaucoup de colonnes : elles gardent une largeur lisible et le tableau défile.
    <div
      className="ad-kanban grid gap-3 overflow-x-auto pb-1"
      style={{ gridTemplateColumns: `repeat(${Math.max(stages.length, 1)}, minmax(300px, 1fr))` }}
    >
      {stages.map((stage) => {
        const list = clients.filter((c) => c.stage === stage.label);
        const cible = survolee === stage.label;
        const ton = TONES[stage.tone];
        return (
          <div
            key={stage.id}
            onDragOver={(e) => {
              if (!saisi) return;
              e.preventDefault();
              setSurvolee(stage.label);
            }}
            onDragLeave={() => setSurvolee((s) => (s === stage.label ? null : s))}
            onDrop={(e) => {
              e.preventDefault();
              deposer(stage.label);
            }}
            className={cn(
              COLONNE_KANBAN,
              "transition-colors",
              cible && "bg-avisdoc-teal/10 ring-2 ring-avisdoc-teal/40",
            )}
          >
            <div className="mb-2.5 flex items-center justify-between">
              <div className="text-xs font-bold uppercase tracking-[0.05em] text-muted-foreground">
                {stage.label}
              </div>
              <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold text-white ${ton.dot}`}>
                {list.length}
              </span>
            </div>

            <div className="flex flex-1 flex-col gap-2">
              {list.map((c) => (
                <div
                  key={c.id}
                  draggable={Boolean(onDeplacer)}
                  onDragStart={() => setSaisi(c.id)}
                  onDragEnd={() => {
                    setSaisi(null);
                    setSurvolee(null);
                  }}
                  className={cn(
                    "ad-card-clickable group flex items-start gap-1.5 rounded-xl border border-border bg-card p-3 transition-colors hover:border-avisdoc-teal",
                    saisi === c.id && "opacity-50",
                  )}
                >
                  {/* Poignée : indique que la fiche se déplace. Masquée au doigt — sur téléphone,
                      l'étape se change dans la fiche. */}
                  {onDeplacer && (
                    <span
                      aria-hidden
                      title="Glisser pour changer d'étape"
                      className="-ml-1 mt-0.5 hidden shrink-0 cursor-grab text-muted-foreground/50 transition-colors group-hover:text-muted-foreground active:cursor-grabbing [@media(hover:hover)]:block"
                    >
                      <GripVertical className="size-4" />
                    </span>
                  )}

                  <button type="button" onClick={() => onSelect(c.id)} className="min-w-0 flex-1 text-left">
                    <div className="text-[13px] font-semibold leading-snug text-avisdoc-ink">
                      {c.company}
                    </div>
                    <div className="mt-0.5 text-[11.5px] text-muted-foreground">
                      {c.contacts[0]?.name ?? "—"}
                    </div>
                    <div className="mt-2 flex items-center justify-between">
                      <span className="rounded-full bg-muted px-2 py-0.5 text-[10.5px] font-bold text-muted-foreground">
                        {joursLabel(c.jours)}
                      </span>
                      <span className="text-[12px] font-bold text-avisdoc-ink">
                        {euro(c.jours * c.tarif)}
                      </span>
                    </div>
                  </button>
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
