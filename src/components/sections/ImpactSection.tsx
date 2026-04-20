import { Sprout, HeartHandshake, Shield, Globe2 } from "lucide-react";
import AnimatedCounter from "@/components/AnimatedCounter";
import Reveal from "@/components/Reveal";

const milestones = [
  {
    year: "2022",
    title: "Création par des dermatologues",
    description: "Naissance d'AvisDoc pour pallier la pénurie de dermatologues en France.",
    icon: Sprout,
  },
  {
    year: "2023",
    title: "Premières campagnes en entreprise",
    description: "Journées de dépistage sur site et formation des équipes soignantes.",
    icon: HeartHandshake,
  },
  {
    year: "2024",
    title: "Partenariats territoriaux",
    description: "Déploiement aux côtés des collectivités et de Groupama en zones rurales.",
    icon: Globe2,
  },
  {
    year: "2026",
    title: "Plus de 8 000 avis d'experts",
    description: "Un réseau de ~20 dermatologues experts mobilisés partout en France.",
    icon: Shield,
  },
];

const ImpactSection = () => {
  return (
    <section className="section-padding bg-avisdoc-ink text-white relative overflow-hidden">
      <div aria-hidden className="absolute -top-24 left-1/4 w-[480px] h-[480px] rounded-full bg-primary/25 blur-[160px]" />
      <div aria-hidden className="absolute bottom-0 right-0 w-[420px] h-[420px] rounded-full bg-avisdoc-coral/20 blur-[160px]" />

      <div className="relative section-container">
        <Reveal className="max-w-3xl mb-16">
          <span className="chip bg-white/10 text-white border border-white/15 mb-5">
            Impact mesuré
          </span>
          <h2 className="font-display text-3xl md:text-5xl font-semibold leading-[1.08] mb-4">
            Un réseau qui grandit,{" "}
            <span className="italic text-avisdoc-coral">des vies mieux protégées.</span>
          </h2>
          <p className="text-white/70 text-base md:text-lg">
            Depuis 2022, AvisDoc fédère soignants et territoires autour d'un même objectif :
            dépister à temps les lésions cutanées, partout en France.
          </p>
        </Reveal>

        {/* Grand compteurs */}
        <Reveal delay={100}>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 md:gap-8 mb-20">
            {[
              { value: 8000, suffix: "+", label: "Avis d'experts délivrés" },
              { value: 20, suffix: "", label: "Dermatologues experts en réseau" },
              { value: 96, suffix: "h", label: "Délai de réponse moyen" },
            ].map((stat) => (
              <div
                key={stat.label}
                className="relative rounded-3xl bg-white/5 border border-white/10 p-6 md:p-8 backdrop-blur-sm"
              >
                <AnimatedCounter
                  value={stat.value}
                  suffix={stat.suffix}
                  className="font-display text-5xl md:text-6xl font-semibold text-avisdoc-coral leading-none"
                />
                <p className="text-white/70 text-sm md:text-base mt-3">{stat.label}</p>
              </div>
            ))}
          </div>
        </Reveal>

        {/* Timeline */}
        <div className="relative">
          <div
            aria-hidden
            className="hidden md:block absolute left-0 right-0 top-[2.6rem] h-px bg-gradient-to-r from-transparent via-white/20 to-transparent"
          />
          <div className="grid grid-cols-1 md:grid-cols-4 gap-8 md:gap-6">
            {milestones.map((m, i) => (
              <Reveal key={m.year} delay={i * 90}>
                <div className="relative">
                  <div className="flex items-center justify-center md:justify-start mb-4">
                    <div className="h-12 w-12 rounded-2xl bg-primary/15 text-primary flex items-center justify-center ring-2 ring-avisdoc-ink relative z-10">
                      <m.icon className="h-5 w-5" />
                    </div>
                  </div>
                  <div className="font-display text-xl font-semibold text-avisdoc-coral mb-2">
                    {m.year}
                  </div>
                  <h3 className="font-display text-base font-semibold text-white mb-2 leading-snug">
                    {m.title}
                  </h3>
                  <p className="text-white/60 text-sm leading-relaxed">
                    {m.description}
                  </p>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
};

export default ImpactSection;
