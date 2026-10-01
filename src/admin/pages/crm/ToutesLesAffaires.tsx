// Toutes les affaires, tous pipelines confondus.
//
// « Je ne retrouve pas le pipeline Général. » Depuis qu'un pipeline est un tableau,
// on est toujours DANS un tableau : plus aucun écran ne montrait l'ensemble, et une
// affaire dont on avait oublié le rangement était introuvable.
//
// En liste et non en colonnes, délibérément : les colonnes d'un pipeline n'existent
// pas dans l'autre, un Kanban commun n'aurait aucun sens. Ici on cherche et on
// retrouve ; pour déplacer une carte, on ouvre son tableau.

import { ArrowUpDown } from "lucide-react";
import type { Client, Pipeline } from "../../types";
import { SECTEURS } from "../../lib/merx";
import { nomLisible } from "../../lib/membres";
import { euro } from "../../lib/format";
import { stageMeta } from "../../lib/ui-tokens";
import type { PipelineStage } from "../../types";
import { cn } from "@/lib/utils";

export type ColonneListe = "entreprise" | "pipeline" | "etape" | "referent" | "secteur" | "montant";

const secteurLabel = (id: string | null | undefined) =>
  SECTEURS.find((s) => s.id === (id || "autre"))?.label ?? "Autre";

export default function ToutesLesAffaires({
  clients,
  pipelines,
  stages,
  tri,
  onTrier,
  onOuvrir,
}: {
  clients: Client[];
  pipelines: Pipeline[];
  stages: PipelineStage[];
  tri: { colonne: ColonneListe; sens: "asc" | "desc" };
  onTrier: (c: ColonneListe) => void;
  onOuvrir: (id: string) => void;
}) {
  const nomPipeline = (id: string) => pipelines.find((p) => p.id === id)?.nom ?? "—";

  const EnTete = ({ colonne, libelle }: { colonne: ColonneListe; libelle: string }) => (
    <th className="px-4 py-2.5 text-left">
      <button
        type="button"
        onClick={() => onTrier(colonne)}
        className="inline-flex items-center gap-1 text-[12px] font-bold uppercase tracking-wide text-muted-foreground transition-colors hover:text-avisdoc-ink"
      >
        {libelle}
        {tri.colonne === colonne ? (
          <span className="text-[10px]">{tri.sens === "asc" ? "▲" : "▼"}</span>
        ) : (
          <ArrowUpDown className="size-3 opacity-40" />
        )}
      </button>
    </th>
  );

  if (clients.length === 0) {
    return (
      <div className="rounded-2xl bg-muted/60 p-8 text-center text-sm text-muted-foreground">
        Aucune affaire ne correspond à ces filtres.
      </div>
    );
  }

  return (
    <div className="overflow-x-auto overscroll-x-contain rounded-2xl border border-border bg-card">
      <table className="w-full min-w-[840px] border-collapse">
        <thead>
          <tr className="border-b border-border bg-muted/50">
            <EnTete colonne="entreprise" libelle="Entreprise" />
            <EnTete colonne="pipeline" libelle="Pipeline" />
            <EnTete colonne="etape" libelle="Étape" />
            <EnTete colonne="referent" libelle="Référent" />
            <EnTete colonne="secteur" libelle="Secteur" />
            <EnTete colonne="montant" libelle="Montant" />
          </tr>
        </thead>
        <tbody>
          {clients.map((c) => {
            const meta = stageMeta(c.stage, stages.filter((s) => s.pipelineId === c.pipelineId));
            return (
              <tr
                key={c.id}
                onClick={() => onOuvrir(c.id)}
                className="cursor-pointer border-b border-border last:border-0 hover:bg-muted/30"
              >
                <td className="px-4 py-2.5 text-[13px] font-semibold text-avisdoc-ink">
                  {c.company}
                  {c.ville && <span className="ml-1.5 text-[12px] font-normal text-muted-foreground">{c.ville}</span>}
                </td>
                <td className="whitespace-nowrap px-4 py-2.5 text-[12.5px] font-semibold text-muted-foreground">
                  {nomPipeline(c.pipelineId)}
                </td>
                <td className="whitespace-nowrap px-4 py-2.5">
                  <span className={cn("inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11.5px] font-bold", meta.soft, meta.text)}>
                    <span className={cn("size-1.5 rounded-full", meta.dot)} />
                    {c.stage}
                  </span>
                </td>
                <td className="whitespace-nowrap px-4 py-2.5 text-[12.5px] text-muted-foreground">
                  {c.referent ? nomLisible(c.referent) : <span className="opacity-60">—</span>}
                </td>
                <td className="px-4 py-2.5 text-[12.5px] text-muted-foreground">{secteurLabel(c.secteur)}</td>
                <td className="whitespace-nowrap px-4 py-2.5 text-[12.5px] font-semibold text-avisdoc-ink">
                  {euro(c.jours * c.tarif)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
