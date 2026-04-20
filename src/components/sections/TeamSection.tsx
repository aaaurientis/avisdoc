import { Linkedin } from "lucide-react";
import henryPawinImg from "@/assets/henry-pawin.png";
import laurentBoukobzaImg from "@/assets/laurent-boukobza.png";
import celesteLebbeImg from "@/assets/celeste-lebbe.png";
import barouyrBaroudjianImg from "@/assets/barouyr-baroudjian.png";
import florenceGalloisImg from "@/assets/florence-gallois.png";
import jfBlanchemainImg from "@/assets/jean-francois-blanchemain.jpeg";
import arthurAurientisImg from "@/assets/arthur-aurientis.jpeg";

interface TeamMember {
  name: string;
  role: string;
  subtitle?: string;
  linkedin?: string;
  photo?: string;
}

const TeamSection = () => {
  const team: TeamMember[] = [
    {
      name: "Dr. Henry Pawin",
      role: "Co-Fondateur et Président",
      subtitle: "Dermatologue · Président du comité scientifique",
      linkedin: "https://www.linkedin.com/in/henry-pawin-86744131/",
      photo: henryPawinImg,
    },
    {
      name: "Laurent Boukobza",
      role: "Directeur Général Associé",
      subtitle: "Docteur en Pharmacie",
      linkedin: "https://www.linkedin.com/in/laurent-boukobza-a577aa109/",
      photo: laurentBoukobzaImg,
    },
    {
      name: "Arthur Aurientis",
      role: "Directeur Général Associé",
      linkedin: "https://www.linkedin.com/in/arthur-aurientis-29204610/",
      photo: arthurAurientisImg,
    },
  ];

  const scientificCommittee: TeamMember[] = [
    {
      name: "Dr. Henry Pawin",
      role: "Président",
      subtitle: "Dermatologue",
      linkedin: "https://www.linkedin.com/in/henry-pawin-86744131/",
      photo: henryPawinImg,
    },
    {
      name: "Pr. Céleste Lebbé",
      role: "Vice-présidente",
      subtitle: "Professeur en Dermatologie",
      linkedin: "https://www.linkedin.com/in/celeste-lebbe-03472821/",
      photo: celesteLebbeImg,
    },
    {
      name: "Dr. Barouyr Baroudjian",
      role: "Dermatologue",
      photo: barouyrBaroudjianImg,
    },
    {
      name: "Pr. Florence Gallois",
      role: "Economiste de la santé",
      linkedin: "https://www.linkedin.com/in/florence-gallois/?locale=fr_FR",
      photo: florenceGalloisImg,
    },
    {
      name: "Dr. Jean-François Blanchemain",
      role: "Médecin Généraliste, Médecin du travail",
      linkedin: "https://www.linkedin.com/in/jean-blanchemain-63087883",
      photo: jfBlanchemainImg,
    },
  ];

  const MemberCard = ({ member, variant = "team" }: { member: TeamMember; variant?: "team" | "committee" }) => (
    <div className={`relative rounded-3xl p-6 border border-border/60 card-hover text-center ${
      variant === "committee" ? "bg-white" : "bg-card"
    }`}>
      {member.photo ? (
        <img
          src={member.photo}
          alt={`Photo de ${member.name} — ${member.role}`}
          width={192}
          height={192}
          loading="lazy"
          decoding="async"
          className="w-24 h-24 rounded-full mx-auto mb-4 object-cover ring-4 ring-primary/10 grayscale hover:grayscale-0 transition-all"
        />
      ) : (
        <div className={`w-24 h-24 rounded-full mx-auto mb-4 flex items-center justify-center text-2xl font-semibold ${
          variant === "team" ? "bg-primary/10 text-primary" : "bg-avisdoc-coral/10 text-avisdoc-coral"
        }`}>
          {member.name.split(' ').map(n => n[0]).join('')}
        </div>
      )}

      <h4 className="font-display font-semibold text-foreground text-base mb-1">
        {member.name}
      </h4>
      <p className="text-muted-foreground text-sm mb-1">{member.role}</p>
      {member.subtitle && (
        <p className="text-muted-foreground/80 text-xs leading-snug">{member.subtitle}</p>
      )}

      {member.linkedin && (
        <a
          href={member.linkedin}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center justify-center w-9 h-9 mt-4 rounded-full bg-primary/10 text-primary hover:bg-primary hover:text-primary-foreground transition-colors"
          aria-label={`LinkedIn de ${member.name}`}
        >
          <Linkedin className="h-4 w-4" />
        </a>
      )}
    </div>
  );

  return (
    <section id="equipe" className="section-padding bg-background relative overflow-hidden">
      <div aria-hidden className="absolute top-40 left-0 w-[420px] h-[420px] rounded-full bg-avisdoc-teal-soft blur-[160px] opacity-60" />
      <div aria-hidden className="absolute bottom-0 right-0 w-[420px] h-[420px] rounded-full bg-avisdoc-coral-soft blur-[160px] opacity-60" />

      <div className="section-container relative">
        <div className="text-center max-w-3xl mx-auto mb-10">
          <span className="eyebrow text-primary">Qui sommes-nous ?</span>
          <h2 className="font-display text-3xl md:text-5xl font-semibold text-avisdoc-ink mt-5 mb-6 leading-[1.08]">
            Des professionnels de santé{" "}
            <span className="italic text-primary">engagés et mobilisés.</span>
          </h2>
        </div>

        {/* Manifesto */}
        <div className="max-w-3xl mx-auto mb-20 space-y-6 text-muted-foreground text-base md:text-lg leading-relaxed">
          <p className="text-foreground font-display text-2xl md:text-3xl font-semibold text-center italic">
            La dermatologie n'attend pas.
          </p>

          <p>
            Alors que la demande de soins ne cesse de croître, le nombre de dermatologues, lui, continue de diminuer. Moins de 3 000 spécialistes exercent actuellement sur le territoire. Quatre départements n'en comptent plus aucun. Partout, les patients attendent des mois avant d'obtenir un rendez-vous. Les conséquences de cette situation vont de la renonciation aux soins aux retards de diagnostic et de prise en charge de pathologies parfois graves.
          </p>

          <p>
            Créé en 2022 par des dermatologues pour pallier cette difficulté d'accessibilité, AvisDoc s'appuie sur un principe fondateur : créer un réseau de soins dermatologiques permettant de dépister et prendre en charge à temps les lésions cutanées. Aujourd'hui, AvisDoc se concentre sur le dépistage des cancers de la peau, mélanomes et carcinomes, qui touchent 200 000 personnes chaque année et entraînent 2 000 décès.
          </p>

          <p>
            Pour y parvenir, AvisDoc agit sur trois dimensions :
          </p>

          <div className="space-y-7 pl-5 border-l-2 border-primary/25">
            <div>
              <h4 className="font-display font-semibold text-foreground text-xl mb-2">L'importance du contact humain.</h4>
              <p>
                Notre fonctionnement repose sur un réseau de soignants, déployé là où se trouvent les patients - en entreprise, dans les territoires, et notamment les zones rurales -, porté par des infirmières et infirmiers spécifiquement formés et choisis pour leur sérieux. Ce réseau est adossé à des dermatologues experts avec lesquels une confiance s'est construite dans la durée. Chaque dossier est analysé, chaque avis rendu personnalisé. Et lorsqu'une prise en charge s'impose, nous proposons aux patients qui le souhaitent de contacter des médecins partenaires, qui se sont engagés à les recevoir en priorité. Ce maillage territorial est la clé d'une prise en charge adaptée et efficace.
              </p>
            </div>
            <div>
              <h4 className="font-display font-semibold text-foreground text-xl mb-2">La force de la pédagogie et de l'éducation.</h4>
              <p>
                AvisDoc ne fait pas que dépister. Nos interventions commencent avec un moment d'éducation pour apprendre aux patients les lésions à surveiller, pratiquer l'auto-examen, adopter les bons réflexes de protection solaire. Comme les campagnes d'autopalpation mammaire ont transformé les comportements face au cancer du sein, notre souhait est d'installer une culture du dépistage cutané.
              </p>
            </div>
            <div>
              <h4 className="font-display font-semibold text-foreground text-xl mb-2">Contribuer à un problème majeur de santé publique.</h4>
              <p>
                Face à la désertification médicale, chaque initiative compte. Une lésion cancéreuse détectée à temps, ce sont autant de chances de survie supplémentaires. Ce sont aussi des interventions moins invasives pour les patients, moins coûteuses pour la société. AvisDoc ne pourra pas tout résoudre et nous n'avons pas non plus vocation à couvrir d'autres spécialités : la dermatologie est notre ancrage, notre savoir-faire, et c'est dans cette discipline que nous entendons apporter notre pierre.
              </p>
            </div>
          </div>

          <p>
            Et pour affiner notre démarche, aussi bien qu'en mesurer l'impact, AvisDoc s'est doté d'un comité scientifique chargé d'évaluer, de questionner, d'améliorer en continu. Notre engagement est finalement simple. Il consiste à tout faire pour que les patients soient mieux pris en charge et que les soignants, dont nous sommes, aient, au soir d'une journée de terrain, le sentiment d'avoir été utiles.
          </p>
        </div>

        <div className="mb-20">
          <h3 className="font-display text-2xl md:text-3xl font-semibold text-foreground text-center mb-10">
            L'équipe dirigeante
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-4xl mx-auto">
            {team.map((member) => (
              <MemberCard key={member.name} member={member} variant="team" />
            ))}
          </div>
        </div>

        <div className="bg-gradient-to-br from-avisdoc-teal-soft/60 via-white to-avisdoc-coral-soft/60 rounded-[2rem] p-8 md:p-12 border border-border/60">
          <div className="text-center max-w-2xl mx-auto mb-10">
            <span className="eyebrow text-avisdoc-coral">Comité scientifique</span>
            <h3 className="font-display text-2xl md:text-3xl font-semibold text-foreground mt-4 mb-3">
              Le comité scientifique
            </h3>
            <p className="text-muted-foreground">
              Notre comité scientifique est composé de personnalités issues de la dermatologie, du secteur de la recherche et de la santé.
            </p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-5">
            {scientificCommittee.map((member) => (
              <MemberCard key={member.name + member.role} member={member} variant="committee" />
            ))}
          </div>
        </div>
      </div>
    </section>
  );
};

export default TeamSection;
