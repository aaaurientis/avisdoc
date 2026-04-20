import Header from "@/components/Header";
import Footer from "@/components/Footer";
import PageHero from "@/components/PageHero";
import SEO from "@/components/SEO";
import CollectivitiesSection from "@/components/sections/CollectivitiesSection";
import PressSection from "@/components/sections/PressSection";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";

const Collectivites = () => {
  return (
    <div className="min-h-screen bg-background">
      <SEO
        title="Collectivités · Dépistage en zones sous-médicalisées — AvisDoc"
        description="AvisDoc accompagne les collectivités locales pour organiser des journées de sensibilisation et de dépistage dermatologique, en particulier en zones rurales."
        canonical="/collectivites"
      />
      <Header />
      <main id="main-content">
        <PageHero
          eyebrow="Pour les collectivités"
          breadcrumbs={[{ label: "Accueil", to: "/" }, { label: "Collectivités" }]}
          title={
            <>
              Protéger <span className="italic text-primary">vos administrés</span>, là où l'accès aux soins est le plus difficile.
            </>
          }
          subtitle="Journées de sensibilisation et de dépistage dermatologique, adossées à un réseau de soignants locaux formés par AvisDoc."
        >
          <div className="flex flex-col sm:flex-row gap-3">
            <Button asChild size="lg" className="rounded-full shadow-primary group">
              <a href="/contact">
                Contacter notre équipe
                <ArrowRight className="ml-2 h-4 w-4 group-hover:translate-x-1 transition-transform" />
              </a>
            </Button>
            <Button asChild size="lg" variant="outline" className="rounded-full">
              <a href="#collectivites">Découvrir le dispositif</a>
            </Button>
          </div>
        </PageHero>

        <CollectivitiesSection />
        <PressSection />
      </main>
      <Footer />
    </div>
  );
};

export default Collectivites;
