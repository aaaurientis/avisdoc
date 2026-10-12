// Les pastilles d'une carte : ce qui est prévu sur cette fiche, et pour quand.
//
// Une pastille par action : ce que c'est, en visio ou sur place, le jour et l'heure.
// Orange le jour venu, rouge en retard — on ne doit pas avoir à ouvrir la fiche pour
// savoir qu'un appel attend.

import { CalendarClock, FileText, Linkedin, ListTodo, Mail, MessageSquare, NotebookPen, Phone, Presentation, Store } from "lucide-react";
import { LIEU_RDV, type GenreEchange } from "../lib/echanges";
import type { Prevu } from "../lib/actions-prevues";
import { cn } from "@/lib/utils";

const ICONES: Record<GenreEchange, typeof Phone> = {
  appel: Phone,
  email: Mail,
  rdv: CalendarClock,
  tache: ListTodo,
  note: NotebookPen,
  presentation: Presentation,
  salon: Store,
  sms: MessageSquare,
  linkedin: Linkedin,
  devis: FileText,
};

/** Une couleur par sorte : on reconnaît un appel d'un rendez-vous sans lire. */
const TEINTES: Record<GenreEchange, string> = {
  appel: "bg-avisdoc-teal text-white",
  rdv: "bg-avisdoc-coral text-white",
  email: "bg-violet-500 text-white",
  tache: "bg-amber-500 text-white",
  note: "bg-slate-500 text-white",
  presentation: "bg-sky-600 text-white",
  salon: "bg-emerald-600 text-white",
  sms: "bg-teal-600 text-white",
  linkedin: "bg-blue-600 text-white",
  devis: "bg-indigo-500 text-white",
};

const NOMS: Record<GenreEchange, string> = {
  appel: "appel",
  email: "e-mail",
  rdv: "rendez-vous",
  tache: "à faire",
  note: "note",
  presentation: "présentation",
  salon: "salon",
  sms: "SMS",
  linkedin: "LinkedIn",
  devis: "devis",
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
        const t = new Date(a.au).getTime();
        const retard = t < Date.now();
        const urgent = t <= Date.now() + 86_400_000;
        // Ce que c'est, comment, et quand : « Rendez-vous en visio · 14 oct. à 10:00 ».
        const nom = NOMS[a.kind].charAt(0).toUpperCase() + NOMS[a.kind].slice(1);
        const mode = a.rdvMode ? ` ${LIEU_RDV[a.rdvMode]}` : "";
        return (
          <div
            key={`${a.kind}-${a.au}`}
            className={cn(
              "flex min-w-0 items-center gap-1.5 rounded-full border py-0.5 pl-0.5 pr-2.5",
              retard ? "border-rose-300 bg-rose-50" : "border-border bg-card",
            )}
            title={`${nom}${mode} — ${a.titre}`}
          >
            <span className={cn("inline-flex size-[20px] shrink-0 items-center justify-center rounded-full", TEINTES[a.kind])}>
              <Icone className="size-3" strokeWidth={2.4} />
            </span>
            <span className={cn("truncate text-[11.5px] font-bold", retard ? "text-rose-700" : urgent ? "text-avisdoc-coral" : "text-avisdoc-ink")}>
              {nom}
              {mode} · {leJour(a.au)}
              {retard && " · en retard"}
            </span>
          </div>
        );
      })}
      {reste > 0 && (
        <div className="pl-1 text-[11px] font-semibold text-muted-foreground">
          + {reste} autre{reste > 1 ? "s" : ""}
        </div>
      )}
    </div>
  );
}
