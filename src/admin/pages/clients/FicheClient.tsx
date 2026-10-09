// Fiche client : consultation, modification et création, bâties sur les colonnes du fichier.
// On ne modifie jamais une information par mégarde : un clic OUVRE la fiche, le crayon la rend modifiable.

import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Loader2, Pencil, Trash2, Undo2, X } from "lucide-react";
import type { Account, AccountField } from "../../types";
import { colonnesDe } from "../../lib/ui-tokens";
import { useAdminData } from "../../data/AdminDataContext";
import { supabaseAdmin } from "../../data/supabaseAdmin";
import { Modal } from "../../components/ui";
import ChoixReferent from "../../components/ChoixReferent";
import type { Onglet } from "../../components/Onglets";
import FicheEntreprise from "../../components/FicheEntreprise";
import ResumeNotes from "../../components/ResumeNotes";
import { etapesDeVie, notesDe, personnesDuProspect } from "../../lib/fiche";
import CeQuOnSait from "../../components/fiche/CeQuOnSait";
import Interlocuteurs from "../../components/fiche/Interlocuteurs";
import ApprocheEntreprise from "../../components/fiche/ApprocheEntreprise";
import BoutonsFiche from "../../components/fiche/BoutonsFiche";
import LigneIdentite from "../../components/fiche/LigneIdentite";
import FilEchanges from "../../components/FilEchanges";
import ActionsFiche from "../../components/ActionsFiche";
import EspaceClientCard from "../../espace/EspaceClientCard";
import RendezVousCard from "../../espace/RendezVousCard";
import BrouillonEmail from "../prospects/BrouillonEmail";
import { approfondirProspect, redigerEmailClient } from "../../lib/merx-appels";
import { confirmer } from "../../components/Confirmation";
import { jeter, JOURS_DE_GARDE } from "../../lib/corbeille";
import { useAuth } from "../../auth/AuthContext";
import type { GenreEchange } from "../../lib/echanges";
import type { Jalon } from "../../lib/echanges";
import type { Prospect } from "../../lib/merx";
import { cn } from "@/lib/utils";

const champCls =
  "ad-input w-full rounded-xl border border-border bg-muted/50 px-3.5 py-2.5 text-[13px] outline-none transition-colors focus:border-avisdoc-teal";

/**
 * Ce qu'on peut proposer à quelqu'un qui est DÉJÀ client — et qu'on n'a pas à retrouver
 * de mémoire à chaque fois. Un clic remplit l'intitulé, qui reste modifiable.
 */
const SUGGESTIONS: { titre: string; genre: GenreEchange }[] = [
  { titre: "Proposer une nouvelle campagne", genre: "email" },
  { titre: "Relancer sur une journée supplémentaire", genre: "appel" },
  { titre: "Prendre des nouvelles après la campagne", genre: "appel" },
  { titre: "Envoyer le bilan de la dernière campagne", genre: "email" },
  { titre: "Proposer une session sur un autre site", genre: "email" },
  { titre: "Présenter le volet prévention solaire", genre: "email" },
];

const inputType = (t: AccountField["type"]) =>
  t === "date" ? "date" : t === "nombre" ? "number" : t === "email" ? "email" : t === "telephone" ? "tel" : "text";

