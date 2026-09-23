// Merx — l’agent commercial de prospection.
// La conversation à gauche ; à droite, le panneau de recherche et l’historique.
// Sur un téléphone, ces deux-là passent sous la conversation et se replient : dépliés,
// ils ajoutaient des centaines de pixels sous l’écran et obligeaient à faire défiler la
// page entière avant d’atteindre la conversation, qui a déjà son propre défilement.
// Quand le commercial demande de chercher, Merx lance une recherche puis écrit lui-même son
// résultat dans le fil. Les fiches trouvées partent dans Prospection.

import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronDown, Lightbulb, Loader2, MessageSquare, Play, Plus, Search, Send } from "lucide-react";
import { useAuth } from "../auth/AuthContext";
import { supabaseAdmin } from "../data/supabaseAdmin";
import { Card, PageHeader, SectionLabel } from "../components/ui";
import { cn } from "@/lib/utils";
import BoutonMicro from "../components/BoutonMicro";
import PanneauRecherche from "./merx/PanneauRecherche";

interface Message {
  role: "user" | "assistant";
  content: string;
  at?: string;
}

interface Conversation {
  id: string;
  title: string;
  messages: Message[];
  updated_at?: string;
}

const ACCUEIL =
  "Dites-moi qui vous voulez démarcher : un secteur et une zone suffisent. Vous pouvez aussi partir d’une piste, à droite — elles se modifient avant d’être lancées.";

const quand = (iso?: string) =>
  iso ? new Date(iso).toLocaleDateString("fr-FR", { day: "numeric", month: "short" }) : "";

