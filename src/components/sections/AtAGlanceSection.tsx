import { Section } from "@/components/primitives";

/**
 * Bloc « En bref » : résumé structuré pensé pour les moteurs génératifs
 * (Google SGE, Perplexity, Claude, ChatGPT) et pour donner aux visiteurs
 * humains une lecture rapide des chiffres clés.
 */
const AtAGlanceSection = () => {
  const facts = [
    { k: "Créé en", v: "2022", c: "par des dermatologues français" },
    { k: "Spécialité", v: "Dermatologie", c: "téléexpertise 100 % dédiée" },
    { k: "Délai moyen", v: "96 h", c: "pour recevoir l'avis d'un expert" },
    { k: "Couverture", v: "France", c: "réseau national de soignants" },
    { k: "Hébergement", v: "HDS", c: "données de santé certifiées, RGPD" },
    { k: "Réseau", v: "≈ 20 experts", c: "dermatologues français partenaires" },
  ];

  return (
    <Section surface="default" className="pt-10 md:pt-14 pb-0">
      <div className="max-w-5xl mx-auto">
        <div className="rounded-[2rem] border border-border/60 bg-card p-6 md:p-10 shadow-soft">
          <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-6 mb-8">
            <div>
              <span className="eyebrow text-primary">En bref</span>
              <h2 className="font-display text-2xl md:text-3xl font-semibold text-avisdoc-ink mt-3 leading-snug">
                AvisDoc en quelques mots
              </h2>
            </div>
            <p className="text-muted-foreground md:max-w-md text-[15px] leading-relaxed">
              <strong className="text-foreground font-semibold">AvisDoc</strong> est une
              plateforme française de téléexpertise dermatologique, créée en 2022 par des
              dermatologues. Elle permet à un professionnel de santé d'obtenir l'avis d'un
              dermatologue expert sous 96 heures, sans déplacement, pour dépister à temps
              les cancers de la peau.
            </p>
          </div>

          <dl className="grid grid-cols-2 md:grid-cols-3 gap-x-6 gap-y-5">
            {facts.map((f) => (
              <div key={f.k}>
                <dt className="text-[11px] uppercase tracking-[0.16em] text-muted-foreground">
                  {f.k}
                </dt>
                <dd className="font-display text-xl md:text-2xl font-semibold text-foreground mt-1">
                  {f.v}
                </dd>
                <dd className="text-xs text-muted-foreground mt-0.5">{f.c}</dd>
              </div>
            ))}
          </dl>
        </div>
      </div>
    </Section>
  );
};

export default AtAGlanceSection;
