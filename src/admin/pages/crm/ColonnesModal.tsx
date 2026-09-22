// Colonnes du Pipeline : ajouter, renommer, recolorer, réordonner, supprimer.
// Une colonne supprimée ne laisse jamais de fiche sans étape : si elle en contient,
// on choisit d'abord où les déplacer.

import { useState } from "react";
import { ArrowLeft, ArrowRight, Check, Plus, Trash2, X } from "lucide-react";
import type { Client, PipelineStage, StageTone } from "../../types";
import { TONES } from "../../lib/ui-tokens";
import { useAdminData } from "../../data/AdminDataContext";
import { Modal, SectionLabel } from "../../components/ui";
import { cn } from "@/lib/utils";

const TEINTES = Object.keys(TONES) as StageTone[];

const champCls =
  "ad-input w-full rounded-xl border border-border bg-muted/50 px-3 py-2 text-[13px] outline-none transition-colors focus:border-avisdoc-teal";

function Teintes({ valeur, onChoisir }: { valeur: StageTone; onChoisir: (t: StageTone) => void }) {
  return (
    <div className="flex items-center gap-1">
      {TEINTES.map((t) => (
        <button
          key={t}
          type="button"
          title={TONES[t].label}
          onClick={() => onChoisir(t)}
          className={cn(
            "flex size-5 items-center justify-center rounded-full transition-transform hover:scale-110",
            TONES[t].dot,
            valeur === t && "ring-2 ring-avisdoc-ink ring-offset-2 ring-offset-card",
          )}
        >
          {valeur === t && <Check className="size-3 text-white" strokeWidth={3} />}
        </button>
      ))}
    </div>
  );
}

