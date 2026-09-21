// Merx — l’agent commercial de prospection.
// Le commercial discute ; quand il demande de chercher, Merx lance une recherche (Edge Function `merx`),
// puis écrit lui-même le résultat dans la conversation. Les fiches trouvées partent dans Prospects.

import { useCallback, useEffect, useRef, useState } from "react";
import { Loader2, Plus, Search, Send } from "lucide-react";
import { useAuth } from "../auth/AuthContext";
import { supabaseAdmin } from "../data/supabaseAdmin";
import { Card, PageHeader, SectionLabel } from "../components/ui";

interface Message {
  role: "user" | "assistant";
  content: string;
  at?: string;
}

interface Conversation {
  id: string;
  title: string;
  messages: Message[];
}

const ACCUEIL =
  "Dites-moi qui vous voulez démarcher : un secteur et une zone suffisent. Par exemple « des entreprises de travaux publics en Gironde » ou « des exploitations viticoles de plus de 50 salariés ».";

export default function Merx() {
  const { user } = useAuth();
  const [conversation, setConversation] = useState<Conversation | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [saisie, setSaisie] = useState("");
  const [envoiEnCours, setEnvoiEnCours] = useState(false);
  const [rechercheEnCours, setRechercheEnCours] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const finRef = useRef<HTMLDivElement>(null);

  // Dernière conversation de la personne, pour reprendre où elle en était.
  useEffect(() => {
    if (!user?.email) return;
    void (async () => {
      const { data } = await supabaseAdmin
        .from("admin_merx_conversations")
        .select("id, title, messages")
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (data) {
        setConversation(data as Conversation);
        setMessages((data.messages ?? []) as Message[]);
      }
    })();
  }, [user?.email]);

  useEffect(() => {
    finRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, rechercheEnCours]);

  /** Recharge la conversation : c’est la fonction serveur qui y écrit le résultat d’une recherche. */
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

  const envoyer = useCallback(async () => {
    const message = saisie.trim();
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

      // Une recherche a été lancée : elle demande une trentaine de secondes.
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
    }
  }, [appeler, conversation?.id, envoiEnCours, recharger, saisie]);

  const nouvelleConversation = () => {
    setConversation(null);
    setMessages([]);
    setErreur(null);
  };

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

      <Card className="flex h-[calc(100vh-14rem)] min-h-[420px] flex-col">
        <div className="flex-1 space-y-4 overflow-y-auto p-6">
          {messages.length === 0 && (
            <div className="mx-auto max-w-lg rounded-2xl bg-muted/60 p-6 text-center">
              <SectionLabel>Par où commencer</SectionLabel>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{ACCUEIL}</p>
            </div>
          )}

          {messages.map((m, i) => (
            <div key={i} className={m.role === "user" ? "flex justify-end" : "flex justify-start"}>
              <div
                className={
                  m.role === "user"
                    ? "max-w-[78%] whitespace-pre-wrap rounded-2xl bg-avisdoc-teal px-4 py-3 text-[13.5px] leading-relaxed text-white"
                    : "max-w-[78%] whitespace-pre-wrap rounded-2xl bg-muted px-4 py-3 text-[13.5px] leading-relaxed text-avisdoc-ink"
                }
              >
                {m.content}
              </div>
            </div>
          ))}

          {rechercheEnCours && (
            <div className="flex justify-start">
              <div className="inline-flex items-center gap-2 rounded-2xl bg-avisdoc-teal/10 px-4 py-3 text-[13.5px] font-semibold text-avisdoc-ink">
                <Search className="size-4 animate-pulse" />
                Merx cherche… cela prend une trentaine de secondes.
              </div>
            </div>
          )}

          {erreur && (
            <div className="rounded-2xl bg-rose-50 px-4 py-3 text-[13px] font-semibold text-rose-700">{erreur}</div>
          )}

          <div ref={finRef} />
        </div>

        <div className="border-t border-border p-4">
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
              disabled={envoiEnCours || rechercheEnCours}
              className="min-h-[52px] flex-1 resize-none rounded-2xl border border-border bg-background px-4 py-3 text-sm text-foreground outline-none placeholder:text-muted-foreground focus:border-avisdoc-teal disabled:opacity-60"
            />
            <button
              type="button"
              onClick={() => void envoyer()}
              disabled={!saisie.trim() || envoiEnCours || rechercheEnCours}
              className="ad-btn-accent inline-flex h-[52px] items-center gap-1.5 rounded-full bg-avisdoc-teal px-5 text-sm font-bold text-white disabled:opacity-50"
            >
              {envoiEnCours || rechercheEnCours ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
              Envoyer
            </button>
          </div>
          <p className="mt-2 text-[11.5px] text-muted-foreground">
            Merx ne connaît aucune entreprise de mémoire : tout ce qu’il affirme vient d’une page qu’il a consultée.
          </p>
        </div>
      </Card>
    </div>
  );
}
