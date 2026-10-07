// Accès Supabase pour les inscriptions d'infirmières requérantes.
// Les LECTURES passent par la RLS admin ; les ÉCRITURES (transitions) passent
// par des Edge Functions (service_role), jamais en direct.

/* eslint-disable @typescript-eslint/no-explicit-any */
import { supabaseAdmin as sb } from "../data/supabaseAdmin";
import type {
  ReqContrat,
  ReqDossier,
  ReqHistoriqueItem,
  ReqInscription,
  ReqPiece,
} from "./types";

function toInscription(r: any): ReqInscription {
  return {
    id: r.id,
    nom: r.nom,
    prenom: r.prenom,
    email: r.email,
    rpps: r.rpps ?? null,
    identiteSource: r.identite_source ?? null,
    etat: r.etat,
    motif: r.motif ?? null,
    authUserId: r.auth_user_id ?? null,
    inviteExpireLe: r.invite_expire_le ?? null,
    derniereActionLe: r.derniere_action_le,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

function toPiece(r: any): ReqPiece {
  return {
    id: r.id,
    inscriptionId: r.inscription_id,
    type: r.type,
    version: r.version ?? 1,
    etat: r.etat,
    storagePath: r.storage_path ?? null,
    assureur: r.assureur ?? null,
    police: r.police ?? null,
    dateEmission: r.date_emission ?? null,
    dateFin: r.date_fin ?? null,
    codeUrssafVerifie: r.code_urssaf_verifie ?? null,
    motif: r.motif ?? null,
    deposeeLe: r.deposee_le,
    controleeLe: r.controlee_le ?? null,
    controleePar: r.controlee_par ?? null,
  };
}

function toContrat(r: any): ReqContrat {
  return {
    id: r.id,
    inscriptionId: r.inscription_id,
    modeleVersion: r.modele_version,
    statut: r.statut,
    signedPath: r.signed_path ?? null,
    preuvePath: r.preuve_path ?? null,
    envoyeLe: r.envoye_le,
    signeLe: r.signe_le ?? null,
    expireLe: r.expire_le ?? null,
  };
}

function toHist(r: any): ReqHistoriqueItem {
  return {
    id: r.id,
    at: r.at,
    acteur: r.acteur ?? null,
    action: r.action,
    pieceId: r.piece_id ?? null,
    detail: r.detail ?? null,
  };
}

export const reqRepo = {
  /** Liste des inscriptions, avec l'échéance de pièce validée la plus proche. */
  async list(): Promise<ReqInscription[]> {
    const [insRes, pieceRes] = await Promise.all([
      sb.from("req_inscriptions").select("*").order("created_at", { ascending: false }),
      sb.from("req_pieces").select("inscription_id, date_fin").eq("etat", "validee"),
    ]);
    if (insRes.error) throw insRes.error;

    const echeance = new Map<string, string>();
    for (const p of pieceRes.data ?? []) {
      if (!p.date_fin) continue;
      const cur = echeance.get(p.inscription_id);
      if (!cur || p.date_fin < cur) echeance.set(p.inscription_id, p.date_fin);
    }

    return (insRes.data ?? []).map((r: any) => ({
      ...toInscription(r),
      prochaineEcheance: echeance.get(r.id) ?? null,
    }));
  },

  /** Dossier complet d'une inscription (fiche A2). */
  async dossier(id: string): Promise<ReqDossier> {
    const [insRes, pieceRes, contratRes, histRes] = await Promise.all([
      sb.from("req_inscriptions").select("*").eq("id", id).maybeSingle(),
      sb.from("req_pieces").select("*").eq("inscription_id", id)
        .order("type", { ascending: true }).order("version", { ascending: false }),
      sb.from("req_contrats").select("*").eq("inscription_id", id)
        .order("envoye_le", { ascending: false }),
      sb.from("req_historique").select("*").eq("inscription_id", id)
        .order("at", { ascending: false }),
    ]);
    if (insRes.error) throw insRes.error;
    if (!insRes.data) throw new Error("Inscription introuvable.");
    return {
      inscription: toInscription(insRes.data),
      pieces: (pieceRes.data ?? []).map(toPiece),
      contrats: (contratRes.data ?? []).map(toContrat),
      historique: (histRes.data ?? []).map(toHist),
    };
  },

  /** URL signée pour consulter une pièce (bucket selon le type). */
  async pieceUrl(piece: ReqPiece): Promise<string | null> {
    if (!piece.storagePath) return null;
    const bucket = piece.type === "identite" ? "req-identite" : "req-pieces";
    const { data } = await sb.storage.from(bucket).createSignedUrl(piece.storagePath, 3600);
    return data?.signedUrl ?? null;
  },

  /** Crée une inscription (état « invitee ») et envoie le lien (Edge Function). */
  async inviter(
    nom: string,
    prenom: string,
    email: string,
  ): Promise<{ id?: string; emailEnvoye: boolean }> {
    const { data, error } = await sb.functions.invoke("inscription-inviter", {
      body: { nom, prenom, email },
    });
    if (error) throw error;
    return { id: data?.id, emailEnvoye: !!data?.email_envoye };
  },
};