export default function ColonnesModal({ clients, onClose }: { clients: Client[]; onClose: () => void }) {
  const { stages, addStage, renameStage, setStageTone, deleteStage, moveStage } = useAdminData();
  const [nouveau, setNouveau] = useState("");
  const [teinteNouveau, setTeinteNouveau] = useState<StageTone>("slate");
  const [aSupprimer, setASupprimer] = useState<PipelineStage | null>(null);
  const [versLabel, setVersLabel] = useState("");

  const compte = (label: string) => clients.filter((c) => c.stage === label).length;

  const demanderSuppression = (s: PipelineStage) => {
    if (stages.length <= 1) return;
    if (compte(s.label) === 0) {
      deleteStage(s.id, null);
      return;
    }
    setVersLabel(stages.find((x) => x.id !== s.id)?.label ?? "");
    setASupprimer(s);
  };

  return (
    <Modal onClose={onClose} width={560}>
      <div className="mb-5 flex items-start justify-between gap-4">
        <div>
          <h2 className="font-display text-xl font-semibold text-avisdoc-ink">Colonnes du pipeline</h2>
          <p className="mt-1 text-[13px] text-muted-foreground">
            Les étapes de vos affaires. Ce que vous changez ici vaut pour toute l’équipe.
          </p>
        </div>
        <button type="button" onClick={onClose} aria-label="Fermer" className="rounded-lg p-1.5 text-muted-foreground hover:text-avisdoc-ink">
          <X className="size-5" />
        </button>
      </div>

      {aSupprimer ? (
        // Une colonne qui contient des fiches ne disparaît pas sans qu'on dise où elles vont.
        <div className="rounded-2xl bg-amber-50 p-4">
          <SectionLabel>Supprimer « {aSupprimer.label} »</SectionLabel>
          <p className="mt-1.5 text-[13px] leading-relaxed text-avisdoc-ink">
            {compte(aSupprimer.label)} fiche{compte(aSupprimer.label) > 1 ? "s sont" : " est"} dans cette colonne.
            Où {compte(aSupprimer.label) > 1 ? "les" : "la"} déplacer ?
          </p>
          <select value={versLabel} onChange={(e) => setVersLabel(e.target.value)} className={cn(champCls, "mt-3 bg-card")}>
            {stages
              .filter((s) => s.id !== aSupprimer.id)
              .map((s) => (
                <option key={s.id} value={s.label}>
                  {s.label}
                </option>
              ))}
          </select>
          <div className="mt-3 flex gap-2">
            <button
              type="button"
              onClick={() => {
                deleteStage(aSupprimer.id, versLabel);
                setASupprimer(null);
              }}
              className="inline-flex items-center gap-1.5 rounded-full bg-avisdoc-coral px-4 py-2 text-[13px] font-bold text-white"
            >
              <Trash2 className="size-4" /> Déplacer et supprimer
            </button>
            <button
              type="button"
              onClick={() => setASupprimer(null)}
              className="rounded-full border border-border px-4 py-2 text-[13px] font-bold text-muted-foreground hover:border-avisdoc-ink hover:text-avisdoc-ink"
            >
              Annuler
            </button>
          </div>
        </div>
      ) : (
        <>
          <div className="space-y-2">
            {stages.map((s, i) => (
              <div key={s.id} className="flex items-center gap-2 rounded-2xl border border-border p-2.5">
                <Teintes valeur={s.tone} onChoisir={(t) => setStageTone(s.id, t)} />
                <input
                  defaultValue={s.label}
                  onBlur={(e) => renameStage(s.id, e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
                  className={cn(champCls, "flex-1")}
                  aria-label={`Nom de la colonne ${s.label}`}
                />
                <span className="w-16 shrink-0 text-right text-[11.5px] text-muted-foreground">
                  {compte(s.label)} fiche{compte(s.label) > 1 ? "s" : ""}
                </span>
                <div className="flex shrink-0 items-center">
                  <button
                    type="button"
                    onClick={() => moveStage(s.id, -1)}
                    disabled={i === 0}
                    aria-label="Déplacer vers la gauche"
                    className="rounded-lg p-1.5 text-muted-foreground hover:text-avisdoc-ink disabled:opacity-30"
                  >
                    <ArrowLeft className="size-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => moveStage(s.id, 1)}
                    disabled={i === stages.length - 1}
                    aria-label="Déplacer vers la droite"
                    className="rounded-lg p-1.5 text-muted-foreground hover:text-avisdoc-ink disabled:opacity-30"
                  >
                    <ArrowRight className="size-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => demanderSuppression(s)}
                    disabled={stages.length <= 1}
                    aria-label={`Supprimer la colonne ${s.label}`}
                    className="rounded-lg p-1.5 text-muted-foreground hover:text-rose-700 disabled:opacity-30"
                  >
                    <Trash2 className="size-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>

          <div className="mt-5 border-t border-border pt-4">
            <SectionLabel>Ajouter une colonne</SectionLabel>
            <div className="mt-2 flex items-center gap-2">
              <Teintes valeur={teinteNouveau} onChoisir={setTeinteNouveau} />
              <input
                value={nouveau}
                onChange={(e) => setNouveau(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && nouveau.trim()) {
                    addStage(nouveau, teinteNouveau);
                    setNouveau("");
                  }
                }}
                placeholder="Négociation, Perdu…"
                className={cn(champCls, "flex-1")}
              />
              <button
                type="button"
                disabled={!nouveau.trim()}
                onClick={() => {
                  addStage(nouveau, teinteNouveau);
                  setNouveau("");
                }}
                className="ad-btn-accent inline-flex shrink-0 items-center gap-1.5 rounded-full bg-avisdoc-teal px-4 py-2 text-[13px] font-bold text-white disabled:opacity-50"
              >
                <Plus className="size-4" /> Ajouter
              </button>
            </div>
            <p className="mt-2 text-[11.5px] text-muted-foreground">
              Renommer une colonne met à jour les fiches qui s’y trouvent — aucune ne perd son étape.
            </p>
          </div>
        </>
      )}
    </Modal>
  );
}
