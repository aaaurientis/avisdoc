import { CheckCircle2, Clock, Users, Shield, Smartphone, User, MapPin } from "lucide-react";

const WhyAvisdocSection = () => {
  const features = [
    {
      icon: Users,
      title: "Créée par des dermatologues français",
      description: "Un réseau de près de 20 dermatologues français experts, mobilisés pour délivrer un avis spécialisé sous 4 jours ouvrés.",
    },
    {
      icon: Smartphone,
      title: "Spécialisée exclusivement en dermatologie",
      description: "La 1ère plateforme française de téléexpertise 100% dédiée à la dermatologie, conçue par des spécialistes.",
    },
    {
      icon: CheckCircle2,
      title: "Réseau d'aval de prise en charge",
      description: "Des réseaux d'aval localisés pour le suivi rapide et professionnel des patients nécessitant une prise en charge.",
    },
    {
      icon: Clock,
      title: "Une approche rapide et personnalisée",
      description: "Les patients obtiennent un avis dermatologique expert dans un délai moyen de 96 heures, raccourcissant les délais d'attente.",
    },
    {
      icon: MapPin,
      title: "Présents dans toute la France",
      description: "AvisDoc peut faire intervenir des infirmières sur l'ensemble du territoire français.",
    },
  ];

  return (
    <section id="pourquoi" className="section-padding bg-muted/30">
      <div className="section-container">
        {/* Header */}
        <div className="text-center max-w-3xl mx-auto mb-16">
          <span className="text-secondary font-semibold text-sm uppercase tracking-wider">
            Pourquoi AvisDoc ?
          </span>
          <h2 className="font-display text-3xl md:text-4xl font-bold text-foreground mt-4 mb-6">
            La dermatologie est confrontée à une pénurie de spécialistes, avec 3 à 6 mois d'attente pour un rendez-vous.<br />
            Le nombre de dermatologues va continuer de diminuer jusqu'en 2035.<br />
            AvisDoc se concentre aujourd'hui sur le dépistage des cancers de la peau, mélanomes et carcinomes.
          </h2>
        </div>

        {/* Cancer stats banner - PPT style */}
        <div className="mb-16 rounded-3xl overflow-hidden bg-avisdoc-navy text-white p-8 md:p-14 max-w-5xl mx-auto relative">
          {/* Decorative gradient overlay */}
          <div className="absolute inset-0 bg-gradient-to-br from-white/5 via-transparent to-transparent pointer-events-none rounded-3xl" />
          
          <div className="relative z-10">
            <h3 className="font-display text-3xl md:text-4xl font-bold mb-2 text-secondary">
              Le cancer de la peau
            </h3>
            <p className="text-white/60 text-base md:text-lg mb-10 max-w-xl">
              Un enjeu majeur de santé publique, évitable par le dépistage précoce
            </p>

            <div className="flex flex-col lg:flex-row gap-10 lg:gap-16 items-start">
              {/* Person icons grid */}
              <div className="flex flex-col gap-4">
                <div className="grid grid-cols-10 gap-x-1.5 gap-y-1 shrink-0">
                  {Array.from({ length: 100 }).map((_, i) => (
                    <User
                      key={i}
                      className={`h-5 w-5 md:h-6 md:w-6 transition-colors ${
                        i >= 99
                          ? 'text-secondary drop-shadow-[0_0_6px_hsl(33,89%,55%)]'
                          : i >= 90
                          ? 'text-primary drop-shadow-[0_0_4px_hsl(187,100%,39%)]'
                          : 'text-white/30'
                      }`}
                      strokeWidth={1.5}
                    />
                  ))}
                </div>
                {/* Legend */}
                <div className="flex items-center gap-6 text-xs text-white/50">
                  <div className="flex items-center gap-1.5">
                    <User className="h-4 w-4 text-white/30" strokeWidth={1.5} />
                    <span>Population</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <User className="h-4 w-4 text-primary" strokeWidth={1.5} />
                    <span>Mélanomes</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <User className="h-4 w-4 text-secondary" strokeWidth={1.5} />
                    <span>Décès</span>
                  </div>
                </div>
              </div>

              {/* Stats */}
              <div className="flex flex-col gap-8 flex-1">
                <div className="border-l-4 border-primary/40 pl-5">
                  <span className="block font-display text-4xl md:text-5xl font-bold text-primary">≈200 000*</span>
                  <span className="block text-white/50 mt-1 text-sm md:text-base">cancers de la peau diagnostiqués par an</span>
                </div>
                <div className="border-l-4 border-primary/60 pl-5">
                  <span className="block font-display text-4xl md:text-5xl font-bold text-primary">≈20 000*</span>
                  <span className="block text-white/50 mt-1 text-sm md:text-base">nouveaux mélanomes détectés chaque année</span>
                </div>
                <div className="border-l-4 border-secondary/60 pl-5">
                  <span className="block font-display text-4xl md:text-5xl font-bold text-secondary">≈2 000*</span>
                  <span className="block text-white/50 mt-1 text-sm md:text-base">décès chaque année en France</span>
                </div>
              </div>
            </div>

            <p className="text-white/30 text-xs mt-10 text-right">
              *source : Institut National du Cancer
            </p>
          </div>
        </div>


        {/* Atouts intro */}
        <div className="text-center max-w-3xl mx-auto mb-12">
          <h3 className="font-display text-2xl md:text-3xl font-bold text-foreground mb-4">
            <span className="text-primary">73% des Français jugent l'accès à un dermatologue difficile,</span><br />
            AvisDoc est une solution organisationnelle et digitale pour faciliter l'accès à l'avis d'un dermatologue expert.
          </h3>
        </div>

        {/* Features Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
          {features.map((feature, index) => (
            <div
              key={feature.title}
              className="bg-card p-8 rounded-2xl shadow-soft card-hover border border-border/50"
              style={{ animationDelay: `${index * 0.1}s` }}
            >
              <div className="w-14 h-14 rounded-xl bg-primary/10 flex items-center justify-center mb-6">
                <feature.icon className="h-7 w-7 text-primary" />
              </div>
              <h3 className="font-display text-xl font-semibold text-foreground mb-3">
                {feature.title}
              </h3>
              <p className="text-muted-foreground leading-relaxed">
                {feature.description}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};

export default WhyAvisdocSection;
