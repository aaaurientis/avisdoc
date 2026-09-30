// Où envoyer ce prospect : dans quel pipeline, et à quelle étape.
//
// « Si je dois ajouter un prospect à un pipeline, je dois avoir le choix dans les
// pipelines. » Avant, l'affaire entrait toujours dans le premier tableau : on ne
// choisissait que l'étape. Deux écrans posent la question — la fiche du prospect et
// le brouillon d'e-mail —, et ils doivent la poser pareil.
//
// Quand il n'y a qu'un seul pipeline, le menu ne sert à rien : il ne s'affiche pas.

import { useState } from "react";
import { Loader2 } from "lucide-react";
import { colonnesDe } from "../../lib/ui-tokens";
import type { Pipeline, PipelineStage } from "../../types";

export default function ChoixPipeline({
  pipelines,
  stages,
  onValider,
  onAnnuler,
  libelleAnnuler = "Annuler",
  enCours = false,
}: {
  pipelines: Pipeline[];
  /** Toutes les colonnes : on ne garde que celles du tableau choisi. */
  stages: PipelineStage[];
  onValider: (etape: string, pipelineId: string) => void;
  onAnnuler: () => void;
  libelleAnnuler?: string;
  enCours?: boolean;
}) {
  const [choisi, setChoisi] = useState(pipelines[0]?.id ?? "");
  const colonnes = colonnesDe(stages, choisi || undefined);

  return (
    <div className="flex w-full flex-wrap items-center gap-2 rounded-2xl border border-border p-2.5">
      {pipelines.length > 1 && (
        <>
          <span className="text-[12.5px] font-semibold text-avisdoc-ink">Dans quel pipeline ?</span>
          <select
            value={choisi}
            onChange={(e) => setChoisi(e.target.value)}
            aria-label="Pipeline de destination"
            className="ad-input rounded-full border border-border bg-card px-3.5 py-1.5 text-[12.5px] font-bold text-avisdoc-ink outline-none transition-colors focus:border-avisdoc-teal"
          >
            {pipelines.map((p) => (
              <option key={p.id} value={p.id}>
                {p.nom}
              </option>
            ))}
          </select>
        </>
      )}

      <span className="text-[12.5px] font-semibold text-avisdoc-ink">À quelle étape ?</span>
      {colonnes.map((s) => (
        <button
          key={s.id}
          type="button"
          onClick={() => onValider(s.label, choisi)}
          disabled={enCours}
          className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-3.5 py-1.5 text-[12.5px] font-bold text-avisdoc-ink transition-colors hover:border-avisdoc-teal disabled:opacity-50"
        >
          {enCours && <Loader2 className="size-3.5 animate-spin" />}
          {s.label}
        </button>
      ))}

      <button
        type="button"
        onClick={onAnnuler}
        className="text-[12.5px] font-semibold text-muted-foreground underline-offset-2 hover:text-avisdoc-ink hover:underline"
      >
        {libelleAnnuler}
      </button>
    </div>
  );
}
