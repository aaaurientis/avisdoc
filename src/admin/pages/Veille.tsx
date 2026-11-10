// Veille › Rapports : ce que Scope, l'agent de veille, a trouvé, rapport par rapport.
// Depuis le 02/11, chaque veille (commerciale, de marché) a son rapport : ses axes, ses points clés, sa pastille.
//
// Chaque vendredi à 9 h, un rapport couvre la période écoulée depuis le
// précédent. Il s'ouvre sur trois points clés, puis les rubriques, chaque publication
// avec sa source cliquable et sa date. Un rapport non lu porte une pastille, propre
// à chacun.

import { useEffect, useMemo, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { AlertTriangle, Loader2, Radar } from "lucide-react";
import { useAuth } from "../auth/AuthContext";
import { Card, PageHeader, SectionLabel } from "../components/ui";
import BoutonRetour from "../components/BoutonRetour";
import CarteArticle from "./veille/CarteArticle";
import {
  A_DEMARCHER, articlesDu, AXES, CRMS, ouvrirDansCrm, statutsEntreprises, jourDe, listerRapports, listerRubriques, lireRapport, marquerLu, nomDeSource, periodeEnClair,
  rapportsLus, sourcesNommees, STATUTS, type Article, type Axe, type NomVeille, type Rapport, type StatutEntreprise, confiee, baseVeille, VEILLES,
} from "../lib/veille";
import { useVeille } from "./veille/useVeille";

/** Ce qui revient à une veille dans un rapport : ses points clés (ceux d'avant le 02/11, sans veille, restent à la commerciale) et ses idées de posts. */
// Un Weekly par CRM (Olivier, 09/11) : ?crm=<marché> ne garde que ce marché ; ses points clés sont ceux qui citent ses publications.
const crmDe = (v: NomVeille, cle: string | null) => (v === "commerciale" ? CRMS.find((c) => c.axe === cle) : undefined);
const axesDe = (v: NomVeille, crm?: { axe: Axe }) => (crm ? [crm.axe] : VEILLES[v].axes);
// Les rapports d'avant les axes : l'axe d'une rubrique se retrouve par son nom (axeNom).
type AxeNom = Map<string, Axe>;
const axeRub = (x: Rapport["rubriques"][number], axeNom: AxeNom) => x.axe ?? axeNom.get(x.nom);
const idsDe = (r: Rapport, axes: Axe[], axeNom: AxeNom) => new Set(r.rubriques.filter((x) => { const a = axeRub(x, axeNom); return a && axes.includes(a); }).flatMap((x) => x.articles));
const pointsDe = (r: Rapport, v: NomVeille, axeNom: AxeNom, crm?: { axe: Axe }) => {
  const siens = r.points_cles.filter((p) => (p.veille ?? "commerciale") === v);
  if (!crm) return siens;
  const ids = idsDe(r, [crm.axe], axeNom);
  return siens.filter((p) => p.articles.some((id) => ids.has(id)));
};
const postsDe = (r: Rapport, v: NomVeille) => (r.posts ?? []).filter((p) => (p.veille ?? "marche") === v);
const totalDe = (r: Rapport, axes: Axe[], axeNom: AxeNom) => r.rubriques.filter((x) => { const a = axeRub(x, axeNom); return a && axes.includes(a); }).reduce((n, x) => n + x.articles.length, 0);
import { cn } from "@/lib/utils";


export default function Veille() {
  const { rapportId } = useParams();
  const { user } = useAuth();
  const veille = useVeille();
  const [params] = useSearchParams();
  const crm = crmDe(veille, params.get("crm"));
  const suite = crm ? `?crm=${crm.axe}` : "";
  const [rapports, setRapports] = useState<Rapport[] | null>(null);
  const [lus, setLus] = useState<Set<string>>(new Set());
  const [axeNom, setAxeNom] = useState<AxeNom>(new Map());
  useEffect(() => {
    listerRubriques().then((r) => setAxeNom(new Map(r.map((x) => [x.nom, x.axe]))), () => {});
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const [r, l] = await Promise.all([listerRapports(), user?.email ? rapportsLus(user.email, veille) : Promise.resolve(new Set<string>())]);
        setRapports(r);
        setLus(l);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Les rapports n'ont pas pu être lus.");
        setRapports([]);
      }
    })();
  }, [user?.email, veille]);

  // Un vieux lien reçu par mail : le rapport n'est plus dans les derniers, on le lit seul.
  const [lointain, setLointain] = useState<Rapport | null | undefined>(undefined);
  const dansLaListe = rapportId ? rapports?.find((r) => r.id === rapportId) ?? null : null;
  useEffect(() => {
    if (!rapportId || rapports === null || dansLaListe) return;
    lireRapport(rapportId).then(setLointain).catch(() => setLointain(null));
  }, [rapportId, rapports, dansLaListe]);
  const ouvert = dansLaListe ?? lointain ?? null;

  useEffect(() => {
    if (!ouvert || !user?.email || lus.has(ouvert.id)) return;
    marquerLu(ouvert.id, user.email, veille).then(() => setLus((s) => new Set(s).add(ouvert.id)));
  }, [ouvert, user?.email, lus, veille]);

  if (rapports === null || (rapportId && !dansLaListe && lointain === undefined)) {
    return (
      <div className="flex items-center justify-center gap-2 p-16 text-sm text-muted-foreground">
        <Loader2 className="size-4 animate-spin text-avisdoc-teal" /> Chargement…
      </div>
    );
  }

  if (rapportId) {
    if (!ouvert) {
      return (
        <div>
          <BoutonRetour vers={`${baseVeille(veille)}${suite}`} />
          <p className="p-8 text-sm text-muted-foreground">Ce rapport n'existe pas ou plus.</p>
        </div>
      );
    }
    return <RapportComplet rapport={ouvert} veille={veille} crm={crm} />;
  }

  return (
    <div>
      <PageHeader title={`Weekly · ${crm ? crm.label : params.get("crm") === "synthese" ? "CRM Synthèse" : VEILLES[veille].titre}`} subtitle={`Chaque vendredi à 9 h, Scope rapporte tout ce qui est paru dans la semaine pour ${crm ? "ce CRM" : "cette veille"}.`} />
      {!rapports.length ? (
        <Card className="p-10 text-center">
          <Radar className="mx-auto mb-3 size-8 text-avisdoc-teal" />
          <p className="text-sm text-muted-foreground">Aucun rapport pour l'instant. Le premier arrivera vendredi à 9 h.</p>
        </Card>
      ) : (
        <Card className="overflow-hidden">
          <ul className="divide-y divide-border">
            {rapports.map((r) => {
              const nonLu = r.statut === "envoye" && !lus.has(r.id);
              const total = totalDe(r, axesDe(veille, crm), axeNom);
              const premier = pointsDe(r, veille, axeNom, crm)[0];
              const pret = r.statut === "envoye" || r.statut === "pret" || r.statut === "envoi";
              return (
                <li key={r.id}>
                  <Link to={`${baseVeille(veille)}/${r.id}${suite}`} className="flex items-center gap-3 px-4 py-3.5 hover:bg-muted/50 sm:px-5">
                    <span className={cn("size-2.5 shrink-0 rounded-full", nonLu ? "bg-avisdoc-orange" : "bg-transparent")} aria-label={nonLu ? "Non lu" : undefined} />
                    <span className="min-w-0 flex-1">
                      <span className={cn("block truncate text-[14px] text-avisdoc-ink first-letter:uppercase", nonLu ? "font-bold" : "font-semibold")}>{jourDe(r.periode_fin)}</span>
                      <span className="block truncate text-[12px] text-muted-foreground">
                        {pret ? `${total} publication${total > 1 ? "s" : ""}${premier ? ` · ${premier.texte}` : ""}` : STATUTS[r.statut] ?? r.statut}
                      </span>
                    </span>
                    {r.sources_en_panne.length > 0 && <AlertTriangle className="size-4 shrink-0 text-avisdoc-orange" aria-label="Des sources n'ont pas répondu" />}
                    {!pret && <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-[11px] font-bold text-muted-foreground">{STATUTS[r.statut] ?? r.statut}</span>}
                  </Link>
                </li>
              );
            })}
          </ul>
        </Card>
      )}
    </div>
  );
}


