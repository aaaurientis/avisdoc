import Header from "@/components/Header";
import Footer from "@/components/Footer";
import SEO from "@/components/SEO";
import HeroSection from "@/components/sections/HeroSection";
import WhyAvisdocSection from "@/components/sections/WhyAvisdocSection";
import EnterprisesSection from "@/components/sections/EnterprisesSection";
import CollectivitiesSection from "@/components/sections/CollectivitiesSection";
import DoctorsSection from "@/components/sections/DoctorsSection";
import TeamSection from "@/components/sections/TeamSection";
import FAQSection from "@/components/sections/FAQSection";
import TestimonialsSection from "@/components/sections/TestimonialsSection";
import TechnologySection from "@/components/sections/TechnologySection";
import PressSection from "@/components/sections/PressSection";
import SkinABCDESection from "@/components/sections/SkinABCDESection";
import ImpactSection from "@/components/sections/ImpactSection";
import { faqs } from "@/components/sections/faq-data";

const jsonLd = [
  {
    "@context": "https://schema.org",
    "@type": "MedicalOrganization",
    name: "AvisDoc",
    url: "https://www.avisdoc.fr",
    description:
      "AvisDoc est une solution de téléexpertise dermatologique française, créée par des dermatologues, pour un avis d'expert sous 96 heures.",
    medicalSpecialty: "Dermatology",
    address: {
      "@type": "PostalAddress",
      streetAddress: "11, Chaussée de la Muette",
      postalCode: "75016",
      addressLocality: "Paris",
      addressCountry: "FR",
    },
    contactPoint: {
      "@type": "ContactPoint",
      email: "contact@avisdoc.fr",
      contactType: "Customer support",
      areaServed: "FR",
      availableLanguage: ["French"],
    },
    sameAs: ["https://www.linkedin.com/company/avisdoc/"],
  },
  {
    "@context": "https://schema.org",
    "@type": "WebSite",
    url: "https://www.avisdoc.fr",
    name: "AvisDoc",
    inLanguage: "fr-FR",
  },
  {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: faqs.map((f) => ({
      "@type": "Question",
      name: f.question,
      acceptedAnswer: {
        "@type": "Answer",
        text: f.answer,
      },
    })),
  },
];

const Index = () => {
  return (
    <div className="min-h-screen bg-background">
      <SEO
        title="AvisDoc · La dermatologie n'attend pas"
        description="Réseau de soins et téléexpertise dermatologique française. Un avis expert sous 96 heures, partout en France, pour les entreprises, collectivités et professionnels de santé."
        canonical="/"
        jsonLd={jsonLd}
      />
      <Header />
      <main id="main-content">
        <HeroSection />
        <WhyAvisdocSection />
        <TechnologySection />
        <SkinABCDESection />
        <EnterprisesSection />
        <CollectivitiesSection />
        <DoctorsSection />
        <ImpactSection />
        <TeamSection />
        <TestimonialsSection />
        <PressSection />
        <FAQSection />
      </main>
      <Footer />
    </div>
  );
};

export default Index;
