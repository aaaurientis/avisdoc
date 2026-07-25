// Carte « Espace client » injectée dans la fiche projet (ProjectView).
// Logo, domaines, documents générés + statut, utilisateurs + invitations.
// Auto-contenue : charge ses données via espaceRepo, n'impacte pas le CRM.
import { useEffect, useRef, useState, type ElementType } from "react";
import { Card, SectionLabel } from "../components/ui";
import {
  espaceRepo, type Domaine, type EspaceInfo, type EspaceUser,
  type GeneratedDoc, type GenJob,
} from "./espaceRepo";

const inputCls =
  "w-full rounded-xl border border-border bg-muted/50 px-3.5 py-2.5 text-[13px] outline-none transition-colors focus:border-avisdoc-teal";
const btnPrimary = "rounded-xl bg-avisdoc-ink px-3.5 py-2 text-[13px] font-medium text-white hover:opacity-90 disabled:opacity-40";
const btnGhost = "rounded-xl border border-border bg-card px-3 py-2 text-[13px] text-muted-foreground hover:border-avisdoc-ink";

const domaineDe = (email: string) => email.split("@")[1]?.toLowerCase() ?? "";

export default function EspaceClientCard({
  clientId,
  clientName,
  bare = false,
}: {
  clientId: string;
  clientName: string;
  bare?: boolean;
}) {
  const [info, setInfo] = useState<EspaceInfo | null>(null);
  const [domaines, setDomaines] = useState<Domaine[]>([]);
  const [users, setUsers] = useState<EspaceUser[]>([]);
  const [docs, setDocs] = useState<GeneratedDoc[]>([]);
  const [jobs, setJobs] = useState<GenJob[]>([]);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [newDom, setNewDom] = useState("");
  const [newUser, setNewUser] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  async function recharger() {
    setErr(null);
    try {
      const [i, d, u, dc, j] = await Promise.all([
        espaceRepo.info(clientId), espaceRepo.domaines(clientId),
        espaceRepo.users(clientId), espaceRepo.docs(clientId), espaceRepo.jobs(clientId),
      ]);
      setInfo(i); setDomaines(d); setUsers(u); setDocs(dc); setJobs(j);
    } catch (e: any) { setErr(e?.message ?? String(e)); }
  }
  useEffect(() => { recharger(); /* eslint-disable-next-line */ }, [clientId]);

  const domSet = new Set(domaines.map((d) => d.domaine));
  const signe = info?.stage === "Signé";

  async function agir(fn: () => Promise<void>, ok?: string) {
    setBusy(true); setErr(null); setMsg(null);
    try { await fn(); if (ok) setMsg(ok); await recharger(); }
    catch (e: any) { setErr(e?.message ?? String(e)); }
    finally { setBusy(false); }
  }

  async function onLogo(f: File) {
    // Contrôles côté admin (le service revalide) : format + poids raisonnable.
    if (!/\.(png|svg)$/i.test(f.name)) { setErr("Logo : PNG ou SVG à fond transparent."); return; }
    await agir(() => espaceRepo.uploadLogo(clientId, f),
      signe ? "Logo enregistré — régénération déclenchée." : "Logo enregistré.");
  }

  async function ouvrir(d: GeneratedDoc) {
    const url = await espaceRepo.docUrl(d);
    if (url) window.open(url, "_blank", "noopener");
  }

  async function inviter() {
    await agir(async () => {
      const r = await espaceRepo.inviter(clientId);
      if (r.erreurs.length) setErr(r.erreurs.join(" ; "));
      if (r.invites) setMsg(`Liens envoyés : ${r.invites}.`);
      else if (!r.erreurs.length) setMsg("Aucun utilisateur déclaré à qui envoyer un lien.");
    });
  }

  async function renvoyer(u: EspaceUser) {
    await agir(async () => {
      const r = await espaceRepo.inviter(clientId, u.id);
      if (r.erreurs.length) setErr(r.erreurs.join(" ; "));
      else if (r.invites) setMsg(`Lien renvoyé à ${u.email}.`);
    });
  }

  // En mode « bare » (dans un accordéon), on retire la carte englobante et le
  // libellé de section redondant avec l'en-tête de l'accordéon.
  const Wrap: ElementType = bare ? "div" : Card;
  return (
    <Wrap className={bare ? "" : "p-[22px]"}>
      <div className="mb-3 flex items-center justify-between">
        {!bare && <SectionLabel>Espace client</SectionLabel>}
        <span className={`rounded-full px-2.5 py-0.5 text-[11px] ${signe ? "bg-avisdoc-teal/15 text-avisdoc-teal" : "bg-muted text-muted-foreground"}`}>
          {signe ? "Signé — espace actif" : "S'active au passage à « Signé »"}
        </span>
      </div>

      {msg && <p className="mb-3 rounded-xl border border-avisdoc-teal/30 bg-avisdoc-teal/10 px-3.5 py-2 text-[13px]">{msg}</p>}
      {err && <p className="mb-3 rounded-xl border border-orange-400/40 bg-orange-50 px-3.5 py-2 text-[13px] text-orange-700">{err}</p>}

      {/* Logo */}
      <div className="mb-5">
        <p className="mb-2 text-[13px] font-medium">Logo du client</p>
        <p className="mb-2 text-[12px] text-muted-foreground">
          PNG ou SVG à fond transparent, hauteur ≥ 200 px. Apposé uniquement sur les documents qui l'admettent (jamais les documents médicaux).
        </p>
        <div className="flex items-center gap-3">
          <button className={btnPrimary} disabled={busy} onClick={() => fileRef.current?.click()}>
            {info?.logo_path ? "Remplacer le logo" : "Téléverser un logo"}
          </button>
          <input ref={fileRef} type="file" accept="image/png,image/svg+xml" className="hidden"
                 onChange={(e) => e.target.files?.[0] && onLogo(e.target.files[0])} />
          {info?.logo_path && (
            <span className="text-[12px] text-muted-foreground">Enregistré · {info.logo_sha256?.slice(0, 10)}…</span>
          )}
        </div>
      </div>

      {/* Domaines */}
      <div className="mb-5">
        <p className="mb-2 text-[13px] font-medium">Domaines autorisés</p>
        <div className="flex gap-2">
          <input className={inputCls} placeholder="acme.fr" value={newDom}
                 onChange={(e) => setNewDom(e.target.value)}
                 onKeyDown={(e) => e.key === "Enter" && agir(() => espaceRepo.addDomaine(clientId, newDom)).then(() => setNewDom(""))} />
          <button className={btnGhost} disabled={busy || !newDom.trim()}
                  onClick={() => agir(() => espaceRepo.addDomaine(clientId, newDom)).then(() => setNewDom(""))}>Ajouter</button>
        </div>
        <div className="mt-2 flex flex-wrap gap-2">
          {domaines.map((d) => (
            <span key={d.id} className="flex items-center gap-2 rounded-full bg-muted px-3 py-1 text-[12px]">
              @{d.domaine}
              <button className="text-muted-foreground hover:text-orange-600" onClick={() => agir(() => espaceRepo.removeDomaine(d.id))}>×</button>
            </span>
          ))}
          {domaines.length === 0 && <span className="text-[12px] text-muted-foreground">Aucun domaine.</span>}
        </div>
      </div>

      {/* Utilisateurs + invitations */}
      <div className="mb-5">
        <p className="mb-2 text-[13px] font-medium">Utilisateurs de l'espace</p>
        <div className="flex gap-2">
          <input className={inputCls} placeholder="prenom@acme.fr" value={newUser}
                 onChange={(e) => setNewUser(e.target.value)} />
          <button className={btnGhost} disabled={busy || !newUser.trim()}
                  onClick={() => {
                    if (!domSet.has(domaineDe(newUser))) { setErr("Cette adresse n'appartient à aucun domaine déclaré."); return; }
                    agir(() => espaceRepo.addUser(clientId, newUser)).then(() => setNewUser(""));
                  }}>Déclarer</button>
        </div>
        <ul className="mt-2 divide-y divide-border rounded-xl border border-border">
          {users.map((u) => (
            <li key={u.id} className="flex items-center justify-between gap-2 px-3 py-2 text-[13px]">
              <span className="min-w-0 truncate">{u.email}
                {u.premiere_connexion_le ? <span className="ml-2 text-avisdoc-teal">· connecté</span>
                  : u.auth_user_id ? <span className="ml-2 text-muted-foreground">· invité</span>
                  : <span className="ml-2 text-muted-foreground">· en attente</span>}
              </span>
              <span className="flex shrink-0 items-center gap-3">
                <button className="text-avisdoc-teal hover:underline disabled:opacity-40" disabled={busy}
                        onClick={() => renvoyer(u)}>
                  {u.auth_user_id ? "Renvoyer le lien" : "Inviter"}
                </button>
                <button className="text-muted-foreground hover:text-orange-600" onClick={() => agir(() => espaceRepo.removeUser(u.id))}>Retirer</button>
              </span>
            </li>
          ))}
          {users.length === 0 && <li className="px-3 py-2 text-[13px] text-muted-foreground">Aucun utilisateur.</li>}
        </ul>
        <button className={`${btnPrimary} mt-2`} disabled={busy || users.length === 0} onClick={inviter}>
          (Re)envoyer les liens à tous
        </button>
        {!signe && <p className="mt-1 text-[12px] text-muted-foreground">L'espace s'ouvre au passage à « Signé », mais tu peux envoyer un lien dès maintenant.</p>}
      </div>

      {/* Documents générés */}
      <div>
        <p className="mb-2 text-[13px] font-medium">Documents générés ({docs.length})</p>
        {jobs[0] && jobs[0].statut !== "termine" && (
          <p className="mb-2 text-[12px] text-muted-foreground">
            Génération : {jobs[0].statut}{jobs[0].erreur ? ` — ${jobs[0].erreur}` : "…"}
          </p>
        )}
        <ul className="divide-y divide-border rounded-xl border border-border">
          {docs.map((d) => (
            <li key={d.id} className="flex items-center justify-between px-3 py-2 text-[13px]">
              <button className="text-left hover:text-avisdoc-teal" onClick={() => ouvrir(d)}>{d.titre}</button>
              <span className="flex items-center gap-2 text-[11px] text-muted-foreground">
                <span>{d.phase}</span>
                <span className="rounded bg-muted px-2 py-0.5">{d.acces}</span>
                <span>v{d.version}</span>
              </span>
            </li>
          ))}
          {docs.length === 0 && (
            <li className="px-3 py-2 text-[13px] text-muted-foreground">
              {signe ? "Génération en cours ou logo manquant." : "Passez le client à « Signé » (avec un logo) pour générer."}
            </li>
          )}
        </ul>
      </div>
    </Wrap>
  );
}
