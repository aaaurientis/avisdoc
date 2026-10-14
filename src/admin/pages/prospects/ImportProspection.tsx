// Importer un fichier de prospection, ou télécharger son modèle.
//
// Trois temps : choisir le fichier, voir ce qui va entrer, l'importer. Rien n'est
// écrit avant le dernier clic. Les entreprises qui ont un « Avancement » entrent
// aussi dans le pipeline choisi — Contacté ou RDV, « A répondu » en pastille.
//
// Depuis le Pipeline, le même fichier fait tout entrer au Pipeline : les colonnes
// « Pipeline » et « Colonne » disent où, sinon l'Avancement, sinon la 1re colonne.
//
// Réimporter un fichier ne remet rien en double : une entreprise déjà connue est
// complétée là où il lui manque quelque chose (fiche, interlocuteurs, historique),
// jamais écrasée, et une affaire déjà au Pipeline ne change pas de colonne.

import { useEffect, useMemo, useRef, useState } from "react";
import { FileSpreadsheet, Loader2, Upload, X } from "lucide-react";
import type { Client } from "../../types";
import { supabaseAdmin } from "../../data/supabaseAdmin";
import { useAdminData } from "../../data/AdminDataContext";
import { useAuth } from "../../auth/AuthContext";
import { Modal, SectionLabel } from "../../components/ui";
import { clientDepuisProspect, contactDepuisProspect } from "../../lib/conversion";
import { departementDe } from "../crm/FiltresPipeline";
import { uid } from "../../lib/format";
import { chargerMembres, nomLisible } from "../../lib/membres";
import { colonnesDe } from "../../lib/ui-tokens";
import { chargerEchanges } from "../../lib/echanges";
import { nu } from "../../lib/import-colonnes";
import type { Prospect } from "../../lib/merx";
import {
  AVANCEMENTS,
  colonnePour,
  COLONNES_MODELE,
  contactsACompleter,
  departementsDifferents,
  echangesDe,
  echangesNouveaux,
  ficheExistante,
  lireLignes,
  nomInterlocuteur,
  regrouper,
  type Avancement,
  type EntrepriseImportee,
  type LigneProspection,
} from "../../lib/import-prospection";
import { cn } from "@/lib/utils";

const champCls =
  "w-full rounded-xl border border-border bg-background px-3 py-2 text-[13.5px] text-avisdoc-ink outline-none focus:border-avisdoc-teal";
const boutonPrincipal =
  "ad-btn-accent inline-flex items-center gap-1.5 rounded-full bg-avisdoc-teal px-5 py-2.5 text-sm font-bold text-white disabled:opacity-60";
const boutonSecondaire =
  "inline-flex items-center gap-1.5 rounded-full border border-border px-5 py-2.5 text-sm font-bold text-avisdoc-ink transition-colors hover:border-avisdoc-teal";

const LIBELLE: Record<Avancement, string> = { contacte: "Contacté", repondu: "A répondu", rdv: "RDV" };

/** Le modèle : les en-têtes, et deux lignes d'exemple pour montrer le format. */
async function telechargerModeleProspection() {
  const XLSX = await import("xlsx");
  const exemples = [
    ["18/09/2026", "Exemple Industrie", "DUPONT", "Claire", "DRH", "c.dupont@exemple.fr", "03 88 00 00 00", "67",
      "Entreprise", "Contacté", "Email", "18/09/2026", "30/09/2026", "", "Premier e-mail au DRH, relancé le 30/09."],
    ["21/09/2026", "Ville d’Exemple", "MARTIN", "Paul", "Service social", "", "", "68",
      "Municipalité", "RDV", "Téléphonique", "21/09/2026", "", "13/10/2026", "Intéressé, présentation prévue."],
  ];
  const feuille = XLSX.utils.aoa_to_sheet([[...COLONNES_MODELE], ...exemples]);
  feuille["!cols"] = COLONNES_MODELE.map((e) => ({ wch: e === "Commentaires" ? 60 : Math.max(14, e.length + 4) }));
  const aide = XLSX.utils.aoa_to_sheet([
    ["Colonne", "Ce qu’on y met"],
    ["Raison sociale", "Obligatoire. Une ligne par entreprise."],
    ["Avancement", `${AVANCEMENTS.join(", ")} — ou vide : l’entreprise reste en Prospection.`],
    ["Contacté / RDV", "Range l’entreprise dans la colonne du même nom du pipeline choisi à l’import."],
    ["A répondu", "L’entreprise va dans Contacté, avec la pastille « A répondu »."],
    ["Type de contact", "Email, Téléphonique, Messagerie LinkedIn, WhatsApp, Physique…"],
    ["Dates", "jj/mm/aaaa. Date du contact, relance et RDV s’inscrivent dans l’historique de la fiche."],
    ["Commentaires", "Gardés en entier dans l’historique."],
    ["Structure", "Entreprise, Municipalité, Maison de santé, Autre."],
  ]);
  aide["!cols"] = [{ wch: 18 }, { wch: 90 }];
  const classeur = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(classeur, feuille, "Prospection");
  XLSX.utils.book_append_sheet(classeur, aide, "Aide");
  XLSX.writeFile(classeur, "modele-import-prospection-avisdoc.xlsx");
}

