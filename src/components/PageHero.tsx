import { ReactNode } from "react";
import { Link } from "react-router-dom";
import { ChevronRight } from "lucide-react";

interface Crumb {
  label: string;
  to?: string;
}

interface PageHeroProps {
  eyebrow?: string;
  title: ReactNode;
  subtitle?: string;
  breadcrumbs?: Crumb[];
  children?: ReactNode;
  tone?: "default" | "ink";
}

const PageHero = ({ eyebrow, title, subtitle, breadcrumbs, children, tone = "default" }: PageHeroProps) => {
  const isInk = tone === "ink";

  return (
    <section
      className={`relative overflow-hidden pt-32 md:pt-40 pb-14 md:pb-20 ${
        isInk ? "bg-avisdoc-ink text-white" : "surface-hero"
      }`}
    >
      <div
        aria-hidden
        className={`absolute -top-24 -right-24 w-[460px] h-[460px] rounded-full blur-[160px] ${
          isInk ? "bg-primary/25" : "bg-primary/10"
        }`}
      />
      <div
        aria-hidden
        className={`absolute bottom-0 left-0 w-[360px] h-[360px] rounded-full blur-[160px] ${
          isInk ? "bg-avisdoc-coral/25" : "bg-avisdoc-coral/10"
        }`}
      />
      {!isInk && <div aria-hidden className="absolute inset-0 pattern-grid opacity-40" />}

      <div className="relative section-container">
        {breadcrumbs && breadcrumbs.length > 0 && (
          <nav aria-label="Fil d'Ariane" className="mb-6">
            <ol className={`flex flex-wrap items-center gap-1.5 text-xs ${isInk ? "text-white/70" : "text-muted-foreground"}`}>
              {breadcrumbs.map((b, i) => (
                <li key={b.label} className="flex items-center gap-1.5">
                  {b.to ? (
                    <Link to={b.to} className={`hover:${isInk ? "text-white" : "text-primary"} transition-colors`}>
                      {b.label}
                    </Link>
                  ) : (
                    <span className={isInk ? "text-white" : "text-foreground"}>{b.label}</span>
                  )}
                  {i < breadcrumbs.length - 1 && <ChevronRight className="h-3 w-3 opacity-60" />}
                </li>
              ))}
            </ol>
          </nav>
        )}

        <div className="max-w-3xl">
          {eyebrow && (
            <span className={`eyebrow ${isInk ? "text-avisdoc-coral" : "text-primary"}`}>{eyebrow}</span>
          )}
          <h1
            className={`font-display text-3xl md:text-5xl lg:text-6xl font-semibold mt-5 mb-5 leading-[1.05] ${
              isInk ? "text-white" : "text-avisdoc-ink"
            }`}
          >
            {title}
          </h1>
          {subtitle && (
            <p className={`text-base md:text-lg leading-relaxed ${isInk ? "text-white/75" : "text-muted-foreground"}`}>
              {subtitle}
            </p>
          )}
          {children && <div className="mt-8">{children}</div>}
        </div>
      </div>
    </section>
  );
};

export default PageHero;
