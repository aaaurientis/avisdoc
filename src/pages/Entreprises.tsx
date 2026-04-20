import Header from "@/components/Header";
import Footer from "@/components/Footer";
import PageHero from "@/components/PageHero";
import SEO from "@/components/SEO";
import EnterprisesSection from "@/components/sections/EnterprisesSection";
import TestimonialsSection from "@/components/sections/TestimonialsSection";
import FAQSection from "@/components/sections/FAQSection";
import { ArrowRight, Building2 } from "lucide-react";
import { Button } from "@/components/ui/button";

const Entreprises = () => {
  return (
    <div className="min-h-screen bg-background">
      <SEO
        title="Entreprises · Dépistage dermatologique sur site — AvisDoc"
        description="Offrez à vos collaborateurs un programme de dépistage des cancers de la peau clé en main, encadré par des dermatologues français. Avis d'experts sous 4 jours ouvrés."
        canonical="/entreprises"
      />
      <Header />
      <main id="main-content">
        <PageHero
          eyebrow="Pour les entreprises"
          breadcrumbs={[{ label: "Accueil", to: "/" }, { label: "Entreprises" }]}
          title={
            <>
              Un dépistage dermatologique <span className="italic text-primary">clé en main</span> pour vos équipes.
            </>
          }
          subtitle="Un programme encadré par des dermatologues français, sur site ou en ligne, pour protéger la santé cutanée de vos collaborateurs."
        >
          <div className="flex flex-col sm:flex-row gap-3">
            <Button asChild size="lg" className="rounded-full shadow-primary group">
              <a href="/contact">
                Demander une présentation
                <ArrowRight className="ml-2 h-4 w-4 group-hover:translate-x-1 transition-transform" />
              </a>
            </Button>
            <Button asChild size="lg" variant="outline" className="rounded-full">
              <a href="#entreprises">
                <Building2 className="mr-2 h-4 w-4" />
                Voir le programme
              </a>
            </Button>
          </div>
        </PageHero>

        <EnterprisesSection />
        <TestimonialsSection />
        <FAQSection />
      </main>
      <Footer />
    </div>
  );
};

export default Entreprises;
