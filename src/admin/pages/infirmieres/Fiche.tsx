import { useEffect, useState, type ReactNode } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft, ExternalLink } from "lucide-react";
import { toast } from "sonner";
import type { ReqDossier, ReqPiece } from "../../req/types";
import {
  ETAT_BADGE,
  ETAT_LABEL,
  MOTIF_LABEL,
  PIECE_ETAT_LABEL,
  PIECE_TYPE_LABEL,
  type MotifRefus,
} from "../../req/types";
import { reqRepo } from "../../req/reqRepo";
import { frDate } from "../../lib/format";
import { Badge, Card, SectionLabel } from "../../components/ui";
import { cn } from "@/lib/utils";

function Ligne({ k, v }: { k: string; v: ReactNode }) {
  return (
    <div className="flex gap-2 py-1 text-[13px]">
      <span className="w-40 shrink-0 text-muted-foreground">{k}</span>
      <span className="min-w-0 flex-1 text-avisdoc-ink">{v}</span>
    </div>
  );
}

export default function Fiche() {
  const { id } = useParams<{ id: string }>();
  const [dossier, setDossier] = useState<ReqDossier | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) return;
    let active = true;
    setLoading(true);
    reqRepo
      .dossier(id)
      .then((d) => active && setDossier(d))
      .catch((e) => {
        console.error(e);
        toast.error("Dossier introuvable.");
      })
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [id]);

  const consulter = async (p: ReqPiece) => {
    const url = await reqRepo.pieceUrl(p);
    if (url) window.open(url, "_blank", "noopener");
    else toast.info("Pièce indisponible.");
  };

  if (loading) {
    return <div className="py-16 text-center text-sm text-muted-foreground">Chargement…</div>;
  }
  if (!dossier) {
    return (
      <div className="py-16 text-center text-sm text-muted-foreground">
        <Link to="/infirmieres" className="text-avisdoc-teal hover:underline">
          ← Retour aux inscriptions
        </Link>
      </div>
    );
  }

  const { inscription: i, pieces, contrats, historique } = dossier;

  return (
    <div>
      <Link
        to="/infirmieres"
        className="mb-3 inline-flex items-center gap-1.5 text-[13px] font-semibold text-muted-foreground transition-colors hover:text-avisdoc-ink"
      >
        <ArrowLeft className="size-4" /> Inscriptions
      </Link>

      <div className="mb-5 flex flex-wrap items-center gap-3">
        <h1 className="font-display text-2xl font-semibold text-avisdoc-ink">
          {i.prenom} {i.nom}
        </h1>
        <Badge className={ETAT_BADGE[i.etat]}>{ETAT_LABEL[i.etat]}</Badge>
      </div>

      <div className="grid items-start gap-5 lg:grid-cols-2">
        {/* Identité */}
        <Card className="p-5">
          <SectionLabel className="mb-2">Identité</SectionLabel>
          <Ligne k="E-mail" v={i.email} />
          <Ligne k="RPPS" v={i.rpps || "—"} />
          <Ligne
            k="Source d'identité"
            v={i.identiteSource === "psc" ? "Pro Santé Connect" : i.identiteSource === "secours" ? "Voie de secours" : "—"}
          />
          {i.motif && <Ligne k="Motif" v={<span className="text-avisdoc-coral">{i.motif}</span>} />}
        </Card>

        {/* Contrat */}
        <Card className="p-5">
          <SectionLabel className="mb-2">Contrat</SectionLabel>
          {contrats.length === 0 ? (
            <p className="text-[13px] italic text-muted-foreground">
              Signature électronique (Yousign) — à brancher au Lot 4.
            </p>
          ) : (
            contrats.map((c) => (
              <Ligne
                key={c.id}
                k={`Contrat v${c.modeleVersion}`}
                v={`${c.statut} · envoyé le ${frDate(c.envoyeLe)}`}
              />
            ))
          )}
        </Card>

        {/* Pièces */}
        <Card className="p-5 lg:col-span-2">
          <SectionLabel className="mb-2">Pièces</SectionLabel>
          {pieces.length === 0 ? (
            <p className="text-[13px] italic text-muted-foreground">Aucune pièce déposée.</p>
          ) : (
            <div className="flex flex-col">
              {pieces.map((p) => (
                <div
                  key={p.id}
                  className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-border/50 py-2.5 last:border-b-0"
                >
                  <span className="text-[13px] font-semibold text-avisdoc-ink">
                    {PIECE_TYPE_LABEL[p.type]}
                  </span>
                  <span className="rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-bold text-muted-foreground">
                    v{p.version}
                  </span>
                  <Badge
                    className={cn(
                      p.etat === "validee"
                        ? "bg-emerald-100 text-emerald-700"
                        : p.etat === "refusee"
                          ? "bg-rose-100 text-rose-700"
                          : p.etat === "expiree"
                            ? "bg-orange-100 text-orange-700"
                            : "bg-slate-100 text-slate-600",
                    )}
                  >
                    {PIECE_ETAT_LABEL[p.etat]}
                  </Badge>
                  <span className="text-[12px] text-muted-foreground">
                    {p.dateFin ? `échéance ${frDate(p.dateFin)}` : p.dateEmission ? `émise le ${frDate(p.dateEmission)}` : ""}
                  </span>
                  {p.motif && (
                    <span className="text-[12px] text-avisdoc-coral">
                      {MOTIF_LABEL[p.motif as MotifRefus] ?? p.motif}
                    </span>
                  )}
                  <button
                    type="button"
                    onClick={() => void consulter(p)}
                    className="ml-auto inline-flex items-center gap-1 rounded-full bg-muted px-2.5 py-1 text-[11.5px] font-bold text-avisdoc-ink transition-[filter] hover:brightness-95"
                  >
                    <ExternalLink className="size-3" /> Consulter
                  </button>
                </div>
              ))}
            </div>
          )}
          <p className="mt-3 text-[12px] italic text-muted-foreground">
            Le contrôle des pièces (valider / refuser) arrive au prochain lot.
          </p>
        </Card>

        {/* Historique */}
        <Card className="p-5 lg:col-span-2">
          <SectionLabel className="mb-2">Historique</SectionLabel>
          {historique.length === 0 ? (
            <p className="text-[13px] italic text-muted-foreground">Aucun événement.</p>
          ) : (
            <div className="flex flex-col gap-1.5">
              {historique.map((h) => (
                <div key={h.id} className="flex gap-3 text-[12.5px]">
                  <span className="w-32 shrink-0 text-muted-foreground">
                    {new Date(h.at).toLocaleString("fr-FR", {
                      day: "2-digit",
                      month: "short",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </span>
                  <span className="text-avisdoc-ink">{h.action}</span>
                  {h.acteur && <span className="text-muted-foreground">· {h.acteur}</span>}
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
