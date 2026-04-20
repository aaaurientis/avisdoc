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
      <section id="collectivites" className="section-padding bg-muted/30">
        <div className="section-container">
          <div className="grid lg:grid-cols-2 gap-12 lg:gap-16 items-center">
            {/* Visual */}
            <div className="relative order-2 lg:order-1">
              <div className="bg-gradient-to-br from-secondary/10 to-primary/10 rounded-3xl p-8 lg:p-12 space-y-6">
                <div className="bg-card rounded-2xl p-6 shadow-lg border border-border/50 flex items-center gap-5">
                  <img src={gillesNoelImg} alt="Gilles Noël" className="w-16 h-16 rounded-full object-cover flex-shrink-0" />
                  <div>
                    <p className="text-muted-foreground italic mb-3 text-sm">
                      "Les inégalités d'accès aux soins en ruralité sont une réalité criante laissant nos concitoyens trop souvent en souffrance. Les collectivités locales, interlocutrices privilégiées de ces derniers, sont des "remparts" de proximité contre cet état de fait grâce aux initiatives locales qu'elles génèrent."
                    </p>
                    <p className="text-foreground font-semibold text-sm">Gilles Noël</p>
                    <p className="text-muted-foreground text-xs">Maire de Varzy</p>
                    <a
                      href="/documents/rendu-experience-teleexpertise-dermato-58.pdf"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 text-primary text-xs mt-2 hover:underline"
                    >
                      <FileText className="h-3.5 w-3.5" />
                      Voir le compte-rendu
                    </a>
                  </div>
                </div>

                {/* Groupama press card */}
                <div className="bg-card rounded-2xl shadow-lg border border-border/50 overflow-hidden flex flex-col sm:flex-row items-center gap-0">
                  <div className="p-6 flex flex-col justify-center flex-1 order-2 sm:order-1">
                    <div className="flex items-center gap-3 mb-4">
                      <img src={groupamaLogo} alt="Groupama" className="h-7" />
                      <span className="text-muted-foreground text-[10px] font-medium uppercase tracking-wider">
                        Groupama Rhône-Alpes Auvergne
                      </span>
                    </div>
                    <h4 className="font-display text-base font-bold text-foreground mb-2">
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
                  <div
                    className="w-28 sm:w-32 flex-shrink-0 order-1 sm:order-2 cursor-pointer group p-3"
                    onClick={() => setIsImageOpen(true)}
                  >
                    <img
                      src={articleImg}
                      alt="Article Groupama"
                      className="w-full rounded-lg shadow-md transition-transform duration-300 group-hover:scale-105"
                    />
                    <p className="text-[9px] text-muted-foreground/50 text-center mt-1">Cliquez pour agrandir</p>
                  </div>
                </div>
              </div>
              <div className="absolute -top-4 -left-4 w-24 h-24 bg-primary/20 rounded-full blur-2xl" />
            </div>

            {/* Content */}
            <div className="order-1 lg:order-2 text-center">
              <div className="inline-flex items-center gap-3 bg-primary/10 px-4 py-2 rounded-full mb-6">
                <Landmark className="h-5 w-5 text-primary" />
                <span className="font-semibold text-primary text-sm">Pour les collectivités</span>
              </div>
              
              <h2 className="font-display text-3xl md:text-4xl font-bold text-foreground mb-6">
                Prévention et dépistage des cancers de la peau pour <span className="text-primary">vos administrés, en partenariat avec les collectivités locales</span>
              </h2>
              
              <p className="text-muted-foreground text-lg mb-8">
                AvisDoc organise des journées de sensibilisation et de dépistage dermatologique dans des zones sous-médicalisées, afin d'améliorer l'accès aux soins dans ces régions.
              </p>

              <ul className="space-y-4 mb-8">
                {benefits.map((benefit) => (
                  <li key={benefit} className="flex items-start gap-3">
                    <CheckCircle className="h-5 w-5 text-secondary flex-shrink-0 mt-0.5" />
                    <span className="text-foreground">{benefit}</span>
                  </li>
                ))}
              </ul>

              <Button asChild size="lg" variant="secondary" className="group">
                <a href="mailto:contact@avisdoc.fr">
                  Contacter notre équipe
                  <ArrowRight className="ml-2 h-4 w-4 group-hover:translate-x-1 transition-transform" />
                </a>
              </Button>
            </div>
          </div>
        </div>
      </section>

      {/* Lightbox */}
      {isImageOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 animate-fade-in cursor-pointer"
          onClick={() => setIsImageOpen(false)}
        >
          <button
            onClick={() => setIsImageOpen(false)}
            className="absolute top-6 right-6 text-white/70 hover:text-white transition-colors"
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