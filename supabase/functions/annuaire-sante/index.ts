// Edge Function : recherche de professionnels de santé dans l'Annuaire Santé
// (base officielle ANS/RPPS, API FHIR). La clé API reste côté serveur
// (secret ANNUAIRE_SANTE_API_KEY) — réservé aux comptes @avisdoc.fr.
//
// Clé gratuite : portail API e-santé (gateway.api.esante.gouv.fr) →
// souscrire à « Annuaire Santé en libre accès ».
//
// Déploiement :
//   supabase functions deploy annuaire-sante
//   supabase secrets set ANNUAIRE_SANTE_API_KEY=xxxxxxxx
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } });

// v2 = version courante de l'API FHIR Annuaire Santé (libre accès).
const BASE = (Deno.env.get("ANNUAIRE_SANTE_BASE") ?? "https://gateway.api.esante.gouv.fr/fhir/v2").replace(/\/$/, "");
const KEY = (Deno.env.get("ANNUAIRE_SANTE_API_KEY") ?? "").trim();

// Fiche compacte extraite d'une ressource FHIR Practitioner.
function mapPractitioner(p: Record<string, any>) {
  const nom0 = Array.isArray(p.name) ? p.name[0] ?? {} : {};
  const prenom = Array.isArray(nom0.given) ? nom0.given.filter(Boolean).join(" ") : "";
  const prefixe = Array.isArray(nom0.prefix) ? nom0.prefix[0] ?? "" : "";
  const rpps = (Array.isArray(p.identifier) ? p.identifier : [])
    .map((i: any) => String(i?.value ?? ""))
    .find((v: string) => /^\d{9,11}$/.test(v)) ?? null;
  // Profession / qualification : premier libellé disponible.
  const profession = (Array.isArray(p.qualification) ? p.qualification : [])
    .flatMap((q: any) => q?.code?.coding ?? [])
    .map((c: any) => c?.display)
    .find(Boolean) ?? "";
  const adr = Array.isArray(p.address) ? p.address[0] ?? {} : {};
  return {
    id: p.id ?? rpps ?? crypto.randomUUID(),
    nom: [prefixe, prenom, nom0.family].filter(Boolean).join(" ").trim() || "—",
    prenom,
    famille: nom0.family ?? "",
    rpps,
    profession,
    adresse: Array.isArray(adr.line) ? adr.line.filter(Boolean).join(", ") : "",
    code_postal: adr.postalCode ?? "",
    ville: adr.city ?? "",
  };
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });

  try {
    // Réservé aux admins @avisdoc.fr (comme pappers-search).
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
      { global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } } },
    );
    const { data: userData } = await supabase.auth.getUser();
    const email = userData.user?.email ?? "";
    if (!email.toLowerCase().endsWith("@avisdoc.fr"))
      return json({ error: "Accès réservé aux comptes @avisdoc.fr." }, 403);

    if (!KEY) return json({ error: "ANNUAIRE_SANTE_API_KEY non configurée." }, 500);

    const { query, practitioner_id } = await req.json().catch(() => ({}));

    // Détail d'un professionnel : exercices (PractitionerRole) + structures
    // (Organization incluses) → spécialités, mode d'exercice, adresses, telecom.
    if (practitioner_id) {
      const url = new URL(`${BASE}/PractitionerRole`);
      url.searchParams.set("practitioner", String(practitioner_id));
      url.searchParams.set("_include", "PractitionerRole:organization");
      url.searchParams.set("_count", "20");
      const res = await fetch(url.toString(), {
        headers: { "ESANTE-API-KEY": KEY, Accept: "application/fhir+json" },
      });
      if (!res.ok) {
        const corps = await res.text();
        return json({ error: `Annuaire Santé a répondu ${res.status}.`, details: corps.slice(0, 300) }, 502);
      }
      const bundle = await res.json();
      const ressources = (Array.isArray(bundle?.entry) ? bundle.entry : []).map((e: any) => e?.resource);

      const orgs = new Map<string, any>();
      for (const r of ressources)
        if (r?.resourceType === "Organization" && r.id) orgs.set(String(r.id), r);

      const affichages = (arr: any[]): string[] =>
        (Array.isArray(arr) ? arr : [])
          .flatMap((x: any) => x?.coding ?? [])
          .map((c: any) => c?.display)
          .filter(Boolean);

      const specialites = new Set<string>();
      const structures: any[] = [];
      for (const r of ressources) {
        if (r?.resourceType !== "PractitionerRole") continue;
        for (const s of affichages(r.specialty)) specialites.add(s);
        for (const s of affichages(r.code)) specialites.add(s);
        const refOrg = String(r.organization?.reference ?? "").split("/").pop();
        const org = refOrg ? orgs.get(refOrg) : undefined;
        // Telecom : d'abord l'exercice, puis la structure.
        const tels = [...(r.telecom ?? []), ...(org?.telecom ?? [])];
        const telephone = tels.find((t: any) => t?.system === "phone")?.value ?? "";
        const email = tels.find((t: any) => t?.system === "email")?.value ?? "";
        const adr = Array.isArray(org?.address) ? org.address[0] ?? {} : {};
        if (org || telephone || email) {
          structures.push({
            nom: org?.name ?? "",
            adresse: Array.isArray(adr.line) ? adr.line.filter(Boolean).join(", ") : "",
            code_postal: adr.postalCode ?? "",
            ville: adr.city ?? "",
            telephone,
            email,
          });
        }
      }
      return json({ specialites: [...specialites], structures });
    }

    const q = String(query ?? "").trim();
    if (!q) return json({ error: "Requête vide." }, 400);

    // N° RPPS (9-11 chiffres) → recherche par identifiant ; sinon par nom
    // (« nom » ou « prénom nom » : le dernier mot = nom de famille).
    const digits = q.replace(/\D/g, "");
    const url = new URL(`${BASE}/Practitioner`);
    if (digits.length >= 9 && digits.length <= 11 && /^[\d\s]+$/.test(q)) {
      url.searchParams.set("identifier", digits);
    } else {
      const mots = q.split(/\s+/).filter(Boolean);
      const famille = mots[mots.length - 1];
      url.searchParams.set("family", famille);
      if (mots.length > 1) url.searchParams.set("given", mots.slice(0, -1).join(" "));
    }
    url.searchParams.set("_count", "15");

    const res = await fetch(url.toString(), {
      headers: { "ESANTE-API-KEY": KEY, Accept: "application/fhir+json" },
    });
    if (!res.ok) {
      const corps = await res.text();
      return json({ error: `Annuaire Santé a répondu ${res.status}.`, details: corps.slice(0, 300) }, 502);
    }
    const bundle = await res.json();
    const resultats = (Array.isArray(bundle?.entry) ? bundle.entry : [])
      .map((e: any) => e?.resource)
      .filter((r: any) => r?.resourceType === "Practitioner")
      .map(mapPractitioner);

    // Enrichissement de la liste : spécialité + ville d'exercice, via UN appel
    // groupé PractitionerRole (tous les ids) avec les structures incluses.
    if (resultats.length > 0) {
      try {
        const ids = resultats.map((r: any) => r.id).join(",");
        const uRoles = new URL(`${BASE}/PractitionerRole`);
        uRoles.searchParams.set("practitioner", ids);
        uRoles.searchParams.set("_include", "PractitionerRole:organization");
        uRoles.searchParams.set("_count", "100");
        const rRoles = await fetch(uRoles.toString(), {
          headers: { "ESANTE-API-KEY": KEY, Accept: "application/fhir+json" },
        });
        if (rRoles.ok) {
          const bRoles = await rRoles.json();
          const ress = (Array.isArray(bRoles?.entry) ? bRoles.entry : []).map((e: any) => e?.resource);
          const orgs = new Map<string, any>();
          for (const r of ress)
            if (r?.resourceType === "Organization" && r.id) orgs.set(String(r.id), r);
          const parPraticien = new Map<string, { specialite?: string; ville?: string }>();
          for (const r of ress) {
            if (r?.resourceType !== "PractitionerRole") continue;
            const pid = String(r.practitioner?.reference ?? "").split("/").pop();
            if (!pid) continue;
            const e = parPraticien.get(pid) ?? {};
            if (!e.specialite) {
              e.specialite = [...(r.specialty ?? []), ...(r.code ?? [])]
                .flatMap((x: any) => x?.coding ?? [])
                .map((c: any) => c?.display)
                .find(Boolean);
            }
            if (!e.ville) {
              const refOrg = String(r.organization?.reference ?? "").split("/").pop();
              const adr = refOrg ? (orgs.get(refOrg)?.address?.[0] ?? {}) : {};
              e.ville = adr.city ?? undefined;
            }
            parPraticien.set(pid, e);
          }
          for (const r of resultats) {
            const e = parPraticien.get(String(r.id));
            if (e?.specialite) (r as any).specialite = e.specialite;
            if (!r.ville && e?.ville) r.ville = e.ville;
          }
        }
      } catch { /* enrichissement best-effort — la liste reste utilisable */ }
    }

    return json({ resultats, total: bundle?.total ?? resultats.length });
  } catch (e) {
    console.error(e);
    return json({ error: "Erreur interne." }, 500);
  }
});
