// Journal du client : commentaires horodatés avec auteur. Auto-contenu via
// supabaseAdmin (RLS admin sur admin_client_logs).
import { supabaseAdmin as sb } from "../data/supabaseAdmin";

export interface LogEntry {
  id: string;
  auteur: string;
  message: string;
  created_at: string;
}

export const journalRepo = {
  async liste(clientId: string): Promise<LogEntry[]> {
    const { data } = await sb.from("admin_client_logs")
      .select("id, auteur, message, created_at")
      .eq("client_id", clientId)
      .order("created_at", { ascending: false });
    return (data as LogEntry[]) ?? [];
  },

  async ajouter(clientId: string, message: string, auteur: string): Promise<void> {
    const { error } = await sb.from("admin_client_logs")
      .insert({ client_id: clientId, message: message.trim(), auteur });
    if (error) throw new Error(error.message);
  },

  async supprimer(id: string): Promise<void> {
    const { error } = await sb.from("admin_client_logs").delete().eq("id", id);
    if (error) throw new Error(error.message);
  },
};
