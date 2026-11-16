// Réseau d'aval — écran 1 : les départements travaillés. L'utilisateur ajoute un
// département et en choisit l'état ; le module compte, il ne décide pas.

import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Loader2, Plus } from "lucide-react";
import { toast } from "sonner";
import { Card, Modal, PageHeader } from "../components/ui";
import { lectureSeuleActive } from "../lib/lectureSeule";
import {
  DEPARTEMENTS,
  ETAT_DEPARTEMENT_BADGE,
  ETAT_DEPARTEMENT_LABEL,
  ETAT_PRATICIEN_LABEL,
  ETATS_DEPARTEMENT,
  ROLE_LABEL,
  TEXTES,
  dateFr,
  estPerime,
  type EtatDepartement,
  type EtatPraticien,
  type Role,
} from "../reseau/libelles";
import { reseauRepo, type DepartementReseau, type ResumeDepartement } from "../reseau/reseauRepo";
import ExportImportDoctolib from "./reseau/ExportImportDoctolib";
import { cn } from "@/lib/utils";

const COLS = "56px minmax(150px,1.4fr) 150px 80px minmax(180px,1.6fr) minmax(150px,1.2fr) 120px";
const ETATS_AFFICHES: EtatPraticien[] = ["identifie", "qualifie", "a_contacter", "contacte", "en_discussion", "accord"];
const ROLES_COUVERTURE: Role[] = ["consultation", "dermoscopie", "exerese"];

const trierDepartements = (a: DepartementReseau, b: DepartementReseau) =>
  (a.ordre ?? 9999) - (b.ordre ?? 9999) || a.code.localeCompare(b.code);

