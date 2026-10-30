// Veille › Vigile : on lui pose des questions sur ce qu'il surveille et sur ce que
// ses rapports ont trouvé. « Sortez-moi les articles sur le soleil et le cancer de la
// peau parus ces 30 derniers jours » : il cherche dans sa base et répond, chaque
// article avec son lien.
//
// Chacun retrouve ses conversations, et elles seules, dans la colonne de droite ;
// « Nouvelle conversation » ramène à l'accueil et à ses questions toutes prêtes.

import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Loader2, MessageSquare, Plus, Send } from "lucide-react";
import { useAuth } from "../auth/AuthContext";
import { Card, PageHeader, SectionLabel } from "../components/ui";
import { supabaseAdmin } from "../data/supabaseAdmin";
import { cn } from "@/lib/utils";

interface Message {
  role: "user" | "assistant";
  content: string;
}

interface Conversation {
  id: string;
  titre: string;
  messages: Message[];
  updated_at: string;
}

const quand = (iso: string) => new Date(iso).toLocaleDateString("fr-FR", { day: "numeric", month: "short", timeZone: "Europe/Paris" });

/** Le texte de Vigile, avec ses liens [titre](url) cliquables et son gras **…**. Rien d'autre n'est interprété. */
function Texte({ texte }: { texte: string }) {
  const morceaux = texte.split(/(\[[^\]]+\]\(https?:\/\/[^\s)]+\)|\*\*[^*]+\*\*)/g);
  return (
    <>
      {morceaux.map((m, i) => {
        const lien = m.match(/^\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)$/);
        if (lien) {
          return (
            <a key={i} href={lien[2]} target="_blank" rel="noreferrer" className="font-semibold text-avisdoc-teal underline-offset-2 hover:underline">
              {lien[1]}
            </a>
          );
        }
        const gras = m.match(/^\*\*([^*]+)\*\*$/);
        if (gras) return <strong key={i}>{gras[1]}</strong>;
        return <span key={i}>{m}</span>;
      })}
    </>
  );
}

// Des questions toutes prêtes, par métier : un clic les pose à Vigile.
const EXEMPLES: { qui: string; questions: string[] }[] = [
  { qui: "Pour les commerciaux", questions: [
    "Quelles entreprises ont parlé de la santé de leurs salariés ces 15 derniers jours ?",
    "Quels appels d'offres de médecine préventive ou de dépistage sont ouverts en ce moment ?",
    "Quelles collectivités parlent de désert médical ou de manque de dermatologues ?",
  ] },
  { qui: "Pour la communication", questions: [
    "Quels salons ou événements arrivent dans les prochains mois, et lesquels valent le coup pour AvisDoc ?",
    "Propose-moi 3 sujets de posts LinkedIn à partir des articles de ce mois-ci.",
  ] },
  { qui: "Concurrents et science", questions: [
    "Qu'ont fait les concurrents d'AvisDoc ce mois-ci ?",
    "Quelles études récentes sur le dépistage du mélanome peut-on citer à un client ?",
  ] },
  { qui: "Les rapports", questions: [
    "Fais-moi une synthèse en quelques lignes de tous les rapports du mois dernier.",
    "Que faut-il retenir du dernier rapport ?",
    "Qu'est-ce que tu surveilles en ce moment ?",
  ] },
];

