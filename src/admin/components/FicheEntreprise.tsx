// Le cadre commun des fiches : prospect, affaire du Pipeline, client du fichier.
//
// « Reprends exactement la fiche du hub Onetip : la colonne sur le côté avec toutes
//   les informations de la fiche, et les onglets au-dessus — Actions, Dossier, et
//   Devis pour le client. » — Olivier, 12/10.
//
// Une entreprise garde la même fiche d'un bout à l'autre du parcours. À gauche, qui
// elle est et où elle en est ; à droite, ce qu'on fait avec elle. Chaque écran ne
// fournit que son contenu.

import type { ReactNode } from "react";
import { X } from "lucide-react";
import { tonNote } from "../lib/merx";
import { tonFiabilite, type NotesFiche } from "../lib/fiche";
import { cn } from "@/lib/utils";

export interface OngletFiche {
  cle: string;
  label: string;
  /** Une étoile sur le coin de l'onglet : le dossier a été approfondi par Merx. */
  etoile?: boolean;
}

/** Un titre de bloc dans la colonne. */
export function TitreColonne({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("mb-1.5 mt-5 text-[13px] font-bold text-avisdoc-ink", className)}>{children}</div>;
}

/** Qualification et fiabilité, deux tuiles côte à côte. */
export function Notation({ notes }: { notes: NotesFiche | null }) {
  const q = notes?.qualification ?? null;
  const f = notes?.fiabilite ?? null;
  return (
    <div className="flex gap-2">
      <div className="flex-1 rounded-xl bg-card px-3 py-2" title="Note de qualification AvisDoc (détail dans Dossier)">
        <div className={cn("inline-block rounded-md px-1.5 text-[20px] font-bold leading-tight", q !== null && tonNote(q))}>
          {q ?? "—"}
          <span className="text-[12px] font-semibold opacity-70"> /100</span>
        </div>
        <div className="mt-0.5 text-[11.5px] text-muted-foreground">Qualification</div>
      </div>
      <div className="flex-1 rounded-xl bg-card px-3 py-2" title="Fiabilité des informations de la fiche (détail dans Dossier)">
        <div className={cn("inline-block rounded-md px-1.5 text-[20px] font-bold leading-tight", f !== null && tonFiabilite(f))}>
          {f ?? "—"}
          <span className="text-[12px] font-semibold opacity-70"> /10</span>
        </div>
        <div className="mt-0.5 text-[11.5px] text-muted-foreground">Fiabilité de la fiche</div>
      </div>
    </div>
  );
}

export default function FicheEntreprise({
  colonne,
  onglets,
  actif,
  onOnglet,
  enHaut,
  message,
  onClose,
  children,
}: {
  /** La colonne de gauche : qui est l'entreprise, où elle en est, qui la suit. */
  colonne: ReactNode;
  onglets: OngletFiche[];
  actif: string;
  onOnglet: (cle: string) => void;
  /** À droite des onglets, avant la croix : « Modifier la fiche ». */
  enHaut?: ReactNode;
  /** Sous les onglets : une erreur. */
  message?: ReactNode;
  onClose: () => void;
  children: ReactNode;
}) {
  return (
    <div onClick={onClose} role="dialog" aria-modal="true" className="fixed inset-0 z-50 flex items-stretch justify-center bg-avisdoc-ink/45 p-2 sm:p-3.5">
      <div
        onClick={(e) => e.stopPropagation()}
        className="flex h-full w-full max-w-[1440px] flex-col overflow-y-auto rounded-3xl bg-card shadow-floating md:grid md:grid-cols-[360px_minmax(0,1fr)] md:overflow-hidden"
      >
        {/* ── À gauche : l'entreprise ── */}
        <div className="relative bg-muted/60 px-5 pb-6 pt-5 md:min-h-0 md:overflow-y-auto">
          {/* Sur téléphone, la croix des onglets est loin en bas : on en remet une ici. */}
          <button
            type="button"
            onClick={onClose}
            aria-label="Fermer"
            className="absolute right-3 top-3 inline-flex size-8 items-center justify-center rounded-full border border-border bg-card text-muted-foreground md:hidden"
          >
            <X className="size-4" />
          </button>
          {colonne}
        </div>

        {/* ── À droite : les onglets ── */}
        <div className="flex min-h-0 flex-col">
          <div className="flex flex-none flex-wrap items-center gap-1.5 border-b border-border px-4 pb-3 pt-4 sm:px-6">
            {onglets.map((o) => (
              <button
                key={o.cle}
                type="button"
                role="tab"
                aria-selected={o.cle === actif}
                onClick={() => onOnglet(o.cle)}
                title={o.etoile ? "Dossier approfondi par Merx" : undefined}
                className={cn(
                  "relative h-9 rounded-full px-4 text-[13.5px] font-semibold transition-colors",
                  o.cle === actif ? "bg-avisdoc-teal text-white" : "text-muted-foreground hover:bg-muted hover:text-avisdoc-ink",
                )}
              >
                {o.label}
                {o.etoile && (
                  <span
                    aria-label="Approfondi par Merx"
                    className="absolute -right-2 -top-2 inline-flex size-[22px] items-center justify-center rounded-full bg-avisdoc-teal text-[13px] leading-none text-white ring-2 ring-card"
                  >
                    ✦
                  </span>
                )}
              </button>
            ))}
            <div className="flex-1" />
            {enHaut}
            <button
              type="button"
              onClick={onClose}
              aria-label="Fermer"
              className="inline-flex size-8 items-center justify-center rounded-full border border-border text-muted-foreground hover:text-avisdoc-ink"
            >
              <X className="size-4" />
            </button>
          </div>
          {message && <div className="flex-none px-4 pt-2 sm:px-6">{message}</div>}
          <div className="px-4 pb-6 pt-5 sm:px-6 md:min-h-0 md:flex-1 md:overflow-y-auto">{children}</div>
        </div>
      </div>
    </div>
  );
}
