import { Link } from "react-router-dom";
import { ArrowLeft, Stethoscope } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useSEO } from "@/lib/seo";

const NotFound = () => {
  useSEO({
    title: "Page introuvable · AvisDoc",
    description:
      "Cette page n'existe pas. Retournez à l'accueil pour découvrir la téléexpertise dermatologique AvisDoc.",
    robots: "noindex,follow",
  });

  return (
    <main id="main-content" className="relative min-h-screen flex items-center justify-center surface-hero overflow-hidden">
      <div aria-hidden className="absolute -top-32 -left-24 w-[520px] h-[520px] rounded-full bg-primary/10 blur-[160px]" />
      <div aria-hidden className="absolute top-1/3 -right-32 w-[460px] h-[460px] rounded-full bg-avisdoc-coral/20 blur-[160px]" />
      <div aria-hidden className="absolute inset-0 pattern-grid opacity-40" />

      <div className="relative section-container text-center max-w-xl">
        <span className="chip bg-white border border-border/60 text-primary mb-6 shadow-soft">
          <Stethoscope className="h-3.5 w-3.5" />
          Page introuvable
        </span>
        <h1 className="font-display text-6xl md:text-8xl font-semibold text-avisdoc-ink mb-4 leading-none">
          404
        </h1>
        <p className="text-muted-foreground text-lg mb-10">
          Cette page n'existe pas ou a été déplacée. Pas d'inquiétude — la dermatologie
          continue de ne pas attendre.
        </p>
        <Button asChild size="lg" className="rounded-full shadow-primary group">
          <Link to="/">
            <ArrowLeft className="mr-2 h-4 w-4 group-hover:-translate-x-1 transition-transform" />
            Retour à l'accueil
          </Link>
        </Button>
      </div>
    </main>
  );
};

export default NotFound;
