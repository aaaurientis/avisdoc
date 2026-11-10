// Veille › En direct : tout ce que Scope retient entre deux rapports, au fil de ses tournées
// (chaque matin à 7 h, et toutes les 3 heures pour les sources gratuites). Chaque onglet donne son
// total, et en pastille rouge ce qui est arrivé depuis que vous l'avez ouvert. Une entreprise qui
// publie se confie à un commercial d'ici, sans attendre le rapport.

import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { Loader2, MessageCircle } from "lucide-react";
import { useAuth } from "../auth/AuthContext";
import { Card } from "../components/ui";
import Onglets from "../components/Onglets";
import CarteArticle from "./veille/CarteArticle";
import {
  A_DEMARCHER, AXES, ouvrirDansCrm, confiee, derniereTournee, estReseau, lignePassages, listerDirect, listerExpressions,
  listerRubriques, espaceDePage, noterOngletVu, ongletsVus, sourcesNommees, statutsEntreprises, VU_PAR_DEFAUT,
  type Article, type Axe, type Expression, type NomVeille, type StatutEntreprise, VEILLES,
} from "../lib/veille";
import { useVeille } from "./veille/useVeille";
import { BoutonSuggerer } from "./veille/Suggestions";

type Direct = Article & { trie_le: string | null };
type Onglet = Axe | "urgent" | "reseaux";
// Deux veilles depuis le 02/11 (Olivier) : la commerciale a ce qui se traite (À ne pas manquer, les clients potentiels),
// celle de marché ce qui s'informe ; « Nouveautés » est débranché. Les archivés ont leur page, dans chaque veille.
const URGENT = { cle: "urgent" as const, titre: "À ne pas manquer", sousTitre: "Appels d'offres, demandes de solution, campagnes annoncées, concurrents qui signent : à traiter sans attendre le rapport." };
const RESEAUX = { cle: "reseaux" as const, titre: "Réseaux sociaux", sousTitre: "Tout ce que Scope a trouvé sur LinkedIn, Facebook, Instagram, X, YouTube et TikTok. Chaque post reste aussi dans sa case." };
// Concurrence et Évènements ont de nouveau chacun leur onglet (organigramme de Laurent et Irène, 09/11).
const ongletDe = (x: Axe): Onglet => x;
const axeDOnglet = (c: Axe) => AXES.find((x) => x.cle === c)! as { cle: Axe; titre: string; sousTitre: string };
const ONGLETS_DE: Record<NomVeille, { cle: Onglet; titre: string; sousTitre: string }[]> = {
  commerciale: [URGENT, axeDOnglet("demarcher"), axeDOnglet("collectivites"), axeDOnglet("intermediaires"), axeDOnglet("mutuelles")],
  marche: [axeDOnglet("nous"), RESEAUX, axeDOnglet("concurrents"), axeDOnglet("evenements"), axeDOnglet("publications")],
};

