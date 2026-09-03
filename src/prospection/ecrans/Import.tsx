// Import multi-listes : nommer la liste, déposer le CSV, confirmer le mapping,
// lire l'aperçu chiffré, puis « Importer » (seule action principale).
import { useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { importer, listerImports, type ResultatImport } from "../data/repo";
import type { TypeCompte } from "../data/types";
import { Constants } from "../data/types.gen";
import { CHAMPS_IMPORT, pr60AnalyserCsv, pr61ProposerMapping, pr65ConstruireLignes, pr66MappingSuffisant, type Csv, type MappingImport } from "../domaine/importCsv";
import { L, t } from "../i18n/libelles";
import { dateHeureFr } from "../lib/format";
import { Bouton, Carte, Champ, Chargement, EnTete, Erreur, Etiquette, Saisie, Selection, Tableau, Vide, CIBLE, type MotifInactif } from "../composants/ui";
import { cn } from "@/lib/utils";

export default function Import() {
  const qc = useQueryClient();
  const historique = useQuery({ queryKey: ["imports"], queryFn: listerImports });
  const [libelle, setLibelle] = useState("");
  const [fichier, setFichier] = useState("");
  const [csv, setCsv] = useState<Csv | null>(null);
  const [mapping, setMapping] = useState<MappingImport>({});
  const [typeCompte, setTypeCompte] = useState<TypeCompte>("courtier");
  const [cercle, setCercle] = useState<string>("1");
  const [expose, setExpose] = useState(false);
  const [apercu, setApercu] = useState<ResultatImport | null>(null);
  const [resultat, setResultat] = useState<ResultatImport | null>(null);
  const refLibelle = useRef<HTMLInputElement>(null);
  const refFichier = useRef<HTMLInputElement>(null);
  const refMapping = useRef<HTMLDivElement>(null);

  const lignes = useMemo(
    () => (csv ? pr65ConstruireLignes(csv, mapping, { type_compte: typeCompte, cercle: cercle ? Number(cercle) : null, expose }) : []),
    [csv, mapping, typeCompte, cercle, expose],
  );

  const lireFichier = async (f: File | undefined) => {
    if (!f) return;
    const texte = await f.text();
    const analyse = pr60AnalyserCsv(texte);
    setFichier(f.name);
    setCsv(analyse);
    setMapping(pr61ProposerMapping(analyse.entetes));
    setApercu(null);
    setResultat(null);
  };

  const calculer = useMutation({
    mutationFn: () => importer(libelle.trim(), fichier, lignes, false),
    onSuccess: (r) => setApercu(r),
  });
  const ecrire = useMutation({
    mutationFn: () => importer(libelle.trim(), fichier, lignes, true),
    onSuccess: (r) => { setResultat(r); void qc.invalidateQueries(); },
  });

  const motif = (): MotifInactif | null => {
    if (!libelle.trim()) return { texte: L.import.motifLibelle, action: () => refLibelle.current?.focus() };
    if (!csv || lignes.length === 0) return { texte: L.import.motifAucuneLigne, action: () => refFichier.current?.click() };
    if (!pr66MappingSuffisant(mapping)) return { texte: L.import.motifMapping, action: () => refMapping.current?.scrollIntoView({ behavior: "smooth" }) };
    if (!apercu) return { texte: L.import.motifApercu, action: () => calculer.mutate() };
    return null;
  };

  const changerMapping = (champ: (typeof CHAMPS_IMPORT)[number], valeur: string) => {
    setMapping((m) => {
      const n = { ...m };
      if (valeur === "") delete n[champ]; else n[champ] = Number(valeur);
      return n;
    });
    setApercu(null);
  };

  return (
    <div>
      <EnTete titre={L.import.titre} sousTitre={L.import.sousTitre} />

      <div className="grid grid-cols-1 items-start gap-5 xl:grid-cols-[1fr_360px]">
        <div className="flex flex-col gap-5">
          <Carte className="p-[22px]">
            <Etiquette className="mb-3">{L.import.etape1}</Etiquette>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <Champ libelle={L.import.libelleListe}>
                <Saisie ref={refLibelle} value={libelle} placeholder={L.import.libelleExemple} onChange={(e) => { setLibelle(e.target.value); setApercu(null); }} />
              </Champ>
              <Champ libelle={L.import.fichier} aide={csv ? t(L.import.fichierLu, { n: csv.lignes.length, s: csv.separateur === "\t" ? "tab" : csv.separateur }) : undefined}>
                <input ref={refFichier} type="file" accept=".csv,text/csv" className="hidden" onChange={(e) => void lireFichier(e.target.files?.[0])} />
                <button type="button" onClick={() => refFichier.current?.click()} className={cn(CIBLE, "w-full rounded-xl border-[1.5px] border-dashed border-border px-3.5 text-left text-sm text-avisdoc-ink hover:border-avisdoc-teal")}>
                  {fichier || L.import.deposer}
                </button>
              </Champ>
              <Champ libelle={L.import.typeCompte}>
                <Selection value={typeCompte} onChange={(e) => { setTypeCompte(e.target.value as TypeCompte); setApercu(null); }}>
                  {Constants.prospection.Enums.type_compte.map((c) => <option key={c} value={c}>{L.typesCompte[c]}</option>)}
                </Selection>
              </Champ>
              <Champ libelle={L.import.cercle}>
                <Selection value={cercle} onChange={(e) => { setCercle(e.target.value); setApercu(null); }}>
                  {([1, 2, 3, 0] as const).map((c) => <option key={c} value={c === 0 ? "" : String(c)}>{L.cercles[c]}</option>)}
                </Selection>
              </Champ>
              <label className={cn(CIBLE, "flex items-center gap-2 text-sm text-avisdoc-ink")}>
                <input type="checkbox" checked={expose} onChange={(e) => { setExpose(e.target.checked); setApercu(null); }} className="size-5" />
                {L.import.expose}
              </label>
            </div>
          </Carte>

          {csv && (
            <Carte className="p-[22px]" >
              <div ref={refMapping}>
                <Etiquette className="mb-3">{L.import.etape2}</Etiquette>
                <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                  {CHAMPS_IMPORT.map((champ) => (
                    <Champ key={champ} libelle={L.import.champs[champ]}>
                      <Selection value={mapping[champ] ?? ""} onChange={(e) => changerMapping(champ, e.target.value)}>
                        <option value="">{L.import.ignorer}</option>
                        {csv.entetes.map((en, i) => <option key={`${i}-${en}`} value={i}>{en}</option>)}
                      </Selection>
                    </Champ>
                  ))}
                </div>
                {!pr66MappingSuffisant(mapping) && <p className="mt-3 text-[12.5px] font-medium text-avisdoc-coral-ink">{L.import.mappingInsuffisant}</p>}
              </div>
            </Carte>
          )}

          <Carte className="p-[22px]">
            <Etiquette className="mb-3">{L.import.etape3}</Etiquette>
            <p className="mb-4 text-[12.5px] text-muted-foreground">{L.import.regle}</p>
            <Erreur erreur={calculer.error ?? ecrire.error} className="mb-3" />
            {apercu && !resultat && <Compteurs r={apercu} />}
            {resultat && (
              <div className="mb-4">
                <div className="mb-2 rounded-xl bg-emerald-50 px-4 py-3 text-[13px] font-semibold text-emerald-800">{L.import.importe}</div>
                <Compteurs r={resultat} />
                <Link to={`/contacts?import=${resultat.import_id ?? ""}`} className={cn(CIBLE, "inline-flex items-center px-1 text-sm font-semibold text-avisdoc-teal-ink hover:underline")}>
                  {L.import.voirContacts}
                </Link>
              </div>
            )}
            {!resultat && (
              <div className="flex flex-wrap items-start gap-3">
                <Bouton libelle={L.import.calculer} onClick={() => calculer.mutate()} chargement={calculer.isPending}
                  motifInactif={!csv || lignes.length === 0 ? { texte: L.import.motifAucuneLigne, action: () => refFichier.current?.click() } : null} />
                <Bouton principal libelle={L.import.importer} onClick={() => ecrire.mutate()} chargement={ecrire.isPending} motifInactif={motif()} />
              </div>
            )}
          </Carte>
        </div>

        <Carte className="p-[22px]">
          <h2 className="mb-1 font-display text-lg font-semibold text-avisdoc-ink">{L.import.historique}</h2>
          <p className="mb-4 text-[12px] text-muted-foreground">{L.import.origine}</p>
          <Erreur erreur={historique.error} />
          {historique.isPending ? <Chargement /> : (historique.data ?? []).length === 0 ? <Vide texte={L.commun.rien} /> : (
            <Tableau entetes={[L.import.libelleListe, L.import.lues, L.import.creees]}>
              {(historique.data ?? []).map((i) => (
                <tr key={i.id} className="border-b border-border/60 last:border-0">
                  <td className="px-3 py-2.5">
                    <Link to={`/contacts?import=${i.id}`} className="font-semibold text-avisdoc-ink hover:underline">{i.libelle_liste}</Link>
                    <div className="text-[11px] text-muted-foreground">{dateHeureFr(i.importe_le)}</div>
                  </td>
                  <td className="px-3 py-2.5">{i.lignes_lues}</td>
                  <td className="px-3 py-2.5">{i.lignes_creees}</td>
                </tr>
              ))}
            </Tableau>
          )}
        </Carte>
      </div>
    </div>
  );
}

function Compteurs({ r }: { r: ResultatImport }) {
  const cases: Array<[string, number]> = [
    [L.import.lues, r.lues], [L.import.creees, r.creees], [L.import.misesAJour, r.mises_a_jour],
    [L.import.ignoreesExclusion, r.ignorees.exclusion], [L.import.ignoreesInvalides, r.ignorees.invalide],
  ];
  return (
    <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-5">
      {cases.map(([l, n]) => (
        <div key={l} className="rounded-xl bg-muted px-3 py-3">
          <div className="text-[11px] font-bold uppercase tracking-[0.06em] text-muted-foreground">{l}</div>
          <div className="mt-1 font-display text-2xl font-bold text-avisdoc-ink">{n}</div>
        </div>
      ))}
    </div>
  );
}
