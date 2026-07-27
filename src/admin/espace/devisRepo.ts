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
  creer: (clientId: string) => invoke({ action: "creer_devis", client_id: clientId }),
  supprimer: (devisId: string) => invoke({ action: "supprimer_devis", devis_id: devisId }),

  async pdfUrl(path: string): Promise<string | null> {
    const { data } = await sb.storage.from("admin-devis").createSignedUrl(path, 3600);
    return data?.signedUrl ?? null;
  },
};
