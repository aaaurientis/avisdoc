// Débrief : le commercial raconte, Merx range, c'est fini.
//
// Il y avait une étape de validation — des cases à cocher, un second bouton. Elle
// partait d'une bonne intention, mais elle coûtait trente secondes d'attente, un écran
// à comprendre et un choix à faire, pour quelqu'un qui veut seulement que ce soit
// rangé. Et rien n'étant vraiment détruit — les fiches se modifient, la corbeille
// garde trente jours, l'historique montre tout —, une erreur se corrige après coup
// plus vite qu'elle ne se prévient.
//
// Deux façons de raconter, à la voix ou au clavier, et la même suite : ça part, ça se
// range, on dit où.

import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { ArrowRight, Check, Loader2, Mic, PenLine, Play, Sparkles, Trash2 } from "lucide-react";
import { Link } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { Card, Modal, PageHeader, SectionLabel } from "../components/ui";
import BoutonRetour from "../components/BoutonRetour";
import { confirmer } from "../components/Confirmation";
import { supabaseAdmin } from "../data/supabaseAdmin";
import { useActualisation } from "../lib/actualisation";
import { OU_TROUVER, traiterDebrief, transcrireNote, type Bilan } from "../lib/debrief";
import { cn } from "@/lib/utils";

/** Un débrief déjà raconté — dicté ou écrit, c'est la même table. */
interface Passe {
  id: string;
  audio_path: string | null;
  duree_s: number | null;
  statut: string;
  message: string | null;
  titre: string | null;
  transcription: string | null;
  extraction: unknown;
  created_at: string;
}

/**
 * Ce qu'on affiche pour une note déjà rangée.
 *
 * Le titre porte le résumé depuis le 23/09 ; les notes d'avant ne l'ont pas, alors on
 * le reconstruit depuis ce que Merx avait lu — « Débrief dicté » ne disait rien de ce
 * qui avait été rangé, ni où.
 */
function titreDe(n: Passe): string {
  if (n.titre?.trim()) return n.titre;

  type Vue = { entreprise?: string; a_creer?: string; fiche_type?: string };
  const e = n.extraction as { lecture?: { entreprises?: Vue[] }; entreprises?: Vue[] } | null;
  const liste = e?.lecture?.entreprises ?? e?.entreprises ?? [];

  // La destination se déduit de ce que Merx avait décidé : l'endroit où il allait la
  // créer, ou celui de la fiche qu'il avait reconnue. Sans elle, on lit un nom sans
  // savoir où le retrouver — ce qui ne vaut guère mieux que « Débrief dicté ».
  const bouts = liste
    .filter((x) => x?.entreprise)
    .map((x) => {
      const ou = OU_TROUVER[x.a_creer || x.fiche_type || ""]?.ecran;
      return ou ? `${x.entreprise} → ${ou}` : (x.entreprise as string);
    });

  if (bouts.length === 0) return n.audio_path ? "Débrief dicté" : "Débrief écrit";
  return bouts.length <= 3 ? bouts.join(" · ") : `${bouts.slice(0, 3).join(" · ")} et ${bouts.length - 3} autre${bouts.length - 3 > 1 ? "s" : ""}`;
}

