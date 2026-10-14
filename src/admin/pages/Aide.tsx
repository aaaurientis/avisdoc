// Aide : la partie commerciale expliquée — le chemin d'une entreprise, des exercices
// pour prendre la main, des questions toutes prêtes avec leur réponse, puis chaque
// écran. Le contenu vit dans lib/aide.ts.

import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, Check, ChevronDown, Search, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Card, PageHeader, SectionLabel } from "../components/ui";
import { ECRANS, EXERCICES, PARCOURS, QUESTIONS, type ExerciceAide } from "../lib/aide";

/** Les exercices cochés, gardés dans ce navigateur : un confort, rien de plus. */
const CLE_EXERCICES = "avisdoc-aide-exercices";
function lireFaits(): Set<string> {
  try {
    return new Set(JSON.parse(localStorage.getItem(CLE_EXERCICES) ?? "[]") as string[]);
  } catch {
    return new Set();
  }
}

function Exercice({ ex, fait, onBasculer }: { ex: ExerciceAide; fait: boolean; onBasculer: () => void }) {
  return (
    <details className="group border-b border-border last:border-b-0">
      <summary className="flex min-h-11 cursor-pointer list-none items-center gap-3 px-4 py-3 [&::-webkit-details-marker]:hidden">
        <button
          type="button"
          role="checkbox"
          aria-checked={fait}
          aria-label={fait ? `${ex.titre} : fait` : `${ex.titre} : à faire`}
          onClick={(e) => {
            e.preventDefault(); // cocher n'ouvre pas l'exercice
            onBasculer();
          }}
          className={cn(
            "inline-flex size-6 shrink-0 items-center justify-center rounded-full border-2 transition-colors",
            fait ? "border-avisdoc-teal bg-avisdoc-teal text-white" : "border-border text-transparent hover:border-avisdoc-teal",
          )}
        >
          <Check className="size-3.5" strokeWidth={3} />
        </button>
        <span className={cn("min-w-0 flex-1 text-sm font-semibold", fait ? "text-muted-foreground line-through" : "text-avisdoc-ink")}>
          {ex.titre}
        </span>
        <ChevronDown className="size-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-180" />
      </summary>
      <div className="px-4 pb-4 pl-[52px]">
        <ol className="flex list-decimal flex-col gap-1.5 pl-4 text-[13px] leading-relaxed text-muted-foreground marker:font-bold marker:text-avisdoc-teal">
          {ex.etapes.map((e) => (
            <li key={e}>{e}</li>
          ))}
        </ol>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Link
            to={ex.to}
            className="inline-flex items-center gap-1.5 rounded-full bg-accent px-4 py-2 text-[13px] font-bold text-avisdoc-ink transition-colors hover:bg-avisdoc-ink hover:text-white"
          >
            Y aller <ArrowRight className="size-3.5" />
          </Link>
          {!fait && (
            <button
              type="button"
              onClick={onBasculer}
              className="rounded-full border border-border px-4 py-2 text-[13px] font-bold text-avisdoc-ink transition-colors hover:border-avisdoc-teal"
            >
              C’est fait
            </button>
          )}
        </div>
      </div>
    </details>
  );
}

/** Minuscules et sans accents : « reunion » trouve « Réunion ». */
const normaliser = (t: string) =>
  t.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

function Question({ question, reponse, ouverte }: { question: string; reponse: string; ouverte: boolean }) {
  return (
    <details open={ouverte} className="group border-b border-border last:border-b-0">
      <summary className="flex min-h-11 cursor-pointer list-none items-center gap-3 px-4 py-3 text-sm font-semibold text-avisdoc-ink [&::-webkit-details-marker]:hidden">
        <span className="min-w-0 flex-1">{question}</span>
        <ChevronDown className="size-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-180" />
      </summary>
      <p className="px-4 pb-4 text-[13px] leading-relaxed text-muted-foreground">{reponse}</p>
    </details>
  );
}

