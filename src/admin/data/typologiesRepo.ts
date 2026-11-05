// Typologies de clients et affectations (tables admin_typologies_clients / admin_clients_typologie,
// migration 0081). Les clients viennent de Qonto (fonction qonto, action apercu_clients).
// En mode démo : en mémoire, avec quelques clients fictifs.
import { supabaseAdmin as sb } from "./supabaseAdmin";
import { ADMIN_BACKEND } from "../lib/config";
import type { Affectation, Typologie } from "../lib/typologies";

export interface ClientQonto {
  id: string;
  name: string;
}

const demo = ADMIN_BACKEND !== "supabase";

/** Message lisible : la table absente veut dire que la migration n'a pas été jouée. */
function erreur(e: { message: string }): Error {
  return new Error(
    /schema cache|does not exist|relation .* not exist/i.test(e.message)
      ? "Les typologies attendent leur migration (0081) : le SQL n'a pas encore été exécuté sur la base."
      : e.message,
  );
}

// ── Démo ─────────────────────────────────────────────────────────────────────
let demoTypologies: Typologie[] = [
  { id: "t1", nom: "Client direct", description: "AvisDoc fournit le requérant et l'expert.", exige_requerant: true, exige_expert: true, exige_client: false, exige_consentements: false, exige_dermatoscope: false, par_defaut: true, position: 1 },
  { id: "t2", nom: "Partenaire sans CPS", description: "Le partenaire fournit les requérants : seul l'expert est exigé.", exige_requerant: false, exige_expert: true, exige_client: false, exige_consentements: false, exige_dermatoscope: false, par_defaut: false, position: 2 },
];
let demoAffectations: Affectation[] = [{ qonto_client_id: "c2", nom_qonto: "Mutuelle Démo", typologie_id: "t2", alias: [] }];
const DEMO_CLIENTS: ClientQonto[] = [
  { id: "c1", name: "Société Exemple SAS" },
  { id: "c2", name: "Mutuelle Démo" },
  { id: "c3", name: "Mairie Fictive" },
];
let n = 3;

// ── Typologies ───────────────────────────────────────────────────────────────
export async function listerTypologies(): Promise<Typologie[]> {
  if (demo) return [...demoTypologies].sort((a, b) => a.position - b.position);
  const { data, error } = await sb.from("admin_typologies_clients").select("*").order("position").order("nom");
  if (error) throw erreur(error);
  return (data ?? []) as Typologie[];
}

export async function enregistrerTypologie(t: Omit<Typologie, "id"> & { id?: string }): Promise<void> {
  if (demo) {
    if (t.par_defaut) demoTypologies = demoTypologies.map((x) => ({ ...x, par_defaut: false }));
    if (t.id) demoTypologies = demoTypologies.map((x) => (x.id === t.id ? ({ ...x, ...t } as Typologie) : x));
    else demoTypologies.push({ ...t, id: `t${++n}` } as Typologie);
    return;
  }
  // Une seule typologie par défaut : on retire le drapeau aux autres avant de le poser.
  if (t.par_defaut) {
    const { error } = await sb.from("admin_typologies_clients").update({ par_defaut: false }).eq("par_defaut", true).neq("id", t.id ?? "");
    if (error) throw erreur(error);
  }
  const ligne = { ...t, updated_at: new Date().toISOString() };
  const { error } = t.id
    ? await sb.from("admin_typologies_clients").update(ligne).eq("id", t.id)
    : await sb.from("admin_typologies_clients").insert(ligne);
  if (error) throw erreur(error);
}

export async function supprimerTypologie(id: string): Promise<void> {
  if (demo) {
    if (demoAffectations.some((a) => a.typologie_id === id)) throw new Error("Des clients sont encore affectés à cette typologie.");
    demoTypologies = demoTypologies.filter((x) => x.id !== id);
    return;
  }
  const { error } = await sb.from("admin_typologies_clients").delete().eq("id", id);
  if (error) {
    throw /foreign key|violates/i.test(error.message) ? new Error("Des clients sont encore affectés à cette typologie : réaffectez-les d'abord.") : erreur(error);
  }
}

// ── Affectations ─────────────────────────────────────────────────────────────
export async function listerAffectations(): Promise<Affectation[]> {
  if (demo) return demoAffectations.map((a) => ({ ...a, alias: [...a.alias] }));
  const { data, error } = await sb.from("admin_clients_typologie").select("qonto_client_id, nom_qonto, typologie_id, alias");
  if (error) throw erreur(error);
  return (data ?? []) as Affectation[];
}

export async function affecter(a: Affectation, par: string): Promise<void> {
  const propre = { ...a, alias: [...new Set(a.alias.map((x) => x.trim()).filter(Boolean))] };
  if (demo) {
    demoAffectations = [...demoAffectations.filter((x) => x.qonto_client_id !== a.qonto_client_id), propre];
    return;
  }
  const { error } = await sb
    .from("admin_clients_typologie")
    .upsert({ ...propre, updated_at: new Date().toISOString(), updated_by: par }, { onConflict: "qonto_client_id" });
  if (error) throw erreur(error);
}

export async function desaffecter(qontoClientId: string): Promise<void> {
  if (demo) {
    demoAffectations = demoAffectations.filter((x) => x.qonto_client_id !== qontoClientId);
    return;
  }
  const { error } = await sb.from("admin_clients_typologie").delete().eq("qonto_client_id", qontoClientId);
  if (error) throw erreur(error);
}

// ── Clients Qonto ────────────────────────────────────────────────────────────
export async function clientsQonto(): Promise<ClientQonto[]> {
  if (demo) return DEMO_CLIENTS;
  const { data, error } = await sb.functions.invoke("qonto", { body: { action: "apercu_clients" } });
  if (error) {
    let detail = "";
    try {
      detail = (await (error as { context?: Response }).context?.json())?.error ?? "";
    } catch {
      /* corps illisible */
    }
    throw new Error(`Clients Qonto indisponibles : ${detail || error.message}`);
  }
  const clients = ((data as { clients?: { id: string; name: string }[] })?.clients ?? []).map((c) => ({ id: c.id, name: c.name || "(sans nom)" }));
  return clients.sort((a, b) => a.name.localeCompare(b.name, "fr"));
}
