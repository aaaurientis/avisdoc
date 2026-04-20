import Header from "@/components/Header";
import Footer from "@/components/Footer";
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

const Index = () => {
  return (
    <div className="min-h-screen bg-background">
      <Header />
      <main>
        <HeroSection />
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
