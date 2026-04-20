import { Building2, CheckCircle, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import doctorExamImg from "@/assets/doctor-examination.jpg";
import sanofiLogo from "@/assets/logos/sanofi.svg";
import viabeezLogo from "@/assets/logos/viabeez.png";
import groupamaLogo from "@/assets/logos/groupama.png";
import extremeLogo from "@/assets/logos/extreme.jpeg";

const EnterprisesSection = () => {
  const steps = [
    { num: "1", label: "Contractualisation" },
    { num: "2", label: "Cadrage opérationnel" },
    { num: "3", label: "Communication interne" },
    { num: "4", label: "Campagne de dépistage", highlight: true },
    { num: "5", label: "Télé-expertise par nos dermatologues" },
    { num: "6", label: "Transmission sécurisée des résultats" },
    { num: "7", label: "Accompagnement via réseau d'aval" },
    { num: "8", label: "Bilan et valorisation" },
  ];

  const benefits = [
    "Programme de dépistage des cancers de la peau sur site",
    "Information et sensibilisation des collaborateurs à l'auto examen cutané et à la prévention solaire",
    "Infirmiers formés à la dermatologie et aux dermatoscopes",
    "Avis d'experts dermatologues sous 4 jours ouvrés",
    "Réseau d'aval pour la prise en charge des cas détectés",
    "Reporting et mesure de l'impact du programme",
  ];

  return (
    <section id="entreprises" className="section-padding bg-avisdoc-navy text-white">
      <div className="section-container">
        <div className="grid lg:grid-cols-2 gap-12 lg:gap-16 items-center">
          {/* Content */}
          <div className="text-center">
            <div className="inline-flex items-center gap-3 bg-secondary/20 px-4 py-2 rounded-full mb-6">
              <Building2 className="h-5 w-5 text-secondary" />
              <span className="font-semibold text-secondary text-sm">Pour les entreprises</span>
            </div>
            
            <h2 className="font-display text-3xl md:text-4xl font-bold text-white mb-6">
               Offrez à vos collaborateurs un accès privilégié au{" "}
               <span className="text-secondary">dépistage des cancers de la peau</span>
            </h2>
            
            <p className="text-white/70 text-lg mb-8">
              AvisDoc permet aux entreprises d'offrir à leurs collaborateurs un accès facilité à un dépistage dermatologique professionnel et à un diagnostic expert, dans un cadre sécurisé et encadré médicalement.
            </p>

            {/* Highlighted stat */}
            <div className="mb-8 rounded-2xl bg-secondary/15 border border-secondary/30 p-5">
              <p className="text-secondary font-bold text-lg md:text-xl">
                80% des collaborateurs souhaitent des actions de dépistage comme bénéfice employeur*
              </p>
            </div>

            <ul className="space-y-4 mb-8">
              {benefits.map((benefit) => (
                <li key={benefit} className="flex items-start gap-3">
                  <CheckCircle className="h-5 w-5 text-primary flex-shrink-0 mt-0.5" />
                  <span className="text-white/80">{benefit}</span>
                </li>
              ))}
            </ul>
            <p className="text-xs text-white/40 mb-6">*Enquête Ipsos - 2023</p>

            <Button asChild size="lg" className="group">
              <a href="mailto:contact@avisdoc.fr">
                Demander une présentation
                <ArrowRight className="ml-2 h-4 w-4 group-hover:translate-x-1 transition-transform" />
              </a>
            </Button>
          </div>

          {/* Visual with image */}
          <div className="relative">
            <div className="rounded-3xl overflow-hidden mb-8">
              <img
                src={doctorExamImg}
                alt="Examen dermatologique en entreprise"
                className="w-full h-64 md:h-80 object-cover rounded-3xl"
              />
            </div>

            <h3 className="font-display text-xl font-semibold text-white mb-8 text-center">
              Notre processus en <span className="text-secondary">8 étapes</span>
            </h3>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              {steps.map((step) => (
                <div key={step.num} className="text-center">
                  <div className={`w-14 h-14 rounded-full mx-auto mb-3 flex items-center justify-center text-xl font-bold ${
                    step.highlight
                      ? "bg-secondary text-white"
                      : "bg-primary/30 text-primary"
                  }`}>
                    {step.num}
                  </div>
                  <p className="text-white/70 text-xs leading-tight">{step.label}</p>
                </div>
              ))}
            </div>

            {/* Trust logos placeholder */}
            <div className="mt-12 pt-8 border-t border-white/10">
              <p className="text-white/50 text-lg md:text-xl text-center mb-4 font-semibold">Ils nous ont fait confiance</p>
              <div className="flex flex-wrap justify-center items-center gap-8">
                <img src={sanofiLogo} alt="Sanofi" className="h-8 md:h-10 brightness-0 invert opacity-60 hover:opacity-100 transition-opacity" />
                <img src={viabeezLogo} alt="Viabeez" className="h-8 md:h-10 brightness-0 invert opacity-60 hover:opacity-100 transition-opacity" />
                <img src={groupamaLogo} alt="Groupama" className="h-8 md:h-10 brightness-0 invert opacity-60 hover:opacity-100 transition-opacity" />
                <img src={extremeLogo} alt="Extreme" className="h-8 md:h-10 brightness-0 invert opacity-60 hover:opacity-100 transition-opacity" />
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};

export default EnterprisesSection;
