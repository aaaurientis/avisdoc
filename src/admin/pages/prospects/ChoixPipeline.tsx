// Où envoyer ce prospect : d'abord DANS QUEL pipeline, ensuite À QUELLE étape.
//
// « Ce n'est pas clair le choix des pipelines. D'abord choix du pipeline très clair
// et ensuite le choix de l'emplacement. » La première version mettait un menu
// déroulant et les étapes sur la même ligne : on ne voyait pas qu'il y avait deux
// décisions, ni dans quel ordre les prendre.
//
// Deux temps, donc, et un seul à la fois. Le tableau choisi reste affiché pendant le
// second — on sait toujours où l'on met l'affaire — et un retour permet d'en changer.
//
// Quand il n'existe qu'un seul pipeline, il n'y a rien à choisir : on va droit aux
// étapes. Deux écrans posent cette question, la fiche et le brouillon d'e-mail, et
// ils la posent avec ce bloc.

import { useState } from "react";
import { ArrowLeft, Loader2 } from "lucide-react";
import { colonnesDe } from "../../lib/ui-tokens";
import type { Pipeline, PipelineStage } from "../../types";
import { cn } from "@/lib/utils";

const pastille =
  "rounded-full border border-border bg-card px-4 py-2 text-[13px] font-bold text-avisdoc-ink transition-colors hover:border-avisdoc-teal disabled:opacity-50";

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
  // Un seul pipeline : il est choisi d'office, la première question ne se pose pas.
  const [choisi, setChoisi] = useState<Pipeline | null>(pipelines.length === 1 ? pipelines[0] : null);

  if (!choisi) {
    return (
      <div className="w-full rounded-2xl border border-border p-3">
        <p className="text-[13px] font-bold text-avisdoc-ink">
          1. Dans quel pipeline ?
        </p>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          {pipelines.map((p) => (
            <button key={p.id} type="button" onClick={() => setChoisi(p)} className={pastille}>
              {p.nom}
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
      </div>
    );
  }

  const colonnes = colonnesDe(stages, choisi.id);

  return (
    <div className="w-full rounded-2xl border border-border p-3">
      <div className="flex flex-wrap items-center gap-2">
        <p className="text-[13px] font-bold text-avisdoc-ink">
          {pipelines.length > 1 ? "2. " : ""}À quelle étape de{" "}
          <span className="rounded-full bg-avisdoc-teal px-2.5 py-0.5 text-white">{choisi.nom}</span> ?
        </p>
        {pipelines.length > 1 && (
          <button
            type="button"
            onClick={() => setChoisi(null)}
            className="inline-flex items-center gap-1 text-[12.5px] font-semibold text-muted-foreground underline-offset-2 hover:text-avisdoc-ink hover:underline"
          >
            <ArrowLeft className="size-3.5" /> changer de pipeline
          </button>
        )}
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-2">
        {colonnes.length === 0 ? (
          <p className="text-[12.5px] text-muted-foreground">
            Ce pipeline n’a aucune colonne — ajoutez-en d’abord avec le bouton <strong>Colonnes</strong> du Pipeline.
          </p>
        ) : (
          colonnes.map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => onValider(s.label, choisi.id)}
              disabled={enCours}
              className={cn(pastille, "inline-flex items-center gap-1.5")}
            >
              {enCours && <Loader2 className="size-3.5 animate-spin" />}
              {s.label}
            </button>
          ))
        )}
        <button
          type="button"
          onClick={onAnnuler}
          className="text-[12.5px] font-semibold text-muted-foreground underline-offset-2 hover:text-avisdoc-ink hover:underline"
        >
          {libelleAnnuler}
        </button>
      </div>
    </div>
  );
}
