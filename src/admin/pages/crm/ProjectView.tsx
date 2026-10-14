import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { useSearchParams } from "react-router-dom";
import { Loader2, Lock, Minus, Pencil, Plus, Search, Trash2, X } from "lucide-react";
import type { Client, Stage } from "../../types";
import { euro, splitAdresse, joinAdresse } from "../../lib/format";
import { DOC_EXT, PROPO_STATUTS, TONES, colonnesDe, stageMeta, stageRank } from "../../lib/ui-tokens";
import { useAdminData } from "../../data/AdminDataContext";
import { Badge, Modal } from "../../components/ui";
import EspaceClientCard from "../../espace/EspaceClientCard";
import RendezVousCard from "../../espace/RendezVousCard";
import DevisQonto from "../../espace/DevisQonto";
import QontoTag from "../../espace/QontoTag";
import JournalCard from "../../espace/JournalCard";
import { useAuth } from "../../auth/AuthContext";
import { supabaseAdmin } from "../../data/supabaseAdmin";
import BrouillonEmail from "../prospects/BrouillonEmail";
import type { Jalon } from "../../lib/echanges";
import { SECTEURS } from "../../lib/merx";
import type { Prospect } from "../../lib/merx";
import { approfondirProspect, redigerEmailProspect, type BrouillonRendu } from "../../lib/merx-appels";
import FicheEntreprise from "../../components/FicheEntreprise";
import CeQuOnSait from "../../components/fiche/CeQuOnSait";
import Interlocuteurs from "../../components/fiche/Interlocuteurs";
import ApprocheEntreprise from "../../components/fiche/ApprocheEntreprise";
import LigneIdentite from "../../components/fiche/LigneIdentite";
import { notesDe, personnesDuProspect } from "../../lib/fiche";
import ColonneEntreprise, { etablissementDe } from "../../components/fiche/ColonneEntreprise";
import PlacePipeline from "../../components/fiche/PlacePipeline";
import OngletActions from "../../components/fiche/OngletActions";
import { quandCourt } from "../../lib/actions-fiche";
import { cn } from "@/lib/utils";
import ChoixReferent from "../../components/ChoixReferent";
import { confirmer } from "../../components/Confirmation";
import { jeter, JOURS_DE_GARDE } from "../../lib/corbeille";

const inputCls =
  "ad-input w-full rounded-xl border border-border bg-muted/50 px-3.5 py-2.5 text-[13px] outline-none transition-colors focus:border-avisdoc-teal";

/** Ce qu'une étape retient encore, dit une seule fois. */
function Verrouille({ etape, fonctions }: { etape: string; fonctions: string }) {
  return (
    <section className="mt-5 flex items-center gap-2.5 rounded-2xl border border-border px-4 py-3.5 first:mt-0">
      <Lock className="size-4 shrink-0 text-muted-foreground/60" />
      <p className="text-[13px] text-muted-foreground">
        {fonctions} se débloquent à l’étape <span className="font-semibold text-avisdoc-ink">{etape}</span>.
      </p>
    </section>
  );
}

/** Un bloc à l'intérieur d'un onglet : plusieurs fonctions tiennent dans le même. */
function Bloc({ titre, verrou, children }: { titre?: string; verrou?: string | null; children: ReactNode }) {
  return (
    <section className="mt-5 first:mt-0">
      {titre && <div className="mb-2 text-[11px] font-bold uppercase tracking-[0.06em] text-muted-foreground">{titre}</div>}
      {verrou ? (
        <div className="flex items-center gap-2 rounded-2xl border border-border px-4 py-3 text-[13px] text-muted-foreground">
          <Lock className="size-4 shrink-0 text-muted-foreground/60" /> {verrou}
        </div>
      ) : (
        children
      )}
    </section>
  );
}

