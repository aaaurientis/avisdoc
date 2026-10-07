import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Plus, UserPlus } from "lucide-react";
import { toast } from "sonner";
import type { ReqInscription } from "../req/types";
import { ETAT_BADGE, ETAT_LABEL, ETATS_A_TRAITER } from "../req/types";
import { reqRepo } from "../req/reqRepo";
import { frDate } from "../lib/format";
import { Badge, Card, Modal, PageHeader } from "../components/ui";
import { cn } from "@/lib/utils";

const COLS = "minmax(160px,2fr) 130px 150px 150px";

type Vue = "toutes" | "a_traiter" | "echeances" | "suspendues";
const VUES: { key: Vue; label: string }[] = [
  { key: "a_traiter", label: "À traiter" },
  { key: "echeances", label: "Échéances < 30 j" },
  { key: "suspendues", label: "Suspendues" },
  { key: "toutes", label: "Toutes" },
];

function joursAvant(iso: string | null | undefined): number | null {
  if (!iso) return null;
  return Math.round((new Date(iso).getTime() - Date.now()) / 86_400_000);
}

export default function Infirmieres() {
  const [items, setItems] = useState<ReqInscription[]>([]);
  const [loading, setLoading] = useState(true);
  const [vue, setVue] = useState<Vue>("a_traiter");
  const [showInvite, setShowInvite] = useState(false);
  const [form, setForm] = useState({ nom: "", prenom: "", email: "" });
  const [busy, setBusy] = useState(false);

  const charger = async () => {
    setLoading(true);
    try {
      setItems(await reqRepo.list());
    } catch (e) {
      console.error(e);
      toast.error("Impossible de charger les inscriptions.");
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    void charger();
  }, []);

  const rows = useMemo(() => {
    return items.filter((i) => {
      if (vue === "toutes") return true;
      if (vue === "suspendues") return i.etat === "suspendue";
      if (vue === "a_traiter") return ETATS_A_TRAITER.includes(i.etat);
      // échéances : pièce validée arrivant à expiration (≤ 30 j), passées incluses
      const j = joursAvant(i.prochaineEcheance);
      return j != null && j <= 30;
    });
  }, [items, vue]);

  const inviter = async () => {
    if (!form.nom.trim() || !form.prenom.trim() || !form.email.includes("@")) {
      toast.error("Nom, prénom et e-mail valides requis.");
      return;
    }
    setBusy(true);
    try {
      const r = await reqRepo.inviter(form.nom, form.prenom, form.email);
      setShowInvite(false);
      setForm({ nom: "", prenom: "", email: "" });
      toast.success(
        r.emailEnvoye
          ? "Invitation envoyée."
          : "Inscription créée (e-mail non envoyé — à configurer).",
      );
      void charger();
    } catch (e) {
      console.error(e);
      toast.error("L'invitation a échoué.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <PageHeader
        title="Infirmières requérantes"
        subtitle={`${items.length} inscription${items.length > 1 ? "s" : ""}`}
        action={
          <button
            type="button"
            onClick={() => setShowInvite(true)}
            className="ad-btn-accent inline-flex items-center gap-1.5 rounded-full bg-avisdoc-teal px-5 py-2.5 text-sm font-bold text-white"
          >
            <UserPlus className="size-4" /> Inviter
          </button>
        }
      />

      <div className="mb-4 flex flex-wrap gap-2">
        {VUES.map((v) => {
          const on = vue === v.key;
          return (
            <button
              key={v.key}
              type="button"
              onClick={() => setVue(v.key)}
              className={cn(
                "rounded-full border px-4 py-2 text-[13px] font-semibold transition-colors",
                on
                  ? "border-avisdoc-ink bg-avisdoc-ink text-white"
                  : "border-border bg-card text-muted-foreground hover:text-avisdoc-ink",
              )}
            >
              {v.label}
            </button>
          );
        })}
      </div>

      <Card className="overflow-x-auto">
        <div style={{ minWidth: 620 }}>
          <div
            className="grid gap-2.5 border-b border-border/60 px-5 py-3 text-[11px] font-bold uppercase tracking-[0.05em] text-muted-foreground"
            style={{ gridTemplateColumns: COLS }}
          >
            <div>Infirmière</div>
            <div>RPPS</div>
            <div>État</div>
            <div>Prochaine échéance</div>
          </div>

          {rows.map((i) => {
            const j = joursAvant(i.prochaineEcheance);
            return (
              <div
                key={i.id}
                className="grid items-center gap-2.5 border-b border-border/60 px-5 py-3 last:border-b-0"
                style={{ gridTemplateColumns: COLS }}
              >
                <Link
                  to={`/infirmieres/${i.id}`}
                  className="min-w-0 truncate text-[13.5px] font-semibold text-avisdoc-ink hover:text-avisdoc-teal hover:underline"
                >
                  {i.prenom} {i.nom}
                </Link>
                <div className="text-[12.5px] text-muted-foreground">{i.rpps || "—"}</div>
                <div>
                  <Badge className={ETAT_BADGE[i.etat]}>{ETAT_LABEL[i.etat]}</Badge>
                </div>
                <div
                  className={cn(
                    "text-[12.5px]",
                    j != null && j <= 30 ? "font-semibold text-avisdoc-coral" : "text-muted-foreground",
                  )}
                >
                  {i.prochaineEcheance ? frDate(i.prochaineEcheance) : "—"}
                  {j != null && j <= 30 && j >= 0 && ` · J-${j}`}
                  {j != null && j < 0 && " · échue"}
                </div>
              </div>
            );
          })}

          {!loading && rows.length === 0 && (
            <div className="px-5 py-10 text-center text-sm text-muted-foreground">
              Aucune inscription dans cette vue.
            </div>
          )}
          {loading && (
            <div className="px-5 py-10 text-center text-sm text-muted-foreground">Chargement…</div>
          )}
        </div>
      </Card>

      {showInvite && (
        <Modal onClose={() => setShowInvite(false)} width={440}>
          <h2 className="font-display text-lg font-semibold text-avisdoc-ink">Inviter une infirmière</h2>
          <p className="mt-1 text-[13px] text-muted-foreground">
            Un lien d'inscription à usage unique (7 jours) lui sera envoyé.
          </p>
          <div className="mt-4 flex flex-col gap-2.5">
            <div className="flex gap-2.5">
              <input
                className="ad-input flex-1 rounded-lg border border-border bg-card px-3 py-2 text-[13px] outline-none focus:border-avisdoc-teal"
                placeholder="Prénom"
                value={form.prenom}
                onChange={(e) => setForm((f) => ({ ...f, prenom: e.target.value }))}
              />
              <input
                className="ad-input flex-1 rounded-lg border border-border bg-card px-3 py-2 text-[13px] outline-none focus:border-avisdoc-teal"
                placeholder="Nom"
                value={form.nom}
                onChange={(e) => setForm((f) => ({ ...f, nom: e.target.value }))}
              />
            </div>
            <input
              className="ad-input rounded-lg border border-border bg-card px-3 py-2 text-[13px] outline-none focus:border-avisdoc-teal"
              placeholder="E-mail"
              type="email"
              value={form.email}
              onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
            />
          </div>
          <div className="mt-4 flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setShowInvite(false)}
              className="ad-btn-outline rounded-full border-[1.5px] border-border px-4 py-2 text-[13px] font-bold text-avisdoc-ink"
            >
              Annuler
            </button>
            <button
              type="button"
              onClick={() => void inviter()}
              disabled={busy}
              className="ad-btn-accent inline-flex items-center gap-1.5 rounded-full bg-avisdoc-teal px-5 py-2 text-[13px] font-bold text-white disabled:opacity-60"
            >
              <Plus className="size-4" /> {busy ? "Envoi…" : "Inviter"}
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}
