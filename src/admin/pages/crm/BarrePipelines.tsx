// Les pipelines : des vues nommées du Kanban, créées à la main.
//
// « Qui a décidé de la création de ces pipelines ? Et si je veux en créer deux pour
// moi ? Je veux Ajouter un pipeline et c'est moi qui le crée. » Le menu qui se
// remplissait tout seul avec un commercial par affaire est parti : on règle les
// filtres, on les enregistre sous un nom, et ce nom devient un onglet.
//
// Les affaires ne sont pas dupliquées — il n'y a qu'un seul Kanban. Un pipeline ne
// fait que retenir un réglage de filtres : deux pipelines peuvent très bien montrer
// la même affaire.
//
// Les critères se choisissent DANS le dialogue. La première version enregistrait les
// filtres posés avant d'ouvrir la fenêtre : on nommait un pipeline sans rien lui
// donner, on cliquait dessus, et rien ne bougeait — parce qu'il ne retenait rien.
//
// Aucun n'est privé, et c'est voulu : « si le commercial se barre, on ne récupère pas
// son pipeline ». Tout le monde les voit, tout le monde peut les reprendre.

import { useCallback, useEffect, useState } from "react";
import { Pencil, Plus, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { supabaseAdmin } from "../../data/supabaseAdmin";
import { useAuth } from "../../auth/AuthContext";
import { Modal, SectionLabel } from "../../components/ui";
import { confirmer } from "../../components/Confirmation";
import { nomLisible } from "../../lib/membres";
import { cn } from "@/lib/utils";
import FiltresPipeline, { FILTRES_CRM_VIDES, type FiltresCrm } from "./FiltresPipeline";

export interface Pipeline {
  id: string;
  nom: string;
  filtres: FiltresCrm;
  cree_par: string | null;
}

/** Ce que ce pipeline retient, en toutes lettres : on n'enregistre pas à l'aveugle. */
function enClair(f: FiltresCrm, moi?: string | null): string {
  const bouts: string[] = [];
  if (f.referent === "(aucun)") bouts.push("sans référent");
  else if (f.referent) bouts.push(f.referent === moi ? "mes affaires" : nomLisible(f.referent));
  if (f.journees) bouts.push(`${f.journees} journée${f.journees === "1" ? "" : "s"} et plus`);
  if (f.montant) bouts.push(`${Number(f.montant).toLocaleString("fr-FR")} € et plus`);
  if (f.contact === "avec") bouts.push("avec interlocuteur");
  if (f.contact === "sans") bouts.push("sans interlocuteur");
  if (f.departement) bouts.push(`département ${f.departement}`);
  return bouts.join(" · ");
}

export default function BarrePipelines({
  filtres,
  onAppliquer,
  departements,
  commerciaux,
}: {
  /** Les filtres en cours : ils disent quel onglet est allumé. */
  filtres: FiltresCrm;
  onAppliquer: (f: FiltresCrm) => void;
  departements: string[];
  commerciaux: string[];
}) {
  const { user } = useAuth();
  const [pipelines, setPipelines] = useState<Pipeline[]>([]);
  /** Le pipeline en cours d'écriture : « nouveau », ou celui qu'on modifie. */
  const [brouillon, setBrouillon] = useState<{ id: string | null; nom: string; filtres: FiltresCrm } | null>(null);

  const charger = useCallback(async () => {
    const { data } = await supabaseAdmin.from("admin_pipelines").select("*").order("created_at");
    setPipelines(
      ((data ?? []) as { id: string; nom: string; filtres: Partial<FiltresCrm> | null; cree_par: string | null }[]).map((p) => ({
        id: p.id,
        nom: p.nom,
        filtres: { ...FILTRES_CRM_VIDES, ...(p.filtres ?? {}) },
        cree_par: p.cree_par,
      })),
    );
  }, []);

  useEffect(() => {
    void charger();
  }, [charger]);

  /** Le pipeline dont les filtres sont exactement ceux affichés, s'il y en a un. */
  const actif = pipelines.find((p) => JSON.stringify(p.filtres) === JSON.stringify(filtres));
  const aucunFiltre = JSON.stringify(filtres) === JSON.stringify(FILTRES_CRM_VIDES);

  const enregistrer = async () => {
    if (!brouillon) return;
    const propre = brouillon.nom.trim();
    if (!propre) return;
    const { error } = brouillon.id
      ? await supabaseAdmin.from("admin_pipelines").update({ nom: propre, filtres: brouillon.filtres }).eq("id", brouillon.id)
      : await supabaseAdmin.from("admin_pipelines").insert({ nom: propre, filtres: brouillon.filtres, cree_par: user?.email ?? null });
    if (error) {
      toast.error(`Le pipeline n’a pas pu être enregistré — ${error.message}`);
      return;
    }
    // On l'applique aussitôt : on doit VOIR le pipeline qu'on vient de faire.
    onAppliquer(brouillon.filtres);
    setBrouillon(null);
    await charger();
    toast.success(`Pipeline « ${propre} » ${brouillon.id ? "modifié" : "créé"}`);
  };

  const supprimer = async (p: Pipeline) => {
    if (!(await confirmer({ titre: `Supprimer le pipeline « ${p.nom} » ?`, message: "Les affaires ne bougent pas : seul l’onglet disparaît.", action: "Supprimer" })))
      return;
    const { error } = await supabaseAdmin.from("admin_pipelines").delete().eq("id", p.id);
    if (error) {
      toast.error(`Suppression impossible — ${error.message}`);
      return;
    }
    if (actif?.id === p.id) onAppliquer(FILTRES_CRM_VIDES);
    await charger();
  };

  return (
    <>
      <div className="mb-3 flex flex-wrap items-center gap-1.5">
        <button
          type="button"
          onClick={() => onAppliquer(FILTRES_CRM_VIDES)}
          className={cn(
            "rounded-full px-4 py-2 text-[13px] font-bold transition-colors",
            aucunFiltre ? "bg-avisdoc-ink text-white" : "border border-border bg-card text-avisdoc-ink hover:border-avisdoc-teal",
          )}
        >
          Tout le Pipeline
        </button>

        {pipelines.map((p) => (
          <span
            key={p.id}
            className={cn(
              "inline-flex items-center rounded-full transition-colors",
              actif?.id === p.id ? "bg-avisdoc-teal text-white" : "border border-border bg-card text-avisdoc-ink hover:border-avisdoc-teal",
            )}
          >
            <button
              type="button"
              onClick={() => onAppliquer(p.filtres)}
              title={[enClair(p.filtres, user?.email), p.cree_par ? `créé par ${nomLisible(p.cree_par)}` : null].filter(Boolean).join(" — ")}
              className="px-4 py-2 text-[13px] font-bold"
            >
              {p.nom}
            </button>
            {actif?.id === p.id && (
              <button
                type="button"
                onClick={() => setBrouillon({ id: p.id, nom: p.nom, filtres: p.filtres })}
                aria-label={`Modifier le pipeline ${p.nom}`}
                title="Modifier ce pipeline"
                className="pr-2 opacity-70 transition-opacity hover:opacity-100"
              >
                <Pencil className="size-3.5" />
              </button>
            )}
            {actif?.id === p.id && (
              <button
                type="button"
                onClick={() => void supprimer(p)}
                aria-label={`Supprimer le pipeline ${p.nom}`}
                title="Supprimer ce pipeline"
                className="pr-3 opacity-70 transition-opacity hover:opacity-100"
              >
                <Trash2 className="size-3.5" />
              </button>
            )}
          </span>
        ))}

        <button
          type="button"
          onClick={() => setBrouillon({ id: null, nom: "", filtres: FILTRES_CRM_VIDES })}
          className="inline-flex items-center gap-1.5 rounded-full border border-dashed border-border px-4 py-2 text-[13px] font-bold text-muted-foreground transition-colors hover:border-avisdoc-teal hover:text-avisdoc-ink"
        >
          <Plus className="size-4" /> Ajouter un pipeline
        </button>
      </div>

      {brouillon && (
        <Modal onClose={() => setBrouillon(null)} width={620}>
          <div className="flex items-start justify-between gap-4">
            <div>
              <SectionLabel>{brouillon.id ? "Modifier le pipeline" : "Nouveau pipeline"}</SectionLabel>
              <p className="mt-1 text-[13px] leading-relaxed text-muted-foreground">
                Donnez-lui un nom et choisissez ce qu’il retient. Les affaires ne bougent pas : c’est une
                façon de regarder le même Kanban. Tous les pipelines sont visibles par l’équipe.
              </p>
            </div>
            <button type="button" onClick={() => setBrouillon(null)} aria-label="Fermer" className="text-muted-foreground hover:text-avisdoc-ink">
              <X className="size-5" />
            </button>
          </div>

          <label className="mt-4 block">
            <span className="text-[12px] font-bold uppercase tracking-wide text-muted-foreground">Nom</span>
            <input
              value={brouillon.nom}
              onChange={(e) => setBrouillon({ ...brouillon, nom: e.target.value })}
              onKeyDown={(e) => e.key === "Enter" && void enregistrer()}
              autoFocus
              placeholder="Mes grands comptes, Alsace, Pipeline de Stéphane…"
              className="ad-input mt-1 w-full rounded-xl border border-border bg-muted/50 px-3 py-2 text-[13px] outline-none transition-colors focus:border-avisdoc-teal"
            />
          </label>

          <div className="mt-4">
            <span className="text-[12px] font-bold uppercase tracking-wide text-muted-foreground">Ce qu’il retient</span>
            {/* Les mêmes menus que la barre de filtres : rien de nouveau à apprendre. */}
            <div className="mt-2">
              <FiltresPipeline
                filtres={brouillon.filtres}
                onChange={(f) => setBrouillon({ ...brouillon, filtres: f })}
                departements={departements}
                commerciaux={commerciaux}
                moi={user?.email ?? null}
              />
            </div>
          </div>

          <div className="mt-3 rounded-xl bg-muted/60 px-3 py-2.5 text-[13px]">
            <span className="font-bold text-avisdoc-ink">Ce pipeline retiendra : </span>
            {enClair(brouillon.filtres, user?.email) || (
              <span className="text-muted-foreground">
                rien pour l’instant — il montrerait toutes les affaires, comme « Tout le Pipeline ».
              </span>
            )}
          </div>

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
              {brouillon.id ? "Enregistrer" : "Créer"}
            </button>
          </div>
        </Modal>
      )}

    </>
  );
}
