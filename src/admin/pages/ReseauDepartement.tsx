// Réseau d'aval — écran 2 : un département. Action principale : importer (ou
// rafraîchir) les médecins depuis l'extraction RPPS. Liste filtrable, fiche
// résumée du praticien, exclusion définitive.

import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { ArrowLeft, CalendarCheck, Check, Play, RefreshCw, Search, Download, List, Loader2, MapIcon, MapPin, Sparkles, Square, UserPlus } from "lucide-react";
import { toast } from "sonner";
import { confirmer } from "../components/Confirmation";
import { Badge, Card, Modal, PageHeader } from "../components/ui";
import { lectureSeuleActive } from "../lib/lectureSeule";
import {
  DEPARTEMENTS,
  ETAT_DEPARTEMENT_LABEL,
  ETAT_PRATICIEN_BADGE,
  ETAT_PRATICIEN_LABEL,
  ETATS_PRATICIEN,
  POPULATION_LIBELLE,
  POPULATION_PLURIEL,
  POPULATIONS,
  ROLE_LABEL,
  ROLES,
  SOURCE_RPPS,
  TEXTES,
  dateFr,
  estPerime,
  DOCTOLIB_AIDE,
  DOCTOLIB_BADGE,
  DOCTOLIB_LABEL,
  NON_RESERVABLE,
  nonReservableDoctolib,
  affichageDoctolib,
  PLAFONDS_JOUR,
  GOOGLE_AIDE,
  GOOGLE_BADGE,
  GOOGLE_LABEL,
  STATUTS_DOCTOLIB,
  STATUTS_GOOGLE,
  type StatutDoctolib,
  type StatutGoogle,
  type EtatPraticien,
  type Population,
  type Role,
} from "../reseau/libelles";
import { reseauRepo, type DepartementReseau, type ImportReseau, type PraticienReseau, type RechercheIa, type SignalReseau } from "../reseau/reseauRepo";
import { calculerScore } from "../../../supabase/functions/_shared/reseau-signaux";
import FichePraticien from "./reseau/FichePraticien";
import AvancementIa from "./reseau/AvancementIa";
import ReseauCarte from "./reseau/ReseauCarte";
import { specialiteDuLienDoctolib, specialiteHorsCible } from "../../../supabase/functions/_shared/doctolib";
import { cn } from "@/lib/utils";
import { pointsAValider } from "../reseau/aValider";

/** Pictogramme de la vue resserrée (fiche ouverte) : vert trouvée, gris sans correspondance RPPS. */
const GOOGLE_PICTO: Record<StatutGoogle, string> = {
  confirmee: "fill-emerald-600 text-emerald-700",
  trouvee_auto: "text-emerald-600",
  a_confirmer: "text-slate-300",
  introuvable: "text-slate-300",
  aucune: "text-slate-300",
  a_chercher: "text-slate-200",
};

const COLS_FULL = "minmax(130px,1.3fr) 100px minmax(100px,1fr) 72px 122px 128px 118px 108px 52px";
const COLS_COMPACT = "minmax(150px,1.4fr) 100px 40px 40px 60px";

/** Coût indicatif d'une recherche IA par praticien (modèle + recherches web), à ajuster sur les factures réelles. */
const COUT_IA_EUROS = 0.25;

/** Une recherche du département : son statut en clair, un point vert quand elle est à jour. */
function TuileRecherche({ titre, etat, lignes, aide, bouton, onClick, motif }: {
  icone?: React.ReactNode; titre: string;
  etat: "a_jour" | "a_faire" | "en_cours" | "echec" | "vide";
  /** La première ligne s'affiche ; toutes sont au survol. */
  lignes: string[]; aide?: string; bouton: string | null; onClick: () => void; motif: string | null;
}) {
  const pastille = {
    a_jour: { cls: "bg-emerald-500", txt: "À jour" },
    a_faire: { cls: "bg-amber-400", txt: "À faire" },
    en_cours: { cls: "bg-sky-500 animate-pulse", txt: "En cours" },
    echec: { cls: "bg-rose-500", txt: "Échec" },
    vide: { cls: "bg-slate-300", txt: "—" },
  }[etat];
  const arret = bouton === "Arrêter";
  const detail = [pastille.txt, ...lignes.filter(Boolean), aide].filter(Boolean).join("\n");
  return (
    <div className="flex min-w-0 items-center gap-2 rounded-xl border border-border bg-card px-3 py-2" title={detail}>
      <span className={cn("size-2 shrink-0 rounded-full", pastille.cls)} aria-label={pastille.txt} />
      <div className="min-w-0 flex-1 leading-tight">
        <div className="truncate text-[12.5px] font-semibold text-avisdoc-ink">{titre}</div>
        <div className="truncate text-[11.5px] text-muted-foreground">{lignes[0]}</div>
      </div>
      {bouton && (
        <button type="button" onClick={onClick} disabled={!!motif && !arret} title={motif ?? bouton} aria-label={bouton}
          className={cn("grid size-7 shrink-0 place-items-center rounded-full border disabled:opacity-50",
            arret ? "border-border text-muted-foreground hover:bg-muted" : "border-avisdoc-teal text-avisdoc-teal hover:bg-sky-50")}>
          {arret ? <Square className="size-3" /> : /^Chercher/.test(bouton) ? <Search className="size-3.5" /> : /^Lancer/.test(bouton) ? <Play className="size-3.5" /> : <RefreshCw className="size-3.5" />}
        </button>
      )}
    </div>
  );
}

