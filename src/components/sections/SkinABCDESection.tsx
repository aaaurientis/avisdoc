import Reveal from "@/components/Reveal";

const criteria = [
  {
    letter: "A",
    title: "Asymétrie",
    description: "Les deux moitiés du grain de beauté ne se superposent pas.",
    color: "bg-primary/10 text-primary",
  },
  {
    letter: "B",
    title: "Bords",
    description: "Les bords sont irréguliers, dentelés ou mal délimités.",
    color: "bg-[hsl(var(--avisdoc-sage)/0.15)] text-[hsl(var(--avisdoc-sage))]",
  },
  {
    letter: "C",
    title: "Couleur",
    description: "La couleur est non uniforme : plusieurs nuances de brun, noir, rouge ou blanc.",
    color: "bg-avisdoc-coral-soft text-avisdoc-coral",
  },
  {
    letter: "D",
    title: "Diamètre",
    description: "Le diamètre est supérieur à 6 mm, ou augmente dans le temps.",
    color: "bg-primary/10 text-primary",
  },
  {
    letter: "E",
    title: "Évolution",
    description: "La lésion change : taille, forme, couleur, relief, ou démange et saigne.",
    color: "bg-avisdoc-coral-soft text-avisdoc-coral",
  },
];

const SkinABCDESection = () => {
  return (
    <section id="abcde" className="section-padding bg-background relative overflow-hidden">
      <div aria-hidden className="absolute -top-24 left-1/4 w-[420px] h-[420px] rounded-full bg-primary/10 blur-[160px]" />
      <div aria-hidden className="absolute bottom-0 right-1/4 w-[360px] h-[360px] rounded-full bg-avisdoc-coral/15 blur-[160px]" />

      <div className="relative section-container">
        <Reveal className="text-center max-w-3xl mx-auto mb-14">
          <span className="eyebrow text-primary">Prévention · Éducation</span>
          <h2 className="font-display text-3xl md:text-5xl font-semibold text-avisdoc-ink mt-5 mb-5 leading-[1.08]">
            La méthode{" "}
            <span className="italic text-primary">ABCDE</span>{" "}
            pour mieux surveiller votre peau.
          </h2>
          <p className="text-muted-foreground text-base md:text-lg leading-relaxed">
            Auto-examen régulier, en complément du dépistage médical : cinq critères simples
            pour repérer un grain de beauté qui mérite un avis spécialisé.
          </p>
        </Reveal>

        <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-4 md:gap-5 max-w-6xl mx-auto">
          {criteria.map((c, i) => (
            <Reveal key={c.letter} delay={i * 80}>
              <article className="relative h-full bg-card rounded-3xl p-6 border border-border/60 card-hover">
                <div className={`h-14 w-14 rounded-2xl flex items-center justify-center mb-5 font-display text-2xl font-semibold ${c.color}`}>
                  {c.letter}
                </div>
                <h3 className="font-display text-lg font-semibold text-foreground mb-2">
                  {c.title}
                </h3>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  {c.description}
                </p>
              </article>
            </Reveal>
          ))}
        </div>

        <Reveal delay={200} className="mt-10 max-w-3xl mx-auto">
          <div className="flex flex-col md:flex-row items-center gap-4 md:gap-6 rounded-3xl border border-primary/20 bg-gradient-to-br from-avisdoc-teal-soft/70 to-avisdoc-coral-soft/50 p-6 md:p-7">
            <div className="h-12 w-12 shrink-0 rounded-2xl bg-white flex items-center justify-center shadow-soft">
              <svg className="h-6 w-6 text-primary" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" />
                <path d="M12 16v-4M12 8h.01" />
              </svg>
            </div>
            <p className="text-sm md:text-base text-foreground/90 leading-relaxed">
              Un doute persistant ? Consultez un professionnel de santé.
              La téléexpertise AvisDoc permet d'obtenir un avis dermatologique
              expert sous <strong className="font-semibold">96 heures</strong>, sans déplacement.
            </p>
          </div>
        </Reveal>
      </div>
    </section>
  );
};

export default SkinABCDESection;
