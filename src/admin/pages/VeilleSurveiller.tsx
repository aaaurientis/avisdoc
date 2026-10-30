// Veille › Réglages (ex « À surveiller ») : tout ce que suit Vigile, l'agent de veille, rangé en six
// catégories (presse, sources scientifiques et officielles, réseaux, comptes,
// expressions, influenceurs), plus les rubriques qui ordonnent le rapport.
//
// Dans chaque catégorie : ajouter par une fenêtre qui porte tous ses champs ; un clic
// ouvre la fiche en consultation, le crayon seul modifie ; « Suspendre » met la ligne
// en « Non suivi » sans la perdre ; rien ne part sans confirmation.

import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { ExternalLink, Loader2, Pencil, Plus, Trash2 } from "lucide-react";
import { useAuth } from "../auth/AuthContext";
import { Card, Modal, PageHeader } from "../components/ui";
import Onglets from "../components/Onglets";
import { confirmer } from "../components/Confirmation";
import {
  enregistrer, enregistrerSource, genreDeSource, listerComptes, listerExpressions, listerReseaux,
  AXES_RUBRIQUE, listerRubriques, listerSources, NON_BRANCHE, PLATEFORMES, SOURCE_AJOUTABLE, supprimer, supprimerSource, suspendre, suspendreSource,
  type Compte, type Expression, type Genre, type Reseau, type Rubrique, type Source,
} from "../lib/veille";
import { cn } from "@/lib/utils";

const champCls =
  "ad-input w-full min-w-0 rounded-xl border border-border bg-background px-3.5 py-2.5 text-[13px] outline-none transition-colors focus:border-avisdoc-teal";
const libelleCls = "mb-1.5 block text-[12px] font-bold text-avisdoc-ink";

type Cat = "presse" | "scientifique" | "reseaux" | "comptes" | "expressions" | "nous" | "influenceurs" | "moteurs" | "rubriques";

const CATEGORIES: { cle: Cat; label: string; un: string; vide: string }[] = [
  { cle: "scientifique", label: "Sources scientifiques", un: "une source", vide: "Aucune source." },
  { cle: "presse", label: "Presse", un: "un site de presse", vide: "Aucun site de presse." },
  { cle: "influenceurs", label: "Influenceurs", un: "un influenceur", vide: "Aucun influenceur suivi. Ajoutez un dermatologue, un expert, un journaliste…" },
  { cle: "reseaux", label: "Réseaux sociaux", un: "une page", vide: "Aucune page de réseau social suivie." },
  { cle: "comptes", label: "Concurrents", un: "un concurrent", vide: "Aucun concurrent suivi." },
  { cle: "expressions", label: "Expressions", un: "une expression", vide: "Aucune expression suivie." },
  { cle: "nous", label: "Ce qu'on dit de nous", un: "un nom", vide: "Aucun nom cherché." },
  { cle: "rubriques", label: "Rubriques", un: "une rubrique", vide: "Aucune rubrique." },
  { cle: "moteurs", label: "Moteurs de recherche", un: "", vide: "" },
];