export default function ReseauDepartement() {
  const { code = "" } = useParams();
  const [dep, setDep] = useState<DepartementReseau | null>(null);
  const [praticiens, setPraticiens] = useState<PraticienReseau[]>([]);
  const [dernier, setDernier] = useState<ImportReseau | null>(null);
  const [chargement, setChargement] = useState(true);
  const [erreur, setErreur] = useState<string | null>(null);
  const [importEnCours, setImportEnCours] = useState(false);
  const [params] = useSearchParams();
  // ?praticien=… : ouvrir directement sa fiche (retour d'un relevé Doctolib, par exemple).
  const [selection, setSelection] = useState<string | null>(params.get("praticien"));
  const [signaux, setSignaux] = useState<SignalReseau[]>([]);
  const [rechercheMg, setRechercheMg] = useState<RechercheIa | null>(null);
  const [rechercheGoogle, setRechercheGoogle] = useState<RechercheIa | null>(null);
  const [rechercheIa, setRechercheIa] = useState<RechercheIa | null>(null);
  const [iaGroupee, setIaGroupee] = useState(false);
  const [vue, setVue] = useState<"liste" | "carte">("liste");
  const [ajoutRpps, setAjoutRpps] = useState(false);
  /** Le journal reste affiché à la fin d'une recherche suivie à l'écran. */
  const [suiviMgOuvert, setSuiviMgOuvert] = useState(false);
  const [filtres, setFiltres] = useState<{ q: string; population: "" | Population; role: "" | Role; etat: "" | EtatPraticien; google: "" | StatutGoogle; doctolib: "" | StatutDoctolib | "non_reservable"; aValider: "" | "oui" | "non" }>({
    q: "", population: "", role: "", etat: "", google: "", doctolib: "", aValider: "",
  });
  const lectureSeule = lectureSeuleActive();
  // Tri du tableau : clic sur un en-tête ; deuxième clic = sens inverse. Par défaut, le score.
  const [tri, setTri] = useState<{ cle: CleTri; sens: 1 | -1 }>({ cle: "score", sens: -1 });
  const trier = (cle: CleTri) => setTri((t) => (t.cle === cle ? { cle, sens: t.sens === 1 ? -1 : 1 } : { cle, sens: cle === "score" || cle === "avalider" ? -1 : 1 }));

  const charger = async () => {
    setChargement(true);
    setErreur(null);
    try {
      const [ds, ps, di] = await Promise.all([reseauRepo.departements(), reseauRepo.praticiens(code), reseauRepo.dernierImport(code)]);
      setDep(ds.find((d) => d.code === code) ?? null);
      setPraticiens(ps);
      setDernier(di);
      const [sg, rm, rg, ri] = await Promise.all([
        reseauRepo.signauxDe(ps.map((x) => x.id)),
        reseauRepo.derniereRecherche({ departement: code, type: "mg_derm_departement" }),
        reseauRepo.derniereRecherche({ departement: code, type: "google_departement" }),
        reseauRepo.derniereRecherche({ departement: code, type: "ia_departement" }),
      ]);
      setRechercheIa(ri);
      setSignaux(sg);
      setRechercheMg(rm);
      setRechercheGoogle(rg);
    } catch (e) {
      setErreur(e instanceof Error ? e.message : String(e));
    } finally {
      setChargement(false);
    }
  };
  useEffect(() => { void charger(); }, [code]); // eslint-disable-line react-hooks/exhaustive-deps

  const importer = async () => {
    setImportEnCours(true);
    setErreur(null);
    try {
      const r = await reseauRepo.importer(code);
      const c = r.compteurs ?? {};
      toast.success(`Import terminé : ${c.crees ?? 0} praticien${(c.crees ?? 0) > 1 ? "s" : ""} ajouté${(c.crees ?? 0) > 1 ? "s" : ""}, rien de retiré ni d'écrasé. Recherche des fiches Google en cours.`);
      await charger();
    } catch (e) {
      setErreur(e instanceof Error ? e.message : String(e));
      void reseauRepo.dernierImport(code).then(setDernier).catch(() => undefined);
    } finally {
      setImportEnCours(false);
    }
  };

  // Score de chaque praticien, à partir de ses seuls signaux validés.
  const scores = useMemo(() => {
    const valides = new Map<string, SignalReseau[]>();
    const enAttente = new Map<string, number>();
    for (const sg of signaux) {
      if (sg.statut === "valide") valides.set(sg.praticienId, [...(valides.get(sg.praticienId) ?? []), sg]);
      else enAttente.set(sg.praticienId, (enAttente.get(sg.praticienId) ?? 0) + 1);
    }
    return new Map(praticiens.map((p) => [p.id, { probabilite: calculerScore(p, (valides.get(p.id) ?? []).map((v) => ({ ...v, le: v.decideLe }))).probabilite, aValider: enAttente.get(p.id) ?? 0 }]));
  }, [praticiens, signaux]);

  // Liste « Réseau Aval » (contacts du réseau) : qui y est déjà, avec quel rôle.
  const [contacts, setContacts] = useState<Map<string, { id: string; types: string[]; statut: string }>>(new Map());
  const [integration, setIntegration] = useState<string | null>(null);
  useEffect(() => {
    if (!praticiens.length) return;
    reseauRepo.contactsReseau(praticiens.map((p) => p.rpps)).then(setContacts).catch(() => setContacts(new Map()));
  }, [praticiens]);
  const integrer = async (p: PraticienReseau) => {
    const c = contacts.get(p.rpps);
    const ok = await confirmer({
      titre: `Intégrer Dr ${p.prenom} ${p.nom} au réseau d'aval ?`,
      message: c ? "Il est déjà dans la liste des contacts : le rôle « Réseau d'Aval » lui est ajouté." : "Un contact « Réseau d'Aval » est créé (statut « Accepté ») avec ses données RPPS. Le praticien passe en état « Accord ».",
      action: "Intégrer",
    });
    if (!ok) return;
    setIntegration(p.id);
    try {
      await reseauRepo.integrerReseau(p.id);
      toast.success(`Dr ${p.prenom} ${p.nom} intégré au réseau d'aval.`);
      setContacts(await reseauRepo.contactsReseau(praticiens.map((x) => x.rpps)));
      void charger();
    } catch (e) {
      setErreur(e instanceof Error ? e.message : String(e));
    } finally {
      setIntegration(null);
    }
  };

  // Points à trancher par praticien (propositions IA, liens à confirmer, hors cible…).
  const points = useMemo(() => {
    const parPraticien = new Map<string, SignalReseau[]>();
    for (const sg of signaux) parPraticien.set(sg.praticienId, [...(parPraticien.get(sg.praticienId) ?? []), sg]);
    return new Map(praticiens.map((p) => [p.id, pointsAValider(p, parPraticien.get(p.id) ?? [])]));
  }, [praticiens, signaux]);

  const rows = useMemo(() => {
    const q = filtres.q.trim().toLowerCase();
    return praticiens.filter((p) =>
      (!filtres.population || p.population === filtres.population) &&
      (!filtres.role || p.roles.includes(filtres.role)) &&
      (!filtres.etat || p.etat === filtres.etat) &&
      (!filtres.aValider || (filtres.aValider === "oui") === ((points.get(p.id)?.length ?? 0) > 0)) &&
      (!filtres.google || p.googleStatut === filtres.google) &&
      (!filtres.doctolib || (filtres.doctolib === "non_reservable" ? nonReservableDoctolib(p) : p.doctolibStatut === filtres.doctolib && !nonReservableDoctolib(p))) &&
      (!q || `${p.nom} ${p.prenom} ${p.rpps} ${p.lieux.map((l) => `${l.raisonSociale ?? ""} ${l.commune ?? ""}`).join(" ")}`.toLowerCase().includes(q)))
      .sort((a, b) => {
        const v = (p: PraticienReseau): number | string => {
          switch (tri.cle) {
            case "score": return scores.get(p.id)?.probabilite ?? 0;
            case "nom": return `${p.nom} ${p.prenom}`;
            case "population": return POPULATION_LIBELLE[p.population];
            case "lieu": return p.lieux.find((l) => l.departement === code)?.commune ?? "~";
            case "exercice": return p.lieux.find((l) => l.departement === code)?.modeExercice ?? "~";
            case "avalider": return points.get(p.id)?.length ?? 0;
            case "reseau": { const c = contacts.get(p.rpps); return c?.types.includes(AVAL) ? 2 : c ? 1 : 0; }
            case "google": return STATUTS_GOOGLE.indexOf(p.googleStatut);
            case "doctolib": return nonReservableDoctolib(p) ? 1.5 : STATUTS_DOCTOLIB.indexOf(p.doctolibStatut);
          }
        };
        const va = v(a), vb = v(b);
        const c = typeof va === "number" && typeof vb === "number" ? va - vb : String(va).localeCompare(String(vb), "fr");
        return c * tri.sens || (scores.get(b.id)?.probabilite ?? 0) - (scores.get(a.id)?.probabilite ?? 0) || a.nom.localeCompare(b.nom, "fr");
      });
  }, [praticiens, filtres, scores, tri, code, points, contacts]);

  // Recherche IA des généralistes formés à la dermoscopie : suivie toutes les 5 secondes.
  useEffect(() => {
    if (rechercheMg?.statut !== "en_cours") return;
    const t = window.setInterval(async () => {
      const r = await reseauRepo.derniereRecherche({ departement: code, type: "mg_derm_departement" }).catch(() => null);
      if (!r) return;
      setRechercheMg(r);
      if (r.statut !== "en_cours") { window.clearInterval(t); setSuiviMgOuvert(true); void charger(); }
    }, 3000);
    return () => window.clearInterval(t);
  }, [rechercheMg?.statut, code]); // eslint-disable-line react-hooks/exhaustive-deps

  // Travaux groupés (liens, IA) : suivis toutes les 3 secondes ; la liste se met à jour au fil de l'eau.
  useEffect(() => {
    const enCours = [rechercheGoogle, rechercheIa].filter((r) => r?.statut === "en_cours") as RechercheIa[];
    if (!enCours.length) return;
    const t = window.setInterval(async () => {
      const [rg, ri, ps, sg] = await Promise.all([
        reseauRepo.derniereRecherche({ departement: code, type: "google_departement" }).catch(() => null),
        reseauRepo.derniereRecherche({ departement: code, type: "ia_departement" }).catch(() => null),
        reseauRepo.praticiens(code).catch(() => null),
        reseauRepo.signauxDe(praticiens.map((x) => x.id)).catch(() => null),
      ]);
      if (rg) setRechercheGoogle(rg);
      if (ri) setRechercheIa(ri);
      if (ps) setPraticiens(ps);
      if (sg) setSignaux(sg);
    }, 3000);
    return () => window.clearInterval(t);
  }, [rechercheGoogle?.statut, rechercheIa?.statut, code]); // eslint-disable-line react-hooks/exhaustive-deps

  // Compteurs des tuiles de recherche (praticiens non exclus).
  const comptes = useMemo(() => {
    const a = praticiens.filter((p) => p.etat !== "exclu");
    const n = (f: (p: PraticienReseau) => boolean) => a.filter(f).length;
    return {
      actifs: a.length,
      google: {
        aChercher: n((p) => p.googleStatut === "a_chercher"),
        trouvees: n((p) => p.googleStatut === "confirmee" || p.googleStatut === "trouvee_auto"),
        confirmees: n((p) => p.googleStatut === "confirmee"),
        aConfirmer: n((p) => p.googleStatut === "a_confirmer"),
        aVerifier: n((p) => p.googleStatut === "trouvee_auto"),
        aRapprocher: n((p) => p.googleStatut === "trouvee_auto" || p.googleStatut === "a_confirmer" || p.googleStatut === "introuvable"),
        sans: n((p) => p.googleStatut === "introuvable" || p.googleStatut === "aucune"),
      },
      doctolib: {
        aChercher: n((p) => p.doctolibStatut === "a_chercher"),
        liens: n((p) => !!p.doctolibUrl),
        nonReservables: n((p) => nonReservableDoctolib(p)),
        aConfirmer: n((p) => p.doctolibStatut === "a_confirmer"),
        sans: n((p) => p.doctolibStatut === "introuvable" || p.doctolibStatut === "aucun"),
      },
    };
  }, [praticiens]);

  // Compteur du plafond Google / Doctolib du jour, rafraîchi quand une recherche change d'état.
  const [appels, setAppels] = useState<Record<string, number>>({});
  useEffect(() => {
    reseauRepo.appelsDuJour().then(setAppels).catch(() => setAppels({}));
  }, [code, rechercheGoogle?.statut, rechercheGoogle?.progression]);
  const plafondGoogle = `Aujourd'hui : ${appels.recherche ?? 0} / ${PLAFONDS_JOUR.recherche} recherches Google`;

  // Fiches sans recherche IA récente : recalculé quand une passe groupée change d'état.
  const [iaRestants, setIaRestants] = useState<number | null>(null);
  useEffect(() => {
    if (!dep) return;
    reseauRepo.estimerFile(code, "ia").then((r) => setIaRestants(r.total)).catch(() => setIaRestants(null));
  }, [code, dep?.code, rechercheIa?.statut]); // eslint-disable-line react-hooks/exhaustive-deps

  type VoletLiens = "google" | "doctolib" | "rapprochement" | "validation";
  // La recherche « tout » (lancée à l'import) couvre Google et Doctolib.
  const liensEnCours = (v: VoletLiens) => {
    if (rechercheGoogle?.statut !== "en_cours") return false;
    const enCours = rechercheGoogle.resultat?.volet ?? "tout";
    return enCours === v || (enCours === "tout" && v !== "rapprochement" && v !== "validation") || (enCours === "validation" && v === "rapprochement");
  };
  const motifLiens = (v: VoletLiens) => lectureSeule ? TEXTES.motifLectureSeule : !dep ? "Département absent de la liste."
    : rechercheGoogle?.statut === "en_cours" && !liensEnCours(v) ? "Une autre recherche Google / Doctolib est en cours : patientez ou arrêtez-la." : null;
  // Fiches Google « trouvées » : validées en tâche de fond à l'ouverture du département, sans
  // ouvrir chaque fiche (une seule fois par visite, rien si une recherche tourne déjà).
  const validationLancee = useRef<string | null>(null);
  useEffect(() => {
    if (lectureSeule || !dep || chargement || validationLancee.current === code) return;
    if (comptes.google.aVerifier === 0 || rechercheGoogle?.statut === "en_cours") return;
    validationLancee.current = code;
    reseauRepo.lancerFile(code, "liens", false, "validation")
      .then(async () => setRechercheGoogle(await reseauRepo.derniereRecherche({ departement: code, type: "google_departement" })))
      .catch(() => { /* silencieux : le bouton « Revérifier » reste disponible */ });
  }, [code, dep, chargement, comptes.google.aVerifier, rechercheGoogle?.statut, lectureSeule]);

  const lancerLiens = async (volet: VoletLiens) => {
    setErreur(null);
    try {
      await reseauRepo.lancerFile(code, "liens", false, volet);
      setRechercheGoogle(await reseauRepo.derniereRecherche({ departement: code, type: "google_departement" }));
    } catch (e) {
      setErreur(e instanceof Error ? e.message : String(e));
    }
  };
  const arreter = async (r: RechercheIa) => {
    try {
      await reseauRepo.arreterFile(r.id);
      toast.success("Tâche arrêtée.");
      void charger();
    } catch (e) {
      setErreur(e instanceof Error ? e.message : String(e));
    }
  };


  const lancerMg = async () => {
    setErreur(null);
    try {
      await reseauRepo.lancerIaMg(code);
      toast.success("Recherche lancée : les généralistes trouvés arrivent dans quelques minutes.");
      setRechercheMg(await reseauRepo.derniereRecherche({ departement: code, type: "mg_derm_departement" }));
    } catch (e) {
      setErreur(e instanceof Error ? e.message : String(e));
    }
  };

  // Niveau 2 : contexte du département, calculé sur l'extraction RPPS. Il informe, il ne filtre pas.
  const contexte = useMemo(() => {
    const parPop = new Map<Population, { total: number; liberaux: number; salaries: number }>();
    for (const p of praticiens) {
      if (p.etat === "exclu") continue;
      const ici = p.lieux.filter((l) => l.departement === code);
      const c = parPop.get(p.population) ?? { total: 0, liberaux: 0, salaries: 0 };
      c.total++;
      if (ici.some((l) => l.modeExercice === "Libéral")) c.liberaux++;
      if (ici.some((l) => l.modeExercice === "Salarié")) c.salaries++;
      parPop.set(p.population, c);
    }
    return parPop;
  }, [praticiens, code]);

  const nom = DEPARTEMENTS[code] ?? code;
  const extraitLe = dernier?.rppsExtraitLe ?? null;
  const motifImport = lectureSeule ? TEXTES.motifLectureSeule : importEnCours ? TEXTES.motifImportEnCours : !dep ? "Département absent de la liste." : null;
  const selectionne = praticiens.find((p) => p.id === selection) ?? null;

  return (
    <div>
      <Link to="/reseau-aval" className="mb-3 inline-flex items-center gap-1.5 text-[13px] font-semibold text-muted-foreground hover:text-avisdoc-ink">
        <ArrowLeft className="size-4" /> Départements
      </Link>
      <PageHeader
        title={`${code} · ${nom}`}
        subtitle={dep ? `${ETAT_DEPARTEMENT_LABEL[dep.etat]} · ${praticiens.length} praticiens` : undefined}
        action={
          <div className="flex flex-col items-end gap-1">
            <div className="flex items-center gap-2">
            <button type="button" onClick={() => setAjoutRpps(true)} disabled={lectureSeule || !dep} title={lectureSeule ? TEXTES.motifLectureSeule : undefined}
              className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-4 py-2.5 text-sm font-semibold text-avisdoc-ink hover:bg-muted disabled:opacity-50">
              <UserPlus className="size-4" /> Ajouter par RPPS
            </button>
            <button
              type="button"
              onClick={() => void importer()}
              disabled={!!motifImport}
              title={motifImport ?? undefined}
              className="ad-btn-accent inline-flex items-center gap-1.5 rounded-full bg-avisdoc-teal px-5 py-2.5 text-sm font-bold text-white disabled:opacity-50"
            >
              {importEnCours ? <Loader2 className="size-4 animate-spin" /> : <Download className="size-4" />}
              {importEnCours ? TEXTES.importEnCours : dep?.dernierImportLe ? TEXTES.rafraichir : TEXTES.importer}
            </button>
            </div>
            {motifImport && <span className="text-[11.5px] text-muted-foreground">{motifImport}</span>}
          </div>
        }
      />

      {erreur && (
        <div role="alert" className="mb-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-[13px] text-rose-800">{erreur}</div>
      )}

      {/* Source, dates et effectifs par spécialité, sur une ligne ; le détail au survol. */}
      <Card className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 px-4 py-2.5 text-[12.5px]">
        <a href={SOURCE_RPPS.url} target="_blank" rel="noreferrer" title={SOURCE_RPPS.libelle}
          className={cn("inline-flex items-center gap-1 underline-offset-2 hover:underline", extraitLe && estPerime(extraitLe) ? "font-semibold text-amber-700" : "text-muted-foreground")}>
          RPPS <b className={cn(extraitLe && estPerime(extraitLe) ? "" : "text-avisdoc-ink")}>{extraitLe ? dateFr(extraitLe) : "non importé"}</b>
          {extraitLe && estPerime(extraitLe) ? " · périmé" : ""}
        </a>
        {dep?.dernierImportLe && (
          <span className="text-muted-foreground" title={dernier?.compteurs ? `Dernier import : ${dernier.compteurs.crees ?? 0} ajoutés, ${dernier.compteurs.mis_a_jour ?? 0} déjà présents, ${dernier.compteurs.exclus_ignores ?? 0} exclus ignorés` : undefined}>
            Import <b className="text-avisdoc-ink">{dateFr(dep.dernierImportLe)}</b>
            {dernier?.statut === "echec" && <span className="font-semibold text-rose-700"> · en échec</span>}
          </span>
        )}
        <span className="text-muted-foreground"><b className="text-avisdoc-ink">{[...contexte.values()].reduce((t, c) => t + c.total, 0)}</b> praticiens</span>
        {POPULATIONS.filter((p) => contexte.has(p)).map((p) => {
          const c = contexte.get(p)!;
          return (
            <span key={p} className="rounded-full bg-muted/60 px-2.5 py-0.5" title={`${c.liberaux} ${c.liberaux > 1 ? "libéraux" : "libéral"}, ${c.salaries} ${c.salaries > 1 ? "salariés" : "salarié"}`}>
              <b className="text-avisdoc-ink">{c.total}</b> <span className="text-muted-foreground">{c.total > 1 ? POPULATION_PLURIEL[p] : p === "ORL" ? "ORL" : POPULATION_LIBELLE[p].toLowerCase()}</span>
            </span>
          );
        })}
      </Card>

      {/* Recherches du département : une tuile par recherche, avec son statut ; point vert = à jour. */}
      <div className="mb-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
        <TuileRecherche
          icone={<MapPin className="size-4" />} titre="Google Maps"
          etat={liensEnCours("google") ? "en_cours" : comptes.google.aChercher ? "a_faire" : comptes.actifs ? "a_jour" : "vide"}
          lignes={[
            `${comptes.google.trouvees} trouvées · ${comptes.google.aConfirmer + comptes.google.sans} sans`,
            comptes.google.aChercher ? `${comptes.google.aChercher} pas encore cherché${comptes.google.aChercher > 1 ? "s" : ""}` : "Tous les praticiens ont été cherchés",
            plafondGoogle,
          ]}
          bouton={liensEnCours("google") ? "Arrêter" : comptes.google.aChercher ? `Chercher ${comptes.google.aChercher}` : null}
          onClick={() => liensEnCours("google") ? void arreter(rechercheGoogle!) : void lancerLiens("google")}
          motif={motifLiens("google")} />
        <TuileRecherche
          icone={<Check className="size-4" />} titre="Google / RPPS"
          etat={liensEnCours("rapprochement") ? "en_cours" : comptes.google.aVerifier ? "a_faire" : comptes.google.trouvees ? "a_jour" : "vide"}
          lignes={[
            `${comptes.google.confirmees} validées${comptes.google.aVerifier ? ` · ${comptes.google.aVerifier} à vérifier` : ""}`,
            comptes.google.aVerifier ? `${comptes.google.aVerifier} trouvée${comptes.google.aVerifier > 1 ? "s" : ""} à vérifier (même nom et code postal)` : "Aucune fiche à vérifier",
            plafondGoogle,
          ]}
          aide="Revérifier : une recherche Google par praticien non tranché."
          bouton={liensEnCours("rapprochement") ? "Arrêter" : comptes.google.aRapprocher ? "Revérifier" : null}
          onClick={() => liensEnCours("rapprochement") ? void arreter(rechercheGoogle!) : void lancerLiens("rapprochement")}
          motif={motifLiens("rapprochement")} />
        <TuileRecherche
          icone={<CalendarCheck className="size-4" />} titre="Doctolib"
          etat={liensEnCours("doctolib") ? "en_cours" : comptes.doctolib.aChercher ? "a_faire" : comptes.actifs ? "a_jour" : "vide"}
          lignes={[
            `${comptes.doctolib.liens} liens · ${comptes.doctolib.nonReservables} non réserv. · ${comptes.doctolib.sans} absents`,
            comptes.doctolib.aChercher ? `${comptes.doctolib.aChercher} pas encore cherché${comptes.doctolib.aChercher > 1 ? "s" : ""}` : "Tous les praticiens ont été cherchés",
            `Aujourd'hui : ${appels.doctolib ?? 0} / ${PLAFONDS_JOUR.doctolib} recherches Doctolib`,
          ]}
          bouton={liensEnCours("doctolib") ? "Arrêter" : comptes.doctolib.aChercher ? `Chercher ${comptes.doctolib.aChercher}` : null}
          onClick={() => liensEnCours("doctolib") ? void arreter(rechercheGoogle!) : void lancerLiens("doctolib")}
          motif={motifLiens("doctolib")} />
        <TuileRecherche
          icone={<Sparkles className="size-4" />} titre="Généralistes (IA)"
          etat={rechercheMg?.statut === "en_cours" ? "en_cours" : rechercheMg?.statut === "echec" ? "echec" : rechercheMg?.statut === "termine" ? "a_jour" : "a_faire"}
          lignes={rechercheMg?.statut === "termine" ? [
            `${rechercheMg.resultat?.crees ?? 0} ajoutés le ${dateFr(rechercheMg.fin ?? rechercheMg.debut)}`,
            `${rechercheMg.resultat?.propositions ?? 0} trouvés`,
            `${rechercheMg.resultat?.deja_la ?? 0} déjà là · ${rechercheMg.resultat?.ecartees?.length ?? 0} écartés`,
          ] : rechercheMg?.statut === "echec" ? ["En échec", rechercheMg.erreur ?? ""] : rechercheMg?.statut === "en_cours" ? ["En cours…"] : ["Jamais lancée"]}
          bouton={rechercheMg?.statut === "en_cours" ? null : rechercheMg ? "Relancer" : "Lancer"}
          onClick={() => void lancerMg()}
          motif={lectureSeule ? TEXTES.motifLectureSeule : !dep ? "Département absent de la liste." : null} />
        <TuileRecherche
          icone={<Sparkles className="size-4" />} titre="IA des fiches"
          etat={rechercheIa?.statut === "en_cours" ? "en_cours" : iaRestants === null ? "vide" : iaRestants ? "a_faire" : comptes.actifs ? "a_jour" : "vide"}
          lignes={[
            iaRestants === null ? "Calcul…" : iaRestants ? `${iaRestants} à chercher (30 j)` : "Toutes cherchées (30 j)",
            rechercheIa?.statut === "termine" ? `Dernière passe le ${dateFr(rechercheIa.fin ?? rechercheIa.debut)}` : "",
          ]}
          bouton={rechercheIa?.statut === "en_cours" ? "Arrêter" : "Lancer…"}
          onClick={() => rechercheIa?.statut === "en_cours" ? void arreter(rechercheIa) : setIaGroupee(true)}
          motif={lectureSeule ? TEXTES.motifLectureSeule : !dep ? "Département absent de la liste." : null} />
      </div>
      {rechercheGoogle && (rechercheGoogle.statut === "en_cours" || rechercheGoogle.statut === "echec") && (
        <div className="mb-4 max-w-3xl">
          <AvancementIa recherche={rechercheGoogle} lignesVisibles={3} />
        </div>
      )}
      {rechercheIa && (rechercheIa.statut === "en_cours" || rechercheIa.statut === "echec") && (
        <div className="-mt-2 mb-4 max-w-3xl">
          <div className="flex flex-wrap items-center gap-2 text-[12.5px]">
            <span className="font-semibold text-avisdoc-ink">Recherche IA de toutes les fiches</span>
            {rechercheIa.statut === "en_cours" && (
              <button type="button" onClick={() => void arreter(rechercheIa)} disabled={lectureSeule}
                className="inline-flex items-center gap-1 rounded-full border border-border bg-card px-3 py-1 font-semibold text-muted-foreground hover:bg-muted disabled:opacity-50">
                <Square className="size-3" /> Arrêter
              </button>
            )}
          </div>
          <AvancementIa recherche={rechercheIa} lignesVisibles={4} />
        </div>
      )}
      {rechercheMg && (rechercheMg.statut !== "termine" || suiviMgOuvert) && (
        <div className="-mt-2 mb-4 max-w-3xl">
          <AvancementIa recherche={rechercheMg} ouvertParDefaut />
        </div>
      )}

      {/* Filtres */}
      <div className="mb-3 flex items-center gap-1.5 overflow-x-auto pb-1">
        <input
          className="ad-input w-36 shrink-0 rounded-full border border-border bg-card px-3 py-1.5 text-[12.5px] outline-none focus:border-avisdoc-teal"
          placeholder="Nom, RPPS, ville…"
          value={filtres.q}
          onChange={(e) => setFiltres((f) => ({ ...f, q: e.target.value }))}
        />
        <Filtre label="Population" tous="toutes" largeur={122} valeur={filtres.population} onChange={(v) => setFiltres((f) => ({ ...f, population: v as "" | Population }))}
          options={POPULATIONS.map((p) => [p, POPULATION_LIBELLE[p]])} />
        <Filtre label="Rôle" tous="tous" largeur={92} valeur={filtres.role} onChange={(v) => setFiltres((f) => ({ ...f, role: v as "" | Role }))}
          options={ROLES.map((r) => [r, ROLE_LABEL[r]])} />
        <Filtre label="Google" tous="tous" valeur={filtres.google} onChange={(v) => setFiltres((f) => ({ ...f, google: v as "" | StatutGoogle }))}
          options={STATUTS_GOOGLE.map((g) => [g, GOOGLE_LABEL[g]])} />
        <Filtre label="Doctolib" tous="tous" valeur={filtres.doctolib} onChange={(v) => setFiltres((f) => ({ ...f, doctolib: v as "" | StatutDoctolib | "non_reservable" }))}
          options={[...STATUTS_DOCTOLIB.map((d) => [d, DOCTOLIB_LABEL[d]] as [string, string]), ["non_reservable", NON_RESERVABLE.label]]} />
        <Filtre label="À valider" tous="tous" largeur={114} valeur={filtres.aValider} onChange={(v) => setFiltres((f) => ({ ...f, aValider: v as "" | "oui" | "non" }))}
          options={[["oui", "Avec points à valider"], ["non", "À jour"]]} />
        <Filtre label="État" tous="tous" largeur={92} valeur={filtres.etat} onChange={(v) => setFiltres((f) => ({ ...f, etat: v as "" | EtatPraticien }))}
          options={ETATS_PRATICIEN.map((e) => [e, ETAT_PRATICIEN_LABEL[e]])} />
        <div className="ml-auto flex shrink-0 gap-0.5 rounded-full border border-border bg-card p-0.5">
          {([{ v: "liste", label: "Liste", icon: List }, { v: "carte", label: "Carte", icon: MapIcon }] as const).map(({ v, label, icon: Icon }) => (
            <button key={v} type="button" onClick={() => setVue(v)} title={label} aria-label={label}
              className={cn("grid size-7 place-items-center rounded-full transition-colors",
                vue === v ? "bg-avisdoc-ink text-white" : "text-muted-foreground hover:text-avisdoc-ink")}>
              <Icon className="size-3.5" />
            </button>
          ))}
        </div>
      </div>

      <div className="grid items-start gap-5" style={{ gridTemplateColumns: selectionne ? "minmax(0,1fr) minmax(360px,1fr)" : "1fr" }}>
        {vue === "carte" ? (
          <ReseauCarte praticiens={rows} departement={code} scores={scores} selection={selection} onSelect={setSelection} />
        ) : (
        <Card className="overflow-x-auto">
          <div className="grid gap-3 border-b border-border/60 px-5 py-3 text-[11px] font-bold uppercase tracking-[0.05em] text-muted-foreground"
            style={{ gridTemplateColumns: selectionne ? COLS_COMPACT : COLS_FULL, minWidth: selectionne ? undefined : 1040 }}>
            <EnTete cle="nom" tri={tri} onTri={trier}>Praticien</EnTete>
            <EnTete cle="population" tri={tri} onTri={trier}>Population</EnTete>
            {!selectionne && <>
              <EnTete cle="lieu" tri={tri} onTri={trier}>Ville</EnTete>
              <EnTete cle="exercice" tri={tri} onTri={trier}>Exercice</EnTete>
              <EnTete cle="avalider" tri={tri} onTri={trier}>À valider</EnTete>
            </>}
            <EnTete cle="google" tri={tri} onTri={trier} centre={!!selectionne} titre="Google">{selectionne ? "G" : "Google"}</EnTete>
            <EnTete cle="doctolib" tri={tri} onTri={trier} centre={!!selectionne} titre="Doctolib">{selectionne ? "D" : "Doctolib"}</EnTete>
            {!selectionne && <EnTete cle="reseau" tri={tri} onTri={trier}>Réseau d'aval</EnTete>}
            <EnTete cle="score" tri={tri} onTri={trier} droite>Score</EnTete>
          </div>
          {chargement && (
            <div className="flex items-center justify-center gap-2 px-5 py-10 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" /> Chargement…
            </div>
          )}
          {!chargement && rows.map((p) => {
            const ici = p.lieux.filter((l) => l.departement === code);
            return (
              <button key={p.id} type="button" onClick={() => setSelection(p.id)}
                className={cn("ad-row grid w-full items-center gap-3 border-b border-border/60 px-5 py-3 text-left last:border-b-0",
                  selection === p.id && "bg-sky-50/70")}
                style={{ gridTemplateColumns: selectionne ? COLS_COMPACT : COLS_FULL, minWidth: selectionne ? undefined : 1040 }}>
                <div className="min-w-0">
                  <div className="truncate text-[13.5px] font-semibold text-avisdoc-ink">{p.nom} {p.prenom}</div>
                  <div className="flex flex-wrap gap-1 pt-0.5">
                    {!p.vuAuDernierImport && <Badge className="bg-amber-50 text-amber-800">{TEXTES.absentExtraction}</Badge>}
                    {p.etat !== "exclu" && specialiteHorsCible(specialiteDuLienDoctolib(p.doctolibUrl), p.doctolibInfos?.specialite) && (
                      <Badge className="bg-amber-100 text-amber-900">Hors cible ?</Badge>
                    )}
                  </div>
                </div>
                <div className="text-[12.5px] text-muted-foreground">{POPULATION_LIBELLE[p.population]}</div>
                {!selectionne && (
                  <>
                    <div className="min-w-0 text-[12.5px] text-muted-foreground">
                      {/* Seulement la ville (les structures sont sur la fiche) ; plusieurs villes séparées par des virgules. */}
                      <div className="line-clamp-2" title={[...new Set(ici.map((l) => l.commune).filter(Boolean))].join(", ")}>
                        {[...new Set(ici.map((l) => l.commune).filter(Boolean))].join(", ") || "—"}
                      </div>
                    </div>
                    <div className="text-[12.5px] text-muted-foreground">{[...new Set(ici.map((l) => l.modeExercice).filter(Boolean))].join(", ") || "—"}</div>
                    <div>
                      {p.etat === "exclu" ? (
                        <Badge className={ETAT_PRATICIEN_BADGE.exclu}>{ETAT_PRATICIEN_LABEL.exclu}</Badge>
                      ) : (points.get(p.id)?.length ?? 0) > 0 ? (
                        <span title={points.get(p.id)!.map((x) => `• ${x.libelle}`).join("\n")}>
                          <Badge className="bg-violet-100 text-violet-800">{points.get(p.id)!.length} point{points.get(p.id)!.length > 1 ? "s" : ""} à valider</Badge>
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-[12px] text-emerald-700"><Check className="size-3.5" /> À jour</span>
                      )}
                    </div>
                  </>
                )}
                {selectionne ? (
                  <div className="flex justify-center" title={`${GOOGLE_LABEL[p.googleStatut]} : ${GOOGLE_AIDE[p.googleStatut]}`}>
                    <MapPin aria-label={GOOGLE_LABEL[p.googleStatut]} className={cn("size-4", GOOGLE_PICTO[p.googleStatut])} />
                  </div>
                ) : (
                  <div title={GOOGLE_AIDE[p.googleStatut]}>
                    <Badge className={GOOGLE_BADGE[p.googleStatut]}>{GOOGLE_LABEL[p.googleStatut]}</Badge>
                  </div>
                )}
                {selectionne ? (
                  <div className="flex justify-center" title={`${affichageDoctolib(p).label} : ${affichageDoctolib(p).aide}`}>
                    <CalendarCheck aria-label={affichageDoctolib(p).label} className={cn("size-4", affichageDoctolib(p).picto)} />
                  </div>
                ) : (
                  <div title={affichageDoctolib(p).aide} onClick={(e) => { if (p.doctolibUrl) e.stopPropagation(); }}>
                    {p.doctolibUrl ? (
                      <a href={p.doctolibUrl} target="_blank" rel="noreferrer" className="inline-flex">
                        <Badge className={cn(affichageDoctolib(p).badge, "underline-offset-2 hover:underline")}>{affichageDoctolib(p).label} ↗</Badge>
                      </a>
                    ) : (
                      <Badge className={DOCTOLIB_BADGE[p.doctolibStatut]}>{DOCTOLIB_LABEL[p.doctolibStatut]}</Badge>
                    )}
                  </div>
                )}
                {!selectionne && (
                  <div onClick={(e) => e.stopPropagation()}>
                    <CelluleReseau contact={contacts.get(p.rpps)} exclu={p.etat === "exclu"} lectureSeule={lectureSeule}
                      enCours={integration === p.id} onIntegrer={() => void integrer(p)} />
                  </div>
                )}
                <div className="text-right">
                  <div className="text-[13px] font-semibold tabular-nums text-avisdoc-ink">{Math.round((scores.get(p.id)?.probabilite ?? 0) * 100)} %</div>
                  {selectionne && (points.get(p.id)?.length ?? 0) > 0 && (
                    <div className="text-[10.5px] font-semibold text-violet-700" title={points.get(p.id)!.map((x) => `• ${x.libelle}`).join("\n")}>{points.get(p.id)!.length} à valider</div>
                  )}
                </div>
              </button>
            );
          })}
          {!chargement && rows.length === 0 && (
            <div className="px-5 py-10 text-center text-sm text-muted-foreground">
              {praticiens.length === 0 ? TEXTES.pasEncoreImporte : TEXTES.aucunPraticien}
            </div>
          )}
        </Card>
        )}

        {selectionne && (
          <FichePraticien
            praticien={selectionne}
            departement={code}
            lectureSeule={lectureSeule}
            onClose={() => setSelection(null)}
            onChange={() => void charger()}
          />
        )}
      </div>

      {iaGroupee && (
        <IaGroupee departement={code} onClose={() => setIaGroupee(false)}
          onLance={async () => { setIaGroupee(false); setRechercheIa(await reseauRepo.derniereRecherche({ departement: code, type: "ia_departement" })); }} />
      )}

      {ajoutRpps && (
        <AjoutRpps onClose={() => setAjoutRpps(false)} onAjoute={(id) => { setAjoutRpps(false); void charger().then(() => setSelection(id)); }} />
      )}
    </div>
  );
}

function IaGroupee({ departement, onClose, onLance }: { departement: string; onClose: () => void; onLance: () => void }) {
  const [inclureRecents, setInclureRecents] = useState(false);
  const [total, setTotal] = useState<number | null>(null);
  const [envoi, setEnvoi] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);

  useEffect(() => {
    setTotal(null);
    reseauRepo.estimerFile(departement, "ia", inclureRecents).then((r) => setTotal(r.total)).catch((e) => setErreur(e instanceof Error ? e.message : String(e)));
  }, [departement, inclureRecents]);

  const motif = total === null ? "Calcul en cours…" : total === 0 ? "Aucun praticien à traiter." : envoi ? "Lancement…" : null;
  const lancer = async () => {
    if (motif) return;
    setEnvoi(true);
    setErreur(null);
    try {
      const r = await reseauRepo.lancerFile(departement, "ia", inclureRecents);
      toast.success(r.deja ? "Une recherche groupée était déjà en cours : suivez-la à l'écran." : `Recherche IA lancée pour ${r.total} praticiens.`);
      onLance();
    } catch (e) {
      setErreur(e instanceof Error ? e.message : String(e)); // la fenêtre reste ouverte
    } finally {
      setEnvoi(false);
    }
  };
  const duree = total ? Math.max(1, Math.round((total * 1.5) / 3)) : 0;

  return (
    <Modal onClose={onClose}>
      <h2 className="font-display text-xl font-semibold text-avisdoc-ink">Recherche IA de toutes les fiches</h2>
      <p className="mt-1 text-[13px] text-muted-foreground">
        La recherche IA est lancée pour chaque praticien du département, trois à la fois. Comme pour une fiche seule, chaque proposition est vérifiée sur sa source, puis reste à valider par vous.
      </p>
      <label className="mt-4 flex items-center gap-2 text-[13px]">
        <input type="checkbox" checked={inclureRecents} onChange={(e) => setInclureRecents(e.target.checked)} />
        Relancer aussi les fiches déjà recherchées ces 30 derniers jours
      </label>
      <div className="mt-4 rounded-xl bg-muted/50 px-3.5 py-3 text-[13px]">
        {total === null ? (
          <span className="inline-flex items-center gap-2 text-muted-foreground"><Loader2 className="size-4 animate-spin" /> Calcul…</span>
        ) : (
          <>
            <div><b className="text-avisdoc-ink">{total}</b> praticien{total > 1 ? "s" : ""} à rechercher</div>
            {total > 0 && (
              <div className="text-muted-foreground">
                Coût estimé : environ {(total * COUT_IA_EUROS).toLocaleString("fr-FR", { maximumFractionDigits: 0 })} € · durée : environ {duree < 60 ? `${duree} min` : `${Math.round(duree / 6) / 10} h`}
              </div>
            )}
          </>
        )}
      </div>
      <p className="mt-2 text-[11.5px] text-muted-foreground">Vous pouvez arrêter la recherche à tout moment ; ce qui est fait reste fait.</p>
      {erreur && <div role="alert" className="mt-4 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2.5 text-[12.5px] text-rose-800">{erreur}</div>}
      <div className="mt-6 flex items-center justify-end gap-3">
        <button type="button" onClick={onClose} className="rounded-full px-4 py-2 text-sm font-semibold text-muted-foreground">Annuler</button>
        <button type="button" onClick={() => void lancer()} disabled={!!motif} title={motif ?? undefined}
          className="ad-btn-accent inline-flex items-center gap-1.5 rounded-full bg-avisdoc-teal px-5 py-2.5 text-sm font-bold text-white disabled:opacity-50">
          {envoi && <Loader2 className="size-4 animate-spin" />} Lancer
        </button>
      </div>
      {motif && <p className="mt-2 text-right text-[12px] text-muted-foreground">{motif}</p>}
    </Modal>
  );
}

