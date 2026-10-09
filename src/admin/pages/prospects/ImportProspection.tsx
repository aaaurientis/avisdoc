// Importer un fichier de prospection, ou télécharger son modèle.
//
// Trois temps : choisir le fichier, voir ce qui va entrer, l'importer. Rien n'est
// écrit avant le dernier clic. Les entreprises qui ont un « Avancement » entrent
// aussi dans le pipeline choisi — Contacté ou RDV, « A répondu » en pastille.

import { useEffect, useMemo, useRef, useState } from "react";
import { FileSpreadsheet, Loader2, Upload, X } from "lucide-react";
import type { Client } from "../../types";
import { supabaseAdmin } from "../../data/supabaseAdmin";
import { useAdminData } from "../../data/AdminDataContext";
import { useAuth } from "../../auth/AuthContext";
import { Modal, SectionLabel } from "../../components/ui";
import { clientDepuisProspect } from "../../lib/conversion";
import { uid } from "../../lib/format";
import { chargerMembres, nomLisible } from "../../lib/membres";
import { colonnesDe } from "../../lib/ui-tokens";
import type { Prospect } from "../../lib/merx";
import {
  AVANCEMENTS,
  colonnePour,
  COLONNES_MODELE,
  echangesDe,
  ficheExistante,
  lireLignes,
  nomInterlocuteur,
  regrouper,
  type Avancement,
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
}: {
  /** Les fiches déjà en Prospection : une entreprise qui y est déjà est complétée, pas recréée. */
  existantes: Prospect[];
  onClose: () => void;
  onFini: () => Promise<void>;
}) {
  const { user } = useAuth();
  const { pipelines, stages, clients, addClient } = useAdminData();
  const fichierRef = useRef<HTMLInputElement>(null);
  const [fichier, setFichier] = useState<{ nom: string; lignes: LigneProspection[] } | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [membres, setMembres] = useState<string[]>([]);
  const [pipelineId, setPipelineId] = useState("");
  const [commercial, setCommercial] = useState("");
  const [avance, setAvance] = useState<{ fait: number; total: number } | null>(null);
  const [bilan, setBilan] = useState<Bilan | null>(null);

  useEffect(() => {
    void chargerMembres().then(setMembres);
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
  const colonnes = colonnesDe(stages, pipelineId);
  const compte = useMemo(() => {
    const c = { contacte: 0, repondu: 0, rdv: 0, sans: 0, dejaLa: [] as string[] };
    for (const e of entreprises) {
      if (e.avancement) c[e.avancement]++;
      else c.sans++;
      if (ficheExistante(e, existantes)) c.dejaLa.push(e.nom);
    }
    return c;
  }, [entreprises, existantes]);
  const inconnus = (fichier?.lignes ?? []).filter((l) => l.avancementInconnu);
  const versPipeline = compte.contacte + compte.repondu + compte.rdv;
  // Une colonne manque dans le pipeline choisi : on le dit avant, pas après.
  const manquantes = pipelineId
    ? (["contacte", "rdv"] as const)
        .filter((a) => (a === "contacte" ? compte.contacte + compte.repondu : compte.rdv) > 0 && !colonnePour(a, colonnes))
        .map((a) => (a === "rdv" ? "RDV" : "Contacté"))
    : [];
  const pret = Boolean(fichier) && (versPipeline === 0 || (pipelineId && manquantes.length === 0)) && !avance;

  const importer = async () => {
    if (!fichier || !pret) return;
    const par = commercial || user?.email || "";
    const source = `fichier importé (${fichier.nom})`;
    const resultat: Bilan = { creees: 0, completees: [], auPipeline: 0, echecs: [] };
    const presents = new Set(clients.map((c) => c.company.trim().toLowerCase()));
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
        const existante = ficheExistante(e, existantes);

        let prospect: Prospect;
        if (existante) {
          // On complète ce qui manque, sans rien effacer de ce que Merx avait trouvé.
          const connus = new Set([existante.contact_name, ...(existante.personnes ?? []).map((q) => q.nom)].filter(Boolean).map((n) => n!.toLowerCase()));
          const nouvelles = personnes.filter((q) => !connus.has(q.nom.toLowerCase()));
          const patch: Record<string, unknown> = {};
          if (!existante.contact_name && nomInterlocuteur(principal)) {
            Object.assign(patch, { contact_name: nomInterlocuteur(principal), contact_role: principal.fonction, contact_source: source });
          }
          if (!existante.contact_email && principal.email) patch.contact_email = principal.email;
          if (!existante.contact_phone && principal.telephone) patch.contact_phone = principal.telephone;
          if (!existante.department && principal.departement) patch.department = principal.departement;
          if (!(existante as Prospect & { referent?: string | null }).referent && commercial) patch.referent = commercial;
          if (nouvelles.length) patch.personnes = [...(existante.personnes ?? []), ...nouvelles];
          if (Object.keys(patch).length) {
            const { data, error } = await supabaseAdmin.from("admin_prospects").update(patch).eq("id", existante.id).select("*").single();
            if (error) throw new Error(error.message);
            prospect = data as Prospect;
          } else prospect = existante;
          resultat.completees.push(e.nom);
        } else {
          const { data, error } = await supabaseAdmin
            .from("admin_prospects")
            .insert({
              name: e.nom,
              department: principal.departement,
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
                ? `${qui} : une fiche de ce nom est à la corbeille — restaurez-la puis réimportez`
                : `${qui} : ${error.message}`,
            );
            continue;
          }
          prospect = data as Prospect;
          resultat.creees++;
        }

        const echanges = e.lignes.flatMap((l) => echangesDe(l, e.lignes.length > 1)).map((x) => ({ ...x, prospect_id: prospect.id, par }));
        if (echanges.length) {
          const { error } = await supabaseAdmin.from("admin_echanges").insert(echanges);
          if (error) resultat.echecs.push(`${qui} : historique non enregistré (${error.message})`);
        }

        if (!e.avancement || !pipelineId) continue;
        // Une même entreprise n'existe qu'une fois dans le Pipeline.
        if (prospect.converted_client_id || presents.has(prospect.name.trim().toLowerCase())) {
          resultat.echecs.push(`${qui} : déjà dans le Pipeline, l’historique y a été ajouté`);
          continue;
        }
        const client: Client = {
          ...clientDepuisProspect(prospect, colonnePour(e.avancement, colonnes)!, pipelineId),
          aRepondu: e.avancement === "repondu",
          contacts: avecContact.map((l) => ({
            id: uid(),
            name: nomInterlocuteur(l)!,
            prenom: l.interlocuteur!.prenom,
            nom: l.interlocuteur!.nom,
            role: l.fonction || "Contact",
            email: l.email || "—",
            tel: l.telephone || "—",
          })),
        };
        if (!(await addClient(client))) {
          resultat.echecs.push(`${qui} : l’affaire n’a pas pu être créée, la fiche reste en Prospection`);
          continue;
        }
        presents.add(prospect.name.trim().toLowerCase());
        // Le lien se pose après l'affaire : c'est lui qui y reporte le commercial (0039).
        const { error } = await supabaseAdmin
          .from("admin_prospects")
          .update({
            converted_client_id: client.id,
            converted_at: new Date().toISOString(),
            status: e.avancement === "contacte" ? "contacte" : "repondu",
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
    await onFini();
  };

  return (
    <Modal onClose={avance ? () => {} : onClose} width={600}>
      <div className="mb-3 flex items-start justify-between gap-4">
        <h2 className="font-display text-xl font-semibold text-avisdoc-ink">Importer un fichier de prospection</h2>
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
              Déjà en Prospection, complétée{bilan.completees.length > 1 ? "s" : ""} sans être recréée
              {bilan.completees.length > 1 ? "s" : ""} : {bilan.completees.join(", ")}.
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
          <p className="mt-2 text-[13.5px] leading-relaxed text-muted-foreground">
            La colonne <span className="font-semibold text-avisdoc-ink">Avancement</span> ({AVANCEMENTS.join(", ")}) range
            l’entreprise dans un pipeline ; vide, elle reste en Prospection.
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
            <li>
              Sans avancement (restent en Prospection) : <span className="font-semibold text-avisdoc-ink">{compte.sans}</span>
            </li>
          </ul>
          {compte.dejaLa.length > 0 && (
            <p className="mt-2 rounded-xl bg-muted/60 px-3 py-2 text-[12.5px] text-muted-foreground">
              Déjà en Prospection, elles seront complétées sans être recréées : {compte.dejaLa.join(", ")}.
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
                <SectionLabel>Pipeline</SectionLabel>
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