interface Bilan {
  creees: number;
  completees: string[];
  auPipeline: number;
  echecs: string[];
}

type Personne = NonNullable<Prospect["personnes"]>[number];

export default function ImportProspection({
  existantes,
  onClose,
  onFini,
  versLePipeline = false,
  pipelineParDefaut = "",
}: {
  /** Les fiches déjà en Prospection : une entreprise qui y est déjà est complétée, pas recréée. */
  existantes: Prospect[];
  onClose: () => void;
  onFini: () => Promise<void>;
  /** Import lancé depuis le Pipeline : toutes les entreprises y entrent. */
  versLePipeline?: boolean;
  /** Le pipeline ouvert à l'écran, proposé d'office. */
  pipelineParDefaut?: string;
}) {
  const { user } = useAuth();
  const { pipelines, stages, clients, addClient, rafraichir } = useAdminData();
  const fichierRef = useRef<HTMLInputElement>(null);
  const [fichier, setFichier] = useState<{ nom: string; lignes: LigneProspection[] } | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [membres, setMembres] = useState<string[]>([]);
  const [pipelineId, setPipelineId] = useState(pipelineParDefaut);
  const [commercial, setCommercial] = useState("");
  const [avance, setAvance] = useState<{ fait: number; total: number } | null>(null);
  const [bilan, setBilan] = useState<Bilan | null>(null);

  useEffect(() => {
    void chargerMembres().then(setMembres);
    const assigne = pipelines.find((p) => p.id === pipelineParDefaut)?.assigneA;
    if (assigne) setCommercial(assigne);
    // Une seule fois, à l'ouverture : ensuite c'est le commercial qui choisit.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const choisirPipeline = (id: string) => {
    setPipelineId(id);
    // Un pipeline assigné donne son commercial ; on peut le changer ensuite.
    const assigne = pipelines.find((p) => p.id === id)?.assigneA;
    if (assigne) setCommercial(assigne);
  };

  const lire = async (file: File) => {
    setErreur(null);
    try {
      const XLSX = await import("xlsx");
      const classeur = XLSX.read(await file.arrayBuffer(), { cellDates: true, codepage: 65001 });
      const feuille = classeur.Sheets[classeur.SheetNames[0]];
      const { lignes, manque } = lireLignes(XLSX.utils.sheet_to_json<Record<string, unknown>>(feuille, { defval: "" }));
      if (manque) return setErreur(`Colonne « ${manque} » introuvable sur la première ligne du fichier. Partez du modèle.`);
      if (lignes.length === 0) return setErreur("Le fichier ne contient aucune entreprise.");
      setFichier({ nom: file.name, lignes });
    } catch (e) {
      setErreur(`Le fichier n’a pas pu être lu : ${e instanceof Error ? e.message : "format inattendu"}`);
    }
  };

  const entreprises = useMemo(() => regrouper(fichier?.lignes ?? []), [fichier]);
  /** L'affaire déjà au Pipeline pour cette entreprise, s'il y en a une. */
  const affaireDe = (e: EntrepriseImportee, prospect: Prospect | null): Client | undefined => {
    const liee = prospect?.converted_client_id ? clients.find((c) => c.id === prospect.converted_client_id) : undefined;
    if (liee) return liee;
    // Par le nom, mais pas d'un département à l'autre : SMAC du 68 n'est pas SMAC du 33.
    const d = e.lignes.find((l) => l.departement)?.departement ?? prospect?.department;
    const memeNom = clients.filter((c) => c.company.trim().toLowerCase() === e.nom.toLowerCase() && !departementsDifferents(d, departementDe(c)));
    return memeNom.length === 1 ? memeNom[0] : undefined;
  };

  const colonnes = colonnesDe(stages, pipelineId);
  /** Où va une nouvelle affaire : le pipeline et la colonne du fichier s'ils existent, sinon ce qu'on a choisi. */
  const destination = (e: EntrepriseImportee): { pipeline: string; colonne: string } | null => {
    const l = e.lignes.find((x) => x.pipeline || x.colonne);
    const nomme = l?.pipeline ? pipelines.find((p) => nu(p.nom) === nu(l.pipeline!)) : undefined;
    const pipeline = nomme?.id ?? pipelineId;
    if (!pipeline) return null;
    const cols = colonnesDe(stages, pipeline);
    const dite = l?.colonne ? cols.find((c) => nu(c.label) === nu(l.colonne!))?.label : undefined;
    const parAvancement = e.avancement ? colonnePour(e.avancement, cols) : null;
    const colonne = dite ?? parAvancement ?? (versLePipeline ? cols[0]?.label : null);
    return colonne ? { pipeline, colonne } : null;
  };

  const compte = useMemo(() => {
    const c = { contacte: 0, repondu: 0, rdv: 0, sans: 0, dejaLa: [] as string[] };
    for (const e of entreprises) {
      if (e.avancement) c[e.avancement]++;
      else c.sans++;
      const fiche = ficheExistante(e, existantes);
      if (fiche || affaireDe(e, fiche ?? null)) c.dejaLa.push(e.nom);
    }
    return c;
    // affaireDe ne lit que `clients`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entreprises, existantes, clients]);
  const inconnus = (fichier?.lignes ?? []).filter((l) => l.avancementInconnu);
  const versPipeline = versLePipeline ? entreprises.length : compte.contacte + compte.repondu + compte.rdv;
  // Une colonne manque dans le pipeline choisi : on le dit avant, pas après. Depuis le
  // Pipeline, il n'en manque jamais : à défaut, l'affaire va dans la 1re colonne.
  const manquantes = pipelineId && !versLePipeline
    ? (["contacte", "rdv"] as const)
        .filter((a) => (a === "contacte" ? compte.contacte + compte.repondu : compte.rdv) > 0 && !colonnePour(a, colonnes))
        .map((a) => (a === "rdv" ? "RDV" : "Contacté"))
    : [];
  // Depuis le Pipeline, un fichier dont chaque ligne dit déjà où aller n'a pas besoin
  // qu'on choisisse un pipeline (un export de la vue Général, par exemple).
  const placeesParLeFichier = versLePipeline && entreprises.length > 0 && entreprises.every((e) => destination(e));
  const pret =
    Boolean(fichier) && (versPipeline === 0 || placeesParLeFichier || (pipelineId && manquantes.length === 0)) && !avance;

  const importer = async () => {
    if (!fichier || !pret) return;
    const par = commercial || user?.email || "";
    const source = `fichier importé (${fichier.nom})`;
    const resultat: Bilan = { creees: 0, completees: [], auPipeline: 0, echecs: [] };
    setAvance({ fait: 0, total: entreprises.length });

    for (const [i, e] of entreprises.entries()) {
      const qui = `${e.nom} (ligne ${e.lignes.map((l) => l.ligne).join(", ")})`;
      try {
        const avecContact = e.lignes.filter((l) => nomInterlocuteur(l));
        const personnes: Personne[] = avecContact.map((l) => ({
          nom: nomInterlocuteur(l)!,
          fonction: l.fonction,
          email: l.email,
          telephone: l.telephone,
          mobile: null,
          source,
          sur: true,
        }));
        const principal = avecContact[0] ?? e.lignes[0];
        const existante = ficheExistante(e, existantes) ?? null;
        const affaire = affaireDe(e, existante);

        let prospect: Prospect | null = existante;
        if (existante) {
          // On complète ce qui manque, sans rien effacer de ce que Merx avait trouvé.
          const connus = new Set([existante.contact_name, ...(existante.personnes ?? []).map((q) => q.nom)].filter(Boolean).map((n) => n!.toLowerCase()));
          const nouvelles = personnes.filter((q) => !connus.has(q.nom.toLowerCase()));
          // Un interlocuteur déjà connu reçoit ce qui lui manquait (fonction, e-mail, téléphone).
          let personnesCompletees = false;
          const anciennes = (existante.personnes ?? []).map((q) => {
            const apport = personnes.find((x) => x.nom.toLowerCase() === q.nom.toLowerCase());
            if (!apport) return q;
            const plus = {
              ...(!q.fonction && apport.fonction ? { fonction: apport.fonction } : {}),
              ...(!q.email && apport.email ? { email: apport.email } : {}),
              ...(!q.telephone && apport.telephone ? { telephone: apport.telephone } : {}),
            };
            if (Object.keys(plus).length) personnesCompletees = true;
            return { ...q, ...plus };
          });
          const patch: Record<string, unknown> = {};
          if (!existante.contact_name && nomInterlocuteur(principal)) {
            Object.assign(patch, { contact_name: nomInterlocuteur(principal), contact_role: principal.fonction, contact_source: source });
          }
          const memeContact = existante.contact_name && nomInterlocuteur(principal)?.toLowerCase() === existante.contact_name.toLowerCase();
          if (!existante.contact_role && memeContact && principal.fonction) patch.contact_role = principal.fonction;
          // Les coordonnées du contact principal ne viennent que de lui : celles d'un autre
          // interlocuteur du fichier iraient sur le mauvais nom.
          const sonContact = memeContact || Boolean(patch.contact_name) || !nomInterlocuteur(principal);
          if (sonContact && !existante.contact_email && principal.email) patch.contact_email = principal.email;
          if (sonContact && !existante.contact_phone && principal.telephone) patch.contact_phone = principal.telephone;
          if (!existante.department && principal.departement) patch.department = principal.departement;
          if ((!existante.sector || existante.sector === "autre") && principal.secteur !== "autre") patch.sector = principal.secteur;
          if (!(existante as Prospect & { referent?: string | null }).referent && commercial) patch.referent = commercial;
          if (nouvelles.length || personnesCompletees) patch.personnes = [...anciennes, ...nouvelles];
          if (Object.keys(patch).length) {
            const { data, error } = await supabaseAdmin.from("admin_prospects").update(patch).eq("id", existante.id).select("*").single();
            if (error) throw new Error(error.message);
            prospect = data as Prospect;
          }
          resultat.completees.push(e.nom);
        } else if (!affaire) {
          const { data, error } = await supabaseAdmin
            .from("admin_prospects")
            .insert({
              name: e.nom,
              department: principal.departement,
              city: principal.ville,
              sector: principal.secteur,
              contact_name: nomInterlocuteur(principal),
              contact_role: nomInterlocuteur(principal) ? principal.fonction : null,
              contact_email: principal.email,
              contact_phone: principal.telephone,
              contact_source: avecContact.length || principal.email || principal.telephone ? source : null,
              // Plusieurs interlocuteurs : la fiche les montre tous.
              personnes: personnes.length > 1 ? personnes : null,
              owner_email: user?.email ?? "",
              referent: commercial || null,
              ...(principal.creeLe ? { created_at: principal.creeLe } : {}),
            })
            .select("*")
            .single();
          if (error) {
            resultat.echecs.push(
              /duplicate key|unique/i.test(error.message)
                ? `${qui} : une fiche de ce nom existe déjà (peut-être à la corbeille) — restaurez-la ou renommez la ligne, puis réimportez`
                : `${qui} : ${error.message}`,
            );
            continue;
          }
          prospect = data as Prospect;
          resultat.creees++;
        }

        // L'historique : seulement les lignes qu'il n'a pas déjà. Il s'accroche à la
        // fiche de Prospection quand elle existe, sinon à l'affaire.
        const candidats = e.lignes.flatMap((l) => echangesDe(l, e.lignes.length > 1));
        if (candidats.length) {
          const deja = await chargerEchanges({ prospectId: prospect?.id, clientId: affaire?.id });
          const ajouts = echangesNouveaux(candidats, deja).map((x) => ({
            ...x,
            ...(prospect ? { prospect_id: prospect.id } : { client_id: affaire!.id }),
            par,
          }));
          if (ajouts.length) {
            const { error } = await supabaseAdmin.from("admin_echanges").insert(ajouts);
            if (error) resultat.echecs.push(`${qui} : historique non enregistré (${error.message})`);
          }
        }

        if (affaire) {
          // Déjà au Pipeline : on complète, on ne déplace pas.
          await completerAffaire(affaire, e);
          // La fiche de Prospection et l'affaire sont la même entreprise mais n'étaient
          // pas reliées : on les relie, la fiche quitte la Prospection et son historique
          // s'affiche sur l'affaire. Seulement si aucune autre fiche ne tient déjà l'affaire.
          if (prospect && !prospect.converted_client_id && !existantes.some((x) => x.converted_client_id === affaire.id)) {
            const { error } = await supabaseAdmin
              .from("admin_prospects")
              .update({ converted_client_id: affaire.id, converted_at: new Date().toISOString() })
              .eq("id", prospect.id);
            if (error) resultat.echecs.push(`${qui} : lien vers l’affaire non posé (${error.message})`);
          }
          if (!existante) resultat.completees.push(e.nom);
          continue;
        }

        if (!prospect || (!versLePipeline && (!e.avancement || !pipelineId))) continue;
        const ou = destination(e);
        if (!ou) {
          resultat.echecs.push(`${qui} : pas de pipeline ou de colonne où la ranger, la fiche reste en Prospection`);
          continue;
        }
        const campagne = e.lignes.find((l) => l.journees != null || l.tarif != null);
        const client: Client = {
          ...clientDepuisProspect(prospect, ou.colonne, ou.pipeline),
          ...(campagne?.journees != null && campagne.journees > 0 ? { jours: campagne.journees } : {}),
          ...(campagne?.tarif != null && campagne.tarif > 0 ? { tarif: campagne.tarif } : {}),
          ...(!prospect.city && principal.ville ? { ville: principal.ville } : {}),
          aRepondu: e.avancement === "repondu",
          contacts: avecContact.length
            ? avecContact.map((l) => ({
                id: uid(),
                name: nomInterlocuteur(l)!,
                prenom: l.interlocuteur!.prenom,
                nom: l.interlocuteur!.nom,
                role: l.fonction || "Contact",
                email: l.email || "—",
                tel: l.telephone || "—",
              }))
            : contactDeLaFiche(prospect),
        };
        if (!(await addClient(client))) {
          resultat.echecs.push(`${qui} : l’affaire n’a pas pu être créée, la fiche reste en Prospection`);
          continue;
        }
        // Le lien se pose après l'affaire : c'est lui qui y reporte le commercial (0039).
        const { error } = await supabaseAdmin
          .from("admin_prospects")
          .update({
            converted_client_id: client.id,
            converted_at: new Date().toISOString(),
            status: e.avancement === "repondu" ? "repondu" : "contacte",
          })
          .eq("id", prospect.id);
        if (error) resultat.echecs.push(`${qui} : lien vers l’affaire non posé (${error.message})`);
        else resultat.auPipeline++;
      } catch (err) {
        resultat.echecs.push(`${qui} : ${err instanceof Error ? err.message : "erreur inconnue"}`);
      } finally {
        setAvance({ fait: i + 1, total: entreprises.length });
      }
    }
    setAvance(null);
    setBilan(resultat);
    await rafraichir();
    await onFini();
  };

  /** Le fichier ne nomme personne : l'interlocuteur déjà sur la fiche suit l'affaire. */
  const contactDeLaFiche = (p: Prospect): Client["contacts"] => {
    const c = contactDepuisProspect(p);
    if (!c) return [];
    return [{
      id: uid(),
      name: [c.prenom, c.nom].filter(Boolean).join(" "),
      prenom: c.prenom,
      nom: c.nom,
      role: c.role || "Contact",
      email: c.email || "—",
      tel: p.contact_phone || "—",
    }];
  };

  /**
   * Une affaire déjà au Pipeline reçoit ce qui lui manque : interlocuteurs nouveaux,
   * cases vides des connus, secteur, ville, commercial, campagne encore à zéro.
   */
  const completerAffaire = async (affaire: Client, e: EntrepriseImportee): Promise<void> => {
    const { ajouts, completes } = contactsACompleter(affaire.contacts, e.lignes);
    for (const a of ajouts) {
      const { error } = await supabaseAdmin.from("admin_client_contacts").insert({
        id: uid(),
        client_id: affaire.id,
        name: [a.prenom, a.nom].filter(Boolean).join(" "),
        prenom: a.prenom || null,
        nom: a.nom || null,
        role: a.role,
        email: a.email,
        tel: a.tel,
      });
      if (error) throw new Error(error.message);
    }
    for (const c of completes) {
      const { error } = await supabaseAdmin.from("admin_client_contacts").update(c.champs).eq("id", c.id);
      if (error) throw new Error(error.message);
    }
    const l = e.lignes[0];
    const campagne = e.lignes.find((x) => x.journees != null || x.tarif != null);
    const patch: Record<string, unknown> = {};
    if (!affaire.secteur && l.secteur !== "autre") patch.secteur = l.secteur;
    if (!affaire.ville && e.lignes.find((x) => x.ville)) patch.ville = e.lignes.find((x) => x.ville)!.ville;
    if (!affaire.referent && commercial) patch.referent = commercial;
    if (!affaire.tarif && campagne?.tarif) patch.tarif = campagne.tarif;
    // 1 journée sans tarif, c'est la campagne posée d'office à l'entrée au Pipeline : vide.
    const joursVides = !affaire.jours || (affaire.jours === 1 && !affaire.tarif);
    if (joursVides && campagne?.journees && campagne.journees > 0) patch.jours = campagne.journees;
    if (Object.keys(patch).length) {
      const { error } = await supabaseAdmin.from("admin_clients").update(patch).eq("id", affaire.id);
      if (error) throw new Error(error.message);
    }
  };

  return (
    <Modal onClose={avance ? () => {} : onClose} width={600}>
      <div className="mb-3 flex items-start justify-between gap-4">
        <h2 className="font-display text-xl font-semibold text-avisdoc-ink">
          {versLePipeline ? "Importer dans le Pipeline" : "Importer un fichier de prospection"}
        </h2>
        {!avance && (
          <button type="button" onClick={onClose} aria-label="Fermer" className="rounded-lg p-1.5 text-muted-foreground hover:text-avisdoc-ink">
            <X className="size-5" />
          </button>
        )}
      </div>

      <input
        ref={fichierRef}
        type="file"
        accept=".xlsx,.xls,.csv"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void lire(f);
          e.target.value = "";
        }}
      />

      {erreur && <div className="mb-3 rounded-2xl bg-rose-50 px-4 py-3 text-[13px] font-semibold text-rose-700">{erreur}</div>}

      {bilan ? (
        <div className="space-y-2 text-[13.5px] text-avisdoc-ink">
          <p>
            <span className="font-bold">{bilan.creees}</span> fiche{bilan.creees > 1 ? "s créées" : " créée"}
            {bilan.auPipeline > 0 && (
              <>
                , dont <span className="font-bold">{bilan.auPipeline}</span> rangée{bilan.auPipeline > 1 ? "s" : ""} dans le pipeline «{" "}
                {pipelines.find((p) => p.id === pipelineId)?.nom} »
              </>
            )}
            .
          </p>
          {bilan.completees.length > 0 && (
            <p className="text-muted-foreground">
              Déjà connue{bilan.completees.length > 1 ? "s" : ""}, complétée{bilan.completees.length > 1 ? "s" : ""} là où il manquait
              quelque chose, sans rien écraser : {bilan.completees.join(", ")}.
            </p>
          )}
          {bilan.echecs.length > 0 && (
            <ul className="max-h-48 overflow-auto rounded-xl bg-rose-50 px-4 py-3 text-[12.5px] text-rose-700">
              {bilan.echecs.map((e) => (
                <li key={e}>{e}</li>
              ))}
            </ul>
          )}
          <div className="border-t border-border pt-4">
            <button type="button" onClick={onClose} className={boutonPrincipal}>
              Fermer
            </button>
          </div>
        </div>
      ) : !fichier ? (
        <>
          <p className="text-[13.5px] leading-relaxed text-muted-foreground">
            Une ligne par entreprise. Partez du modèle : ses colonnes sont reconnues par leur nom. Les dates de contact, de
            relance et de rendez-vous et les commentaires s’inscrivent dans l’historique de chaque fiche.
          </p>
          {versLePipeline ? (
            <p className="mt-2 text-[13.5px] leading-relaxed text-muted-foreground">
              Toutes les entreprises du fichier entrent au Pipeline. Les colonnes{" "}
              <span className="font-semibold text-avisdoc-ink">Pipeline</span> et{" "}
              <span className="font-semibold text-avisdoc-ink">Colonne</span> (celles de l’export) disent où ; à défaut,
              l’Avancement, sinon la première colonne du pipeline choisi.
            </p>
          ) : (
            <p className="mt-2 text-[13.5px] leading-relaxed text-muted-foreground">
              La colonne <span className="font-semibold text-avisdoc-ink">Avancement</span> ({AVANCEMENTS.join(", ")}) range
              l’entreprise dans un pipeline ; vide, elle reste en Prospection.
            </p>
          )}
          <p className="mt-2 text-[13.5px] leading-relaxed text-muted-foreground">
            Un fichier déjà importé peut revenir : rien n’est mis en double, seul ce qui manque est ajouté.
          </p>
          <div className="mt-5 flex flex-wrap gap-2 border-t border-border pt-4">
            <button type="button" onClick={() => fichierRef.current?.click()} className={boutonPrincipal}>
              <Upload className="size-4" /> Choisir mon fichier
            </button>
            <button type="button" onClick={() => void telechargerModeleProspection()} className={boutonSecondaire}>
              <FileSpreadsheet className="size-4" /> Télécharger le modèle
            </button>
          </div>
        </>
      ) : (
        <>
          <p className="text-[13.5px] text-avisdoc-ink">
            <span className="font-bold">{entreprises.length}</span> entreprise{entreprises.length > 1 ? "s" : ""}
            {entreprises.length !== fichier.lignes.length && ` (${fichier.lignes.length} lignes : certaines ont plusieurs interlocuteurs)`} dans{" "}
            <span className="font-semibold">{fichier.nom}</span>
          </p>
          <ul className="mt-2 grid gap-1 text-[13px] text-muted-foreground sm:grid-cols-2">
            {(["contacte", "repondu", "rdv"] as const).map((a) => (
              <li key={a}>
                {LIBELLE[a]} : <span className="font-semibold text-avisdoc-ink">{compte[a]}</span>
              </li>
            ))}
            {!versLePipeline && (
              <li>
                Sans avancement (restent en Prospection) : <span className="font-semibold text-avisdoc-ink">{compte.sans}</span>
              </li>
            )}
          </ul>
          {compte.dejaLa.length > 0 && (
            <p className="mt-2 rounded-xl bg-muted/60 px-3 py-2 text-[12.5px] text-muted-foreground">
              Déjà connues : elles ne seront pas recréées. Seul ce qui leur manque sera ajouté (fiche, interlocuteurs,
              historique), et une affaire déjà au Pipeline reste dans sa colonne : {compte.dejaLa.join(", ")}.
            </p>
          )}
          {inconnus.length > 0 && (
            <p className="mt-2 rounded-xl bg-amber-50 px-3 py-2 text-[12.5px] text-amber-800">
              Avancement non reconnu, ignoré pour ces lignes : {inconnus.map((l) => `ligne ${l.ligne} (« ${l.avancementInconnu} »)`).join(", ")}.
            </p>
          )}

          {versPipeline > 0 && (
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <label className="block">
                <SectionLabel>{versLePipeline ? "Pipeline, si le fichier n’en dit pas" : "Pipeline"}</SectionLabel>
                <select value={pipelineId} onChange={(e) => choisirPipeline(e.target.value)} className={cn(champCls, "mt-1")}>
                  <option value="">Choisir…</option>
                  {pipelines.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.nom}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block">
                <SectionLabel>Commercial</SectionLabel>
                <select value={commercial} onChange={(e) => setCommercial(e.target.value)} className={cn(champCls, "mt-1")}>
                  <option value="">Personne</option>
                  {[...new Set([...membres, ...(commercial ? [commercial] : [])])].map((m) => (
                    <option key={m} value={m}>
                      {nomLisible(m)}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          )}
          {manquantes.length > 0 && (
            <p className="mt-2 text-[12.5px] font-semibold text-rose-700">
              Ce pipeline n’a pas de colonne {manquantes.map((m) => `« ${m} »`).join(" ni ")} : ajoutez-la ou choisissez-en un autre.
            </p>
          )}

          <div className="mt-5 flex flex-wrap items-center gap-2 border-t border-border pt-4">
            <button type="button" onClick={() => void importer()} disabled={!pret} className={boutonPrincipal}>
              {avance ? <Loader2 className="size-4 animate-spin" /> : <Upload className="size-4" />}
              {avance ? `Import… ${avance.fait} / ${avance.total}` : `Importer ${entreprises.length} entreprise${entreprises.length > 1 ? "s" : ""}`}
            </button>
            {!avance && (
              <button type="button" onClick={() => setFichier(null)} className={boutonSecondaire}>
                Autre fichier
              </button>
            )}
          </div>
        </>
      )}
    </Modal>
  );
}
