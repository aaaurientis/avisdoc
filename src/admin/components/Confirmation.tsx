// Demander avant de détruire, partout et de la même façon.
//
// `window.confirm` faisait l'affaire, mais il est gris, anglais par endroits, et le
// navigateur peut le museler. Surtout, il était posé à certains endroits et oublié à
// d'autres : on supprimait une fiche d'un clic sans rien demander.
//
// Ici, une seule fenêtre pour tout le Hub. On l'appelle comme on appelait `confirm`,
// elle rend une promesse, et elle passe AU-DESSUS des fiches (z-80 contre z-70).

import { useEffect, useState } from "react";
import { AlertTriangle, Loader2 } from "lucide-react";

interface Demande {
  /** Ce qu'on s'apprête à détruire, nommé : « Supprimer JARDIN EAU BOIS ? ». */
  titre: string;
  /** Ce que ça implique vraiment — surtout : est-ce récupérable ? */
  message?: string;
  /** Le libellé du bouton qui détruit. */
  action?: string;
  /** Une suppression définitive se signale : rouge franc, et on le dit. */
  definitif?: boolean;
  resoudre: (ok: boolean) => void;
}

let ouvrir: ((d: Demande) => void) | null = null;

/**
 * Demande confirmation. À utiliser partout où l'on détruit quelque chose.
 *
 * Si la fenêtre n'est pas montée — un écran isolé, un test —, on retombe sur la boîte
 * du navigateur plutôt que de supprimer sans rien demander.
 */
export function confirmer(d: Omit<Demande, "resoudre">): Promise<boolean> {
  return new Promise((resoudre) => {
    if (!ouvrir) {
      resoudre(window.confirm(`${d.titre}${d.message ? `\n\n${d.message}` : ""}`));
      return;
    }
    ouvrir({ ...d, resoudre });
  });
}

/** Monté une seule fois, à la racine du Hub. */
export default function Confirmation() {
  const [demande, setDemande] = useState<Demande | null>(null);

  useEffect(() => {
    ouvrir = setDemande;
    return () => {
      ouvrir = null;
    };
  }, []);

  useEffect(() => {
    if (!demande) return;
    const auClavier = (e: KeyboardEvent) => {
      // Échap annule : le réflexe de tout le monde, et il va dans le sens prudent.
      if (e.key === "Escape") {
        demande.resoudre(false);
        setDemande(null);
      }
    };
    window.addEventListener("keydown", auClavier);
    return () => window.removeEventListener("keydown", auClavier);
  }, [demande]);

  if (!demande) return null;

  const repondre = (ok: boolean) => {
    demande.resoudre(ok);
    setDemande(null);
  };

  return (
    <div
      onClick={() => repondre(false)}
      className="fixed inset-0 z-[80] flex items-center justify-center bg-avisdoc-ink/55 p-4"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        role="alertdialog"
        aria-modal="true"
        className="animate-scale-in w-full max-w-md rounded-3xl bg-card p-7 shadow-floating"
      >
        <div className="flex gap-3.5">
          <span
            className={
              demande.definitif
                ? "flex size-10 shrink-0 items-center justify-center rounded-full bg-rose-100 text-rose-700"
                : "flex size-10 shrink-0 items-center justify-center rounded-full bg-avisdoc-coral/15 text-avisdoc-coral"
            }
          >
            <AlertTriangle className="size-5" />
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="font-display text-lg font-semibold leading-snug text-avisdoc-ink">{demande.titre}</h2>
            {demande.message && (
              <p className="mt-1.5 text-[13.5px] leading-relaxed text-muted-foreground">{demande.message}</p>
            )}
          </div>
        </div>

        <div className="mt-6 flex flex-wrap justify-end gap-2">
          {/* Annuler d'abord, et c'est lui qui prend le focus : on ne détruit pas par réflexe. */}
          <button
            type="button"
            autoFocus
            onClick={() => repondre(false)}
            className="rounded-full border border-border px-5 py-2.5 text-sm font-bold text-avisdoc-ink transition-colors hover:border-avisdoc-ink"
          >
            Annuler
          </button>
          <button
            type="button"
            onClick={() => repondre(true)}
            className={
              demande.definitif
                ? "rounded-full bg-rose-600 px-5 py-2.5 text-sm font-bold text-white transition-colors hover:bg-rose-700"
                : "ad-btn-accent rounded-full bg-avisdoc-coral px-5 py-2.5 text-sm font-bold text-white"
            }
          >
            {demande.action ?? "Supprimer"}
          </button>
        </div>
      </div>
    </div>
  );
}

/** Le voile d'attente d'une suppression en cours, pour les listes qui en enchaînent plusieurs. */
export function EnCours({ texte }: { texte: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-muted-foreground">
      <Loader2 className="size-3.5 animate-spin" /> {texte}
    </span>
  );
}