function AjoutRpps({ onClose, onAjoute }: { onClose: () => void; onAjoute: (id: string) => void }) {
  const [rpps, setRpps] = useState("");
  const [envoi, setEnvoi] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const chiffres = rpps.replace(/\D/g, "");
  const motif = chiffres.length !== 11 ? "Un numéro RPPS compte 11 chiffres." : envoi ? "Vérification dans l'Annuaire Santé…" : null;

  const valider = async () => {
    if (motif) return;
    setEnvoi(true);
    setErreur(null);
    try {
      const r = await reseauRepo.ajouterRpps(chiffres);
      toast.success(r.statut === "cree" ? `${r.nom} ajouté (${POPULATION_LIBELLE[r.population]}).` : `${r.nom} était déjà dans la liste.`);
      onAjoute(r.id);
    } catch (e) {
      setErreur(e instanceof Error ? e.message : String(e)); // la fenêtre reste ouverte
    } finally {
      setEnvoi(false);
    }
  };

  return (
    <Modal onClose={onClose}>
      <h2 className="font-display text-xl font-semibold text-avisdoc-ink">Ajouter un praticien par son RPPS</h2>
      <p className="mt-1 text-[13px] text-muted-foreground">
        Le numéro est contrôlé dans l'extraction de l'Annuaire Santé : médecin d'une spécialité du réseau, ou généraliste (il entre alors comme généraliste formé à la dermoscopie). Un praticien exclu ne peut pas revenir.
      </p>
      <input value={rpps} onChange={(e) => setRpps(e.target.value)} inputMode="numeric" placeholder="10000000000" autoFocus
        className="mt-4 w-full rounded-xl border border-border bg-card px-3 py-2.5 text-[14px] tabular-nums" />
      {erreur && <div role="alert" className="mt-4 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2.5 text-[12.5px] text-rose-800">{erreur}</div>}
      <div className="mt-6 flex items-center justify-end gap-3">
        <button type="button" onClick={onClose} className="rounded-full px-4 py-2 text-sm font-semibold text-muted-foreground">Annuler</button>
        <button type="button" onClick={() => void valider()} disabled={!!motif} title={motif ?? undefined}
          className="ad-btn-accent inline-flex items-center gap-1.5 rounded-full bg-avisdoc-teal px-5 py-2.5 text-sm font-bold text-white disabled:opacity-50">
          {envoi && <Loader2 className="size-4 animate-spin" />} Ajouter
        </button>
      </div>
      {motif && <p className="mt-2 text-right text-[12px] text-muted-foreground">{motif}</p>}
    </Modal>
  );
}

