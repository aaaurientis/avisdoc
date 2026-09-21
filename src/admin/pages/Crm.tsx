import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Columns3, Plus } from "lucide-react";
import { useAdminData } from "../data/AdminDataContext";
import { PageHeader } from "../components/ui";
import Kanban from "./crm/Kanban";
import ProjectView from "./crm/ProjectView";
import NewClientModal from "./crm/NewClientModal";
import ColonnesModal from "./crm/ColonnesModal";

export default function Crm() {
  const { clientId } = useParams();
  const navigate = useNavigate();
  const { clients, stages, updateClientFields } = useAdminData();
  const [showModal, setShowModal] = useState(false);
  const [showColonnes, setShowColonnes] = useState(false);

  const selected = clientId ? clients.find((c) => c.id === clientId) : undefined;

  return (
    <div>
      <PageHeader
        title="Pipeline"
        subtitle={`${clients.length} clients — campagnes de dépistage et conventions`}
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

      {selected ? (
        <ProjectView
          client={selected}
          allClients={clients}
          onSelect={(id) => navigate(`/crm/${id}`)}
          onClose={() => navigate("/crm")}
        />
      ) : (
        <Kanban
          clients={clients}
          stages={stages}
          onSelect={(id) => navigate(`/crm/${id}`)}
          onDeplacer={(id, stage) => updateClientFields(id, { stage })}
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
