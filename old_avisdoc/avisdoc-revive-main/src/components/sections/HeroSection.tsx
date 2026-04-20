import { ArrowRight, Building2, Landmark, Stethoscope } from "lucide-react";
import { Button } from "@/components/ui/button";
import avisdocLogo from "@/assets/avisdoc-logo.png";
import heroBg from "@/assets/hero-bg.jpg";

const HeroSection = () => {
  const offers = [
    {
      icon: Building2,
      label: "Entreprises",
      desc: "Dépistage sur site pour vos collaborateurs",
      href: "#entreprises",
    },
    {
      icon: Landmark,
      label: "Collectivités",
      desc: "Accès aux soins sur votre territoire",
      href: "#collectivites",
    },
    {
      icon: Stethoscope,
      label: "Professionnels de santé",
      desc: "Téléexpertise en médecine de ville",
      href: "#medecins",
    },
  ];

  return (
    <section className="relative min-h-screen flex items-center pt-20 overflow-hidden bg-avisdoc-navy">
      {/* Background */}
      <div className="absolute inset-0">
        <img src={heroBg} alt="" className="w-full h-full object-cover" />
        <div className="absolute inset-0 bg-avisdoc-navy/80" />
      </div>
      <div className="absolute top-1/3 right-1/4 w-[500px] h-[500px] bg-primary/8 rounded-full blur-[120px]" />
      <div className="absolute bottom-1/4 left-1/4 w-[400px] h-[400px] bg-secondary/8 rounded-full blur-[100px]" />

      <div className="section-container relative z-10 py-6">
        {/* Logo + Title */}
        <div className="flex flex-col items-center gap-4 mb-8 max-w-4xl mx-auto animate-fade-in">
          <div className="bg-white/15 backdrop-blur-md rounded-2xl p-5 inline-block shadow-lg shadow-white/5">
            <img src={avisdocLogo} alt="Avisdoc" className="h-14 md:h-20 w-auto" />
          </div>
          <h1 className="font-display text-2xl md:text-3xl lg:text-4xl font-bold text-white leading-tight text-center max-w-3xl">
            AvisDoc est une solution de télé-expertise, créée par des dermatologues.<br />Elle propose un réseau de soins en dermatologie qui permet de prendre en charge rapidement toute lésion cutanée.
          </h1>
          <p className="font-display text-xl md:text-2xl lg:text-3xl font-semibold text-secondary text-center">
            La dermatologie n'attend pas.
          </p>
        </div>

        <div className="text-center max-w-4xl mx-auto mb-8">

          <div className="flex flex-col sm:flex-row items-center justify-center gap-3 mb-4 animate-slide-up" style={{ animationDelay: "0.1s" }}>
            <Button size="default" asChild className="group text-sm px-6">
              <a href="#pourquoi">
                Découvrir AvisDoc
                <ArrowRight className="ml-2 h-4 w-4 group-hover:translate-x-1 transition-transform" />
              </a>
            </Button>
            <Button size="default" variant="secondary" asChild className="group text-sm px-6">
              <a href="mailto:contact@avisdoc.fr">
                Nous contacter
              </a>
            </Button>
          </div>

          <div className="bg-primary/20 backdrop-blur-sm border border-primary/30 rounded-xl px-6 py-4 max-w-2xl mx-auto mb-4 animate-slide-up" style={{ animationDelay: "0.2s" }}>
            <p className="text-lg md:text-xl text-white font-bold text-center">
              Aujourd'hui, AvisDoc se concentre sur le dépistage des cancers de la peau, mélanomes et carcinomes.
            </p>
          </div>
        </div>

        {/* 3 Offers cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 max-w-4xl mx-auto mb-6 animate-slide-up" style={{ animationDelay: "0.3s" }}>
          {offers.map((offer) => (
            <a
              key={offer.label}
              href={offer.href}
              className="group relative bg-white/10 backdrop-blur-md border-2 border-white/20 rounded-2xl p-7 hover:bg-white/20 hover:border-primary/50 transition-all duration-300 hover:-translate-y-2 hover:shadow-xl hover:shadow-primary/10 block text-center"
            >
              <div className="w-14 h-14 rounded-2xl bg-primary/20 flex items-center justify-center mx-auto mb-4">
                <offer.icon className="h-7 w-7 text-primary" />
              </div>
              <h3 className="font-display text-lg font-bold text-white mb-2">
                {offer.label}
              </h3>
              <p className="text-white/70 text-sm mb-3">
                {offer.desc}
              </p>
              <span className="inline-flex items-center text-secondary text-sm font-semibold group-hover:underline">
                En savoir plus
                <ArrowRight className="ml-1 h-4 w-4 group-hover:translate-x-1 transition-transform" />
              </span>
            </a>
          ))}
        </div>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-4 pt-5 border-t border-white/10 animate-fade-in" style={{ animationDelay: "0.4s" }}>
          {[
            { value: "8 000+", label: "Avis d'experts délivrés" },
            { value: "20", label: "Dermatologues experts" },
            { value: "96h", label: "Délai de réponse moyen" },
          ].map((stat) => (
            <div key={stat.label} className="text-center">
              <div className="font-display text-xl md:text-2xl font-bold text-primary mb-0.5">
                {stat.value}
              </div>
              <div className="text-[10px] text-white/40">{stat.label}</div>
            </div>
          ))}
        </div>
        
      </div>
    </section>
  );
};

export default HeroSection;
