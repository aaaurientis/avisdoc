import { ReactNode } from "react";
import Header from "./Header";
import Footer from "./Footer";
import { useSEO } from "@/lib/seo";

interface LegalLayoutProps {
  eyebrow: string;
  title: string;
  subtitle?: string;
  /** Meta description courte (≈150 car.) pour SEO/partage. */
  metaDescription?: string;
  /** Chemin canonique du document (ex : "/cgu"). */
  canonicalPath?: string;
  children: ReactNode;
}

const LegalLayout = ({
  eyebrow,
  title,
  subtitle,
  metaDescription,
  canonicalPath,
  children,
}: LegalLayoutProps) => {
  useSEO({
    title: `${title} · AvisDoc`,
    description:
      metaDescription ??
      `${title} — AvisDoc, téléexpertise dermatologique française.`,
    canonical: canonicalPath,
    robots: "index,follow",
  });

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <main id="main-content">
        <section className="relative overflow-hidden pt-32 md:pt-40 pb-12 md:pb-16 surface-hero">
          <div aria-hidden className="absolute -top-24 -right-24 w-[460px] h-[460px] rounded-full bg-primary/10 blur-[160px]" />
          <div aria-hidden className="absolute inset-0 pattern-grid opacity-40" />
          <div className="relative section-container">
            <div className="max-w-3xl">
              <span className="eyebrow text-primary">{eyebrow}</span>
              <h1 className="font-display text-3xl md:text-5xl font-semibold text-avisdoc-ink mt-5 mb-4 leading-[1.1]">
                {title}
              </h1>
              {subtitle && <p className="text-muted-foreground text-base md:text-lg">{subtitle}</p>}
            </div>
          </div>
        </section>

        <section className="py-12 md:py-20">
          <div className="section-container">
            <div className="max-w-3xl mx-auto bg-card rounded-[2rem] border border-border/60 shadow-soft p-6 sm:p-10 md:p-12">
              <div className="legal-prose text-muted-foreground leading-relaxed space-y-10">
                {children}
              </div>
            </div>
          </div>
        </section>
      </main>
      <Footer />
    </div>
  );
};

export default LegalLayout;
