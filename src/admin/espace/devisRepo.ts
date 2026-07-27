// Accès aux devis Qonto (côté admin). Tout passe par l'Edge Function `qonto`
// (clé secrète serveur). RLS admin sur admin_devis + bucket admin-devis.
import { supabaseAdmin as sb } from "../data/supabaseAdmin";

export interface Devis {
  id: string;
  numero: string | null;
  montant_ht: number | null;
  montant_ttc: number | null;
  statut: string;
  pdf_path: string | null;
  cree_le: string;
}

export interface ContactFact {
  prenom: string;
  nom: string;
  email: string;
}

// Remonte le détail d'erreur de la fonction (y compris le corps Qonto).
async function invoke(body: Record<string, unknown>): Promise<any> {
  const { data, error } = await sb.functions.invoke("qonto", { body });
  if (error) {
    let detail = error.message;
    try {
      const b = await (error as any).context?.json?.();
      if (b?.error) detail = b.error + (b.qonto ? " — " + JSON.stringify(b.qonto) : "");
    } catch { /* ignore */ }
    throw new Error(detail);
  }
  return data;
}

export const devisRepo = {
  async liste(clientId: string): Promise<Devis[]> {
    const { data } = await sb.from("admin_devis")
      .select("id, numero, montant_ht, montant_ttc, statut, pdf_path, cree_le")
      .eq("client_id", clientId).order("cree_le", { ascending: false });
    return (data as Devis[]) ?? [];
  },

  diag: () => invoke({ action: "diag" }),
  statutClient: (clientId: string) => invoke({ action: "statut_client", client_id: clientId }),
  associerClient: (clientId: string) => invoke({ action: "associer_client", client_id: clientId }),
  creer: (clientId: string) => invoke({ action: "creer_devis", client_id: clientId }),
  supprimer: (devisId: string) => invoke({ action: "supprimer_devis", devis_id: devisId }),

  async pdfUrl(path: string): Promise<string | null> {
    const { data } = await sb.storage.from("admin-devis").createSignedUrl(path, 3600);
    return data?.signedUrl ?? null;
  },

  // Contact de facturation (prénom / nom / e-mail). Renvoie les champs dédiés
  // s'ils existent, sinon un pré-remplissage depuis le 1er contact CRM.
  async contactFact(clientId: string): Promise<ContactFact> {
    const { data: c } = await sb.from("admin_clients")
      .select("contact_prenom, contact_nom, contact_email")
      .eq("id", clientId).maybeSingle();
    let prenom = (c as any)?.contact_prenom ?? "";
    let nom = (c as any)?.contact_nom ?? "";
    let email = (c as any)?.contact_email ?? "";
    if (!prenom && !nom && !email) {
      const { data: ct } = await sb.from("admin_client_contacts")
        .select("name, email").eq("client_id", clientId).limit(1).maybeSingle();
      const parts = ((ct as any)?.name ?? "").trim().split(/\s+/).filter(Boolean);
      if (parts.length === 1) { prenom = parts[0]; }
      else if (parts.length > 1) { prenom = parts[0]; nom = parts.slice(1).join(" "); }
      email = (ct as any)?.email ?? "";
    }
    return { prenom, nom, email };
  },

  async setContactFact(clientId: string, v: ContactFact): Promise<void> {
    const { error } = await sb.from("admin_clients").update({
      contact_prenom: v.prenom.trim() || null,
      contact_nom: v.nom.trim() || null,
      contact_email: v.email.trim() || null,
    }).eq("id", clientId);
    if (error) throw new Error(error.message);
  },
};
