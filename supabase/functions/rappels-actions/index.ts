// Rappels des actions programmées sur les fiches — fonction planifiée (toutes les 5 min).
//
// Repris du hub Onetip (12/10) : un mail part au commercial qui a programmé l'action,
// 15 minutes avant (2 heures pour un rendez-vous sur place, pour le trajet). Une seule
// fois par action (`rappel_envoye_le`) ; déplacer l'action remet le rappel à zéro.
//
// Protégée par un secret tiré au hasard dans la base (migration 0069) : la tâche
// planifiée l'envoie, la fonction le compare. Il ne quitte jamais la base.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.99.3";

const URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY") ?? "";
const FROM = Deno.env.get("RDV_FROM") ?? "AvisDoc <noreply@avisdoc.fr>";
const HUB = "https://admin.avisdoc.fr/admin.html#";

const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { "Content-Type": "application/json" } });

const NOMS: Record<string, string> = {
  appel: "Appel",
  email: "Mail",
  rdv: "Rendez-vous",
  presentation: "Présentation",
  tache: "À faire",
  salon: "Salon",
  sms: "SMS",
  linkedin: "Message LinkedIn",
  devis: "Devis",
};

const echapper = (t: string) => t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const heure = (iso: string) => new Date(iso).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Paris" });

interface Action {
  id: string;
  kind: string;
  titre: string;
  detail: string | null;
  au: string;
  par: string;
  avec: string | null;
  rdv_mode: string | null;
  rdv_lien: string | null;
  prospect_id: string | null;
  client_id: string | null;
  account_id: string | null;
}

async function envoyer(a: Action, fiche: string) {
  const quoi = NOMS[a.kind] ?? a.kind;
  const lieu = a.kind === "rdv" && a.rdv_mode ? (a.rdv_mode === "visio" ? " en visio" : " sur place") : "";
  const sujet = `À ${heure(a.au)} : ${quoi}${lieu}${fiche ? ` — ${fiche}` : ""}${a.avec ? ` avec ${a.avec}` : ""}`;
  const lien = a.client_id ? `${HUB}/crm/${a.client_id}` : a.prospect_id ? `${HUB}/prospects` : a.account_id ? `${HUB}/fichier-client` : `${HUB}/planning`;
  // Le lien de la visio a été contrôlé à la saisie (http ou https, sans espace ni guillemet).
  const visio = a.rdv_lien && /^https?:\/\/[^\s"'<>]+$/i.test(a.rdv_lien) ? a.rdv_lien : null;
  const html = `
    <div style="font-family:Arial,Helvetica,sans-serif;color:#16283C;max-width:520px;">
      <p style="font-size:16px;font-weight:bold;margin:0 0 8px;">${echapper(sujet)}</p>
      ${a.titre && !a.titre.endsWith("prévu") ? `<p style="font-size:14px;margin:0 0 8px;">${echapper(a.titre)}</p>` : ""}
      ${a.detail ? `<p style="font-size:14px;margin:0 0 12px;white-space:pre-wrap;color:#4a5967;">${echapper(a.detail)}</p>` : ""}
      ${visio ? `<p style="margin:0 0 10px;"><a href="${echapper(visio)}" style="color:#29B1E0;font-weight:bold;">Rejoindre la visio</a></p>` : ""}
      <p style="margin:0;"><a href="${lien}" style="color:#29B1E0;">Ouvrir dans le Hub</a></p>
    </div>`;
  const r = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: FROM, to: a.par, subject: sujet, html }),
  });
  if (!r.ok) throw new Error(`Resend ${r.status}`);
}

Deno.serve(async (req) => {
  const admin = createClient(URL, SERVICE);
  const { data: secret } = await admin.from("admin_secrets_internes").select("valeur").eq("cle", "rappels_actions").maybeSingle();
  if (!secret?.valeur || req.headers.get("x-secret") !== secret.valeur) return json({ error: "non autorisé" }, 401);
  if (!RESEND_API_KEY) return json({ error: "RESEND_API_KEY non configurée" }, 500);

  const maintenant = Date.now();
  // Ce qui arrive dans les deux heures (et un peu plus), ou vient juste de passer.
  const { data, error } = await admin
    .from("admin_echanges")
    .select("id, kind, titre, detail, au, par, avec, rdv_mode, rdv_lien, prospect_id, client_id, account_id")
    .eq("prevu", true)
    .is("traite_le", null)
    .is("rappel_envoye_le", null)
    .gte("au", new Date(maintenant - 5 * 60_000).toISOString())
    .lte("au", new Date(maintenant + 125 * 60_000).toISOString());
  if (error) return json({ error: error.message }, 500);

  const actions = (data ?? []) as Action[];
  const dues = actions.filter((a) => {
    const avance = a.kind === "rdv" && a.rdv_mode === "sur_place" ? 120 : 15;
    return maintenant >= new Date(a.au).getTime() - avance * 60_000 && a.par.includes("@");
  });

  // Les noms des fiches concernées, en trois requêtes plutôt qu'une par action.
  const ids = (cle: "prospect_id" | "client_id" | "account_id") => [...new Set(dues.map((a) => a[cle]).filter((v): v is string => Boolean(v)))];
  const [prospects, affaires, clients] = await Promise.all([
    ids("prospect_id").length ? admin.from("admin_prospects").select("id, name").in("id", ids("prospect_id")) : { data: [] },
    ids("client_id").length ? admin.from("admin_clients").select("id, company").in("id", ids("client_id")) : { data: [] },
    ids("account_id").length ? admin.from("admin_accounts").select("id, name").in("id", ids("account_id")) : { data: [] },
  ]);
  const nom = new Map<string, string>();
  for (const p of (prospects.data ?? []) as { id: string; name: string }[]) nom.set(p.id, p.name);
  for (const c of (affaires.data ?? []) as { id: string; company: string }[]) nom.set(c.id, c.company);
  for (const a of (clients.data ?? []) as { id: string; name: string }[]) nom.set(a.id, a.name);

  let envoyes = 0;
  const echecs: string[] = [];
  for (const a of dues) {
    try {
      await envoyer(a, nom.get(a.client_id ?? a.prospect_id ?? a.account_id ?? "") ?? "");
      // Posé seulement si le mail est parti : un échec sera retenté au passage suivant.
      await admin.from("admin_echanges").update({ rappel_envoye_le: new Date().toISOString() }).eq("id", a.id);
      envoyes++;
    } catch (e) {
      echecs.push(`${a.id}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  return json({ ok: true, envoyes, echecs });
});