function RapportComplet({ rapport, veille, crm }: { rapport: Rapport; veille: NomVeille; crm?: { axe: Axe; label: string } }) {
  const [articles, setArticles] = useState<Article[] | null>(null);
  const [noms, setNoms] = useState<Map<string, string>>(new Map());
  const [axeDe, setAxeDe] = useState<Map<string, Axe>>(new Map());
  const [statuts, setStatuts] = useState<Map<string, StatutEntreprise>>(new Map());

  useEffect(() => {
    (async () => {
      try {
        const [a, s, r] = await Promise.all([articlesDu(rapport.id), sourcesNommees(), listerRubriques()]);
        setArticles(a);
        setNoms(new Map(s.map((x) => [x.cle, x.nom])));
        setAxeDe(new Map(r.map((x) => [x.nom, x.axe])));
        setStatuts(await statutsEntreprises(a.map((x) => x.entreprise ?? "")));
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Le rapport n'a pas pu être lu.");
        setArticles([]);
      }
    })();
  }, [rapport.id]);

  const parId = useMemo(() => new Map((articles ?? []).map((a) => [a.id, a])), [articles]);
  // Les rapports d'avant les axes : l'axe se retrouve par le nom de la rubrique.
  const axe = (x: Rapport["rubriques"][number]): Axe => x.axe ?? axeDe.get(x.nom) ?? "nouveautes";

  const confie = (a: Article) => (prospectId: string, referent: string) => setStatuts((m) => new Map(m).set((a.entreprise ?? "").trim().toLowerCase(), confiee(prospectId, referent)));
  const carteArticle = (a: Article, cle: string) => (
    <CarteArticle key={a.id} a={a} noms={noms} demarcher={A_DEMARCHER.has(cle)} statut={a.entreprise ? statuts.get(a.entreprise.trim().toLowerCase()) : undefined} onConfie={confie(a)} onRetrait={(x, quoi) => setArticles((l) => (quoi !== "remise" ? (l ?? []).filter((y) => y.id !== x.id) : [...(l ?? []), x]))} ouvrirDans={ouvrirDansCrm(cle)} />
  );

  const points = pointsDe(rapport, veille, axeDe, crm);
  const posts = postsDe(rapport, veille);
  const axes = axesDe(veille, crm);
  const blocs = AXES.filter((x) => x.cle === "publier" || axes.includes(x.cle as Axe)).map((x) => {
    if (x.cle === "publier") {
      if (!posts.length) return null;
      return (
        <Card key={x.cle} className="overflow-hidden">
          <EnteteAxe titre={x.titre} sousTitre={x.sousTitre} nombre={posts.length} />
          <ul className="divide-y divide-border">
            {posts.map((p, i) => (
              <li key={i} className="px-5 py-4">
                <p className="mb-1.5 text-[14px] font-bold text-avisdoc-ink">{p.titre}</p>
                <p className="whitespace-pre-wrap rounded-xl bg-muted/60 px-4 py-3 text-[13px] leading-relaxed text-avisdoc-ink">{p.brouillon}</p>
                <p className="mt-1.5 flex flex-wrap gap-x-3 text-[12px] text-muted-foreground">
                  S'appuie sur :
                  {p.articles.map((id) => parId.get(id)).filter(Boolean).map((a) => (
                    <a key={a!.id} href={a!.url} target="_blank" rel="noreferrer" className="text-avisdoc-teal hover:underline">{nomDeSource(a!, noms)}</a>
                  ))}
                </p>
              </li>
            ))}
          </ul>
        </Card>
      );
    }
    const rubs = rapport.rubriques.filter((r) => axe(r) === x.cle)
      .map((r) => ({ nom: r.nom, liste: r.articles.map((id) => parId.get(id)).filter((a): a is Article => Boolean(a)) }))
      .filter((r) => r.liste.length);
    if (!rubs.length) return null;
    return (
      <Card key={x.cle} className="overflow-hidden">
        <EnteteAxe titre={x.titre} sousTitre={x.sousTitre} nombre={rubs.reduce((n, r) => n + r.liste.length, 0)} />
        {rubs.map((r) => (
          <div key={r.nom}>
            {rubs.length > 1 && <p className="border-b border-border bg-muted/30 px-5 py-1.5 text-[12px] font-bold text-avisdoc-ink">{r.nom}</p>}
            <ul className="divide-y divide-border">{r.liste.map((a) => carteArticle(a, x.cle))}</ul>
          </div>
        ))}
      </Card>
    );
  });

  return (
    <div>
      <BoutonRetour vers={`${baseVeille(veille)}${crm ? `?crm=${crm.axe}` : ""}`} libelle="Tous les Weekly" />
      <PageHeader title={`Weekly · ${crm ? crm.label : VEILLES[veille].titre} du ${jourDe(rapport.periode_fin)}`} subtitle={periodeEnClair(rapport)} />

      {rapport.sources_en_panne.length > 0 && (
        <div className="mb-4 flex items-start gap-2 rounded-2xl border border-avisdoc-orange/30 bg-avisdoc-orange/10 px-4 py-3 text-[13px] text-avisdoc-ink">
          <AlertTriangle className="mt-0.5 size-4 shrink-0 text-avisdoc-orange" />
          <span>Sources qui n'ont pas répondu cette fois : {rapport.sources_en_panne.join(", ")}. Ce qu'elles auraient trouvé manque à ce rapport.</span>
        </div>
      )}

      {articles === null ? (
        <div className="flex items-center justify-center gap-2 p-16 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin text-avisdoc-teal" /> Chargement…
        </div>
      ) : (
        <div className="space-y-5">
          {points.length > 0 && (
            <Card className="p-5 sm:p-6">
              <SectionLabel className="mb-3 text-avisdoc-teal">À retenir</SectionLabel>
              {/* L'essentiel en deux phrases : les articles se lisent plus bas, une seule fois. */}
              <ol className="space-y-3">
                {points.map((p, i) => (
                  <li key={i} className="flex gap-3">
                    <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-avisdoc-teal text-[12px] font-bold text-white">{i + 1}</span>
                    <p className="min-w-0 text-[14px] leading-relaxed text-avisdoc-ink">{p.texte}</p>
                  </li>
                ))}
              </ol>
            </Card>
          )}

          {blocs}

          {!totalDe(rapport, axes, axeDe) && rapport.statut === "envoye" && (
            <Card className="p-8 text-center text-sm text-muted-foreground">Rien de marquant sur la période.</Card>
          )}
          {rapport.statut !== "envoye" && rapport.statut !== "pret" && (
            <Card className="flex items-center justify-center gap-2 p-8 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin text-avisdoc-teal" /> {STATUTS[rapport.statut] ?? rapport.statut}…
            </Card>
          )}
        </div>
      )}
    </div>
  );
}

function EnteteAxe({ titre, sousTitre, nombre }: { titre: string; sousTitre: string; nombre: number }) {
  return (
    <div className="border-b border-border px-5 py-3">
      <div className="flex items-center gap-2">
        <h2 className="text-[14px] font-bold uppercase tracking-[0.05em] text-avisdoc-orange">{titre}</h2>
        <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-bold text-muted-foreground">{nombre}</span>
      </div>
      <p className="mt-0.5 text-[12px] text-muted-foreground">{sousTitre}</p>
    </div>
  );
}
