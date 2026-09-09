import { useEffect, useMemo, useState } from "react";
import { RefreshCw, Search, ShieldAlert } from "lucide-react";
import { toast } from "sonner";
import type { AuditCategory, AuditEntry } from "../types";
import { fetchAuditLog } from "../lib/audit";
import { useAuth } from "../auth/AuthContext";
import { Card, PageHeader } from "../components/ui";
import { cn } from "@/lib/utils";

const COLS = "170px 220px 130px minmax(150px,1.4fr) minmax(120px,1fr) 90px";

const CAT_TABS: { key: "Tous" | AuditCategory; label: string }[] = [
  { key: "Tous", label: "Tout" },
  { key: "auth", label: "Connexions" },
  { key: "data", label: "Données" },
  { key: "error", label: "Erreurs" },
];

const CAT_BADGE: Record<AuditCategory, string> = {
  auth: "bg-avisdoc-teal/12 text-avisdoc-teal",
  data: "bg-sky-100 text-sky-700",
  error: "bg-rose-100 text-rose-700",
};
const CAT_LABEL: Record<AuditCategory, string> = {
  auth: "Connexion",
  data: "Données",
  error: "Erreur",
};

const ACTION_LABEL: Record<string, string> = {
  login: "Connexion",
  logout: "Déconnexion",
  login_refused: "Connexion refusée",
  insert: "Création",
  update: "Modification",
  delete: "Suppression",
  persist_error: "Échec d'enregistrement",
  load_error: "Échec de chargement",
};

const ENTITY_LABEL: Record<string, string> = {
  admin_network_contacts: "Contact réseau",
  admin_clients: "Client / projet",
  admin_client_contacts: "Contact projet",
  admin_client_docs: "Doc. projet",
  admin_suivis: "Suivi",
  admin_documents: "Document",
  admin_doc_types: "Type de document",
};

function fmtDateTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString("fr-FR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function Audit() {
  const { isSuperAdmin } = useAuth();
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [cat, setCat] = useState<"Tous" | AuditCategory>("Tous");
  const [q, setQ] = useState("");

  const load = useMemo(
    () => async () => {
      setLoading(true);
      try {
        setEntries(await fetchAuditLog(300));
      } catch (e) {
        console.error(e);
        toast.error("Impossible de charger le journal d'audit.");
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  useEffect(() => {
    if (isSuperAdmin) void load();
  }, [isSuperAdmin, load]);

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return entries.filter((e) => {
      if (cat !== "Tous" && e.category !== cat) return false;
      if (!needle) return true;
      return (
        e.actorEmail.toLowerCase().includes(needle) ||
        e.action.toLowerCase().includes(needle) ||
        (e.entity ?? "").toLowerCase().includes(needle) ||
        (e.entityId ?? "").toLowerCase().includes(needle)
      );
    });
  }, [entries, cat, q]);

  // Garde d'accès (la RLS reste la garde ultime côté base).
  if (!isSuperAdmin) {
    return (
      <div>
        <PageHeader title="Auditabilité" />
        <Card className="flex flex-col items-center gap-3 px-6 py-16 text-center">
          <ShieldAlert className="size-8 text-avisdoc-coral" />
          <p className="max-w-md text-sm text-muted-foreground">
            Cet espace est réservé aux profils super-administrateur. Votre compte
            n'y a pas accès.
          </p>
        </Card>
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title="Auditabilité"
        subtitle="Journal des accès, actions et erreurs · accès restreint · conservation 12 mois"
        action={
          <button
            type="button"
            onClick={() => void load()}
            disabled={loading}
            className="ad-btn-outline inline-flex items-center gap-1.5 rounded-full border-[1.5px] border-border px-4 py-2 text-[13px] font-bold text-avisdoc-ink transition-colors disabled:opacity-60"
          >
            <RefreshCw className={cn("size-4", loading && "animate-spin")} /> Rafraîchir
          </button>
        }
      />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        {CAT_TABS.map((t) => {
          const on = cat === t.key;
          return (
            <button
              key={t.key}
              type="button"
              onClick={() => setCat(t.key)}
              className={cn(
                "rounded-full border px-4 py-2 text-[13px] font-semibold transition-colors",
                on
                  ? "border-avisdoc-ink bg-avisdoc-ink text-white"
                  : "border-border bg-card text-muted-foreground hover:text-avisdoc-ink",
              )}
            >
              {t.label}
            </button>
          );
        })}
        <div className="relative ml-auto">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Rechercher (email, action, cible…)"
            className="ad-input w-72 max-w-full rounded-full border border-border bg-card py-2 pl-9 pr-3 text-[13px] outline-none transition-colors focus:border-avisdoc-teal"
          />
        </div>
      </div>

      <Card className="overflow-x-auto">
        <div style={{ minWidth: 880 }}>
          <div
            className="grid gap-2.5 border-b border-border/60 px-5 py-3 text-[11px] font-bold uppercase tracking-[0.05em] text-muted-foreground"
            style={{ gridTemplateColumns: COLS }}
          >
            <div>Date / heure</div>
            <div>Utilisateur</div>
            <div>Catégorie</div>
            <div>Action</div>
            <div>Cible</div>
            <div className="text-right">Statut</div>
          </div>

          {rows.map((e) => (
            <div
              key={e.id}
              className="grid items-center gap-2.5 border-b border-border/60 px-5 py-3 text-[12.5px] last:border-b-0"
              style={{ gridTemplateColumns: COLS }}
            >
              <div className="whitespace-nowrap text-muted-foreground">{fmtDateTime(e.at)}</div>
              <div className="min-w-0 truncate font-semibold text-avisdoc-ink" title={e.actorEmail}>
                {e.actorEmail || "—"}
              </div>
              <div>
                <span
                  className={cn(
                    "inline-flex rounded-full px-2.5 py-1 text-[11px] font-bold",
                    CAT_BADGE[e.category],
                  )}
                >
                  {CAT_LABEL[e.category]}
                </span>
              </div>
              <div className="min-w-0 truncate text-avisdoc-ink" title={e.action}>
                {ACTION_LABEL[e.action] ?? e.action}
                {e.detail?.reason ? (
                  <span className="text-muted-foreground"> — {String(e.detail.reason)}</span>
                ) : null}
                {e.detail?.message ? (
                  <span className="text-muted-foreground"> — {String(e.detail.message)}</span>
                ) : null}
              </div>
              <div className="min-w-0 truncate text-muted-foreground">
                {e.entity ? (
                  <>
                    {ENTITY_LABEL[e.entity] ?? e.entity}
                    {e.entityId ? (
                      <span className="text-muted-foreground/70"> · {e.entityId.slice(0, 8)}</span>
                    ) : null}
                  </>
                ) : (
                  "—"
                )}
              </div>
              <div className="text-right">
                {e.success === true ? (
                  <span className="inline-flex rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-bold text-emerald-700">
                    OK
                  </span>
                ) : e.success === false ? (
                  <span className="inline-flex rounded-full bg-rose-100 px-2 py-0.5 text-[11px] font-bold text-rose-700">
                    Échec
                  </span>
                ) : (
                  <span className="text-muted-foreground/60">—</span>
                )}
              </div>
            </div>
          ))}

          {!loading && rows.length === 0 && (
            <div className="px-5 py-12 text-center text-sm text-muted-foreground">
              Aucun événement pour ce filtre.
            </div>
          )}
          {loading && (
            <div className="px-5 py-12 text-center text-sm text-muted-foreground">
              Chargement du journal…
            </div>
          )}
        </div>
      </Card>

      <p className="mt-4 max-w-3xl text-[12px] leading-relaxed text-muted-foreground">
        <span className="font-semibold text-avisdoc-ink">RGPD</span> — Ce journal
        est tenu à des fins de sécurité et de traçabilité des accès et actions
        d'administration. Il est en accès restreint (super-administrateur), ne
        contient pas de données médicales, et les entrées sont automatiquement
        supprimées au-delà de 12 mois.
      </p>
    </div>
  );
}
