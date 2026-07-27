// Accès Supabase pour les rendez-vous (journées de dépistage) côté admin.
// Auto-contenu (supabaseAdmin), RLS admin via is_avisdoc_user().
// Tables : admin_journees, admin_rdv.
import { supabaseAdmin as sb } from "../data/supabaseAdmin";

export const CLIENT_APP_URL = "https://client.avisdoc.fr";

export interface Journee {
  id: string;
  date: string;
  lieu: string;
  heure_debut: string;
  heure_fin: string;
  duree_min: number;
  pause_debut: string | null;
  pause_fin: string | null;
  token: string;
  actif: boolean;
  nb_rdv: number;
}
export interface NouvelleJournee {
  date: string;
  lieu: string;
  heure_debut: string;
  heure_fin: string;
  duree_min: number;
  pause_debut: string | null;
  pause_fin: string | null;
}
export interface Inscrit {
  id: string;
  creneau: string;
  nom: string;
  email: string;
  telephone: string;
  cree_le: string;
}

export const lienReservation = (token: string) => `${CLIENT_APP_URL}/rdv/${token}`;

export const rdvRepo = {
  async journees(clientId: string): Promise<Journee[]> {
    const { data, error } = await sb
      .from("admin_journees")
      .select("id, date, lieu, heure_debut, heure_fin, duree_min, pause_debut, pause_fin, token, actif, admin_rdv(count)")
      .eq("client_id", clientId)
      .order("date", { ascending: false });
    if (error) throw error;
    return (data ?? []).map((j: any) => ({
      ...j,
      nb_rdv: j.admin_rdv?.[0]?.count ?? 0,
    })) as Journee[];
  },

  async creer(clientId: string, input: NouvelleJournee): Promise<void> {
    const { error } = await sb.from("admin_journees").insert({ client_id: clientId, ...input });
    if (error) throw error;
  },

  async setActif(id: string, actif: boolean): Promise<void> {
    const { error } = await sb.from("admin_journees").update({ actif }).eq("id", id);
    if (error) throw error;
  },

  async supprimer(id: string): Promise<void> {
    const { error } = await sb.from("admin_journees").delete().eq("id", id);
    if (error) throw error;
  },

  async inscrits(journeeId: string): Promise<Inscrit[]> {
    const { data, error } = await sb
      .from("admin_rdv")
      .select("id, creneau, nom, email, telephone, cree_le")
      .eq("journee_id", journeeId)
      .order("creneau");
    if (error) throw error;
    return (data ?? []) as Inscrit[];
  },

  async supprimerInscrit(id: string): Promise<void> {
    const { error } = await sb.from("admin_rdv").delete().eq("id", id);
    if (error) throw error;
  },
};