export default function ReseauDepartements() {
  const navigate = useNavigate();
  const [deps, setDeps] = useState<DepartementReseau[]>([]);
  const [resumes, setResumes] = useState<Map<string, ResumeDepartement>>(new Map());
  const [chargement, setChargement] = useState(true);
  const [erreur, setErreur] = useState<string | null>(null);
  const [ajout, setAjout] = useState(false);
  const lectureSeule = lectureSeuleActive();

  const charger = async () => {
    setChargement(true);
    setErreur(null);
    try {
      const [d, r] = await Promise.all([reseauRepo.departements(), reseauRepo.resumes()]);
      setDeps(d.sort(trierDepartements));
      setResumes(r);
    } catch (e) {
      setErreur(e instanceof Error ? e.message : String(e));
    } finally {
      setChargement(false);
    }
  };
  useEffect(() => { void charger(); }, []);

  const changerEtat = async (code: string, etat: EtatDepartement) => {
    try {
      await reseauRepo.modifierDepartement(code, { etat });
      setDeps((ds) => ds.map((d) => (d.code === code ? { ...d, etat } : d)));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <div>
      <PageHeader
        title={TEXTES.titre}
        subtitle={TEXTES.sousTitre}
        action={
          <button
            type="button"
            onClick={() => setAjout(true)}
            disabled={lectureSeule}
            title={lectureSeule ? TEXTES.motifLectureSeule : undefined}
            className="ad-btn-accent inline-flex items-center gap-1.5 rounded-full bg-avisdoc-teal px-5 py-2.5 text-sm font-bold text-white disabled:opacity-50"
          >
            <Plus className="size-4" /> {TEXTES.ajouterDepartement}
          </button>
        }
      />
      {lectureSeule && <p className="mb-3 text-[12.5px] text-muted-foreground">{TEXTES.motifLectureSeule}</p>}

      {erreur && (
        <div role="alert" className="mb-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-[13px] text-rose-800">
          {erreur}
        </div>
      )}

      <Card className="overflow-x-auto">
        <div className="min-w-[900px]">
          <div
            className="grid gap-3 border-b border-border/60 px-5 py-3 text-[11px] font-bold uppercase tracking-[0.05em] text-muted-foreground"
            style={{ gridTemplateColumns: COLS }}
          >
            <div>Ordre</div>
            <div>Département</div>
            <div>État</div>
            <div>Praticiens</div>
            <div>Par état</div>
            <div>Accords par rôle</div>
            <div>Dernier import</div>
          </div>

          {chargement && (
            <div className="flex items-center justify-center gap-2 px-5 py-10 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" /> Chargement…
            </div>
          )}

          {!chargement && deps.map((d) => {
            const r = resumes.get(d.code);
            return (
              <div
                key={d.code}
                role="button"
                tabIndex={0}
                onClick={() => navigate(`/reseau-aval/${d.code}`)}
                onKeyDown={(e) => { if (e.key === "Enter") navigate(`/reseau-aval/${d.code}`); }}
                className="ad-row grid cursor-pointer items-center gap-3 border-b border-border/60 px-5 py-3 text-left text-[13px] last:border-b-0"
                style={{ gridTemplateColumns: COLS }}
              >
                <div className="text-muted-foreground">{d.ordre ?? "—"}</div>
                <div className="min-w-0 truncate font-semibold text-avisdoc-ink">
                  {d.code} · {DEPARTEMENTS[d.code] ?? d.code}
                </div>
                <div onClick={(e) => e.stopPropagation()}>
                  <select
                    aria-label={`État du département ${d.code}`}
                    value={d.etat}
                    disabled={lectureSeule}
                    onChange={(e) => void changerEtat(d.code, e.target.value as EtatDepartement)}
                    className={cn("rounded-full border-0 px-2.5 py-1 text-[11.5px] font-bold", ETAT_DEPARTEMENT_BADGE[d.etat])}
                  >
                    {ETATS_DEPARTEMENT.map((e) => <option key={e} value={e}>{ETAT_DEPARTEMENT_LABEL[e]}</option>)}
                  </select>
                </div>
                <div className="font-semibold">{r?.total ?? 0}</div>
                <div className="text-[12px] text-muted-foreground">
                  {r && r.total > 0
                    ? ETATS_AFFICHES.filter((e) => r.parEtat[e]).map((e) => `${ETAT_PRATICIEN_LABEL[e]} ${r.parEtat[e]}`).join(" · ")
                    : "—"}
                </div>
                <div className="text-[12px] text-muted-foreground">
                  {ROLES_COUVERTURE.map((role) => `${ROLE_LABEL[role]} ${r?.accordsParRole[role] ?? 0}`).join(" · ")}
                </div>
                <div className="text-[12px]">
                  {d.dernierImportLe ? (
                    <span className={cn(estPerime(d.dernierImportLe) && "font-semibold text-amber-700")}>
                      {dateFr(d.dernierImportLe)}{estPerime(d.dernierImportLe) ? " · périmé" : ""}
                    </span>
                  ) : (
                    <span className="text-muted-foreground">Jamais</span>
                  )}
                </div>
              </div>
            );
          })}

          {!chargement && deps.length === 0 && !erreur && (
            <div className="px-5 py-10 text-center text-sm text-muted-foreground">{TEXTES.aucunDepartement}</div>
          )}
        </div>
      </Card>

      <ExportImportDoctolib lectureSeule={lectureSeule} />

      {ajout && (
        <AjoutDepartement
          dejaLa={new Set(deps.map((d) => d.code))}
          onClose={() => setAjout(false)}
          onAjoute={(code) => { setAjout(false); toast.success(`${DEPARTEMENTS[code]} ajouté.`); void charger(); }}
        />
      )}
    </div>
  );
}

function AjoutDepartement({ dejaLa, onClose, onAjoute }: {
  dejaLa: Set<string>;
  onClose: () => void;
  onAjoute: (code: string) => void;
}) {
  const choix = useMemo(() => Object.entries(DEPARTEMENTS).filter(([c]) => !dejaLa.has(c)), [dejaLa]);
  const [code, setCode] = useState("");
  const [ordre, setOrdre] = useState("");
  const [envoi, setEnvoi] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);

  const ordreInvalide = ordre !== "" && !/^\d{1,3}$/.test(ordre);
  const motif = !code ? "Choisissez un département." : ordreInvalide ? "L'ordre est un nombre entier." : envoi ? "Ajout en cours…" : null;

  const valider = async () => {
    if (motif) return;
    setEnvoi(true);
    setErreur(null);
    try {
      await reseauRepo.ajouterDepartement(code, ordre === "" ? null : Number(ordre));
      onAjoute(code);
    } catch (e) {
      // La fenêtre reste ouverte : l'erreur s'affiche, rien n'est perdu.
      setErreur(e instanceof Error ? e.message : String(e));
    } finally {
      setEnvoi(false);
    }
  };

  return (
    <Modal onClose={onClose}>
      <h2 className="font-display text-xl font-semibold text-avisdoc-ink">{TEXTES.ajouterDepartement}</h2>
      <label className="mt-5 block text-[12.5px] font-semibold text-avisdoc-ink">
        Département
        <select
          value={code}
          onChange={(e) => setCode(e.target.value)}
          className="mt-1.5 w-full rounded-xl border border-border bg-card px-3 py-2.5 text-[13.5px]"
        >
          <option value="">Choisir…</option>
          {choix.map(([c, nom]) => <option key={c} value={c}>{c} · {nom}</option>)}
        </select>
      </label>
      <label className="mt-4 block text-[12.5px] font-semibold text-avisdoc-ink">
        Ordre d'ouverture <span className="font-normal text-muted-foreground">(facultatif)</span>
        <input
          inputMode="numeric"
          value={ordre}
          onChange={(e) => setOrdre(e.target.value.trim())}
          className="mt-1.5 w-full rounded-xl border border-border bg-card px-3 py-2.5 text-[13.5px]"
          placeholder="1, 2, 3…"
        />
      </label>
      {erreur && (
        <div role="alert" className="mt-4 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2.5 text-[12.5px] text-rose-800">{erreur}</div>
      )}
      <div className="mt-6 flex items-center justify-end gap-3">
        <button type="button" onClick={onClose} className="rounded-full px-4 py-2 text-sm font-semibold text-muted-foreground">
          Annuler
        </button>
        <button
          type="button"
          onClick={() => void valider()}
          disabled={!!motif}
          title={motif ?? undefined}
          className="ad-btn-accent inline-flex items-center gap-1.5 rounded-full bg-avisdoc-teal px-5 py-2.5 text-sm font-bold text-white disabled:opacity-50"
        >
          {envoi && <Loader2 className="size-4 animate-spin" />} Ajouter
        </button>
      </div>
      {motif && <p className="mt-2 text-right text-[12px] text-muted-foreground">{motif}</p>}
    </Modal>
  );
}

