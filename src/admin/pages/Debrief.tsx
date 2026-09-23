// Débrief : le commercial raconte sa sortie, Merx range, le commercial valide.
//
// Deux façons de raconter — à la voix ou au clavier — et une seule suite. Elles vivaient
// dans deux rubriques séparées, « Notes dictées » et « Débrief », ce qui obligeait à
// choisir un écran selon qu'on tape ou qu'on parle. C'est la même chose : on raconte.
//
// L'ordre compte. On dit d'abord ce qu'on a vécu, sans se soucier de la forme ; Merx
// propose ensuite un tri, entreprise par entreprise ; et rien ne part en base avant
// qu'on ait décoché ce qui ne va pas.

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { CalendarClock, Check, HandHelping, Loader2, Mail, Mic, NotebookPen, PenLine, Phone, Play, Sparkles, Target } from "lucide-react";
import { Link } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { Card, Modal, PageHeader, SectionLabel } from "../components/ui";
import { supabaseAdmin } from "../data/supabaseAdmin";
import { useActualisation } from "../lib/actualisation";
import {
  compte,
  enregistrer,
  lireDebrief,
  toutRetenir,
  type EntrepriseVue,
  type Extraction,
  type Retenu,
} from "../lib/debrief";
import { cn } from "@/lib/utils";

const ICONES: Record<string, typeof Phone> = { appel: Phone, email: Mail, rdv: CalendarClock, note: NotebookPen };

/** Un débrief déjà raconté — dicté ou écrit, c'est la même table. */
interface Passe {
  id: string;
  audio_path: string | null;
  duree_s: number | null;
  statut: string;
  message: string | null;
  titre: string | null;
  created_at: string;
}

