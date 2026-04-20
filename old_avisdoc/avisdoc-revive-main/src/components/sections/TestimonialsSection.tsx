import { Quote } from "lucide-react";

const testimonials = [
  {
    quote: "Je n'aurais jamais pris rendez-vous chez un dermatologue de moi-même. Grâce à cette journée de dépistage au travail, j'ai pu faire vérifier mes grains de beauté rapidement et sans stress. Tout était clair, professionnel et rassurant.",
    author: "Sophie",
    detail: "42 ans",
  },
  {
    quote: "L'infirmière a pris le temps de m'expliquer chaque étape. J'ai reçu un retour médical précis quelques jours plus tard. C'est très rassurant de savoir que les images sont analysées par un dermatologue.",
    author: "Marc",
    detail: "51 ans",
  },
  {
    quote: "J'ai été orienté vers un dermatologue suite au dépistage. Sans cette journée, je n'aurais probablement pas consulté. Aujourd'hui, je suis suivi et soulagé d'avoir agi à temps.",
    author: "Julien",
    detail: "48 ans",
  },
  {
    quote: "Tout est fait avec beaucoup de sérieux et de discrétion. On se sent vraiment pris en charge, pas juste \"dépisté à la chaîne\".",
    author: "Nathalie",
    detail: "55 ans",
  },
  {
    quote: "Le format est idéal : rapide, efficace, et sur mon lieu de travail. On sent que le dispositif a été pensé par des dermatologues.",
    author: "Thomas",
    detail: "34 ans",
  },
  {
    quote: "Cette journée de prévention et de dépistage dermatologique a été très bien perçue par les collaborateurs. La pédagogie en amont sur l'auto-évaluation permet d'arriver préparé, et le dépistage sur place apporte une vraie valeur concrète. Pour nous, RH, c'est une action de prévention utile, rassurante et facile à déployer, qui répond à un véritable enjeu de santé en entreprise.",
    author: "Responsable RH",
    detail: "",
  },
];

const TestimonialsSection = () => {
  return (
    <section className="section-padding bg-muted/30">
      <div className="section-container">
        <div className="text-center max-w-3xl mx-auto mb-14">
          <span className="text-secondary font-semibold text-sm uppercase tracking-wider">
            Témoignages
          </span>
          <h2 className="font-display text-3xl md:text-4xl font-bold text-foreground mt-4 mb-6">
            Ils ont participé à une journée de dépistage AvisDoc
          </h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 max-w-6xl mx-auto">
          {testimonials.map((t, i) => (
            <div
              key={i}
              className="bg-card rounded-2xl p-6 shadow-soft border border-border/50 flex flex-col"
            >
              <Quote className="h-6 w-6 text-primary/40 mb-4 flex-shrink-0" />
              <p className="text-muted-foreground italic leading-relaxed flex-1 text-sm">
                "{t.quote}"
              </p>
              <div className="mt-5 pt-4 border-t border-border/50">
                <p className="font-semibold text-foreground text-sm">{t.author}</p>
                {t.detail && (
                  <p className="text-muted-foreground text-xs">{t.detail}</p>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};

export default TestimonialsSection;
