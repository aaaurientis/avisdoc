// Inscription & validation des infirmières requérantes — modèles côté app.
// Miroir des tables req_* (migration 0057).

export type ReqEtat =
  | "invitee"
  | "identite_a_controler"
  | "identite_verifiee"
  | "pieces_a_valider"
  | "a_completer"
  | "pret_a_signer"
  | "contrat_envoye"
  | "active"
  | "suspendue"
  | "refusee"
  | "resiliee"
  | "abandonnee";

export type PieceType = "rcp" | "urssaf" | "identite";
export type PieceEtat = "deposee" | "validee" | "refusee" | "expiree" | "remplacee";

export type MotifRefus =
  | "illisible"
  | "incomplete"
  | "mauvais_document"
  | "nom_non_concordant"
  | "periode_non_couverte"
  | "exercice_liberal_absent"
  | "code_urssaf_non_verifiable"
  | "autre";

export interface ReqInscription {
  id: string;
  nom: string;
  prenom: string;
  email: string;
  rpps: string | null;
  identiteSource: "psc" | "secours" | null;
  etat: ReqEtat;
  motif: string | null;
  authUserId: string | null;
  inviteExpireLe: string | null;
  derniereActionLe: string;
  createdAt: string;
  updatedAt: string;
  /** Échéance utile la plus proche (calculée) : ISO date ou null. */
  prochaineEcheance?: string | null;
}

export interface ReqPiece {
  id: string;
  inscriptionId: string;
  type: PieceType;
  version: number;
  etat: PieceEtat;
  storagePath: string | null;
  assureur: string | null;
  police: string | null;
  dateEmission: string | null;
  dateFin: string | null;
  codeUrssafVerifie: boolean | null;
  motif: string | null;
  deposeeLe: string;
  controleeLe: string | null;
  controleePar: string | null;
}

export interface ReqContrat {
  id: string;
  inscriptionId: string;
  modeleVersion: string;
  statut: "envoye" | "signe" | "refuse" | "expire";
  signedPath: string | null;
  preuvePath: string | null;
  envoyeLe: string;
  signeLe: string | null;
  expireLe: string | null;
}

export interface ReqHistoriqueItem {
  id: string;
  at: string;
  acteur: string | null;
  action: string;
  pieceId: string | null;
  detail: Record<string, unknown> | null;
}

export interface ReqDossier {
  inscription: ReqInscription;
  pieces: ReqPiece[];
  contrats: ReqContrat[];
  historique: ReqHistoriqueItem[];
}

// --- Libellés & styles (jetons Tailwind) -----------------------------------

export const ETAT_LABEL: Record<ReqEtat, string> = {
  invitee: "Invitée",
  identite_a_controler: "Identité à contrôler",
  identite_verifiee: "Identité vérifiée",
  pieces_a_valider: "Pièces à valider",
  a_completer: "À compléter",
  pret_a_signer: "Prêt à signer",
  contrat_envoye: "Contrat envoyé",
  active: "Active",
  suspendue: "Suspendue",
  refusee: "Refusée",
  resiliee: "Résiliée",
  abandonnee: "Abandonnée",
};

export const ETAT_BADGE: Record<ReqEtat, string> = {
  invitee: "bg-slate-100 text-slate-600",
  identite_a_controler: "bg-amber-100 text-amber-700",
  identite_verifiee: "bg-sky-100 text-sky-700",
  pieces_a_valider: "bg-amber-100 text-amber-700",
  a_completer: "bg-orange-100 text-orange-700",
  pret_a_signer: "bg-sky-100 text-sky-700",
  contrat_envoye: "bg-indigo-100 text-indigo-700",
  active: "bg-emerald-100 text-emerald-700",
  suspendue: "bg-rose-100 text-rose-700",
  refusee: "bg-rose-100 text-rose-700",
  resiliee: "bg-slate-200 text-slate-600",
  abandonnee: "bg-slate-200 text-slate-600",
};

export const PIECE_TYPE_LABEL: Record<PieceType, string> = {
  rcp: "Responsabilité civile (RCP)",
  urssaf: "Attestation URSSAF",
  identite: "Pièce d'identité",
};

export const PIECE_ETAT_LABEL: Record<PieceEtat, string> = {
  deposee: "Déposée",
  validee: "Validée",
  refusee: "Refusée",
  expiree: "Expirée",
  remplacee: "Remplacée",
};

export const MOTIF_LABEL: Record<MotifRefus, string> = {
  illisible: "Illisible",
  incomplete: "Incomplète",
  mauvais_document: "Mauvais document",
  nom_non_concordant: "Nom non concordant",
  periode_non_couverte: "Période non couverte",
  exercice_liberal_absent: "Exercice libéral absent",
  code_urssaf_non_verifiable: "Code URSSAF non vérifiable",
  autre: "Autre",
};

/** États où l'admin a une action à faire (vue « À traiter »). */
export const ETATS_A_TRAITER: ReqEtat[] = [
  "identite_a_controler",
  "pieces_a_valider",
  "pret_a_signer",
];