const chrono = (s: number | null) => (s == null ? "—" : `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`);
const quandCourt = (iso: string) =>
  new Date(iso).toLocaleString("fr-FR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

const EXEMPLE =
  "J’ai vu la mairie de Bordeaux, très contente qu’on puisse s’occuper de ses agents des espaces verts. " +
  "Elle m’a dit qu’ils avaient déjà la médecine du travail, mais quand j’ai expliqué que les gens repartent " +
  "avec un rendez-vous, ça a changé. Ils veulent une proposition pour deux journées. " +
  "Sinon j’ai rappelé Jardin Eau Bois, personne, à relancer jeudi.";

/** Une case qui se coche, avec ce qu'elle retient à côté. */
function Coche({
  cochee,
  onBascule,
  children,
  ton,
}: {
  cochee: boolean;
  onBascule: () => void;
  children: React.ReactNode;
  ton?: "objection" | "mouche";
}) {
  return (
    <button
      type="button"
      onClick={onBascule}
      className={cn(
        "flex w-full items-start gap-2.5 rounded-xl border px-3.5 py-2.5 text-left transition-colors",
        cochee ? "border-avisdoc-teal bg-avisdoc-teal/5" : "border-border opacity-55 hover:opacity-100",
      )}
    >
      <span
        className={cn(
          "mt-0.5 flex size-4 shrink-0 items-center justify-center rounded border-2",
          cochee ? "border-avisdoc-teal bg-avisdoc-teal text-white" : "border-muted-foreground/40",
        )}
      >
        {cochee && <Check className="size-2.5" strokeWidth={4} />}
      </span>
      <span className="min-w-0 flex-1">{children}</span>
      {ton && (
        <span
          className={cn(
            "mt-0.5 shrink-0 rounded-full px-2 py-0.5 text-[10.5px] font-bold",
            ton === "objection" ? "bg-avisdoc-coral/15 text-avisdoc-coral" : "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
          )}
        >
          {ton === "objection" ? "a bloqué" : "a porté"}
        </span>
      )}
    </button>
  );
}

function FicheVue({
  vue,
  retenu,
  onChange,
}: {
  vue: EntrepriseVue;
  retenu: Retenu;
  onChange: (r: Retenu) => void;
}) {
  const bascule = <K extends "objections" | "mouches" | "actions">(cle: K, i: number) => {
    const suivant = [...retenu[cle]];
    suivant[i] = !suivant[i];
    onChange({ ...retenu, [cle]: suivant });
  };

  const reconnue = Boolean(vue.fiche_id);

  return (
    <Card className="mb-3 p-4">
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="font-display text-lg font-semibold text-avisdoc-ink">{vue.entreprise}</h3>
        {reconnue ? (
          <span className="rounded-full bg-avisdoc-teal/10 px-2.5 py-1 text-[11px] font-bold text-avisdoc-teal">
            fiche reconnue · {vue.fiche_type}
          </span>
        ) : (
          <span className="rounded-full bg-avisdoc-coral/15 px-2.5 py-1 text-[11px] font-bold text-avisdoc-coral">
            aucune fiche trouvée
          </span>
        )}
      </div>

      {!reconnue && (
        <p className="mb-3 rounded-xl border border-l-4 border-border border-l-avisdoc-coral px-3.5 py-2.5 text-[12.5px] leading-snug text-muted-foreground">
          Merx n’a pas retrouvé cette entreprise dans vos fiches. Ce qui a bloqué et ce qui a porté sera quand
          même gardé — c’est utile à l’équipe. En revanche, le résumé et les actions ne peuvent se ranger nulle part.
        </p>
      )}

      <div className="space-y-2">
        {vue.resume.trim() && reconnue && (
          <Coche cochee={retenu.resume} onBascule={() => onChange({ ...retenu, resume: !retenu.resume })}>
            <span className="block text-[11px] font-bold uppercase tracking-[0.06em] text-muted-foreground">
              Dans l’historique
            </span>
            <span className="mt-0.5 block text-[13.5px] leading-snug text-avisdoc-ink">{vue.resume}</span>
          </Coche>
        )}

        {vue.objections.map((o, i) => (
          <Coche key={`o${i}`} cochee={retenu.objections[i]} onBascule={() => bascule("objections", i)} ton="objection">
            <span className="block text-[13.5px] font-semibold italic leading-snug text-avisdoc-ink">« {o.verbatim} »</span>
            {o.reponse && <span className="mt-0.5 block text-[12.5px] leading-snug text-muted-foreground">Réponse : {o.reponse}</span>}
            {o.famille && <span className="mt-0.5 block text-[11.5px] text-muted-foreground">rangé dans « {o.famille} »</span>}
          </Coche>
        ))}

        {vue.mouches.map((m, i) => (
          <Coche key={`m${i}`} cochee={retenu.mouches[i]} onBascule={() => bascule("mouches", i)} ton="mouche">
            <span className="block text-[13.5px] font-semibold leading-snug text-avisdoc-ink">{m.verbatim}</span>
            {m.famille && <span className="mt-0.5 block text-[11.5px] text-muted-foreground">rangé dans « {m.famille} »</span>}
          </Coche>
        ))}

        {reconnue &&
          vue.actions.map((a, i) => {
            const Icone = ICONES[a.genre] ?? NotebookPen;
            return (
              <Coche key={`a${i}`} cochee={retenu.actions[i]} onBascule={() => bascule("actions", i)}>
                <span className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.06em] text-avisdoc-coral">
                  <Icone className="size-3.5" /> À faire
                </span>
                <span className="mt-0.5 block text-[13.5px] leading-snug text-avisdoc-ink">{a.quoi}</span>
                <span className="mt-0.5 block text-[11.5px] text-muted-foreground">
                  {a.quand ? new Date(a.quand).toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" }) : "sans date — posée aujourd’hui"}
                </span>
              </Coche>
            );
          })}

        {vue.etape.trim() && vue.fiche_type === "affaire" && (
          <Coche cochee={retenu.etape} onBascule={() => onChange({ ...retenu, etape: !retenu.etape })}>
            <span className="block text-[11px] font-bold uppercase tracking-[0.06em] text-muted-foreground">
              Dans le Pipeline
            </span>
            <span className="mt-0.5 block text-[13.5px] leading-snug text-avisdoc-ink">
              Passer à l’étape <span className="font-semibold">{vue.etape}</span>
            </span>
          </Coche>
        )}
      </div>
    </Card>
  );
}

export default function Debrief() {
  const { user } = useAuth();
  const [texte, setTexte] = useState("");
  /** `null` tant qu'on n'a pas choisi la voix ou le clavier. */
  const [mode, setMode] = useState<"texte" | null>(null);
  const [lecture, setLecture] = useState(false);
  const [extraction, setExtraction] = useState<Extraction | null>(null);
  const [retenus, setRetenus] = useState<Retenu[]>([]);
  const [envoi, setEnvoi] = useState(false);
  const [passes, setPasses] = useState<Passe[]>([]);
  const [ecoute, setEcoute] = useState<string | null>(null);

  /** Ce qu'on a déjà raconté : dicté comme écrit, les deux vivent dans la même table. */
  const chargerPasses = useCallback(async () => {
    const { data } = await supabaseAdmin
      .from("admin_notes_dictees")
      .select("id, audio_path, duree_s, statut, message, titre, created_at")
      .order("created_at", { ascending: false })
      .limit(20);
    setPasses((data ?? []) as Passe[]);
  }, []);

  useEffect(() => {
    void chargerPasses();
  }, [chargerPasses]);

  // Une transcription se termine au loin : l'écran suit sans qu'on clique.
  useActualisation(chargerPasses, passes.some((n) => n.statut === "recue"));

  const ecouter = async (n: Passe) => {
    if (!n.audio_path) return;
    const { data, error } = await supabaseAdmin.storage.from("admin-dictee").createSignedUrl(n.audio_path, 3600);
    if (error || !data) {
      toast.error("L’enregistrement n’a pas pu être ouvert.");
      return;
    }
    setEcoute(data.signedUrl);
  };

  const lire = async () => {
    if (lecture || texte.trim().length < 20) return;
    setLecture(true);
    try {
      const r = await lireDebrief(texte.trim());
      setExtraction(r);
      setRetenus(r.entreprises.map(toutRetenir));
      if (r.entreprises.length === 0) toast.message("Merx n’a reconnu aucune entreprise dans ce texte.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Merx n’a pas pu lire ce débrief.");
    } finally {
      setLecture(false);
    }
  };

  const total = retenus.reduce((n, r) => n + compte(r), 0);

  const tout = async () => {
    if (!extraction || envoi || total === 0) return;
    setEnvoi(true);
    try {
      for (const [i, e] of extraction.entreprises.entries()) {
        await enregistrer(e, retenus[i], user?.email ?? "", null);
      }
      toast.success(`${total} élément${total > 1 ? "s" : ""} enregistré${total > 1 ? "s" : ""}.`);
      setExtraction(null);
      setRetenus([]);
      setTexte("");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "L’enregistrement a échoué.");
    } finally {
      setEnvoi(false);
    }
  };

  return (
    <div>
      <PageHeader
        title="Débrief"
        subtitle="Racontez votre sortie. Merx range, vous validez."
      />

      {!extraction && mode === null && passes.length > 0 && (
        <Card className="mb-4 p-4">
          <SectionLabel>Ce que vous avez déjà raconté</SectionLabel>
          <div className="mt-2 divide-y divide-border">
            {passes.map((n) => (
              <div key={n.id} className="flex flex-wrap items-center gap-3 py-2.5">
                <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">
                  {n.audio_path ? <Mic className="size-3.5" /> : <PenLine className="size-3.5" />}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13px] font-semibold text-avisdoc-ink">
                    {n.titre ?? (n.audio_path ? "Débrief dicté" : "Débrief écrit")}
                  </span>
                  <span className="block text-[11.5px] text-muted-foreground">
                    {quandCourt(n.created_at)}
                    {n.duree_s != null && ` · ${chrono(n.duree_s)}`}
                    {n.statut === "recue" && " · en attente de transcription"}
                    {n.statut === "echec" && ` · ${n.message ?? "échec"}`}
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
              </div>
            ))}
          </div>
        </Card>
      )}

      {!extraction && mode === null && (
        <div className="grid gap-3 sm:grid-cols-2">
          <Link
            to="/dictee"
            className="group rounded-2xl border border-border bg-card p-6 transition-colors hover:border-avisdoc-teal"
          >
            <span className="flex size-11 items-center justify-center rounded-full bg-avisdoc-teal/10 text-avisdoc-teal">
              <Mic className="size-5" />
            </span>
            <h2 className="mt-3 font-display text-lg font-semibold text-avisdoc-ink">À la voix</h2>
            <p className="mt-1 text-[13px] leading-relaxed text-muted-foreground">
              En sortant d’un rendez-vous, ou le soir pour toute la journée. Jusqu’à dix minutes, même sans réseau —
              la note part dès que vous en retrouvez un.
            </p>
          </Link>

          <button
            type="button"
            onClick={() => setMode("texte")}
            className="group rounded-2xl border border-border bg-card p-6 text-left transition-colors hover:border-avisdoc-teal"
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

      {!extraction && mode === "texte" && (
        <Card className="p-4">
          <SectionLabel>Ce qui s’est passé</SectionLabel>
          <p className="mt-1 text-[12.5px] text-muted-foreground">
            Écrivez comme vous parleriez : plusieurs entreprises, dans le désordre, peu importe. Merx s’occupe du tri.
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
              onClick={() => void lire()}
              disabled={lecture || texte.trim().length < 20}
              className="ad-btn-accent inline-flex items-center gap-1.5 rounded-full bg-avisdoc-teal px-5 py-2.5 text-sm font-bold text-white disabled:opacity-50"
            >
              {lecture ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />}
              {lecture ? "Merx lit… une trentaine de secondes" : "Merx trie ça"}
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
            <button
              type="button"
              onClick={() => setMode(null)}
              className="text-[13px] font-semibold text-muted-foreground underline-offset-2 hover:text-avisdoc-ink hover:underline"
            >
              Retour
            </button>
          </div>
        </Card>
      )}

      {extraction && (
        <>
          <div className="mb-4 flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => void tout()}
              disabled={envoi || total === 0}
              className="ad-btn-accent inline-flex items-center gap-1.5 rounded-full bg-avisdoc-teal px-5 py-2.5 text-sm font-bold text-white disabled:opacity-50"
            >
              {envoi ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />}
              Enregistrer {total > 0 ? `(${total})` : ""}
            </button>
            <button
              type="button"
              onClick={() => {
                setExtraction(null);
                setRetenus([]);
              }}
              className="rounded-full border border-border px-5 py-2.5 text-sm font-bold text-muted-foreground transition-colors hover:border-avisdoc-ink hover:text-avisdoc-ink"
            >
              Reprendre le texte
            </button>
            <span className="text-[12.5px] text-muted-foreground">
              Décochez ce qui ne va pas : rien n’est écrit avant que vous enregistriez.
            </span>
          </div>

          {extraction.entreprises.map((e, i) => (
            <FicheVue
              key={`${e.entreprise}-${i}`}
              vue={e}
              retenu={retenus[i]}
              onChange={(r) => setRetenus((prev) => prev.map((x, j) => (j === i ? r : x)))}
            />
          ))}

          {extraction.non_rattachees.length > 0 && (
            <Card className="p-4">
              <div className="flex items-center gap-1.5">
                <HandHelping className="size-3.5 text-muted-foreground" />
                <SectionLabel>Ce que Merx n’a pas su ranger</SectionLabel>
              </div>
              <ul className="mt-2 space-y-1">
                {extraction.non_rattachees.map((n) => (
                  <li key={n} className="flex gap-2 text-[13px] leading-snug text-muted-foreground">
                    <span className="mt-[7px] size-1.5 shrink-0 rounded-full bg-muted-foreground/40" />
                    <span>{n}</span>
                  </li>
                ))}
              </ul>
            </Card>
          )}

          {extraction.entreprises.length === 0 && extraction.non_rattachees.length === 0 && (
            <div className="rounded-2xl bg-muted/60 p-8 text-center">
              <Target className="mx-auto mb-2 size-5 text-muted-foreground" />
              <SectionLabel>Rien à ranger</SectionLabel>
              <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-muted-foreground">
                Merx n’a reconnu aucune entreprise. Citez-les par leur nom, même approximatif, et il fera le lien.
              </p>
            </div>
          )}
        </>
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
