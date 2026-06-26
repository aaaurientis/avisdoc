import { ArrowRight, Building2, Landmark, Stethoscope, Sparkles, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import heroBg from "@/assets/hero-bg.jpg";

const HeroSection = () => {
  const offers = [
    {
      icon: Building2,
      label: "Entreprises",
      desc: "Dépistage sur site pour vos collaborateurs",
      href: "#entreprises",
      tint: "bg-avisdoc-teal-soft text-primary",
    },
    {
      icon: Landmark,
      label: "Collectivités",
      desc: "Accès aux soins sur votre territoire",
      href: "#collectivites",
      tint: "bg-avisdoc-coral-soft text-avisdoc-coral",
    },
    {
      icon: Stethoscope,
      label: "Professionnels de santé",
      desc: "Téléexpertise en médecine de ville",
      href: "#medecins",
      tint: "bg-[hsl(var(--avisdoc-sage)/0.18)] text-[hsl(var(--avisdoc-sage))]",
    },
  ];

  return (
    <section className="relative overflow-hidden pt-28 md:pt-32 pb-16 md:pb-24 surface-hero">
      {/* Décor santé */}
      <div aria-hidden className="absolute inset-0 pointer-events-none">
        <div className="absolute -top-32 -left-24 w-[520px] h-[520px] rounded-full bg-primary/10 blur-[140px]" />
        <div className="absolute top-1/3 -right-32 w-[460px] h-[460px] rounded-full bg-avisdoc-coral/20 blur-[140px]" />
        <div className="absolute bottom-0 left-1/3 w-[380px] h-[380px] rounded-full bg-[hsl(var(--avisdoc-sage)/0.18)] blur-[140px]" />
        <div className="absolute inset-0 pattern-grid opacity-40" />
      </div>

      <div className="section-container relative z-10">
        <div className="grid lg:grid-cols-12 gap-12 lg:gap-16 items-center">
          {/* Colonne texte */}
          <div className="lg:col-span-7 animate-fade-in">
            <span className="chip bg-white/80 border border-border/70 text-primary shadow-soft backdrop-blur">
              <Sparkles className="h-3.5 w-3.5" />
              Réseau de soins dermatologique · France
            </span>

            <h1 className="font-display text-4xl sm:text-5xl lg:text-6xl font-semibold text-avisdoc-ink leading-[1.05] tracking-tight mt-6 mb-6">
              La dermatologie{" "}
              <span className="italic text-primary">n'attend pas.</span>
            </h1>

            <p className="text-base md:text-lg text-muted-foreground leading-relaxed max-w-2xl mb-5">
              AvisDoc est une solution de télé-expertise, créée par des dermatologues.
              Elle propose un réseau de soins en dermatologie qui permet de prendre en
              charge rapidement toute lésion cutanée.
            </p>

            <div className="relative rounded-3xl border border-primary/15 bg-white/60 backdrop-blur-sm p-5 md:p-6 max-w-2xl mb-8 shadow-soft">
              <div className="absolute -top-3 left-6 chip bg-primary text-primary-foreground">
                Notre priorité
              </div>
              <p className="text-base md:text-lg text-foreground font-medium leading-relaxed">
                Aujourd'hui, AvisDoc se concentre sur le dépistage des cancers de la peau, mélanomes et carcinomes.
              </p>
            </div>

            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 mb-10">
              <Button size="lg" asChild className="rounded-full px-6 shadow-primary group">
                <a href="#pourquoi">
                  Découvrir AvisDoc
                  <ArrowRight className="ml-2 h-4 w-4 group-hover:translate-x-1 transition-transform" />
                </a>
              </Button>
              <Button size="lg" variant="outline" asChild className="rounded-full px-6 border-2">
                <a href="/contact">Nous contacter</a>
              </Button>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-3 gap-2 md:gap-6 max-w-xl">
              {[
                { value: "8 000+", label: "Avis d'experts délivrés" },
                { value: "20", label: "Dermatologues experts" },
                { value: "96h", label: "Délai de réponse moyen" },
              ].map((stat) => (
                <div key={stat.label} className="flex flex-col">
                  <span className="font-display text-3xl md:text-4xl font-semibold text-primary">
                    {stat.value}
                  </span>
                  <span className="text-[11px] md:text-xs text-muted-foreground leading-tight mt-1">
                    {stat.label}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Visual + carte offres */}
          <div className="lg:col-span-5 relative animate-slide-up">
            <div className="relative">
              {/* Carte image éditoriale */}
              <div className="relative rounded-[2.25rem] overflow-hidden border border-white shadow-floating">
                <img
                  src={heroBg}
                  alt="Infirmière AvisDoc examinant la peau d'une patiente lors d'un dépistage dermatologique"
                  width={1200}
                  height={800}
                  fetchPriority="high"
                  decoding="async"
                  className="w-full h-[420px] md:h-[520px] object-cover"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-avisdoc-ink/70 via-avisdoc-ink/10 to-transparent" />
                <div className="absolute left-5 right-5 bottom-5 md:left-7 md:right-7 md:bottom-7">
                  <div className="flex items-center gap-3 text-white/90 text-xs uppercase tracking-[0.18em] mb-3">
                    <span className="inline-block h-px w-8 bg-white/70" />
                    Téléexpertise dermatologique
                  </div>
                  <p className="text-white font-display text-xl md:text-2xl leading-snug">
                    Un avis expert sous{" "}
                    <span className="text-avisdoc-coral">96 heures</span>, sans déplacement.
                  </p>
                </div>
              </div>

              {/* Badge confidentialité — masqué en mobile pour ne pas encombrer */}
              <div className="hidden md:block absolute -left-4 md:-left-8 top-6 md:top-10 bg-white rounded-2xl shadow-raised border border-border/60 p-4 max-w-[220px] animate-float">
                <div className="flex items-center gap-2 mb-1.5">
                  <ShieldCheck className="h-4 w-4 text-primary" />
                  <span className="text-xs font-semibold text-foreground">Certifié HDS</span>
                </div>
                <p className="text-[11px] text-muted-foreground leading-snug">
                  Hébergement de données de santé agréé, conforme RGPD.
                </p>
              </div>

              {/* Mini-stat flottante — masquée en mobile, centrée verticalement à droite */}
              <div className="hidden md:block absolute -right-4 md:-right-6 top-1/2 -translate-y-1/2 bg-white rounded-2xl shadow-raised border border-border/60 p-4 max-w-[200px]">
                <p className="text-[11px] uppercase tracking-wider text-muted-foreground mb-1">
                  Spécialistes mobilisés
                </p>
                <p className="font-display text-xl font-semibold text-foreground">
                  ≈ 20 dermatologues
                </p>
                <p className="text-[11px] text-muted-foreground mt-1">Partout en France</p>
              </div>
            </div>
          </div>
        </div>

        {/* 3 offres */}
        <div id="offres" className="mt-16 md:mt-24 grid grid-cols-1 md:grid-cols-3 gap-4 md:gap-6">
          {offers.map((offer, i) => (
            <a
              key={offer.label}
              href={offer.href}
              className="group relative rounded-3xl border border-border/70 bg-white/70 backdrop-blur p-6 md:p-7 hover:-translate-y-1 hover:shadow-raised transition-all duration-300 animate-slide-up"
              style={{ animationDelay: `${i * 0.08}s` }}
            >
              <div className={`h-12 w-12 rounded-2xl flex items-center justify-center mb-5 ${offer.tint}`}>
                <offer.icon className="h-5 w-5" />
              </div>
              <h3 className="font-display text-lg font-semibold text-foreground mb-1.5">
                {offer.label}
              </h3>
              <p className="text-sm text-muted-foreground mb-4">{offer.desc}</p>
              <span className="inline-flex items-center text-sm font-medium text-primary">
                En savoir plus
                <ArrowRight className="ml-1.5 h-4 w-4 group-hover:translate-x-1 transition-transform" />
              </span>
            </a>
          ))}
        </div>
      </div>
    </section>
  );
};

export default HeroSection;
