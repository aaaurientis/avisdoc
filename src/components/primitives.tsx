import { HTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/utils";

/** Libellé "suivre-le-trait" au-dessus des titres de section. */
export const Eyebrow = ({
  className,
  children,
  ...props
}: HTMLAttributes<HTMLSpanElement>) => (
  <span
    className={cn(
      "eyebrow text-primary",
      className
    )}
    {...props}
  >
    {children}
  </span>
);

/** Badge arrondi avec icône optionnelle. */
export const Chip = ({
  className,
  children,
  ...props
}: HTMLAttributes<HTMLSpanElement>) => (
  <span
    className={cn(
      "inline-flex items-center gap-2 rounded-full px-3.5 py-1.5 text-xs font-semibold tracking-wide",
      className
    )}
    {...props}
  >
    {children}
  </span>
);

interface SectionHeaderProps {
  eyebrow?: string;
  title: ReactNode;
  description?: ReactNode;
  align?: "center" | "left";
  tone?: "ink" | "default";
  eyebrowClassName?: string;
  className?: string;
}

/** En-tête de section standard : eyebrow + h2 + description. */
export const SectionHeader = ({
  eyebrow,
  title,
  description,
  align = "center",
  tone = "default",
  eyebrowClassName,
  className,
}: SectionHeaderProps) => (
  <div
    className={cn(
      "max-w-3xl mb-14",
      align === "center" && "mx-auto text-center",
      className
    )}
  >
    {eyebrow && (
      <Eyebrow
        className={cn(
          tone === "ink" ? "text-avisdoc-coral" : "text-primary",
          eyebrowClassName
        )}
      >
        {eyebrow}
      </Eyebrow>
    )}
    <h2
      className={cn(
        "font-display text-3xl md:text-5xl font-semibold mt-5 mb-5 leading-[1.08]",
        tone === "ink" ? "text-white" : "text-avisdoc-ink"
      )}
    >
      {title}
    </h2>
    {description && (
      <p
        className={cn(
          "text-base md:text-lg leading-relaxed",
          tone === "ink" ? "text-white/70" : "text-muted-foreground"
        )}
      >
        {description}
      </p>
    )}
  </div>
);

interface SectionProps extends HTMLAttributes<HTMLElement> {
  surface?: "default" | "mist" | "ink" | "hero";
}

/** Section standard : gère le padding, le container et le fond. */
export const Section = ({
  surface = "default",
  className,
  children,
  ...props
}: SectionProps) => {
  const surfaceClass = {
    default: "bg-background",
    mist: "surface-mist",
    ink: "bg-avisdoc-ink text-white",
    hero: "surface-hero",
  }[surface];

  return (
    <section
      className={cn("section-padding relative overflow-hidden", surfaceClass, className)}
      {...props}
    >
      <div className="section-container relative">{children}</div>
    </section>
  );
};