export default function Merx() {
  const { user } = useAuth();
  const [conversation, setConversation] = useState<Conversation | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [historique, setHistorique] = useState<Conversation[]>([]);
  const [saisie, setSaisie] = useState("");
  const [envoiEnCours, setEnvoiEnCours] = useState(false);
  const [rechercheEnCours, setRechercheEnCours] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const finRef = useRef<HTMLDivElement>(null);

  /** Les conversations de la personne. */
  const chargerLeContexte = useCallback(async () => {
    const { data: convs } = await supabaseAdmin
      .from("admin_merx_conversations")
      .select("id, title, messages, updated_at")
      .order("updated_at", { ascending: false })
      .limit(30);
    const liste = (convs ?? []) as Conversation[];
    setHistorique(liste);

    // On reprend la dernière conversation là où elle en était. Quitter l'écran pour
    // aller voir ses fiches et revenir sur une page blanche, c'est perdre le fil de
    // ce qu'on était en train de préparer. Seul « Nouvelle conversation » repart de zéro.
    setConversation((ouverte) => {
      if (ouverte) return ouverte;
      const derniere = liste[0];
      if (derniere) setMessages((derniere.messages ?? []) as Message[]);
      return derniere ?? null;
    });
  }, []);

  useEffect(() => {
    if (!user?.email) return;
    void chargerLeContexte();
  }, [user?.email, chargerLeContexte]);

  useEffect(() => {
    finRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, rechercheEnCours]);

  const recharger = useCallback(async (id: string) => {
    const { data } = await supabaseAdmin.from("admin_merx_conversations").select("id, title, messages").eq("id", id).maybeSingle();
    if (data) setMessages((data.messages ?? []) as Message[]);
  }, []);

  const appeler = useCallback(async (body: Record<string, unknown>) => {
    const { data, error } = await supabaseAdmin.functions.invoke("merx", { body });
    if (error) throw new Error(error.message);
    if ((data as { error?: string })?.error) throw new Error((data as { error: string }).error);
    return data as { conversationId?: string; reply?: string; demandeId?: string | null };
  }, []);

  const envoyer = useCallback(
    async (texte?: string) => {
      const message = (texte ?? saisie).trim();
      if (!message || envoiEnCours) return;
      setErreur(null);
      setSaisie("");
      setMessages((m) => [...m, { role: "user", content: message }]);
      setEnvoiEnCours(true);
      try {
        const res = await appeler({ action: "chat", conversationId: conversation?.id, message });
        const id = res.conversationId ?? conversation?.id ?? null;
        if (id && id !== conversation?.id) setConversation({ id, title: message.slice(0, 80), messages: [] });
        if (res.reply) setMessages((m) => [...m, { role: "assistant", content: res.reply! }]);

        // Une recherche a été lancée : compter une à deux minutes.
        if (res.demandeId && id) {
          setRechercheEnCours(true);
          try {
            await appeler({ action: "traiter", demandeId: res.demandeId });
          } finally {
            setRechercheEnCours(false);
            await recharger(id);
          }
        }
      } catch (e) {
        setErreur(e instanceof Error ? e.message : "Merx n’a pas répondu.");
      } finally {
        setEnvoiEnCours(false);
        // Les conversations remontent : la dernière en tête.
        void chargerLeContexte();
      }
    },
    [appeler, conversation?.id, chargerLeContexte, envoiEnCours, recharger, saisie],
  );

  const nouvelleConversation = () => {
    setConversation(null);
    setMessages([]);
    setErreur(null);
  };

  const ouvrir = (c: Conversation) => {
    setConversation(c);
    setMessages((c.messages ?? []) as Message[]);
    setErreur(null);
  };

  const occupe = envoiEnCours || rechercheEnCours;

  // Replié par défaut sur un téléphone : on ouvre Merx pour lui parler, pas pour
  // remplir un formulaire. Sur grand écran, ce réglage ne sert à rien — le panneau
  // est toujours visible, à droite.
  const [panneauOuvert, setPanneauOuvert] = useState(false);

  return (
    <div>
      <PageHeader
        title="Merx"
        subtitle="Votre agent de prospection : il cherche les entreprises à démarcher, les note et les documente"
        action={
          <button
            type="button"
            onClick={nouvelleConversation}
            className="ad-btn-accent inline-flex items-center gap-1.5 rounded-full bg-avisdoc-teal px-5 py-2.5 text-sm font-bold text-white"
          >
            <Plus className="size-4" /> Nouvelle conversation
          </button>
        }
      />

      {/* La conversation occupait toute la largeur pour trois bulles. Elle se resserre,
          et le panneau de recherche prend la place des pistes. */}
      <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_380px] xl:grid-cols-[minmax(0,1fr)_420px]">
        {/* ── La conversation ── */}
        <Card className="flex h-[calc(100dvh-20rem)] min-h-[300px] min-w-0 flex-col sm:h-[calc(100vh-13rem)] sm:min-h-[420px]">
          {/* overflow-x-hidden : « overflow-y: auto » rend aussi l'axe horizontal
              défilable. Il suffisait qu'une réponse de Merx contienne un mot que rien
              ne casse — une adresse, une référence — pour que la page passe de 375 à
              859 pixels de large et qu'on doive faire défiler de côté pour lire. */}
          <div className="min-w-0 flex-1 space-y-4 overflow-y-auto overflow-x-hidden p-4 sm:p-6">
            {messages.length === 0 && (
              <div className="mx-auto max-w-lg rounded-2xl bg-muted/60 p-4 text-center sm:p-6">
                <SectionLabel>Par où commencer</SectionLabel>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{ACCUEIL}</p>
              </div>
            )}

            {messages.map((m, i) => (
              <div key={i} className={m.role === "user" ? "flex justify-end" : "flex justify-start"}>
                <div
                  className={
                    m.role === "user"
                      ? "max-w-[78%] whitespace-pre-wrap [overflow-wrap:anywhere] rounded-2xl bg-avisdoc-teal px-4 py-3 text-[13.5px] leading-relaxed text-white"
                      : "max-w-[78%] whitespace-pre-wrap [overflow-wrap:anywhere] rounded-2xl bg-muted px-4 py-3 text-[13.5px] leading-relaxed text-avisdoc-ink"
                  }
                >
                  {m.content}
                </div>
              </div>
            ))}

            {rechercheEnCours && <RechercheEnCours />}

            {erreur && <div className="rounded-2xl bg-rose-50 px-4 py-3 text-[13px] font-semibold text-rose-700">{erreur}</div>}

            <div ref={finRef} />
          </div>

          <div className="border-t border-border p-3 sm:p-4">
            <div className="flex items-end gap-2">
              <textarea
                value={saisie}
                onChange={(e) => setSaisie(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    void envoyer();
                  }
                }}
                rows={2}
                placeholder="Des entreprises de travaux publics en Gironde…"
                disabled={occupe}
                className="min-h-[52px] min-w-0 flex-1 resize-none rounded-2xl border border-border bg-background px-3 py-3 text-sm text-foreground outline-none placeholder:text-muted-foreground focus:border-avisdoc-teal disabled:opacity-60 sm:px-4"
              />
              {/* Au volant, on ne tape pas : on appuie, on parle, on relit. */}
              <BoutonMicro onTexte={(t) => setSaisie((avant) => (avant.trim() ? `${avant.trim()} ${t}` : t))} />
              <button
                type="button"
                onClick={() => void envoyer()}
                disabled={!saisie.trim() || occupe}
                className="ad-btn-accent inline-flex h-[52px] shrink-0 items-center gap-1.5 rounded-full bg-avisdoc-teal px-4 text-sm font-bold text-white disabled:opacity-50 sm:px-5"
              >
                {occupe ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
                {/* À trois éléments sur une ligne de 375 pixels, le libellé faisait
                    déborder le bouton : l'icône suffit à le reconnaître. */}
                <span className="max-sm:hidden">Envoyer</span>
              </button>
            </div>
            <p className="mt-2 text-[11.5px] text-muted-foreground">
              Merx ne connaît aucune entreprise de mémoire : tout ce qu’il affirme vient d’une page qu’il a consultée.
            </p>
          </div>
        </Card>

        {/* ── Pistes et historique ── */}
        {/* « hidden » retire l'élément de la grille : à partir de sm, la mise en page
            à deux colonnes retrouve exactement ses deux enfants. */}
        <button
          type="button"
          onClick={() => setPanneauOuvert((o) => !o)}
          aria-expanded={panneauOuvert}
          className="flex w-full min-w-0 items-center gap-2 rounded-2xl border border-border bg-card px-4 py-3 text-[13px] font-bold text-avisdoc-ink sm:hidden"
        >
          <Lightbulb className="size-4 shrink-0 text-avisdoc-teal" />
          <span className="min-w-0 flex-1 truncate text-left">
            Recherche et conversations
          </span>
          <ChevronDown className={cn("size-4 shrink-0 text-muted-foreground transition-transform", panneauOuvert && "rotate-180")} />
        </button>

        <div
          className={cn(
            // Le bouton « Chercher » débordait sur les conversations : le panneau est
            // plus haut que la place disponible. La colonne défile donc d'un bloc, et
            // chaque carte garde sa hauteur naturelle.
            "flex flex-col gap-3 max-sm:min-h-0 sm:h-[calc(100vh-13rem)] sm:min-h-[420px] sm:overflow-y-auto sm:pr-1",
            !panneauOuvert && "max-sm:hidden",
          )}
        >
          <Card className="shrink-0 p-4">
            <PanneauRecherche occupe={occupe} onChercher={(demande) => void envoyer(demande)} />
          </Card>

          <Card className="flex min-h-[140px] shrink-0 flex-col p-4">
            <SectionLabel>Vos conversations</SectionLabel>
            <div className="mt-2 flex-1 space-y-1 overflow-y-auto">
              {historique.length === 0 && (
                <p className="text-[12.5px] text-muted-foreground">Aucune conversation pour l’instant.</p>
              )}
              {historique.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => ouvrir(c)}
                  className={cn(
                    "flex w-full items-start gap-2 rounded-xl px-3 py-2 text-left transition-colors",
                    conversation?.id === c.id ? "bg-avisdoc-ink text-white" : "hover:bg-muted",
                  )}
                >
                  <MessageSquare className={cn("mt-0.5 size-3.5 shrink-0", conversation?.id === c.id ? "text-white" : "text-muted-foreground")} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[12.5px] font-semibold">{c.title}</span>
                    <span className={cn("text-[11px]", conversation?.id === c.id ? "text-white/70" : "text-muted-foreground")}>
                      {quand(c.updated_at)}
                    </span>
                  </span>
                </button>
              ))}
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}