export default function FicheClient({
  fiche,
  mode: modeInitial = "edition",
  onClose,
}: {
  fiche?: Account;
  /** « lecture » quand on ouvre la fiche d'un clic ; « edition » depuis le crayon ou une création. */
  mode?: "lecture" | "edition";
  onClose: () => void;
}) {
  const { accountFields, addAccount, saveAccount, getClient, setClientStage, updateClientFields, stages, addProjectContact, removeProjectContact, rafraichir } = useAdminData();
  const [mode, setMode] = useState<"lecture" | "edition">(fiche ? modeInitial : "edition");
  const [onglet, setOnglet] = useState("identite");
  const [origine, setOrigine] = useState<Prospect | null>(null);
  const [nbEchanges, setNbEchanges] = useState<number | null>(null);
  const [relire, setRelire] = useState(0);
  const [brouillon, setBrouillon] = useState<{ objet: string; corps: string; destinataire: string | null } | null>(null);
  const compter = useCallback((n: number) => setNbEchanges(n), []);
  const { user } = useAuth();
  const [enCours, setEnCours] = useState<"approfondir" | "pipeline" | null>(null);
  const [souci, setSouci] = useState<string | null>(null);

  /**
   * Approfondir un client, c'est approfondir la fiche d'origine : c'est elle qui porte
   * l'identité officielle, la note et le dossier commercial, et c'est elle que les
   * onglets de cette fenêtre affichent. Un client reste une entreprise à démarcher —
   * on lui reproposera une campagne.
   */
  const approfondir = async () => {
    if (!origine || enCours) return;
    setEnCours("approfondir");
    setSouci(null);
    try {
      await approfondirProspect(origine.id);
      const { data } = await supabaseAdmin.from("admin_prospects").select("*").eq("id", origine.id).maybeSingle();
      if (data) setOrigine(data as Prospect);
      toast.success("Fiche approfondie.");
    } catch (e) {
      setSouci(e instanceof Error ? e.message : "L’approfondissement a échoué.");
    } finally {
      setEnCours(null);
    }
  };

  /**
   * On s'est trompé de colonne. La fiche client ne part pas à la corbeille : elle
   * n'aurait jamais dû exister, on l'ANNULE. L'affaire, elle, continue sa vie au
   * Pipeline avec tout ce qu'on avait noté — la fonction en base rend les échanges
   * à l'affaire avant de détruire la fiche (migration 0040).
   */
  const remettreAuPipeline = async () => {
    if (!fiche?.clientId || !affaire || enCours) return;
    // On recule d'une seule étape : une affaire signée par erreur repart en
    // négociation, pas au tout début — le travail déjà fait reste visible.
    const colonnes = colonnesDe(stages, affaire.pipelineId);
    const i = colonnes.findIndex((e) => e.label === affaire.stage);
    const cible = i > 0 ? colonnes[i - 1].label : colonnes[0]?.label;
    if (!cible || cible === affaire.stage) return;
    if (
      !(await confirmer({
        titre: `Remettre ${fiche.name} au Pipeline ?`,
        message: `L’affaire repart à l’étape « ${cible} ». Cette fiche client disparaît — elle n’aurait pas dû être créée — et tout ce qui y a été noté retourne sur l’affaire.`,
        action: "Remettre au Pipeline",
      }))
    )
      return;
    setEnCours("pipeline");
    setSouci(null);
    try {
      // L'étape d'abord : si l'annulation échouait, l'affaire serait déjà sortie de
      // « signé », donc aucune fiche ne serait recréée dans son dos.
      setClientStage(fiche.clientId, cible);
      const { data: rendus, error } = await supabaseAdmin.rpc("annuler_fiche_client", { fiche: fiche.id });
      if (error) throw new Error(error.message);
      updateClientFields(fiche.clientId, { ficheClientCreee: false });
      toast.success(
        `${fiche.name} est repartie à l’étape « ${cible} »` +
          (typeof rendus === "number" && rendus > 0
            ? ` — ${rendus} action${rendus > 1 ? "s" : ""} rendue${rendus > 1 ? "s" : ""} à l’affaire.`
            : "."),
      );
      onClose();
    } catch (e) {
      const m = e instanceof Error ? e.message : "L’opération a échoué.";
      setSouci(
        /annuler_fiche_client|function .* does not exist/i.test(m)
          ? "Cette annulation attend la migration 0040 : collez-la dans le SQL Editor."
          : m,
      );
      setEnCours(null);
    }
  };

  /**
   * Merx écrit à un client qu'on connaît : il relit ce qui s'est passé avec eux et
   * part de l'intention dite dans l'intitulé. Sans intitulé, il n'a pas de sujet.
   */
  const ecrireAvecMerx = async (intention: string) => {
    if (!fiche) return;
    if (!intention) {
      toast.error("Écrivez d’abord ce que vous voulez leur dire, ou choisissez une proposition.");
      return;
    }
    try {
      setBrouillon(await redigerEmailClient(fiche.id, intention, user?.name ?? user?.email ?? ""));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Merx n’a pas pu écrire ce message.");
    }
  };

  /** L'affaire du Pipeline dont vient cette fiche : c'est elle qui porte l'identité complète. */
  const affaire = fiche?.clientId ? getClient(fiche.clientId) : undefined;

  const onglets: Onglet[] = [
    { cle: "identite", label: "Identité" },
    { cle: "approche", label: "Approche" },
    { cle: "action", label: "Action" },
    { cle: "suivi", label: "Historique", compte: nbEchanges },
  ];
  const [valeurs, setValeurs] = useState<Record<string, string>>(() => {
    if (!fiche) return { date_client: new Date().toISOString().slice(0, 10) };
    return {
      etablissement: fiche.name,
      date_client: fiche.signedOn ?? "",
      secteur: fiche.sector ?? "",
      ...fiche.data,
    };
  });

  /**
   * Le prospect dont vient cette fiche, s’il y en a un : c’est lui qui porte la note
   * et l’angle d’approche trouvés par Merx. Une fiche saisie à la main n’en a pas.
   */
  useEffect(() => {
    if (!fiche?.clientId) return;
    let vivant = true;
    void supabaseAdmin
      .from("admin_prospects")
      .select("*")
      .eq("converted_client_id", fiche.clientId)
      .maybeSingle()
      .then(({ data }) => {
        if (vivant && data) setOrigine(data as Prospect);
      });
    return () => {
      vivant = false;
    };
  }, [fiche?.clientId]);

  const clesHistorique = useMemo(
    () => ({ accountId: fiche?.id ?? null, clientId: fiche?.clientId ?? null, prospectId: origine?.id ?? null }),
    [fiche?.id, fiche?.clientId, origine?.id],
  );

  const jalons = useMemo<Jalon[]>(
    () =>
      ([
        fiche?.signedOn ? { libelle: "Entrée dans le fichier client", au: fiche.signedOn } : null,
        origine?.converted_at ? { libelle: "Passée au Pipeline", au: origine.converted_at } : null,
        origine?.enriched_at ? { libelle: "Fiche approfondie", au: origine.enriched_at } : null,
        origine ? { libelle: "Trouvée par Merx", au: origine.created_at } : null,
      ] as (Jalon | null)[]).filter((j): j is Jalon => j !== null),
    [fiche?.signedOn, origine],
  );

  const lire = (key: string) => valeurs[key] ?? "";
  const ecrire = (key: string, v: string) => setValeurs((prev) => ({ ...prev, [key]: v }));
  const nom = lire("etablissement").trim();

  const enregistrer = () => {
    if (!nom) return;
    const data: Record<string, string> = {};
    for (const f of accountFields) {
      if (f.key === "etablissement" || f.key === "date_client" || f.key === "secteur") continue;
      const v = lire(f.key).trim();
      if (v) data[f.key] = v;
    }
    const valeursFiche = {
      name: nom,
      signedOn: lire("date_client") || null,
      sector: lire("secteur").trim() || null,
      data,
    };
    if (fiche) saveAccount(fiche.id, valeursFiche);
    else addAccount(valeursFiche);
    toast.success(fiche ? "Fiche enregistrée" : `${nom} ajouté au fichier client`);
    onClose();
  };

  /** La fiche d'un client existant, en consultation : le même cadre que le prospect et l'affaire. */
  /** Ce que la fiche client et son affaire savent en plus de la fiche de prospection. */
  const ceQueSaitLeClient = [
    ...(affaire && !origine
      ? [
          ...(affaire.siren ? [{ label: "SIREN", valeur: affaire.siren }] : []),
          ...(affaire.effectif ? [{ label: "Effectif", valeur: affaire.effectif }] : []),
          ...(affaire.adresse ? [{ label: "Adresse", valeur: [affaire.adresse, affaire.codePostal, affaire.ville].filter(Boolean).join(" ") }] : []),
        ]
      : []),
    ...(affaire?.jours ? [{ label: "Journées vendues", valeur: String(affaire.jours) }] : []),
    ...(affaire?.depistes ? [{ label: "Dépistés", valeur: String(affaire.depistes) }] : []),
    ...(affaire?.orientes ? [{ label: "Orientés", valeur: String(affaire.orientes) }] : []),
    ...accountFields
      .filter((f) => f.key !== "etablissement" && lire(f.key).trim())
      .map((f) => {
        const v = lire(f.key).trim();
        const valeur =
          f.type === "date" && !Number.isNaN(new Date(v).getTime()) ? (
            new Date(v).toLocaleDateString("fr-FR")
          ) : f.type === "email" ? (
            <a href={`mailto:${v}`} className="text-avisdoc-teal underline-offset-2 hover:underline">{v}</a>
          ) : f.type === "telephone" ? (
            <a href={`tel:${v.replace(/\s/g, "")}`} className="text-avisdoc-teal underline-offset-2 hover:underline">{v}</a>
          ) : f.type === "lien" ? (
            <a href={v} target="_blank" rel="noreferrer" className="text-avisdoc-teal underline-offset-2 hover:underline">{v}</a>
          ) : (
            <span className="whitespace-pre-wrap break-words">{v}</span>
          );
        return { label: f.label, valeur };
      }),
  ];
  const contactsSaisis = (affaire?.contacts ?? []).map((c) => ({
    id: c.id,
    nom: c.name || [c.prenom, c.nom].filter(Boolean).join(" "),
    fonction: c.role && c.role !== "Contact" ? c.role : null,
    email: c.email && c.email !== "—" ? c.email : null,
    telephone: c.tel && c.tel !== "—" ? c.tel : null,
  }));
  const interlocuteurs = [...contactsSaisis, ...personnesDuProspect(origine, contactsSaisis)];

  /** Supprimer depuis la fiche, comme depuis la liste : confirmé, puis corbeille. */
  const supprimer = async () => {
    if (!fiche) return;
    if (!(await confirmer({ titre: `Supprimer ${fiche.name} ?`, message: `Elle quitte le fichier client. Vous la retrouverez ${JOURS_DE_GARDE} jours dans la corbeille.` }))) return;
    try {
      await jeter("client", [fiche.id]);
      await rafraichir();
      onClose();
    } catch (e) {
      setSouci(e instanceof Error ? e.message : "La suppression a échoué.");
    }
  };

  if (fiche && mode === "lecture") {
    return (
      <>
      <FicheEntreprise
        titre={fiche.name}
        sousTitre={
          [fiche.sector, fiche.signedOn ? `client depuis le ${new Date(fiche.signedOn).toLocaleDateString("fr-FR")}` : null]
            .filter(Boolean)
            .join(" · ") || "Fiche client"
        }
        notes={notesDe(origine)}
        referent={<ChoixReferent quoi="client" id={fiche.id} />}
        enHaut={
          <>
          <button
            type="button"
            onClick={() => setMode("edition")}
            className="inline-flex items-center gap-1.5 rounded-full border border-border px-4 py-2 text-[12.5px] font-bold text-avisdoc-ink transition-colors hover:border-avisdoc-teal"
          >
            <Pencil className="size-3.5" /> Modifier
          </button>
          <button
            type="button"
            onClick={() => void supprimer()}
            className="inline-flex items-center gap-1.5 rounded-full border border-rose-200 px-4 py-2 text-[12.5px] font-bold text-rose-700 transition-colors hover:border-rose-400"
          >
            <Trash2 className="size-3.5" /> Supprimer
          </button>
          </>
        }
        identite={<LigneIdentite prospect={origine} siren={affaire?.siren} adresse={affaire?.adresse} />}
        actions={
          <BoutonsFiche
            etape={
              /* Une signature par erreur se défait : l'affaire repart au Pipeline. */
              fiche.clientId && affaire ? (
                <button
                  type="button"
                  onClick={() => void remettreAuPipeline()}
                  disabled={enCours !== null}
                  className="inline-flex items-center gap-1.5 rounded-full border border-border px-5 py-2.5 text-sm font-bold text-muted-foreground transition-colors hover:border-avisdoc-coral hover:text-avisdoc-coral disabled:opacity-60"
                >
                  {enCours === "pipeline" ? <Loader2 className="size-4 animate-spin" /> : <Undo2 className="size-4" />}
                  Remettre au Pipeline
                </button>
              ) : undefined
            }
            approfondie={Boolean(origine?.enriched_at)}
            onApprofondir={() =>
              origine ? void approfondir() : setSouci("Cette fiche client n’est pas passée par Merx : il n’a rien à approfondir.")
            }
            // Un client s'écrit à partir de ce qu'on veut lui dire : cela se choisit dans Action.
            onEcrire={() => setOnglet("action")}
            enCours={enCours}
          />
        }
        message={
          souci ? <p className="mt-2 rounded-xl bg-rose-50 px-3.5 py-2.5 text-[12.5px] font-semibold text-rose-700">{souci}</p> : undefined
        }
        avancement={etapesDeVie({
          trouveeLe: origine?.created_at ?? null,
          approfondieLe: origine?.enriched_at ?? null,
          pipeline: affaire ? { colonne: affaire.stage, au: origine?.converted_at ?? null } : null,
          client: { au: fiche.signedOn },
        })}
        onglets={onglets}
        actif={onglet}
        onOnglet={setOnglet}
        onClose={onClose}
      >
        {onglet === "identite" && (
        <div>
        <ResumeNotes cles={clesHistorique} />
        <CeQuOnSait prospect={origine} enPlus={ceQueSaitLeClient} />
        <Interlocuteurs
          personnes={interlocuteurs}
          onAjouter={affaire ? (x) => addProjectContact(affaire.id, x) : undefined}
          onRetirer={affaire ? (id) => removeProjectContact(affaire.id, id) : undefined}
        />
        </div>
        )}

        {onglet === "action" && (
          <div>
            <ActionsFiche
              cles={{ accountId: fiche?.id ?? null }}
              suggestions={SUGGESTIONS}
              onEcrireAvecMerx={fiche ? ecrireAvecMerx : undefined}
              onFait={() => setRelire((n) => n + 1)}
              relire={relire}
            />
            {/* Ce qui arrive avec la signature : l'espace client et les journées. */}
            {affaire && (
              <div className="mt-5 space-y-4">
                <EspaceClientCard bare clientId={affaire.id} clientName={affaire.company} />
                <RendezVousCard bare clientId={affaire.id} />
              </div>
            )}
          </div>
        )}

        {onglet === "approche" && (
          <ApprocheEntreprise origine={origine} />
        )}

        {onglet === "suivi" && (
          <div>
            {/* Tout le fil de l'entreprise : avant d'être cliente, elle a été prospect puis affaire. */}
            <FilEchanges cles={clesHistorique} jalons={jalons} onCompte={compter} rafraichir={relire} />
          </div>
        )}
      </FicheEntreprise>
      {brouillon && (
        <BrouillonEmail
          nom={fiche.name}
          objet={brouillon.objet}
          corps={brouillon.corps}
          destinataire={brouillon.destinataire}
          onClose={() => setBrouillon(null)}
        />
      )}
      </>
    );
  }

  return (
    <>
    <Modal onClose={onClose} width={520}>
      <div className="mb-5 flex items-start justify-between gap-4">
        <div>
          <h2 className="font-display text-xl font-semibold text-avisdoc-ink">
            {fiche ? fiche.name : "Nouveau client"}
          </h2>
          <p className="mt-1 text-[13px] text-muted-foreground">
            {!fiche
              ? "Seul l’établissement est nécessaire ; le reste peut se remplir plus tard."
              : "Modifiez ce qu’il faut, puis enregistrez."}
          </p>
        </div>
        <button type="button" onClick={onClose} aria-label="Fermer" className="rounded-lg p-1.5 text-muted-foreground hover:text-avisdoc-ink">
          <X className="size-5" />
        </button>
      </div>

      {(
        <div className="max-h-[52vh] space-y-3 overflow-y-auto pr-1">
        {accountFields.map((f) => (
          <label key={f.id} className="block">
            <span className="mb-1 block text-[12.5px] font-semibold text-avisdoc-ink">
              {f.label}
              {f.key === "etablissement" && <span className="ml-1 text-avisdoc-coral">*</span>}
            </span>
            {f.type === "multiligne" ? (
              <textarea
                rows={3}
                value={lire(f.key)}
                onChange={(e) => ecrire(f.key, e.target.value)}
                className={cn(champCls, "resize-none")}
              />
            ) : (
              <input
                type={inputType(f.type)}
                value={lire(f.key)}
                onChange={(e) => ecrire(f.key, e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && enregistrer()}
                autoFocus={f.key === "etablissement"}
                className={champCls}
              />
            )}
          </label>
        ))}
        </div>
      )}

      <div className="mt-5 flex gap-2 border-t border-border pt-4">
        {(
          <>
            <button
              type="button"
              onClick={enregistrer}
              disabled={!nom}
              className="ad-btn-accent inline-flex items-center gap-1.5 rounded-full bg-avisdoc-teal px-5 py-2.5 text-sm font-bold text-white disabled:opacity-50"
            >
              Enregistrer
            </button>
            <button
              type="button"
              onClick={onClose}
              className="rounded-full border border-border px-5 py-2.5 text-sm font-bold text-muted-foreground transition-colors hover:border-avisdoc-ink hover:text-avisdoc-ink"
            >
              Annuler
            </button>
          </>
        )}
      </div>
    </Modal>
    {/* Après la fiche dans la page : à niveau égal, c'est le dernier rendu qui passe devant. */}
    {brouillon && fiche && (
      <BrouillonEmail
        nom={fiche.name}
        objet={brouillon.objet}
        corps={brouillon.corps}
        destinataire={brouillon.destinataire}
        onClose={() => setBrouillon(null)}
      />
    )}
    </>
  );
}
