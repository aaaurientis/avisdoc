import type { Client } from "../../types";
import { euro } from "../../lib/format";
import { STAGES } from "../../lib/ui-tokens";

function joursLabel(j: number) {
  return j + (j > 1 ? " journées" : " journée");
}

export default function Kanban({
  clients,
  onSelect,
}: {
  clients: Client[];
  onSelect: (id: string) => void;
}) {
  return (
    <div className="ad-kanban grid grid-cols-2 gap-3 lg:grid-cols-4">
      {STAGES.map((stage) => {
        const list = clients.filter((c) => c.stage === stage.name);
        return (
          <div key={stage.name} className="min-h-[260px] rounded-xl bg-muted/60 p-3">
            <div className="mb-2.5 flex items-center justify-between">
              <div className="text-xs font-bold uppercase tracking-[0.05em] text-muted-foreground">
                {stage.name}
              </div>
              <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold text-white ${stage.dot}`}>
                {list.length}
              </span>
            </div>

            <div className="flex flex-col gap-2">
              {list.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => onSelect(c.id)}
                  className="ad-card-clickable w-full rounded-xl border border-border bg-card p-3 text-left transition-colors hover:border-avisdoc-teal"
                >
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
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
