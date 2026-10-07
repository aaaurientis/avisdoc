import { useCallback, useEffect, useRef, useState, type ChangeEvent } from "react";
import { Camera, Check, Clock, FileSignature, LogOut, Send, Upload } from "lucide-react";
import { toast } from "sonner";
import AvisdocLogo from "@/components/AvisdocLogo";
import { portalRepo, type MonDossier } from "../lib/repo";
import type { PieceType, ReqEtat, ReqPiece } from "../../admin/req/types";
import { PIECE_ETAT_LABEL, PIECE_TYPE_LABEL } from "../../admin/req/types";
import { frDate } from "../../admin/lib/format";
import { cn } from "@/lib/utils";
import InfosForm from "./InfosForm";
import RcpForm from "./RcpForm";

// Parcours en 3 étapes : constitution du dossier (3 documents + infos + RCP) →
// soumission → validation par l'équipe → contrat → actif.
const ETAPES = ["Documents", "Contrat", "Actif"];
const DOCS: PieceType[] = ["identite", "rcp", "urssaf"];

function etapeCourante(etat: ReqEtat): number {
  switch (etat) {
    case "pret_a_signer":
    case "contrat_envoye":
      return 1;
    case "active":
      return 2;
    default:
      return 0;
  }
}

function Uploader({ label, busy, onFile }: { label: string; busy: boolean; onFile: (f: File) => void }) {
  const camRef = useRef<HTMLInputElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const pick = (e: ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;
    if (f.size > 10 * 1024 * 1024) {
      toast.error("Fichier trop volumineux (10 Mo max).");
      return;
    }
    onFile(f);
  };
  return (
    <>
      <input ref={camRef} type="file" accept="image/*" capture="environment" hidden onChange={pick} />
      <input ref={fileRef} type="file" accept="image/*,.pdf" hidden onChange={pick} />
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => camRef.current?.click()}
          disabled={busy}
          className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-full bg-avisdoc-teal px-4 py-2.5 text-[13.5px] font-bold text-white transition-colors disabled:opacity-60"
        >
          <Camera className="size-4" /> {busy ? "Envoi…" : "Prendre en photo"}
        </button>
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          disabled={busy}
          title={label}
          className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-full border-[1.5px] border-avisdoc-teal px-4 py-2.5 text-[13.5px] font-bold text-avisdoc-teal transition-colors disabled:opacity-60"
        >
          <Upload className="size-4" /> Choisir un fichier
        </button>
      </div>
    </>
  );
}

// Une ligne par document : statut clair + dépôt quand c'est au requérant d'agir.
function DocLigne({ type, piece, busy, onFile }: { type: PieceType; piece?: ReqPiece; busy: boolean; onFile: (f: File) => void }) {
  const etat = piece?.etat;
  if (etat === "validee") {
    return (
      <div className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-[13.5px] font-semibold text-emerald-700">
        <Check className="size-4 shrink-0" /> {PIECE_TYPE_LABEL[type]} — validée
      </div>
    );
  }
  const refus = etat === "refusee";
  const expiree = etat === "expiree";
  const depose = etat === "deposee";
  return (
    <div className="flex flex-col gap-2 rounded-xl border border-border bg-card p-4">
      <div className="flex items-center gap-2 text-[13.5px] font-semibold text-avisdoc-ink">
        {depose && <Check className="size-4 shrink-0 text-emerald-600" />}
        {PIECE_TYPE_LABEL[type]}
        {refus && <span className="text-avisdoc-coral"> — refusée, à redéposer</span>}
        {expiree && <span className="text-avisdoc-coral"> — expirée, à renouveler</span>}
        {depose && <span className="text-[12px] font-normal text-muted-foreground">— déposé</span>}
      </div>
      {refus && piece?.motif && <div className="text-[12px] text-avisdoc-coral">{piece.motif}</div>}
      <Uploader label={refus || expiree || depose ? "Remplacer" : "Déposer"} busy={busy} onFile={onFile} />
    </div>
  );
}

