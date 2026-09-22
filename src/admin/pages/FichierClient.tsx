// Clients — le fichier commun à l’équipe, en tableau ou en kanban par secteur.
// Le tableau est en LECTURE SEULE : on ne modifie jamais une information par mégarde.
// Chaque ligne a son crayon (formulaire de modification) et sa corbeille (avec confirmation).
// Les trois colonnes du socle (Établissement, Date, Secteur) ont leur champ propre en base ;
// toutes les autres vivent dans `data`, sous la clé de leur colonne.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Columns3, Download, FileSpreadsheet, LayoutGrid, List, Pencil, Plus, Search, Trash2, Upload } from "lucide-react";
import type { Account, AccountField, FieldType } from "../types";
import { useAdminData } from "../data/AdminDataContext";
import { supabaseAdmin } from "../data/supabaseAdmin";
import FiltresClients, { FILTRES_COMPTE_VIDES, retenueCompte, type FiltresCompte } from "./clients/FiltresClients";
import ApercuImport from "./clients/ApercuImport";
import { proposer, type Correspondance } from "../lib/import-colonnes";
import { COLONNE_KANBAN } from "../lib/ui-tokens";
import { Badge, Modal, PageHeader, SectionLabel } from "../components/ui";
import { tonNote } from "../lib/merx";
import ColonnesClient from "./clients/ColonnesClient";
import FicheClient from "./clients/FicheClient";
import { cn } from "@/lib/utils";

/** Valeur d’une case : les trois colonnes du socle ont leur champ, les autres sont dans `data`. */
function valeur(a: Account, f: AccountField): string {
  if (f.key === "etablissement") return a.name;
  if (f.key === "date_client") return a.signedOn ?? "";
  if (f.key === "secteur") return a.sector ?? "";
  return a.data[f.key] ?? "";
}

/** Une date se lit en français ; le reste s’affiche tel quel. */
function affiche(a: Account, f: AccountField): string {
  const v = valeur(a, f);
  if (!v) return "";
  if (f.type === "date") {
    const d = new Date(v);
    return Number.isNaN(d.getTime()) ? v : d.toLocaleDateString("fr-FR");
  }
  return v;
}

const SANS_VALEUR = "Non renseigné";

/** Une cellule Excel peut être une date, un nombre ou du texte : on la lit toujours en texte. */
const texteCellule = (v: unknown) =>
  v instanceof Date ? v.toISOString().slice(0, 10) : String(v ?? "").trim();

/** Regrouper par mois plutôt que par date : une colonne par jour n’aurait aucun sens. */
const MOIS_ENTREE = "__mois";

const moisDe = (iso: string | null) =>
  iso && !Number.isNaN(new Date(iso).getTime())
    ? new Date(iso).toLocaleDateString("fr-FR", { month: "long", year: "numeric" })
    : SANS_VALEUR;

