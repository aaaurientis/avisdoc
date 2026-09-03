// File de travail : tous les contacts, filtres, tri par score recalculé.
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useSearchParams } from "react-router-dom";
import { listerContacts, listerImports } from "../data/repo";
import type { StatutContact } from "../data/types";
import { calculerScore } from "../domaine/signaux";
import { ORDRE_STATUTS } from "../domaine/machineEtats";
import { L, pluriel } from "../i18n/libelles";
import { dateFr, nomComplet } from "../lib/format";
import { Carte, Cercle, Champ, Chargement, EnTete, Erreur, LienPrincipal, Saisie, Score, Selection, Statut, Tableau, Vide } from "../composants/ui";

export default function Contacts() {
  const [params] = useSearchParams();
  const contacts = useQuery({ queryKey: ["contacts"], queryFn: listerContacts });
  const imports = useQuery({ queryKey: ["imports"], queryFn: listerImports });
  const [statut, setStatut] = useState<StatutContact | "">("");
  const [cercle, setCercle] = useState<string>("");
  const [importId, setImportId] = useState<string>(params.get("import") ?? "");
  const [texte, setTexte] = useState("");

  const lignes = useMemo(() => {
    const q = texte.trim().toLowerCase();
    return (contacts.data ?? [])
      .map((c) => ({ c, score: calculerScore(c, c.compte).total }))
      .filter(({ c }) => !statut || c.statut === statut)
      .filter(({ c }) => !cercle || String(c.compte?.cercle ?? 0) === cercle)
      .filter(({ c }) => !importId || c.import_id === importId)
      .filter(({ c }) => !q || `${c.prenom} ${c.nom} ${c.fonction ?? ""} ${c.compte?.nom ?? ""}`.toLowerCase().includes(q))
      .sort((a, b) => b.score - a.score || (a.c.maj_le < b.c.maj_le ? 1 : -1));
  }, [contacts.data, statut, cercle, importId, texte]);

  return (
    <div>
      <EnTete titre={L.contacts.titre} sousTitre={L.contacts.sousTitre} action={<LienPrincipal to="/import" libelle={L.contacts.importer} />} />
      <Erreur erreur={contacts.error ?? imports.error} className="mb-4" />

      <Carte className="mb-5 grid grid-cols-1 gap-3 p-4 md:grid-cols-4">
        <Champ libelle={L.contacts.filtreStatut}>
          <Selection value={statut} onChange={(e) => setStatut(e.target.value as StatutContact | "")}>
            <option value="">{L.contacts.tous}</option>
            {ORDRE_STATUTS.map((s) => <option key={s} value={s}>{L.statuts[s]}</option>)}
          </Selection>
        </Champ>
        <Champ libelle={L.contacts.filtreCercle}>
          <Selection value={cercle} onChange={(e) => setCercle(e.target.value)}>
            <option value="">{L.contacts.tous}</option>
            {([1, 2, 3, 0] as const).map((c) => <option key={c} value={String(c)}>{L.cercles[c]}</option>)}
          </Selection>
        </Champ>
        <Champ libelle={L.contacts.filtreListe}>
          <Selection value={importId} onChange={(e) => setImportId(e.target.value)}>
            <option value="">{L.contacts.toutes}</option>
            {(imports.data ?? []).map((i) => <option key={i.id} value={i.id}>{i.libelle_liste}</option>)}
          </Selection>
        </Champ>
        <Champ libelle={L.contacts.colContact}>
          <Saisie value={texte} onChange={(e) => setTexte(e.target.value)} />
        </Champ>
      </Carte>

      {contacts.isPending ? <Chargement /> : (
        <Carte className="p-2">
          <div className="px-3 py-2 text-[12px] text-muted-foreground">{pluriel(lignes.length, L.contacts.nombreUn, L.contacts.nombre)}</div>
          {lignes.length === 0 ? <Vide texte={L.contacts.vide} /> : (
            <Tableau entetes={[L.contacts.colContact, L.contacts.colCompte, L.contacts.colCercle, L.contacts.colStatut, L.contacts.colScore, L.contacts.colDerniereMaj]}>
              {lignes.map(({ c, score }) => (
                <tr key={c.id} className="border-b border-border/60 last:border-0 hover:bg-accent/60">
                  <td className="px-3 py-2.5">
                    <Link to={`/contacts/${c.id}`} className="font-semibold text-avisdoc-ink hover:underline">{nomComplet(c.prenom, c.nom) || L.commun.sansNom}</Link>
                    <div className="text-[11.5px] text-muted-foreground">{c.fonction}</div>
                  </td>
                  <td className="px-3 py-2.5">
                    <div>{c.compte?.nom ?? L.fiche.sansCompte}</div>
                    <div className="text-[11.5px] text-muted-foreground">{c.compte ? L.typesCompte[c.compte.type] : ""}</div>
                  </td>
                  <td className="px-3 py-2.5"><Cercle cercle={c.compte?.cercle} /></td>
                  <td className="px-3 py-2.5"><Statut statut={c.statut} /></td>
                  <td className="px-3 py-2.5"><Score total={score} /></td>
                  <td className="px-3 py-2.5 text-muted-foreground">{dateFr(c.maj_le)}</td>
                </tr>
              ))}
            </Tableau>
          )}
        </Carte>
      )}
    </div>
  );
}
