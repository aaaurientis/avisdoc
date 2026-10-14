import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Columns3, Download, Plus, Search, Upload } from "lucide-react";
import { useAdminData } from "../data/AdminDataContext";
import { supabaseAdmin } from "../data/supabaseAdmin";
import { PageHeader, SectionLabel } from "../components/ui";
import BarreSelection from "../components/BarreSelection";
import { toast } from "sonner";
import { jeter, JOURS_DE_GARDE } from "../lib/corbeille";
import { actionsPrevues, type Prevu } from "../lib/actions-prevues";
import FiltresPipeline, {
  FILTRES_CRM_VIDES,
  departementDe,
  retenueCrm,
  type FiltresCrm,
} from "./crm/FiltresPipeline";
import BarrePipelines from "./crm/BarrePipelines";
import Kanban from "./crm/Kanban";
import ProjectView from "./crm/ProjectView";
import NewClientModal from "./crm/NewClientModal";
import ColonnesModal from "./crm/ColonnesModal";
import { chargerMembres, nomLisible } from "../lib/membres";
import { confirmer } from "../components/Confirmation";
import FiltresRepliables from "../components/FiltresRepliables";
import { colonnesFusionnees, estGeneral, peutAllerDans } from "../lib/pipeline-general";
import { colonnesTriees } from "../lib/colonnes";
import ImportProspection from "./prospects/ImportProspection";
import BarreDefilement from "../components/BarreDefilement";
import { COLONNES_MODELE, COLONNES_PIPELINE } from "../lib/import-prospection";
import { secteurLisible, type Prospect } from "../lib/merx";

