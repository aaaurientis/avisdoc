import { Stethoscope, ArrowRight, Send, Camera, FileText, HeartPulse } from "lucide-react";
import { Button } from "@/components/ui/button";
import dermatoscopeImg from "@/assets/dermatoscope-exam.jpg";

const DoctorsSection = () => {
  const steps = [
    {
      icon: Send,
      title: "Demande d'un professionnel de santé",
      description: "Le professionnel de santé fait une demande de téléexpertise sur une lésion ou une éruption cutanée.",
    },
    {
      icon: Camera,
      title: "Transmission des données",
      description: "Les données du patient et des photos de la lésion sont envoyées en toute sécurité via la plateforme AvisDoc pour un examen expert.",
    },
    {
      icon: FileText,
      title: "Avis du dermatologue expert en 96h",
      description: "Un dermatologue expert analyse les données et transmet un avis médical complet sous 96h ouvrées.",
    },
    {
      icon: HeartPulse,
      title: "Prise en charge du patient",
      description: "Le professionnel de santé peut s'appuyer sur l'avis de l'expert pour adapter sa prise en charge.",
    },
  ];

  return (
    <section id="medecins" className="section-padding bg-avisdoc-navy text-white">
      <div className="section-container">
        {/* Header */}
        <div className="text-center max-w-3xl mx-auto mb-16">
          <div className="inline-flex items-center gap-3 bg-primary/20 px-4 py-2 rounded-full mb-6">
            <Stethoscope className="h-5 w-5 text-primary" />
            <span className="font-semibold text-primary text-sm">Pour les professionnels de santé</span>
          </div>
          <h2 className="font-display text-3xl md:text-4xl font-bold text-white mb-6">
            Téléexpertise dermatologique pour les{" "}
            <span className="text-secondary">professionnels de santé</span>
          </h2>
          <p className="text-white/70 text-lg">
            La téléexpertise d'AvisDoc permet aux professionnels de santé d'obtenir rapidement un avis dermatologique spécialisé, garantissant une prise en charge rapide et efficace des patients, sans déplacement.
          </p>
        </div>

        {/* Image */}
        <div className="max-w-2xl mx-auto mb-16 rounded-3xl overflow-hidden">
          <img
            src={dermatoscopeImg}
            alt="Examen dermatoscopique"
            className="w-full h-64 md:h-80 object-cover"
          />
        </div>

        {/* Steps */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8 mb-16">
          {steps.map((step, index) => (
            <div
              key={step.title}
              className="relative bg-white/5 border border-white/10 rounded-2xl p-8 text-center"
            >
              <div className="absolute -top-4 left-1/2 -translate-x-1/2 w-8 h-8 rounded-full bg-secondary text-white flex items-center justify-center text-sm font-bold">
                {index + 1}
              </div>
              <div className="w-14 h-14 rounded-xl bg-primary/20 flex items-center justify-center mx-auto mb-6 mt-2">
                <step.icon className="h-7 w-7 text-primary" />
              </div>
              <h3 className="font-display text-lg font-semibold text-white mb-3">
                {step.title}
              </h3>
              <p className="text-white/60 text-sm leading-relaxed">
                {step.description}
              </p>
            </div>
          ))}
        </div>

        {/* CTA */}
        <div className="text-center bg-white/5 border border-white/10 rounded-3xl p-8 md:p-12 max-w-3xl mx-auto">
          <h3 className="font-display text-2xl font-bold text-white mb-4">
            Professionnels de santé, rejoignez-nous !
          </h3>
          <p className="text-white/70 mb-8">
            Médecin généraliste, infirmier(e), kinésithérapeute… Bénéficiez des services d'AvisDoc.
            Dermatologue ? Rejoignez notre réseau d'experts !
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <Button asChild size="lg" className="group">
              <a href="https://app.avisdoc.fr/register" target="_blank" rel="noopener noreferrer">
                Je m'inscris
                <ArrowRight className="ml-2 h-4 w-4 group-hover:translate-x-1 transition-transform" />
              </a>
            </Button>
            <Button asChild size="lg" variant="secondary" className="group">
              <a href="mailto:contact@avisdoc.fr">
                Nous contacter
              </a>
            </Button>
          </div>
        </div>
      </div>
    </section>
  );
};

export default DoctorsSection;
