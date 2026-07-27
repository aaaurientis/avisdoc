// Bloc « Devis Qonto » de la section Proposition (fiche projet).
// Créer un devis à partir de l'offre financière, le télécharger, le supprimer.
// Le client Qonto est créé/associé automatiquement (données Pappers) au 1er devis.
import { useEffect, useState } from "react";
import { devisRepo, type Devis, type ContactFact } from "./devisRepo";
import { euro, frDate } from "../lib/format";

const btnPrimary = "rounded-xl bg-avisdoc-ink px-3.5 py-2 text-[13px] font-medium text-white hover:opacity-90 disabled:opacity-40";
const btnGhost = "rounded-xl border border-border bg-card px-3 py-2 text-[13px] text-muted-foreground hover:border-avisdoc-ink disabled:opacity-40";

interface StatutClient { lie: boolean; id?: string; trouve?: { id: string; name?: string } | null }

export default function DevisQonto({ clientId }: { clientId: string }) {
  const [devis, setDevis] = useState<Devis[]>([]);
  const [statut, setStatut] = useState<StatutClient | null>(null);
  const [statutErr, setStatutErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [contact, setContact] = useState<ContactFact>({ prenom: "", nom: "", email: "" });
  const [contactSaved, setContactSaved] = useState(false);

  async function recharger() {
    try {
      setDevis(await devisRepo.liste(clientId));
      try { setStatut(await devisRepo.statutClient(clientId)); setStatutErr(null); }
      catch (e: any) { setStatut(null); setStatutErr(e?.message ?? String(e)); }
    } catch (e: any) { setErr(e?.message ?? String(e)); }
  }
  useEffect(() => {
    recharger();
    devisRepo.contactFact(clientId).then(setContact).catch(() => {});
    /* eslint-disable-next-line */
  }, [clientId]);

  function majContact(patch: Partial<ContactFact>) {
    setContact((c) => ({ ...c, ...patch }));
    setContactSaved(false);
  }
  async function enregistrerContact() {
    await agir(() => devisRepo.setContactFact(clientId, contact));
    setContactSaved(true);
  }

  async function agir(fn: () => Promise<any>, ok?: string) {
    setBusy(true); setErr(null); setMsg(null);
    try { const r = await fn(); if (ok) setMsg(ok); await recharger(); return r; }
    catch (e: any) { setErr(e?.message ?? String(e)); }
    finally { setBusy(false); }
  }

  async function telecharger(d: Devis) {
    if (!d.pdf_path) { setErr("PDF indisponible pour ce devis."); return; }
    const url = await devisRepo.pdfUrl(d.pdf_path);
    if (url) window.open(url, "_blank", "noopener");
  }

  return (
    <div className="rounded-2xl border border-border p-5">
      <div className="mb-3 flex items-center justify-between gap-2">
        <div className="text-[11px] font-bold uppercase tracking-[0.06em] text-muted-foreground">Devis Qonto</div>
        <div className="flex gap-2">
          <button className={btnGhost} disabled={busy}
            onClick={() => agir(async () => {
              const r = await devisRepo.diag();
              if (r?.ok) setMsg(`Connexion Qonto OK (${r.organisation ?? "ok"}).`);
              else setErr("Qonto : " + JSON.stringify(r?.qonto ?? r));
            })}>
            Tester la connexion
          </button>
          <button className={btnPrimary} disabled={busy}
            onClick={() => agir(() => devisRepo.creer(clientId), "Devis créé dans Qonto.")}>
            {busy ? "…" : "Créer le devis"}
          </button>
        </div>
      </div>

      {/* Statut Qonto indisponible (fonction non déployée, secrets manquants, erreur API) */}
      {statutErr && (
        <p className="mb-3 break-words rounded-xl border border-amber-300/50 bg-amber-50 px-3.5 py-2 text-[12px] text-amber-800">
          Statut Qonto indisponible : {statutErr}
        </p>
      )}

      {/* Statut du client dans Qonto */}
      {statut && (
        <div className="mb-3 flex flex-wrap items-center gap-2 text-[12.5px]">
          {statut.lie ? (
            <span className="rounded-full bg-avisdoc-teal/15 px-2.5 py-0.5 text-avisdoc-teal">Client lié à Qonto ✓</span>
          ) : statut.trouve ? (
            <>
              <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-amber-700">
                Déjà dans Qonto{statut.trouve.name ? ` (« ${statut.trouve.name} »)` : ""} — non lié
              </span>
              <button className={btnGhost} disabled={busy}
                onClick={() => agir(() => devisRepo.associerClient(clientId), "Client associé à Qonto.")}>
                Associer
              </button>
            </>
          ) : (
            <>
              <span className="rounded-full bg-muted px-2.5 py-0.5 text-muted-foreground">Pas encore dans Qonto</span>
              <button className={btnGhost} disabled={busy}
                onClick={() => agir(() => devisRepo.associerClient(clientId), "Client créé dans Qonto.")}>
                Créer le client
              </button>
            </>
          )}
        </div>
      )}

      {/* Contact de facturation — prénom / nom séparés pour éviter les erreurs de découpage.
          Pré-rempli depuis le 1er contact CRM ; utilisé à la création du client Qonto. */}
      {!statut?.lie && (
        <div className="mb-3 rounded-xl border border-border bg-muted/30 p-3">
          <div className="mb-2 text-[11px] font-semibold uppercase tracking-[0.05em] text-muted-foreground">
            Contact (facturation)
          </div>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
            <input className="rounded-lg border border-border bg-card px-2.5 py-1.5 text-[13px]"
              placeholder="Prénom" value={contact.prenom}
              onChange={(e) => majContact({ prenom: e.target.value })} />
            <input className="rounded-lg border border-border bg-card px-2.5 py-1.5 text-[13px]"
              placeholder="Nom" value={contact.nom}
              onChange={(e) => majContact({ nom: e.target.value })} />
            <input className="rounded-lg border border-border bg-card px-2.5 py-1.5 text-[13px]"
              type="email" placeholder="E-mail" value={contact.email}
              onChange={(e) => majContact({ email: e.target.value })} />
          </div>
          <div className="mt-2 flex items-center gap-2">
            <button className={btnGhost} disabled={busy} onClick={enregistrerContact}>
              Enregistrer le contact
            </button>
            {contactSaved && <span className="text-[12px] text-avisdoc-teal">Enregistré ✓</span>}
          </div>
        </div>
      )}

      {msg && <p className="mb-3 rounded-xl border border-avisdoc-teal/30 bg-avisdoc-teal/10 px-3.5 py-2 text-[13px]">{msg}</p>}
      {err && <p className="mb-3 break-words rounded-xl border border-orange-400/40 bg-orange-50 px-3.5 py-2 text-[12px] text-orange-700">{err}</p>}

      <ul className="divide-y divide-border">
        {devis.map((d) => (
          <li key={d.id} className="flex items-center gap-3 py-2 text-[13px]">
            <span className="min-w-0 flex-1 truncate">
              {d.numero ?? "Devis"} · <span className="text-muted-foreground">{frDate(d.cree_le.slice(0, 10))}</span>
            </span>
            <span className="shrink-0 font-semibold text-avisdoc-ink">{d.montant_ttc != null ? euro(Math.round(d.montant_ttc)) : "—"} TTC</span>
            <button className="shrink-0 text-avisdoc-teal hover:underline disabled:opacity-40" disabled={!d.pdf_path}
              onClick={() => telecharger(d)}>Télécharger</button>
            <button className="shrink-0 text-muted-foreground hover:text-orange-600" disabled={busy}
              onClick={() => agir(() => devisRepo.supprimer(d.id), "Devis supprimé.")}>Supprimer</button>
          </li>
        ))}
        {devis.length === 0 && <li className="py-2 text-[13px] text-muted-foreground">Aucun devis pour ce client.</li>}
      </ul>
    </div>
  );
}