export default function Crm() {
  const { clientId } = useParams();
  const navigate = useNavigate();
  const { clients: toutesAffaires, stages: toutesColonnes, pipelines, setClientStage, rafraichir } = useAdminData();
  /** Le pipeline ouvert. `null` au premier affichage : on ouvre alors sur le premier tableau. */
  const [pipelineId, setPipelineId] = useState<string | null>(null);
  const pipeline = pipelines.find((p) => p.id === pipelineId) ?? pipelines[0] ?? null;
  /**
   * Un pipeline est un tableau : ses colonnes et ses affaires n'appartiennent qu'à lui.
   * Sauf Général, la vue d'ensemble : toutes les affaires, toutes les colonnes.
   */
  const ensemble = estGeneral(pipeline);
  const clients = useMemo(
    () => (ensemble ? toutesAffaires : toutesAffaires.filter((c) => c.pipelineId === pipeline?.id)),
    [toutesAffaires, pipeline, ensemble],
  );
  const stages = useMemo(
    () =>
      ensemble && pipeline
        ? colonnesFusionnees(toutesColonnes, pipeline.id)
        : colonnesTriees(toutesColonnes, pipeline?.id ?? ""),
    [toutesColonnes, pipeline, ensemble],
  );
  const [showModal, setShowModal] = useState(false);
  const [showColonnes, setShowColonnes] = useState(false);
  /** Le tableau qui défile de côté : la barre du haut, sous les filtres, le suit. */
  const [zoneKanban, setZoneKanban] = useState<HTMLDivElement | null>(null);
  /** Les fiches de Prospection, lues à l'ouverture de l'import : il les complète au lieu de les recréer. */
  const [importFiches, setImportFiches] = useState<Prospect[] | null>(null);

  const ouvrirImport = async () => {
    const { data, error } = await supabaseAdmin.from("admin_prospects").select("*").is("deleted_at", null);
    if (error) return toast.error(error.message);
    setImportFiches((data ?? []) as Prospect[]);
  };

  /**
   * Export de ce qui est affiché : une ligne par interlocuteur, aux colonnes du modèle
   * d'import plus le pipeline, la colonne et la campagne. Le fichier se réimporte tel
   * quel. L'historique, lui, reste dans les fiches.
   */
  const exporter = async () => {
    const XLSX = await import("xlsx");
    const entetes = [...COLONNES_MODELE, ...COLONNES_PIPELINE];
    const lignes = visibles.flatMap((c) => {
      const commun: Record<string, string | number> = {
        "Raison sociale": c.company,
        Département: departementDe(c) ?? "",
        Structure: c.secteur ? secteurLisible(c.secteur) : "",
        Pipeline: pipelines.find((p) => p.id === c.pipelineId)?.nom ?? "",
        Colonne: c.stage,
        Ville: c.ville ?? "",
        Journées: c.jours,
        "Tarif / journée": c.tarif,
      };
      const sansTiret = (t: string) => (t.trim() === "—" ? "" : t);
      const parContact = c.contacts.length
        ? c.contacts.map((pc) => ({
            ...commun,
            Nom: pc.nom || "",
            Prénom: pc.prenom || (pc.nom ? "" : pc.name),
            Fonction: pc.role === "Contact" ? "" : pc.role,
            "E-mail": sansTiret(pc.email),
            Téléphone: sansTiret(pc.tel),
          }))
        : [commun];
      return parContact.map((v) => Object.fromEntries(entetes.map((e) => [e, (v as Record<string, string | number>)[e] ?? ""])));
    });
    const feuille = XLSX.utils.json_to_sheet(lignes, { header: entetes });
    const classeur = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(classeur, feuille, "Pipeline");
    XLSX.writeFile(classeur, `pipeline-avisdoc-${new Date().toISOString().slice(0, 10)}.xlsx`);
  };
  const [filtres, setFiltres] = useState<FiltresCrm>(FILTRES_CRM_VIDES);
  const [recherche, setRecherche] = useState("");
  /**
   * Toute l'équipe, plus les référents déjà posés sur des affaires.
   *
   * Se limiter à ceux qui suivent déjà une affaire empêchait de chercher celles d'un
   * collègue qui vient d'arriver, et de lui assigner un pipeline.
   */
  const [equipe, setEquipe] = useState<string[]>([]);
  useEffect(() => {
    let vivant = true;
    void chargerMembres().then((m) => vivant && setEquipe(m));
    return () => { vivant = false; };
  }, []);
  const commerciaux = useMemo(
    () =>
      [...new Set([...equipe, ...(toutesAffaires.map((c) => c.referent).filter(Boolean) as string[])])]
        .sort((a, b) => nomLisible(a).localeCompare(nomLisible(b), "fr")),
    [equipe, toutesAffaires],
  );
  const [coches, setCoches] = useState<Set<string>>(new Set());
  const [prevues, setPrevues] = useState<Map<string, Prevu>>(new Map());

  /**
   * Ce qui attend sur chaque affaire : une action notée doit se voir depuis le tableau.
   * Relu aussi à la fermeture d'une fiche : on vient peut-être d'y programmer un rendez-vous.
   */
  useEffect(() => {
    let vivant = true;
    void actionsPrevues().then((m) => vivant && setPrevues(m));
    return () => {
      vivant = false;
    };
  }, [clients, clientId]);

  const cocher = (id: string) =>
    setCoches((prev) => {
      const suivant = new Set(prev);
      if (suivant.has(id)) suivant.delete(id);
      else suivant.add(id);
      return suivant;
    });
  const [origines, setOrigines] = useState<Map<string, { score_total: number | null; activity: string | null; rationale: string | null }>>(
    new Map(),
  );

  /** Les fiches de Merx d’où viennent ces affaires : la carte dit la même chose qu’en prospection. */
  useEffect(() => {
    let vivant = true;
    void supabaseAdmin
      .from("admin_prospects")
      .select("converted_client_id, score_total, activity, rationale")
      .not("converted_client_id", "is", null)
      .then(({ data }) => {
        if (!vivant || !data) return;
        setOrigines(
          new Map(
            (data as { converted_client_id: string; score_total: number | null; activity: string | null; rationale: string | null }[]).map(
              (p) => [p.converted_client_id, { score_total: p.score_total, activity: p.activity, rationale: p.rationale }],
            ),
          ),
        );
      });
    return () => {
      vivant = false;
    };
  }, []);

  const selected = clientId ? clients.find((c) => c.id === clientId) : undefined;

  const visibles = useMemo(() => clients.filter((c) => retenueCrm(c, filtres, recherche)), [clients, filtres, recherche]);

  const selectionnees = useMemo(() => clients.filter((c) => coches.has(c.id)), [clients, coches]);
  const adresses = useMemo(
    () => [...new Set(selectionnees.flatMap((c) => c.contacts.map((p) => p.email)).filter(Boolean))],
    [selectionnees],
  );

  /** Un seul message à plusieurs : les destinataires sont en copie cachée. */
  const ecrireAuxCoches = () => {
    if (adresses.length === 0) return;
    window.location.href = `mailto:?bcc=${encodeURIComponent(adresses.join(","))}`;
  };

  /** Supprimer une affaire depuis sa carte, sans passer par la sélection. */
  const supprimerUne = async (c: (typeof clients)[number]) => {
    if (!(await confirmer({ titre: `Supprimer ${c.company} ?`, message: `Vous la retrouverez ${JOURS_DE_GARDE} jours dans la corbeille.` }))) return;
    try {
      await jeter("affaire", [c.id]);
      await rafraichir();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "La suppression a échoué.");
    }
  };

  const supprimerLesCoches = async () => {
    const n = selectionnees.length;
    if (n === 0) return;
    if (!(await confirmer({ titre: `Supprimer ${n} affaire${n > 1 ? "s" : ""} ?`, message: `Vous les retrouverez ${JOURS_DE_GARDE} jours dans la corbeille.` })))
      return;
    try {
      await jeter("affaire", selectionnees.map((c) => c.id));
      setCoches(new Set());
      await rafraichir();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "La suppression a échoué.");
    }
  };

  /** Les départements réellement présents dans les affaires. */
  const departements = useMemo(
    () => [...new Set(clients.map(departementDe).filter((d): d is string => Boolean(d)))].sort(),
    [clients],
  );

  return (
    <div>
      <PageHeader
        title="Pipeline"
        subtitle={
          visibles.length === clients.length
            ? `${clients.length} client${clients.length > 1 ? "s" : ""} — campagnes de dépistage et conventions`
            : `${visibles.length} sur ${clients.length} — campagnes de dépistage et conventions`
        }
        action={
          <div className="flex items-center gap-2">
          {/* Importer, exporter et réorganiser les colonnes se fait devant un ordinateur. */}
          <button
            type="button"
            onClick={() => void ouvrirImport()}
            className="inline-flex items-center gap-1.5 rounded-full border border-border px-4 py-2.5 text-sm font-bold text-avisdoc-ink transition-colors hover:border-avisdoc-teal max-sm:hidden"
          >
            <Upload className="size-4" /> Importer
          </button>
          <button
            type="button"
            onClick={() => void exporter()}
            className="inline-flex items-center gap-1.5 rounded-full border border-border px-4 py-2.5 text-sm font-bold text-avisdoc-ink transition-colors hover:border-avisdoc-teal max-sm:hidden"
          >
            <Download className="size-4" /> Exporter
          </button>
          <button
            type="button"
            onClick={() => setShowColonnes(true)}
            className="inline-flex items-center gap-1.5 rounded-full border border-border px-5 py-2.5 text-sm font-bold text-avisdoc-ink transition-colors hover:border-avisdoc-teal max-sm:hidden"
          >
            <Columns3 className="size-4" /> Colonnes
          </button>
          <button
            type="button"
            onClick={() => setShowModal(true)}
            className="ad-btn-accent inline-flex items-center gap-1.5 rounded-full bg-avisdoc-teal px-5 py-2.5 text-sm font-bold text-white"
          >
            <Plus className="size-4" /> Nouveau client
          </button>
          </div>
        }
      />

      {!selected && (
        <BarrePipelines
          actif={pipeline}
          onChoisir={(p) => setPipelineId(p.id)}
          commerciaux={commerciaux}
        />
      )}

      {!selected && (
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <div className="relative min-w-[240px] max-w-sm flex-1">
            <Search className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <input
              value={recherche}
              onChange={(e) => setRecherche(e.target.value)}
              placeholder="Rechercher un client, une ville, un contact…"
              className="ad-input w-full rounded-full border border-border bg-card py-2 pl-10 pr-4 text-[13px] outline-none transition-colors focus:border-avisdoc-teal"
            />
          </div>
          <FiltresRepliables actifs={Object.values(filtres).filter(Boolean).length}>
            <FiltresPipeline filtres={filtres} onChange={setFiltres} departements={departements} commerciaux={commerciaux} />
          </FiltresRepliables>
        </div>
      )}
      {!selected && <BarreDefilement cible={zoneKanban} />}

      {selected ? (
        <ProjectView client={selected} onClose={() => navigate("/crm")} />
      ) : stages.length === 0 ? (
        /* Un tableau sans colonne n'affiche rien : il faut le dire, et dire où aller. */
        <div className="rounded-2xl bg-muted/60 p-8 text-center">
          <SectionLabel>Ce pipeline n’a pas encore de colonnes</SectionLabel>
          <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-muted-foreground">
            Ajoutez-en avec le bouton <strong className="text-avisdoc-ink">Colonnes</strong>, en haut à droite.
            Une affaire ne peut entrer ici qu’une fois qu’il y a une colonne pour l’accueillir.
          </p>
        </div>
      ) : (
        <Kanban
          clients={visibles}
          stages={stages}
          onSelect={(id) => navigate(`/crm/${id}`)}
          onDeplacer={(id, stage) => setClientStage(id, stage)}
          origines={origines}
          coches={coches}
          onCocher={cocher}
          onChangerCoches={setCoches}
          onSupprimer={(c) => void supprimerUne(c)}
          onModifier={(c) => navigate(`/crm/${c.id}?modifier=1`)}
          prevues={prevues}
          zoneRef={setZoneKanban}
          {...(ensemble && pipeline
            ? {
                peutDeposer: (c: (typeof clients)[number], colonne: string) => peutAllerDans(c, colonne, toutesColonnes, pipeline.id),
                etiquette: (c: (typeof clients)[number]) =>
                  c.pipelineId === pipeline.id ? null : (pipelines.find((p) => p.id === c.pipelineId)?.nom ?? null),
              }
            : {})}
        />
      )}

      {!selected && (
        <BarreSelection
          nombre={selectionnees.length}
          total={visibles.length}
          onTout={() => setCoches(new Set(visibles.map((c) => c.id)))}
          avecEmail={adresses.length}
          libelleSuppression="Supprimer"
          onEmail={ecrireAuxCoches}
          onSupprimer={() => void supprimerLesCoches()}
          onEffacer={() => setCoches(new Set())}
        />
      )}

      {importFiches && (
        <ImportProspection
          versLePipeline
          pipelineParDefaut={pipeline && !ensemble ? pipeline.id : ""}
          existantes={importFiches}
          onClose={() => setImportFiches(null)}
          onFini={rafraichir}
        />
      )}
      {showColonnes && <ColonnesModal clients={clients.filter((c) => c.pipelineId === pipeline?.id)} onClose={() => setShowColonnes(false)} pipelineId={pipeline?.id ?? ""} />}

      {showModal && (
        <NewClientModal
          onClose={() => setShowModal(false)}
          pipelineId={pipeline?.id ?? ""}
          etapeDepart={stages[0]?.label ?? "Qualifié"}
          onCreated={(id) => {
            setShowModal(false);
            navigate(`/crm/${id}`);
          }}
        />
      )}
    </div>
  );
}
