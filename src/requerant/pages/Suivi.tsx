import { useCallback, useEffect, useRef, useState, type ChangeEvent } from "react";
import { Camera, Check, Clock, FileSignature, LogOut, Upload } from "lucide-react";
import { toast } from "sonner";
import AvisdocLogo from "@/components/AvisdocLogo";
import { portalRepo, type MonDossier } from "../lib/repo";
import type { PieceType, ReqEtat, ReqPiece } from "../../admin/req/types";
import { PIECE_ETAT_LABEL, PIECE_TYPE_LABEL } from "../../admin/req/types";
import { frDate } from "../../admin/lib/format";
import { cn } from "@/lib/utils";
import InfosForm from "./InfosForm";

// Parcours en 3 étapes : les 3 documents (identité + RCP + URSSAF) sont déposés
// ensemble, l'équipe les valide, puis le contrat est signé.
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
      return 0; // invitee, identite_*, pieces_a_valider, a_completer, suspendue
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
      {/* Caméra (mobile) : ouvre directement l'appareil photo. */}
      <input ref={camRef} type="file" accept="image/*" capture="environment" hidden onChange={pick} />
      {/* Fichier : photo existante ou PDF. */}
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

// Une ligne par document : statut clair + dépôt quand c'est à l'infirmière d'agir.
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
  const enAttente = etat === "deposee";
  return (
    <div className="flex flex-col gap-2 rounded-xl border border-border bg-card p-4">
      <div className="text-[13.5px] font-semibold text-avisdoc-ink">
        {PIECE_TYPE_LABEL[type]}
        {refus && <span className="text-avisdoc-coral"> — refusée, à redéposer</span>}
        {expiree && <span className="text-avisdoc-coral"> — expirée, à renouveler</span>}
      </div>
      {refus && piece?.motif && <div className="text-[12px] text-avisdoc-coral">{piece.motif}</div>}
      {enAttente ? (
        <div className="flex items-center gap-2 rounded-lg bg-sky-50 px-3 py-2 text-[13px] font-semibold text-sky-700">
          <Clock className="size-4 shrink-0" /> En cours de vérification par l'équipe
        </div>
      ) : (
        <Uploader label={refus || expiree ? "Redéposer" : "Déposer"} busy={busy} onFile={onFile} />
      )}
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

  // Étape Documents : synthèse de l'état des 3 pièces.
  const etatDe = (t: PieceType) => derniere(t)?.etat;
  const aDeposer = (t: PieceType) => {
    const e = etatDe(t);
    return !e || e === "refusee" || e === "expiree" || e === "remplacee";
  };
  const refusePresent = DOCS.some((t) => etatDe(t) === "refusee");
  const resteAFaire = DOCS.some(aDeposer);
  const enVerif = DOCS.some((t) => etatDe(t) === "deposee");

  let messageEtape: string;
  if (courante === 0) {
    if (refusePresent) {
      messageEtape = "Une pièce n'a pas été validée — merci de déposer une nouvelle version ci-dessous.";
    } else if (!resteAFaire && enVerif) {
      messageEtape = "Vos documents ont bien été reçus et sont en cours de vérification par l'équipe AvisDoc. Vous serez prévenu dès validation.";
    } else {
      messageEtape = "Déposez vos 3 documents : pièce d'identité, attestation de responsabilité civile (RCP) et attestation URSSAF. L'équipe les vérifie ensuite.";
    }
  } else if (i.etat === "pret_a_signer") {
    messageEtape = "Votre dossier est complet et validé. La signature de votre convention arrive très bientôt.";
  } else if (i.etat === "contrat_envoye") {
    messageEtape = "Dernière étape : signez votre convention.";
  } else {
    messageEtape = "Votre inscription est active. Merci de votre confiance !";
  }

  const montrerDocs = (courante === 0 || i.etat === "suspendue") && !terminal;

  return (
    <div className="mx-auto w-full max-w-md px-6 py-8">
      {/* En-tête de marque */}
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

      {/* Vos informations (étape 1) */}
      {!terminal && courante === 0 && (
        <div className="mt-6">
          <InfosForm i={i} onSaved={() => void recharger()} />
        </div>
      )}

      {/* Prochaine étape + dépôts */}
      {!terminal && (
        <div className="mt-6 rounded-2xl border border-border bg-card p-5 shadow-soft">
          <div className="text-[12px] font-semibold uppercase tracking-wide text-muted-foreground">Prochaine étape</div>
          <p className="mt-1 text-[15px] leading-relaxed text-avisdoc-ink">{messageEtape}</p>

          {/* Dépôt groupé des 3 documents */}
          {montrerDocs && (
            <div className="mt-4 flex flex-col gap-3">
              <DocLigne
                type="identite"
                piece={derniere("identite")}
                busy={busy}
                onFile={(f) => {
                  const r = (i.rpps || "").trim();
                  if (!r) {
                    toast.error("Renseignez d'abord votre RPPS dans « Vos informations ».");
                    return;
                  }
                  void envoyer(() => portalRepo.deposerIdentite(r, f));
                }}
              />
              <DocLigne type="rcp" piece={derniere("rcp")} busy={busy} onFile={(f) => void envoyer(() => portalRepo.deposerPiece("rcp", f))} />
              <DocLigne type="urssaf" piece={derniere("urssaf")} busy={busy} onFile={(f) => void envoyer(() => portalRepo.deposerPiece("urssaf", f))} />
              <p className="text-[12px] text-muted-foreground">
                Photo ou PDF, 10 Mo max. Votre pièce d'identité est conservée le temps du contrôle puis détruite.
              </p>
            </div>
          )}

          {/* Signature du contrat */}
          {i.etat === "contrat_envoye" && (
            <div className="mt-4">
              {contratCourant?.signUrl ? (
                <a
                  href={contratCourant.signUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex w-full items-center justify-center gap-1.5 rounded-full bg-avisdoc-teal px-5 py-3 text-[15px] font-bold text-white transition-colors"
                >
                  <FileSignature className="size-4" /> Signer ma convention
                </a>
              ) : (
                <p className="text-[13px] text-muted-foreground">
                  Le lien de signature vous a été envoyé par e-mail. Pensez à vérifier vos spams.
                </p>
              )}
            </div>
          )}
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
