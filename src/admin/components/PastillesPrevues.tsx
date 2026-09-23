// Les pastilles d'une carte : ce qui est prévu sur cette fiche, et pour quand.
//
// Discrètes tant que l'échéance est loin, elles passent en orange le jour venu —
// on ne doit pas avoir à ouvrir la fiche pour savoir qu'un appel attend.

import { CalendarClock, ListTodo, Mail, NotebookPen, Phone } from "lucide-react";
import type { GenreEchange } from "../lib/echanges";
import type { Prevu } from "../lib/actions-prevues";
import { cn } from "@/lib/utils";

const ICONES: Record<GenreEchange, typeof Phone> = {
  appel: Phone,
  email: Mail,
  rdv: CalendarClock,
  tache: ListTodo,
  note: NotebookPen,
};

/** Une couleur par sorte : on reconnaît un appel d'un rendez-vous sans lire. */
const TEINTES: Record<GenreEchange, string> = {
  appel: "bg-avisdoc-teal text-white",
  rdv: "bg-avisdoc-coral text-white",
  email: "bg-violet-500 text-white",
  tache: "bg-amber-500 text-white",
  note: "bg-slate-500 text-white",
};

const NOMS: Record<GenreEchange, string> = {
  appel: "appel",
  email: "e-mail",
  rdv: "rendez-vous",
  tache: "à faire",
  note: "note",
};

const leJour = (iso: string) =>
  new Date(iso).toLocaleDateString("fr-FR", { day: "numeric", month: "short" }) +
  " à " +
  new Date(iso).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });

/** Au plus trois lignes sur une carte : au-delà, on renvoie à la fiche. */
const LIGNES_MAX = 3;

export default function PastillesPrevues({ prevu }: { prevu?: Prevu }) {
  if (!prevu || prevu.actions.length === 0) return null;

  const visibles = prevu.actions.slice(0, LIGNES_MAX);
  const reste = prevu.actions.length - visibles.length;

  return (
    // Une ligne par action : le pictogramme, puis SA date. Deux actions n'ont pas
    // la même échéance, et les confondre revient à n'en montrer aucune.
    <div className="mt-2 space-y-1">
      {visibles.map((a) => {
        const Icone = ICONES[a.kind];
        const urgent = new Date(a.au).getTime() <= Date.now() + 86_400_000;
        return (
          <div key={`${a.kind}-${a.au}`} className="flex items-center gap-2" title={`${NOMS[a.kind]} — ${a.titre}`}>
            <span className={cn("inline-flex size-[22px] shrink-0 items-center justify-center rounded-full shadow-sm", TEINTES[a.kind])}>
              <Icone className="size-3.5" strokeWidth={2.4} />
            </span>
            <span className={cn("truncate text-[12px] font-bold", urgent ? "text-avisdoc-coral" : "text-avisdoc-ink")}>
              {leJour(a.au)}
            </span>
          </div>
        );
      })}
      {reste > 0 && (
        <div className="pl-[30px] text-[11px] font-semibold text-muted-foreground">
          + {reste} autre{reste > 1 ? "s" : ""}
        </div>
      )}
    </div>
  );
}
