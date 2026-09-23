// Fiche client : consultation, modification et création, bâties sur les colonnes du fichier.
// On ne modifie jamais une information par mégarde : un clic OUVRE la fiche, le crayon la rend modifiable.

import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Loader2, Pencil, Sparkles, Undo2, X } from "lucide-react";
import type { Account, AccountField } from "../../types";
import { useAdminData } from "../../data/AdminDataContext";
import { supabaseAdmin } from "../../data/supabaseAdmin";
import { Modal, SectionLabel } from "../../components/ui";
import ChoixReferent from "../../components/ChoixReferent";
import Onglets, { type Onglet } from "../../components/Onglets";
import FilEchanges from "../../components/FilEchanges";
import ActionsFiche from "../../components/ActionsFiche";
import DossierCommercial, { dossierRempli } from "../../components/DossierCommercial";
import BrouillonEmail from "../prospects/BrouillonEmail";
import { approfondirProspect, redigerEmailClient } from "../../lib/merx-appels";
import { confirmer } from "../../components/Confirmation";
import { useAuth } from "../../auth/AuthContext";
import type { GenreEchange } from "../../lib/echanges";
import type { Jalon } from "../../lib/echanges";
import type { Prospect } from "../../lib/merx";
import NoteDetaillee from "../prospects/NoteDetaillee";
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
  const { accountFields, addAccount, saveAccount, getClient, setClientStage, updateClientFields, stages } = useAdminData();
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
    const i = stages.findIndex((e) => e.label === affaire.stage);
    const cible = i > 0 ? stages[i - 1].label : stages[0]?.label;
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

  return (
    <>
    <Modal onClose={onClose} width={mode === "lecture" ? 820 : 520}>
      <div className="mb-5 flex items-start justify-between gap-4">
        <div>
          <h2 className="font-display text-xl font-semibold text-avisdoc-ink">
            {fiche ? fiche.name : "Nouveau client"}
          </h2>
          <p className="mt-1 text-[13px] text-muted-foreground">
            {!fiche
              ? "Seul l’établissement est nécessaire ; le reste peut se remplir plus tard."
              : mode === "lecture"
                ? [fiche.sector, fiche.signedOn ? `client depuis le ${new Date(fiche.signedOn).toLocaleDateString("fr-FR")}` : null]
                    .filter(Boolean)
                    .join(" · ") || "Fiche client"
                : "Modifiez ce qu’il faut, puis enregistrez."}
          </p>
          {/* Hors des onglets : on doit voir qui suit ce client en ouvrant la fiche. */}
          {fiche && mode === "lecture" && <ChoixReferent quoi="client" id={fiche.id} className="mt-2.5" />}
        </div>
        <button type="button" onClick={onClose} aria-label="Fermer" className="rounded-lg p-1.5 text-muted-foreground hover:text-avisdoc-ink">
          <X className="size-5" />
        </button>
      </div>

      {mode === "lecture" ? (
        /* ── Consultation : trois onglets, aucun champ de saisie ── */
        <div className="overflow-hidden rounded-2xl border border-border">
        <Onglets onglets={onglets} actif={onglet} onChange={setOnglet} />

        <div className="p-4">
        {onglet === "identite" && (
        <div className="max-h-[52vh] overflow-y-auto">
        {/* Ce que l'affaire du Pipeline a établi. La fiche client ne le recopie pas :
            elle le montre à sa source, pour qu'une correction là-bas se voie ici. */}
        {affaire && (
          <div className="mb-3 rounded-2xl border border-l-4 border-border border-l-avisdoc-teal p-4">
            <SectionLabel>Ce qu’on sait d’eux</SectionLabel>
            <div className="mt-2 grid gap-x-6 gap-y-1.5 sm:grid-cols-2">
              {[
                ["SIREN", affaire.siren],
                ["Effectif", affaire.effectif],
                ["Adresse", [affaire.adresse, affaire.codePostal, affaire.ville].filter(Boolean).join(" ")],
                ["Journées vendues", affaire.jours ? String(affaire.jours) : ""],
                ["Dépistés", affaire.depistes ? String(affaire.depistes) : ""],
                ["Orientés", affaire.orientes ? String(affaire.orientes) : ""],
              ]
                .filter(([, v]) => v)
                .map(([label, v]) => (
                  <div key={label} className="flex gap-2 text-[13px]">
                    <span className="shrink-0 text-muted-foreground">{label}</span>
                    <span className="min-w-0 break-words font-semibold text-avisdoc-ink">{v}</span>
                  </div>
                ))}
            </div>
            {affaire.contacts.length > 0 && (
              <div className="mt-3 border-t border-border pt-2.5">
                <SectionLabel>Interlocuteur{affaire.contacts.length > 1 ? "s" : ""}</SectionLabel>
                <div className="mt-1.5 space-y-1">
                  {affaire.contacts.map((c) => (
                    <div key={c.id} className="text-[13px] text-avisdoc-ink">
                      <span className="font-semibold">{[c.prenom, c.nom].filter(Boolean).join(" ")}</span>
                      {c.role && <span className="text-muted-foreground"> · {c.role}</span>}
                      {c.email && (
                        <a href={`mailto:${c.email}`} className="ml-2 text-avisdoc-teal underline-offset-2 hover:underline">
                          {c.email}
                        </a>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
        <div className="divide-y divide-border">
          {accountFields.map((f) => {
            const v = lire(f.key).trim();
            const affichee =
              v && f.type === "date" && !Number.isNaN(new Date(v).getTime())
                ? new Date(v).toLocaleDateString("fr-FR")
                : v;
            return (
              <div key={f.id} className="flex gap-3 px-4 py-2.5">
                <div className="w-40 shrink-0 text-[12.5px] text-muted-foreground">{f.label}</div>
                <div className={cn("min-w-0 flex-1 whitespace-pre-wrap break-words text-[13px]", affichee ? "text-avisdoc-ink" : "text-muted-foreground/50")}>
                  {affichee
                    ? f.type === "email"
                      ? <a href={`mailto:${affichee}`} className="text-avisdoc-teal underline-offset-2 hover:underline">{affichee}</a>
                      : f.type === "telephone"
                        ? <a href={`tel:${affichee.replace(/\s/g, "")}`} className="text-avisdoc-teal underline-offset-2 hover:underline">{affichee}</a>
                        : f.type === "lien"
                          ? <a href={affichee} target="_blank" rel="noreferrer" className="text-avisdoc-teal underline-offset-2 hover:underline">{affichee}</a>
                          : affichee
                    : "—"}
                </div>
              </div>
            );
          })}
        </div>
        </div>
        )}

        {onglet === "action" && (
          <div className="max-h-[52vh] overflow-y-auto pr-1">
            <ActionsFiche
              cles={{ accountId: fiche?.id ?? null }}
              suggestions={SUGGESTIONS}
              onEcrireAvecMerx={fiche ? ecrireAvecMerx : undefined}
              onFait={() => setRelire((n) => n + 1)}
              relire={relire}
            />
          </div>
        )}

        {onglet === "approche" && (
          <div className="max-h-[52vh] overflow-y-auto pr-1">
            {origine ? (
              <>
                {/* Approfondir vaut aussi pour un client : les effectifs changent, les
                    dirigeants aussi, et le dossier sert à reproposer une campagne. */}
                <div className="mb-4 flex flex-wrap items-center gap-2 rounded-2xl border border-border p-3">
                  <button
                    type="button"
                    onClick={() => void approfondir()}
                    disabled={enCours !== null}
                    className="ad-btn-outline inline-flex items-center gap-1.5 rounded-full border-[1.5px] border-border px-4 py-2 text-[12.5px] font-bold text-avisdoc-ink transition-colors hover:border-avisdoc-teal disabled:cursor-wait disabled:opacity-60"
                  >
                    {enCours === "approfondir" ? <Loader2 className="size-3.5 animate-spin" /> : <Sparkles className="size-3.5" />}
                    {enCours === "approfondir"
                      ? "Merx cherche… une bonne minute"
                      : dossierRempli(origine.dossier)
                        ? "Approfondir à nouveau"
                        : "Approfondir"}
                  </button>
                  <span className="min-w-0 flex-1 text-[12px] leading-snug text-muted-foreground">
                    {dossierRempli(origine.dossier)
                      ? "Remet à jour l’identité officielle, l’effectif et le dossier commercial."
                      : "Va chercher l’identité officielle, l’effectif, les dirigeants, et monte le dossier commercial."}
                  </span>
                </div>
                {souci && (
                  <p className="mb-3 rounded-xl bg-rose-50 px-3.5 py-2.5 text-[12.5px] font-semibold text-rose-700">{souci}</p>
                )}
                {dossierRempli(origine.dossier) && <DossierCommercial dossier={origine.dossier} />}
                {origine.rationale && (
                  <div className="mb-4 rounded-2xl border border-l-4 border-border border-l-avisdoc-teal p-4">
                    <SectionLabel>Pourquoi c’était un bon prospect</SectionLabel>
                    <p className="mt-1.5 text-[13.5px] leading-relaxed text-avisdoc-ink">{origine.rationale}</p>
                    {origine.approach && (
                      <p className="mt-3 text-[13.5px] leading-relaxed text-avisdoc-ink">
                        <span className="font-semibold">Angle d’approche : </span>
                        {origine.approach}
                      </p>
                    )}
                  </div>
                )}
                <SectionLabel>La note, critère par critère</SectionLabel>
                <div className="mt-2">
                  <NoteDetaillee total={origine.score_total} score={origine.score ?? {}} />
                </div>
              </>
            ) : (
              <p className="py-6 text-[13px] text-muted-foreground">
                Cette fiche n’est pas venue de Merx : elle n’a ni note ni angle d’approche. Les fiches issues de la
                prospection gardent ici ce que Merx avait trouvé.
              </p>
            )}
          </div>
        )}

        {onglet === "suivi" && (
          <div className="max-h-[52vh] overflow-y-auto pr-1">
            <FilEchanges cles={{ accountId: fiche?.id ?? null }} jalons={jalons} onCompte={compter} rafraichir={relire} />
          </div>
        )}
        </div>
        </div>
      ) : (
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
        {mode === "lecture" ? (
          <>
            <button
              type="button"
              onClick={() => setMode("edition")}
              className="ad-btn-accent inline-flex items-center gap-1.5 rounded-full bg-avisdoc-teal px-5 py-2.5 text-sm font-bold text-white"
            >
              <Pencil className="size-4" /> Modifier
            </button>
            {/* Une signature par erreur se défait : l'affaire repart au Pipeline et
                la fiche client va à la corbeille, d'où elle revient si besoin. */}
            {fiche?.clientId && affaire && (
              <button
                type="button"
                onClick={() => void remettreAuPipeline()}
                disabled={enCours !== null}
                className="inline-flex items-center gap-1.5 rounded-full border border-border px-4 py-2.5 text-sm font-bold text-muted-foreground transition-colors hover:border-avisdoc-coral hover:text-avisdoc-coral disabled:opacity-60"
              >
                {enCours === "pipeline" ? <Loader2 className="size-4 animate-spin" /> : <Undo2 className="size-4" />}
                Remettre au Pipeline
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              className="rounded-full border border-border px-5 py-2.5 text-sm font-bold text-muted-foreground transition-colors hover:border-avisdoc-ink hover:text-avisdoc-ink"
            >
              Fermer
            </button>
          </>
        ) : (
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
