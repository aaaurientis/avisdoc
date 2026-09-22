// Le cadre commun des fiches : prospect, affaire du Pipeline, client du fichier.
//
// Une entreprise garde la même fiche d'un bout à l'autre du parcours. Ce cadre porte
// tout ce qui ne doit jamais changer : la fenêtre, l'en-tête, le parcours, les onglets.
// Chaque écran ne fournit que son contenu.
//
// Il n'y a qu'un seul parcours affiché : les étapes se cliquent quand l'écran le permet,
// pour qu'aucune autre rangée de boutons n'ait à le répéter.

import type { ReactNode } from "react";
import { X } from "lucide-react";
import Onglets, { type Onglet } from "./Onglets";
import ParcoursFiche, { type EtapeParcours } from "./ParcoursFiche";

export default function FicheEntreprise({
  titre,
  sousTitre,
  badge,
  identite,
  actions,
  message,
  parcours,
  surEtape,
  onglets,
  actif,
  onOnglet,
  onClose,
  children,
}: {
  titre: string;
  sousTitre?: ReactNode;
  /** À droite du titre : la note, l'étape, ce qui qualifie la fiche d'un coup d'œil. */
  badge?: ReactNode;
  /** Identité officielle : SIREN, raison sociale, adresse. */
  identite?: ReactNode;
  actions?: ReactNode;
  /** Sous les actions : un coût annoncé, une erreur. */
  message?: ReactNode;
  parcours: EtapeParcours[];
  /** Si fourni, les étapes du parcours se cliquent. */
  surEtape?: (label: string) => void;
  onglets: Onglet[];
  actif: string;
  onOnglet: (cle: string) => void;
  onClose: () => void;
  children: ReactNode;
}) {
  return (
    <div onClick={onClose} className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-avisdoc-ink/45 p-4 sm:p-6">
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-5xl rounded-3xl bg-card p-5 shadow-floating sm:p-6"
      >
        <div className="flex items-start gap-4 border-b border-border pb-4">
          <div className="min-w-0 flex-1">
            <h2 className="font-display text-2xl font-semibold text-avisdoc-ink">{titre}</h2>
            {sousTitre && <p className="mt-1 text-[13px] text-muted-foreground">{sousTitre}</p>}
          </div>
          {badge}
          <button type="button" onClick={onClose} aria-label="Fermer" className="rounded-lg p-1.5 text-muted-foreground hover:text-avisdoc-ink">
            <X className="size-5" />
          </button>
        </div>

        {(identite || actions || message) && (
          <div className="pt-4">
            {identite}
            {actions && <div className="mt-4 flex flex-wrap items-center gap-2">{actions}</div>}
            {message}
          </div>
        )}

        {parcours.length > 0 && (
          <div className="mt-4">
            <ParcoursFiche etapes={parcours} surEtape={surEtape} />
          </div>
        )}

        <div className="mt-3 overflow-hidden rounded-2xl border border-border">
          <Onglets onglets={onglets} actif={actif} onChange={onOnglet} />
          <div className="p-4">{children}</div>
        </div>
      </div>
    </div>
  );
}
