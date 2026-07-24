import { useCallback, useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { supabase } from "../lib/supabase";
import {
  STATUTS_CRM,
  type Client,
  type Domaine,
  type UtilisateurClient,
  type DocumentGenere,
  type GenerationJob,
  type StatutCrm,
} from "../lib/types";

async function sha256Hex(buf: ArrayBuffer): Promise<string> {
  const h = await crypto.subtle.digest("SHA-256", buf);
  return [...new Uint8Array(h)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

const domaineDe = (email: string) => email.split("@")[1]?.toLowerCase() ?? "";

export function ClientDetail() {
  const { id } = useParams<{ id: string }>();
  const [client, setClient] = useState<Client | null>(null);
  const [domaines, setDomaines] = useState<Domaine[]>([]);
  const [users, setUsers] = useState<UtilisateurClient[]>([]);
  const [docs, setDocs] = useState<DocumentGenere[]>([]);
  const [jobs, setJobs] = useState<GenerationJob[]>([]);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const charger = useCallback(async () => {
    if (!id) return;
    const [c, d, u, dc, j] = await Promise.all([
      supabase.from("clients").select("*").eq("id", id).single(),
      supabase.from("domaines").select("*").eq("client_id", id).order("domaine"),
      supabase.from("utilisateurs_client").select("*").eq("client_id", id).order("email"),
      supabase.from("documents").select("*").eq("client_id", id).order("phase"),
      supabase.from("generation_jobs").select("*").eq("client_id", id).order("cree_le", { ascending: false }),
    ]);
    if (c.error) { setErr(c.error.message); return; }
    setClient(c.data as Client);
    setDomaines((d.data ?? []) as Domaine[]);
    setUsers((u.data ?? []) as UtilisateurClient[]);
    setDocs((dc.data ?? []) as DocumentGenere[]);
    setJobs((j.data ?? []) as GenerationJob[]);
  }, [id]);

  useEffect(() => { charger(); }, [charger]);

  if (!client) return <p className="text-ardoise">{err ?? "Chargement…"}</p>;

  const domainesSet = new Set(domaines.map((d) => d.domaine));

  async function changerStatut(statut: StatutCrm) {
    setErr(null); setMsg(null);
    if (statut === "signe" && !client!.logo_path) {
      setErr("Téléversez le logo du client avant de passer au statut « Signé » : la génération en a besoin.");
      return;
    }
    const { error } = await supabase.from("clients").update({ statut_crm: statut }).eq("id", client!.id);
    if (error) setErr(error.message);
    else { setMsg(statut === "signe" ? "Statut « Signé » : la génération des documents a été déclenchée." : "Statut mis à jour."); charger(); }
  }

  async function televerserLogo(file: File) {
    setErr(null); setMsg(null);
    const buf = await file.arrayBuffer();
    const empreinte = await sha256Hex(buf);
    const ext = file.name.toLowerCase().endsWith(".svg") ? ".svg" : ".png";
    const chemin = `${client!.id}/logo${ext}`;
    const up = await supabase.storage.from("logos").upload(chemin, file, { upsert: true });
    if (up.error) { setErr(up.error.message); return; }
    const { error } = await supabase
      .from("clients")
      .update({ logo_path: chemin, logo_sha256: empreinte })
      .eq("id", client!.id);
    if (error) setErr(error.message);
    else {
      setMsg(client!.statut_crm === "signe"
        ? "Logo mis à jour : régénération des documents déclenchée."
        : "Logo enregistré.");
      charger();
    }
  }

  async function ajouterDomaine(domaine: string) {
    const d = domaine.trim().toLowerCase().replace(/^@/, "");
    if (!d) return;
    const { error } = await supabase.from("domaines").insert({ client_id: client!.id, domaine: d });
    if (error) setErr(error.message); else charger();
  }

  async function retirerDomaine(idDom: string) {
    await supabase.from("domaines").delete().eq("id", idDom);
    charger();
  }

  async function ajouterUser(email: string) {
    setErr(null);
    const e = email.trim().toLowerCase();
    if (!e) return;
    if (!domainesSet.has(domaineDe(e))) {
      setErr(`L'adresse ${e} n'appartient à aucun domaine déclaré pour ce client.`);
      return;
    }
    const { error } = await supabase.from("utilisateurs_client").insert({ client_id: client!.id, email: e });
    if (error) setErr(error.message); else charger();
  }

  async function retirerUser(idU: string) {
    await supabase.from("utilisateurs_client").delete().eq("id", idU);
    charger();
  }

  async function envoyerInvitations() {
    setErr(null); setMsg(null);
    const { data, error } = await supabase.functions.invoke("inviter-utilisateurs", {
      body: { client_id: client!.id },
    });
    if (error) { setErr(error.message); return; }
    const n = data?.invites ?? 0;
    const raisons: string[] = data?.erreurs ?? [];
    setMsg(`Invitations envoyées : ${n}.` + (raisons.length ? ` Ignorés — ${raisons.join(" ; ")}` : ""));
    if (raisons.length && n === 0) setErr(raisons.join(" ; "));
    charger();
  }

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <h1 className="font-serif text-2xl">{client.nom}</h1>
        <select
          value={client.statut_crm}
          onChange={(e) => changerStatut(e.target.value as StatutCrm)}
          className="rounded border border-filet bg-white px-3 py-1.5 text-sm"
        >
          {STATUTS_CRM.map((s) => (
            <option key={s.valeur} value={s.valeur}>{s.libelle}</option>
          ))}
        </select>
      </div>

      {msg && <p className="rounded border border-cyan/30 bg-cyan/10 px-4 py-2 text-sm text-marine">{msg}</p>}
      {err && <p className="rounded border border-orange/40 bg-orange/10 px-4 py-2 text-sm text-marine">{err}</p>}

      {/* Logo */}
      <Section titre="Logo du client">
        <p className="text-sm text-ardoise">
          PNG ou SVG à fond transparent, hauteur ≥ 200 px. Le logo n'est apposé
          que sur les documents qui l'admettent (jamais sur les documents médicaux).
        </p>
        <div className="mt-3 flex items-center gap-4">
          <label className="cursor-pointer rounded bg-marine px-3 py-1.5 text-sm text-creme">
            {client.logo_path ? "Remplacer le logo" : "Téléverser un logo"}
            <input
              type="file"
              accept="image/png,image/svg+xml"
              className="hidden"
              onChange={(e) => e.target.files?.[0] && televerserLogo(e.target.files[0])}
            />
          </label>
          {client.logo_path && (
            <span className="text-sm text-ardoise">
              Enregistré · empreinte {client.logo_sha256?.slice(0, 12)}…
            </span>
          )}
        </div>
      </Section>

      {/* Domaines */}
      <Section titre="Domaines autorisés">
        <ChampAjout placeholder="acme.fr" onAjouter={ajouterDomaine} bouton="Ajouter" />
        <ul className="mt-3 flex flex-wrap gap-2">
          {domaines.map((d) => (
            <li key={d.id} className="flex items-center gap-2 rounded-full bg-filet px-3 py-1 text-sm">
              @{d.domaine}
              <button onClick={() => retirerDomaine(d.id)} className="text-ardoise hover:text-orange">×</button>
            </li>
          ))}
          {domaines.length === 0 && <li className="text-sm text-ardoise">Aucun domaine.</li>}
        </ul>
      </Section>

      {/* Utilisateurs */}
      <Section titre="Utilisateurs déclarés">
        <ChampAjout placeholder="prenom@acme.fr" onAjouter={ajouterUser} bouton="Déclarer" />
        <ul className="mt-3 divide-y divide-filet rounded border border-filet">
          {users.map((u) => (
            <li key={u.id} className="flex items-center justify-between px-3 py-2 text-sm">
              <span>
                {u.email}
                {u.premiere_connexion_le
                  ? <span className="ml-2 text-cyan">· connecté</span>
                  : u.auth_user_id
                    ? <span className="ml-2 text-ardoise">· invité</span>
                    : <span className="ml-2 text-ardoise">· en attente d'invitation</span>}
              </span>
              <button onClick={() => retirerUser(u.id)} className="text-ardoise hover:text-orange">Retirer</button>
            </li>
          ))}
          {users.length === 0 && <li className="px-3 py-3 text-sm text-ardoise">Aucun utilisateur.</li>}
        </ul>
        <button
          onClick={envoyerInvitations}
          disabled={users.length === 0 || client.statut_crm !== "signe"}
          className="mt-3 rounded bg-cyan px-3 py-1.5 text-sm font-medium text-marine disabled:cursor-not-allowed disabled:opacity-40"
        >
          Envoyer les invitations
        </button>
        {client.statut_crm !== "signe" && (
          <p className="mt-1 text-xs text-ardoise">Disponible une fois le client au statut « Signé ».</p>
        )}
      </Section>

      {/* Génération */}
      <Section titre="Génération">
        <ul className="space-y-1 text-sm">
          {jobs.map((j) => (
            <li key={j.id} className="flex items-center justify-between rounded border border-filet px-3 py-2">
              <span>{j.type === "creation_espace" ? "Création de l'espace" : "Mise à jour du logo"}</span>
              <span className={
                j.statut === "termine" ? "text-cyan"
                : j.statut === "echec" ? "text-orange"
                : "text-ardoise"
              }>
                {j.statut}{j.erreur ? ` — ${j.erreur}` : ""}
              </span>
            </li>
          ))}
          {jobs.length === 0 && <li className="text-ardoise">Aucune génération lancée.</li>}
        </ul>
      </Section>

      {/* Documents */}
      <Section titre={`Documents générés (${docs.length})`}>
        <ul className="divide-y divide-filet rounded border border-filet text-sm">
          {docs.map((d) => (
            <li key={d.id} className="flex items-center justify-between px-3 py-2">
              <span>{d.titre}</span>
              <span className="flex items-center gap-3 text-xs text-ardoise">
                <span>{d.phase}</span>
                <span className="rounded bg-filet px-2 py-0.5">{d.acces}</span>
                <span>v{d.version}</span>
              </span>
            </li>
          ))}
          {docs.length === 0 && <li className="px-3 py-3 text-ardoise">Aucun document généré.</li>}
        </ul>
      </Section>
    </div>
  );
}

function Section({ titre, children }: { titre: string; children: React.ReactNode }) {
  return (
    <section className="rounded-lg border border-filet bg-white p-5">
      <h2 className="mb-3 font-serif text-lg">{titre}</h2>
      {children}
    </section>
  );
}

function ChampAjout({ placeholder, bouton, onAjouter }:
  { placeholder: string; bouton: string; onAjouter: (v: string) => void }) {
  const [v, setV] = useState("");
  return (
    <form
      onSubmit={(e) => { e.preventDefault(); onAjouter(v); setV(""); }}
      className="flex gap-2"
    >
      <input
        value={v}
        onChange={(e) => setV(e.target.value)}
        placeholder={placeholder}
        className="flex-1 rounded border border-filet bg-white px-3 py-1.5 text-sm"
      />
      <button className="rounded bg-marine px-3 py-1.5 text-sm text-creme">{bouton}</button>
    </form>
  );
}
