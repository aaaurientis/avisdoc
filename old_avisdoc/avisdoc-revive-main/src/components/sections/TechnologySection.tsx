import { Shield, Camera, Code2 } from "lucide-react";

const techPoints = [
  {
    icon: Shield,
    title: "Hébergement certifié HDS",
    description:
      "Notre plateforme est hébergée sur une infrastructure certifiée HDS (Hébergeur de Données de Santé) et conforme au RGPD, garantissant la sécurité et la confidentialité des données patients à chaque étape.",
  },
  {
    icon: Code2,
    title: "Développée par Factory319",
    description:
      "La solution AvisDoc est conçue et développée par Factory319, société spécialisée dans les solutions numériques dédiées au secteur médical, garantissant fiabilité et expertise métier.",
  },
  {
    icon: Camera,
    title: "Dermatoscopes professionnels",
    description:
      "Nous utilisons des dermatoscopes de dernière génération pour capturer des images de haute qualité, permettant aux dermatologues experts de réaliser une analyse précise et fiable des lésions cutanées.",
  },
];

const TechnologySection = () => {
  return (
    <section className="section-padding bg-muted/30">
      <div className="section-container">
        <div className="text-center max-w-3xl mx-auto mb-14">
          <span className="text-primary font-semibold text-sm uppercase tracking-wider">
            Notre technologie
          </span>
          <h2 className="font-display text-3xl md:text-4xl font-bold text-foreground mt-4 mb-6">
            Un écosystème digital sécurisé, conçu pour le secteur médical
          </h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 max-w-5xl mx-auto">
          {techPoints.map((point, index) => (
            <div
              key={point.title}
              className="bg-card p-8 rounded-2xl shadow-soft card-hover border border-border/50 text-center"
              style={{ animationDelay: `${index * 0.1}s` }}
            >
              <div className="w-14 h-14 rounded-xl bg-primary/10 flex items-center justify-center mb-6 mx-auto">
                <point.icon className="h-7 w-7 text-primary" />
              </div>
              <h3 className="font-display text-xl font-semibold text-foreground mb-3">
                {point.title}
              </h3>
              <p className="text-muted-foreground leading-relaxed text-sm">
                {point.description}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};

export default TechnologySection;