type CleTri = "score" | "nom" | "population" | "lieu" | "exercice" | "avalider" | "google" | "doctolib" | "reseau";
const AVAL = "Réseau d'Aval";

/** Colonne « Réseau d'aval » : intégré, dans la liste avec un autre rôle, ou à intégrer. */
function CelluleReseau({ contact, exclu, lectureSeule, enCours, onIntegrer }: {
  contact: { id: string; types: string[]; statut: string } | undefined; exclu: boolean; lectureSeule: boolean; enCours: boolean; onIntegrer: () => void;
}) {
  if (contact?.types.includes(AVAL)) {
    return (
      <span className="inline-flex items-center gap-1 text-[12px] font-semibold text-emerald-700" title={`Dans la liste Réseau Aval${contact.statut ? ` (${contact.statut})` : ""}`}>
        <Check className="size-3.5" /> Intégré{contact.statut && contact.statut !== "Accepté" ? ` · ${contact.statut.toLowerCase()}` : ""}
      </span>
    );
  }
  if (exclu) return <span className="text-[12px] text-muted-foreground">—</span>;
  const bouton = (libelle: string) => (
    <button type="button" onClick={onIntegrer} disabled={lectureSeule || enCours} title={lectureSeule ? TEXTES.motifLectureSeule : undefined}
      className="inline-flex items-center gap-1 rounded-full border border-avisdoc-teal px-2.5 py-1 text-[11.5px] font-semibold text-avisdoc-teal hover:bg-sky-50 disabled:opacity-50">
      {enCours ? <Loader2 className="size-3 animate-spin" /> : <UserPlus className="size-3" />} {libelle}
    </button>
  );
  if (contact) {
    return (
      <div className="space-y-1">
        <div className="text-[11px] text-muted-foreground">{contact.types.join(", ") || "Dans la liste"}</div>
        {bouton("+ Aval")}
      </div>
    );
  }
  return bouton("Intégrer");
}
const LIBELLE_TRI: Record<CleTri, string> = {
  score: "probabilité d'adhésion", nom: "nom", population: "population", lieu: "commune", exercice: "mode d'exercice",
  avalider: "points à valider", reseau: "réseau d'aval", google: "statut Google", doctolib: "statut Doctolib",
};