export default function VeilleDirect() {
  const { user } = useAuth();
  const veille = useVeille();
  const [params, setParams] = useSearchParams();
  // ?seul=<marché> : la page d'un seul marché, ouverte depuis un CRM ou la Veille Marché du menu.
  const seul = ONGLETS_DE[veille].find((x) => x.cle === params.get("seul"));
  const ONGLETS = seul ? [seul] : ONGLETS_DE[veille];
  const [articles, setArticles] = useState<Direct[] | null>(null);
  const [noms, setNoms] = useState<Map<string, string>>(new Map());
  const [axeDe, setAxeDe] = useState<Map<string, Axe>>(new Map());
  const [statuts, setStatuts] = useState<Map<string, StatutEntreprise>>(new Map());
  // Les dernières ouvertures, lues au chargement : elles disent ce qui est « Nouveau » pendant toute la visite.
  const [vus, setVus] = useState<Map<string, string> | null>(null);
  // Les onglets ouverts pendant cette visite : leur pastille rouge s'efface.
  const [ouverts, setOuverts] = useState<Set<Onglet>>(new Set());
  const [chargeLe, setChargeLe] = useState("");
  const [dernierPassage, setDernierPassage] = useState<string | null>(null);
  const demande = params.get("onglet");
  const onglet: Onglet = ONGLETS.find((x) => x.cle === demande)?.cle ?? ONGLETS[0].cle;

  useEffect(() => {
    if (!user?.email) return;
    (async () => {
      try {
        // Les ouvertures sont lues d'abord ; celle de l'onglet ouvert se note à l'heure d'avant la lecture.
        const avant = new Date().toISOString();
        const [a, s, r, v] = await Promise.all([listerDirect(), sourcesNommees(), listerRubriques(), ongletsVus(user.email)]);
        setArticles(a);
        setNoms(new Map(s.map((x) => [x.cle, x.nom])));
        setAxeDe(new Map(r.map((x) => [x.nom, x.axe])));
        setVus(v);
        setChargeLe(avant);
        derniereTournee().then(setDernierPassage, () => setDernierPassage(null));
        setStatuts(await statutsEntreprises(a.map((x) => x.entreprise ?? "")));
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Le direct n'a pas pu être lu.");
        setArticles([]);
      }
    })();
  }, [user?.email]);

  // Ouvrir un onglet efface sa pastille, pour vous seul.
  useEffect(() => {
    if (!user?.email || !chargeLe || ouverts.has(onglet)) return;
    setOuverts((o) => new Set(o).add(onglet));
    // Toujours l'heure d'avant la lecture : ce qui est arrivé depuis n'a pas été vu, il garde sa pastille.
    noterOngletVu(user.email, onglet, chargeLe).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onglet, chargeLe, user?.email]);

  const axe = (a: Direct): Axe => (a.rubrique ? axeDe.get(a.rubrique) : undefined) ?? "nouveautes";
  const nouveauDans = (a: Direct, o: Onglet) => Boolean(vus && a.trie_le && a.trie_le > (vus.get(o) ?? VU_PAR_DEFAUT()));
  const parOnglet = useMemo(() => {
    // Tous les onglets de la veille, même avec ?seul : changer de marché ne relit rien et ne vide pas la page.
    const m = new Map<Onglet, Direct[]>(ONGLETS_DE[veille].map((x) => [x.cle, []]));
    for (const a of articles ?? []) {
      m.get(ongletDe(axe(a)))?.push(a);
      if (a.urgent) m.get("urgent")?.push(a);
      if (estReseau(a.url)) m.get("reseaux")?.push(a);
    }
    return m;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [articles, axeDe, veille]);

  const rubriquesDe = (x: Onglet) => [...axeDe].filter(([, ax]) => ongletDe(ax) === x).map(([nom]) => nom);
  const liste = parOnglet.get(onglet) ?? [];
  const courant = ONGLETS.find((x) => x.cle === onglet)!;
  const enCours = articles === null;

  const retrait = (x: Article, quoi: "archivee" | "supprimee" | "remise") => {
    const d = x as Direct;
    const sans = (l: Direct[] | null) => (l ?? []).filter((y) => y.id !== d.id);
    setArticles((l) => (quoi === "remise" ? [...sans(l), d].sort((p, q) => String(q.trie_le ?? "").localeCompare(String(p.trie_le ?? ""))) : sans(l)));
  };

  return (
    <div>
      {/* Le titre, et sur la même ligne : Scope, et « Suggérer » (Paramétrage et CPR sont dans Admin depuis le 09/11). */}
      <div className="mb-5 sm:mb-6">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <h1 className="font-display text-2xl font-semibold text-avisdoc-ink sm:text-3xl">{seul ? seul.titre : `En direct · ${VEILLES[veille].titre}`}</h1>
          <div className="flex flex-wrap items-center gap-1.5">
            <Link to={`/veille/${veille}/vigile${seul ? `?seul=${seul.cle}` : ""}`} className="flex items-center gap-1.5 rounded-full border border-border px-2.5 py-1 text-[12px] font-semibold text-muted-foreground hover:border-avisdoc-ink hover:text-avisdoc-ink">
              <MessageCircle className="size-3.5" strokeWidth={2} /> Scope
            </Link>
            <BoutonSuggerer espace={espaceDePage(veille, seul?.cle ?? onglet)} />
          </div>
        </div>
        <p className="mt-1 text-[13px] text-muted-foreground sm:text-sm">Ce que Scope retient au fil de ses tournées (chaque matin à 7 h, et toutes les 3 heures pour les sources gratuites), sans attendre le rapport.</p>
      </div>
      <Card className="overflow-hidden">
        {seul ? (
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-b border-border px-5 py-2.5 text-[12px] font-bold">
            <span className="text-muted-foreground">{articles === null ? "…" : `${liste.length} publication${liste.length > 1 ? "s" : ""}`}</span>
          </div>
        ) : <Onglets
          aLaLigne
          onglets={ONGLETS.map((x) => ({
            cle: x.cle,
            label: x.titre,
            compte: articles === null ? null : (parOnglet.get(x.cle) ?? []).length,
            pastille: articles === null || ouverts.has(x.cle) ? null : (parOnglet.get(x.cle) ?? []).filter((a) => nouveauDans(a, x.cle)).length,
          }))}
          actif={onglet}
          onChange={(c) => setParams((p) => { const n = new URLSearchParams(p); n.set("onglet", c); return n; }, { replace: true })}
        />}
        <div className="border-b border-border bg-muted/40 px-5 py-2.5 text-[12px] text-muted-foreground">
          <p>{courant.sousTitre}</p>
          {dernierPassage && <p className="mt-0.5">{lignePassages(dernierPassage)}</p>}
          {!["urgent", "reseaux", "nous"].includes(onglet) && rubriquesDe(onglet).length > 0 && <p className="mt-0.5"><span className="font-bold text-avisdoc-ink">Rubriques :</span> {rubriquesDe(onglet).join(" · ")}</p>}
        </div>
        {onglet === "nous" && <NomsSurveilles />}
        {enCours ? (
          <div className="flex items-center justify-center gap-2 p-16 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin text-avisdoc-teal" /> Chargement…
          </div>
        ) : !liste.length ? (
          <p className="p-8 text-center text-sm text-muted-foreground">
            {onglet === "urgent" ? "Rien d'urgent pour l'instant." : onglet === "nous" ? "Rien pour l'instant : Scope cherche à chaque tournée de 7 h." : "Rien pour l'instant dans cet onglet."}
          </p>
        ) : (
          <ul className="divide-y divide-border">
            {liste.map((a) => (
              <CarteArticle
                key={a.id}
                a={a}
                noms={noms}
                demarcher={A_DEMARCHER.has(axe(a))}
                nouveau={nouveauDans(a, onglet)}
                statut={a.entreprise ? statuts.get(a.entreprise.trim().toLowerCase()) : undefined}
                onConfie={(id, referent) => setStatuts((m) => new Map(m).set((a.entreprise ?? "").trim().toLowerCase(), confiee(id, referent)))}
                onRetrait={retrait}
                ouvrirDans={ouvrirDansCrm(axe(a))}
              />
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}

/** Les noms que Scope cherche pour « Ce qu'on dit de nous », en lecture : ils se règlent dans Admin › Paramétrage veille. */
function NomsSurveilles() {
  const { peut } = useAuth();
  const [liste, setListe] = useState<Expression[] | null>(null);
  useEffect(() => {
    Promise.all([listerRubriques(), listerExpressions()]).then(([r, e]) => {
      const id = r.find((x) => x.axe === "nous")?.id;
      setListe(e.filter((x) => id && x.rubrique_id === id && x.actif));
    }, () => setListe([]));
  }, []);
  return (
    <div className="flex flex-wrap items-center gap-2 border-b border-border px-5 py-3">
      <span className="text-[12px] font-bold text-avisdoc-ink">Scope cherche :</span>
      {liste === null ? <Loader2 className="size-3.5 animate-spin text-avisdoc-teal" /> : liste.length ? liste.map((x) => (
        <span key={x.id} className="rounded-full bg-avisdoc-teal/10 px-3 py-1 text-[12px] font-bold text-avisdoc-teal">{x.expression}</span>
      )) : <span className="text-[12px] text-muted-foreground">aucun nom</span>}
      {peut("admin") && <Link to="/parametrage-veille?onglet=nous" className="ml-auto text-[12px] font-bold text-avisdoc-teal hover:underline">Modifier dans Paramétrage</Link>}
    </div>
  );
}
