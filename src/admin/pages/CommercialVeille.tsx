// Commercial › Veille : les entreprises que Vigile a repérées (« À démarcher › Entreprises »), pour les
// commerciaux. Les « À ne pas rater » en tête ; ce qui est arrivé depuis votre dernière visite porte la
// pastille « Nouveau » (et le compte rouge du menu). Rien ne va au Pipeline : on confie d'ici, si l'on veut.

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { useAuth } from "../auth/AuthContext";
import { Card, PageHeader } from "../components/ui";
import CarteArticle from "./veille/CarteArticle";
import { confiee, listerCommercial, noterOngletVu, ongletsVus, sourcesNommees, statutsEntreprises, VU_PAR_DEFAUT, type Article, type StatutEntreprise } from "../lib/veille";

type Direct = Article & { trie_le: string | null };

export default function CommercialVeille() {
  const { user } = useAuth();
  const [articles, setArticles] = useState<Direct[] | null>(null);
  const [noms, setNoms] = useState<Map<string, string>>(new Map());
  const [statuts, setStatuts] = useState<Map<string, StatutEntreprise>>(new Map());
  const [vu, setVu] = useState<string | null>(null);

  useEffect(() => {
    if (!user?.email) return;
    (async () => {
      try {
        // La dernière visite est lue d'abord ; la nouvelle se note à l'heure d'avant la lecture.
        const avant = new Date().toISOString();
        const [a, s, v] = await Promise.all([listerCommercial(), sourcesNommees(), ongletsVus(user.email)]);
        setArticles(a);
        setNoms(new Map(s.map((x) => [x.cle, x.nom])));
        setVu(v.get("commercial") ?? VU_PAR_DEFAUT());
        await noterOngletVu(user.email, "commercial", avant).catch(() => {});
        setStatuts(await statutsEntreprises(a.map((x) => x.entreprise ?? "")));
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "La veille commerciale n'a pas pu être lue.");
        setArticles([]);
      }
    })();
  }, [user?.email]);

  const nouveaux = (articles ?? []).filter((a) => vu && a.trie_le && a.trie_le > vu).length;
  const urgents = (articles ?? []).filter((a) => a.urgent).length;

  return (
    <div>
      <PageHeader
        title="Veille"
        subtitle="Les entreprises que Vigile a repérées parce qu'elles parlent publiquement de la santé de leurs salariés : des clients potentiels. Les « À ne pas rater » sont en tête. Un mail vous prévient dès qu'il en arrive."
      />
      <Card className="overflow-hidden">
        {articles !== null && articles.length > 0 && (
          <p className="border-b border-border bg-muted/40 px-5 py-2.5 text-[12px] text-muted-foreground">
            <b className="text-avisdoc-ink">{articles.length}</b> entreprise{articles.length > 1 ? "s" : ""}
            {urgents > 0 && <> · <b className="text-red-600">{urgents} à ne pas rater</b></>}
            {nouveaux > 0 && <> · <b className="text-avisdoc-orange">{nouveaux} nouvelle{nouveaux > 1 ? "s" : ""} depuis votre dernière visite</b></>}
            {" "}· « Confier à un commercial » crée sa fiche dans Prospection.
          </p>
        )}
        {articles === null ? (
          <div className="flex items-center justify-center gap-2 p-16 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin text-avisdoc-teal" /> Chargement…
          </div>
        ) : !articles.length ? (
          <p className="p-8 text-center text-sm text-muted-foreground">Aucune entreprise pour l'instant.</p>
        ) : (
          <ul className="divide-y divide-border">
            {articles.map((a) => (
              <CarteArticle
                key={a.id}
                a={a}
                noms={noms}
                demarcher
                nouveau={Boolean(vu && a.trie_le && a.trie_le > vu)}
                statut={a.entreprise ? statuts.get(a.entreprise.trim().toLowerCase()) : undefined}
                onConfie={(id, referent) => setStatuts((m) => new Map(m).set((a.entreprise ?? "").trim().toLowerCase(), confiee(id, referent)))}
                onRetrait={(x, quoi) => setArticles((l) => {
                  const reste = (l ?? []).filter((y) => y.id !== x.id);
                  return quoi === "remise" ? [...reste, x as Direct].sort((p, q) => Number(Boolean(q.urgent)) - Number(Boolean(p.urgent)) || String(q.trie_le ?? "").localeCompare(String(p.trie_le ?? ""))) : reste;
                })}
              />
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
