// Déplacer une action : un appel se décale, un rendez-vous change d'heure.
//
// Une action programmée qu'on ne peut plus toucher oblige à la supprimer et à la
// refaire. On ouvre donc la même fiche, avec ses valeurs, et on corrige.

import { useState } from "react";
import { Loader2, Trash2, X } from "lucide-react";
import { Modal, SectionLabel } from "./ui";
import { libelleGenre, modifierEchange, supprimerEchange, type Echange } from "../lib/echanges";
import { cn } from "@/lib/utils";
import { confirmer } from "./Confirmation";

const champCls =
  "ad-input w-full rounded-xl border border-border bg-background px-3.5 py-2.5 text-[13px] outline-none transition-colors focus:border-avisdoc-teal";

export default function ModifierAction({
  action,
  onClose,
  onFait,
}: {
  action: Echange;
  onClose: () => void;
  onFait: () => Promise<void> | void;
}) {
  const d = new Date(action.au);
  const [titre, setTitre] = useState(action.titre);
  const [detail, setDetail] = useState(action.detail ?? "");
  const [jour, setJour] = useState(
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`,
  );
  const [heure, setHeure] = useState(d.toTimeString().slice(0, 5));
  const [envoi, setEnvoi] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);

  const agir = async (quoi: "enregistrer" | "supprimer") => {
    if (envoi) return;
    if (quoi === "supprimer" && !(await confirmer({ titre: `Supprimer « ${action.titre} » ?`, message: "Cette action disparaîtra du planning et de la fiche." }))) return;
    setEnvoi(true);
    setErreur(null);
    try {
      if (quoi === "supprimer") await supprimerEchange(action.id);
      else await modifierEchange(action.id, { titre, detail, au: new Date(`${jour}T${heure}:00`).toISOString() });
      await onFait();
      onClose();
    } catch (e) {
      setErreur(e instanceof Error ? e.message : "L’enregistrement a échoué.");
    } finally {
      setEnvoi(false);
    }
  };

  return (
    <Modal onClose={onClose} width={520}>
      <div className="mb-4 flex items-start justify-between gap-4">
        <div>
          <h2 className="font-display text-xl font-semibold text-avisdoc-ink">{libelleGenre(action.kind)}</h2>
          <p className="mt-1 text-[13px] text-muted-foreground">Décalez, corrigez, ou supprimez.</p>
        </div>
        <button type="button" onClick={onClose} aria-label="Fermer" className="rounded-lg p-1.5 text-muted-foreground hover:text-avisdoc-ink">
          <X className="size-5" />
        </button>
      </div>

      <label className="block">
        <SectionLabel>Ce qu’il faut faire</SectionLabel>
        <input value={titre} onChange={(e) => setTitre(e.target.value)} className={cn(champCls, "mt-1")} />
      </label>

      <label className="mt-3 block">
        <SectionLabel>Détail</SectionLabel>
        <textarea value={detail} onChange={(e) => setDetail(e.target.value)} rows={3} className={cn(champCls, "mt-1 resize-none")} />
      </label>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <label className="flex items-center gap-2 text-[12.5px] font-semibold text-muted-foreground">
          Le
          <input type="date" value={jour} onChange={(e) => setJour(e.target.value)} className={cn(champCls, "w-auto")} />
        </label>
        <label className="flex items-center gap-2 text-[12.5px] font-semibold text-muted-foreground">
          à
          <input type="time" value={heure} onChange={(e) => setHeure(e.target.value)} className={cn(champCls, "w-auto")} />
        </label>
      </div>

      {erreur && <p className="mt-3 rounded-xl bg-rose-50 px-3.5 py-2.5 text-[12.5px] font-semibold text-rose-700">{erreur}</p>}

      <div className="mt-5 flex flex-wrap gap-2 border-t border-border pt-4">
        <button
          type="button"
          onClick={() => void agir("enregistrer")}
          disabled={!titre.trim() || envoi}
          className="ad-btn-accent inline-flex items-center gap-1.5 rounded-full bg-avisdoc-teal px-5 py-2.5 text-sm font-bold text-white disabled:opacity-50"
        >
          {envoi && <Loader2 className="size-4 animate-spin" />} Enregistrer
        </button>
        <button
          type="button"
          onClick={() => void agir("supprimer")}
          className="inline-flex items-center gap-1.5 rounded-full border border-border px-5 py-2.5 text-sm font-bold text-muted-foreground transition-colors hover:border-rose-300 hover:text-rose-700"
        >
          <Trash2 className="size-4" /> Supprimer
        </button>
        <button
          type="button"
          onClick={onClose}
          className="rounded-full border border-border px-5 py-2.5 text-sm font-bold text-muted-foreground transition-colors hover:border-avisdoc-ink hover:text-avisdoc-ink"
        >
          Annuler
        </button>
      </div>
    </Modal>
  );
}
