import { Building2, Landmark, Stethoscope, ArrowRight } from "lucide-react";

const OffersOverview = () => {
  const offers = [
    {
      icon: Building2,
      title: "Pour les entreprises",
      description: "Offrez à vos collaborateurs un accès privilégié au dépistage des cancers de la peau, dans un cadre sécurisé et encadré médicalement.",
      href: "#entreprises",
      color: "secondary",
    },
    {
      icon: Landmark,
      title: "Pour les collectivités",
      description: "Organisez des journées de sensibilisation et de dépistage dermatologique pour améliorer l'accès aux soins sur votre territoire.",
      href: "#collectivites",
      color: "primary",
    },
    {
      icon: Stethoscope,
      title: "Pour les médecins",
      description: "Obtenez rapidement un avis dermatologique spécialisé grâce à notre plateforme de téléexpertise dédiée.",
      href: "#medecins",
      color: "secondary",
    },
  ];

  return (
    <section className="section-padding bg-avisdoc-navy">
      <div className="section-container">
        <div className="text-center max-w-2xl mx-auto mb-12">
          <h2 className="font-display text-3xl md:text-4xl font-bold text-white mb-4">
            Nos <span className="text-secondary">3 offres</span> de services
          </h2>
          <p className="text-white/60 text-lg">
            Découvrez comment AvisDoc accompagne chaque acteur de santé.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          {offers.map((offer) => (
            <a
              key={offer.title}
              href={offer.href}
              className="group bg-white/5 border border-white/10 rounded-2xl p-8 hover:bg-white/10 transition-all duration-300 hover:-translate-y-1 block"
            >
              <div className={`w-14 h-14 rounded-xl flex items-center justify-center mb-6 ${
                offer.color === "primary" ? "bg-primary/20" : "bg-secondary/20"
              }`}>
                <offer.icon className={`h-7 w-7 ${
                  offer.color === "primary" ? "text-primary" : "text-secondary"
                }`} />
              </div>
              <h3 className="font-display text-xl font-semibold text-white mb-3">
                {offer.title}
              </h3>
              <p className="text-white/60 leading-relaxed mb-6">
                {offer.description}
              </p>
              <span className="inline-flex items-center text-primary text-sm font-medium group-hover:gap-2 transition-all">
                En savoir plus
                <ArrowRight className="ml-1 h-4 w-4 group-hover:translate-x-1 transition-transform" />
              </span>
            </a>
          ))}
        </div>
      </div>
    </section>
  );
};

export default OffersOverview;
