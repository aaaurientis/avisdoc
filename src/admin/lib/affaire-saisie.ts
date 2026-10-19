// Une affaire du Pipeline saisie ou corrigée avec le formulaire de fiche complet.
//
// Une affaire tient en deux endroits : la ligne du Pipeline (admin_clients, ses
// interlocuteurs dans admin_client_contacts) et la fiche d'entreprise qui l'a fait
// naître (admin_prospects, reliée par converted_client_id), qui porte tout le reste —
// dirigeant, standard, site, effectif. Le formulaire écrit les deux d'un coup, pour
// que la fiche dise partout la même chose.

import type { Client, ProjectContact } from "../types";
import { supabaseAdmin } from "../data/supabaseAdmin";
import { joinAdresse, splitAdresse, uid } from "./format";
import { effectifLabel, type Prospect } from "./merx";
import { FICHE_VIDE, saisieDepuisProspect, type FicheSaisie, type PersonneSaisie } from "./fiche-saisie";

const sansTiret = (v: string | null | undefined) => {
  const t = (v ?? "").trim();
  return t === "—" ? "" : t;
};

/** Ce que l'affaire et sa fiche savent, prêt à corriger. */
export function saisieDepuisAffaire(client: Client, origine: (Prospect & { referent?: string | null }) | null): FicheSaisie {
  const base = origine ? saisieDepuisProspect(origine) : { ...FICHE_VIDE };
  const adr = splitAdresse(client.adresse);
  // Les interlocuteurs de l'affaire d'abord, avec LEURS coordonnées (ce sont celles
  // qu'on a corrigées dans le Pipeline) ; la fiche ne fait que compléter les cases vides.
  const cle = (n: string) => n.trim().toLowerCase();
  const deFiche = new Map(base.interlocuteurs.map((q) => [cle(q.nom), q]));
  const saisis: PersonneSaisie[] = client.contacts
    .filter((c) => c.name.trim())
    .map((c) => {
      const f = deFiche.get(cle(c.name));
      return {
        nom: c.name,
        fonction: (c.role === "Contact" ? "" : sansTiret(c.role)) || (f?.fonction ?? ""),
        email: sansTiret(c.email) || (f?.email ?? ""),
        telephone: sansTiret(c.tel) || (f?.telephone ?? ""),
      };
    });
  const vus = new Set(saisis.map((q) => cle(q.nom)));
  const restants = base.interlocuteurs.filter((q) => !vus.has(cle(q.nom)));
  return {
    ...base,
    nom: client.company,
    siren: client.siren || base.siren,
    secteur: (client.secteur as FicheSaisie["secteur"]) || base.secteur,
    adresse: adr.rue || base.adresse,
    codePostal: client.codePostal || adr.cp || base.codePostal,
    ville: client.ville || adr.ville || base.ville,
    referent: client.referent || base.referent,
    interlocuteurs: [...saisis, ...restants],
  };
}

/** Les champs de la ligne du Pipeline que la saisie remplit. */
export function champsAffaire(s: FicheSaisie): Partial<Client> {
  return {
    company: s.nom.trim(),
    siren: s.siren.replace(/\s/g, ""),
    adresse: joinAdresse(s.adresse.trim(), s.codePostal.trim(), s.ville.trim()),
    codePostal: s.codePostal.trim(),
    ville: s.ville.trim(),
    secteur: s.secteur || null,
    referent: s.referent || null,
    effectif: effectifLabel(s.effectif) ?? "",
  };
}

/** Les interlocuteurs de la saisie, tels que la ligne du Pipeline les range. */
export function contactsAffaire(s: FicheSaisie): ProjectContact[] {
  return s.interlocuteurs
    .filter((q) => q.nom.trim())
    .map((q) => {
      const [prenom, ...reste] = q.nom.trim().split(/\s+/);
      return {
        id: uid(),
        name: q.nom.trim(),
        prenom,
        nom: reste.join(" "),
        role: q.fonction.trim() || "Contact",
        email: q.email.trim() || "—",
        tel: q.telephone.trim() || "—",
      };
    });
}

/**
 * Aligne les interlocuteurs de l'affaire sur la saisie : retire ceux qu'on a ôtés,
 * corrige ceux qui restent, ajoute les nouveaux. Le nom fait le lien.
 */
export async function synchroniserContacts(clientId: string, avant: ProjectContact[], s: FicheSaisie): Promise<void> {
  const voulus = contactsAffaire(s);
  const cle = (n: string) => n.trim().toLowerCase();
  const parNom = new Map(avant.map((c) => [cle(c.name), c]));
  const gardes = new Set<string>();
  for (const v of voulus) {
    const existant = parNom.get(cle(v.name));
    if (existant) {
      gardes.add(existant.id);
      if (existant.role !== v.role || existant.email !== v.email || existant.tel !== v.tel) {
        const { error } = await supabaseAdmin.from("admin_client_contacts").update({ role: v.role, email: v.email, tel: v.tel }).eq("id", existant.id);
        if (error) throw new Error(error.message);
      }
    } else {
      const { error } = await supabaseAdmin
        .from("admin_client_contacts")
        .insert({ id: v.id, client_id: clientId, name: v.name, prenom: v.prenom || null, nom: v.nom || null, role: v.role, email: v.email, tel: v.tel });
      if (error) throw new Error(error.message);
    }
  }
  const aRetirer = avant.filter((c) => !gardes.has(c.id)).map((c) => c.id);
  if (aRetirer.length) {
    const { error } = await supabaseAdmin.from("admin_client_contacts").delete().in("id", aRetirer);
    if (error) throw new Error(error.message);
  }
}
