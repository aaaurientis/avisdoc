// Zone de danger de la fiche projet : suppression complète du client.
// Confirmation par saisie du nom exact (garde-fou après l'incident de
// suppression accidentelle). La suppression passe par deleteClient (Edge
// Function service_role : Storage + cascade base).
import { useState } from "react";
import { Trash2 } from "lucide-react";
import { Card, Modal, SectionLabel } from "../components/ui";
import { useAdminData } from "../data/AdminDataContext";

export default function DangerZone({
  clientId,
  clientName,
  onDeleted,
}: {
  clientId: string;
  clientName: string;
  onDeleted: () => void;
}) {
  const { deleteClient } = useAdminData();
  const [open, setOpen] = useState(false);
  const [saisie, setSaisie] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const ok = saisie.trim() === clientName.trim();

  async function confirmer() {
    if (!ok || busy) return;
    setBusy(true);
    setErr(null);
    try {
      await deleteClient(clientId);
      onDeleted();
    } catch (e: any) {
      setErr(e?.message ?? String(e));
      setBusy(false);
    }
  }

  return (
    <Card className="border-rose-300/60 p-[22px]">
      <SectionLabel className="text-rose-600">Zone de danger</SectionLabel>
      <p className="mt-2 text-[13px] text-muted-foreground">
        Supprime définitivement ce client : fiche CRM, contacts, suivis, documents,
        espace client, utilisateurs et fichiers générés. Action irréversible.
      </p>
      <button
        onClick={() => { setSaisie(""); setErr(null); setOpen(true); }}
        className="mt-3 inline-flex items-center gap-2 rounded-xl border border-rose-300 px-3.5 py-2 text-[13px] font-medium text-rose-700 transition-colors hover:bg-rose-50"
      >
        <Trash2 className="size-4" /> Supprimer ce client
      </button>

      {open && (
        <Modal onClose={() => !busy && setOpen(false)}>
          <h2 className="font-display text-xl font-semibold text-avisdoc-ink">
            Supprimer « {clientName} » ?
          </h2>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
            Cette action est <strong className="text-rose-700">irréversible</strong> et
            supprime toutes les données associées (CRM, espace client, documents et
            fichiers). Pour confirmer, saisis le nom exact de l'entreprise :
          </p>
          <input
            autoFocus
            value={saisie}
            onChange={(e) => setSaisie(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && confirmer()}
            placeholder={clientName}
            className="mt-4 w-full rounded-xl border border-border bg-muted/50 px-3.5 py-2.5 text-sm outline-none transition-colors focus:border-rose-400"
          />
          {err && (
            <p className="mt-3 rounded-xl bg-rose-50 px-3.5 py-2 text-[13px] text-rose-700">{err}</p>
          )}
          <div className="mt-6 flex justify-end gap-2">
            <button
              onClick={() => setOpen(false)}
              disabled={busy}
              className="rounded-xl border border-border px-4 py-2 text-sm text-muted-foreground transition-colors hover:border-avisdoc-ink disabled:opacity-40"
            >
              Annuler
            </button>
            <button
              onClick={confirmer}
              disabled={!ok || busy}
              className="rounded-xl bg-rose-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-rose-700 disabled:opacity-40"
            >
              {busy ? "Suppression…" : "Supprimer définitivement"}
            </button>
          </div>
        </Modal>
      )}
    </Card>
  );
}
