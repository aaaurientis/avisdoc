// Aide de la Veille Marché (Olivier, 09/11) : la veille ne se travaille pas comme un CRM, elle a donc
// sa propre aide. Chaque phrase décrit ce que font les écrans de la veille (VeilleDirect, Veille,
// VeilleArchives, Vigile, Suggestions) ; à reprendre si l'un d'eux change. Paramétrage et CPR sont dans Admin depuis le 09/11.

import { Link } from "react-router-dom";
import { ArrowRight, ChevronDown } from "lucide-react";
import { Card, PageHeader, SectionLabel } from "../components/ui";

const CHEMIN = [
  { etape: "Scope cherche", texte: "Chaque matin à 7 h, et toutes les 3 heures pour les sources gratuites : presse, bases scientifiques, web et réseaux sociaux." },
  { etape: "Scope trie", texte: "Il garde ce qui concerne AvisDoc, le range dans un onglet, le résume et écrit ce que ça change pour AvisDoc." },
  { etape: "Vous lisez", texte: "Tout arrive aussitôt dans l'onglet du sujet. Ce qui est arrivé depuis votre dernière visite porte « Nouveau »." },
  { etape: "Le Weekly", texte: "Chaque vendredi à 9 h, Scope fait le point de la semaine, et le Weekly part par mail à ceux qui sont inscrits." },
];

const ECRANS = [
  { titre: "Les avis sur AvisDoc", to: "/veille/marche/direct?seul=nous", texte: "Ce que d'autres disent d'AvisDoc : presse, avis, commentaires, posts de clients, de médecins ou de concurrents. Ce qu'AvisDoc publie elle-même n'y est pas. En tête, les noms que Scope cherche." },
  { titre: "Évènements", to: "/veille/marche/direct?seul=evenements", texte: "Salons, congrès, conférences et journées contre le cancer à venir : où exposer, rencontrer des clients, sponsoriser, ou quoi relayer sur LinkedIn. La date et le lieu sont dans le résumé quand ils sont connus." },
  { titre: "Concurrence", to: "/veille/marche/direct?seul=concurrents", texte: "Ce que font les concurrents d'AvisDoc (annonces, contrats, levées de fonds, posts) et ce que ça change pour AvisDoc." },
  { titre: "Publi Scientifiques", to: "/veille/marche/direct?seul=publications", texte: "Études, essais cliniques et avis scientifiques sur la peau et le dépistage : des arguments chiffrés pour vendre et pour publier." },
  { titre: "Weekly", to: "/veille/marche", texte: "Le point de chaque vendredi : trois points à retenir, puis les publications de la semaine rangées par sujet, chacune avec sa source et sa date. Les Weekly des semaines passées restent dans la liste." },
  { titre: "Archivés", to: "/veille/marche/archives", texte: "Les publications retirées avec « Archiver ». Elles sont cachées pour tout le monde, et « Remettre » les fait revenir dans leur onglet." },
];

const BOUTONS = [
  { titre: "Scope", texte: "Posez-lui une question sur ce qu'il a trouvé, par exemple « les études sur le soleil et le cancer de la peau parues ce mois-ci ». Il répond avec les liens. Vos conversations ne sont qu'à vous." },
  { titre: "Suggérer un mot ou une cible", texte: "Un mot à guetter, un concurrent, un site ou une page que Scope devrait suivre : écrivez-le, la demande part aux admins, qui règlent la veille dans Admin › Paramétrage veille." },
];

