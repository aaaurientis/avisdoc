import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Columns3, Plus, Search } from "lucide-react";
import { useAdminData } from "../data/AdminDataContext";
import { supabaseAdmin } from "../data/supabaseAdmin";
import { PageHeader } from "../components/ui";
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
import Kanban from "./crm/Kanban";
import ProjectView from "./crm/ProjectView";
import NewClientModal from "./crm/NewClientModal";
import ColonnesModal from "./crm/ColonnesModal";
import { confirmer } from "../components/Confirmation";

export default function Crm() {
  const { clientId } = useParams();
  const navigate = useNavigate();
  const { clients, stages, setClientStage, rafraichir } = useAdminData();
  const [showModal, setShowModal] = useState(false);
  const [showColonnes, setShowColonnes] = useState(false);
  const [filtres, setFiltres] = useState<FiltresCrm>(FILTRES_CRM_VIDES);
  const [recherche, setRecherche] = useState("");
  const [coches, setCoches] = useState<Set<string>>(new Set());
  const [prevues, setPrevues] = useState<Map<string, Prevu>>(new Map());

  /** Ce qui attend sur chaque affaire : une action notée doit se voir depuis le tableau. */
  useEffect(() => {
    let vivant = true;
    void actionsPrevues().then((m) => vivant && setPrevues(m));
    return () => {
      vivant = false;
    };
  }, [clients]);

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
          <button
            type="button"
            onClick={() => setShowColonnes(true)}
            className="inline-flex items-center gap-1.5 rounded-full border border-border px-5 py-2.5 text-sm font-bold text-avisdoc-ink transition-colors hover:border-avisdoc-teal"
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
          <FiltresPipeline filtres={filtres} onChange={setFiltres} departements={departements} />
        </div>
      )}

      {selected ? (
        <ProjectView client={selected} onClose={() => navigate("/crm")} />
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

      {showColonnes && <ColonnesModal clients={clients} onClose={() => setShowColonnes(false)} />}

      {showModal && (
        <NewClientModal
          onClose={() => setShowModal(false)}
          onCreated={(id) => {
            setShowModal(false);
            navigate(`/crm/${id}`);
          }}
        />
      )}
    </div>
  );
}
