// Petites primitives UI du back-office, habillées au design system du site
// vitrine (tokens avisdoc-*, Fraunces pour les titres, Inter pour le corps).

import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/** Avatar rond à initiales. */
export function Avatar({
  initials,
  className,
  size = 34,
}: {
  initials: string;
  className?: string;
  size?: number;
}) {
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-full font-bold",
        className ?? "bg-avisdoc-ink text-white",
      )}
      style={{ width: size, height: size, fontSize: Math.round(size * 0.36) }}
    >
      {initials}
    </span>
  );
}

/** Pastille / badge coloré (type, statut, étape…). */
export function Badge({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center whitespace-nowrap rounded-full px-2.5 py-1 text-[11px] font-bold",
        className,
      )}
    >
      {children}
    </span>
  );
}

/** Carte de contenu. */
export function Card({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "rounded-2xl border border-border bg-card shadow-soft",
        className,
      )}
    >
      {children}
    </div>
  );
}

/** Libellé de section (uppercase, discret). */
export function SectionLabel({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "text-[11px] font-bold uppercase tracking-[0.06em] text-muted-foreground",
        className,
      )}
    >
      {children}
    </div>
  );
}

/** En-tête de page : titre Fraunces + sous-titre + action à droite. */
export function PageHeader({
  title,
  subtitle,
  action,
}: {
  title: string;
  subtitle?: string;
  action?: ReactNode;
}) {
  return (
    // Sur téléphone, titre et action s'empilent : côte à côte, le bouton écrasait le
    // sous-titre sur trois lignes et mordait dessus.
    <div className="mb-5 flex flex-col gap-3 sm:mb-6 sm:flex-row sm:items-end sm:justify-between sm:gap-4">
      <div className="min-w-0">
        <h1 className="font-display text-2xl font-semibold text-avisdoc-ink sm:text-3xl">
          {title}
        </h1>
        {subtitle && (
          <p className="mt-1 text-[13px] text-muted-foreground sm:text-sm">{subtitle}</p>
        )}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}

/** Modale centrée avec overlay. */
export function Modal({
  onClose,
  children,
  width = 480,
}: {
  onClose: () => void;
  children: ReactNode;
  width?: number;
}) {
  return (
    <div
      onClick={onClose}
      // Au-dessus d'une fiche (z-50) : un brouillon ouvert depuis une fiche doit passer
      // devant elle, pas se cacher derrière.
      //
      // Le défilement est porté par CE conteneur, et l'alignement part du haut : une
      // fenêtre plus haute que l'écran était centrée, donc coupée en haut ET en bas,
      // et l'on ne pouvait plus atteindre les boutons. Sur un téléphone, on se
      // retrouvait enfermé dans le formulaire.
      className="fixed inset-0 z-[70] flex items-start justify-center overflow-y-auto overscroll-contain bg-avisdoc-ink/45 p-4 sm:items-center"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{ width, maxWidth: "100%" }}
        className="animate-scale-in my-auto rounded-3xl bg-card p-5 shadow-floating sm:p-8"
      >
        {children}
      </div>
    </div>
  );
}