const chrono = (s: number | null) => (s == null ? "—" : `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`);
const quandCourt = (iso: string) =>
  new Date(iso).toLocaleString("fr-FR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

const EXEMPLE =
  "J’ai vu la mairie de Bordeaux, très contente qu’on puisse s’occuper de ses agents des espaces verts. " +
  "Elle m’a dit qu’ils avaient déjà la médecine du travail, mais quand j’ai expliqué que les gens repartent " +
  "avec un rendez-vous, ça a changé. Ils veulent une proposition pour deux journées. " +
  "Sinon j’ai rappelé Jardin Eau Bois, personne, à relancer jeudi.";

/** Ce que Merx vient de faire, dit en clair et sans jargon. */
function CompteRendu({ bilan, onFermer }: { bilan: Bilan; onFermer: () => void }) {
  const rien = bilan.creees.length === 0 && bilan.fiches.length === 0 && bilan.nonRattachees.length === 0;

  return (
    <Card className="mb-4 border-l-4 border-l-avisdoc-teal p-4">
      <div className="flex items-center gap-1.5">
        <Check className="size-4 text-avisdoc-teal" />
        <SectionLabel className="text-avisdoc-teal">C’est rangé</SectionLabel>
      </div>

      {rien ? (
        <p className="mt-2 text-[13.5px] leading-relaxed text-muted-foreground">
          Merx n’a reconnu aucune entreprise dans ce récit. Citez-les par leur nom, même approximatif, et il fera
          le lien.
        </p>
      ) : (
        <div className="mt-2.5 space-y-2">
          {bilan.creees.map((c) => {
            const ou = OU_TROUVER[c.ou] ?? OU_TROUVER.prospect;
            return (
              <div key={`c-${c.nom}`} className="flex flex-wrap items-center gap-2 text-[13.5px]">
                <span className="rounded-full bg-avisdoc-teal/10 px-2 py-0.5 text-[11px] font-bold text-avisdoc-teal">
                  créée
                </span>
                <span className="font-semibold text-avisdoc-ink">{c.nom}</span>
                <Link
                  to={ou.route}
                  className="inline-flex items-center gap-1 rounded-full border border-border px-3 py-1 text-[12.5px] font-bold text-avisdoc-ink transition-colors hover:border-avisdoc-teal"
                >
                  {ou.ecran} <ArrowRight className="size-3.5" />
                </Link>
              </div>
            );
          })}

          {bilan.fiches.map((nom) => (
            <div key={`f-${nom}`} className="flex flex-wrap items-center gap-2 text-[13.5px]">
              <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-bold text-muted-foreground">
                mise à jour
              </span>
              <span className="font-semibold text-avisdoc-ink">{nom}</span>
            </div>
          ))}
        </div>
      )}

      {(bilan.objections > 0 || bilan.mouches > 0 || bilan.actions > 0) && (
        <p className="mt-3 border-t border-border pt-2.5 text-[12.5px] text-muted-foreground">
          {[
            bilan.actions > 0 && `${bilan.actions} action${bilan.actions > 1 ? "s" : ""} au planning`,
            bilan.objections > 0 && `${bilan.objections} objection${bilan.objections > 1 ? "s" : ""} retenue${bilan.objections > 1 ? "s" : ""}`,
            bilan.mouches > 0 && `${bilan.mouches} argument${bilan.mouches > 1 ? "s" : ""} qui a porté`,
          ]
            .filter(Boolean)
            .join(" · ")}
        </p>
      )}

      {bilan.nonRattachees.length > 0 && (
        <div className="mt-3 border-t border-border pt-2.5">
          <SectionLabel>Ce que Merx n’a pas su ranger</SectionLabel>
          <ul className="mt-1.5 space-y-1">
            {bilan.nonRattachees.map((n) => (
              <li key={n} className="flex gap-2 text-[12.5px] leading-snug text-muted-foreground">
                <span className="mt-[6px] size-1.5 shrink-0 rounded-full bg-muted-foreground/40" />
                <span>{n}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <button
        type="button"
        onClick={onFermer}
        className="mt-3 text-[12.5px] font-semibold text-muted-foreground underline-offset-2 hover:text-avisdoc-ink hover:underline"
      >
        Masquer
      </button>
    </Card>
  );
}

export default function Debrief() {
  const { user } = useAuth();
  const [texte, setTexte] = useState("");
  const [mode, setMode] = useState<"texte" | null>(null);
  const [enCours, setEnCours] = useState(false);
  const [bilan, setBilan] = useState<Bilan | null>(null);
  const [passes, setPasses] = useState<Passe[]>([]);
  const [ecoute, setEcoute] = useState<string | null>(null);
  /** Ce qu'on a déjà pris en charge : rien ne repart deux fois. */
  const traitees = useRef<Set<string>>(new Set());

  const chargerPasses = useCallback(async () => {
    const { data } = await supabaseAdmin
      .from("admin_notes_dictees")
      .select("id, audio_path, duree_s, statut, message, titre, transcription, extraction, created_at")
      .order("created_at", { ascending: false })
      .limit(20);
    setPasses((data ?? []) as Passe[]);
  }, []);

  useEffect(() => {
    void chargerPasses();
  }, [chargerPasses]);

  useActualisation(chargerPasses, passes.some((n) => n.statut === "recue"));

  /** Merx lit et range. Un seul geste, qu'on vienne de la voix ou du clavier. */
  const ranger = useCallback(
    async (texteDit: string, noteId: string | null) => {
      if (texteDit.trim().length < 20) return;
      setEnCours(true);
      setBilan(null);
      try {
        const b = await traiterDebrief(texteDit.trim(), user?.email ?? "", noteId);
        setBilan(b);
        setTexte("");
        setMode(null);
        await chargerPasses();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Merx n’a pas pu ranger ce débrief.");
      } finally {
        setEnCours(false);
      }
    },
    [chargerPasses, user?.email],
  );

  /**
   * Une note dictée va jusqu'au bout toute seule : transcrite, puis rangée. Le
   * commercial a parlé, il n'a rien d'autre à faire — c'était tout l'objet du Débrief,
   * et la moindre étape en plus est celle qu'on oublie.
   */
  useEffect(() => {
    if (enCours) return;
    const aFaire = passes.find(
      (n) => n.statut !== "classee" && n.statut !== "echec" && !traitees.current.has(n.id) && (n.transcription || n.audio_path),
    );
    if (!aFaire) return;
    traitees.current.add(aFaire.id);

    void (async () => {
      try {
        const texteDit = aFaire.transcription ?? (await transcrireNote(aFaire.id));
        await ranger(texteDit, aFaire.id);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "La note n’a pas pu être traitée.");
        await chargerPasses();
      }
    })();
  }, [passes, enCours, ranger, chargerPasses]);

  /**
   * Retirer une note.
   *
   * L'enregistrement part avec elle : une voix gardée sur un serveur sans raison n'a
   * rien à y faire. Ce que Merx en avait tiré — la fiche créée, les actions, la ligne
   * d'historique — reste en place : ce sont des faits qui ont leur vie propre, et les
   * effacer d'un coup ferait plus de dégâts que de bien. On le dit clairement.
   */
  const supprimer = async (n: Passe) => {
    const ok = await confirmer({
      titre: "Supprimer cette note ?",
      message:
        "L’enregistrement sera effacé définitivement. Ce que Merx en a rangé — la fiche, les actions, l’historique — reste en place.",
      action: "Supprimer",
      definitif: true,
    });
    if (!ok) return;
    try {
      if (n.audio_path) await supabaseAdmin.storage.from("admin-dictee").remove([n.audio_path]);
      const { error } = await supabaseAdmin.from("admin_notes_dictees").delete().eq("id", n.id);
      if (error) throw new Error(error.message);
      traitees.current.delete(n.id);
      await chargerPasses();
      toast.success("Note supprimée.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "La note n’a pas pu être supprimée.");
    }
  };

  const ecouter = async (n: Passe) => {
    if (!n.audio_path) return;
    const { data, error } = await supabaseAdmin.storage.from("admin-dictee").createSignedUrl(n.audio_path, 3600);
    if (error || !data) {
      toast.error("L’enregistrement n’a pas pu être ouvert.");
      return;
    }
    setEcoute(data.signedUrl);
  };

  const etatDe = (n: Passe) =>
    n.statut === "classee"
      ? "rangée"
      : n.statut === "echec"
        ? n.message ?? "échec"
        : traitees.current.has(n.id)
          ? "en cours de traitement…"
          : "en attente";

  return (
    <div>
      <PageHeader
        title="Débrief"
        subtitle="Racontez votre sortie. Merx range, et vous dit où."
        action={mode !== null ? <BoutonRetour onRetour={() => setMode(null)} /> : undefined}
      />

      {enCours && (
        <div className="mb-4 flex items-center gap-2 rounded-2xl border border-l-4 border-border border-l-avisdoc-teal px-4 py-3 text-[13.5px] font-semibold text-avisdoc-ink">
          <Loader2 className="size-4 animate-spin text-avisdoc-teal" />
          Merx lit et range… une trentaine de secondes.
        </div>
      )}

      {bilan && !enCours && <CompteRendu bilan={bilan} onFermer={() => setBilan(null)} />}

      {mode === null && !enCours && (
        <div className="mb-4 grid gap-3 sm:grid-cols-2">
          <Link
            to="/dictee"
            className="rounded-2xl border border-border bg-card p-6 transition-colors hover:border-avisdoc-teal"
          >
            <span className="flex size-11 items-center justify-center rounded-full bg-avisdoc-teal/10 text-avisdoc-teal">
              <Mic className="size-5" />
            </span>
            <h2 className="mt-3 font-display text-lg font-semibold text-avisdoc-ink">À la voix</h2>
            <p className="mt-1 text-[13px] leading-relaxed text-muted-foreground">
              En sortant d’un rendez-vous, ou le soir pour toute la journée. Jusqu’à dix minutes, même sans réseau.
              Tout se fait ensuite sans vous.
            </p>
          </Link>

          <button
            type="button"
            onClick={() => setMode("texte")}
            className="rounded-2xl border border-border bg-card p-6 text-left transition-colors hover:border-avisdoc-teal"
          >
            <span className="flex size-11 items-center justify-center rounded-full bg-avisdoc-coral/10 text-avisdoc-coral">
              <PenLine className="size-5" />
            </span>
            <h2 className="mt-3 font-display text-lg font-semibold text-avisdoc-ink">Au clavier</h2>
            <p className="mt-1 text-[13px] leading-relaxed text-muted-foreground">
              Devant son écran, quand on préfère écrire. Plusieurs entreprises, dans le désordre : Merx s’occupe
              du tri.
            </p>
          </button>
        </div>
      )}

      {mode === "texte" && !enCours && (
        <Card className="mb-4 p-4">
          <SectionLabel>Ce qui s’est passé</SectionLabel>
          <p className="mt-1 text-[12.5px] text-muted-foreground">
            Écrivez comme vous parleriez : plusieurs entreprises, dans le désordre, peu importe.
          </p>
          <textarea
            value={texte}
            onChange={(e) => setTexte(e.target.value)}
            rows={8}
            placeholder={EXEMPLE}
            className="ad-input mt-3 w-full resize-none rounded-xl border border-border bg-background px-3.5 py-3 text-[13.5px] leading-relaxed outline-none transition-colors focus:border-avisdoc-teal"
          />
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => void ranger(texte, null)}
              disabled={texte.trim().length < 20}
              className="ad-btn-accent inline-flex items-center gap-1.5 rounded-full bg-avisdoc-teal px-5 py-2.5 text-sm font-bold text-white disabled:opacity-50"
            >
              <Sparkles className="size-4" /> Merx range ça
            </button>
            {!texte && (
              <button
                type="button"
                onClick={() => setTexte(EXEMPLE)}
                className="text-[13px] font-semibold text-muted-foreground underline-offset-2 hover:text-avisdoc-ink hover:underline"
              >
                Voir un exemple
              </button>
            )}
          </div>
        </Card>
      )}

      {passes.length > 0 && (
        <Card className="p-4">
          <SectionLabel>Ce que vous avez raconté</SectionLabel>
          <div className="mt-2 divide-y divide-border">
            {passes.map((n) => (
              <div key={n.id} className="flex flex-wrap items-center gap-3 py-2.5">
                <span
                  className={cn(
                    "flex size-7 shrink-0 items-center justify-center rounded-full",
                    n.statut === "classee" ? "bg-avisdoc-teal/10 text-avisdoc-teal" : "bg-muted text-muted-foreground",
                  )}
                >
                  {n.statut === "classee" ? (
                    <Check className="size-3.5" />
                  ) : n.audio_path ? (
                    <Mic className="size-3.5" />
                  ) : (
                    <PenLine className="size-3.5" />
                  )}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13px] font-semibold text-avisdoc-ink">
                    {titreDe(n)}
                  </span>
                  <span className="block text-[11.5px] text-muted-foreground">
                    {quandCourt(n.created_at)}
                    {n.duree_s != null && ` · ${chrono(n.duree_s)}`} · {etatDe(n)}
                  </span>
                </span>
                {n.audio_path && (
                  <button
                    type="button"
                    onClick={() => void ecouter(n)}
                    className="inline-flex items-center gap-1.5 rounded-full border border-border px-3.5 py-1.5 text-[12.5px] font-bold text-avisdoc-ink transition-colors hover:border-avisdoc-teal"
                  >
                    <Play className="size-3.5" /> Réécouter
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => void supprimer(n)}
                  aria-label={`Supprimer ${titreDe(n)}`}
                  title="Supprimer cette note"
                  className="rounded-lg p-2 text-muted-foreground transition-colors hover:text-rose-700"
                >
                  <Trash2 className="size-4" />
                </button>

                {/* Une note en échec se reprend ; une note rangée, jamais. */}
                {n.statut === "echec" && (
                  <button
                    type="button"
                    disabled={enCours}
                    onClick={() => {
                      traitees.current.delete(n.id);
                      void chargerPasses();
                    }}
                    className="ad-btn-accent inline-flex items-center gap-1.5 rounded-full bg-avisdoc-teal px-3.5 py-1.5 text-[12.5px] font-bold text-white disabled:opacity-60"
                  >
                    <Sparkles className="size-3.5" /> Réessayer
                  </button>
                )}
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* La lecture ne démarre jamais toute seule. */}
      {ecoute && (
        <Modal onClose={() => setEcoute(null)} width={420}>
          <h2 className="font-display text-lg font-semibold text-avisdoc-ink">Réécouter</h2>
          <audio src={ecoute} controls className="mt-4 w-full">
            <track kind="captions" />
          </audio>
          <button
            type="button"
            onClick={() => setEcoute(null)}
            className="mt-4 rounded-full border border-border px-5 py-2.5 text-sm font-bold text-muted-foreground transition-colors hover:border-avisdoc-ink hover:text-avisdoc-ink"
          >
            Fermer
          </button>
        </Modal>
      )}
    </div>
  );
}
