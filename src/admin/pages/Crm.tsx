import { useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Columns3, Plus, Search } from "lucide-react";
import { useAdminData } from "../data/AdminDataContext";
import { PageHeader } from "../components/ui";
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

export default function Crm() {
  const { clientId } = useParams();
  const navigate = useNavigate();
  const { clients, stages, setClientStage } = useAdminData();
  const [showModal, setShowModal] = useState(false);
  const [showColonnes, setShowColonnes] = useState(false);
  const [filtres, setFiltres] = useState<FiltresCrm>(FILTRES_CRM_VIDES);
  const [recherche, setRecherche] = useState("");

  const selected = clientId ? clients.find((c) => c.id === clientId) : undefined;

  const visibles = useMemo(() => clients.filter((c) => retenueCrm(c, filtres, recherche)), [clients, filtres, recherche]);

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
        <ProjectView
          client={selected}
          allClients={clients}
          onSelect={(id) => navigate(`/crm/${id}`)}
          onClose={() => navigate("/crm")}
        />
      ) : (
        <Kanban
          clients={visibles}
          stages={stages}
          onSelect={(id) => navigate(`/crm/${id}`)}
          onDeplacer={(id, stage) => setClientStage(id, stage)}
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