/** Ce que chaque catégorie veut dire : à quoi elle sert, ce que Vigile surveille, ce qu'il en rapporte. */
const EXPLICATIONS: Record<Cat, { sert: string; surveille: string; rapporte: string }> = {
  presse: {
    sert: "Les médias que Vigile lit pour suivre l'actualité qui touche AvisDoc : presse médicale, presse des métiers de vos clients, presse locale.",
    surveille: "Chaque site ou flux sur On : Vigile lit son flux s'il en a un, sinon il cherche directement sur le site.",
    rapporte: "Les articles parus depuis le rapport précédent qui concernent AvisDoc, résumés, avec leur lien, leur date et ce qu'ils changent pour AvisDoc.",
  },
  scientifique: {
    sert: "Les bases d'études et les autorités de santé : ce qui fait foi en médecine et en santé publique.",
    surveille: "Les nouvelles études (PubMed, Europe PMC, medRxiv), les essais cliniques, les avis et recommandations (HAS, ANSM…) et les appels d'offres publics (BOAMP).",
    rapporte: "Les publications sur le dépistage, les cancers de la peau et la santé au travail, et les appels d'offres auxquels AvisDoc pourrait répondre.",
  },
  reseaux: {
    sert: "Des pages précises de réseaux sociaux à suivre : la page LinkedIn d'un concurrent, d'une mutuelle, d'une fédération… Vous suivez CE compte-là. Pour suivre un sujet sur tous les comptes, utilisez plutôt les Expressions.",
    surveille: "Les publications de chaque page sur On. Vigile ne lit pas LinkedIn ou Facebook directement (il faudrait un compte connecté, ce que ces réseaux interdisent) : il retrouve ce qu'ils ont de public et que le web a indexé. Une publication réservée aux relations du compte lui échappe.",
    rapporte: "Les publications retrouvées, avec leur lien et leur date, quand elles concernent AvisDoc.",
  },
  comptes: {
    sert: "Les concurrents d'AvisDoc : dépistage en entreprise, téléexpertise, applications et IA de dépistage.",
    surveille: "Ce qu'ils annoncent, publient, lèvent ou signent, et leur blog ou page d'actualités si vous l'indiquez dans la fiche.",
    rapporte: "Leurs actualités, dans la rubrique « Concurrence ». Ils sont aussi exclus des signaux d'entreprises : un concurrent n'est pas un client potentiel.",
  },
  expressions: {
    sert: "Les mots ou phrases à guetter.",
    surveille: "Chaque expression sur On est cherchée chaque matin en presse et sur le web, et, si sa fiche le demande, aussi sur LinkedIn, Facebook, Instagram, X et YouTube (ce que ces réseaux ont de public et que le web a indexé), quel que soit le compte qui publie. Celles rattachées à « Signaux d'entreprises » servent à repérer les entreprises qui parlent de la santé de leurs salariés.",
    rapporte: "Les articles qui les contiennent, s'ils concernent AvisDoc ; pour les signaux, l'entreprise, sa ville et pourquoi c'est une occasion.",
  },
  nous: {
    sert: "Les noms que Vigile cherche pour savoir ce que les autres disent d'AvisDoc : la marque, le site, un produit, un dirigeant…",
    surveille: "Chaque nom sur On est cherché chaque matin partout : presse, web, LinkedIn, Facebook, Instagram, X et YouTube (ce que ces réseaux ont de public et que le web a indexé). Ce qu'AvisDoc publie elle-même (son site, sa page LinkedIn) est laissé de côté.",
    rapporte: "Les articles, avis, commentaires et posts qui parlent d'AvisDoc, dans l'onglet « Ce qu'on dit de nous » d'En direct et dans le rapport du vendredi.",
  },
  influenceurs: {
    sert: "Des personnes à suivre par leur nom : dermatologues, experts de la santé au travail, journalistes santé, dirigeants de mutuelles…",
    surveille: "Ce qu'elles publient, disent ou signent : presse et web ; leurs nouvelles études dans PubMed, par leur nom d'auteur ; leurs publications LinkedIn si vous indiquez leur page. Indiquez leur spécialité et leur hôpital dans les notes : Vigile ne les confondra pas avec un homonyme.",
    rapporte: "Leurs prises de parole et leurs études qui concernent AvisDoc, avec le lien : un avis d'expert à citer, une personne à contacter.",
  },
  moteurs: {
    sert: "Les outils qui font le travail de Vigile : ceux qui cherchent, celui qui vérifie, ceux qui trient et rédigent. Ce ne sont pas des sources : ils servent toutes les catégories.",
    surveille: "Chacun a son rôle, détaillé ci-dessous : où il cherche, jusqu'où, et ce qu'il apporte au rapport.",
    rapporte: "Rien ne se règle ici : c'est une page d'information. Les sources, elles, se règlent dans les autres onglets.",
  },
  rubriques: {
    sert: "Les chapitres du rapport, comme les rubriques d'un journal. Quand Vigile écrit le rapport, il range chaque article sous l'un de ces titres : « Signaux d'entreprises », « Concurrence », « Dermatologie », « Santé au travail »…",
    surveille: "Rien : une rubrique ne cherche pas. Elle dit à Vigile comment classer ce qu'il a trouvé. Sa description l'aide à choisir le bon chapitre. Vous pouvez en ajouter une (par exemple « Mutuelles »), la renommer ou changer l'ordre.",
    rapporte: "Chaque rubrique va dans une case du rapport (Entreprises à démarcher, Collectivités à démarcher, Concurrents…). Le rapport et le mail sont découpés selon ces chapitres, dans l'ordre indiqué. Une rubrique sur Off disparaît du rapport : ses articles vont dans un autre chapitre.",
  },
};

