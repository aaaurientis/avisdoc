// Admin — clés d'accès du connecteur MCP du Hub (Cowork…). Une clé ne s'affiche qu'une fois,
// à sa création ; le Hub n'en garde que l'empreinte. Révocation immédiate.

import { useCallback, useEffect, useState } from "react";
import { Check, Copy, KeyRound, Loader2, Plus } from "lucide-react";
import { toast } from "sonner";
import { Badge, Card, PageHeader } from "../components/ui";
import { confirmer } from "../components/Confirmation";
import { supabaseAdmin as sb, SUPABASE_URL_HUB } from "../data/supabaseAdmin";
import { messageErreurFonction } from "../lib/erreurFonction";
import { lectureSeuleActive } from "../lib/lectureSeule";
import { cn } from "@/lib/utils";

interface Cle { id: string; nom: string; debut: string; cree_par: string; cree_le: string; derniere_utilisation: string | null; revoquee_le: string | null; revoquee_par: string | null }

const date = (iso: string | null) => (iso ? new Date(iso).toLocaleString("fr-FR", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "—");
const URL_MCP = `${SUPABASE_URL_HUB?.replace(/\/+$/, "")}/functions/v1/reseau-mcp`;

async function appeler(body: Record<string, unknown>) {
  const { data, error } = await sb.functions.invoke("mcp-cles", { body });
  if (error) throw new Error(await messageErreurFonction(error));
  return data;
}

function Copier({ texte, libelle }: { texte: string; libelle: string }) {
  const [fait, setFait] = useState(false);
  return (
    <button type="button" onClick={() => { void navigator.clipboard.writeText(texte).then(() => { setFait(true); setTimeout(() => setFait(false), 1500); }); }}
      className="inline-flex items-center gap-1 rounded-full border border-border px-2.5 py-1 text-[12px] font-semibold text-avisdoc-ink hover:bg-muted" title={`Copier ${libelle}`}>
      {fait ? <Check className="size-3.5 text-emerald-600" /> : <Copy className="size-3.5" />} {fait ? "Copié" : "Copier"}
    </button>
  );
}

export default function ClesMcp() {
  const [cles, setCles] = useState<Cle[] | null>(null);
  const [nom, setNom] = useState("");
  const [occupe, setOccupe] = useState<string | null>(null);
  const [nouvelle, setNouvelle] = useState<{ nom: string; cle: string } | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const lectureSeule = lectureSeuleActive();

  const charger = useCallback(async () => {
    const { data, error } = await sb.from("admin_mcp_cles").select("*").order("cree_le", { ascending: false });
    if (error) { setErreur(error.message); return; }
    setCles((data ?? []) as Cle[]);
  }, []);
  useEffect(() => { void charger(); }, [charger]);

  const creer = async () => {
    setOccupe("creer"); setErreur(null);
    try {
      const r = await appeler({ action: "creer", nom: nom.trim() });
      setNouvelle({ nom: nom.trim(), cle: r.cle });
      setNom("");
      await charger();
    } catch (e) { setErreur(e instanceof Error ? e.message : String(e)); } finally { setOccupe(null); }
  };
  const revoquer = async (c: Cle) => {
    if (!(await confirmer({ titre: `Révoquer la clé « ${c.nom} » ?`, message: "Le connecteur qui l'utilise perd l'accès immédiatement. C'est définitif.", action: "Révoquer", definitif: true }))) return;
    setOccupe(c.id); setErreur(null);
    try { await appeler({ action: "revoquer", id: c.id }); toast.success("Clé révoquée."); await charger(); }
    catch (e) { setErreur(e instanceof Error ? e.message : String(e)); } finally { setOccupe(null); }
  };

  const configCowork = (cle: string) => JSON.stringify({
    mcpServers: { "avisdoc-reseau-aval": { command: "npx", args: ["-y", "mcp-remote", URL_MCP, "--header", "Authorization:${AVISDOC_CLE}"], env: { AVISDOC_CLE: `Bearer ${cle}` } } },
  }, null, 2);

  return (
    <div>
      <PageHeader title="Clés d'accès (MCP)" subtitle="Connecteur du Hub pour Cowork : réseau d'aval, collecte Doctolib" />
      {erreur && <div role="alert" className="mb-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-[13px] text-rose-800">{erreur}</div>}

      <Card className="mb-4 p-5 text-[13px]">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-muted-foreground">Adresse du connecteur</span>
          <code className="rounded-lg bg-muted px-2 py-1 text-[12px]">{URL_MCP}</code>
          <Copier texte={URL_MCP} libelle="l'adresse" />
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <input value={nom} onChange={(e) => setNom(e.target.value)} placeholder="Nom de la clé (ex. Cowork Arthur)" maxLength={80}
            className="w-72 rounded-full border border-border bg-card px-4 py-2 text-[13px] outline-none focus:border-avisdoc-teal" />
          <button type="button" onClick={() => void creer()} disabled={lectureSeule || !nom.trim() || occupe === "creer"}
            className="hub-btn-accent inline-flex items-center gap-1.5 rounded-full bg-avisdoc-teal px-4 py-2 text-[13px] font-bold text-white disabled:opacity-50">
            {occupe === "creer" ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />} Créer une clé
          </button>
        </div>
      </Card>

      {nouvelle && (
        <Card className="mb-4 border-amber-300 bg-amber-50/60 p-5 text-[13px]">
          <div className="flex items-center gap-2 font-semibold text-amber-900"><KeyRound className="size-4" /> Clé « {nouvelle.nom} » : copiez-la maintenant, elle ne sera plus affichée.</div>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <code className="break-all rounded-lg bg-white px-2 py-1 text-[12px]">{nouvelle.cle}</code>
            <Copier texte={nouvelle.cle} libelle="la clé" />
          </div>
          <div className="mt-3 text-[12.5px] font-semibold text-avisdoc-ink">Connecteur Claude (Paramètres › Connecteurs › Ajouter un connecteur personnalisé)</div>
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <code className="break-all rounded-lg bg-white px-2 py-1 text-[12px]">{`${URL_MCP}?cle=${nouvelle.cle}`}</code>
            <Copier texte={`${URL_MCP}?cle=${nouvelle.cle}`} libelle="l'adresse du connecteur" />
          </div>
          <p className="mt-1 text-[11.5px] text-amber-900">L'adresse contient la clé : ne la partagez pas. Une clé par connecteur, révocable ici.</p>
          <div className="mt-3 text-[12.5px] font-semibold text-avisdoc-ink">Ou : configuration Claude Desktop (claude_desktop_config.json)</div>
          <pre className="mt-1 overflow-x-auto rounded-lg bg-white p-3 text-[11.5px]">{configCowork(nouvelle.cle)}</pre>
          <div className="mt-1 flex gap-2">
            <Copier texte={configCowork(nouvelle.cle)} libelle="la configuration" />
            <button type="button" onClick={() => setNouvelle(null)} className="rounded-full px-3 py-1 text-[12px] font-semibold text-muted-foreground hover:bg-muted">J'ai copié la clé</button>
          </div>
        </Card>
      )}

      <Card className="overflow-x-auto">
        <div className="grid min-w-[760px] gap-3 border-b border-border/60 px-5 py-3 text-[11px] font-bold uppercase tracking-[0.05em] text-muted-foreground"
          style={{ gridTemplateColumns: "minmax(140px,1fr) 120px minmax(160px,1fr) 150px 110px" }}>
          <div>Nom</div><div>Clé</div><div>Créée</div><div>Dernière utilisation</div><div />
        </div>
        {cles === null && <div className="flex items-center gap-2 px-5 py-6 text-[13px] text-muted-foreground"><Loader2 className="size-4 animate-spin" /> Chargement…</div>}
        {cles?.length === 0 && <div className="px-5 py-6 text-[13px] text-muted-foreground">Aucune clé.</div>}
        {cles?.map((c) => (
          <div key={c.id} className={cn("grid min-w-[760px] items-center gap-3 border-b border-border/60 px-5 py-3 text-[13px] last:border-b-0", c.revoquee_le && "opacity-60")}
            style={{ gridTemplateColumns: "minmax(140px,1fr) 120px minmax(160px,1fr) 150px 110px" }}>
            <div className="font-semibold text-avisdoc-ink">{c.nom}</div>
            <code className="text-[12px] text-muted-foreground">{c.debut}…</code>
            <div className="text-muted-foreground">{date(c.cree_le)} · {c.cree_par}</div>
            <div className="text-muted-foreground">{date(c.derniere_utilisation)}</div>
            <div className="text-right">
              {c.revoquee_le
                ? <span title={`Révoquée le ${date(c.revoquee_le)} par ${c.revoquee_par ?? "?"}`}><Badge className="bg-rose-50 text-rose-800">Révoquée</Badge></span>
                : <button type="button" onClick={() => void revoquer(c)} disabled={lectureSeule || occupe === c.id}
                    className="rounded-full border border-rose-200 px-3 py-1 text-[12px] font-semibold text-rose-700 hover:bg-rose-50 disabled:opacity-50">Révoquer</button>}
            </div>
          </div>
        ))}
      </Card>
    </div>
  );
}
