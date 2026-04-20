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
    <section id="entreprises" className="section-padding bg-avisdoc-ink text-white relative overflow-hidden">
      <div aria-hidden className="absolute -top-24 right-0 w-[520px] h-[520px] rounded-full bg-primary/15 blur-[160px]" />
      <div aria-hidden className="absolute bottom-0 -left-24 w-[420px] h-[420px] rounded-full bg-avisdoc-coral/15 blur-[160px]" />

      <div className="section-container relative">
        <div className="grid lg:grid-cols-2 gap-12 lg:gap-20 items-center">
          <div>
            <span className="chip bg-white/10 text-white border border-white/15 mb-6">
              <Building2 className="h-3.5 w-3.5 text-avisdoc-coral" />
              Pour les entreprises
            </span>

            <h2 className="font-display text-3xl md:text-5xl font-semibold text-white mb-6 leading-[1.08]">
              Offrez à vos collaborateurs un accès privilégié au{" "}
              <span className="text-avisdoc-coral italic">dépistage des cancers de la peau.</span>
            </h2>

            <p className="text-white/70 text-base md:text-lg mb-8 leading-relaxed">
              AvisDoc permet aux entreprises d'offrir à leurs collaborateurs un accès facilité à un
              dépistage dermatologique professionnel et à un diagnostic expert, dans un cadre sécurisé
              et encadré médicalement.
            </p>

            <div className="mb-8 rounded-2xl bg-gradient-to-br from-avisdoc-coral/20 to-avisdoc-coral/5 border border-avisdoc-coral/25 p-5">
              <p className="text-avisdoc-coral font-semibold text-base md:text-lg leading-snug">
                80 % des collaborateurs souhaitent des actions de dépistage comme bénéfice employeur*
              </p>
            </div>

            <ul className="space-y-3.5 mb-8">
              {benefits.map((benefit) => (
                <li key={benefit} className="flex items-start gap-3">
                  <CheckCircle className="h-5 w-5 text-primary flex-shrink-0 mt-0.5" />
                  <span className="text-white/80 text-sm md:text-base">{benefit}</span>
                </li>
              ))}
            </ul>
            <p className="text-xs text-white/40 mb-6">*Enquête Ipsos - 2023</p>

            <Button asChild size="lg" className="rounded-full shadow-primary group">
              <a href="mailto:contact@avisdoc.fr">
                Demander une présentation
                <ArrowRight className="ml-2 h-4 w-4 group-hover:translate-x-1 transition-transform" />
              </a>
            </Button>
          </div>

          <div className="relative">
            <div className="rounded-[2rem] overflow-hidden border border-white/10 mb-10 shadow-floating">
              <img
                src={doctorExamImg}
                alt="Examen dermatologique en entreprise"
                className="w-full h-64 md:h-80 object-cover"
              />
            </div>

            <h3 className="font-display text-xl font-semibold text-white mb-8 text-center">
              Notre processus en <span className="text-avisdoc-coral">8 étapes</span>
            </h3>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              {steps.map((step) => (
                <div key={step.num} className="text-center">
                  <div className={`h-12 w-12 rounded-2xl mx-auto mb-3 flex items-center justify-center text-lg font-semibold transition-transform hover:-translate-y-0.5 ${
                    step.highlight
                      ? "bg-avisdoc-coral text-white shadow-[0_12px_30px_-12px_hsl(14,85%,55%,0.6)]"
                      : "bg-white/10 text-white border border-white/10"
                  }`}>
                    {step.num}
                  </div>
                  <p className="text-white/70 text-xs leading-snug">{step.label}</p>
                </div>
              ))}
            </div>

            <div className="mt-14 pt-8 border-t border-white/10">
              <p className="text-white/60 text-sm md:text-base text-center mb-5 uppercase tracking-[0.18em]">
                Ils nous ont fait confiance
              </p>
              <div className="flex flex-wrap justify-center items-center gap-8 md:gap-12">
                <img src={sanofiLogo} alt="Sanofi" className="h-8 md:h-9 brightness-0 invert opacity-60 hover:opacity-100 transition-opacity" />
                <img src={viabeezLogo} alt="Viabeez" className="h-8 md:h-9 brightness-0 invert opacity-60 hover:opacity-100 transition-opacity" />
                <img src={groupamaLogo} alt="Groupama" className="h-8 md:h-9 brightness-0 invert opacity-60 hover:opacity-100 transition-opacity" />
                <img src={extremeLogo} alt="Extreme" className="h-8 md:h-9 brightness-0 invert opacity-60 hover:opacity-100 transition-opacity" />
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};

export default EnterprisesSection;
