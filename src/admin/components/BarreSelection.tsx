// La barre qui apparaît dès qu'une fiche est cochée : ce qu'on peut faire de la
// sélection, et de combien de fiches on parle.
//
// Elle est la même dans la prospection, le Pipeline et le fichier client : cocher des
// fiches et agir dessus doit se faire du même geste partout.

import { Loader2, Mail, Sparkles, Trash2, X } from "lucide-react";

export default function BarreSelection({
  nombre,
  total,
  avecEmail,
  libelleSuppression,
  onEmail,
  onSupprimer,
  onTout,
  onEffacer,
  approfondir,
}: {
  nombre: number;
  /** Combien de fiches sont affichées à l'écran : « tout cocher » n'en prend pas d'autres. */
  total: number;
  /** Combien, parmi les fiches cochées, ont une adresse e-mail. */
  avecEmail: number;
  /** « Supprimer » ou « Écarter » selon l'écran : on ne détruit pas un prospect. */
  libelleSuppression: string;
  onEmail: () => void;
  onSupprimer: () => void;
  onTout: () => void;
  onEffacer: () => void;
  /** Propre à la prospection : lancer l'approfondissement sur toute la sélection. */
  approfondir?: { aFaire: number; enCours: { fait: number; total: number } | null; lancer: () => void };
}) {
  if (nombre === 0) return null;

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-5 z-40 flex justify-center px-4">
      <div className="ad-card pointer-events-auto flex flex-wrap items-center gap-2 rounded-full border border-border bg-card px-3 py-2 shadow-floating">
        <span className="px-2 text-[13px] font-bold text-avisdoc-ink">
          {nombre} fiche{nombre > 1 ? "s" : ""}
        </span>

        {nombre < total && (
          <button
            type="button"
            onClick={onTout}
            className="rounded-full px-3 py-1.5 text-[12.5px] font-bold text-avisdoc-teal underline-offset-2 hover:underline"
          >
            Tout cocher ({total})
          </button>
        )}

        {approfondir && (
          <button
            type="button"
            onClick={approfondir.lancer}
            disabled={approfondir.aFaire === 0 || approfondir.enCours !== null}
            title={approfondir.aFaire === 0 ? "Toutes les fiches cochées sont déjà approfondies" : undefined}
            className="inline-flex items-center gap-1.5 rounded-full border border-border px-4 py-1.5 text-[12.5px] font-bold text-avisdoc-ink transition-colors hover:border-avisdoc-teal disabled:opacity-50"
          >
            {approfondir.enCours ? (
              <>
                <Loader2 className="size-3.5 animate-spin" />
                {approfondir.enCours.fait} / {approfondir.enCours.total}
              </>
            ) : (
              <>
                <Sparkles className="size-3.5" /> Approfondir {approfondir.aFaire > 0 ? approfondir.aFaire : "—"}
              </>
            )}
          </button>
        )}

        <button
          type="button"
          onClick={onEmail}
          disabled={avecEmail === 0}
          title={avecEmail === 0 ? "Aucune des fiches cochées n’a d’adresse e-mail" : undefined}
          className="inline-flex items-center gap-1.5 rounded-full border border-border px-4 py-1.5 text-[12.5px] font-bold text-avisdoc-ink transition-colors hover:border-avisdoc-teal disabled:opacity-50"
        >
          <Mail className="size-3.5" /> Écrire à {avecEmail > 0 ? avecEmail : "—"}
        </button>

        <button
          type="button"
          onClick={onSupprimer}
          className="inline-flex items-center gap-1.5 rounded-full border border-border px-4 py-1.5 text-[12.5px] font-bold text-muted-foreground transition-colors hover:border-rose-300 hover:text-rose-700"
        >
          <Trash2 className="size-3.5" /> {libelleSuppression}
        </button>

        <button
          type="button"
          onClick={onEffacer}
          className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[12.5px] font-bold text-muted-foreground transition-colors hover:text-avisdoc-ink"
        >
          <X className="size-3.5" /> Tout décocher
        </button>
      </div>
    </div>
  );
}
