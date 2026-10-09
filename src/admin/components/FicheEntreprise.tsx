// Le cadre commun des fiches : prospect, affaire du Pipeline, client du fichier.
//
// Une entreprise garde la même fiche d'un bout à l'autre du parcours. Ce cadre porte
// tout ce qui ne doit jamais changer : la fenêtre, l'en-tête, l'avancement, les onglets.
// Chaque écran ne fournit que son contenu.
//
// « Il faut une unité de fiches, qu'elle soit dans Prospect, Pipeline ou Client ; mis à
//   part les infos qui grandissent, elle doit se ressembler. On doit aussi plus mettre en
//   avant quand la fiche est approfondie, et ses notes de fiabilité et de qualification. »
//   — Olivier, 09/10. Maquette retenue : « bandeau compact » (C).

import type { ReactNode } from "react";
import { Check, X } from "lucide-react";
import Onglets, { type Onglet } from "./Onglets";
import { Badge } from "./ui";
import { tonNote } from "../lib/merx";
import { tonFiabilite, type EtapeVie, type NotesFiche } from "../lib/fiche";
import { cn } from "@/lib/utils";

const leJour = (iso: string) => new Date(iso).toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" });

/** Un cran au-dessus des pastilles ordinaires : ce sont les repères de la fiche. */
const GRANDE = "px-3 py-1 text-[12.5px]";

/** Qualification, fiabilité, approfondie : à côté du nom, pour qu'on les voie d'abord. */
function Pastilles({ notes }: { notes: NotesFiche | null }) {
  if (!notes || (notes.qualification === null && notes.fiabilite === null && !notes.approfondieLe)) {
    return <Badge className={cn(GRANDE, "bg-muted text-muted-foreground")}>Non évaluée</Badge>;
  }
  return (
    <>
      <Badge className={cn(GRANDE, tonNote(notes.qualification))}>
        <span title="Note de qualification AvisDoc">{notes.qualification ?? "—"} / 100</span>
      </Badge>
      {notes.fiabilite !== null && (
        <Badge className={cn(GRANDE, tonFiabilite(notes.fiabilite))}>
          <span title="Fiabilité des informations de la fiche">Fiabilité {notes.fiabilite} / 10</span>
        </Badge>
      )}
      <Badge className={cn(GRANDE, notes.approfondieLe ? "bg-sky-100 text-avisdoc-teal" : "bg-muted text-muted-foreground")}>
        {notes.approfondieLe ? (
          <span className="inline-flex items-center gap-1">
            <Check className="size-3.5" strokeWidth={3} /> Approfondie le {leJour(notes.approfondieLe)}
          </span>
        ) : (
          "Non approfondie"
        )}
      </Badge>
    </>
  );
}

/** Trouvée → Approfondie → Pipeline → Client, en une barre. L'étape en cours est en gras. */
function Avancement({ etapes }: { etapes: EtapeVie[] }) {
  const enCours = etapes.reduce((acc, e, i) => (e.atteinte ? i : acc), -1);
  return (
    <div className="grid gap-x-1.5 gap-y-1" style={{ gridTemplateColumns: `repeat(${etapes.length}, minmax(0, 1fr))` }}>
      {etapes.map((e) => (
        <div key={`barre-${e.label}`} className={cn("h-1.5 rounded-full", e.atteinte ? "bg-avisdoc-teal" : "bg-border")} />
      ))}
      {etapes.map((e, i) => (
        <div key={`nom-${e.label}`} className="min-w-0">
          <div className={cn("truncate text-[12px]", i === enCours ? "font-bold text-avisdoc-ink" : "text-muted-foreground")}>{e.label}</div>
          {e.au && <div className="text-[11px] text-muted-foreground">{leJour(e.au)}</div>}
        </div>
      ))}
    </div>
  );
}

export default function FicheEntreprise({
  titre,
  sousTitre,
  notes,
  badge,
  referent,
  enHaut,
  identite,
  actions,
  message,
  avancement,
  onglets,
  actif,
  onOnglet,
  onClose,
  children,
}: {
  titre: string;
  sousTitre?: ReactNode;
  /** Qualification, fiabilité, approfondie. `null` : fiche jamais évaluée. */
  notes: NotesFiche | null;
  /** D'autres pastilles à côté des notes : « A répondu », par exemple. */
  badge?: ReactNode;
  /** Qui suit cette entreprise, sur la ligne du sous-titre. */
  referent?: ReactNode;
  /** En haut à droite, avant la croix : Modifier, ou Enregistrer pendant une modification. */
  enHaut?: ReactNode;
  /** Identité officielle (SIREN, adresse), ou le formulaire pendant une modification. */
  identite?: ReactNode;
  actions?: ReactNode;
  /** Sous les actions : un coût annoncé, une erreur. */
  message?: ReactNode;
  avancement: EtapeVie[];
  onglets: Onglet[];
  actif: string;
  onOnglet: (cle: string) => void;
  onClose: () => void;
  children: ReactNode;
}) {
  return (
    <div onClick={onClose} className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-avisdoc-ink/45 p-4 sm:p-6">
      <div onClick={(e) => e.stopPropagation()} className="w-full min-w-0 max-w-5xl rounded-3xl bg-card p-5 shadow-floating sm:p-6">
        <div className="flex items-start gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="font-display text-2xl font-semibold text-avisdoc-ink">{titre}</h2>
              <Pastilles notes={notes} />
              {badge}
            </div>
            {(sousTitre || referent) && (
              <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[13px] text-muted-foreground">
                {sousTitre && <span>{sousTitre}</span>}
                {referent}
              </div>
            )}
          </div>
          {enHaut && <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">{enHaut}</div>}
          <button type="button" onClick={onClose} aria-label="Fermer" className="rounded-lg p-1.5 text-muted-foreground hover:text-avisdoc-ink">
            <X className="size-5" />
          </button>
        </div>

        {identite && <div className="mt-3">{identite}</div>}

        <div className="mt-4">
          <Avancement etapes={avancement} />
        </div>

        {(actions || message) && (
          <div className="mt-4">
            {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
            {message}
          </div>
        )}

        <div className="mt-4 overflow-hidden rounded-2xl border border-border">
          <Onglets onglets={onglets} actif={actif} onChange={onOnglet} />
          <div className="p-4">{children}</div>
        </div>
      </div>
    </div>
  );
}