export default function Vigile() {
  const { user } = useAuth();
  const [messages, setMessages] = useState<Message[]>([]);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [historique, setHistorique] = useState<Conversation[] | null>(null);
  const [saisie, setSaisie] = useState("");
  const [enCours, setEnCours] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const bas = useRef<HTMLDivElement>(null);

  useEffect(() => {
    supabaseAdmin.from("admin_veille_conversations").select("id, titre, messages, updated_at").order("updated_at", { ascending: false }).limit(50)
      .then(({ data, error }) => {
        if (error) toast.error("Vos conversations n'ont pas pu être lues.");
        setHistorique(error ? [] : (data ?? []) as Conversation[]);
      });
  }, []);

  /** Garde la conversation : créée à la première réponse, mise à jour ensuite ; elle remonte en tête de la liste. */
  const garder = async (id: string | null, suite: Message[]) => {
    const { data, error } = id
      ? await supabaseAdmin.from("admin_veille_conversations").update({ messages: suite }).eq("id", id).select("id, titre, messages, updated_at").single()
      : await supabaseAdmin.from("admin_veille_conversations").insert({ email: user!.email.toLowerCase(), titre: suite[0].content.slice(0, 80), messages: suite }).select("id, titre, messages, updated_at").single();
    if (error || !data) {
      toast.error("La conversation n'a pas pu être gardée.");
      return id;
    }
    setHistorique((h) => [data as Conversation, ...(h ?? []).filter((c) => c.id !== data.id)]);
    return data.id as string;
  };

  const nouvelle = () => {
    if (enCours) return;
    setMessages([]);
    setConversationId(null);
    setErreur(null);
    setSaisie("");
  };

  const ouvrir = (c: Conversation) => {
    if (enCours) return;
    setMessages(c.messages);
    setConversationId(c.id);
    setErreur(null);
  };

  useEffect(() => {
    bas.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, enCours]);

  const envoyer = async (posee?: string) => {
    const question = (posee ?? saisie).trim();
    if (!question || enCours) return;
    const suite: Message[] = [...messages, { role: "user", content: question }];
    setMessages(suite);
    setSaisie("");
    setErreur(null);
    setEnCours(true);
    try {
      const { data, error } = await supabaseAdmin.functions.invoke("veille", { body: { action: "question", messages: suite } });
      if (error) {
        // Le message précis de la fonction (plafond atteint…) est dans le corps de la réponse.
        const detail = await (error as { context?: Response }).context?.json?.().catch(() => null);
        throw new Error(detail?.error ?? error.message);
      }
      if ((data as { error?: string })?.error) throw new Error((data as { error: string }).error);
      const fin: Message[] = [...suite, { role: "assistant", content: (data as { reponse: string }).reponse }];
      setMessages(fin);
      setConversationId(await garder(conversationId, fin));
    } catch (e) {
      setErreur(e instanceof Error ? e.message : "Vigile n'a pas pu répondre.");
    } finally {
      setEnCours(false);
    }
  };

  return (
    <div>
      <PageHeader
        title="Vigile"
        subtitle="Posez vos questions sur ce que Vigile surveille et sur ce que ses rapports ont trouvé."
        action={
          <button type="button" onClick={nouvelle} disabled={enCours} className="ad-btn-accent inline-flex items-center gap-1.5 rounded-full bg-avisdoc-teal px-5 py-2.5 text-sm font-bold text-white disabled:opacity-50">
            <Plus className="size-4" /> Nouvelle conversation
          </button>
        }
      />
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_280px]">
      <Card className="flex min-h-[60vh] flex-col overflow-hidden">
        <div className="flex-1 space-y-3 overflow-y-auto p-4 sm:p-5">
          {!messages.length && (
            <div className="mx-auto max-w-4xl py-4">
              <p className="mb-4 text-center text-[13px] text-muted-foreground">Cliquez sur une question pour la poser, ou écrivez la vôtre en bas.</p>
              <div className="grid gap-4 sm:grid-cols-2">
                {EXEMPLES.map((g) => (
                  <div key={g.qui}>
                    <p className="mb-1.5 text-[12px] font-bold uppercase tracking-wide text-avisdoc-teal">{g.qui}</p>
                    <div className="flex flex-col gap-1.5">
                      {g.questions.map((q) => (
                        <button key={q} type="button" disabled={enCours} onClick={() => envoyer(q)} className="rounded-xl border border-border bg-background px-3.5 py-2.5 text-left text-[13px] text-avisdoc-ink hover:border-avisdoc-teal hover:bg-avisdoc-teal/5 disabled:opacity-50">
                          {q}
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
          {messages.map((m, i) => (
            <div key={i} className={cn("flex", m.role === "user" ? "justify-end" : "justify-start")}>
              <div
                className={cn(
                  "max-w-[85%] whitespace-pre-wrap [overflow-wrap:anywhere] rounded-2xl px-4 py-3 text-[13.5px] leading-relaxed",
                  m.role === "user" ? "bg-avisdoc-teal text-white" : "bg-muted text-avisdoc-ink",
                )}
              >
                {m.role === "assistant" ? <Texte texte={m.content} /> : m.content}
              </div>
            </div>
          ))}
          {enCours && (
            <div className="flex items-center gap-2 text-[13px] text-muted-foreground">
              <Loader2 className="size-4 animate-spin text-avisdoc-teal" /> Vigile cherche dans ses rapports…
            </div>
          )}
          {erreur && <p className="text-[13px] text-red-600">{erreur}</p>}
          <div ref={bas} />
        </div>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            envoyer();
          }}
          className="flex items-end gap-2 border-t border-border p-3"
        >
          <textarea
            value={saisie}
            onChange={(e) => setSaisie(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                envoyer();
              }
            }}
            rows={2}
            placeholder="Votre question à Vigile…"
            className="ad-input min-w-0 flex-1 resize-none rounded-xl border border-border bg-background px-3.5 py-2.5 text-[13.5px] outline-none focus:border-avisdoc-teal"
          />
          <button
            type="submit"
            disabled={!saisie.trim() || enCours}
            aria-label="Envoyer"
            className="ad-btn-accent inline-flex size-11 shrink-0 items-center justify-center rounded-full bg-avisdoc-teal text-white disabled:opacity-50"
          >
            {enCours ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
          </button>
        </form>
      </Card>
      <Card className="flex max-h-[70vh] flex-col p-4">
        <SectionLabel>Vos conversations</SectionLabel>
        <div className="mt-2 flex-1 space-y-1 overflow-y-auto">
          {historique === null && <p className="flex items-center gap-1.5 text-[12.5px] text-muted-foreground"><Loader2 className="size-3.5 animate-spin text-avisdoc-teal" /> Chargement…</p>}
          {historique?.length === 0 && <p className="text-[12.5px] text-muted-foreground">Aucune conversation pour l'instant.</p>}
          {(historique ?? []).map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => ouvrir(c)}
              className={cn("flex w-full items-start gap-2 rounded-xl px-3 py-2 text-left transition-colors", conversationId === c.id ? "bg-avisdoc-ink text-white" : "hover:bg-muted")}
            >
              <MessageSquare className={cn("mt-0.5 size-3.5 shrink-0", conversationId === c.id ? "text-white" : "text-muted-foreground")} />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[12.5px] font-semibold">{c.titre}</span>
                <span className={cn("text-[11px]", conversationId === c.id ? "text-white/70" : "text-muted-foreground")}>{quand(c.updated_at)}</span>
              </span>
            </button>
          ))}
        </div>
      </Card>
      </div>
    </div>
  );
}
