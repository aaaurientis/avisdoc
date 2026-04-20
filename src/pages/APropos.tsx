import Header from "@/components/Header";
import Footer from "@/components/Footer";
import PageHero from "@/components/PageHero";
import SEO from "@/components/SEO";
import TeamSection from "@/components/sections/TeamSection";
import ImpactSection from "@/components/sections/ImpactSection";

const APropos = () => {
  return (
    <div className="min-h-screen bg-background">
      <SEO
        title="À propos · AvisDoc, la dermatologie n'attend pas"
        description="AvisDoc a été créée en 2022 par des dermatologues pour pallier la pénurie de spécialistes. Découvrez notre équipe, notre comité scientifique et notre impact."
        canonical="/a-propos"
      />
      <Header />
      <main id="main-content">
        <PageHero
          eyebrow="Qui sommes-nous ?"
          breadcrumbs={[{ label: "Accueil", to: "/" }, { label: "À propos" }]}
          title={
            <>
              Des professionnels de santé <span className="italic text-primary">engagés et mobilisés.</span>
            </>
          }
          subtitle="Créée en 2022 par des dermatologues pour que l'accès à un avis spécialisé ne soit plus une question de chance ou de géographie."
        />

        <TeamSection />
        <ImpactSection />
      </main>
      <Footer />
    </div>
  );
};

export default APropos;
