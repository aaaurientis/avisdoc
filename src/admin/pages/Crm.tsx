import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Plus } from "lucide-react";
import { useAdminData } from "../data/AdminDataContext";
import { PageHeader } from "../components/ui";
import Kanban from "./crm/Kanban";
import ProjectView from "./crm/ProjectView";
import NewClientModal from "./crm/NewClientModal";

export default function Crm() {
  const { clientId } = useParams();
  const navigate = useNavigate();
  const { clients } = useAdminData();
  const [showModal, setShowModal] = useState(false);

  const selected = clientId ? clients.find((c) => c.id === clientId) : undefined;

  return (
    <div>
      <PageHeader
        title="CRM"
        subtitle={`${clients.length} clients — campagnes de dépistage et conventions`}
        action={
          <button
            type="button"
            onClick={() => setShowModal(true)}
            className="ad-btn-accent inline-flex items-center gap-1.5 rounded-full bg-avisdoc-teal px-5 py-2.5 text-sm font-bold text-white"
          >
            <Plus className="size-4" /> Nouveau client
          </button>
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
        <Kanban clients={clients} onSelect={(id) => navigate(`/crm/${id}`)} />
      )}

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
