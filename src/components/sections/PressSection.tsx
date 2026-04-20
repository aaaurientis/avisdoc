import { useState } from "react";
import { Newspaper, X } from "lucide-react";
import groupamaLogo from "@/assets/logos/groupama.png";
import articleImg from "@/assets/press/groupama-article.png";

const PressSection = () => {
  const [isImageOpen, setIsImageOpen] = useState(false);

  return (
    <>
      <section className="section-padding bg-background">
        <div className="section-container">
          <div className="text-center max-w-3xl mx-auto mb-14">
            <span className="eyebrow text-avisdoc-coral">Presse</span>
            <h2 className="font-display text-3xl md:text-5xl font-semibold text-avisdoc-ink mt-5 mb-4 leading-[1.08]">
              Ils parlent <span className="italic text-primary">de nous.</span>
            </h2>
          </div>

          <div className="max-w-4xl mx-auto">
            <article className="bg-card rounded-[2rem] border border-border/60 shadow-soft overflow-hidden flex flex-col lg:flex-row items-stretch">
              <div className="p-8 lg:p-10 flex flex-col justify-center flex-1 order-2 lg:order-1">
                <div className="flex items-center gap-4 mb-6">
                  <img src={groupamaLogo} alt="Logo Groupama" loading="lazy" decoding="async" className="h-8" />
                  <span className="text-muted-foreground text-xs font-semibold uppercase tracking-wider">
                    Groupama Rhône-Alpes Auvergne
                  </span>
                </div>

                <h3 className="font-display text-xl md:text-2xl font-semibold text-foreground mb-4 leading-snug">
                  Responsabilité, proximité et solidarité
                </h3>

                <p className="text-muted-foreground leading-relaxed mb-4">
                  Parmi les actions marquantes de 2025, Groupama met en avant sa nouvelle opération de <strong className="text-foreground">journées de dépistage du cancer de la peau</strong>, organisées en partenariat avec les maires et AvisDoc, service français de téléexpertise dermatologique.
                </p>

                <p className="text-muted-foreground leading-relaxed mb-6">
                  Dans un département où les dermatologues sont peu nombreux, cette initiative s'est révélée particulièrement utile : <em>« car protéger sa peau, c'est protéger sa santé. Nous voulons aider chacun à détecter les anomalies cutanées le plus tôt possible. »</em>
                </p>

                <div className="flex items-center gap-2 text-xs text-muted-foreground/70">
                  <Newspaper className="h-4 w-4" />
                  <span>Les Vœux des Organisations Agricoles — 2026</span>
                </div>
              </div>

              <button
                className="flex-shrink-0 lg:w-48 order-1 lg:order-2 cursor-pointer group p-4 lg:p-6 bg-gradient-to-br from-avisdoc-teal-soft/50 to-avisdoc-coral-soft/50 lg:border-l border-t lg:border-t-0 border-border/60"
                onClick={() => setIsImageOpen(true)}
                aria-label="Agrandir l'article"
              >
                <img
                  src={articleImg}
                  alt="Article Groupama Rhône-Alpes Auvergne mentionnant AvisDoc"
                  width={640}
                  height={880}
                  loading="lazy"
                  decoding="async"
                  className="w-full max-w-[180px] mx-auto rounded-lg shadow-md transition-transform duration-300 group-hover:scale-105"
                />
                <p className="text-[11px] text-muted-foreground/70 text-center mt-2">Cliquez pour agrandir</p>
              </button>
            </article>
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

export default PressSection;