/**
 * L'attente d'une recherche, montrée seconde par seconde.
 *
 * « cela prend une trentaine de secondes » était faux — on a mesuré 89, 110 et
 * 141 secondes sur des demandes réelles — et un bandeau qui ne bouge pas pendant
 * deux minutes donne l'impression que rien ne se passe, surtout devant un client.
 *
 * Les étapes annoncées suivent le travail réel de l'agent : il lance sa recherche,
 * parcourt les pages trouvées, puis vérifie chaque entreprise avant de la retenir.
 */
function RechercheEnCours() {
  const [secondes, setSecondes] = useState(0);

  useEffect(() => {
    const t = window.setInterval(() => setSecondes((n) => n + 1), 1000);
    return () => window.clearInterval(t);
  }, []);

  const etape =
    secondes < 15
      ? "Merx lance la recherche"
      : secondes < 50
        ? "il parcourt annuaires et sites professionnels"
        : secondes < 95
          ? "il vérifie chaque entreprise trouvée"
          : "il termine — encore quelques instants";

  // Le budget d'une recherche est de 140 secondes : la barre dit où l'on en est.
  const avance = Math.min(100, Math.round((secondes / 140) * 100));

  return (
    <div className="flex justify-start">
      <div className="min-w-0 max-w-[92%] rounded-2xl bg-avisdoc-teal/10 px-4 py-3">
        <div className="flex items-center gap-2 text-[13.5px] font-semibold text-avisdoc-ink">
          <Search className="size-4 shrink-0 animate-pulse text-avisdoc-teal" />
          <span className="min-w-0">{etape}</span>
          <span className="ml-auto shrink-0 font-mono text-[12.5px] text-muted-foreground">{secondes} s</span>
        </div>
        <div className="mt-2 h-1 w-full overflow-hidden rounded-full bg-avisdoc-teal/20">
          <div className="h-full rounded-full bg-avisdoc-teal transition-[width] duration-1000 ease-linear" style={{ width: `${avance}%` }} />
        </div>
        <p className="mt-1.5 text-[11.5px] text-muted-foreground">
          Une recherche demande une à deux minutes. Les fiches arriveront dans Prospection.
        </p>
      </div>
    </div>
  );
}

