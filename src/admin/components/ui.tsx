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
    <div className="mb-6 flex items-end justify-between gap-4">
      <div>
        <h1 className="font-display text-3xl font-semibold text-avisdoc-ink">
          {title}
        </h1>
        {subtitle && (
          <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>
        )}
      </div>
      {action}
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
      className="fixed inset-0 z-50 flex items-center justify-center bg-avisdoc-ink/45 p-4"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{ width, maxWidth: "100%" }}
        className="animate-scale-in rounded-3xl bg-card p-8 shadow-floating"
      >
        {children}
      </div>
    </div>
  );
}
