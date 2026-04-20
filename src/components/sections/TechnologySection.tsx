import { Shield, Camera, Code2 } from "lucide-react";

const techPoints = [
  {
    icon: Shield,
    title: "Hébergement certifié HDS",
    description:
      "Notre plateforme est hébergée sur une infrastructure certifiée HDS (Hébergeur de Données de Santé) et conforme au RGPD, garantissant la sécurité et la confidentialité des données patients à chaque étape.",
    accent: "bg-primary/10 text-primary",
  },
  {
    icon: Code2,
    title: "Développée par Factory319",
    description:
      "La solution AvisDoc est conçue et développée par Factory319, société spécialisée dans les solutions numériques dédiées au secteur médical, garantissant fiabilité et expertise métier.",
    accent: "bg-[hsl(var(--avisdoc-sage)/0.18)] text-[hsl(var(--avisdoc-sage))]",
  },
  {
    icon: Camera,
    title: "Dermatoscopes professionnels",
    description:
      "Nous utilisons des dermatoscopes de dernière génération pour capturer des images de haute qualité, permettant aux dermatologues experts de réaliser une analyse précise et fiable des lésions cutanées.",
    accent: "bg-avisdoc-coral-soft text-avisdoc-coral",
  },
];

const TechnologySection = () => {
  return (
    <section className="section-padding bg-background relative">
      <div className="section-container">
        <div className="text-center max-w-3xl mx-auto mb-14">
          <span className="eyebrow text-primary">Notre technologie</span>
          <h2 className="font-display text-3xl md:text-5xl font-semibold text-avisdoc-ink mt-5 mb-6 leading-[1.1]">
            Un écosystème digital sécurisé,{" "}
            <span className="italic text-primary">conçu pour le secteur médical.</span>
          </h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 md:gap-7 max-w-5xl mx-auto">
          {techPoints.map((point, index) => (
            <article
              key={point.title}
              className="bg-card p-7 rounded-3xl border border-border/60 card-hover text-center"
              style={{ animationDelay: `${index * 0.1}s` }}
            >
              <div className={`h-14 w-14 rounded-2xl flex items-center justify-center mb-6 mx-auto ${point.accent}`}>
                <point.icon className="h-6 w-6" />
              </div>
              <h3 className="font-display text-lg font-semibold text-foreground mb-3">
                {point.title}
              </h3>
              <p className="text-muted-foreground leading-relaxed text-sm">
                {point.description}
              </p>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
};

export default TechnologySection;
