// Confier à un commercial une entreprise repérée par Scope : la fiche prospect est créée (ou
// retrouvée) dans Prospection, le commercial choisi devient son « Suivi par », et il reçoit un
// mail avec le lien de la fiche. Un seul mail par fiche et par commercial, même si l'on reclique.
//
// Appelé avec le jeton de la personne : ses droits s'appliquent (lecture de l'article, création
// de la fiche). Le destinataire doit être un membre d'AvisDoc.

import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.99.3";
import { Erreur } from "./vigile.ts";
import { envoyerA, lienHub } from "./mail.ts";

/* eslint-disable @typescript-eslint/no-explicit-any */

const echapper = (t: string) => t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const echappeLike = (t: string) => t.replace(/[\\%_]/g, (c) => `\\${c}`);
/** Le droit de chaque CRM, par son marché (migration 0085). */
const CRM_DROIT: Record<string, string> = { demarcher: "commercial", collectivites: "crm_collectivites", mutuelles: "crm_mutuelles", intermediaires: "crm_intermediaires" };
const nomLisible = (email: string) =>
  email.split("@")[0].split(/[._-]+/).filter(Boolean).map((m) => m[0].toUpperCase() + m.slice(1)).join(" ");

export async function confier(jeton: string, entree: { articleId?: unknown; referent?: unknown }) {
  const articleId = typeof entree.articleId === "string" ? entree.articleId : "";
  const referent = typeof entree.referent === "string" ? entree.referent.trim().toLowerCase() : "";
  if (!articleId || !referent) throw new Erreur("Article ou commercial manquant.", 400);

  const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: `Bearer ${jeton}` } },
    auth: { persistSession: false },
  }) as SupabaseClient<any, "public", any>;
  const { data: u } = await db.auth.getUser(jeton);
  const par = u?.user?.email?.toLowerCase() ?? "";
  if (!par.endsWith("@avisdoc.fr")) throw new Erreur("non autorisé", 401);
  const { data: droit } = await db.rpc("voit_la_veille");
  if (!droit) throw new Erreur("Le module Veille n'est pas ouvert pour ce compte.", 403);

  const { data: a } = await db.from("admin_veille_articles").select("id, entreprise, ville, url, titre, titre_fr, resume, pour_avisdoc, rubrique").eq("id", articleId).eq("verdict", "retenu").is("retire_le", null).maybeSingle();
  if (!a) throw new Erreur("Publication introuvable.", 404);
  // La fiche va dans le CRM de la veille où l'entreprise a été repérée (Olivier, 09/11) ; sinon, CRM Entreprise.
  const { data: rub } = await db.from("admin_veille_rubriques").select("axe").eq("nom", a.rubrique ?? "").maybeSingle();
  const crm = CRM_DROIT[rub?.axe ?? ""] ? String(rub!.axe) : "demarcher";
  const droitDuCrm = CRM_DROIT[crm];
  // Confier crée ou réattribue une fiche de Prospection : il faut soi-même avoir ce CRM (ou l'ancien droit « merx »).
  const [{ data: aLeCrm }, { data: merx }] = await Promise.all([
    db.rpc("a_le_module", { m: droitDuCrm }),
    db.rpc("a_le_module", { m: "merx" }),
  ]);
  if (!aLeCrm && !(merx && crm === "demarcher")) throw new Erreur("Il faut avoir accès à ce CRM pour lui confier une entreprise.", 403);

  // Le commercial doit être un membre d'AvisDoc, et pouvoir ouvrir la Prospection (module merx) : sinon le lien du mail ne s'ouvrirait pas.
  const { data: membres } = await db.from("admin_membres").select("email");
  if (!(membres ?? []).some((m: any) => String(m.email).toLowerCase() === referent)) throw new Erreur("Ce commercial n'est pas un membre d'AvisDoc.", 400);
  const service = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
  const [{ data: sa }, { data: dr }] = await Promise.all([
    service.from("admin_superadmins").select("email").ilike("email", referent).maybeSingle(),
    service.from("admin_droits").select("modules").ilike("email", referent).maybeSingle(),
  ]);
  if (!sa && !((dr?.modules ?? []) as string[]).some((m) => m === droitDuCrm || (m === "merx" && crm === "demarcher"))) {
    throw new Erreur(`${nomLisible(referent)} n'a pas accès à ce CRM : cochez-le pour lui dans Admin › Droits d'accès d'abord.`, 400);
  }
  const nom = String(a.entreprise ?? "").trim();
  if (!nom) throw new Erreur("Cette publication ne nomme pas d'entreprise.", 400);

  // La fiche : retrouvée par son nom (hors corbeille), et par sa ville quand on la connaît, sinon créée.
  // Deux entreprises du même nom dans deux villes différentes restent deux fiches.
  const { data: memesNoms } = await db.from("admin_prospects").select("id, sources, city, crm").ilike("name", echappeLike(nom)).is("deleted_at", null).limit(20);
  const ville = String(a.ville ?? "").trim().toLowerCase();
  const existe = (memesNoms ?? []).find((p: any) => !ville || !p.city || String(p.city).trim().toLowerCase() === ville);
  let prospectId: string;
  let existait = false;
  // Une entreprise a une seule fiche, dans un seul CRM : on ne la réattribue pas depuis la veille d'un autre CRM.
  if (existe && (existe.crm ?? "demarcher") !== crm) {
    throw new Erreur("Cette entreprise a déjà sa fiche dans un autre CRM : elle n'a pas été confiée.", 409);
  }
  if (existe) {
    existait = true;
    prospectId = existe.id;
    const sources = [...new Set([...(existe.sources ?? []), a.url])];
    const { error } = await db.from("admin_prospects").update({ sources, referent }).eq("id", prospectId);
    if (error) throw new Erreur(error.message, 500);
  } else {
    const pourquoi = [a.pour_avisdoc, a.resume ? `Repéré par Scope : ${a.resume}` : null].filter(Boolean).join("\n\n");
    const { data, error } = await db.from("admin_prospects")
      .insert({ owner_email: par, name: nom, city: a.ville || null, rationale: pourquoi || null, sources: [a.url], status: "a_verifier", origine: "vigile", referent, crm })
      .select("id").single();
    if (error) {
      throw new Erreur(/duplicate key|unique/i.test(error.message) ? "Une fiche à ce nom existe déjà, peut-être dans la corbeille de Prospection." : error.message, 409);
    }
    prospectId = data.id;
  }

  // Un seul mail par fiche et par commercial : la ligne se pose avant l'envoi, et un second clic la trouve déjà là.
  // Une ligne restée sans mail plus de 10 minutes (envoi coupé en route) ne bloque pas : on réessaie.
  const { data: pris, error: errPris } = await service.from("admin_veille_confies")
    .upsert({ article_id: a.id, prospect_id: prospectId, referent, par }, { onConflict: "prospect_id,referent", ignoreDuplicates: true })
    .select("id");
  if (errPris) throw new Erreur(errPris.message, 500);
  if (!pris?.length) {
    const { data: ligne } = await service.from("admin_veille_confies").select("mail_id, created_at").eq("prospect_id", prospectId).eq("referent", referent).maybeSingle();
    const coince = ligne && !ligne.mail_id && Date.now() - new Date(ligne.created_at).getTime() > 10 * 60_000;
    if (!coince) return { prospectId, existait, mail: "deja" as const };
    await service.from("admin_veille_confies").update({ created_at: new Date().toISOString(), par }).eq("prospect_id", prospectId).eq("referent", referent);
  }

  const lien = lienHub(`/prospects?crm=${crm}&fiche=${prospectId}`);
  const sujet = `${nomLisible(par)} vous confie ${nom}, repérée par Scope`;
  const html = `<div style="font-family:Arial,Helvetica,sans-serif;color:#16283C;max-width:540px;">
    <p style="font-size:16px;font-weight:bold;margin:0 0 8px;">${echapper(sujet)}</p>
    <p style="font-size:14px;margin:0 0 4px;"><b>${echapper(nom)}</b>${a.ville ? ` · ${echapper(a.ville)}` : ""}</p>
    <p style="font-size:14px;margin:0 0 8px;"><a href="${echapper(a.url)}" style="color:#29B1E0;">${echapper(a.titre_fr || a.titre)}</a></p>
    ${a.resume ? `<p style="font-size:13px;margin:0 0 6px;line-height:1.5;">${echapper(a.resume)}</p>` : ""}
    ${a.pour_avisdoc ? `<p style="font-size:13px;margin:0 0 12px;line-height:1.5;color:#5B6B7A;"><b>Pour AvisDoc :</b> ${echapper(a.pour_avisdoc)}</p>` : ""}
    <p style="margin:0;"><a href="${lien}" style="color:#29B1E0;font-weight:bold;">Ouvrir la fiche dans Prospection</a></p></div>`;
  try {
    const mailId = await envoyerA([referent], sujet, html, `veille-confier-${prospectId}-${referent}`);
    await service.from("admin_veille_confies").update({ mail_id: mailId }).eq("prospect_id", prospectId).eq("referent", referent);
    return { prospectId, existait, mail: "envoye" as const };
  } catch (e) {
    // Pas parti : on retire la ligne pour qu'un nouveau clic réessaie (à défaut, elle expire seule au bout de 10 minutes).
    await service.from("admin_veille_confies").delete().eq("prospect_id", prospectId).eq("referent", referent).then(() => {}, () => {});
    throw new Erreur(`Fiche confiée, mais le mail n'est pas parti : ${e instanceof Error ? e.message : String(e)}`, 502);
  }
}
