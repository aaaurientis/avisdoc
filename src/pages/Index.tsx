import Header from "@/components/Header";
import Footer from "@/components/Footer";
import HeroSection from "@/components/sections/HeroSection";
import AtAGlanceSection from "@/components/sections/AtAGlanceSection";
import WhyAvisdocSection from "@/components/sections/WhyAvisdocSection";
import EnterprisesSection from "@/components/sections/EnterprisesSection";
import CollectivitiesSection from "@/components/sections/CollectivitiesSection";
import DoctorsSection from "@/components/sections/DoctorsSection";
import TeamSection from "@/components/sections/TeamSection";
import FAQSection from "@/components/sections/FAQSection";
import TestimonialsSection from "@/components/sections/TestimonialsSection";
import TechnologySection from "@/components/sections/TechnologySection";
import PressSection from "@/components/sections/PressSection";
import { useSEO } from "@/lib/seo";
import {
  buildFaqSchema,
  howToDoctorSchema,
  howToEnterpriseSchema,
  medicalServiceSchema,
  organizationSchema,
  websiteSchema,
} from "@/lib/schema";
import { faqs } from "@/components/sections/faq-data";

const Index = () => {
  useSEO({
    title: "AvisDoc · La dermatologie n'attend pas",
    description:
      "Réseau de soins et téléexpertise dermatologique française. Avis d'un dermatologue expert sous 96 h, partout en France — entreprises, collectivités, professionnels de santé.",
    canonical: "/",
    jsonLd: [
      organizationSchema,
      websiteSchema,
      medicalServiceSchema,
      howToEnterpriseSchema,
      howToDoctorSchema,
      buildFaqSchema(faqs),
    ],
  });

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <main id="main-content">
        <HeroSection />
        <AtAGlanceSection />
        <WhyAvisdocSection />
        <TechnologySection />
        <EnterprisesSection />
        <CollectivitiesSection />
        <DoctorsSection />
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
