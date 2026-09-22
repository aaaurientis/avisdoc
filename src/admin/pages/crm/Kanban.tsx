import { useState } from "react";
import { GripVertical, Mail, Pencil, Trash2 } from "lucide-react";
import type { Client, PipelineStage, Stage } from "../../types";
import { euro } from "../../lib/format";
import { COLONNE_KANBAN, TONES } from "../../lib/ui-tokens";
import { Badge } from "../../components/ui";
import CaseFiche, { CaseColonne } from "../../components/CaseFiche";
import { tonNote } from "../../lib/merx";
import { cn } from "@/lib/utils";

function joursLabel(j: number) {
  return j + (j > 1 ? " journées" : " journée");
}

export default function Kanban({
  clients,
  stages,
  onSelect,
  onDeplacer,
  origines,
  coches,
  onCocher,
  onChangerCoches,
  onSupprimer,
  onModifier,
}: {
  clients: Client[];
  /** Colonnes définies par l'équipe (« Colonnes » dans le Pipeline). */
  stages: PipelineStage[];
  onSelect: (id: string) => void;
  /** Changement d'étape par glisser-déposer. */
  onDeplacer?: (id: string, stage: Stage) => void;
  /** Ce que Merx avait trouvé, par affaire : la carte dit la même chose qu’en prospection. */
  origines?: Map<string, { score_total: number | null; activity: string | null; rationale: string | null }>;
  /** Fiches cochées, pour les actions groupées. */
  coches?: Set<string>;
  onCocher?: (id: string) => void;
  /** Remplace la sélection entière : sert à cocher ou décocher une colonne d'un coup. */
  onChangerCoches?: (suivant: Set<string>) => void;
  /** Met une affaire à la corbeille, depuis sa carte. */
  onSupprimer?: (c: Client) => void;
  /** Ouvre la fiche directement en modification. */
  onModifier?: (c: Client) => void;
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
      className="ad-kanban grid gap-3 overflow-x-auto overscroll-x-contain pb-1"
      style={{ gridTemplateColumns: `repeat(${Math.max(stages.length, 1)}, minmax(300px, 380px))` }}
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
            <div className="mb-2.5 flex items-center justify-between gap-2">
              <div className="flex min-w-0 items-center gap-2">
                {onChangerCoches && coches && (
                  <CaseColonne
                    liste={list.map((c) => c.id)}
                    coches={coches}
                    onChanger={onChangerCoches}
                    libelle={stage.label}
                  />
                )}
                <div className="truncate text-xs font-bold uppercase tracking-[0.05em] text-muted-foreground">{stage.label}</div>
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
                    "ad-card-clickable group flex items-start gap-1.5 rounded-xl border bg-card p-3 transition-colors",
                    coches?.has(c.id) ? "border-avisdoc-teal ring-1 ring-avisdoc-teal/40" : "border-border hover:border-avisdoc-teal",
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

                  {onCocher && (
                    <CaseFiche
                      cochee={Boolean(coches?.has(c.id))}
                      onBascule={() => onCocher(c.id)}
                      libelle={c.company}
                      visible={Boolean(coches?.size)}
                    />
                  )}

                  <button type="button" onClick={() => onSelect(c.id)} className="min-w-0 flex-1 text-left">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 text-[13px] font-semibold leading-snug text-avisdoc-ink">{c.company}</div>
                      {origines?.get(c.id) && (
                        <Badge className={`${tonNote(origines.get(c.id)!.score_total)} shrink-0`}>
                          {origines.get(c.id)!.score_total ?? "—"}
                        </Badge>
                      )}
                    </div>
                    <div className="mt-0.5 truncate text-[11.5px] text-muted-foreground">
                      {[origines?.get(c.id)?.activity ?? c.naf, c.ville].filter(Boolean).join(" · ") || "—"}
                    </div>
                    {origines?.get(c.id)?.rationale && (
                      <p className="mt-2 line-clamp-2 text-[12px] leading-snug text-muted-foreground">
                        {origines.get(c.id)!.rationale}
                      </p>
                    )}
                    {c.contacts[0] && (
                      <div className="mt-2 flex items-center gap-2 text-muted-foreground">
                        {c.contacts[0].email && <Mail className="size-3.5" />}
                        <span className="truncate text-[11px]">{c.contacts[0].name}</span>
                      </div>
                    )}
                    {c.tarif > 0 && (
                      <div className="mt-2 flex items-center justify-between">
                        <span className="rounded-full bg-muted px-2 py-0.5 text-[10.5px] font-bold text-muted-foreground">
                          {joursLabel(c.jours)}
                        </span>
                        <span className="text-[12px] font-bold text-avisdoc-ink">{euro(c.jours * c.tarif)}</span>
                      </div>
                    )}
                  </button>

                  {onSupprimer && (
                    <div
                      className="flex shrink-0 items-center opacity-0 transition-opacity group-hover:opacity-100"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <button
                        type="button"
                        onClick={() => (onModifier ? onModifier(c) : onSelect(c.id))}
                        aria-label={`Modifier ${c.company}`}
                        title="Modifier la fiche"
                        className="rounded-lg p-1 text-muted-foreground hover:text-avisdoc-teal"
                      >
                        <Pencil className="size-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => onSupprimer(c)}
                        aria-label={`Supprimer ${c.company}`}
                        title="Supprimer"
                        className="rounded-lg p-1 text-muted-foreground hover:text-rose-700"
                      >
                        <Trash2 className="size-3.5" />
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