export default function Aide() {
  const [recherche, setRecherche] = useState("");
  const [faits, setFaits] = useState<Set<string>>(lireFaits);

  useEffect(() => {
    try {
      localStorage.setItem(CLE_EXERCICES, JSON.stringify([...faits]));
    } catch {
      // Navigateur privé ou stockage bloqué : les cases restent cochées le temps de la visite.
    }
  }, [faits]);

  const basculer = (id: string) =>
    setFaits((avant) => {
      const apres = new Set(avant);
      if (apres.has(id)) apres.delete(id);
      else apres.add(id);
      return apres;
    });
  const nbFaits = EXERCICES.filter((e) => faits.has(e.id)).length;
  const terme = normaliser(recherche.trim());

  const themes = useMemo(() => {
    if (!terme) return QUESTIONS;
    return QUESTIONS.map((t) => ({
      ...t,
      questions: t.questions.filter((q) => normaliser(`${q.question} ${q.reponse}`).includes(terme)),
    })).filter((t) => t.questions.length > 0);
  }, [terme]);

  const trouvees = themes.reduce((n, t) => n + t.questions.length, 0);

  return (
    <div className="max-w-4xl">
      <PageHeader title="Aide" subtitle="Comment fonctionne le bloc Commercial : le chemin d’une entreprise, des exercices, les questions qu’on se pose, et chaque écran." />

      {/* Le chemin d'une entreprise : la phrase qui rend les autres écrans lisibles. */}
      <Card className="mb-6 p-5">
        <SectionLabel>Le chemin d'une entreprise</SectionLabel>
        <ol className="mt-3 grid gap-3 sm:grid-cols-4">
          {PARCOURS.map((p, i) => (
            <li key={p.etape} className="flex gap-2 sm:flex-col">
              <span className="flex items-center gap-2 text-sm font-bold text-avisdoc-ink">
                <span className="inline-flex size-6 shrink-0 items-center justify-center rounded-full bg-avisdoc-teal text-[12px] text-white">
                  {i + 1}
                </span>
                {p.etape}
              </span>
              <span className="text-[13px] leading-relaxed text-muted-foreground">{p.texte}</span>
            </li>
          ))}
        </ol>
        <ul className="mt-4 flex flex-col gap-1 text-[13px] leading-relaxed text-muted-foreground">
          <li>
            Le <strong className="text-avisdoc-ink">Planning</strong> montre tout ce qui est programmé.
          </li>
          <li>
            Le <strong className="text-avisdoc-ink">Débrief</strong> range ce que vous avez raconté après un rendez-vous, depuis le
            téléphone ou l’ordinateur.
          </li>
          <li>
            Le <strong className="text-avisdoc-ink">CAP</strong> dit ce que coûte chaque prospect.
          </li>
          <li>
            La <strong className="text-avisdoc-ink">Corbeille</strong> garde 30 jours ce qui est supprimé.
          </li>
        </ul>
      </Card>

      {/* Pour prendre la main : quelques gestes à faire une fois, dans l'ordre. */}
      <section className="mb-8">
        <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
          <div>
            <h2 className="font-display text-xl font-semibold text-avisdoc-ink">Pour prendre la main</h2>
            <p className="mt-1 text-[13px] text-muted-foreground">
              Sept exercices, dans l’ordre d’une vraie journée. Cochez-les au fur et à mesure.
            </p>
          </div>
          <span className="text-[13px] font-bold text-avisdoc-ink">
            {nbFaits} / {EXERCICES.length} faits
          </span>
        </div>
        <div className="mb-3 h-2 overflow-hidden rounded-full bg-muted">
          <div className="h-full rounded-full bg-avisdoc-teal transition-all" style={{ width: `${(nbFaits / EXERCICES.length) * 100}%` }} />
        </div>
        <Card className="overflow-hidden">
          {EXERCICES.map((ex) => (
            <Exercice key={ex.id} ex={ex} fait={faits.has(ex.id)} onBasculer={() => basculer(ex.id)} />
          ))}
        </Card>
      </section>

      {/* Les questions : c'est ce qu'on vient chercher le plus souvent. */}
      <section className="mb-8">
        <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <h2 className="font-display text-xl font-semibold text-avisdoc-ink">Questions fréquentes</h2>
          <label className="relative block sm:w-72">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <input
              value={recherche}
              onChange={(e) => setRecherche(e.target.value)}
              placeholder="Chercher une question…"
              className="h-11 w-full rounded-full border border-border bg-card pl-9 pr-10 text-sm text-avisdoc-ink outline-none focus:border-avisdoc-teal"
            />
            {recherche && (
              <button
                type="button"
                onClick={() => setRecherche("")}
                aria-label="Effacer la recherche"
                className="absolute right-1 top-1/2 inline-flex size-9 -translate-y-1/2 items-center justify-center rounded-full text-muted-foreground hover:text-avisdoc-ink"
              >
                <X className="size-4" />
              </button>
            )}
          </label>
        </div>

        {themes.length === 0 ? (
          <div className="rounded-2xl bg-muted/60 p-6 text-center text-sm text-muted-foreground">
            Aucune question ne parle de « {recherche.trim()} ». Essayez un autre mot, ou demandez à Merx.
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            {terme && (
              <p className="text-[13px] text-muted-foreground">
                {trouvees} question{trouvees > 1 ? "s" : ""} trouvée{trouvees > 1 ? "s" : ""}
              </p>
            )}
            {themes.map((t) => (
              <div key={t.titre}>
                <SectionLabel className="mb-2">{t.titre}</SectionLabel>
                <Card className="overflow-hidden">
                  {t.questions.map((q) => (
                    // La clé change avec la recherche : les réponses trouvées s'ouvrent d'elles-mêmes.
                    <Question key={`${q.question}-${!!terme}`} question={q.question} reponse={q.reponse} ouverte={!!terme} />
                  ))}
                </Card>
              </div>
            ))}
          </div>
        )}
      </section>

      <section>
        <h2 className="mb-3 font-display text-xl font-semibold text-avisdoc-ink">Les écrans, un par un</h2>
        <div className="mb-4 flex flex-wrap gap-2">
          {ECRANS.map((e) => (
            <a
              key={e.id}
              href={`#aide-${e.id}`}
              onClick={(ev) => {
                // HashRouter : une ancre classique changerait de page. On fait défiler à la main.
                ev.preventDefault();
                document.getElementById(`aide-${e.id}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
              }}
              className="rounded-full border border-border bg-card px-3.5 py-2 text-[13px] font-semibold text-muted-foreground transition-colors hover:border-avisdoc-teal hover:text-avisdoc-ink"
            >
              {e.titre}
            </a>
          ))}
        </div>
        <div className="flex flex-col gap-4">
          {ECRANS.map((e) => (
            <Card key={e.id} className="scroll-mt-4 p-5">
              <div id={`aide-${e.id}`} className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                  <h3 className="font-display text-lg font-semibold text-avisdoc-ink">{e.titre}</h3>
                  <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{e.resume}</p>
                </div>
                <Link
                  to={e.to}
                  className={cn(
                    "inline-flex shrink-0 items-center gap-1.5 self-start rounded-full px-4 py-2 text-[13px] font-bold",
                    "bg-accent text-avisdoc-ink transition-colors hover:bg-avisdoc-ink hover:text-white",
                  )}
                >
                  Ouvrir <ArrowRight className="size-3.5" />
                </Link>
              </div>
              <ul className="mt-3 flex list-disc flex-col gap-1.5 pl-5 text-[13px] leading-relaxed text-muted-foreground marker:text-avisdoc-teal">
                {e.points.map((p) => (
                  <li key={p}>{p}</li>
                ))}
              </ul>
            </Card>
          ))}
        </div>
      </section>
    </div>
  );
}
