import { useCallback, useEffect, useState, type ReactNode } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft, Ban, CheckCircle2, Download, ExternalLink, FileSignature, RotateCcw, XCircle } from "lucide-react";
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
import { Badge, Card, Modal, SectionLabel } from "../../components/ui";
import { cn } from "@/lib/utils";

function Ligne({ k, v }: { k: string; v: ReactNode }) {
  return (
    <div className="flex gap-2 py-1 text-[13px]">
      <span className="w-40 shrink-0 text-muted-foreground">{k}</span>
      <span className="min-w-0 flex-1 text-avisdoc-ink">{v}</span>
    </div>
  );
}

function Case({ on, set, children }: { on: boolean; set: (v: boolean) => void; children: ReactNode }) {
  return (
    <label className="flex cursor-pointer items-start gap-2 py-1 text-[13px] text-avisdoc-ink">
      <input type="checkbox" checked={on} onChange={(e) => set(e.target.checked)} className="mt-0.5" />
      <span>{children}</span>
    </label>
  );
}

/** A3 — contrôle d'une pièce : aperçu + grille selon le type. */
function ControleModal({ piece, onClose, onDone }: { piece: ReqPiece; onClose: () => void; onDone: () => void }) {
  const [url, setUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [mode, setMode] = useState<"valider" | "refuser">("valider");

  // Champs de validation selon le type.
  const [rcp, setRcp] = useState({ assureur: "", police: "", dateFin: "", c1: false, c2: false, c3: false });
  const [urssaf, setUrssaf] = useState({ dateEmission: "", codeVerifie: false });
  const [ident, setIdent] = useState({ nomOk: false, rppsOk: false });
  const [motif, setMotif] = useState<MotifRefus | "">("");
  const [autre, setAutre] = useState("");

  useEffect(() => {
    void reqRepo.pieceUrl(piece).then(setUrl);
  }, [piece]);

  const valideOk =
    piece.type === "rcp"
      ? rcp.assureur && rcp.police && rcp.dateFin && rcp.c1 && rcp.c2 && rcp.c3
      : piece.type === "urssaf"
        ? urssaf.dateEmission && urssaf.codeVerifie
        : ident.nomOk && ident.rppsOk;
  const refusOk = motif && (motif !== "autre" || autre.trim());

  const soumettre = async () => {
    setBusy(true);
    try {
      if (mode === "refuser") {
        await reqRepo.controlerPiece({
          pieceId: piece.id,
          decision: "refuser",
          motif: motif === "autre" ? `autre: ${autre.trim()}` : (motif as string),
        });
        toast.success("Pièce refusée.");
      } else {
        await reqRepo.controlerPiece({
          pieceId: piece.id,
          decision: "valider",
          assureur: rcp.assureur || undefined,
          police: rcp.police || undefined,
          dateFin: piece.type === "rcp" ? rcp.dateFin : undefined,
          dateEmission: piece.type === "urssaf" ? urssaf.dateEmission : undefined,
          codeUrssafVerifie: piece.type === "urssaf" ? urssaf.codeVerifie : undefined,
        });
        toast.success("Pièce validée.");
      }
      onDone();
    } catch (e) {
      console.error(e);
      toast.error("Le contrôle a échoué.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal onClose={onClose} width={860}>
      <h2 className="font-display text-lg font-semibold text-avisdoc-ink">
        Contrôle — {PIECE_TYPE_LABEL[piece.type]}
      </h2>
      <div className="mt-4 grid gap-4 md:grid-cols-2">
        {/* Aperçu */}
        <div className="h-[55vh] overflow-hidden rounded-xl border border-border bg-muted/40">
          {url ? (
            <iframe title="Pièce" src={url} className="size-full border-0" />
          ) : (
            <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
              Chargement de la pièce…
            </div>
          )}
        </div>

        {/* Grille */}
        <div className="flex flex-col">
          <div className="mb-3 flex gap-1 rounded-full border border-border bg-card p-1 text-[13px] font-semibold">
            <button
              type="button"
              onClick={() => setMode("valider")}
              className={cn("flex-1 rounded-full px-3 py-1.5", mode === "valider" ? "bg-avisdoc-ink text-white" : "text-muted-foreground")}
            >
              Valider
            </button>
            <button
              type="button"
              onClick={() => setMode("refuser")}
              className={cn("flex-1 rounded-full px-3 py-1.5", mode === "refuser" ? "bg-avisdoc-coral text-white" : "text-muted-foreground")}
            >
              Refuser
            </button>
          </div>

          {mode === "valider" ? (
            <div className="flex flex-col gap-1">
              {piece.type === "rcp" && (
                <>
                  <input className="ad-input rounded-lg border border-border bg-card px-3 py-2 text-[13px] outline-none focus:border-avisdoc-teal" placeholder="Assureur" value={rcp.assureur} onChange={(e) => setRcp((s) => ({ ...s, assureur: e.target.value }))} />
                  <input className="ad-input rounded-lg border border-border bg-card px-3 py-2 text-[13px] outline-none focus:border-avisdoc-teal" placeholder="N° de police" value={rcp.police} onChange={(e) => setRcp((s) => ({ ...s, police: e.target.value }))} />
                  <label className="text-[12px] font-semibold text-muted-foreground">
                    Date de fin de validité
                    <input type="date" className="ad-input mt-0.5 w-full rounded-lg border border-border bg-card px-3 py-2 text-[13px] outline-none focus:border-avisdoc-teal" value={rcp.dateFin} onChange={(e) => setRcp((s) => ({ ...s, dateFin: e.target.value }))} />
                  </label>
                  <div className="mt-2 border-t border-border pt-2">
                    <Case on={rcp.c1} set={(v) => setRcp((s) => ({ ...s, c1: v }))}>Nomme l'infirmière</Case>
                    <Case on={rcp.c2} set={(v) => setRcp((s) => ({ ...s, c2: v }))}>Mentionne l'exercice libéral</Case>
                    <Case on={rcp.c3} set={(v) => setRcp((s) => ({ ...s, c3: v }))}>Couvre la date du jour</Case>
                  </div>
                </>
              )}
              {piece.type === "urssaf" && (
                <>
                  <label className="text-[12px] font-semibold text-muted-foreground">
                    Date d'émission
                    <input type="date" className="ad-input mt-0.5 w-full rounded-lg border border-border bg-card px-3 py-2 text-[13px] outline-none focus:border-avisdoc-teal" value={urssaf.dateEmission} onChange={(e) => setUrssaf((s) => ({ ...s, dateEmission: e.target.value }))} />
                  </label>
                  <p className="mt-1 text-[12px] text-muted-foreground">Validité = émission + 6 mois (RI-05).</p>
                  <div className="mt-2 border-t border-border pt-2">
                    <Case on={urssaf.codeVerifie} set={(v) => setUrssaf((s) => ({ ...s, codeVerifie: v }))}>
                      Code de sécurité vérifié sur le site de l'URSSAF
                    </Case>
                  </div>
                </>
              )}
              {piece.type === "identite" && (
                <div className="border-t border-border pt-2">
                  <Case on={ident.nomOk} set={(v) => setIdent((s) => ({ ...s, nomOk: v }))}>Nom concordant avec le dossier</Case>
                  <Case on={ident.rppsOk} set={(v) => setIdent((s) => ({ ...s, rppsOk: v }))}>RPPS concordant</Case>
                </div>
              )}
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              <select
                value={motif}
                onChange={(e) => setMotif(e.target.value as MotifRefus)}
                className="ad-input rounded-lg border border-border bg-card px-3 py-2 text-[13px] outline-none focus:border-avisdoc-teal"
              >
                <option value="">Motif du refus…</option>
                {(Object.keys(MOTIF_LABEL) as MotifRefus[]).map((m) => (
                  <option key={m} value={m}>{MOTIF_LABEL[m]}</option>
                ))}
              </select>
              {motif === "autre" && (
                <input className="ad-input rounded-lg border border-border bg-card px-3 py-2 text-[13px] outline-none focus:border-avisdoc-teal" placeholder="Préciser le motif" value={autre} onChange={(e) => setAutre(e.target.value)} />
              )}
            </div>
          )}

          <div className="mt-auto flex justify-end gap-2 pt-4">
            <button type="button" onClick={onClose} className="ad-btn-outline rounded-full border-[1.5px] border-border px-4 py-2 text-[13px] font-bold text-avisdoc-ink">
              Annuler
            </button>
            {mode === "valider" ? (
              <button type="button" onClick={() => void soumettre()} disabled={busy || !valideOk} className="inline-flex items-center gap-1.5 rounded-full bg-emerald-600 px-5 py-2 text-[13px] font-bold text-white disabled:opacity-40">
                <CheckCircle2 className="size-4" /> Valider
              </button>
            ) : (
              <button type="button" onClick={() => void soumettre()} disabled={busy || !refusOk} className="inline-flex items-center gap-1.5 rounded-full bg-avisdoc-coral px-5 py-2 text-[13px] font-bold text-white disabled:opacity-40">
                <XCircle className="size-4" /> Refuser
              </button>
            )}
          </div>
        </div>
      </div>
    </Modal>
  );
}

/** Transition d'inscription avec motif (suspendre/refuser/résilier). */
function ActionModal({ action, onClose, onConfirm }: { action: "suspendre" | "refuser" | "resilier"; onClose: () => void; onConfirm: (motif: string) => void }) {
  const [motif, setMotif] = useState("");
  const label = action === "suspendre" ? "Suspendre" : action === "refuser" ? "Refuser" : "Résilier";
  return (
    <Modal onClose={onClose} width={420}>
      <h2 className="font-display text-lg font-semibold text-avisdoc-ink">{label} l'inscription</h2>
      <p className="mt-1 text-[13px] text-muted-foreground">Un motif est obligatoire (tracé dans l'historique).</p>
      <textarea
        className="ad-input mt-3 w-full rounded-lg border border-border bg-card px-3 py-2 text-[13px] outline-none focus:border-avisdoc-teal"
        rows={3}
        placeholder="Motif…"
        value={motif}
        onChange={(e) => setMotif(e.target.value)}
      />
      <div className="mt-4 flex justify-end gap-2">
        <button type="button" onClick={onClose} className="ad-btn-outline rounded-full border-[1.5px] border-border px-4 py-2 text-[13px] font-bold text-avisdoc-ink">Annuler</button>
        <button type="button" disabled={!motif.trim()} onClick={() => onConfirm(motif.trim())} className="rounded-full bg-avisdoc-coral px-5 py-2 text-[13px] font-bold text-white disabled:opacity-40">{label}</button>
      </div>
    </Modal>
  );
}

export default function Fiche() {
  const { id } = useParams<{ id: string }>();
  const [dossier, setDossier] = useState<ReqDossier | null>(null);
  const [loading, setLoading] = useState(true);
  const [controle, setControle] = useState<ReqPiece | null>(null);
  const [action, setAction] = useState<"suspendre" | "refuser" | "resilier" | null>(null);
  const [envoiContrat, setEnvoiContrat] = useState(false);

  const charger = useCallback(async () => {
    if (!id) return;
    try {
      setDossier(await reqRepo.dossier(id));
    } catch (e) {
      console.error(e);
      toast.error("Dossier introuvable.");
    } finally {
      setLoading(false);
    }
  }, [id]);
  useEffect(() => {
    void charger();
  }, [charger]);

  const consulter = async (p: ReqPiece) => {
    const url = await reqRepo.pieceUrl(p);
    if (url) window.open(url, "_blank", "noopener");
    else toast.info("Pièce indisponible.");
  };

  const envoyerContrat = async () => {
    if (!id) return;
    setEnvoiContrat(true);
    try {
      const { emailEnvoye } = await reqRepo.envoyerContrat(id);
      toast.success(emailEnvoye ? "Contrat envoyé par e-mail." : "Contrat créé et prêt à signer.");
      void charger();
    } catch (e) {
      console.error(e);
      toast.error("L'envoi du contrat a échoué.");
    } finally {
      setEnvoiContrat(false);
    }
  };

  const telechargerContrat = async (path: string) => {
    const url = await reqRepo.contratUrl(path);
    if (url) window.open(url, "_blank", "noopener");
    else toast.info("Document indisponible.");
  };

  const reactiver = async () => {
    if (!id) return;
    try {
      await reqRepo.reactiver(id);
      toast.success("Inscription réactivée.");
      void charger();
    } catch (e) {
      console.error(e);
      toast.error("La réactivation a échoué.");
    }
  };

  const reinitialiser = async () => {
    if (!id) return;
    try {
      await reqRepo.reinitialiser(id);
      toast.success("Dossier réinitialisé — l'infirmière peut recommencer.");
      void charger();
    } catch (e) {
      console.error(e);
      toast.error("La réinitialisation a échoué.");
    }
  };

  const confirmerAction = async (motif: string) => {
    if (!id || !action) return;
    try {
      await reqRepo.action(id, action, motif);
      toast.success("Inscription mise à jour.");
      setAction(null);
      void charger();
    } catch (e) {
      console.error(e);
      toast.error("L'action a échoué.");
    }
  };

  if (loading) return <div className="py-16 text-center text-sm text-muted-foreground">Chargement…</div>;
  if (!dossier) {
    return (
      <div className="py-16 text-center text-sm text-muted-foreground">
        <Link to="/infirmieres" className="text-avisdoc-teal hover:underline">← Retour aux inscriptions</Link>
      </div>
    );
  }

  const { inscription: i, pieces, contrats, historique } = dossier;
  const terminal = ["refusee", "resiliee", "abandonnee"].includes(i.etat);

  // Éligibilité à l'affectation (RI-01) : active + RCP & URSSAF valides et non échues.
  const today = new Date().toISOString().slice(0, 10);
  const latestOf = (t: ReqPiece["type"]) => pieces.find((p) => p.type === t); // triées version desc
  const pieceOk = (t: ReqPiece["type"]) => {
    const p = latestOf(t);
    return p?.etat === "validee" && !!p.dateFin && p.dateFin >= today;
  };
  const eligible = i.etat === "active" && pieceOk("rcp") && pieceOk("urssaf");

  return (
    <div>
      <Link to="/infirmieres" className="mb-3 inline-flex items-center gap-1.5 text-[13px] font-semibold text-muted-foreground transition-colors hover:text-avisdoc-ink">
        <ArrowLeft className="size-4" /> Inscriptions
      </Link>

      <div className="mb-5 flex flex-wrap items-center gap-3">
        <h1 className="font-display text-2xl font-semibold text-avisdoc-ink">{i.prenom} {i.nom}</h1>
        <Badge className={ETAT_BADGE[i.etat]}>{ETAT_LABEL[i.etat]}</Badge>
        <div className="ml-auto flex flex-wrap gap-2">
          {i.etat === "pret_a_signer" && (
            <button type="button" onClick={() => void envoyerContrat()} disabled={envoiContrat} className="inline-flex items-center gap-1.5 rounded-full bg-avisdoc-teal px-3.5 py-1.5 text-[12.5px] font-bold text-white disabled:opacity-50">
              <FileSignature className="size-3.5" /> {envoiContrat ? "Envoi…" : "Envoyer le contrat"}
            </button>
          )}
          {i.etat === "suspendue" && (
            <button type="button" onClick={() => void reactiver()} className="inline-flex items-center gap-1.5 rounded-full bg-emerald-100 px-3.5 py-1.5 text-[12.5px] font-bold text-emerald-700">
              <CheckCircle2 className="size-3.5" /> Réactiver
            </button>
          )}
          {i.etat === "active" && (
            <button type="button" onClick={() => setAction("suspendre")} className="inline-flex items-center gap-1.5 rounded-full bg-amber-100 px-3.5 py-1.5 text-[12.5px] font-bold text-amber-700">
              <Ban className="size-3.5" /> Suspendre
            </button>
          )}
          {!terminal && (
            <button type="button" onClick={() => setAction("refuser")} className="inline-flex items-center gap-1.5 rounded-full bg-rose-100 px-3.5 py-1.5 text-[12.5px] font-bold text-rose-700">
              <XCircle className="size-3.5" /> Refuser
            </button>
          )}
          {i.etat === "active" && (
            <button type="button" onClick={() => setAction("resilier")} className="inline-flex items-center gap-1.5 rounded-full bg-slate-200 px-3.5 py-1.5 text-[12.5px] font-bold text-slate-700">
              Résilier
            </button>
          )}
          {terminal && (
            <button type="button" onClick={() => void reinitialiser()} className="inline-flex items-center gap-1.5 rounded-full bg-avisdoc-teal px-3.5 py-1.5 text-[12.5px] font-bold text-white">
              <RotateCcw className="size-3.5" /> Réinitialiser
            </button>
          )}
        </div>
      </div>

      <div className="grid items-start gap-5 lg:grid-cols-2">
        <Card className="p-5">
          <SectionLabel className="mb-2">Identité</SectionLabel>
          <Ligne k="E-mail" v={i.email} />
          <Ligne k="Téléphone" v={i.telephone || "—"} />
          <Ligne k="RPPS" v={i.rpps || "—"} />
          <Ligne k="Source d'identité" v={i.identiteSource === "psc" ? "Pro Santé Connect" : i.identiteSource === "secours" ? "Voie de secours" : "—"} />
          <Ligne
            k="Éligible à l'affectation"
            v={<span className={eligible ? "font-semibold text-emerald-700" : "text-muted-foreground"}>{eligible ? "Oui" : "Non"}</span>}
          />
          <Ligne
            k="Informations contrat"
            v={<span className={i.infosCompletes ? "font-semibold text-emerald-700" : "text-avisdoc-coral"}>{i.infosCompletes ? "Complètes" : "À compléter par l'infirmière"}</span>}
          />
          {i.motif && <Ligne k="Motif" v={<span className="text-avisdoc-coral">{i.motif}</span>} />}
        </Card>

        <Card className="p-5">
          <SectionLabel className="mb-2">Contrat</SectionLabel>
          {contrats.length === 0 ? (
            i.etat === "pret_a_signer" ? (
              <p className="text-[13px] text-muted-foreground">Dossier complet — cliquez sur « Envoyer le contrat » pour lancer la signature.</p>
            ) : (
              <p className="text-[13px] italic text-muted-foreground">Signature électronique (Yousign) une fois le dossier prêt à signer.</p>
            )
          ) : (
            <div className="flex flex-col gap-2">
              {contrats.map((c) => {
                const label = c.statut === "signe" ? "Signé" : c.statut === "refuse" ? "Refusé" : c.statut === "expire" ? "Expiré" : "Envoyé";
                const badge = c.statut === "signe" ? "bg-emerald-100 text-emerald-700" : c.statut === "refuse" ? "bg-rose-100 text-rose-700" : c.statut === "expire" ? "bg-orange-100 text-orange-700" : "bg-indigo-100 text-indigo-700";
                return (
                  <div key={c.id} className="rounded-lg border border-border/60 p-3">
                    <div className="flex items-center gap-2 text-[13px]">
                      <span className="font-semibold text-avisdoc-ink">Convention {c.modeleVersion}</span>
                      <Badge className={badge}>{label}</Badge>
                    </div>
                    <div className="mt-1 text-[12px] text-muted-foreground">
                      Envoyé le {frDate(c.envoyeLe)}{c.signeLe ? ` · signé le ${frDate(c.signeLe)}` : ""}
                    </div>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {c.statut === "envoye" && c.signUrl && (
                        <a href={c.signUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 rounded-full bg-muted px-2.5 py-1 text-[11.5px] font-bold text-avisdoc-ink transition-[filter] hover:brightness-95">
                          <ExternalLink className="size-3" /> Lien de signature
                        </a>
                      )}
                      {c.signedPath && (
                        <button type="button" onClick={() => void telechargerContrat(c.signedPath!)} className="inline-flex items-center gap-1 rounded-full bg-emerald-600 px-2.5 py-1 text-[11.5px] font-bold text-white">
                          <Download className="size-3" /> Contrat signé
                        </button>
                      )}
                      {c.preuvePath && (
                        <button type="button" onClick={() => void telechargerContrat(c.preuvePath!)} className="inline-flex items-center gap-1 rounded-full bg-muted px-2.5 py-1 text-[11.5px] font-bold text-avisdoc-ink transition-[filter] hover:brightness-95">
                          <Download className="size-3" /> Preuve
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </Card>

        <Card className="p-5 lg:col-span-2">
          <SectionLabel className="mb-2">Pièces</SectionLabel>
          {pieces.length === 0 ? (
            <p className="text-[13px] italic text-muted-foreground">Aucune pièce déposée.</p>
          ) : (
            <div className="flex flex-col">
              {pieces.map((p) => (
                <div key={p.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-border/50 py-2.5 last:border-b-0">
                  <span className="text-[13px] font-semibold text-avisdoc-ink">{PIECE_TYPE_LABEL[p.type]}</span>
                  <span className="rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-bold text-muted-foreground">v{p.version}</span>
                  <Badge className={cn(p.etat === "validee" ? "bg-emerald-100 text-emerald-700" : p.etat === "refusee" ? "bg-rose-100 text-rose-700" : p.etat === "expiree" ? "bg-orange-100 text-orange-700" : "bg-slate-100 text-slate-600")}>
                    {PIECE_ETAT_LABEL[p.etat]}
                  </Badge>
                  <span className="text-[12px] text-muted-foreground">
                    {p.dateFin ? `échéance ${frDate(p.dateFin)}` : p.dateEmission ? `émise le ${frDate(p.dateEmission)}` : ""}
                  </span>
                  {p.motif && <span className="text-[12px] text-avisdoc-coral">{MOTIF_LABEL[p.motif as MotifRefus] ?? p.motif}</span>}
                  <div className="ml-auto flex gap-1.5">
                    <button type="button" onClick={() => void consulter(p)} className="inline-flex items-center gap-1 rounded-full bg-muted px-2.5 py-1 text-[11.5px] font-bold text-avisdoc-ink transition-[filter] hover:brightness-95">
                      <ExternalLink className="size-3" /> Consulter
                    </button>
                    {p.etat === "deposee" && (
                      <button type="button" onClick={() => setControle(p)} className="inline-flex items-center gap-1 rounded-full bg-avisdoc-ink px-2.5 py-1 text-[11.5px] font-bold text-white">
                        Contrôler
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>

        <Card className="p-5 lg:col-span-2">
          <SectionLabel className="mb-2">Historique</SectionLabel>
          {historique.length === 0 ? (
            <p className="text-[13px] italic text-muted-foreground">Aucun événement.</p>
          ) : (
            <div className="flex flex-col gap-1.5">
              {historique.map((h) => (
                <div key={h.id} className="flex gap-3 text-[12.5px]">
                  <span className="w-32 shrink-0 text-muted-foreground">
                    {new Date(h.at).toLocaleString("fr-FR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}
                  </span>
                  <span className="text-avisdoc-ink">{h.action}</span>
                  {h.acteur && <span className="text-muted-foreground">· {h.acteur}</span>}
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>

      {controle && (
        <ControleModal piece={controle} onClose={() => setControle(null)} onDone={() => { setControle(null); void charger(); }} />
      )}
      {action && <ActionModal action={action} onClose={() => setAction(null)} onConfirm={(m) => void confirmerAction(m)} />}
    </div>
  );
}
