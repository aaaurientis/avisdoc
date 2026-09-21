// Clients — le fichier commun à l’équipe, comme un tableur.
// Chacun remplit les cases, ajoute ses colonnes, importe un fichier Excel ou exporte l’affiché.
// Les trois colonnes du socle (Établissement, Date, Secteur) ont leur champ propre en base ;
// toutes les autres vivent dans `data`, sous la clé de leur colonne.

import { useMemo, useRef, useState } from "react";
import { Columns3, Download, Plus, Search, Trash2, Upload } from "lucide-react";
import type { Account, AccountField } from "../types";
import { useAdminData } from "../data/AdminDataContext";
import { PageHeader } from "../components/ui";
import ColonnesClient from "./clients/ColonnesClient";
import { cn } from "@/lib/utils";

/** Valeur d’une case : les trois colonnes du socle ont leur champ, les autres sont dans `data`. */
function valeur(a: Account, f: AccountField): string {
  if (f.key === "etablissement") return a.name;
  if (f.key === "date_client") return a.signedOn ?? "";
  if (f.key === "secteur") return a.sector ?? "";
  return a.data[f.key] ?? "";
}

const inputType = (t: AccountField["type"]) =>
  t === "date" ? "date" : t === "nombre" ? "number" : t === "email" ? "email" : t === "telephone" ? "tel" : "text";

export default function FichierClient() {
  const { accounts, accountFields, addAccount, addManyAccounts, setAccountCell, deleteAccount } = useAdminData();
  const [recherche, setRecherche] = useState("");
  const [colonnes, setColonnes] = useState(false);
  const [nouvelle, setNouvelle] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const fichierRef = useRef<HTMLInputElement>(null);

  const visibles = useMemo(() => {
    const q = recherche.trim().toLowerCase();
    if (!q) return accounts;
    return accounts.filter((a) =>
      [a.name, a.sector ?? "", ...Object.values(a.data)].some((v) => v.toLowerCase().includes(q)),
    );
  }, [accounts, recherche]);

  /** Export de ce qui est affiché : mêmes colonnes, mêmes lignes, même ordre. */
  const exporter = async () => {
    const XLSX = await import("xlsx");
    const lignes = visibles.map((a) =>
      Object.fromEntries(accountFields.map((f) => [f.label, valeur(a, f)])),
    );
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

  return (
    <div>
      <PageHeader
        title="Clients"
        subtitle={`${accounts.length} fiche${accounts.length > 1 ? "s" : ""} — le fichier commun de l’équipe`}
        action={
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setColonnes(true)}
              className="inline-flex items-center gap-1.5 rounded-full border border-border px-4 py-2.5 text-sm font-bold text-avisdoc-ink transition-colors hover:border-avisdoc-teal"
            >
              <Columns3 className="size-4" /> Colonnes
            </button>
            <button
              type="button"
              onClick={() => fichierRef.current?.click()}
              className="inline-flex items-center gap-1.5 rounded-full border border-border px-4 py-2.5 text-sm font-bold text-avisdoc-ink transition-colors hover:border-avisdoc-teal"
            >
              <Upload className="size-4" /> Importer
            </button>
            <button
              type="button"
              onClick={() => void exporter()}
              className="inline-flex items-center gap-1.5 rounded-full border border-border px-4 py-2.5 text-sm font-bold text-avisdoc-ink transition-colors hover:border-avisdoc-teal"
            >
              <Download className="size-4" /> Exporter
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

      {/* Recherche + ajout rapide */}
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="relative min-w-[220px] flex-1">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <input
            value={recherche}
            onChange={(e) => setRecherche(e.target.value)}
            placeholder="Rechercher un client…"
            className="ad-input w-full rounded-full border border-border bg-card py-2.5 pl-10 pr-4 text-[13px] outline-none transition-colors focus:border-avisdoc-teal"
          />
        </div>
        <div className="flex items-center gap-2">
          <input
            value={nouvelle}
            onChange={(e) => setNouvelle(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && nouvelle.trim()) {
                addAccount(nouvelle);
                setNouvelle("");
              }
            }}
            placeholder="Nom de l’établissement…"
            className="ad-input rounded-full border border-border bg-card px-4 py-2.5 text-[13px] outline-none transition-colors focus:border-avisdoc-teal"
          />
          <button
            type="button"
            disabled={!nouvelle.trim()}
            onClick={() => {
              addAccount(nouvelle);
              setNouvelle("");
            }}
            className="ad-btn-accent inline-flex items-center gap-1.5 rounded-full bg-avisdoc-teal px-5 py-2.5 text-sm font-bold text-white disabled:opacity-50"
          >
            <Plus className="size-4" /> Nouvelle fiche
          </button>
        </div>
      </div>

      {/* Le tableur */}
      <div className="overflow-x-auto rounded-2xl border border-border bg-card">
        <table className="w-full min-w-[720px] border-collapse">
          <thead>
            <tr className="border-b border-border bg-muted/50">
              {accountFields.map((f) => (
                <th key={f.id} className="whitespace-nowrap px-3 py-2.5 text-left text-[11px] font-bold uppercase tracking-[0.05em] text-muted-foreground">
                  {f.label}
                </th>
              ))}
              <th className="w-10" />
            </tr>
          </thead>
          <tbody>
            {visibles.map((a) => (
              <tr key={a.id} className="border-b border-border last:border-0 hover:bg-muted/30">
                {accountFields.map((f) => (
                  <td key={f.id} className="px-1.5 py-1">
                    <input
                      type={inputType(f.type)}
                      defaultValue={valeur(a, f)}
                      onBlur={(e) => {
                        if (e.target.value !== valeur(a, f)) setAccountCell(a.id, f.key, e.target.value);
                      }}
                      onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
                      aria-label={`${f.label} — ${a.name}`}
                      className={cn(
                        "w-full rounded-lg border border-transparent bg-transparent px-2 py-1.5 text-[13px] text-avisdoc-ink outline-none transition-colors",
                        "hover:border-border focus:border-avisdoc-teal focus:bg-card",
                        f.key === "etablissement" && "font-semibold",
                      )}
                    />
                  </td>
                ))}
                <td className="px-1.5">
                  <button
                    type="button"
                    onClick={() => deleteAccount(a.id)}
                    aria-label={`Supprimer ${a.name}`}
                    className="rounded-lg p-1.5 text-muted-foreground/50 transition-colors hover:text-rose-700"
                  >
                    <Trash2 className="size-4" />
                  </button>
                </td>
              </tr>
            ))}
            {visibles.length === 0 && (
              <tr>
                <td colSpan={accountFields.length + 1} className="px-4 py-10 text-center text-sm text-muted-foreground">
                  {accounts.length === 0
                    ? "Aucune fiche pour l’instant. Ajoutez un établissement, ou importez votre fichier Excel."
                    : "Aucune fiche ne correspond à cette recherche."}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {colonnes && <ColonnesClient onClose={() => setColonnes(false)} />}
    </div>
  );
}