const QUESTIONS = [
  { q: "Que veulent dire « À lire », « Utile » et « Pour mémoire » ?", r: "C'est l'importance que Scope donne à la publication pour AvisDoc : « À lire » d'abord, « Pour mémoire » si vous avez le temps." },
  { q: "Une publication ne m'intéresse pas : que faire ?", r: "Cliquez « Retirer », puis choisissez. « Archiver » la range dans Archivés, d'où on la remet d'un clic. « Supprimer » l'efface pour de bon : elle ne passe pas par la Corbeille, et Scope ne la ramènera plus. Dans les deux cas, c'est pour tout le monde." },
  { q: "Le lien d'une publication ne s'ouvre pas.", r: "Certains sites refusent les robots. Le lien s'ouvre quand même dans votre navigateur, et « Copier le lien » permet de le coller ailleurs." },
  { q: "Qui reçoit le Weekly par mail ?", r: "Ceux qui ont la case « Reçoit le Weekly » cochée pour la Veille Marché, dans Admin › Réglages › Veille." },
  { q: "Scope rate un sujet ou un concurrent : comment l'ajouter ?", r: "Cliquez « Suggérer un mot ou une cible », à côté du titre de la page, et écrivez ce qui manque. Un admin l'ajoute dans Admin › Paramétrage veille ; Scope en tient compte à sa tournée suivante." },
];

export default function AideVeille() {
  return (
    <div className="max-w-4xl">
      <PageHeader title="Aide · Veille Marché" subtitle="La veille ne se démarche pas : elle s'informe. Ce qu'on dit d'AvisDoc, les évènements, la concurrence et la science, trouvés et triés par Scope." />

      <Card className="mb-6 p-5">
        <SectionLabel>Le chemin d'une publication</SectionLabel>
        <ol className="mt-3 grid gap-3 sm:grid-cols-4">
          {CHEMIN.map((p, i) => (
            <li key={p.etape} className="flex gap-2 sm:flex-col">
              <span className="flex items-center gap-2 text-sm font-bold text-avisdoc-ink">
                <span className="inline-flex size-6 shrink-0 items-center justify-center rounded-full bg-avisdoc-teal text-[12px] text-white">{i + 1}</span>
                {p.etape}
              </span>
              <span className="text-[13px] leading-relaxed text-muted-foreground">{p.texte}</span>
            </li>
          ))}
        </ol>
      </Card>

      <section className="mb-8">
        <h2 className="mb-3 font-display text-xl font-semibold text-avisdoc-ink">Les écrans, un par un</h2>
        <div className="flex flex-col gap-3">
          {ECRANS.map((e) => (
            <Card key={e.titre} className="flex flex-col gap-2 p-5 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0">
                <h3 className="font-display text-lg font-semibold text-avisdoc-ink">{e.titre}</h3>
                <p className="mt-1 text-[13px] leading-relaxed text-muted-foreground">{e.texte}</p>
              </div>
              <Link to={e.to} className="inline-flex shrink-0 items-center gap-1.5 self-start rounded-full bg-accent px-4 py-2 text-[13px] font-bold text-avisdoc-ink transition-colors hover:bg-avisdoc-ink hover:text-white">
                Ouvrir <ArrowRight className="size-3.5" />
              </Link>
            </Card>
          ))}
        </div>
      </section>

      <section className="mb-8">
        <h2 className="mb-1 font-display text-xl font-semibold text-avisdoc-ink">Les deux petits boutons</h2>
        <p className="mb-3 text-[13px] text-muted-foreground">À côté du titre de chaque page de la veille.</p>
        <Card className="divide-y divide-border">
          {BOUTONS.map((b) => (
            <div key={b.titre} className="px-5 py-3">
              <p className="text-sm font-bold text-avisdoc-ink">{b.titre}</p>
              <p className="mt-0.5 text-[13px] leading-relaxed text-muted-foreground">{b.texte}</p>
            </div>
          ))}
        </Card>
      </section>

      <section>
        <h2 className="mb-3 font-display text-xl font-semibold text-avisdoc-ink">Questions fréquentes</h2>
        <Card className="overflow-hidden">
          {QUESTIONS.map(({ q, r }) => (
            <details key={q} className="group border-b border-border last:border-b-0">
              <summary className="flex min-h-11 cursor-pointer list-none items-center gap-3 px-4 py-3 text-sm font-semibold text-avisdoc-ink [&::-webkit-details-marker]:hidden">
                <span className="min-w-0 flex-1">{q}</span>
                <ChevronDown className="size-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-180" />
              </summary>
              <p className="px-4 pb-4 text-[13px] leading-relaxed text-muted-foreground">{r}</p>
            </details>
          ))}
        </Card>
      </section>
    </div>
  );
}
