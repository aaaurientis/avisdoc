// Clients — le fichier commun à l’équipe, en tableau ou en kanban par secteur.
// Le tableau est en LECTURE SEULE : on ne modifie jamais une information par mégarde.
// Chaque ligne a son crayon (formulaire de modification) et sa corbeille (avec confirmation).
// Les trois colonnes du socle (Établissement, Date, Secteur) ont leur champ propre en base ;
// toutes les autres vivent dans `data`, sous la clé de leur colonne.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Columns3, Download, LayoutGrid, List, Pencil, Plus, Search, Trash2, Upload } from "lucide-react";
import type { Account, AccountField } from "../types";
import { useAdminData } from "../data/AdminDataContext";
import { supabaseAdmin } from "../data/supabaseAdmin";
import FiltresClients, { FILTRES_COMPTE_VIDES, retenueCompte, type FiltresCompte } from "./clients/FiltresClients";
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

const SANS_SECTEUR = "Sans secteur";

export default function FichierClient() {
  const { accounts, accountFields, addManyAccounts, deleteAccount } = useAdminData();
  const [recherche, setRecherche] = useState("");
  const [filtres, setFiltres] = useState<FiltresCompte>(FILTRES_COMPTE_VIDES);
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
  const secteurs = useMemo(() => {
    const noms = [...new Set(visibles.map((a) => (a.sector ?? "").trim()).filter(Boolean))].sort((x, y) =>
      x.localeCompare(y, "fr"),
    );
    const sans = visibles.some((a) => !(a.sector ?? "").trim());
    return sans ? [...noms, SANS_SECTEUR] : noms;
  }, [visibles]);

  /** Export de ce qui est affiché : mêmes colonnes, mêmes lignes, même ordre. */
  const exporter = async () => {
    const XLSX = await import("xlsx");
    const lignes = visibles.map((a) => Object.fromEntries(accountFields.map((f) => [f.label, valeur(a, f)])));
    const feuille = XLSX.utils.json_to_sheet(lignes, { header: accountFields.map((f) => f.label) });
    const classeur = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(classeur, feuille, "Clients");
    XLSX.writeFile(classeur, `clients-avisdoc-${new Date().toISOString().slice(0, 10)}.xlsx`);
  };

  /** Import : les colonnes sont reconnues par leur nom ; celles qu’on ne connaît pas sont ignorées. */
  const importer = async (file: File) => {
    setMessage(null);
    try {
      const XLSX = await import("xlsx");
      const classeur = XLSX.read(await file.arrayBuffer(), { cellDates: true });
      const feuille = classeur.Sheets[classeur.SheetNames[0]];
      const lignes = XLSX.utils.sheet_to_json<Record<string, unknown>>(feuille, { defval: "" });

      const parLabel = new Map(accountFields.map((f) => [f.label.toLowerCase().trim(), f]));
      const inconnues = new Set<string>();
      const fiches = lignes.map((ligne) => {
        const data: Record<string, string> = {};
        let name = "";
        let signedOn: string | null = null;
        let sector: string | null = null;
        for (const [entete, brut] of Object.entries(ligne)) {
          const champ = parLabel.get(entete.toLowerCase().trim());
          if (!champ) {
            if (entete.trim()) inconnues.add(entete.trim());
            continue;
          }
          const v = brut instanceof Date ? brut.toISOString().slice(0, 10) : String(brut ?? "").trim();
          if (champ.key === "etablissement") name = v;
          else if (champ.key === "date_client") signedOn = v || null;
          else if (champ.key === "secteur") sector = v || null;
          else if (v) data[champ.key] = v;
        }
        return { name, signedOn, sector, data };
      });

      const retenues = fiches.filter((f) => f.name);
      addManyAccounts(retenues);
      const ignorees = fiches.length - retenues.length;
      setMessage(
        [
          `${retenues.length} fiche${retenues.length > 1 ? "s ajoutées" : " ajoutée"}`,
          ignorees > 0 && `${ignorees} ligne${ignorees > 1 ? "s" : ""} sans établissement ignorée${ignorees > 1 ? "s" : ""}`,
          inconnues.size > 0 && `colonnes non reconnues : ${[...inconnues].slice(0, 4).join(", ")}`,
        ]
          .filter(Boolean)
          .join(" · "),
      );
    } catch (e) {
      setMessage(`Le fichier n’a pas pu être lu : ${e instanceof Error ? e.message : "format inattendu"}`);
    }
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
            <button type="button" onClick={() => fichierRef.current?.click()} className={boutonSecondaire}>
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
          if (f) void importer(f);
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
        <div className="overflow-x-auto rounded-2xl border border-border bg-card">
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
          className="ad-kanban grid gap-3 overflow-x-auto pb-1"
          style={{ gridTemplateColumns: `repeat(${Math.max(secteurs.length, 1)}, minmax(300px, 380px))` }}
        >
          {secteurs.map((secteur) => {
            const liste = visibles.filter((a) =>
              secteur === SANS_SECTEUR ? !(a.sector ?? "").trim() : (a.sector ?? "").trim() === secteur,
            );
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
