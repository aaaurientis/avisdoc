// Les pipelines : un nom, un assigné, des colonnes. C'est tout.
//
// « En quoi c'est compliqué de créer un pipeline ? Le nom du pipeline, Assigné à,
// les colonnes, et c'est tout. » Les deux versions précédentes en avaient fait une
// vue filtrée sur un tableau unique — ce n'était pas la demande. Un pipeline est un
// TABLEAU : ses colonnes lui appartiennent, les affaires qu'il contient aussi.
//
// Aucun n'est privé, et c'est voulu : « si le commercial se barre, on ne récupère
// pas son pipeline ». L'assigné dit qui en répond, il n'interdit rien à personne.

import { useState } from "react";
import { GripVertical, Pencil, Plus, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { useAdminData } from "../../data/AdminDataContext";
import { useAuth } from "../../auth/AuthContext";
import { Modal, SectionLabel } from "../../components/ui";
import { confirmer } from "../../components/Confirmation";
import { nomLisible } from "../../lib/membres";
import { uid } from "../../lib/format";
import { TONES } from "../../lib/ui-tokens";
import type { Pipeline, PipelineStage, StageTone } from "../../types";
import { cn } from "@/lib/utils";
import { estGeneral } from "../../lib/pipeline-general";

/**
 * Les colonnes proposées à la création : le tronc commun à tous les pipelines
 * (migration 0067). Un point de départ, qu'on ajuste ensuite par pipeline.
 */
const COLONNES_PROPOSEES: { label: string; tone: StageTone }[] = [
  { label: "Qualifié", tone: "slate" },
  { label: "Contacté", tone: "teal" },
  { label: "Présentation", tone: "coral" },
  { label: "RDV", tone: "emerald" },
  { label: "Proposition", tone: "coral" },
  { label: "Signé", tone: "violet" },
  { label: "Perdu", tone: "rose" },
];

const TEINTES = Object.keys(TONES) as StageTone[];

interface Brouillon {
  id: string | null;
  nom: string;
  assigneA: string;
  colonnes: { label: string; tone: StageTone }[];
}

const champCls =
  "ad-input w-full rounded-xl border border-border bg-muted/50 px-3 py-2 text-[13px] outline-none transition-colors focus:border-avisdoc-teal";

export default function BarrePipelines({
  actif,
  onChoisir,
  commerciaux,
}: {
  actif: Pipeline | null;
  onChoisir: (p: Pipeline) => void;
  /** Ceux à qui on peut assigner un tableau. */
  commerciaux: string[];
}) {
  const { pipelines, stages, clients, createPipeline, updatePipeline, deletePipeline } = useAdminData();
  const { user } = useAuth();
  const [brouillon, setBrouillon] = useState<Brouillon | null>(null);

  const ouvrirCreation = () =>
    setBrouillon({ id: null, nom: "", assigneA: user?.email ?? "", colonnes: [...COLONNES_PROPOSEES] });

  const ouvrirModification = (p: Pipeline) =>
    setBrouillon({
      id: p.id,
      nom: p.nom,
      assigneA: p.assigneA ?? "",
      // À la modification, les colonnes se règlent avec le bouton « Colonnes » du
      // tableau : les toucher ici obligerait à décider du sort des affaires qu'elles
      // portent. On ne mélange pas les deux.
      colonnes: [],
    });

  const enregistrer = async () => {
    if (!brouillon) return;
    const nom = brouillon.nom.trim();
    if (!nom) return;
    const assigneA = brouillon.assigneA || null;

    if (brouillon.id) {
      updatePipeline(brouillon.id, { nom, assigneA });
      setBrouillon(null);
      toast.success(`Pipeline « ${nom} » modifié`);
      return;
    }

    const colonnes = brouillon.colonnes.filter((c) => c.label.trim());
    if (colonnes.length === 0) {
      toast.error("Un pipeline a besoin d’au moins une colonne.");
      return;
    }
    const p: Pipeline = { id: uid(), nom, assigneA };
    const stagesNeufs: PipelineStage[] = colonnes.map((c, i) => ({
      id: uid(),
      label: c.label.trim(),
      position: i + 1,
      tone: c.tone,
      pipelineId: p.id,
    }));
    createPipeline(p, stagesNeufs);
    setBrouillon(null);
    onChoisir(p);
    toast.success(`Pipeline « ${nom} » créé`);
  };

  const supprimer = async (p: Pipeline) => {
    const dedans = clients.filter((c) => c.pipelineId === p.id).length;
    if (dedans > 0) {
      toast.error(
        `« ${p.nom} » contient ${dedans} affaire${dedans > 1 ? "s" : ""}. Déplacez-les avant de le supprimer.`,
      );
      return;
    }
    if (pipelines.length <= 1) {
      toast.error("Il faut garder au moins un pipeline.");
      return;
    }
    if (
      !(await confirmer({
        titre: `Supprimer le pipeline « ${p.nom} » ?`,
        message: "Ses colonnes partent avec lui. Il est vide, aucune affaire n’est perdue.",
        action: "Supprimer",
      }))
    )
      return;
    deletePipeline(p.id);
    const autre = pipelines.find((x) => x.id !== p.id);
    if (autre) onChoisir(autre);
  };

  const majColonne = (i: number, champs: Partial<{ label: string; tone: StageTone }>) =>
    setBrouillon((b) =>
      b ? { ...b, colonnes: b.colonnes.map((c, j) => (j === i ? { ...c, ...champs } : c)) } : b,
    );

  return (
    <>
      <div className="mb-3 flex flex-wrap items-center gap-1.5">
        {pipelines.map((p) => {
          // Général est la vue d'ensemble : il compte toutes les affaires.
          const combien = estGeneral(p) ? clients.length : clients.filter((c) => c.pipelineId === p.id).length;
          return (
            <span
              key={p.id}
              className={cn(
                "inline-flex items-center rounded-full transition-colors",
                actif?.id === p.id
                  ? "bg-avisdoc-teal text-white"
                  : "border border-border bg-card text-avisdoc-ink hover:border-avisdoc-teal",
              )}
            >
              <button type="button" onClick={() => onChoisir(p)} className="py-2 pl-4 pr-2 text-[13px] font-bold">
                {p.nom}
                <span className={cn("ml-1.5 text-[11.5px] font-semibold", actif?.id === p.id ? "opacity-80" : "text-muted-foreground")}>
                  {combien}
                </span>
                {p.assigneA && (
                  <span className={cn("ml-1.5 text-[11.5px] font-medium", actif?.id === p.id ? "opacity-80" : "text-muted-foreground")}>
                    · {nomLisible(p.assigneA)}
                  </span>
                )}
              </button>
              {actif?.id === p.id && (
                <>
                  <button
                    type="button"
                    onClick={() => ouvrirModification(p)}
                    aria-label={`Modifier le pipeline ${p.nom}`}
                    title="Renommer, réassigner"
                    className="px-1 opacity-70 transition-opacity hover:opacity-100"
                  >
                    <Pencil className="size-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => void supprimer(p)}
                    aria-label={`Supprimer le pipeline ${p.nom}`}
                    title="Supprimer ce pipeline"
                    className="pr-3 opacity-70 transition-opacity hover:opacity-100"
                  >
                    <Trash2 className="size-3.5" />
                  </button>
                </>
              )}
            </span>
          );
        })}

        <button
          type="button"
          onClick={ouvrirCreation}
          className="inline-flex items-center gap-1.5 rounded-full border border-dashed border-border px-4 py-2 text-[13px] font-bold text-muted-foreground transition-colors hover:border-avisdoc-teal hover:text-avisdoc-ink"
        >
          <Plus className="size-4" /> Ajouter un pipeline
        </button>
      </div>

      {brouillon && (
        <Modal onClose={() => setBrouillon(null)} width={560}>
          <div className="flex items-start justify-between gap-4">
            <SectionLabel>{brouillon.id ? "Modifier le pipeline" : "Nouveau pipeline"}</SectionLabel>
            <button type="button" onClick={() => setBrouillon(null)} aria-label="Fermer" className="text-muted-foreground hover:text-avisdoc-ink">
              <X className="size-5" />
            </button>
          </div>

          <label className="mt-4 block">
            <span className="text-[12px] font-bold uppercase tracking-wide text-muted-foreground">Nom du pipeline</span>
            <input
              value={brouillon.nom}
              onChange={(e) => setBrouillon({ ...brouillon, nom: e.target.value })}
              autoFocus
              placeholder="Grands comptes, Alsace, Prospection Stéphane…"
              className={cn(champCls, "mt-1")}
            />
          </label>

          <label className="mt-3 block">
            <span className="text-[12px] font-bold uppercase tracking-wide text-muted-foreground">Assigné à</span>
            <select
              value={brouillon.assigneA}
              onChange={(e) => setBrouillon({ ...brouillon, assigneA: e.target.value })}
              className={cn(champCls, "mt-1")}
            >
              <option value="">Personne en particulier</option>
              {commerciaux.map((c) => (
                <option key={c} value={c}>
                  {nomLisible(c)}
                </option>
              ))}
            </select>
          </label>

          {brouillon.id ? (
            <p className="mt-4 rounded-xl bg-muted/60 px-3 py-2.5 text-[13px] leading-relaxed text-muted-foreground">
              Les colonnes de ce pipeline se règlent avec le bouton <strong className="text-avisdoc-ink">Colonnes</strong>,
              en haut du tableau : elles portent des affaires, on ne les change pas à l’aveugle.
            </p>
          ) : (
            <div className="mt-4">
              <span className="text-[12px] font-bold uppercase tracking-wide text-muted-foreground">Colonnes</span>
              <div className="mt-2 space-y-1.5">
                {brouillon.colonnes.map((c, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <GripVertical className="size-4 shrink-0 text-muted-foreground/50" />
                    <select
                      value={c.tone}
                      onChange={(e) => majColonne(i, { tone: e.target.value as StageTone })}
                      aria-label={`Couleur de la colonne ${c.label}`}
                      className="ad-input shrink-0 rounded-lg border border-border bg-muted/50 px-2 py-2 text-[12px] outline-none focus:border-avisdoc-teal"
                    >
                      {TEINTES.map((t) => (
                        <option key={t} value={t}>
                          {TONES[t].label}
                        </option>
                      ))}
                    </select>
                    <input
                      value={c.label}
                      onChange={(e) => majColonne(i, { label: e.target.value })}
                      className={champCls}
                    />
                    <button
                      type="button"
                      onClick={() => setBrouillon({ ...brouillon, colonnes: brouillon.colonnes.filter((_, j) => j !== i) })}
                      aria-label={`Retirer la colonne ${c.label}`}
                      className="shrink-0 text-muted-foreground transition-colors hover:text-rose-700"
                    >
                      <Trash2 className="size-4" />
                    </button>
                  </div>
                ))}
              </div>
              <button
                type="button"
                onClick={() => setBrouillon({ ...brouillon, colonnes: [...brouillon.colonnes, { label: "", tone: "slate" }] })}
                className="mt-2 inline-flex items-center gap-1.5 text-[13px] font-semibold text-avisdoc-teal hover:underline"
              >
                <Plus className="size-4" /> Ajouter une colonne
              </button>
            </div>
          )}

          <div className="mt-5 flex justify-end gap-2">
            <button type="button" onClick={() => setBrouillon(null)} className="rounded-full border border-border px-5 py-2.5 text-sm font-bold text-avisdoc-ink">
              Annuler
            </button>
            <button
              type="button"
              onClick={() => void enregistrer()}
              disabled={!brouillon.nom.trim()}
              className="ad-btn-accent rounded-full bg-avisdoc-teal px-5 py-2.5 text-sm font-bold text-white disabled:opacity-40"
            >
              {brouillon.id ? "Enregistrer" : "Créer le pipeline"}
            </button>
          </div>
        </Modal>
      )}
    </>
  );
}