export default function ProjectView({
  client,
  onClose,
}: {
  client: Client;
  onClose: () => void;
}) {
  const {
    updateClientFields,
    addProjectContact,
    removeProjectContact,
    addProjectDoc,
    removeProjectDoc,
    stages: toutesColonnes,
    pipelines,
    accounts,
    addAccount,
    setClientStage,
    rafraichir,
  } = useAdminData();
  const { user } = useAuth();
  const [souciSuppression, setSouciSuppression] = useState<string | null>(null);

  const supprimer = async () => {
    if (!(await confirmer({ titre: `Supprimer ${client.company} ?`, message: `Vous la retrouverez ${JOURS_DE_GARDE} jours dans la corbeille.` }))) return;
    try {
      await jeter("affaire", [client.id]);
      await rafraichir();
      onClose();
    } catch (e) {
      setSouciSuppression(e instanceof Error ? e.message : "La suppression a échoué.");
    }
  };
  // Les colonnes du tableau où vit l'affaire : celles des autres ne la concernent pas.
  const stages = colonnesDe(toutesColonnes, client.pipelineId);

  // « ?modifier=1 » : le crayon d'une carte ouvre la fiche prête à être corrigée.
  const [chercheur] = useSearchParams();
  const [editing, setEditing] = useState(chercheur.get("modifier") === "1");
  const [draft, setDraft] = useState({ company: "", siren: "", naf: "", rue: "", cp: "", ville: "", pipelineId: "", stage: "", secteur: "", referent: "", aRepondu: false });
  const [ndName, setNdName] = useState("");

  const total = client.jours * client.tarif;

  // Déblocage par étape : une fonction verrouillée tant que l'étape minimale
  // requise n'est pas atteinte.
  // Rang d'une étape dans le parcours, d'après les colonnes de l'équipe.
  // Une colonne supprimée ou renommée rend -1 : on ne verrouille alors rien.
  const ficheClient = accounts.find((a) => a.clientId === client.id);
  const cur = stageRank(client.stage, stages);
  const verrou = (min: Stage) => {
    const rang = stageRank(min, stages);
    return rang >= 0 && cur >= 0 && cur < rang;
  };

  const [origine, setOrigine] = useState<Prospect | null>(null);
  const [nbAVenir, setNbAVenir] = useState(0);
  const compter = useCallback((n: number) => setNbAVenir(n), []);
  const [merxEnCours, setMerxEnCours] = useState<"approfondir" | "email" | null>(null);
  const [merxErreur, setMerxErreur] = useState<string | null>(null);
  const [brouillon, setBrouillon] = useState<BrouillonRendu | null>(null);
  /** Change de valeur après une action : l'historique se relit. */
  const [relire, setRelire] = useState(0);

  // Les onglets de la fiche « façon Onetip » : Actions, Dossier, et Devis (12/10).
  const [tab, setTab] = useState("actions");

  /** Le prospect d’où vient l’affaire : il porte la note et l’angle d’approche. */
  const chargerOrigine = useCallback(async () => {
    const { data } = await supabaseAdmin.from("admin_prospects").select("*").eq("converted_client_id", client.id).maybeSingle();
    setOrigine((data as Prospect) ?? null);
  }, [client.id]);

  useEffect(() => {
    void chargerOrigine();
  }, [chargerOrigine]);


  /** Ce que l'affaire sait en plus de sa fiche de prospection, ou tout, si elle n'en a pas. */
  const ceQueSaitLAffaire = [
    ...(!origine && client.siren ? [{ label: "SIREN", valeur: client.siren }] : []),
    ...(client.naf && !origine?.activity ? [{ label: "Activité", valeur: client.naf }] : []),
    ...(client.adresse && !origine?.head_office?.address ? [{ label: "Adresse", valeur: client.adresse }] : []),
    ...(client.effectif && !origine?.headcount_band ? [{ label: "Effectif", valeur: client.effectif }] : []),
  ];
  /** Les interlocuteurs saisis sur l'affaire, puis ceux que Merx avait trouvés. */
  const contactsSaisis = client.contacts.map((pc) => ({
    id: pc.id,
    nom: pc.name,
    fonction: pc.role && pc.role !== "Contact" ? pc.role : null,
    email: pc.email && pc.email !== "—" ? pc.email : null,
    telephone: pc.tel && pc.tel !== "—" ? pc.tel : null,
  }));
  const interlocuteurs = [...contactsSaisis, ...personnesDuProspect(origine, contactsSaisis)];

  const clesHistorique = useMemo(() => ({ clientId: client.id, prospectId: origine?.id ?? null }), [client.id, origine?.id]);

  const jalons = useMemo<Jalon[]>(
    () =>
      ([
        origine ? { libelle: "Trouvée par Merx", au: origine.created_at } : null,
        origine?.enriched_at ? { libelle: "Fiche approfondie", au: origine.enriched_at } : null,
        origine?.converted_at ? { libelle: "Passée au Pipeline", au: origine.converted_at } : null,
      ] as (Jalon | null)[]).filter((j): j is Jalon => j !== null),
    [origine],
  );

  /**
   * Une affaire saisie à la main n'a pas de fiche chez Merx : on lui en ouvre une,
   * rattachée à l'affaire, puis on lance l'approfondissement. Merx travaille alors
   * dessus comme sur n'importe quelle entreprise qu'il aurait trouvée lui-même.
   */
  const confierAMerx = async () => {
    if (merxEnCours) return;
    setMerxEnCours("approfondir");
    setMerxErreur(null);
    try {
      // Merx connaît peut-être déjà cette entreprise : on regarde AVANT d'insérer,
      // plutôt que de deviner à partir d'une erreur de contrainte.
      const { data: connue } = await supabaseAdmin
        .from("admin_prospects")
        .select("id, converted_client_id, deleted_at, city")
        .ilike("name", client.company.trim())
        .maybeSingle();

      let prospectId: string;

      if (connue) {
        const dejaAilleurs = connue.converted_client_id && connue.converted_client_id !== client.id;
        if (dejaAilleurs) {
          throw new Error(
            "Merx a déjà une fiche pour cette entreprise, rattachée à une autre affaire du Pipeline. " +
              "Il s’agit probablement d’un doublon : gardez celle qui porte la fiche et supprimez l’autre.",
          );
        }
        // Libre, ou déjà à nous : on la reprend, et on la sort de la corbeille au besoin.
        const { error } = await supabaseAdmin
          .from("admin_prospects")
          .update({ converted_client_id: client.id, converted_at: new Date().toISOString(), deleted_at: null })
          .eq("id", connue.id);
        if (error) throw new Error(error.message);
        prospectId = connue.id as string;
      } else {
        const { data, error } = await supabaseAdmin
          .from("admin_prospects")
          .insert({
            owner_email: user?.email ?? "",
            name: client.company,
            city: client.ville || null,
            department: (client.codePostal ?? "").slice(0, 2) || null,
            siren: client.siren || null,
            converted_client_id: client.id,
            converted_at: new Date().toISOString(),
            status: "a_contacter",
          })
          .select("id")
          .single();
        if (error) throw new Error(error.message);
        prospectId = data.id as string;
      }

      await approfondirProspect(prospectId);
      await chargerOrigine();
    } catch (e) {
      setMerxErreur(e instanceof Error ? e.message : "Merx n’a pas répondu.");
    } finally {
      setMerxEnCours(null);
    }
  };

  const demanderAMerx = async (quoi: "approfondir" | "email") => {
    if (!origine || merxEnCours) return;
    setMerxEnCours(quoi);
    setMerxErreur(null);
    try {
      if (quoi === "approfondir") {
        await approfondirProspect(origine.id);
        await chargerOrigine();
      } else {
        setBrouillon(await redigerEmailProspect(origine.id, user?.name ?? user?.email ?? ""));
      }
    } catch (e) {
      setMerxErreur(e instanceof Error ? e.message : "Merx n’a pas répondu.");
    } finally {
      setMerxEnCours(null);
    }
  };

  // Arriver par le crayon d'une carte ouvre le formulaire : il doit être rempli.
  useEffect(() => {
    if (chercheur.get("modifier") === "1") startEdit();
    // Une seule fois, à l'ouverture de la fiche.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [client.id]);

  const startEdit = () => {
    // Prérempli : CP / ville depuis les colonnes dédiées, à défaut découpage de l'adresse.
    const p = splitAdresse(client.adresse);
    setDraft({
      company: client.company, siren: client.siren, naf: client.naf,
      rue: p.rue, cp: client.codePostal || p.cp, ville: client.ville || p.ville,
      pipelineId: client.pipelineId, stage: client.stage, secteur: client.secteur ?? "",
      referent: client.referent ?? "", aRepondu: Boolean(client.aRepondu),
    });
    setEditing(true);
  };
  const saveEdit = () => {
    updateClientFields(client.id, {
      company: draft.company, siren: draft.siren, naf: draft.naf,
      adresse: joinAdresse(draft.rue, draft.cp, draft.ville),
      codePostal: draft.cp.trim(), ville: draft.ville.trim(),
      // Changer de tableau, c'est aussi changer de colonne : celles d'un pipeline
      // n'existent pas dans l'autre. Le menu ci-dessous ne propose jamais une
      // colonne qui n'appartient pas au pipeline retenu.
      pipelineId: draft.pipelineId, stage: draft.stage, secteur: draft.secteur || null,
      referent: draft.referent || null,
      // Envoyée seulement si elle change : la colonne naît avec la migration 0065.
      ...(draft.aRepondu !== Boolean(client.aRepondu) ? { aRepondu: draft.aRepondu } : {}),
    });
    setEditing(false);
  };

  /** Les colonnes du pipeline en cours de sélection dans le formulaire. */
  const colonnesDuBrouillon = colonnesDe(toutesColonnes, draft.pipelineId);

  /**
   * Changer de pipeline repose l'affaire sur la première colonne du nouveau.
   *
   * Et si ce pipeline est assigné à quelqu'un, l'affaire lui revient : avoir à le
   * redire dans un second menu, c'était deux fois la même information.
   */
  const choisirPipeline = (id: string) => {
    const cible = pipelines.find((pl) => pl.id === id);
    setDraft({
      ...draft,
      pipelineId: id,
      stage: colonnesDe(toutesColonnes, id)[0]?.label ?? draft.stage,
      referent: cible?.assigneA ?? draft.referent,
    });
  };

  const submitDoc = () => {
    if (!ndName.trim()) return;
    addProjectDoc(client.id, ndName);
    setNdName("");
  };

  const btnOutline =
    "ad-btn-outline inline-flex items-center gap-1.5 rounded-full border-[1.5px] border-border px-4 py-2 text-[12.5px] font-bold text-avisdoc-ink transition-colors";
  const btnAccent = "ad-btn-accent rounded-full bg-avisdoc-teal text-[12.5px] font-bold text-white";

  return (
    <>
      <FicheEntreprise
        colonne={
          <ColonneEntreprise
            titre={client.company}
            sousTitre={[origine?.activity ?? client.naf, [client.ville, origine?.department ? `(${origine.department})` : ""].filter(Boolean).join(" ")].filter(Boolean).join(" · ") || "—"}
            identite={<LigneIdentite prospect={origine} siren={client.siren} adresse={client.adresse} />}
            notes={notesDe(origine)}
            place={
              <PlacePipeline
                pipelines={pipelines}
                stages={toutesColonnes}
                pipelineId={client.pipelineId}
                colonne={client.stage}
                onChoisir={(s) => setClientStage(client.id, s)}
              />
            }
            referent={
              <div className="flex flex-wrap items-center gap-2">
                {/* Qui suit cette affaire. Le choix descend tout seul sur la fiche client le jour où elle est signée. */}
                <ChoixReferent quoi="affaire" id={client.id} />
                <QontoTag clientId={client.id} />
                {client.aRepondu && <Badge className="bg-emerald-100 text-emerald-700">A répondu</Badge>}
              </div>
            }
            inscrite={origine ? `Trouvée le ${quandCourt(origine.created_at)} par Merx` : null}
            interlocuteurs={
              <Interlocuteurs
                personnes={interlocuteurs}
                onAjouter={(x) => addProjectContact(client.id, x)}
                onRetirer={(id) => removeProjectContact(client.id, id)}
              />
            }
            etablissement={origine ? etablissementDe(origine).lignes : ceQueSaitLAffaire}
            manquants={origine ? etablissementDe(origine).manquants : []}
            onCompleter={startEdit}
          />
        }
        onglets={[
          { cle: "actions", label: nbAVenir ? `Actions · ${nbAVenir} à venir` : "Actions" },
          { cle: "dossier", label: "Dossier", etoile: Boolean(origine?.enriched_at) },
          { cle: "devis", label: "Devis" },
        ]}
        actif={tab}
        onOnglet={setTab}
        enHaut={
          <button type="button" onClick={startEdit} className={btnOutline}>
            <Pencil className="size-3.5" /> Modifier la fiche
          </button>
        }
        message={
          merxErreur ? <p className="rounded-xl bg-rose-50 px-3.5 py-2.5 text-[12.5px] font-semibold text-rose-700">{merxErreur}</p> : undefined
        }
        onClose={onClose}
      >
          {/* Toujours monté : le compte des actions à venir reste juste sur les autres onglets. */}
          <div className={tab === "actions" ? "" : "hidden"}>
            <OngletActions
              cles={clesHistorique}
              personnes={interlocuteurs.map((q) => q.nom)}
              etape={{ actuelle: client.stage, colonnes: stages.map((s) => s.label) }}
              jalons={jalons}
              avancer={async (s) => setClientStage(client.id, s)}
              onEcrireAvecMerx={origine ? () => demanderAMerx("email") : undefined}
              onCompte={compter}
            />
          </div>

          {tab === "dossier" && (
            <div className="flex max-w-[820px] flex-col gap-5">
              <div className="flex flex-wrap items-center gap-2.5">
                <button
                  type="button"
                  // Jamais passée par Merx : Approfondir lui confie la fiche.
                  onClick={() => void (origine ? demanderAMerx("approfondir") : confierAMerx())}
                  disabled={merxEnCours !== null}
                  className={btnOutline}
                >
                  {merxEnCours === "approfondir" ? <Loader2 className="size-3.5 animate-spin" /> : <Search className="size-3.5" />}
                  {merxEnCours === "approfondir" ? "Merx approfondit… une bonne minute" : origine?.enriched_at ? "Approfondir à nouveau" : "Approfondir la fiche"}
                </button>
                <span className="text-[12.5px] text-muted-foreground">
                  {origine?.enriched_at ? `Approfondie le ${quandCourt(origine.enriched_at)}.` : "Merx cherche le registre, le site, les interlocuteurs."}
                </span>
              </div>
              <ApprocheEntreprise origine={origine} />
              <CeQuOnSait prospect={origine} enPlus={ceQueSaitLAffaire} />
              {/* Supprimer, tout en bas du dossier : loin des boutons du quotidien. */}
              <div className="border-t border-border pt-4">
                {/* À la corbeille, comme partout : 30 jours pour se raviser, la destruction
                    reste à l'administration. */}
                <button
                  type="button"
                  onClick={() => void supprimer()}
                  className="inline-flex items-center gap-1.5 rounded-full border border-rose-200 px-4 py-2 text-[13px] font-bold text-rose-700 transition-colors hover:border-rose-400"
                >
                  <Trash2 className="size-3.5" /> Supprimer la fiche
                </button>
                {souciSuppression && <p className="mt-2 text-[13px] font-semibold text-rose-700">{souciSuppression}</p>}
              </div>
            </div>
          )}

          {tab === "devis" && (
            <>
              {/* Un palier verrouillé se dit une fois, avec ce qu'il retient. */}
              {verrou("Proposition") ? (
                <Verrouille etape="Proposition" fonctions="La proposition et le devis Qonto" />
              ) : (
                <>
                  <Bloc titre="Proposition">{PropositionTab()}</Bloc>
                  <Bloc>
                    <DevisQonto clientId={client.id} />
                  </Bloc>
                </>
              )}

              <Bloc titre="Documents">{DocumentsTab()}</Bloc>

              {verrou("Signé") ? (
                <Verrouille etape="Signé" fonctions="L’espace client et les rendez-vous" />
              ) : (
                <>
                  <Bloc>
                    <EspaceClientCard bare clientId={client.id} clientName={client.company} />
                  </Bloc>
                  <Bloc>
                    <RendezVousCard bare clientId={client.id} />
                  </Bloc>
                </>
              )}
            </>
          )}
      </FicheEntreprise>

      {/* Modifier : la même fenêtre que sur les autres fiches, par-dessus la fiche. */}
      {editing && (
        <Modal onClose={() => setEditing(false)} width={600}>
          <h2 className="mb-4 font-display text-xl font-semibold text-avisdoc-ink">Modifier {client.company}</h2>
          <div className="flex flex-col gap-2">
            <input
              className={cn(inputCls, "font-semibold")}
              placeholder="Raison sociale"
              value={draft.company}
              onChange={(e) => setDraft({ ...draft, company: e.target.value })}
            />
            <div className="flex flex-wrap gap-2">
              <input
                className={cn(inputCls, "w-[130px]")}
                placeholder="SIREN"
                value={draft.siren}
                onChange={(e) => setDraft({ ...draft, siren: e.target.value })}
              />
              <input
                className={cn(inputCls, "min-w-0 flex-1")}
                placeholder="Activité (NAF)"
                value={draft.naf}
                onChange={(e) => setDraft({ ...draft, naf: e.target.value })}
              />
            </div>
            {/* Le secteur sert à filtrer le Pipeline en travers des commerciaux.
                Repris du prospect quand l'affaire en vient, corrigeable ici. */}
            <select
              value={draft.secteur}
              onChange={(e) => setDraft({ ...draft, secteur: e.target.value })}
              aria-label="Secteur de l’affaire"
              className={inputCls}
            >
              <option value="">Secteur — non précisé</option>
              {SECTEURS.map((sec) => (
                <option key={sec.id} value={sec.id}>
                  {sec.label}
                </option>
              ))}
            </select>
            <input
              className={inputCls}
              placeholder="Adresse (n° et voie)"
              value={draft.rue}
              onChange={(e) => setDraft({ ...draft, rue: e.target.value })}
            />
            <div className="flex flex-wrap gap-2">
              <input
                className={cn(inputCls, "w-[110px]")}
                placeholder="Code postal"
                value={draft.cp}
                onChange={(e) => setDraft({ ...draft, cp: e.target.value })}
              />
              <input
                className={cn(inputCls, "min-w-0 flex-1")}
                placeholder="Ville"
                value={draft.ville}
                onChange={(e) => setDraft({ ...draft, ville: e.target.value })}
              />
            </div>

            {/* Déplacer l'affaire. Une affaire n'est que dans un seul tableau : la
                sortir d'ici, c'est la poser ailleurs, sur une colonne de là-bas. */}
            <div className="mt-1 flex flex-wrap items-center gap-2 rounded-xl bg-muted/50 px-3 py-2">
              <span className="text-[12px] font-bold uppercase tracking-wide text-muted-foreground">Pipeline</span>
              <select
                value={draft.pipelineId}
                onChange={(e) => choisirPipeline(e.target.value)}
                aria-label="Pipeline de l’affaire"
                className={cn(inputCls, "w-auto font-semibold")}
              >
                {pipelines.map((pl) => (
                  <option key={pl.id} value={pl.id}>
                    {pl.nom}
                  </option>
                ))}
              </select>
              <span className="text-[12px] font-bold uppercase tracking-wide text-muted-foreground">Colonne</span>
              <select
                value={draft.stage}
                onChange={(e) => setDraft({ ...draft, stage: e.target.value })}
                aria-label="Colonne de l’affaire"
                className={cn(inputCls, "w-auto font-semibold")}
              >
                {colonnesDuBrouillon.map((st) => (
                  <option key={st.id} value={st.label}>
                    {st.label}
                  </option>
                ))}
              </select>
              {draft.pipelineId !== client.pipelineId && (
                <span className="text-[12px] font-semibold text-avisdoc-teal">
                  L’affaire quittera « {pipelines.find((pl) => pl.id === client.pipelineId)?.nom ?? "son pipeline"} »
                </span>
              )}
            </div>
            {/* Une pastille, pas une étape : l'affaire reste dans sa colonne. */}
            <label className="flex w-fit cursor-pointer items-center gap-2 text-[13px] font-semibold text-avisdoc-ink">
              <input
                type="checkbox"
                checked={draft.aRepondu}
                onChange={(e) => setDraft({ ...draft, aRepondu: e.target.checked })}
                className="size-4 accent-emerald-600"
              />
              A répondu
            </label>
          </div>
          <div className="mt-5 flex gap-2 border-t border-border pt-4">
            <button type="button" onClick={saveEdit} className={btnAccent} style={{ padding: "10px 20px" }}>
              Enregistrer
            </button>
            <button type="button" onClick={() => setEditing(false)} className={btnOutline}>
              Annuler
            </button>
          </div>
        </Modal>
      )}

      {brouillon && (
        <BrouillonEmail
          nom={client.company}
          objet={brouillon.objet}
          corps={brouillon.corps}
          destinataire={brouillon.destinataire}
          onClose={() => setBrouillon(null)}
        />
      )}
    </>
  );

  /** Ce que Merx avait trouvé, et ce qu’on peut encore lui demander. */
  // ---- Contenus d'onglets (fermetures sur l'état du composant) ----

  function DocumentsTab() {
    return (
      <>
          <div className="flex flex-col">
            {client.docs.map((d) => (
              <div key={d.id} className="flex items-center gap-3 border-b border-border/60 py-2.5 last:border-b-0">
                <span
                  className={cn(
                    "inline-flex size-8 shrink-0 items-center justify-center rounded-lg text-[9.5px] font-bold text-white",
                    DOC_EXT[d.ext],
                  )}
                >
                  {d.ext}
                </span>
                <div className="min-w-0 flex-1 truncate text-[13px] font-semibold text-avisdoc-ink">{d.name}</div>
                <div className="shrink-0 text-[11.5px] text-muted-foreground/80">{d.date}</div>
                <button
                  type="button"
                  onClick={() => removeProjectDoc(client.id, d.id)}
                  className="ad-x px-1 text-muted-foreground/60 transition-colors"
                >
                  <X className="size-4" />
                </button>
              </div>
            ))}
          </div>
          <div className="mt-3.5 flex flex-wrap gap-2">
            <input
              className={cn(inputCls, "min-w-[140px] flex-1 rounded-full")}
              placeholder="Nom du document (ex. Devis DEP-2026-042.pdf)"
              value={ndName}
              onChange={(e) => setNdName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && submitDoc()}
            />
            <button type="button" onClick={submitDoc} className={btnAccent} style={{ padding: "10px 18px" }}>
              Partager
            </button>
          </div>
      </>
    );
  }

  function PropositionTab() {
    return (
      <>
          <div className="rounded-2xl bg-avisdoc-ink p-6 text-white">
            <div className="font-display text-[32px] font-bold text-avisdoc-coral">{euro(total)}</div>
            <div className="mt-1 break-words text-[13px] text-white/60">
              {client.jours} {client.jours > 1 ? "journées" : "journée"} × {euro(client.tarif)} / jour
            </div>
            <div className="mt-4 flex flex-col gap-2.5">
              <Stepper
                label="Journées"
                value={String(client.jours)}
                onMinus={() => updateClientFields(client.id, { jours: Math.max(1, client.jours - 1) })}
                onPlus={() => updateClientFields(client.id, { jours: client.jours + 1 })}
              />
              <Stepper
                label="Tarif / journée"
                value={euro(client.tarif)}
                onMinus={() => updateClientFields(client.id, { tarif: Math.max(0, client.tarif - 50) })}
                onPlus={() => updateClientFields(client.id, { tarif: client.tarif + 50 })}
              />
            </div>
            <div className="mt-4 flex flex-wrap gap-1.5">
              {PROPO_STATUTS.map((st) => {
                const active = client.statutPropo === st;
                return (
                  <button
                    key={st}
                    type="button"
                    onClick={() => updateClientFields(client.id, { statutPropo: st })}
                    className={cn(
                      "rounded-full px-3.5 py-1.5 text-[11.5px] font-bold transition-colors",
                      active ? "bg-avisdoc-coral text-avisdoc-ink" : "bg-white/10 text-white/60 hover:bg-white/20",
                    )}
                  >
                    {st}
                  </button>
                );
              })}
            </div>

            {(client.tarif > 0 || client.statutPropo !== "Brouillon") && (
              <button
                type="button"
                onClick={async () => {
                  if (!(await confirmer({ titre: "Retirer la proposition ?", message: "Les journées et le tarif repartent à zéro.", action: "Retirer" }))) return;
                  updateClientFields(client.id, { jours: 1, tarif: 0, statutPropo: "Brouillon" });
                }}
                className="mt-3 text-[11.5px] font-semibold text-white/60 underline-offset-2 hover:text-white hover:underline"
              >
                Retirer la proposition
              </button>
            )}
          </div>

          {/* Résultat de campagne */}
          <div className="mt-4 rounded-2xl border border-border p-5">
            <div className="mb-2 text-[11px] font-bold uppercase tracking-[0.06em] text-muted-foreground">Résultat</div>
            {client.resultat ? (
              <>
                <div className="mb-2.5 flex gap-3.5">
                  <div>
                    <div className="font-display text-2xl font-bold text-avisdoc-ink">{client.depistes}</div>
                    <div className="text-[11px] text-muted-foreground/80">dépistés</div>
                  </div>
                  <div>
                    <div className="font-display text-2xl font-bold text-avisdoc-coral">{client.orientes}</div>
                    <div className="text-[11px] text-muted-foreground/80">orientés</div>
                  </div>
                </div>
                <p className="text-[13px] leading-relaxed text-foreground/80">{client.resultat}</p>
              </>
            ) : (
              <p className="text-[13px] italic text-muted-foreground">
                Campagne non réalisée — résultats disponibles après les journées de dépistage.
              </p>
            )}
          </div>
      </>
    );
  }
}

function Stepper({
  label,
  value,
  onMinus,
  onPlus,
}: {
  label: string;
  value: string;
  onMinus: () => void;
  onPlus: () => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2.5">
      <span className="min-w-[110px] text-[12.5px] text-white/60">{label}</span>
      <button
        type="button"
        onClick={onMinus}
        className="ad-stepper flex size-7 items-center justify-center rounded-full bg-white/10 transition-colors"
      >
        <Minus className="size-3.5" />
      </button>
      <span className="min-w-[64px] text-center text-sm font-bold">{value}</span>
      <button
        type="button"
        onClick={onPlus}
        className="ad-stepper flex size-7 items-center justify-center rounded-full bg-white/10 transition-colors"
      >
        <Plus className="size-3.5" />
      </button>
    </div>
  );
}
