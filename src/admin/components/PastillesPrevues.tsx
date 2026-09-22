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
    <div className="mt-2 flex flex-wrap items-center gap-1">
      {genres.map(([genre, n]) => {
        const Icone = ICONES[genre];
        return (
          <span
            key={genre}
            title={`${n} ${NOMS[genre]}${n > 1 ? "s" : ""} à venir${prevu.prochain ? ` — le ${leJour(prevu.prochain)}` : ""}`}
            className={cn(
              "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10.5px] font-bold",
              urgent ? "bg-avisdoc-coral/15 text-avisdoc-coral" : "bg-muted text-muted-foreground",
            )}
          >
            <Icone className="size-3" />
            {n > 1 ? n : ""}
          </span>
        );
      })}
      {prevu.prochain && (
        <span className={cn("text-[10.5px] font-semibold", urgent ? "text-avisdoc-coral" : "text-muted-foreground")}>
          {leJour(prevu.prochain)}
        </span>
      )}
    </div>
  );
}
