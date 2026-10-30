// Veille › Archivés : les publications retirées avec « Archiver ». Cachées pour tout le monde (écrans,
// rapports, alertes, Vigile), elles se remettent d'un clic ; « Supprimer » les efface pour de bon.

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { Card, PageHeader } from "../components/ui";
import CarteArticle from "./veille/CarteArticle";
import { listerArchives, sourcesNommees, type Article } from "../lib/veille";

type Archivee = Article & { trie_le: string | null; retire_le: string };

export default function VeilleArchives() {
  const [articles, setArticles] = useState<Archivee[] | null>(null);
  const [noms, setNoms] = useState<Map<string, string>>(new Map());

  useEffect(() => {
    Promise.all([listerArchives(), sourcesNommees()]).then(([a, s]) => {
      setArticles(a);
      setNoms(new Map(s.map((x) => [x.cle, x.nom])));
    }, (err) => {
      toast.error(err instanceof Error ? err.message : "Les archivés n'ont pas pu être lus.");
      setArticles([]);
    });
  }, []);

  return (
    <div>
      <PageHeader
        title="Archivés"
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
