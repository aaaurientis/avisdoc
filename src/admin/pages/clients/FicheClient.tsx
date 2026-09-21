// Fiche client : consultation, modification et création, bâties sur les colonnes du fichier.
// On ne modifie jamais une information par mégarde : un clic OUVRE la fiche, le crayon la rend modifiable.

import { useState } from "react";
import { Pencil, X } from "lucide-react";
import type { Account, AccountField } from "../../types";
import { useAdminData } from "../../data/AdminDataContext";
import { Modal } from "../../components/ui";
import { cn } from "@/lib/utils";

const champCls =
  "ad-input w-full rounded-xl border border-border bg-muted/50 px-3.5 py-2.5 text-[13px] outline-none transition-colors focus:border-avisdoc-teal";

const inputType = (t: AccountField["type"]) =>
  t === "date" ? "date" : t === "nombre" ? "number" : t === "email" ? "email" : t === "telephone" ? "tel" : "text";

export default function FicheClient({
  fiche,
  mode: modeInitial = "edition",
  onClose,
}: {
  fiche?: Account;
  /** « lecture » quand on ouvre la fiche d'un clic ; « edition » depuis le crayon ou une création. */
  mode?: "lecture" | "edition";
  onClose: () => void;
}) {
  const { accountFields, addAccount, saveAccount } = useAdminData();
  const [mode, setMode] = useState<"lecture" | "edition">(fiche ? modeInitial : "edition");
  const [valeurs, setValeurs] = useState<Record<string, string>>(() => {
    if (!fiche) return {};
    return {
      etablissement: fiche.name,
      date_client: fiche.signedOn ?? "",
      secteur: fiche.sector ?? "",
      ...fiche.data,
    };
  });

  const lire = (key: string) => valeurs[key] ?? "";
  const ecrire = (key: string, v: string) => setValeurs((prev) => ({ ...prev, [key]: v }));
  const nom = lire("etablissement").trim();

  const enregistrer = () => {
    if (!nom) return;
    const data: Record<string, string> = {};
    for (const f of accountFields) {
      if (f.key === "etablissement" || f.key === "date_client" || f.key === "secteur") continue;
      const v = lire(f.key).trim();
      if (v) data[f.key] = v;
    }
    const valeursFiche = {
      name: nom,
      signedOn: lire("date_client") || null,
      sector: lire("secteur").trim() || null,
      data,
    };
    if (fiche) saveAccount(fiche.id, valeursFiche);
    else addAccount(valeursFiche);
    onClose();
  };

  return (
    <Modal onClose={onClose} width={520}>
      <div className="mb-5 flex items-start justify-between gap-4">
        <div>
          <h2 className="font-display text-xl font-semibold text-avisdoc-ink">
            {fiche ? fiche.name : "Nouveau client"}
          </h2>
          <p className="mt-1 text-[13px] text-muted-foreground">
            {!fiche
              ? "Seul l’établissement est nécessaire ; le reste peut se remplir plus tard."
              : mode === "lecture"
                ? [fiche.sector, fiche.signedOn ? `client depuis le ${new Date(fiche.signedOn).toLocaleDateString("fr-FR")}` : null]
                    .filter(Boolean)
                    .join(" · ") || "Fiche client"
                : "Modifiez ce qu’il faut, puis enregistrez."}
          </p>
        </div>
        <button type="button" onClick={onClose} aria-label="Fermer" className="rounded-lg p-1.5 text-muted-foreground hover:text-avisdoc-ink">
          <X className="size-5" />
        </button>
      </div>

      {mode === "lecture" ? (
        /* ── Consultation : les informations, sans aucun champ de saisie ── */
        <div className="max-h-[52vh] divide-y divide-border overflow-y-auto rounded-2xl border border-border">
          {accountFields.map((f) => {
            const v = lire(f.key).trim();
            const affichee =
              v && f.type === "date" && !Number.isNaN(new Date(v).getTime())
                ? new Date(v).toLocaleDateString("fr-FR")
                : v;
            return (
              <div key={f.id} className="flex gap-3 px-4 py-2.5">
                <div className="w-40 shrink-0 text-[12.5px] text-muted-foreground">{f.label}</div>
                <div className={cn("min-w-0 flex-1 whitespace-pre-wrap break-words text-[13px]", affichee ? "text-avisdoc-ink" : "text-muted-foreground/50")}>
                  {affichee
                    ? f.type === "email"
                      ? <a href={`mailto:${affichee}`} className="text-avisdoc-teal underline-offset-2 hover:underline">{affichee}</a>
                      : f.type === "telephone"
                        ? <a href={`tel:${affichee.replace(/\s/g, "")}`} className="text-avisdoc-teal underline-offset-2 hover:underline">{affichee}</a>
                        : f.type === "lien"
                          ? <a href={affichee} target="_blank" rel="noreferrer" className="text-avisdoc-teal underline-offset-2 hover:underline">{affichee}</a>
                          : affichee
                    : "—"}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="max-h-[52vh] space-y-3 overflow-y-auto pr-1">
        {accountFields.map((f) => (
          <label key={f.id} className="block">
            <span className="mb-1 block text-[12.5px] font-semibold text-avisdoc-ink">
              {f.label}
              {f.key === "etablissement" && <span className="ml-1 text-avisdoc-coral">*</span>}
            </span>
            {f.type === "multiligne" ? (
              <textarea
                rows={3}
                value={lire(f.key)}
                onChange={(e) => ecrire(f.key, e.target.value)}
                className={cn(champCls, "resize-none")}
              />
            ) : (
              <input
                type={inputType(f.type)}
                value={lire(f.key)}
                onChange={(e) => ecrire(f.key, e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && enregistrer()}
                autoFocus={f.key === "etablissement"}
                className={champCls}
              />
            )}
          </label>
        ))}
        </div>
      )}

      <div className="mt-5 flex gap-2 border-t border-border pt-4">
        {mode === "lecture" ? (
          <>
            <button
              type="button"
              onClick={() => setMode("edition")}
              className="ad-btn-accent inline-flex items-center gap-1.5 rounded-full bg-avisdoc-teal px-5 py-2.5 text-sm font-bold text-white"
            >
              <Pencil className="size-4" /> Modifier
            </button>
            <button
              type="button"
              onClick={onClose}
              className="rounded-full border border-border px-5 py-2.5 text-sm font-bold text-muted-foreground transition-colors hover:border-avisdoc-ink hover:text-avisdoc-ink"
            >
              Fermer
            </button>
          </>
        ) : (
          <>
            <button
              type="button"
              onClick={enregistrer}
              disabled={!nom}
              className="ad-btn-accent inline-flex items-center gap-1.5 rounded-full bg-avisdoc-teal px-5 py-2.5 text-sm font-bold text-white disabled:opacity-50"
            >
              Enregistrer
            </button>
            <button
              type="button"
              onClick={onClose}
              className="rounded-full border border-border px-5 py-2.5 text-sm font-bold text-muted-foreground transition-colors hover:border-avisdoc-ink hover:text-avisdoc-ink"
            >
              Annuler
            </button>
          </>
        )}
      </div>
    </Modal>
  );
}
