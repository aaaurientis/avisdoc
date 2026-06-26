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
    <section id="medecins" className="section-padding surface-mist relative overflow-hidden">
      <div aria-hidden className="absolute -top-24 -right-24 w-[480px] h-[480px] rounded-full bg-primary/10 blur-[160px]" />

      <div className="section-container relative">
        <div className="text-center max-w-3xl mx-auto mb-16">
          <span className="chip bg-primary/10 text-primary mb-6">
            <Stethoscope className="h-3.5 w-3.5" />
            Pour les professionnels de santé
          </span>
          <h2 className="font-display text-3xl md:text-5xl font-semibold text-avisdoc-ink mb-6 leading-[1.08]">
            Téléexpertise dermatologique pour les{" "}
            <span className="text-primary italic">professionnels de santé.</span>
          </h2>
          <p className="text-muted-foreground text-base md:text-lg leading-relaxed">
            La téléexpertise d'AvisDoc permet aux professionnels de santé d'obtenir rapidement un
            avis dermatologique spécialisé, garantissant une prise en charge rapide et efficace des
            patients, sans déplacement.
          </p>
        </div>

        <div className="max-w-3xl mx-auto mb-16 rounded-[2rem] overflow-hidden border border-border/60 shadow-floating">
          <img
            src={dermatoscopeImg}
            alt="Médecin examinant une lésion cutanée au dermatoscope"
            width={1280}
            height={720}
            loading="lazy"
            decoding="async"
            className="w-full h-64 md:h-80 object-cover"
          />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-16">
          {steps.map((step, index) => (
            <div
              key={step.title}
              className="relative bg-card border border-border/60 rounded-3xl p-7 text-center card-hover"
            >
              <div className="absolute -top-4 left-1/2 -translate-x-1/2 h-8 w-8 rounded-full bg-primary text-white flex items-center justify-center text-xs font-semibold shadow-primary">
                {index + 1}
              </div>
              <div className="h-14 w-14 rounded-2xl bg-avisdoc-teal-soft flex items-center justify-center mx-auto mb-5 mt-3 text-primary">
                <step.icon className="h-6 w-6" />
              </div>
              <h3 className="font-display text-base font-semibold text-foreground mb-2.5">
                {step.title}
              </h3>
              <p className="text-muted-foreground text-sm leading-relaxed">
                {step.description}
              </p>
            </div>
          ))}
        </div>

        <div className="relative overflow-hidden text-center bg-gradient-primary text-white rounded-[2rem] p-10 md:p-14 max-w-4xl mx-auto">
          <div aria-hidden className="absolute -top-10 -right-10 w-60 h-60 rounded-full bg-white/10 blur-3xl" />
          <div aria-hidden className="absolute -bottom-10 -left-10 w-60 h-60 rounded-full bg-avisdoc-coral/30 blur-3xl" />
          <div className="relative">
            <h3 className="font-display text-2xl md:text-3xl font-semibold mb-4">
              Professionnels de santé, rejoignez-nous !
            </h3>
            <p className="text-white/85 mb-8 max-w-xl mx-auto">
              Médecin généraliste, infirmier(e), kinésithérapeute… Bénéficiez des services d'AvisDoc.
              Dermatologue ? Rejoignez notre réseau d'experts !
            </p>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
              <Button asChild size="lg" variant="secondary" className="rounded-full group">
                <a href="https://app.avisdoc.fr/register" target="_blank" rel="noopener noreferrer">
                  Je m'inscris
                  <ArrowRight className="ml-2 h-4 w-4 group-hover:translate-x-1 transition-transform" />
                </a>
              </Button>
              <Button asChild size="lg" variant="outline" className="rounded-full border-white/50 bg-white/10 hover:bg-white/20 text-white hover:text-white">
                <a href="/contact">Nous contacter</a>
              </Button>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};

export default DoctorsSection;
