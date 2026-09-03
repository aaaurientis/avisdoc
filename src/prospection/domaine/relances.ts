// File de relances et plafond quotidien — miroir des règles serveur
// (prospection.marquer_envoye, prospection.plafond_invitations).
// Aucun envoi programmé : ces fonctions calculent des échéances et des motifs.
import type { Echeance, Relance, StatutContact, TypeInteraction } from "../data/types";

/** Quinze invitations par jour et par identité. */
export const PLAFOND_INVITATIONS_JOUR = 15;

export const ECHEANCES: ReadonlyArray<{ code: Echeance; jours: number; type: TypeInteraction }> = [
  { code: "j5", jours: 5, type: "message_valeur" },
  { code: "j12", jours: 12, type: "partage_contenu" },
  { code: "j21", jours: 21, type: "proposition" },
];

/** Deux relances effectives au maximum ; la proposition J+21 clôt la séquence. */
export const RELANCES_EFFECTIVES_MAX = 2;

function isoLocal(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** PR-50 : échéances armées par un envoi d'invitation à une date donnée. */
export function pr50EcheancesRelance(dateEnvoi: Date): Array<{ code: Echeance; type: TypeInteraction; du_le: string }> {
  return ECHEANCES.map((e) => {
    const d = new Date(dateEnvoi.getFullYear(), dateEnvoi.getMonth(), dateEnvoi.getDate() + e.jours);
    return { code: e.code, type: e.type, du_le: isoLocal(d) };
  });
}

/** PR-51 : invitations restantes aujourd'hui pour l'identité courante. */
export function pr51InvitationsRestantes(invitationsDuJour: number): number {
  return Math.max(0, PLAFOND_INVITATIONS_JOUR - Math.max(0, invitationsDuJour));
}

export type MotifBlocage =
  | "statut_non_contactable"
  | "plafond_atteint"
  | "message_vide"
  | "message_non_conforme"
  | "sequence_terminee"
  | "relance_deja_faite";

/** PR-52 : pourquoi le bouton « Marquer comme envoyé » d'une invitation est inactif. */
export function pr52MotifInvitationBloquee(statut: StatutContact, invitationsDuJour: number): MotifBlocage | null {
  if (statut !== "a_contacter") return "statut_non_contactable";
  if (pr51InvitationsRestantes(invitationsDuJour) <= 0) return "plafond_atteint";
  return null;
}

/** PR-53 : prochaine relance en attente, dans l'ordre des échéances. */
export function pr53RelanceSuivante(relances: Relance[]): Relance | null {
  const ordre = ECHEANCES.map((e) => e.code);
  const enAttente = relances
    .filter((r) => r.etat === "en_attente")
    .sort((a, b) => ordre.indexOf(a.echeance) - ordre.indexOf(b.echeance));
  return enAttente[0] ?? null;
}

/** PR-54 : retard d'une relance en jours (négatif si pas encore due). */
export function pr54RetardJours(du_le: string, aujourdhui: Date): number {
  const [a, m, j] = du_le.split("-").map(Number);
  const due = Date.UTC(a, m - 1, j);
  const now = Date.UTC(aujourdhui.getFullYear(), aujourdhui.getMonth(), aujourdhui.getDate());
  return Math.floor((now - due) / 86_400_000);
}

/** PR-55 : type d'interaction associé à une échéance. */
export function pr55TypePourEcheance(echeance: Echeance): TypeInteraction {
  return ECHEANCES.find((e) => e.code === echeance)?.type ?? "message_valeur";
}

/** PR-56 : une invitation tient en 300 caractères, un message en 600. */
export function pr56GenreMessage(type: TypeInteraction): "invitation" | "message" {
  return type === "invitation" ? "invitation" : "message";
}

/** PR-57 : pourquoi le suivi d'une relance est inactif. */
export function pr57MotifRelanceBloquee(statut: StatutContact, relances: Relance[], type: TypeInteraction): MotifBlocage | null {
  if (statut !== "invite" && statut !== "accepte") return "sequence_terminee";
  const echeance = ECHEANCES.find((e) => e.type === type)?.code;
  const r = relances.find((x) => x.echeance === echeance);
  if (!r || r.etat !== "en_attente") return "relance_deja_faite";
  return null;
}
