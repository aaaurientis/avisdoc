// Veille › Archivés : les publications retirées avec « Archiver ». Cachées pour tout le monde (écrans,
// rapports, alertes, Scope), elles se remettent d'un clic ; « Supprimer » les efface pour de bon.

import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { Card, PageHeader } from "../components/ui";
import CarteArticle from "./veille/CarteArticle";
import { AXES, ouvrirDansCrm, listerArchives, listerRubriques, sourcesNommees, type Article, VEILLES, veilleDe } from "../lib/veille";
import { useVeille } from "./veille/useVeille";

type Archivee = Article & { trie_le: string | null; retire_le: string };

export default function VeilleArchives() {
  const veille = useVeille();
  // ?seul=<marché> : les archivés d'un seul marché, depuis le CRM de ce marché.
  const [params] = useSearchParams();
  const seul = AXES.find((x) => x.cle === params.get("seul") && (VEILLES[veille].axes as string[]).includes(x.cle));
  const [articles, setArticles] = useState<Archivee[] | null>(null);
  const [noms, setNoms] = useState<Map<string, string>>(new Map());
  const [axeDe, setAxeDe] = useState<Map<string, string>>(new Map());

  useEffect(() => {
    setArticles(null);
    // Chaque veille ne montre que ses archivés : l'axe de la rubrique dit à quelle veille appartient une publication.
    Promise.all([listerArchives(), sourcesNommees(), listerRubriques()]).then(([a, s, r]) => {
      const axeDe = new Map(r.map((x) => [x.nom, x.axe]));
      setAxeDe(axeDe);
      setArticles(a.filter((x) => {
        const ax = x.rubrique ? axeDe.get(x.rubrique) : undefined;
        return seul ? ax === seul.cle : veilleDe(ax) === veille;
      }));
      setNoms(new Map(s.map((x) => [x.cle, x.nom])));
    }, (err) => {
      toast.error(err instanceof Error ? err.message : "Les archivés n'ont pas pu être lus.");
      setArticles([]);
    });
  }, [veille, seul]);

  return (
    <div>
      <PageHeader
        title={`Archivés · ${seul ? seul.titre : VEILLES[veille].titre}`}
        subtitle="Les publications retirées avec « Archiver » : cachées pour tout le monde. « Remettre » les rend à leur case ; « Supprimer » les efface pour de bon."
      />
      <Card className="overflow-hidden">
        {articles === null ? (
          <div className="flex items-center justify-center gap-2 p-16 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin text-avisdoc-teal" /> Chargement…
          </div>
        ) : !articles.length ? (
          <p className="p-8 text-center text-sm text-muted-foreground">Aucune publication archivée.</p>
        ) : (
          <ul className="divide-y divide-border">
            {articles.map((a) => (
              <CarteArticle
                key={a.id}
                a={a}
                noms={noms}
                demarcher={false}
                archivee
                ouvrirDans={ouvrirDansCrm(a.rubrique ? axeDe.get(a.rubrique) : undefined)}
                onConfie={() => {}}
                onRetrait={(x) => setArticles((l) => (l ?? []).filter((y) => y.id !== x.id))}
              />
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