/** En-tête de colonne cliquable pour trier ; la flèche montre le tri en cours. */
function EnTete({ cle, tri, onTri, children, centre, droite, titre }: {
  cle: CleTri; tri: { cle: CleTri; sens: 1 | -1 }; onTri: (c: CleTri) => void; children: React.ReactNode;
  centre?: boolean; droite?: boolean; titre?: string;
}) {
  const actif = tri.cle === cle;
  return (
    <button type="button" onClick={() => onTri(cle)} title={`Trier par ${LIBELLE_TRI[cle]}${titre ? ` (${titre})` : ""}`}
      className={cn("inline-flex items-center gap-1 uppercase tracking-[0.05em] hover:text-avisdoc-ink", actif && "text-avisdoc-ink",
        centre && "justify-center", droite && "justify-end")}>
      {children}
      <span className={cn("text-[10px]", !actif && "opacity-0")}>{tri.sens === 1 ? "▲" : "▼"}</span>
    </button>
  );
}

function Filtre({ label, tous, valeur, onChange, options, largeur = 112 }: {
  label: string; tous: string; valeur: string; onChange: (v: string) => void; options: [string, string][]; largeur?: number;
}) {
  return (
    <select aria-label={label} value={valeur} onChange={(e) => onChange(e.target.value)} title={`${label} : ${tous}`}
      style={{ width: largeur }}
      className={cn("shrink-0 truncate rounded-full border border-border bg-card py-1.5 pl-3 pr-6 text-[12.5px]", valeur && "border-avisdoc-teal font-semibold")}>
      <option value="">{label}</option>
      {options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
    </select>
  );
}