export default function Suivi({ onDeconnexion }: { onDeconnexion: () => void }) {
  const [dossier, setDossier] = useState<MonDossier | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const recharger = useCallback(async () => {
    try {
      setDossier(await portalRepo.monDossier());
    } catch (e) {
      console.error(e);
      toast.error("Impossible de charger votre dossier.");
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    void recharger();
  }, [recharger]);

  const envoyer = async (fn: () => Promise<void>) => {
    setBusy(true);
    try {
      await fn();
      toast.success("Document envoyé.");
      await recharger();
    } catch (e) {
      console.error(e);
      toast.error("L'envoi a échoué.");
    } finally {
      setBusy(false);
    }
  };

  const soumettre = async () => {
    setBusy(true);
    try {
      await portalRepo.soumettre();
      toast.success("Dossier soumis !");
      await recharger();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "La soumission a échoué.");
    } finally {
      setBusy(false);
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="size-8 animate-spin rounded-full border-[3px] border-border border-t-avisdoc-teal" />
      </div>
    );
  }

  if (!dossier) {
    return (
      <div className="mx-auto max-w-md px-6 py-16 text-center">
        <AvisdocLogo className="mx-auto mb-6 h-12 w-auto" />
        <p className="text-[15px] text-muted-foreground">
          Aucun dossier n'est encore rattaché à votre compte. Ouvrez le lien reçu
          par e-mail, ou contactez l'équipe AvisDoc.
        </p>
        <button type="button" onClick={onDeconnexion} className="mt-6 text-[13px] font-semibold text-avisdoc-teal underline">
          Se déconnecter
        </button>
      </div>
    );
  }

  const { inscription: i, pieces, contrats } = dossier;
  const contratCourant = contrats.find((c) => c.statut === "envoye") ?? contrats[0];
  const courante = etapeCourante(i.etat);
  const terminal = ["refusee", "resiliee", "abandonnee"].includes(i.etat);
  const derniere = (t: PieceType) => pieces.find((p) => p.type === t); // triées version desc

  const docDepose = (t: PieceType) => { const p = derniere(t); return !!p && p.etat !== "remplacee"; };
  const enConstitution = !terminal && (i.etat === "invitee" || i.etat === "a_completer");
  const enValidation = ["identite_a_controler", "identite_verifiee", "pieces_a_valider"].includes(i.etat);
  const rcpOk = !!(i.rcpAssureur && i.rcpPolice && i.rcpDateFin);
  const docsOk = DOCS.every(docDepose);
  const pretASoumettre = !!i.infosCompletes && rcpOk && docsOk;

  return (
    <div className="mx-auto w-full max-w-md px-6 py-8">
      <div className="flex items-start justify-between">
        <AvisdocLogo className="h-11 w-auto" />
        <button type="button" onClick={onDeconnexion} title="Se déconnecter" className="rounded-lg p-2 text-muted-foreground transition-colors hover:text-avisdoc-ink">
          <LogOut className="size-5" />
        </button>
      </div>
      <div className="mt-5">
        <div className="text-[12px] font-semibold uppercase tracking-wide text-muted-foreground">Mon inscription</div>
        <h1 className="font-display text-xl font-semibold text-avisdoc-ink">{i.prenom} {i.nom}</h1>
      </div>

      {/* Fil des étapes */}
      <div className="mt-6 flex items-center">
        {ETAPES.map((e, idx) => {
          const fait = idx < courante || i.etat === "active";
          const actif = idx === courante && i.etat !== "active";
          return (
            <div key={e} className="flex flex-1 flex-col items-center">
              <div className="flex w-full items-center">
                <div className={cn("h-0.5 flex-1", idx === 0 ? "opacity-0" : fait || actif ? "bg-avisdoc-teal" : "bg-border")} />
                <div className={cn("flex size-7 shrink-0 items-center justify-center rounded-full text-[11px] font-bold", fait ? "bg-avisdoc-teal text-white" : actif ? "border-2 border-avisdoc-teal text-avisdoc-teal" : "border-2 border-border text-muted-foreground")}>
                  {fait ? <Check className="size-3.5" /> : idx + 1}
                </div>
                <div className={cn("h-0.5 flex-1", idx === ETAPES.length - 1 ? "opacity-0" : idx < courante ? "bg-avisdoc-teal" : "bg-border")} />
              </div>
              <span className={cn("mt-1 text-[11px] font-semibold", actif || fait ? "text-avisdoc-ink" : "text-muted-foreground")}>{e}</span>
            </div>
          );
        })}
      </div>

      {(terminal || i.etat === "suspendue") && (
        <div className={cn("mt-6 rounded-2xl p-4 text-[14px]", i.etat === "suspendue" ? "bg-amber-50 text-amber-800" : "bg-rose-50 text-rose-800")}>
          {i.etat === "suspendue" ? "Inscription suspendue — mettez à jour la pièce concernée ci-dessous." : "Inscription clôturée."}
          {i.motif && <div className="mt-1 text-[13px] opacity-80">Motif : {i.motif}</div>}
        </div>
      )}

      {/* CONSTITUTION : infos + RCP + 3 documents + soumission */}
      {enConstitution && (
        <div className="mt-6 flex flex-col gap-4">
          {i.etat === "a_completer" && (
            <div className="rounded-2xl bg-amber-50 p-4 text-[14px] text-amber-800">
              Une pièce n'a pas été validée. Corrigez ce qui est indiqué ci-dessous, puis soumettez à nouveau votre dossier.
            </div>
          )}

          <InfosForm i={i} onSaved={() => void recharger()} />
          <RcpForm i={i} onSaved={() => void recharger()} />

          <div className="rounded-2xl border border-border bg-card p-5 shadow-soft">
            <div className="text-[12px] font-semibold uppercase tracking-wide text-muted-foreground">Vos 3 documents</div>
            <p className="mt-1 text-[13px] text-muted-foreground">Photo ou PDF, 10 Mo max. La pièce d'identité est détruite après contrôle.</p>
            <div className="mt-4 flex flex-col gap-3">
              <DocLigne
                type="identite"
                piece={derniere("identite")}
                busy={busy}
                onFile={(f) => {
                  const r = (i.rpps || "").trim();
                  if (!r) { toast.error("Renseignez d'abord votre RPPS dans « Vos informations »."); return; }
                  void envoyer(() => portalRepo.deposerIdentite(r, f));
                }}
              />
              <DocLigne type="rcp" piece={derniere("rcp")} busy={busy} onFile={(f) => void envoyer(() => portalRepo.deposerPiece("rcp", f))} />
              <DocLigne type="urssaf" piece={derniere("urssaf")} busy={busy} onFile={(f) => void envoyer(() => portalRepo.deposerPiece("urssaf", f))} />
            </div>
          </div>

          <button
            type="button"
            onClick={() => void soumettre()}
            disabled={busy || !pretASoumettre}
            className="inline-flex items-center justify-center gap-2 rounded-full bg-avisdoc-ink px-6 py-3.5 text-[15px] font-bold text-white transition-colors disabled:opacity-40"
          >
            <Send className="size-4" /> Soumettre mon dossier
          </button>
          {!pretASoumettre && (
            <p className="-mt-1 text-center text-[12.5px] text-muted-foreground">
              Pour soumettre : complétez vos informations, l'assurance RCP et déposez les 3 documents.
            </p>
          )}
        </div>
      )}

      {/* EN COURS DE VALIDATION */}
      {enValidation && (
        <div className="mt-6 rounded-2xl border border-border bg-card p-5 text-center shadow-soft">
          <div className="mx-auto mb-3 flex size-12 items-center justify-center rounded-full bg-sky-50 text-sky-600">
            <Clock className="size-6" />
          </div>
          <h2 className="font-display text-lg font-semibold text-avisdoc-ink">Dossier en cours de validation</h2>
          <p className="mt-1.5 text-[14px] leading-relaxed text-muted-foreground">
            Votre dossier a bien été soumis. L'équipe AvisDoc vérifie vos documents et vous préviendra dès qu'il sera validé.
          </p>
        </div>
      )}

      {/* CONTRAT */}
      {i.etat === "pret_a_signer" && (
        <div className="mt-6 rounded-2xl border border-border bg-card p-5 text-center shadow-soft">
          <h2 className="font-display text-lg font-semibold text-avisdoc-ink">Dossier validé</h2>
          <p className="mt-1.5 text-[14px] text-muted-foreground">Votre dossier est complet et validé. La signature de votre convention arrive très bientôt.</p>
        </div>
      )}
      {i.etat === "contrat_envoye" && (
        <div className="mt-6 rounded-2xl border border-border bg-card p-5 shadow-soft">
          <div className="text-[12px] font-semibold uppercase tracking-wide text-muted-foreground">Dernière étape</div>
          <p className="mt-1 text-[15px] text-avisdoc-ink">Signez votre convention.</p>
          <div className="mt-4">
            {contratCourant?.signUrl ? (
              <a href={contratCourant.signUrl} target="_blank" rel="noopener noreferrer" className="inline-flex w-full items-center justify-center gap-1.5 rounded-full bg-avisdoc-teal px-5 py-3 text-[15px] font-bold text-white transition-colors">
                <FileSignature className="size-4" /> Signer ma convention
              </a>
            ) : (
              <p className="text-[13px] text-muted-foreground">Le lien de signature vous a été envoyé par e-mail. Pensez à vérifier vos spams.</p>
            )}
          </div>
        </div>
      )}
      {i.etat === "active" && (
        <div className="mt-6 rounded-2xl border border-emerald-200 bg-emerald-50 p-5 text-center text-emerald-700">
          <Check className="mx-auto mb-2 size-7" />
          <h2 className="font-display text-lg font-semibold">Inscription active</h2>
          <p className="mt-1 text-[14px]">Merci de votre confiance !</p>
        </div>
      )}

      {/* SUSPENDUE : renouvellement d'une attestation */}
      {i.etat === "suspendue" && (
        <div className="mt-6 flex flex-col gap-4">
          <RcpForm i={i} onSaved={() => void recharger()} />
          <div className="rounded-2xl border border-border bg-card p-5 shadow-soft">
            <div className="text-[12px] font-semibold uppercase tracking-wide text-muted-foreground">Mettre à jour mes documents</div>
            <div className="mt-4 flex flex-col gap-3">
              <DocLigne type="rcp" piece={derniere("rcp")} busy={busy} onFile={(f) => void envoyer(() => portalRepo.deposerPiece("rcp", f))} />
              <DocLigne type="urssaf" piece={derniere("urssaf")} busy={busy} onFile={(f) => void envoyer(() => portalRepo.deposerPiece("urssaf", f))} />
            </div>
          </div>
        </div>
      )}

      {/* Récap des pièces */}
      <div className="mt-6">
        <div className="mb-2 text-[12px] font-semibold uppercase tracking-wide text-muted-foreground">Mes pièces</div>
        {pieces.length === 0 ? (
          <p className="text-[13px] italic text-muted-foreground">Aucune pièce déposée pour l'instant.</p>
        ) : (
          <div className="flex flex-col gap-2">
            {pieces.map((p) => (
              <div key={p.id} className="flex flex-wrap items-center gap-x-2 gap-y-1 rounded-xl border border-border bg-card px-4 py-3">
                <span className="text-[13.5px] font-semibold text-avisdoc-ink">{PIECE_TYPE_LABEL[p.type]}</span>
                <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-bold", p.etat === "validee" ? "bg-emerald-100 text-emerald-700" : p.etat === "refusee" ? "bg-rose-100 text-rose-700" : "bg-slate-100 text-slate-600")}>
                  {PIECE_ETAT_LABEL[p.etat]}
                </span>
                {p.dateFin && <span className="text-[12px] text-muted-foreground">échéance {frDate(p.dateFin)}</span>}
                {p.motif && <span className="w-full text-[12px] text-avisdoc-coral">{p.motif}</span>}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
