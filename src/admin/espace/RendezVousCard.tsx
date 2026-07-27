// Gestion des rendez-vous (journées de dépistage) dans la fiche projet.
// Créer une journée → génère un lien public à jeton (le {{lien}} des e-mails).
// Voir le remplissage + la liste des inscrits (nom/e-mail/téléphone/créneau).
import { useEffect, useState, type ElementType } from "react";
import { Card, SectionLabel } from "../components/ui";
import { rdvRepo, lienReservation, type Inscrit, type Journee } from "./rdvRepo";
import { frDate } from "../lib/format";

const inputCls =
  "w-full rounded-xl border border-border bg-muted/50 px-3 py-2 text-[13px] outline-none transition-colors focus:border-avisdoc-teal";
const btnPrimary = "rounded-xl bg-avisdoc-ink px-3.5 py-2 text-[13px] font-medium text-white hover:opacity-90 disabled:opacity-40";
const btnGhost = "rounded-xl border border-border bg-card px-3 py-2 text-[13px] text-muted-foreground hover:border-avisdoc-ink";

const H = (t: string) => t.slice(0, 5); // "09:00:00" → "09:00"

export default function RendezVousCard({ clientId, bare = false }: { clientId: string; bare?: boolean }) {
  const [journees, setJournees] = useState<Journee[]>([]);
  const [inscrits, setInscrits] = useState<Record<string, Inscrit[]>>({});
  const [ouvert, setOuvert] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({
    date: "", lieu: "", heure_debut: "09:00", heure_fin: "17:00", duree_min: 15,
    pause_debut: "12:30", pause_fin: "13:30", avecPause: true,
  });

  async function recharger() {
    setErr(null);
    try { setJournees(await rdvRepo.journees(clientId)); }
    catch (e: any) { setErr(e?.message ?? String(e)); }
  }
  useEffect(() => { recharger(); /* eslint-disable-next-line */ }, [clientId]);

  async function agir(fn: () => Promise<void>, ok?: string) {
    setBusy(true); setErr(null); setMsg(null);
    try { await fn(); if (ok) setMsg(ok); await recharger(); }
    catch (e: any) { setErr(e?.message ?? String(e)); }
    finally { setBusy(false); }
  }

  async function creer() {
    if (!form.date) { setErr("Choisissez une date."); return; }
    await agir(async () => {
      await rdvRepo.creer(clientId, {
        date: form.date, lieu: form.lieu.trim(),
        heure_debut: form.heure_debut, heure_fin: form.heure_fin, duree_min: Number(form.duree_min),
        pause_debut: form.avecPause ? form.pause_debut : null,
        pause_fin: form.avecPause ? form.pause_fin : null,
      });
      setForm({ ...form, date: "", lieu: "" });
    }, "Journée créée. Le lien de réservation est prêt.");
  }

  async function voirInscrits(j: Journee) {
    if (ouvert === j.id) { setOuvert(null); return; }
    setOuvert(j.id);
    if (!inscrits[j.id]) {
      try { setInscrits((m) => ({ ...m, [j.id]: [] })); const l = await rdvRepo.inscrits(j.id); setInscrits((m) => ({ ...m, [j.id]: l })); }
      catch (e: any) { setErr(e?.message ?? String(e)); }
    }
  }

  async function copier(token: string) {
    await navigator.clipboard.writeText(lienReservation(token));
    setMsg("Lien de réservation copié.");
    setTimeout(() => setMsg(null), 1800);
  }

  const Wrap: ElementType = bare ? "div" : Card;
  return (
    <Wrap className={bare ? "" : "p-[22px]"}>
      {!bare && <SectionLabel className="mb-3">Rendez-vous</SectionLabel>}

      {msg && <p className="mb-3 rounded-xl border border-avisdoc-teal/30 bg-avisdoc-teal/10 px-3.5 py-2 text-[13px]">{msg}</p>}
      {err && <p className="mb-3 rounded-xl border border-orange-400/40 bg-orange-50 px-3.5 py-2 text-[13px] text-orange-700">{err}</p>}

      {/* Créer une journée */}
      <div className="mb-5 rounded-xl border border-border p-4">
        <p className="mb-2 text-[13px] font-medium">Nouvelle journée de dépistage</p>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          <label className="text-[12px] text-muted-foreground">Date
            <input type="date" className={`${inputCls} mt-1`} value={form.date}
                   onChange={(e) => setForm({ ...form, date: e.target.value })} />
          </label>
          <label className="text-[12px] text-muted-foreground sm:col-span-1 lg:col-span-1">Lieu
            <input className={`${inputCls} mt-1`} placeholder="Bâtiment, salle…" value={form.lieu}
                   onChange={(e) => setForm({ ...form, lieu: e.target.value })} />
          </label>
          <label className="text-[12px] text-muted-foreground">Début
            <input type="time" className={`${inputCls} mt-1`} value={form.heure_debut}
                   onChange={(e) => setForm({ ...form, heure_debut: e.target.value })} />
          </label>
          <label className="text-[12px] text-muted-foreground">Fin
            <input type="time" className={`${inputCls} mt-1`} value={form.heure_fin}
                   onChange={(e) => setForm({ ...form, heure_fin: e.target.value })} />
          </label>
          <label className="text-[12px] text-muted-foreground">Durée d'un créneau (min)
            <input type="number" min={5} max={120} step={5} className={`${inputCls} mt-1`} value={form.duree_min}
                   onChange={(e) => setForm({ ...form, duree_min: Number(e.target.value) })} />
          </label>
          <label className="flex items-center gap-2 pt-5 text-[12px] text-muted-foreground">
            <input type="checkbox" checked={form.avecPause}
                   onChange={(e) => setForm({ ...form, avecPause: e.target.checked })} />
            Pause déjeuner
          </label>
          {form.avecPause && (
            <>
              <label className="text-[12px] text-muted-foreground">Pause début
                <input type="time" className={`${inputCls} mt-1`} value={form.pause_debut}
                       onChange={(e) => setForm({ ...form, pause_debut: e.target.value })} />
              </label>
              <label className="text-[12px] text-muted-foreground">Pause fin
                <input type="time" className={`${inputCls} mt-1`} value={form.pause_fin}
                       onChange={(e) => setForm({ ...form, pause_fin: e.target.value })} />
              </label>
            </>
          )}
        </div>
        <button className={`${btnPrimary} mt-3`} disabled={busy || !form.date} onClick={creer}>
          Créer la journée
        </button>
      </div>

      {/* Liste des journées */}
      <div className="space-y-2">
        {journees.map((j) => (
          <div key={j.id} className="rounded-xl border border-border">
            <div className="flex flex-wrap items-center gap-3 px-4 py-3">
              <div className="min-w-0 flex-1">
                <p className="text-[13.5px] font-semibold text-avisdoc-ink">
                  {frDate(j.date)}{j.lieu ? ` · ${j.lieu}` : ""}
                  {!j.actif && <span className="ml-2 text-[11px] text-orange-600">(fermée)</span>}
                </p>
                <p className="text-[12px] text-muted-foreground">
                  {H(j.heure_debut)}–{H(j.heure_fin)} · créneaux de {j.duree_min} min ·{" "}
                  <span className="font-semibold text-avisdoc-teal">{j.nb_rdv} réservé{j.nb_rdv > 1 ? "s" : ""}</span>
                </p>
              </div>
              <button className={btnGhost} onClick={() => copier(j.token)}>Copier le lien</button>
              <button className={btnGhost} onClick={() => voirInscrits(j)}>
                {ouvert === j.id ? "Masquer" : "Inscrits"}
              </button>
              <button className={btnGhost} disabled={busy}
                      onClick={() => agir(() => rdvRepo.setActif(j.id, !j.actif))}>
                {j.actif ? "Fermer" : "Rouvrir"}
              </button>
              <button className="text-muted-foreground hover:text-orange-600" disabled={busy}
                      onClick={() => agir(() => rdvRepo.supprimer(j.id))} title="Supprimer la journée">×</button>
            </div>

            {ouvert === j.id && (
              <div className="border-t border-border px-4 py-3">
                <ul className="divide-y divide-border">
                  {(inscrits[j.id] ?? []).map((i) => (
                    <li key={i.id} className="flex items-center gap-3 py-2 text-[13px]">
                      <span className="w-14 shrink-0 font-semibold text-avisdoc-ink">{H(i.creneau)}</span>
                      <span className="min-w-0 flex-1 truncate">{i.nom}</span>
                      <span className="hidden min-w-0 flex-1 truncate text-muted-foreground sm:block">{i.email}</span>
                      <span className="hidden shrink-0 text-muted-foreground md:block">{i.telephone}</span>
                      <button className="text-muted-foreground hover:text-orange-600" disabled={busy}
                              onClick={() => agir(() => rdvRepo.supprimerInscrit(i.id))} title="Annuler ce RDV">×</button>
                    </li>
                  ))}
                  {(inscrits[j.id]?.length ?? 0) === 0 && (
                    <li className="py-2 text-[13px] text-muted-foreground">Aucune inscription pour le moment.</li>
                  )}
                </ul>
              </div>
            )}
          </div>
        ))}
        {journees.length === 0 && (
          <p className="text-[13px] text-muted-foreground">Aucune journée programmée. Créez-en une ci-dessus.</p>
        )}
      </div>
    </Wrap>
  );
}
