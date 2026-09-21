// Colonnes du fichier client : ajouter, renommer, réordonner, supprimer.
// Les trois colonnes du socle (Établissement, Date, Secteur) se renomment mais ne se suppriment pas :
// tout le fichier s'y rattache.

import { useState } from "react";
import { ArrowLeft, ArrowRight, Lock, Plus, Trash2, X } from "lucide-react";
import type { AccountField, FieldType } from "../../types";
import { useAdminData } from "../../data/AdminDataContext";
import { Modal, SectionLabel } from "../../components/ui";
import { cn } from "@/lib/utils";

const TYPES: { id: FieldType; label: string }[] = [
  { id: "texte", label: "Texte" },
  { id: "multiligne", label: "Texte long" },
  { id: "nombre", label: "Nombre" },
  { id: "date", label: "Date" },
  { id: "email", label: "E-mail" },
  { id: "telephone", label: "Téléphone" },
  { id: "lien", label: "Lien" },
];

const typeLabel = (t: FieldType) => TYPES.find((x) => x.id === t)?.label ?? t;

const champCls =
  "ad-input w-full rounded-xl border border-border bg-muted/50 px-3 py-2 text-[13px] outline-none transition-colors focus:border-avisdoc-teal";

export default function ColonnesClient({ onClose }: { onClose: () => void }) {
  const { accountFields, accounts, addField, renameField, moveField, deleteField } = useAdminData();
  const [nouveau, setNouveau] = useState("");
  const [type, setType] = useState<FieldType>("texte");
  const [aSupprimer, setASupprimer] = useState<AccountField | null>(null);

  const remplies = (f: AccountField) => accounts.filter((a) => (a.data[f.key] ?? "").trim() !== "").length;

  const ajouter = () => {
    if (!nouveau.trim()) return;
    addField(nouveau, type);
    setNouveau("");
  };

  return (
    <Modal onClose={onClose} width={560}>
      <div className="mb-5 flex items-start justify-between gap-4">
        <div>
          <h2 className="font-display text-xl font-semibold text-avisdoc-ink">Colonnes du fichier</h2>
          <p className="mt-1 text-[13px] text-muted-foreground">
            Le fichier est commun : ce que vous changez ici, toute l’équipe le voit.
          </p>
        </div>
        <button type="button" onClick={onClose} aria-label="Fermer" className="rounded-lg p-1.5 text-muted-foreground hover:text-avisdoc-ink">
          <X className="size-5" />
        </button>
      </div>

      {aSupprimer ? (
        <div className="rounded-2xl bg-amber-50 p-4">
          <SectionLabel>Supprimer « {aSupprimer.label} »</SectionLabel>
          <p className="mt-1.5 text-[13px] leading-relaxed text-avisdoc-ink">
            {remplies(aSupprimer) > 0
              ? `${remplies(aSupprimer)} fiche${remplies(aSupprimer) > 1 ? "s ont" : " a"} une valeur dans cette colonne. Elle${remplies(aSupprimer) > 1 ? "s seront perdues" : " sera perdue"}.`
              : "Cette colonne est vide."}
          </p>
          <div className="mt-3 flex gap-2">
            <button
              type="button"
              onClick={() => {
                deleteField(aSupprimer.id);
                setASupprimer(null);
              }}
              className="inline-flex items-center gap-1.5 rounded-full bg-avisdoc-coral px-4 py-2 text-[13px] font-bold text-white"
            >
              <Trash2 className="size-4" /> Supprimer la colonne
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
          <div className="max-h-[46vh] space-y-2 overflow-y-auto pr-1">
            {accountFields.map((f, i) => (
              <div key={f.id} className="flex items-center gap-2 rounded-2xl border border-border p-2.5">
                <input
                  defaultValue={f.label}
                  onBlur={(e) => renameField(f.id, e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
                  className={cn(champCls, "flex-1")}
                  aria-label={`Nom de la colonne ${f.label}`}
                />
                <span className="w-24 shrink-0 text-right text-[11.5px] text-muted-foreground">{typeLabel(f.type)}</span>
                <div className="flex shrink-0 items-center">
                  <button
                    type="button"
                    onClick={() => moveField(f.id, -1)}
                    disabled={i === 0}
                    aria-label="Déplacer vers la gauche"
                    className="rounded-lg p-1.5 text-muted-foreground hover:text-avisdoc-ink disabled:opacity-30"
                  >
                    <ArrowLeft className="size-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => moveField(f.id, 1)}
                    disabled={i === accountFields.length - 1}
                    aria-label="Déplacer vers la droite"
                    className="rounded-lg p-1.5 text-muted-foreground hover:text-avisdoc-ink disabled:opacity-30"
                  >
                    <ArrowRight className="size-4" />
                  </button>
                  {f.protege ? (
                    <span title="Colonne du socle : elle ne se supprime pas" className="p-1.5 text-muted-foreground/50">
                      <Lock className="size-4" />
                    </span>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setASupprimer(f)}
                      aria-label={`Supprimer la colonne ${f.label}`}
                      className="rounded-lg p-1.5 text-muted-foreground hover:text-rose-700"
                    >
                      <Trash2 className="size-4" />
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>

          <div className="mt-5 border-t border-border pt-4">
            <SectionLabel>Ajouter une colonne</SectionLabel>
            <div className="mt-2 flex items-center gap-2">
              <input
                value={nouveau}
                onChange={(e) => setNouveau(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && ajouter()}
                placeholder="Effectif, Convention, Notes…"
                className={cn(champCls, "flex-1")}
              />
              <select value={type} onChange={(e) => setType(e.target.value as FieldType)} className={cn(champCls, "w-32 shrink-0 bg-card")}>
                {TYPES.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.label}
                  </option>
                ))}
              </select>
              <button
                type="button"
                disabled={!nouveau.trim()}
                onClick={ajouter}
                className="ad-btn-accent inline-flex shrink-0 items-center gap-1.5 rounded-full bg-avisdoc-teal px-4 py-2 text-[13px] font-bold text-white disabled:opacity-50"
              >
                <Plus className="size-4" /> Ajouter
              </button>
            </div>
          </div>
        </>
      )}
    </Modal>
  );
}
