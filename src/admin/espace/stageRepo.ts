// Historique des changements d'étape (parcours CRM). Auto-contenu via
// supabaseAdmin (RLS admin sur admin_client_stage_history).
import { supabaseAdmin as sb } from "../data/supabaseAdmin";

export interface StageEvent {
  stage: string;
  changed_at: string;
}

export const stageRepo = {
  async historique(clientId: string): Promise<StageEvent[]> {
    const { data } = await sb.from("admin_client_stage_history")
      .select("stage, changed_at")
      .eq("client_id", clientId)
      .order("changed_at", { ascending: true });
    return (data as StageEvent[]) ?? [];
  },
};
