// « Place dans le Pipeline », dans la colonne de la fiche : elle se change d'ici.
//
// Une affaire choisit sa colonne. Un prospect qui n'y est pas encore y entre en
// choisissant la sienne — dans le pipeline de celui qui le fait, ou Général.

import { useState } from "react";
import { Loader2 } from "lucide-react";
import type { Pipeline, PipelineStage } from "../../types";
import { colonnesDe } from "../../lib/ui-tokens";
import { cn } from "@/lib/utils";

const menu =
  "ad-input h-[34px] min-w-0 cursor-pointer rounded-full border-0 pl-3.5 pr-8 text-[13px] font-semibold outline-none focus:ring-2 focus:ring-avisdoc-teal/40";

/** Le pipeline où entre un prospect : celui de la personne, sinon Général, sinon le premier. */
export function pipelineParDefaut(pipelines: Pipeline[], email: string | null | undefined): Pipeline | undefined {
  const moi = (email ?? "").toLowerCase();
  return (
    pipelines.find((p) => (p.assigneA ?? "").toLowerCase() === moi && moi) ??
    pipelines.find((p) => p.nom.trim().toLowerCase() === "général") ??
    pipelines[0]
  );
}

export default function PlacePipeline({
  pipelines,
  stages,
  pipelineId,
  colonne,
  onChoisir,
}: {
  pipelines: Pipeline[];
  stages: PipelineStage[];
  /** Le pipeline de l'affaire, ou celui où le prospect entrera. */
  pipelineId: string | null;
  /** La colonne actuelle ; null pour un prospect pas encore au Pipeline. */
  colonne: string | null;
  /** Pour un prospect, `pipelineId` dit où il entre. */
  onChoisir: (colonne: string, pipelineId: string) => Promise<void> | void;
}) {
  const [tableau, setTableau] = useState(pipelineId ?? pipelines[0]?.id ?? "");
  const [enCours, setEnCours] = useState(false);
  const auPipeline = colonne !== null;
  const colonnes = colonnesDe(stages, auPipeline ? pipelineId : tableau);
  const nomTableau = pipelines.find((p) => p.id === (auPipeline ? pipelineId : tableau))?.nom;

  const choisir = async (c: string) => {
    if (!c || c === colonne || enCours) return;
    setEnCours(true);
    try {
      await onChoisir(c, auPipeline ? (pipelineId ?? tableau) : tableau);
    } finally {
      setEnCours(false);
    }
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      {!auPipeline && pipelines.length > 1 && (
        <select value={tableau} onChange={(e) => setTableau(e.target.value)} aria-label="Dans quel pipeline" className={cn(menu, "bg-card text-avisdoc-ink")}>
          {pipelines.map((p) => (
            <option key={p.id} value={p.id}>
              {p.nom}
            </option>
          ))}
        </select>
      )}
      <select
        value={colonne ?? ""}
        onChange={(e) => void choisir(e.target.value)}
        disabled={enCours}
        aria-label="Place dans le Pipeline"
        className={cn(menu, auPipeline ? "bg-avisdoc-teal text-white" : "bg-card text-avisdoc-ink")}
      >
        {!auPipeline && <option value="">Pas encore au Pipeline</option>}
        {colonnes.map((s) => (
          <option key={s.id} value={s.label}>
            {s.label}
          </option>
        ))}
      </select>
      {auPipeline && pipelines.length > 1 && nomTableau && <span className="text-[12px] text-muted-foreground">pipeline {nomTableau}</span>}
      {enCours && <Loader2 className="size-3.5 animate-spin text-muted-foreground" />}
    </div>
  );
}
