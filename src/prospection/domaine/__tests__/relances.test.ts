import { describe, expect, it } from "vitest";
import type { Relance } from "../../data/types";
import {
  PLAFOND_INVITATIONS_JOUR, pr50EcheancesRelance, pr51InvitationsRestantes, pr52MotifInvitationBloquee,
  pr53RelanceSuivante, pr54RetardJours, pr57MotifRelanceBloquee,
} from "../relances";

describe("relances et plafond", () => {
  it("arme J+5, J+12 et J+21", () => {
    const e = pr50EcheancesRelance(new Date(2026, 8, 3));
    expect(e.map((x) => x.du_le)).toEqual(["2026-09-08", "2026-09-15", "2026-09-24"]);
    expect(e.map((x) => x.type)).toEqual(["message_valeur", "partage_contenu", "proposition"]);
  });

  it("plafonne à quinze invitations par jour ; la seizième est refusée avec un motif", () => {
    expect(PLAFOND_INVITATIONS_JOUR).toBe(15);
    expect(pr51InvitationsRestantes(0)).toBe(15);
    expect(pr51InvitationsRestantes(15)).toBe(0);
    expect(pr52MotifInvitationBloquee("a_contacter", 14)).toBeNull();
    expect(pr52MotifInvitationBloquee("a_contacter", 15)).toBe("plafond_atteint");
    expect(pr52MotifInvitationBloquee("a_qualifier", 0)).toBe("statut_non_contactable");
  });

  it("vieillit une relance échue au lieu de la faire disparaître", () => {
    expect(pr54RetardJours("2026-09-01", new Date(2026, 8, 3))).toBe(2);
    expect(pr54RetardJours("2026-09-05", new Date(2026, 8, 3))).toBe(-2);
  });

  it("propose la prochaine relance en attente et bloque hors séquence", () => {
    const relances: Relance[] = [
      { id: "1", contact_id: "c", echeance: "j5", du_le: "2026-09-08", etat: "fait", interaction_id: null, cree_le: "" },
      { id: "2", contact_id: "c", echeance: "j12", du_le: "2026-09-15", etat: "en_attente", interaction_id: null, cree_le: "" },
      { id: "3", contact_id: "c", echeance: "j21", du_le: "2026-09-24", etat: "en_attente", interaction_id: null, cree_le: "" },
    ];
    expect(pr53RelanceSuivante(relances)?.echeance).toBe("j12");
    expect(pr57MotifRelanceBloquee("invite", relances, "partage_contenu")).toBeNull();
    expect(pr57MotifRelanceBloquee("invite", relances, "message_valeur")).toBe("relance_deja_faite");
    expect(pr57MotifRelanceBloquee("en_conversation", relances, "partage_contenu")).toBe("sequence_terminee");
  });
});
