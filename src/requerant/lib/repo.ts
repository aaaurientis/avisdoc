// Accès données du portail infirmière : son propre dossier (RLS self-read) et
// les transitions côté serveur (Edge Functions).

/* eslint-disable @typescript-eslint/no-explicit-any */
import { supabase } from "./supabase";
import type { ReqContrat, ReqInscription, ReqPiece } from "../../admin/req/types";

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
    signUrl: r.sign_url ?? null,
    signedPath: r.signed_path ?? null,
    preuvePath: r.preuve_path ?? null,
    envoyeLe: r.envoye_le,
    signeLe: r.signe_le ?? null,
    expireLe: r.expire_le ?? null,
  };
}

export interface MonDossier {
  inscription: ReqInscription;
  pieces: ReqPiece[];
  contrats: ReqContrat[];
}

export const portalRepo = {
  /** Le dossier de l'infirmière connectée (RLS : elle ne voit que le sien). */
  async monDossier(): Promise<MonDossier | null> {
    const { data: ins, error } = await supabase
      .from("req_inscriptions")
      .select("*")
      .limit(1)
      .maybeSingle();
    if (error) throw error;
    if (!ins) return null;
    const [piecesRes, contratsRes] = await Promise.all([
      supabase
        .from("req_pieces")
        .select("*")
        .eq("inscription_id", ins.id)
        .order("type", { ascending: true })
        .order("version", { ascending: false }),
      supabase
        .from("req_contrats")
        .select("*")
        .eq("inscription_id", ins.id)
        .order("envoye_le", { ascending: false }),
    ]);
    return {
      inscription: toInscription(ins),
      pieces: (piecesRes.data ?? []).map(toPiece),
      contrats: (contratsRes.data ?? []).map(toContrat),
    };
  },

  /** Rattache le compte connecté à l'inscription (via le token du lien). */
  async accepter(token: string): Promise<void> {
    const { error } = await supabase.functions.invoke("inscription-accepter", { body: { token } });
    if (error) throw error;
  },

  /** (Re)demande un lien de connexion par e-mail (public). */
  async renvoyerLien(email: string): Promise<void> {
    await supabase.functions.invoke("inscription-renvoyer", { body: { email } });
  },

  /** Dépôt identité (voie de secours) : RPPS + fichier (vers une URL signée). */
  async deposerIdentite(rpps: string, file: File): Promise<void> {
    const { data, error } = await supabase.functions.invoke("identite-secours-deposer", {
      body: { rpps, filename: file.name },
    });
    if (error) throw error;
    const up = await supabase.storage.from(data.bucket).uploadToSignedUrl(data.path, data.token, file);
    if (up.error) throw up.error;
  },

  /** Dépôt d'une pièce RCP/URSSAF (fichier vers une URL signée). */
  async deposerPiece(type: "rcp" | "urssaf", file: File): Promise<void> {
    const { data, error } = await supabase.functions.invoke("piece-deposer", {
      body: { type, filename: file.name },
    });
    if (error) throw error;
    const up = await supabase.storage.from(data.bucket).uploadToSignedUrl(data.path, data.token, file);
    if (up.error) throw up.error;
  },

  async seDeconnecter(): Promise<void> {
    await supabase.auth.signOut();
  },
};
