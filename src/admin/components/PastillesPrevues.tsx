// Les pastilles d'une carte : ce qui est prévu sur cette fiche, et pour quand.
//
// Discrètes tant que l'échéance est loin, elles passent en orange le jour venu —
// on ne doit pas avoir à ouvrir la fiche pour savoir qu'un appel attend.

import { CalendarClock, Mail, NotebookPen, Phone } from "lucide-react";
import type { GenreEchange } from "../lib/echanges";
import type { Prevu } from "../lib/actions-prevues";
import { cn } from "@/lib/utils";

const ICONES: Record<GenreEchange, typeof Phone> = {
  appel: Phone,
  email: Mail,
  rdv: CalendarClock,
  note: NotebookPen,
};

/** Une couleur par sorte : on reconnaît un appel d'un rendez-vous sans lire. */
const TEINTES: Record<GenreEchange, string> = {
  appel: "bg-avisdoc-teal text-white",
  rdv: "bg-avisdoc-coral text-white",
  email: "bg-violet-500 text-white",
  note: "bg-slate-500 text-white",
};

const NOMS: Record<GenreEchange, string> = {
  appel: "appel",
  email: "e-mail",
  rdv: "rendez-vous",
  note: "note",
};

const leJour = (iso: string) =>
  new Date(iso).toLocaleDateString("fr-FR", { day: "numeric", month: "short" }) +
  " à " +
  new Date(iso).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });

export default function PastillesPrevues({ prevu }: { prevu?: Prevu }) {
  if (!prevu) return null;
  const genres = Object.entries(prevu.parGenre) as [GenreEchange, number][];
  if (genres.length === 0) return null;

  // Aujourd'hui ou avant : c'est maintenant que ça se joue.
  const urgent = prevu.prochain ? new Date(prevu.prochain).getTime() <= Date.now() + 86_400_000 : false;

  return (
    <div className="mt-2 flex items-center justify-end gap-1.5">
      {prevu.prochain && (
        <span
          className={cn(
            "rounded-full px-2 py-0.5 text-[11px] font-bold",
            urgent ? "bg-avisdoc-coral/15 text-avisdoc-coral" : "bg-muted text-avisdoc-ink",
          )}
        >
          {leJour(prevu.prochain)}
        </span>
      )}
      {genres.map(([genre, n]) => {
        const Icone = ICONES[genre];
        return (
          <span
            key={genre}
            title={`${n} ${NOMS[genre]}${n > 1 ? "s" : ""} à venir${prevu.prochain ? ` — le ${leJour(prevu.prochain)}` : ""}`}
            className={cn(
              "inline-flex size-[22px] items-center justify-center rounded-full shadow-sm",
              TEINTES[genre],
              urgent && "ring-2 ring-avisdoc-coral/30",
            )}
          >
            {n > 1 ? <span className="text-[11px] font-bold">{n}</span> : <Icone className="size-3.5" strokeWidth={2.4} />}
          </span>
        );
      })}
    </div>
  );
}
