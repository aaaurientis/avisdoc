// Réseau d'aval : les points qu'un opérateur doit encore trancher sur un praticien,
// après une recherche automatique, une recherche IA ou un import. Logique PURE (testée).
// Chaque point dit quoi faire et dans quelle partie de la fiche.

import { specialiteDuLienDoctolib, specialiteHorsCible } from "../../../supabase/functions/_shared/doctolib";
import { releveCreneauPerime } from "../../../supabase/functions/_shared/reseau-signaux";

export type SectionFiche = "ia" | "adresses" | "exclusion";

export interface PointAValider { cle: string; libelle: string; section: SectionFiche }

export interface PraticienPourPoints {
  etat: string;
  vuAuDernierImport: boolean;
  googleStatut: string;
  doctolibStatut: string;
  doctolibUrl: string | null;
  doctolibInfos: { specialite?: string | null; reservable?: boolean | null } | null;
}

export interface SignalPourPoints { type: string; statut: string; decideLe: string | null }

export function pointsAValider(p: PraticienPourPoints, signaux: SignalPourPoints[], maintenant: Date = new Date()): PointAValider[] {
  if (p.etat === "exclu") return [];
  const out: PointAValider[] = [];
  const propositions = signaux.filter((s) => s.statut === "propose").length;
  if (propositions) out.push({ cle: "ia", libelle: `${propositions} proposition${propositions > 1 ? "s" : ""} (IA ou import Doctolib) à valider ou rejeter`, section: "ia" });
  if (p.googleStatut === "trouvee_auto") out.push({ cle: "google", libelle: "Fiche Google trouvée : vérifier et confirmer", section: "adresses" });
  // Une information déjà récupérée sur la fiche (relevé, import) vaut confirmation du lien.
  const renseigne = !!p.doctolibUrl && !!p.doctolibInfos;
  if (renseigne) { /* rien à confirmer côté lien */ }
  else if (p.doctolibStatut === "trouve_auto") out.push({ cle: "doctolib", libelle: "Lien Doctolib trouvé : vérifier et confirmer", section: "adresses" });
  else if (p.doctolibStatut === "a_confirmer") out.push({ cle: "doctolib", libelle: "Fiche Doctolib à choisir (plusieurs fiches à son nom)", section: "adresses" });
  const horsCible = specialiteHorsCible(specialiteDuLienDoctolib(p.doctolibUrl), p.doctolibInfos?.specialite);
  if (horsCible) out.push({ cle: "hors_cible", libelle: `Hors cible ? Doctolib le présente comme ${horsCible}`, section: "exclusion" });
  const creneau = signaux.find((s) => s.type === "creneau_doctolib" && s.statut === "valide");
  if (creneau && p.doctolibInfos?.reservable !== false && releveCreneauPerime(creneau.decideLe, maintenant)) {
    out.push({ cle: "creneau", libelle: "Premier créneau Doctolib périmé (plus de 14 jours) : à relever", section: "adresses" });
  }
  if (!p.vuAuDernierImport) out.push({ cle: "rpps", libelle: "Absent de la dernière extraction RPPS : exerce-t-il encore ?", section: "exclusion" });
  return out;
}
