import { describe, expect, it } from "vitest";
import { choisirFiche, porteLeNom } from "../../../supabase/functions/_shared/google-correspondance";

const fiche = (place_id: string, nom: string, adresse: string, ferme = false) => ({ place_id, nom, adresse, ferme });

describe("réseau d'aval : rattachement automatique de la fiche Google", () => {
  it("reconnaît le nom de famille en mots entiers, accents et tirets compris", () => {
    expect(porteLeNom("Dr Claire Arnoux - Dermatologue", "ARNOUX")).toBe(true);
    expect(porteLeNom("Docteur Brun-Lévêque", "BRUN-LEVEQUE")).toBe(true);
    expect(porteLeNom("Cabinet Arnouxville", "ARNOUX")).toBe(false);
    expect(porteLeNom("Centre de dermatologie", "ARNOUX")).toBe(false);
  });

  it("rattache d'office une seule fiche au bon nom et au bon code postal", () => {
    const r = choisirFiche([
      fiche("A", "Dr Claire Arnoux", "12 Rue des Tests, 38000 Grenoble"),
      fiche("B", "Clinique fictive", "1 Avenue X, 38000 Grenoble"),
    ], "ARNOUX", ["38000", "38700"]);
    expect(r).toEqual({ statut: "trouvee_auto", placeId: "A" });
  });

  it("laisse confirmer un opérateur en cas de doute", () => {
    // Deux fiches possibles (homonymes, ou cabinet + hôpital)
    expect(choisirFiche([
      fiche("A", "Dr Arnoux", "38000 Grenoble"), fiche("B", "Dr Arnoux", "38000 Grenoble"),
    ], "ARNOUX", ["38000"])).toEqual({ statut: "a_confirmer", candidats: 2 });
    // Le bon nom mais ailleurs
    expect(choisirFiche([fiche("A", "Dr Arnoux", "69003 Lyon")], "ARNOUX", ["38000"]).statut).toBe("a_confirmer");
    // Une fiche fermée ne se rattache jamais d'office
    expect(choisirFiche([fiche("A", "Dr Arnoux", "38000 Grenoble", true)], "ARNOUX", ["38000"]).statut).toBe("a_confirmer");
  });

  it("dit introuvable quand Google ne renvoie rien", () => {
    expect(choisirFiche([], "ARNOUX", ["38000"])).toEqual({ statut: "introuvable" });
  });
});
