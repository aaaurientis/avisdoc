// Accès Supabase pour la brique « espace client » (fusion).
// Auto-contenu : utilise le client admin existant, ne touche pas au repo CRM.
// Tables : admin_clients (logo), admin_client_domaines, admin_client_espace_users,
//          admin_generated_docs, admin_generation_jobs. hds n'existe jamais ici.
import { supabaseAdmin as sb } from "../data/supabaseAdmin";

export interface EspaceInfo {
  logo_path: string | null;
  logo_sha256: string | null;
  stage: string;
  espace_cree_le: string | null;
}
export interface Domaine { id: string; domaine: string }
export interface EspaceUser {
  id: string; email: string; role: string;
  auth_user_id: string | null; premiere_connexion_le: string | null;
}
export interface GeneratedDoc {
  id: string; doc_catalogue_id: string; titre: string; acces: string;
  phase: string; format: string; version: string;
  storage_bucket: string; storage_path: string;
}
export interface GenJob { id: string; type: string; statut: string; erreur: string | null; cree_le: string }

async function sha256Hex(buf: ArrayBuffer): Promise<string> {
  const h = await crypto.subtle.digest("SHA-256", buf);
  return [...new Uint8Array(h)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export const espaceRepo = {
  async info(clientId: string): Promise<EspaceInfo | null> {
    const { data } = await sb
      .from("admin_clients")
      .select("logo_path, logo_sha256, stage, espace_cree_le")
      .eq("id", clientId).maybeSingle();
    return (data as EspaceInfo) ?? null;
  },

  async uploadLogo(clientId: string, file: File): Promise<void> {
    const buf = await file.arrayBuffer();
    const empreinte = await sha256Hex(buf);
    const ext = file.name.toLowerCase().endsWith(".svg") ? ".svg" : ".png";
    const path = `${clientId}/logo${ext}`;
    const up = await sb.storage.from("espace-logos").upload(path, file, { upsert: true });
    if (up.error) throw up.error;
    const { error } = await sb.from("admin_clients")
      .update({ logo_path: path, logo_sha256: empreinte }).eq("id", clientId);
    if (error) throw error;
  },

  async domaines(clientId: string): Promise<Domaine[]> {
    const { data } = await sb.from("admin_client_domaines")
      .select("id, domaine").eq("client_id", clientId).order("domaine");
    return (data as Domaine[]) ?? [];
  },
  async addDomaine(clientId: string, domaine: string): Promise<void> {
    const d = domaine.trim().toLowerCase().replace(/^@/, "");
    if (!d) return;
    const { error } = await sb.from("admin_client_domaines").insert({ client_id: clientId, domaine: d });
    if (error) throw error;
  },
  async removeDomaine(id: string): Promise<void> {
    await sb.from("admin_client_domaines").delete().eq("id", id);
  },

  async users(clientId: string): Promise<EspaceUser[]> {
    const { data } = await sb.from("admin_client_espace_users")
      .select("id, email, role, auth_user_id, premiere_connexion_le")
      .eq("client_id", clientId).order("email");
    return (data as EspaceUser[]) ?? [];
  },
  async addUser(clientId: string, email: string): Promise<void> {
    const { error } = await sb.from("admin_client_espace_users")
      .insert({ client_id: clientId, email: email.trim().toLowerCase() });
    if (error) throw error;
  },
  async removeUser(id: string): Promise<void> {
    await sb.from("admin_client_espace_users").delete().eq("id", id);
  },

  async docs(clientId: string): Promise<GeneratedDoc[]> {
    const { data } = await sb.from("admin_generated_docs")
      .select("id, doc_catalogue_id, titre, acces, phase, format, version, storage_bucket, storage_path")
      .eq("client_id", clientId).order("phase");
    return (data as GeneratedDoc[]) ?? [];
  },
  async docUrl(d: GeneratedDoc): Promise<string | null> {
    if (d.storage_bucket === "espace-docs-public") {
      return sb.storage.from(d.storage_bucket).getPublicUrl(d.storage_path).data.publicUrl;
    }
    const { data } = await sb.storage.from(d.storage_bucket).createSignedUrl(d.storage_path, 3600);
    return data?.signedUrl ?? null;
  },

  async jobs(clientId: string): Promise<GenJob[]> {
    const { data } = await sb.from("admin_generation_jobs")
      .select("id, type, statut, erreur, cree_le")
      .eq("client_id", clientId).order("cree_le", { ascending: false }).limit(5);
    return (data as GenJob[]) ?? [];
  },

  // Suppression complète : Storage (via Edge Function service_role) + cascade base.
  async supprimerClient(clientId: string): Promise<void> {
    const { error } = await sb.functions.invoke("supprimer-client", { body: { client_id: clientId } });
    if (error) throw error;
  },

  // userId absent → (re)envoi à tous ; userId présent → renvoi ciblé.
  async inviter(clientId: string, userId?: string): Promise<{ invites: number; erreurs: string[] }> {
    const body: { client_id: string; user_id?: string } = { client_id: clientId };
    if (userId) body.user_id = userId;
    const { data, error } = await sb.functions.invoke("inviter-espace", { body });
    if (error) throw error;
    return { invites: data?.invites ?? 0, erreurs: data?.erreurs ?? [] };
  },
};