const ADRESSE = /^https?:\/\/[^\s"'<>]+$/i;
const lien = (u: string | null | undefined) => (u && ADRESSE.test(u) ? u : null);

interface Ligne {
  id: string;
  titre: string;
  detail: string;
  actif: boolean;
  supprimable: boolean;
  /** La ligne ne peut pas être allumée : on dit pourquoi au survol de l'interrupteur. */
  verrou?: string;
}

/** Une fiche ouverte : la ligne (ou rien pour un ajout), et si l'on consulte ou modifie. */
type Fiche = { cat: Cat; id: string | null; mode: "voir" | "modifier" };

export default function VeilleSurveiller() {
  const { user } = useAuth();
  const [params] = useSearchParams();
  const [cat, setCat] = useState<Cat>(() => (CATEGORIES.some((c) => c.cle === params.get("onglet")) ? params.get("onglet") as Cat : "scientifique"));
  const [sources, setSources] = useState<Source[]>([]);
  const [reseaux, setReseaux] = useState<Reseau[]>([]);
  const [comptes, setComptes] = useState<Compte[]>([]);
  const [expressions, setExpressions] = useState<Expression[]>([]);
  const [rubriques, setRubriques] = useState<Rubrique[]>([]);
  const [charge, setCharge] = useState(false);
  const [fiche, setFiche] = useState<Fiche | null>(null);
  const [enCours, setEnCours] = useState<string | null>(null);

  const recharger = useCallback(async () => {
    try {
      const [s, re, c, e, r] = await Promise.all([listerSources(), listerReseaux(), listerComptes(), listerExpressions(), listerRubriques()]);
      setSources(s);
      setReseaux(re);
      setComptes(c);
      setExpressions(e);
      setRubriques(r);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "La liste n'a pas pu être lue.");
    } finally {
      setCharge(true);
    }
  }, []);
  useEffect(() => {
    recharger();
  }, [recharger]);

  // Les noms de « Ce qu'on dit de nous » sont des expressions rangées dans sa rubrique : ils ont leur onglet.
  const nousId = rubriques.find((r) => r.axe === "nous")?.id ?? null;
  const nomRubrique = useMemo(() => new Map(rubriques.map((r) => [r.id, r.nom])), [rubriques]);
  const organisations = comptes.filter((c) => c.genre !== "personne");
  const personnes = comptes.filter((c) => c.genre === "personne");

  const lignes: Record<Cat, Ligne[]> = {
    presse: sources.filter((s) => s.categorie === "presse").map(ligneSource),
    moteurs: sources.filter((s) => s.categorie === "moteur").map(ligneSource),
    scientifique: sources.filter((s) => s.categorie === "scientifique").map(ligneSource),
    reseaux: reseaux.map((r) => ({ id: r.id, titre: r.nom, detail: [PLATEFORMES.find((p) => p.cle === r.plateforme)?.label, r.notes || null].filter(Boolean).join(" · "), actif: r.actif, supprimable: true })),
    comptes: organisations.map((c) => ({ id: c.id, titre: c.nom, detail: [c.rubrique_id ? nomRubrique.get(c.rubrique_id) : null, c.notes || null].filter(Boolean).join(" · "), actif: c.actif, supprimable: true })),
    expressions: expressions.filter((e) => !nousId || e.rubrique_id !== nousId).map((e) => ({ id: e.id, titre: `« ${e.expression} »`, detail: [e.rubrique_id ? nomRubrique.get(e.rubrique_id) : null, e.notes || null].filter(Boolean).join(" · "), actif: e.actif, supprimable: true })),
    nous: expressions.filter((e) => nousId && e.rubrique_id === nousId).map((e) => ({ id: e.id, titre: e.expression, detail: e.notes || "", actif: e.actif, supprimable: true })),
    influenceurs: personnes.map((c) => ({ id: c.id, titre: c.nom, detail: [c.rubrique_id ? nomRubrique.get(c.rubrique_id) : null, c.notes || null].filter(Boolean).join(" · "), actif: c.actif, supprimable: true })),
    rubriques: rubriques.map((r) => ({ id: r.id, titre: r.nom, detail: r.description, actif: r.actif, supprimable: true })),
  };

  const nomDe = (c: Cat, id: string) => lignes[c].find((l) => l.id === id)?.titre ?? "";
  const tableDe = (c: Cat) =>
    c === "reseaux" ? "admin_veille_reseaux" : c === "expressions" || c === "nous" ? "admin_veille_expressions" : c === "rubriques" ? "admin_veille_rubriques" : "admin_veille_comptes";
  const estSource = (c: Cat) => c === "presse" || c === "scientifique" || c === "moteurs";

  const basculer = async (c: Cat, l: Ligne) => {
    if (enCours) return;
    setEnCours(l.id);
    try {
      if (estSource(c)) await suspendreSource(l.id, !l.actif);
      else await suspendre(tableDe(c), l.id, !l.actif);
      toast.success(l.actif ? "Suspendu : Vigile ne le suit plus." : "Repris : Vigile le suit de nouveau.");
      await recharger();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Le changement a échoué.");
    } finally {
      setEnCours(null);
    }
  };

  const effacer = async (c: Cat, id: string) => {
    const ok = await confirmer({
      titre: `Supprimer « ${nomDe(c, id)} » ?`,
      message: "Vigile ne le suivra plus. Les rapports déjà envoyés ne changent pas. Pour l'arrêter sans le perdre, suspendez-le plutôt.",
      action: "Supprimer",
      definitif: true,
    });
    if (!ok) return;
    try {
      if (estSource(c)) await supprimerSource(id);
      else await supprimer(tableDe(c), id);
      toast.success("Supprimé.");
      setFiche(null);
      recharger();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "La suppression a échoué.");
    }
  };

  const courante = CATEGORIES.find((x) => x.cle === cat)!;

  return (
    <div>
      <PageHeader
        title="Réglages"
        subtitle="Ce que Vigile suit pour ses rapports. Glissez l'interrupteur sur Off pour suspendre une ligne sans la perdre."
        action={cat !== "moteurs" && (
          <button
            type="button"
            onClick={() => setFiche({ cat, id: null, mode: "modifier" })}
            className="ad-btn-accent inline-flex items-center gap-1.5 rounded-full bg-avisdoc-teal px-5 py-2.5 text-sm font-bold text-white"
          >
            <Plus className="size-4" />
            Ajouter {courante.un}
          </button>
        )}
      />
      <Card className="overflow-hidden">
        <Onglets
          aLaLigne
          coupureApres="comptes"
          onglets={CATEGORIES.map((c) => ({ cle: c.cle, label: c.label, compte: c.cle === "moteurs" ? null : lignes[c.cle].length }))}
          actif={cat}
          onChange={(c) => setCat(c as Cat)}
        />
        <dl className="grid gap-3 border-b border-border bg-muted/40 px-4 py-3 text-[12px] leading-relaxed sm:px-5 md:grid-cols-3">
          {([["À quoi ça sert", "sert"], ["Ce que Vigile surveille", "surveille"], ["Ce qu'il vous rapporte", "rapporte"]] as const).map(([titre, cle]) => (
            <div key={cle}>
              <dt className="font-bold text-avisdoc-ink">{titre}</dt>
              <dd className="text-muted-foreground">{EXPLICATIONS[cat][cle]}</dd>
            </div>
          ))}
        </dl>
        {cat === "moteurs" ? (
          <Moteurs sources={sources} />
        ) : !charge ? (
          <div className="flex items-center justify-center gap-2 p-10 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin text-avisdoc-teal" /> Chargement…
          </div>
        ) : !lignes[cat].length ? (
          <p className="p-8 text-center text-sm text-muted-foreground">{courante.vide}</p>
        ) : (
          // Toute la largeur, en colonnes : chaque ligne garde son interrupteur et ses boutons près de son nom.
          <ul className="grid gap-2 p-3 sm:p-4 md:grid-cols-2 xl:grid-cols-3">
            {lignes[cat].map((l) => (
              <li key={l.id} className="flex min-w-0 items-center gap-3 rounded-xl border border-border px-3 py-2.5">
                <Interrupteur
                  actif={l.actif}
                  verrou={l.verrou}
                  enCours={enCours === l.id}
                  libelle={`${l.actif ? "Suspendre" : "Reprendre"} le suivi de ${l.titre}`}
                  onBascule={() => basculer(cat, l)}
                />
                <button type="button" title={l.titre} onClick={() => setFiche({ cat, id: l.id, mode: "voir" })} className="min-w-0 flex-1 text-left">
                  <span className={cn("block truncate text-[14px] font-bold", l.actif ? "text-avisdoc-ink" : "text-muted-foreground")}>{l.titre}</span>
                  {l.detail && <span className="block truncate text-[12px] text-muted-foreground">{l.detail}</span>}
                </button>
                <div className="flex shrink-0 items-center">
                  <button type="button" aria-label="Modifier" title="Modifier" onClick={() => setFiche({ cat, id: l.id, mode: "modifier" })} className="rounded-full p-2 text-muted-foreground hover:bg-muted hover:text-avisdoc-ink">
                    <Pencil className="size-4" />
                  </button>
                  {l.supprimable ? (
                    <button type="button" aria-label="Supprimer" title="Supprimer" onClick={() => effacer(cat, l.id)} className="rounded-full p-2 text-muted-foreground hover:bg-red-50 hover:text-red-600">
                      <Trash2 className="size-4" />
                    </button>
                  ) : (
                    <span className="size-8" aria-hidden />
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {fiche && (
        <FenetreFiche
          fiche={fiche}
          rubriques={rubriques}
          source={estSource(fiche.cat) ? sources.find((s) => s.cle === fiche.id) ?? null : null}
          reseau={fiche.cat === "reseaux" ? reseaux.find((r) => r.id === fiche.id) ?? null : null}
          compte={fiche.cat === "comptes" || fiche.cat === "influenceurs" ? comptes.find((c) => c.id === fiche.id) ?? null : null}
          expression={fiche.cat === "expressions" || fiche.cat === "nous" ? expressions.find((e) => e.id === fiche.id) ?? null : null}
          rubrique={fiche.cat === "rubriques" ? rubriques.find((r) => r.id === fiche.id) ?? null : null}
          supprimable={fiche.id ? lignes[fiche.cat].find((l) => l.id === fiche.id)?.supprimable ?? false : false}
          auteur={user?.email ?? ""}
          onFermer={() => setFiche(null)}
          onModifier={() => setFiche({ ...fiche, mode: "modifier" })}
          onSupprimer={() => fiche.id && effacer(fiche.cat, fiche.id)}
          onEnregistre={() => {
            setFiche(null);
            recharger();
          }}
        />
      )}
    </div>
  );
}

interface Moteur {
  nom: string;
  role: "Cherche" | "Lit" | "Vérifie" | "Trie et rédige" | "Rédige" | "Répond";
  /** Pour l'état réel (actif ou non) : la clé de la source correspondante. */
  cle?: string;
  ou: string;
  jusquou: string;
  apporte: string;
  cout: string;
}

/** Qui fait quoi dans Vigile. Les réglages cités sont ceux du code (supabase/functions/veille) au 26/10/2026. */
const MOTEURS: Moteur[] = [
  {
    nom: "Linkup", role: "Cherche", cle: "linkup",
    ou: "La presse et le web français ; LinkedIn, Facebook, Instagram, X et YouTube (ce qui y est public et indexé) ; les sites de presse sans flux.",
    jusquou: "Seulement la période du rapport, 10 résultats au plus par recherche. Une recherche par expression et par support, par concurrent, par influenceur, par page de réseau social, par page LinkedIn indiquée dans une fiche et par site sans flux.",
    apporte: "L'essentiel de la presse, des publications LinkedIn et des actualités des concurrents, dans toutes les rubriques.",
    cout: "Gratuit à notre volume (quota d'environ 4 000 recherches par mois).",
  },
  {
    nom: "Perplexity — veille générale", role: "Cherche", cle: "perplexity",
    ou: "Tout le web, en France d'abord puis en Europe.",
    jusquou: "Une recherche approfondie par rapport, limitée à la période : il enchaîne lui-même des dizaines de recherches et lit les pages (jusqu'à environ 15 minutes). Vigile ne garde que les pages que ses recherches ont réellement fait apparaître.",
    apporte: "Ce que les recherches simples ratent, dans toutes les rubriques.",
    cout: "Entre 0,16 et 0,87 $ par recherche, d'après les factures mesurées.",
  },
  {
    nom: "Perplexity — signaux d'entreprises", role: "Cherche", cle: "perplexity-signaux",
    ou: "Presse locale et régionale, blogs et pages actualités d'entreprises, sites des collectivités, offres d'emploi.",
    jusquou: "Une recherche approfondie par rapport, limitée à la période, concurrents exclus.",
    apporte: "La rubrique « Signaux d'entreprises » : les entreprises et collectivités qui parlent de la santé de leurs salariés.",
    cout: "Entre 0,16 et 0,87 $ par recherche.",
  },
  {
    nom: "Bases et flux officiels (sans IA)", role: "Lit",
    ou: "PubMed, Europe PMC, medRxiv, ClinicalTrials.gov, BOAMP, et les flux RSS (HAS, ANSM, journaux…).",
    jusquou: "Tout ce qui est paru sur la période, 60 publications au plus par source. PubMed cherche aussi les nouvelles études de chaque influenceur, par son nom d'auteur.",
    apporte: "Les études, essais, avis officiels et appels d'offres : ce qui fait foi.",
    cout: "Gratuit.",
  },
  {
    nom: "Vérification des liens (sans IA)", role: "Vérifie",
    ou: "Chaque lien trouvé sur le web.",
    jusquou: "Vigile ouvre la page : elle doit exister et parler de ce que dit son titre, sinon l'article est écarté. Un site qui refuse les robots est gardé et signalé « Copier le lien ».",
    apporte: "Aucun lien mort ni inventé dans le rapport.",
    cout: "Gratuit.",
  },
  {
    nom: "Claude Sonnet (Anthropic)", role: "Trie et rédige",
    ou: "Ne cherche pas : il lit seulement ce que les autres ont trouvé et vérifié.",
    jusquou: "Chaque article, par lots de 12 : il le garde ou l'écarte, le range dans une rubrique, le résume, traduit son titre, écrit « Pour AvisDoc », et pour un signal, extrait l'entreprise et la ville. Aucun chiffre ni fait qui ne soit dans l'article.",
    apporte: "Le contenu de chaque rubrique.",
    cout: "Entre 0,28 et 0,87 $ par rapport, selon le nombre d'articles.",
  },
  {
    nom: "Claude Opus (Anthropic)", role: "Rédige",
    ou: "Les articles retenus du rapport.",
    jusquou: "Il choisit les 3 points à retenir et dit ce qu'ils changent pour AvisDoc, chacun appuyé sur ses articles.",
    apporte: "Le bloc « À retenir » en tête du rapport et du mail.",
    cout: "Entre 0,04 et 0,08 $ par rapport.",
  },
  {
    nom: "Claude Sonnet (Anthropic)", role: "Répond",
    ou: "Les articles déjà retenus dans tous les rapports, et ce que vous surveillez.",
    jusquou: "Il ne cherche pas sur le web pendant la conversation, et ne cite que des liens rendus par ses recherches dans la base.",
    apporte: "Les réponses de l'écran Vigile : « sortez-moi les articles sur… ».",
    cout: "Environ 0,02 à 0,04 $ par question (60 questions par jour au plus et par personne).",
  },
  {
    nom: "Gemini Deep Research (Google)", role: "Cherche", cle: "gemini",
    ou: "Tout le web.",
    jusquou: "Non branché : il n'est pas utilisé.",
    apporte: "Rien pour l'instant. À comparer d'abord avec Perplexity sur une même période.",
    cout: "Environ 1 à 3 $ par recherche selon Google (relevé le 17/10/2026), et encore en version d'essai.",
  },
];

function Moteurs({ sources }: { sources: Source[] }) {
  const actif = (m: Moteur) => (m.cle ? sources.find((s) => s.cle === m.cle)?.actif ?? false : true);
  return (
    <ul className="grid gap-3 p-3 sm:p-4 md:grid-cols-2 xl:grid-cols-3">
      {MOTEURS.map((m) => (
        <li key={`${m.nom}-${m.role}`} className="rounded-xl border border-border p-4">
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <span className="text-[14px] font-bold text-avisdoc-ink">{m.nom}</span>
            <span className="rounded-full bg-avisdoc-teal/10 px-2 py-0.5 text-[11px] font-bold text-avisdoc-teal">{m.role}</span>
            <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-bold", actif(m) ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400" : "bg-muted text-muted-foreground")}>
              {actif(m) ? "Actif" : "Non actif"}
            </span>
          </div>
          <dl className="space-y-1.5 text-[12px] leading-relaxed">
            {([["Où", m.ou], ["Jusqu'où", m.jusquou], ["Ce qu'il apporte", m.apporte], ["Coût", m.cout]] as const).map(([t, v]) => (
              <div key={t}>
                <dt className="inline font-bold text-avisdoc-ink">{t} : </dt>
                <dd className="inline text-muted-foreground">{v}</dd>
              </div>
            ))}
          </dl>
        </li>
      ))}
    </ul>
  );
}

/** Interrupteur On/Off : on le fait glisser pour suivre ou suspendre, sans rien perdre. */
function Interrupteur({ actif, verrou, enCours, libelle, onBascule }: { actif: boolean; verrou?: string; enCours: boolean; libelle: string; onBascule: () => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={actif}
      aria-label={libelle}
      title={verrou ?? (actif ? "Suivi : cliquez pour suspendre" : "Non suivi : cliquez pour reprendre")}
      disabled={enCours || Boolean(verrou)}
      onClick={onBascule}
      className={cn(
        "relative inline-flex h-7 w-[3.75rem] shrink-0 items-center rounded-full transition-colors duration-200 disabled:cursor-not-allowed disabled:opacity-60",
        actif ? "bg-avisdoc-teal" : "bg-muted-foreground/25",
      )}
    >
      <span className={cn("absolute text-[10px] font-bold uppercase tracking-wide", actif ? "left-2 text-white" : "right-2 text-muted-foreground")}>
        {actif ? "On" : "Off"}
      </span>
      <span
        className={cn(
          "absolute top-1 flex size-5 items-center justify-center rounded-full bg-white shadow transition-transform duration-200",
          actif ? "translate-x-[2.25rem]" : "translate-x-1",
        )}
      >
        {enCours && <Loader2 className="size-3 animate-spin text-avisdoc-teal" />}
      </span>
    </button>
  );
}

function ligneSource(s: Source): Ligne {
  const adresse = s.params?.url?.replace(/^https?:\/\/(www\.)?/, "").replace(/\/$/, "");
  const genre = s.cle.startsWith("site-pqr-") ? "Presse locale" : genreDeSource(s);
  if (NON_BRANCHE(s)) return { id: s.cle, titre: s.nom, detail: "Non actif : plus cher, en version d'essai, pas encore branché (voir la fiche)", actif: false, supprimable: false, verrou: s.params?.note ?? "Pas encore branché à Vigile." };
  return { id: s.cle, titre: s.nom, detail: [genre, adresse].filter(Boolean).join(" · "), actif: s.actif, supprimable: SOURCE_AJOUTABLE(s) };
}

function Info({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="py-2">
      <div className="text-[11px] font-bold uppercase tracking-[0.06em] text-muted-foreground">{label}</div>
      <div className="mt-0.5 break-words text-[14px] text-avisdoc-ink">{children || <span className="text-muted-foreground">—</span>}</div>
    </div>
  );
}

function Lien({ url }: { url: string | null | undefined }) {
  const u = lien(url);
  if (!u) return <>{url}</>;
  return (
    <a href={u} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-avisdoc-teal hover:underline">
      {u.replace(/^https?:\/\/(www\.)?/, "").replace(/\/$/, "")} <ExternalLink className="size-3.5" />
    </a>
  );
}

const TITRES: Record<Cat, string> = {
  presse: "site de presse", scientifique: "source", moteurs: "moteur de recherche", reseaux: "page", comptes: "concurrent", expressions: "expression", nous: "nom", influenceurs: "influenceur", rubriques: "rubrique",
};
const FEMININ = new Set<Cat>(["scientifique", "reseaux", "expressions", "rubriques"]);

function FenetreFiche({
  fiche, rubriques, source, reseau, compte, expression, rubrique, supprimable, auteur, onFermer, onModifier, onSupprimer, onEnregistre,
}: {
  fiche: Fiche;
  rubriques: Rubrique[];
  source: Source | null;
  reseau: Reseau | null;
  compte: Compte | null;
  expression: Expression | null;
  rubrique: Rubrique | null;
  supprimable: boolean;
  auteur: string;
  onFermer: () => void;
  onModifier: () => void;
  onSupprimer: () => void;
  onEnregistre: () => void;
}) {
  // Un nom de « Ce qu'on dit de nous » est une expression, rangée d'office dans sa rubrique et cherchée aussi sur les réseaux.
  const pourNous = fiche.cat === "nous";
  const cat: Cat = pourNous ? "expressions" : fiche.cat;
  const nousId = rubriques.find((r) => r.axe === "nous")?.id ?? "";
  const integree = Boolean(source && !SOURCE_AJOUTABLE(source));
  const [v, setV] = useState<Record<string, string | boolean>>(() => {
    if (cat === "presse" || cat === "scientifique" || cat === "moteurs") return { nom: source?.nom ?? "", url: source?.params?.url ?? "", actif: source?.actif ?? true };
    if (cat === "reseaux") return { nom: reseau?.nom ?? "", plateforme: reseau?.plateforme ?? "linkedin", url: reseau?.url ?? "", notes: reseau?.notes ?? "", actif: reseau?.actif ?? true };
    if (cat === "comptes" || cat === "influenceurs") {
      return {
        nom: compte?.nom ?? "", genre: compte?.genre ?? (cat === "influenceurs" ? "personne" : "concurrent"), site: compte?.site ?? "", blog: compte?.blog ?? "",
        linkedin: compte?.linkedin ?? "", facebook: compte?.facebook ?? "", rubrique_id: compte?.rubrique_id ?? "", notes: compte?.notes ?? "", actif: compte?.actif ?? true,
      };
    }
    if (cat === "expressions") return { expression: expression?.expression ?? "", rubrique_id: expression?.rubrique_id ?? (pourNous ? nousId : ""), notes: expression?.notes ?? "", actif: expression?.actif ?? true, reseaux: expression?.reseaux ?? pourNous };
    return { nom: rubrique?.nom ?? "", description: rubrique?.description ?? "", ordre: String(rubrique?.ordre ?? rubriques.length + 1), actif: rubrique?.actif ?? true, axe: rubrique?.axe ?? "nouveautes" };
  });
  const [envoi, setEnvoi] = useState(false);
  const maj = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => setV((x) => ({ ...x, [k]: e.target.value }));
  const t = (k: string) => String(v[k] ?? "").trim();
  const nom = TITRES[fiche.cat];
  const fem = FEMININ.has(fiche.cat);
  const titreFiche = source?.nom ?? reseau?.nom ?? compte?.nom ?? expression?.expression ?? rubrique?.nom ?? "";

  // Ce qui manque pour enregistrer, et les adresses mal formées.
  const requis = cat === "expressions" ? t("expression") : t("nom");
  const adresses = (cat === "presse" || cat === "scientifique" || cat === "moteurs") && !integree ? ["url"] : cat === "reseaux" ? ["url"] : cat === "comptes" || cat === "influenceurs" ? ["site", "blog", "linkedin", "facebook"] : [];
  const adresseFausse = adresses.find((k) => t(k) && !ADRESSE.test(t(k)));
  const urlManquante = (cat === "presse" || cat === "scientifique") && !integree && !t("url");
  const pret = Boolean(requis) && !adresseFausse && !urlManquante;

  const valider = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pret || envoi) return;
    setEnvoi(true);
    try {
      if (cat === "presse" || cat === "scientifique" || cat === "moteurs") {
        await enregistrerSource(fiche.id, { nom: t("nom"), url: integree ? undefined : t("url"), categorie: cat === "moteurs" ? "moteur" : cat, actif: Boolean(v.actif) }, auteur);
      } else if (cat === "reseaux") {
        await enregistrer("admin_veille_reseaux", fiche.id, { nom: t("nom"), plateforme: t("plateforme"), url: t("url") || null, notes: t("notes"), actif: Boolean(v.actif) }, auteur);
      } else if (cat === "comptes" || cat === "influenceurs") {
        await enregistrer("admin_veille_comptes", fiche.id, {
          nom: t("nom"), genre: (cat === "influenceurs" ? "personne" : "concurrent") as Genre, site: t("site") || null, blog: t("blog") || null,
          linkedin: t("linkedin") || null, facebook: t("facebook") || null, rubrique_id: t("rubrique_id") || null, notes: t("notes"), actif: Boolean(v.actif),
        }, auteur);
      } else if (cat === "expressions") {
        await enregistrer("admin_veille_expressions", fiche.id, { expression: t("expression"), rubrique_id: t("rubrique_id") || null, notes: t("notes"), actif: Boolean(v.actif), reseaux: Boolean(v.reseaux) }, auteur);
      } else {
        await enregistrer("admin_veille_rubriques", fiche.id, { nom: t("nom"), description: t("description"), ordre: Number(t("ordre")) || 0, actif: Boolean(v.actif), axe: t("axe") }, auteur);
      }
      toast.success(fiche.id ? "Modifié." : "Ajouté. Vigile en tiendra compte dès le prochain rapport.");
      onEnregistre();
    } catch (err) {
      const m = err instanceof Error ? err.message : "";
      toast.error(m.includes("duplicate") || m.includes("uq_veille") ? `Ce${fem ? "tte" : ""} ${nom} existe déjà.` : m || "L'enregistrement a échoué.");
      setEnvoi(false);
    }
  };

  // Consultation : rien ne se modifie d'un clic.
  if (fiche.mode === "voir" && fiche.id) {
    return (
      <Modal onClose={onFermer} width={520}>
        <div className="mb-3 flex items-start justify-between gap-3">
          <h2 className="font-display text-xl font-semibold text-avisdoc-ink">{titreFiche}</h2>
          <div className="flex shrink-0 gap-1">
            <button type="button" aria-label="Modifier" onClick={onModifier} className="rounded-full p-2 text-muted-foreground hover:bg-muted hover:text-avisdoc-ink">
              <Pencil className="size-4" />
            </button>
            {supprimable && (
              <button type="button" aria-label="Supprimer" onClick={onSupprimer} className="rounded-full p-2 text-muted-foreground hover:bg-red-50 hover:text-red-600">
                <Trash2 className="size-4" />
              </button>
            )}
          </div>
        </div>
        {source && (
          <>
            <Info label="Type">{genreDeSource(source)}</Info>
            <Info label="Adresse">{source.params?.url && <Lien url={source.params.url} />}</Info>
            <Info label="Dernière lecture réussie">{source.dernier_succes ? new Date(source.dernier_succes).toLocaleString("fr-FR", { timeZone: "Europe/Paris" }) : ""}</Info>
            {source.derniere_erreur && <Info label="Dernière erreur">{source.derniere_erreur}</Info>}
            {source.params?.note && <Info label="Pourquoi il n'est pas actif">{source.params.note}</Info>}
            {integree && !NON_BRANCHE(source) && <p className="mt-2 text-[12px] text-muted-foreground">Base intégrée à Vigile : elle se suspend, elle ne se supprime pas.</p>}
          </>
        )}
        {reseau && (
          <>
            <Info label="Plateforme">{PLATEFORMES.find((p) => p.cle === reseau.plateforme)?.label}</Info>
            <Info label="Page">{reseau.url && <Lien url={reseau.url} />}</Info>
            <Info label="Notes">{reseau.notes}</Info>
          </>
        )}
        {compte && (
          <>
            <Info label="Rubrique">{rubriques.find((r) => r.id === compte.rubrique_id)?.nom}</Info>
            <Info label="Site">{compte.site && <Lien url={compte.site} />}</Info>
            <Info label="Blog ou actualités">{compte.blog && <Lien url={compte.blog} />}</Info>
            <Info label="LinkedIn">{compte.linkedin && <Lien url={compte.linkedin} />}</Info>
            {cat === "comptes" && <Info label="Facebook">{compte.facebook && <Lien url={compte.facebook} />}</Info>}
            <Info label="Notes">{compte.notes}</Info>
          </>
        )}
        {expression && (
          <>
            <Info label="Rubrique">{rubriques.find((r) => r.id === expression.rubrique_id)?.nom}</Info>
            <Info label="Où elle est cherchée">{expression.reseaux ? "Presse, web et réseaux sociaux" : "Presse et web"}</Info>
            <Info label="Notes">{expression.notes}</Info>
          </>
        )}
        {rubrique && (
          <>
            <Info label="Ce qu'on y range">{rubrique.description}</Info>
            <Info label="Case du rapport">{AXES_RUBRIQUE.find((x) => x.cle === rubrique.axe)?.label}</Info>
            <Info label="Ordre dans le rapport">{String(rubrique.ordre)}</Info>
          </>
        )}
        <Info label="Suivi">{(source ?? reseau ?? compte ?? expression ?? rubrique)?.actif ? "Oui" : "Non suivi"}</Info>
        <div className="mt-5 flex justify-end">
          <button type="button" onClick={onFermer} className="rounded-full px-5 py-2.5 text-sm font-bold text-muted-foreground hover:bg-muted">Fermer</button>
        </div>
      </Modal>
    );
  }

  const champ = (k: string, label: string, props: React.InputHTMLAttributes<HTMLInputElement> = {}) => (
    <label className="block min-w-0">
      <span className={libelleCls}>{label}</span>
      <input value={String(v[k] ?? "")} onChange={maj(k)} className={champCls} {...props} />
    </label>
  );
  const choixRubrique = (
    <label className="block min-w-0">
      <span className={libelleCls}>Rubrique</span>
      <select value={String(v.rubrique_id ?? "")} onChange={maj("rubrique_id")} className={champCls}>
        <option value="">Laisser Vigile choisir</option>
        {rubriques.map((r) => <option key={r.id} value={r.id}>{r.nom}</option>)}
      </select>
    </label>
  );
  const notes = (
    <label className="block">
      <span className={libelleCls}>Notes pour Vigile</span>
      <textarea value={String(v.notes ?? "")} onChange={maj("notes")} rows={2} className={champCls} placeholder="Ce qu'il faut surveiller" />
    </label>
  );

  return (
    <Modal onClose={() => !envoi && onFermer()} width={520}>
      <form onSubmit={valider}>
        <h2 className="mb-4 font-display text-xl font-semibold text-avisdoc-ink">
          {fiche.id ? `Modifier ${fem ? "la" : "le"} ${nom}` : `Ajouter ${fem ? "une" : "un"} ${nom}`}
        </h2>
        <div className="space-y-3.5">
          {(cat === "presse" || cat === "scientifique" || cat === "moteurs") && (
            <>
              {champ("nom", "Nom *", { autoFocus: true, placeholder: cat === "presse" ? "Ouest-France" : "Santé publique France" })}
              {integree ? (
                <p className="text-[12px] text-muted-foreground">Base intégrée à Vigile : son adresse ne se change pas.</p>
              ) : (
                <>
                  {champ("url", "Adresse du site ou de son flux RSS *", { placeholder: "https://…", inputMode: "url" })}
                  <p className="-mt-2 text-[12px] text-muted-foreground">Vigile lit le flux du site s'il en a un ; sinon il cherche directement sur le site.</p>
                </>
              )}
            </>
          )}
          {cat === "reseaux" && (
            <>
              {champ("nom", "Nom *", { autoFocus: true, placeholder: "Skin Analytics" })}
              <label className="block min-w-0">
                <span className={libelleCls}>Plateforme</span>
                <select value={String(v.plateforme)} onChange={maj("plateforme")} className={champCls}>
                  {PLATEFORMES.map((p) => <option key={p.cle} value={p.cle}>{p.label}</option>)}
                </select>
              </label>
              {champ("url", "Adresse de la page", { placeholder: "https://www.linkedin.com/company/…", inputMode: "url" })}
              {notes}
            </>
          )}
          {(cat === "comptes" || cat === "influenceurs") && (
            <>
              {champ("nom", "Nom *", { autoFocus: true, placeholder: cat === "influenceurs" ? "Prénom Nom" : "Skin Analytics" })}
              {choixRubrique}
              {champ("site", "Site", { placeholder: "https://…", inputMode: "url" })}
              {champ("blog", "Blog ou page d'actualités", { placeholder: "https://…/actualites", inputMode: "url" })}
              {champ("linkedin", "Page LinkedIn", { placeholder: "https://www.linkedin.com/…", inputMode: "url" })}
              {cat === "comptes" && champ("facebook", "Page Facebook", { placeholder: "https://www.facebook.com/…", inputMode: "url" })}
              {notes}
            </>
          )}
          {cat === "expressions" && pourNous && (
            <>
              {champ("expression", "Nom à chercher *", { autoFocus: true, placeholder: "AvisDoc, un produit, un dirigeant…" })}
              <p className="-mt-2 text-[12px] text-muted-foreground">Cherché chaque matin partout : presse, web et réseaux sociaux.</p>
              {notes}
            </>
          )}
          {cat === "expressions" && !pourNous && (
            <>
              {champ("expression", "Expression *", { autoFocus: true, placeholder: "dépistage cancer de la peau entreprise" })}
              {choixRubrique}
              {notes}
              <label className="flex items-start gap-2.5 text-[13px] text-avisdoc-ink">
                <input type="checkbox" checked={Boolean(v.reseaux)} onChange={(e) => setV((x) => ({ ...x, reseaux: e.target.checked }))} className="mt-0.5 size-4 accent-avisdoc-teal" />
                <span>
                  Aussi sur les réseaux sociaux (LinkedIn, Facebook, Instagram, X, YouTube)
                  <span className="block text-[12px] text-muted-foreground">Sinon : presse et web seulement. Cochée, l'expression coûte cinq recherches Linkup de plus à chaque tournée.</span>
                </span>
              </label>
            </>
          )}
          {cat === "rubriques" && (
            <>
              {champ("nom", "Nom *", { autoFocus: true })}
              <label className="block">
                <span className={libelleCls}>Ce qu'on y range</span>
                <textarea value={String(v.description ?? "")} onChange={maj("description")} rows={3} className={champCls} placeholder="Vigile s'en sert pour classer chaque article." />
              </label>
              <label className="block min-w-0">
                <span className={libelleCls}>Case du rapport</span>
                <select value={String(v.axe)} onChange={maj("axe")} className={champCls}>
                  {AXES_RUBRIQUE.map((x) => <option key={x.cle} value={x.cle}>{x.label}</option>)}
                </select>
              </label>
              {champ("ordre", "Ordre dans le rapport", { inputMode: "numeric" })}
            </>
          )}
          {adresseFausse && <p className="text-[12px] text-red-600">Une adresse doit commencer par https:// (ou http://).</p>}
          {source && NON_BRANCHE(source) ? (
            <p className="pt-1 text-[12px] text-muted-foreground">{source.params?.note}</p>
          ) : (
          <label className="flex items-center gap-2.5 pt-1 text-[13px] text-avisdoc-ink">
            <input type="checkbox" checked={Boolean(v.actif)} onChange={(e) => setV((x) => ({ ...x, actif: e.target.checked }))} className="size-4 accent-avisdoc-teal" />
            Suivi par Vigile (décocher pour le mettre en « Non suivi »)
          </label>
          )}
        </div>
        <div className="mt-6 flex justify-end gap-2">
          <button type="button" disabled={envoi} onClick={onFermer} className="rounded-full px-5 py-2.5 text-sm font-bold text-muted-foreground hover:bg-muted">Annuler</button>
          <button type="submit" disabled={!pret || envoi} className="ad-btn-accent inline-flex items-center gap-1.5 rounded-full bg-avisdoc-teal px-5 py-2.5 text-sm font-bold text-white disabled:opacity-50">
            {envoi && <Loader2 className="size-4 animate-spin" />}
            Enregistrer
          </button>
        </div>
      </form>
    </Modal>
  );
}
