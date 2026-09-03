// Alias lisibles sur les types générés (./types.gen.ts). Aucun type métier
// n'est écrit à la main : tout dérive du schéma.
import type { Database, Json } from "./types.gen";

export type { Json };

type Schema = Database["prospection"];

export type Tables<T extends keyof Schema["Tables"]> = Schema["Tables"][T]["Row"];
export type Insertion<T extends keyof Schema["Tables"]> = Schema["Tables"][T]["Insert"];
export type Modification<T extends keyof Schema["Tables"]> = Schema["Tables"][T]["Update"];
export type Vues<T extends keyof Schema["Views"]> = Schema["Views"][T]["Row"];
export type Enums<T extends keyof Schema["Enums"]> = Schema["Enums"][T];

export type Compte = Tables<"compte">;
export type Contact = Tables<"contact">;
export type Interaction = Tables<"interaction">;
export type Relance = Tables<"relance">;
export type Import = Tables<"import">;
export type Exclusion = Tables<"exclusion">;
export type SyntheseHebdo = Tables<"synthese_hebdo">;

export type RelanceAFaire = Vues<"v_relances_a_faire">;
export type ReponseNonTraitee = Vues<"v_reponses_non_traitees">;
export type LigneParCercle = Vues<"v_par_cercle">;

export type StatutContact = Enums<"statut_contact">;
export type TypeCompte = Enums<"type_compte">;
export type NiveauContact = Enums<"niveau_contact">;
export type Canal = Enums<"canal">;
export type TypeInteraction = Enums<"type_interaction">;
export type Echeance = Enums<"echeance">;
export type MotifExclusion = Enums<"motif_exclusion">;

/** Contact avec son compte embarqué (jointure PostgREST `compte(*)`). */
export type ContactAvecCompte = Contact & { compte: Compte | null };

/** Modification d'un contact par le front : jamais le statut. */
export type ModificationContact = Omit<Modification<"contact">, "statut" | "id" | "jeton_opposition" | "cree_le" | "maj_le" | "import_id">;
export type ModificationCompte = Omit<Modification<"compte">, "id" | "cree_le" | "maj_le" | "import_id">;
