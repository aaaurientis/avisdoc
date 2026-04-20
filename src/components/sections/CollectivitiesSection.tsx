import { useState } from "react";
import { Landmark, CheckCircle, ArrowRight, FileText, Newspaper, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import gillesNoelImg from "@/assets/gilles-noel.jpeg";
import groupamaLogo from "@/assets/logos/groupama.png";
import articleImg from "@/assets/press/groupama-article.png";

const CollectivitiesSection = () => {
  const [isImageOpen, setIsImageOpen] = useState(false);

  const benefits = [
    "Formation des professionnels de santé locaux",
    "Sensibilisation des habitants aux risques dermatologiques",
    "Séances de dépistage avec les professionnels de santé locaux",
    "Avis des dermatologues experts AvisDoc",
    "Mesure de l'impact sur la santé des populations locales",
  ];

  return (
    <>
      <section id="collectivites" className="section-padding bg-background relative overflow-hidden">
        <div aria-hidden className="absolute top-10 right-0 w-[420px] h-[420px] rounded-full bg-avisdoc-teal-soft blur-[160px] opacity-80" />
        <div aria-hidden className="absolute bottom-10 left-0 w-[360px] h-[360px] rounded-full bg-avisdoc-coral-soft blur-[160px] opacity-80" />

        <div className="section-container relative">
          <div className="grid lg:grid-cols-2 gap-12 lg:gap-20 items-center">
            <div className="relative order-2 lg:order-1">
              <div className="bg-gradient-to-br from-primary/5 via-white to-avisdoc-coral/5 rounded-[2rem] p-8 lg:p-10 space-y-6 border border-border/60">
                <div className="bg-card rounded-2xl p-6 shadow-soft border border-border/60 flex items-start gap-5">
                  <img src={gillesNoelImg} alt="Gilles Noël, maire de Varzy" width={128} height={128} loading="lazy" decoding="async" className="w-16 h-16 rounded-full object-cover flex-shrink-0 ring-4 ring-primary/10" />
                  <div>
                    <p className="text-muted-foreground italic mb-3 text-sm leading-relaxed">
                      "Les inégalités d'accès aux soins en ruralité sont une réalité criante laissant nos concitoyens trop souvent en souffrance. Les collectivités locales, interlocutrices privilégiées de ces derniers, sont des "remparts" de proximité contre cet état de fait grâce aux initiatives locales qu'elles génèrent."
                    </p>
                    <p className="text-foreground font-semibold text-sm">Gilles Noël</p>
                    <p className="text-muted-foreground text-xs">Maire de Varzy</p>
                    <a
                      href="/documents/rendu-experience-teleexpertise-dermato-58.pdf"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 text-primary text-xs font-medium mt-2 hover:underline"
                    >
                      <FileText className="h-3.5 w-3.5" />
                      Voir le compte-rendu
                    </a>
                  </div>
                </div>

                <div className="bg-card rounded-2xl shadow-soft border border-border/60 overflow-hidden flex flex-col sm:flex-row items-center gap-0">
                  <div className="p-6 flex flex-col justify-center flex-1 order-2 sm:order-1">
                    <div className="flex items-center gap-3 mb-4">
                      <img src={groupamaLogo} alt="Groupama" loading="lazy" decoding="async" className="h-7" />
                      <span className="text-muted-foreground text-[10px] font-semibold uppercase tracking-wider">
                        Groupama Rhône-Alpes Auvergne
                      </span>
                    </div>
                    <h4 className="font-display text-base font-semibold text-foreground mb-2">
                      Responsabilité, proximité et solidarité
                    </h4>
                    <p className="text-muted-foreground text-sm leading-relaxed mb-3">
                      Groupama met en avant sa nouvelle opération de <strong className="text-foreground">journées de dépistage du cancer de la peau</strong>, organisées en partenariat avec les maires et AvisDoc.
                    </p>
                    <div className="flex items-center gap-2 text-[10px] text-muted-foreground/60">
                      <Newspaper className="h-3.5 w-3.5" />
                      <span>Les Vœux des Organisations Agricoles — 2026</span>
                    </div>
                  </div>
                  <button
                    className="w-28 sm:w-32 flex-shrink-0 order-1 sm:order-2 cursor-pointer group p-3"
                    onClick={() => setIsImageOpen(true)}
                    aria-label="Agrandir l'article"
                  >
                    <img
                      src={articleImg}
                      alt="Extrait de presse Groupama : dépistage cancer de la peau avec AvisDoc"
                      width={640}
                      height={880}
                      loading="lazy"
                      decoding="async"
                      className="w-full rounded-lg shadow-md transition-transform duration-300 group-hover:scale-105"
                    />
                    <p className="text-[9px] text-muted-foreground/60 text-center mt-1">Cliquez pour agrandir</p>
                  </button>
                </div>
              </div>
            </div>

            <div className="order-1 lg:order-2">
              <span className="chip bg-primary/10 text-primary mb-6">
                <Landmark className="h-3.5 w-3.5" />
                Pour les collectivités
              </span>

              <h2 className="font-display text-3xl md:text-5xl font-semibold text-avisdoc-ink mb-6 leading-[1.08]">
                Prévention et dépistage des cancers de la peau pour{" "}
                <span className="text-primary italic">vos administrés</span>, en partenariat avec les collectivités locales.
              </h2>

              <p className="text-muted-foreground text-base md:text-lg mb-8 leading-relaxed">
                AvisDoc organise des journées de sensibilisation et de dépistage dermatologique dans des zones sous-médicalisées, afin d'améliorer l'accès aux soins dans ces régions.
              </p>

              <ul className="space-y-3.5 mb-8">
                {benefits.map((benefit) => (
                  <li key={benefit} className="flex items-start gap-3">
                    <CheckCircle className="h-5 w-5 text-avisdoc-coral flex-shrink-0 mt-0.5" />
                    <span className="text-foreground text-sm md:text-base">{benefit}</span>
                  </li>
                ))}
              </ul>

              <Button asChild size="lg" variant="secondary" className="rounded-full group shadow-[0_12px_32px_-12px_hsl(23,86%,55%,0.5)]">
                <a href="mailto:contact@avisdoc.fr">
                  Contacter notre équipe
                  <ArrowRight className="ml-2 h-4 w-4 group-hover:translate-x-1 transition-transform" />
                </a>
              </Button>
            </div>
          </div>
        </div>
      </section>

      {isImageOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 animate-fade-in cursor-pointer"
          onClick={() => setIsImageOpen(false)}
        >
          <button
            onClick={() => setIsImageOpen(false)}
            className="absolute top-6 right-6 text-white/80 hover:text-white transition-colors"
            aria-label="Fermer"
          >
            <X className="h-8 w-8" />
          </button>
          <img
            src={articleImg}
            alt="Article Groupama"
            className="max-w-[90vw] max-h-[90vh] object-contain rounded-xl animate-scale-in"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}
    </>
  );
};

export default CollectivitiesSection;
