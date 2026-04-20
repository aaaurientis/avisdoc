import Header from "@/components/Header";
import Footer from "@/components/Footer";
import PageHero from "@/components/PageHero";
import SEO from "@/components/SEO";
import DoctorsSection from "@/components/sections/DoctorsSection";
import TechnologySection from "@/components/sections/TechnologySection";
import SkinABCDESection from "@/components/sections/SkinABCDESection";
import { ArrowRight, LogIn } from "lucide-react";
import { Button } from "@/components/ui/button";

const Professionnels = () => {
  return (
    <div className="min-h-screen bg-background">
      <SEO
        title="Professionnels de santé · Téléexpertise dermatologique — AvisDoc"
        description="Obtenez un avis dermatologique spécialisé sous 96 heures. Plateforme HDS, conçue avec des dermatologues français pour les médecins généralistes, infirmier·e·s et spécialistes."
        canonical="/professionnels"
      />
      <Header />
      <main id="main-content">
        <PageHero
          eyebrow="Pour les professionnels de santé"
          breadcrumbs={[{ label: "Accueil", to: "/" }, { label: "Professionnels de santé" }]}
          title={
            <>
              Un avis dermatologique expert en <span className="italic text-primary">96 heures.</span>
            </>
          }
          subtitle="Téléexpertise dermatologique sécurisée : transmettez votre cas, recevez un avis complet sous 4 jours ouvrés, appuyez-vous sur un réseau d'environ 20 dermatologues experts."
        >
          <div className="flex flex-col sm:flex-row gap-3">
            <Button asChild size="lg" className="rounded-full shadow-primary group">
              <a href="https://app.avisdoc.fr/register" target="_blank" rel="noopener noreferrer">
                Je m'inscris
                <ArrowRight className="ml-2 h-4 w-4 group-hover:translate-x-1 transition-transform" />
              </a>
            </Button>
            <Button asChild size="lg" variant="outline" className="rounded-full">
              <a href="https://app.avisdoc.fr/login/" target="_blank" rel="noopener noreferrer">
                <LogIn className="mr-2 h-4 w-4" />
                Connexion
              </a>
            </Button>
          </div>
        </PageHero>

        <DoctorsSection />
        <TechnologySection />
        <SkinABCDESection />
      </main>
      <Footer />
    </div>
  );
};

export default Professionnels;