export default function FichierClient() {
  const { accounts, accountFields, addManyAccounts, addFields, deleteAccount } = useAdminData();
  const [recherche, setRecherche] = useState("");
  const [filtres, setFiltres] = useState<FiltresCompte>(FILTRES_COMPTE_VIDES);
  const [groupePar, setGroupePar] = useState("secteur");
  const [importOuvert, setImportOuvert] = useState(false);
  const [aImporter, setAImporter] = useState<{
    nom: string;
    lignes: Record<string, unknown>[];
    correspondances: Correspondance[];
  } | null>(null);
  const [origines, setOrigines] = useState<Map<string, { score_total: number | null; activity: string | null; rationale: string | null }>>(
    new Map(),
  );

  /** Ce que Merx avait trouvé pour ces clients : la carte dit la même chose qu’ailleurs. */
  useEffect(() => {
    let vivant = true;
    void supabaseAdmin
      .from("admin_prospects")
      .select("converted_client_id, score_total, activity, rationale")
      .not("converted_client_id", "is", null)
      .then(({ data }) => {
        if (!vivant || !data) return;
        setOrigines(
          new Map(
            (data as { converted_client_id: string; score_total: number | null; activity: string | null; rationale: string | null }[]).map(
              (p) => [p.converted_client_id, { score_total: p.score_total, activity: p.activity, rationale: p.rationale }],
            ),
          ),
        );
      });
    return () => {
      vivant = false;
    };
  }, []);

  /** Ce que Merx sait d’une fiche, par le lien de conversion. */
  const origineDe = useCallback((a: Account) => (a.clientId ? origines.get(a.clientId) : undefined), [origines]);
  // Le tableau d’abord : c’est la vue commune à la prospection et au Pipeline.
  const [vue, setVue] = useState<"liste" | "kanban">("kanban");
  const [colonnes, setColonnes] = useState(false);
  const [fiche, setFiche] = useState<{ compte?: Account; mode: "lecture" | "edition" } | null>(null);
  const [aSupprimer, setASupprimer] = useState<Account | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const fichierRef = useRef<HTMLInputElement>(null);

  const visibles = useMemo(
    () => accounts.filter((a) => retenueCompte(a, filtres, recherche, Boolean(origineDe(a)))),
    [accounts, filtres, origineDe, recherche],
  );

  /** Tous les secteurs du fichier, pour le filtre — pas seulement ceux qui restent affichés. */
  const tousSecteurs = useMemo(
    () => [...new Set(accounts.map((a) => (a.sector ?? "").trim()).filter(Boolean))].sort((x, y) => x.localeCompare(y, "fr")),
    [accounts],
  );

  /** Colonnes du kanban : les secteurs réellement utilisés, puis les fiches sans secteur. */
  /** La valeur qui range une fiche dans sa colonne, selon le regroupement choisi. */
  const valeurGroupe = useCallback(
    (a: Account) => {
      if (groupePar === MOIS_ENTREE) return moisDe(a.signedOn);
      if (groupePar === "secteur") return (a.sector ?? "").trim() || SANS_VALEUR;
      if (groupePar === "date_client") return moisDe(a.signedOn);
      return (a.data[groupePar] ?? "").trim() || SANS_VALEUR;
    },
    [groupePar],
  );

  /** Les colonnes du tableau : les valeurs réellement présentes, « Non renseigné » à la fin. */
  const secteurs = useMemo(() => {
    const vues = [...new Set(visibles.map(valeurGroupe))];
    const renseignees = vues.filter((v) => v !== SANS_VALEUR);
    // Les mois se lisent du plus récent au plus ancien ; le reste par ordre alphabétique.
    if (groupePar === MOIS_ENTREE || groupePar === "date_client") {
      const dateDe = (v: string) => {
        const a = visibles.find((x) => valeurGroupe(x) === v);
        return a?.signedOn ? new Date(a.signedOn).getTime() : 0;
      };
      renseignees.sort((x, y) => dateDe(y) - dateDe(x));
    } else {
      renseignees.sort((x, y) => x.localeCompare(y, "fr"));
    }
    return vues.includes(SANS_VALEUR) ? [...renseignees, SANS_VALEUR] : renseignees;
  }, [groupePar, valeurGroupe, visibles]);

  /** Ce par quoi on peut ranger : le mois d’entrée, et toute colonne du fichier sauf le nom. */
  const regroupements = useMemo(
    () => [
      { cle: MOIS_ENTREE, label: "Mois d’entrée" },
      ...accountFields
        .filter((f) => f.key !== "etablissement" && f.key !== "date_client")
        .map((f) => ({ cle: f.key, label: f.label })),
    ],
    [accountFields],
  );

  /** Export de ce qui est affiché : mêmes colonnes, mêmes lignes, même ordre. */
  const exporter = async () => {
    const XLSX = await import("xlsx");
    const lignes = visibles.map((a) => Object.fromEntries(accountFields.map((f) => [f.label, valeur(a, f)])));
    const feuille = XLSX.utils.json_to_sheet(lignes, { header: accountFields.map((f) => f.label) });
    const classeur = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(classeur, feuille, "Clients");
    XLSX.writeFile(classeur, `clients-avisdoc-${new Date().toISOString().slice(0, 10)}.xlsx`);
  };

  /**
   * Le modèle d'import : les en-têtes attendus, et une ligne d'exemple pour montrer
   * le format de chaque colonne. Comme l'import reconnaît les colonnes par leur
   * libellé, le modèle porte exactement ceux du fichier du moment.
   */
  const telechargerModele = async () => {
    const XLSX = await import("xlsx");
    const aujourdhui = new Date().toISOString().slice(0, 10);
    const exemple = (f: AccountField) => {
      if (f.key === "etablissement") return "Clinique du Parc";
      if (f.type === "date") return aujourdhui;
      if (f.type === "email") return "contact@clinique-du-parc.fr";
      if (f.type === "telephone") return "01 23 45 67 89";
      if (f.type === "nombre") return "3";
      if (f.type === "lien") return "https://clinique-du-parc.fr";
      if (f.key === "secteur") return "Clinique";
      return "À compléter";
    };
    const entetes = accountFields.map((f) => f.label);
    const feuille = XLSX.utils.json_to_sheet([Object.fromEntries(accountFields.map((f) => [f.label, exemple(f)]))], {
      header: entetes,
    });
    feuille["!cols"] = entetes.map((e) => ({ wch: Math.max(14, e.length + 4) }));
    const classeur = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(classeur, feuille, "Modèle");
    XLSX.writeFile(classeur, "modele-import-clients-avisdoc.xlsx");
    setImportOuvert(false);
    setMessage("Modèle téléchargé. Remplacez la ligne d’exemple par vos clients, puis importez-le.");
  };

  /**
   * Lire le fichier et proposer une destination par colonne. Rien n'entre encore :
   * l'aperçu montre où va quoi, et se corrige.
   */
  const lireLeFichier = async (file: File) => {
    setMessage(null);
    try {
      const XLSX = await import("xlsx");
      const classeur = XLSX.read(await file.arrayBuffer(), { cellDates: true, codepage: 65001 });
      const feuille = classeur.Sheets[classeur.SheetNames[0]];
      const lignes = XLSX.utils.sheet_to_json<Record<string, unknown>>(feuille, { defval: "" });
      if (lignes.length === 0) {
        setMessage("Le fichier ne contient aucune ligne.");
        return;
      }
      const entetes = Object.keys(lignes[0]).filter((e) => e.trim());
      const valeursPar = (entete: string) => lignes.map((l) => texteCellule(l[entete]));
      setAImporter({ nom: file.name, lignes, correspondances: proposer(entetes, valeursPar, accountFields) });
    } catch (e) {
      setMessage(`Le fichier n’a pas pu être lu : ${e instanceof Error ? e.message : "format inattendu"}`);
    }
  };

  /** L'aperçu a été validé : on crée les colonnes retenues, puis les fiches. */
  const importer = (choisies: Correspondance[]) => {
    if (!aImporter) return;
    const { lignes } = aImporter;

    const aCreer = choisies
      .filter((c) => c.destination.sorte === "nouvelle")
      .map((c) => ({ label: c.entete.trim(), type: (c.destination as { type: FieldType }).type }));
    const nouvelles = aCreer.length > 0 ? addFields(aCreer) : new Map<string, string>();

    const enteteNom = choisies.find((c) => c.destination.sorte === "nom")?.entete ?? "";

    const fiches = lignes.map((ligne) => {
      const data: Record<string, string> = {};
      let name = "";
      let signedOn: string | null = null;
      let sector: string | null = null;
      for (const c of choisies) {
        const v = texteCellule(ligne[c.entete]);
        if (c.entete === enteteNom) {
          name = v;
          continue;
        }
        if (c.destination.sorte === "ignorer" || !v) continue;
        const cle =
          c.destination.sorte === "existante" ? c.destination.champ.key : nouvelles.get(c.entete.trim());
        if (!cle) continue;
        if (cle === "date_client") signedOn = v;
        else if (cle === "secteur") sector = v;
        else data[cle] = v;
      }
      return { name, signedOn, sector, data };
    });

    const retenues = fiches.filter((f) => f.name);
    addManyAccounts(retenues);
    const ignorees = fiches.length - retenues.length;
    setAImporter(null);
    setMessage(
      [
        `${retenues.length} fiche${retenues.length > 1 ? "s ajoutées" : " ajoutée"}`,
        aCreer.length > 0 && `${aCreer.length} colonne${aCreer.length > 1 ? "s créées" : " créée"} : ${aCreer.map((c) => c.label).join(", ")}`,
        ignorees > 0 && `${ignorees} ligne${ignorees > 1 ? "s" : ""} sans nom ignorée${ignorees > 1 ? "s" : ""}`,
      ]
        .filter(Boolean)
        .join(" · "),
    );
  };

  const boutonSecondaire =
    "inline-flex items-center gap-1.5 rounded-full border border-border px-4 py-2.5 text-sm font-bold text-avisdoc-ink transition-colors hover:border-avisdoc-teal";

  return (
    <div>
      <PageHeader
        title="Clients"
        subtitle={`${accounts.length} fiche${accounts.length > 1 ? "s" : ""} — le fichier commun de l’équipe`}
        action={
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" onClick={() => setColonnes(true)} className={boutonSecondaire}>
              <Columns3 className="size-4" /> Colonnes
            </button>
            <button type="button" onClick={() => setImportOuvert(true)} className={boutonSecondaire}>
              <Upload className="size-4" /> Importer
            </button>
            <button type="button" onClick={() => void exporter()} className={boutonSecondaire}>
              <Download className="size-4" /> Exporter
            </button>
            <button
              type="button"
              onClick={() => setFiche({ mode: "edition" })}
              className="ad-btn-accent inline-flex items-center gap-1.5 rounded-full bg-avisdoc-teal px-5 py-2.5 text-sm font-bold text-white"
            >
              <Plus className="size-4" /> Nouveau client
            </button>
          </div>
        }
      />

      <input
        ref={fichierRef}
        type="file"
        accept=".xlsx,.xls,.csv"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void lireLeFichier(f);
          e.target.value = "";
        }}
      />

      {message && (
        <div className="mb-4 rounded-2xl bg-sky-100 px-4 py-3 text-[13px] font-semibold text-sky-700">{message}</div>
      )}

      {/* Recherche + bascule des vues */}
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="relative min-w-[220px] max-w-md flex-1">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <input
            value={recherche}
            onChange={(e) => setRecherche(e.target.value)}
            placeholder="Rechercher un client…"
            className="ad-input w-full rounded-full border border-border bg-card py-2.5 pl-10 pr-4 text-[13px] outline-none transition-colors focus:border-avisdoc-teal"
          />
        </div>
        <FiltresClients filtres={filtres} onChange={setFiltres} secteurs={tousSecteurs} />
        {vue === "kanban" && (
          <select
            value={groupePar}
            onChange={(e) => setGroupePar(e.target.value)}
            aria-label="Regrouper par"
            className="ad-input rounded-full border border-border bg-card px-4 py-2 text-[13px] font-semibold text-avisdoc-ink outline-none transition-colors focus:border-avisdoc-teal"
          >
            {regroupements.map((r) => (
              <option key={r.cle} value={r.cle}>
                Par {r.label.toLowerCase()}
              </option>
            ))}
          </select>
        )}
        <div className="flex items-center gap-1 rounded-full border border-border bg-card p-1">
          {([
            { id: "liste", label: "Liste", Icone: List },
            { id: "kanban", label: "Kanban", Icone: LayoutGrid },
          ] as const).map(({ id, label, Icone }) => (
            <button
              key={id}
              type="button"
              onClick={() => setVue(id)}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-[13px] font-bold transition-colors",
                vue === id ? "bg-avisdoc-ink text-white" : "text-muted-foreground hover:text-avisdoc-ink",
              )}
            >
              <Icone className="size-4" /> {label}
            </button>
          ))}
        </div>
      </div>

      {visibles.length === 0 ? (
        <div className="rounded-2xl bg-muted/60 p-8 text-center">
          <SectionLabel>{accounts.length === 0 ? "Fichier vide" : "Aucun résultat"}</SectionLabel>
          <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-muted-foreground">
            {accounts.length === 0
              ? "Ajoutez un client, ou importez votre fichier Excel : les colonnes sont reconnues par leur nom."
              : "Aucune fiche ne correspond à cette recherche."}
          </p>
        </div>
      ) : vue === "liste" ? (
        /* ── Tableau, en lecture seule ── */
        <div className="overflow-x-auto overscroll-x-contain rounded-2xl border border-border bg-card">
          <table className="w-full min-w-[720px] border-collapse">
            <thead>
              <tr className="border-b border-border bg-muted/50">
                {accountFields.map((f) => (
                  <th
                    key={f.id}
                    className="whitespace-nowrap px-4 py-2.5 text-left text-[11px] font-bold uppercase tracking-[0.05em] text-muted-foreground"
                  >
                    {f.label}
                  </th>
                ))}
                <th className="w-20" />
              </tr>
            </thead>
            <tbody>
              {visibles.map((a) => (
                <tr
                  key={a.id}
                  onClick={() => setFiche({ compte: a, mode: "lecture" })}
                  className="cursor-pointer border-b border-border last:border-0 hover:bg-muted/30"
                >
                  {accountFields.map((f) => (
                    <td
                      key={f.id}
                      className={cn(
                        "px-4 py-2.5 text-[13px] text-avisdoc-ink",
                        f.key === "etablissement" && "font-semibold",
                        !affiche(a, f) && "text-muted-foreground/50",
                      )}
                    >
                      {affiche(a, f) || "—"}
                    </td>
                  ))}
                  <td className="whitespace-nowrap px-2" onClick={(e) => e.stopPropagation()}>
                    <button
                      type="button"
                      onClick={() => setFiche({ compte: a, mode: "edition" })}
                      aria-label={`Modifier ${a.name}`}
                      title="Modifier"
                      className="rounded-lg p-1.5 text-muted-foreground transition-colors hover:text-avisdoc-teal"
                    >
                      <Pencil className="size-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => setASupprimer(a)}
                      aria-label={`Supprimer ${a.name}`}
                      title="Supprimer"
                      className="rounded-lg p-1.5 text-muted-foreground transition-colors hover:text-rose-700"
                    >
                      <Trash2 className="size-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        /* ── Kanban par secteur ── */
        <div
          className="ad-kanban grid gap-3 overflow-x-auto overscroll-x-contain pb-1"
          style={{ gridTemplateColumns: `repeat(${Math.max(secteurs.length, 1)}, minmax(300px, 380px))` }}
        >
          {secteurs.map((secteur) => {
            const liste = visibles.filter((a) => valeurGroupe(a) === secteur);
            return (
              <div key={secteur} className={COLONNE_KANBAN}>
                <div className="mb-2.5 flex items-center justify-between gap-2">
                  <div className="truncate text-xs font-bold uppercase tracking-[0.05em] text-muted-foreground">
                    {secteur}
                  </div>
                  <span className="shrink-0 rounded-full bg-card px-2 py-0.5 text-[11px] font-bold text-muted-foreground">
                    {liste.length}
                  </span>
                </div>
                <div className="flex flex-1 flex-col gap-2">
                  {liste.map((a) => {
                    // Sur la carte : les premières colonnes renseignées, hors établissement et secteur.
                    const infos = accountFields
                      .filter((f) => f.key !== "etablissement" && f.key !== "secteur" && affiche(a, f))
                      .slice(0, 4);
                    return (
                      <div
                        key={a.id}
                        onClick={() => setFiche({ compte: a, mode: "lecture" })}
                        className="group cursor-pointer rounded-xl border border-border bg-card p-3 transition-colors hover:border-avisdoc-teal"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0 text-[13px] font-semibold leading-snug text-avisdoc-ink">{a.name}</div>
                          {origineDe(a) && (
                            <Badge className={`${tonNote(origineDe(a)!.score_total)} shrink-0`}>
                              {origineDe(a)!.score_total ?? "—"}
                            </Badge>
                          )}
                          <div
                            className="flex shrink-0 items-center opacity-0 transition-opacity group-hover:opacity-100"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <button
                              type="button"
                              onClick={() => setFiche({ compte: a, mode: "edition" })}
                              aria-label={`Modifier ${a.name}`}
                              className="rounded-lg p-1 text-muted-foreground hover:text-avisdoc-teal"
                            >
                              <Pencil className="size-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => setASupprimer(a)}
                              aria-label={`Supprimer ${a.name}`}
                              className="rounded-lg p-1 text-muted-foreground hover:text-rose-700"
                            >
                              <Trash2 className="size-3.5" />
                            </button>
                          </div>
                        </div>
                        <div className="mt-0.5 truncate text-[11.5px] text-muted-foreground">
                          {[origineDe(a)?.activity, a.sector].filter(Boolean).join(" · ") || "—"}
                        </div>
                        {origineDe(a)?.rationale && (
                          <p className="mt-2 line-clamp-2 text-[12px] leading-snug text-muted-foreground">
                            {origineDe(a)!.rationale}
                          </p>
                        )}
                        {infos.map((f) => (
                          <div key={f.id} className="mt-1 truncate text-[11.5px] text-muted-foreground">
                            <span className="text-muted-foreground/70">{f.label} · </span>
                            {affiche(a, f)}
                          </div>
                        ))}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {importOuvert && (
        <Modal onClose={() => setImportOuvert(false)} width={520}>
          <h2 className="font-display text-xl font-semibold text-avisdoc-ink">Importer un fichier Excel</h2>
          <p className="mt-2 text-[13.5px] text-muted-foreground">Votre fichier doit ressembler à ceci :</p>

          {/* Montrer vaut mieux qu’expliquer : l’exemple dit la règle à lui seul. */}
          <div className="mt-2 overflow-hidden rounded-xl border border-border">
            <table className="w-full border-collapse text-left">
              <thead>
                <tr className="border-b border-border bg-muted/40">
                  {["Nom", "Ville", "Téléphone"].map((e) => (
                    <th key={e} className="px-3 py-2 text-[12px] font-bold text-avisdoc-ink">
                      {e}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {[
                  ["Clinique des Cèdres", "Toulouse", "05 61 22 30 40"],
                  ["Hôpital Saint-Joseph", "Marseille", "04 91 80 65 00"],
                ].map((ligne) => (
                  <tr key={ligne[0]} className="border-b border-border last:border-0">
                    {ligne.map((v) => (
                      <td key={v} className="px-3 py-2 text-[12.5px] text-muted-foreground">
                        {v}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <ul className="mt-3 space-y-1.5">
            {[
              "La première ligne donne le nom des colonnes.",
              "Ensuite, une ligne par client.",
              "Mettez toutes vos colonnes : celles qui n’existent pas ici seront ajoutées.",
            ].map((t) => (
              <li key={t} className="flex gap-2 text-[13px] leading-snug text-muted-foreground">
                <span className="mt-[7px] size-1.5 shrink-0 rounded-full bg-avisdoc-teal" />
                {t}
              </li>
            ))}
          </ul>

          <p className="mt-3 text-[13px] leading-relaxed text-muted-foreground">
            Une seule colonne est indispensable : celle du <span className="font-semibold text-avisdoc-ink">nom de
            l’entreprise</span>. Si elle ne s’appelle pas « Nom », « Établissement » ou « Raison sociale », c’est la
            première colonne qui sera prise.
          </p>

          <div className="mt-5 flex flex-wrap gap-2 border-t border-border pt-4">
            <button
              type="button"
              onClick={() => {
                setImportOuvert(false);
                fichierRef.current?.click();
              }}
              className="ad-btn-accent inline-flex items-center gap-1.5 rounded-full bg-avisdoc-teal px-5 py-2.5 text-sm font-bold text-white"
            >
              <Upload className="size-4" /> Choisir mon fichier
            </button>
            <button
              type="button"
              onClick={() => void telechargerModele()}
              className="inline-flex items-center gap-1.5 rounded-full border border-border px-5 py-2.5 text-sm font-bold text-avisdoc-ink transition-colors hover:border-avisdoc-teal"
            >
              <FileSpreadsheet className="size-4" /> Télécharger un modèle
            </button>
            <button
              type="button"
              onClick={() => setImportOuvert(false)}
              className="rounded-full border border-border px-5 py-2.5 text-sm font-bold text-muted-foreground transition-colors hover:border-avisdoc-ink hover:text-avisdoc-ink"
            >
              Annuler
            </button>
          </div>
          <p className="mt-3 text-[12px] text-muted-foreground">
            Le modèle sert si vous partez de zéro : c’est un fichier vide aux colonnes d’aujourd’hui.
          </p>
        </Modal>
      )}

      {aImporter && (
        <ApercuImport
          fichier={aImporter.nom}
          lignes={aImporter.lignes.length}
          correspondances={aImporter.correspondances}
          champs={accountFields}
          onAnnuler={() => setAImporter(null)}
          onValider={importer}
        />
      )}

      {colonnes && <ColonnesClient onClose={() => setColonnes(false)} />}
      {fiche && <FicheClient fiche={fiche.compte} mode={fiche.mode} onClose={() => setFiche(null)} />}
      {aSupprimer && (
        <Modal onClose={() => setASupprimer(null)} width={440}>
          <h2 className="font-display text-xl font-semibold text-avisdoc-ink">Supprimer ce client ?</h2>
          <p className="mt-2 text-[13.5px] leading-relaxed text-muted-foreground">
            <span className="font-semibold text-avisdoc-ink">{aSupprimer.name}</span> et toutes ses informations
            seront retirés du fichier. Cette suppression ne se défait pas.
          </p>
          <div className="mt-5 flex gap-2">
            <button
              type="button"
              onClick={() => {
                deleteAccount(aSupprimer.id);
                setASupprimer(null);
              }}
              className="inline-flex items-center gap-1.5 rounded-full bg-avisdoc-coral px-5 py-2.5 text-sm font-bold text-white"
            >
              <Trash2 className="size-4" /> Supprimer
            </button>
            <button
              type="button"
              onClick={() => setASupprimer(null)}
              className="rounded-full border border-border px-5 py-2.5 text-sm font-bold text-muted-foreground transition-colors hover:border-avisdoc-ink hover:text-avisdoc-ink"
            >
              Annuler
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}
