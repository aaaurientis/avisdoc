import { CheckCircle2, Clock, Users, Smartphone, User, MapPin } from "lucide-react";

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
    <section id="pourquoi" className="section-padding surface-mist">
      <div className="section-container">
        <div className="text-center max-w-3xl mx-auto mb-14">
          <span className="eyebrow text-avisdoc-coral">Pourquoi AvisDoc ?</span>
          <h2 className="font-display text-3xl md:text-5xl font-semibold text-avisdoc-ink mt-5 mb-6 leading-[1.1]">
            Un enjeu de santé publique qui exige{" "}
            <span className="text-primary italic">une nouvelle organisation.</span>
          </h2>
          <p className="text-muted-foreground text-base md:text-lg leading-relaxed">
            La dermatologie est confrontée à une pénurie de spécialistes, avec 3 à 6 mois d'attente pour
            un rendez-vous. Le nombre de dermatologues va continuer de diminuer jusqu'en 2035.
            AvisDoc se concentre aujourd'hui sur le dépistage des cancers de la peau,
            mélanomes et carcinomes.
          </p>
        </div>

        <div className="mb-20 rounded-[2rem] overflow-hidden bg-avisdoc-ink text-white p-8 md:p-14 max-w-6xl mx-auto relative">
          <div className="absolute inset-0 bg-gradient-to-br from-primary/25 via-transparent to-avisdoc-coral/20 pointer-events-none" />
          <div
            aria-hidden
            className="absolute -top-24 -right-24 w-[380px] h-[380px] rounded-full bg-primary/20 blur-[140px]"
          />

          <div className="relative z-10">
            <span className="chip bg-white/10 text-white border border-white/20 mb-4">
              Santé publique
            </span>
            <h3 className="font-display text-3xl md:text-5xl font-semibold text-white mb-3 leading-tight">
              Le cancer de la peau
            </h3>
            <p className="text-white/70 text-base md:text-lg mb-10 max-w-xl">
              Un enjeu majeur de santé publique, évitable par le dépistage précoce.
            </p>

            <div className="flex flex-col lg:flex-row gap-10 lg:gap-16 items-start">
              <div className="flex flex-col gap-4">
                <div className="grid grid-cols-10 gap-x-1.5 gap-y-1 shrink-0">
                  {Array.from({ length: 100 }).map((_, i) => (
                    <User
                      key={i}
                      className={`h-5 w-5 md:h-6 md:w-6 transition-colors ${
                        i >= 99
                          ? 'text-avisdoc-coral drop-shadow-[0_0_6px_hsl(14,85%,68%)]'
                          : i >= 90
                          ? 'text-primary drop-shadow-[0_0_4px_hsl(174,56%,45%)]'
                          : 'text-white/30'
                      }`}
                      strokeWidth={1.5}
                    />
                  ))}
                </div>
                <div className="flex items-center gap-6 text-xs text-white/60">
                  <div className="flex items-center gap-1.5">
                    <User className="h-4 w-4 text-white/40" strokeWidth={1.5} />
                    <span>Population</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <User className="h-4 w-4 text-primary" strokeWidth={1.5} />
                    <span>Mélanomes</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <User className="h-4 w-4 text-avisdoc-coral" strokeWidth={1.5} />
                    <span>Décès</span>
                  </div>
                </div>
              </div>

              <div className="flex flex-col gap-8 flex-1">
                <div className="border-l-2 border-primary/60 pl-5">
                  <span className="block font-display text-4xl md:text-5xl font-semibold text-primary">≈200 000*</span>
                  <span className="block text-white/60 mt-1 text-sm md:text-base">cancers de la peau diagnostiqués par an</span>
                </div>
                <div className="border-l-2 border-primary/60 pl-5">
                  <span className="block font-display text-4xl md:text-5xl font-semibold text-primary">≈20 000*</span>
                  <span className="block text-white/60 mt-1 text-sm md:text-base">nouveaux mélanomes détectés chaque année</span>
                </div>
                <div className="border-l-2 border-avisdoc-coral/70 pl-5">
                  <span className="block font-display text-4xl md:text-5xl font-semibold text-avisdoc-coral">≈2 000*</span>
                  <span className="block text-white/60 mt-1 text-sm md:text-base">décès chaque année en France</span>
                </div>
              </div>
            </div>

            <p className="text-white/40 text-xs mt-10 text-right">
              *source : Institut National du Cancer
            </p>
          </div>
        </div>

        <div className="text-center max-w-3xl mx-auto mb-14">
          <h3 className="font-display text-2xl md:text-3xl font-semibold text-foreground leading-snug">
            <span className="text-primary">73 % des Français jugent l'accès à un dermatologue difficile.</span>
            <br />
            AvisDoc est une solution organisationnelle et digitale pour faciliter
            l'accès à l'avis d'un dermatologue expert.
          </h3>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {features.map((feature, index) => (
            <article
              key={feature.title}
              className="relative bg-card rounded-3xl p-7 border border-border/60 card-hover"
              style={{ animationDelay: `${index * 0.08}s` }}
            >
              <div className="h-12 w-12 rounded-2xl bg-primary/10 text-primary flex items-center justify-center mb-5">
                <feature.icon className="h-5 w-5" />
              </div>
              <h3 className="font-display text-lg font-semibold text-foreground mb-2.5 leading-snug">
                {feature.title}
              </h3>
              <p className="text-muted-foreground leading-relaxed text-sm">
                {feature.description}
              </p>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
};

export default WhyAvisdocSection;
