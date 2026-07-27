// Edge Function : connexion Pro Santé Connect (OIDC) pour pro.avisdoc.fr.
//
// Tout le flux OAuth est côté serveur — le client_secret PSC n'atteint jamais
// le navigateur. La session renvoyée à l'app est un jeton signé HMAC (12 h).
//
//   GET  ?action=login              → 302 vers l'autorisation PSC (e-CPS)
//   GET  ?action=callback&code=…    → échange code → userinfo → redirige
//                                     vers PRO_APP_URL#jeton=…
//   POST { action:"verifier", jeton } → { ok, identite } si signature + exp valides
//
// Secrets :
//   PSC_CLIENT_ID / PSC_CLIENT_SECRET  fournis par l'ANS (bac à sable ou prod)
//   PSC_BASE       défaut bac à sable : realm esante-wallet de auth.bas.psc.esante.gouv.fr
//                  prod : https://auth.esante.gouv.fr/auth/realms/esante-wallet
//   PRO_APP_URL    défaut https://pro.avisdoc.fr
//   PSC_SESSION_SECRET  clé de signature des sessions (défaut : client_secret)
//
// Déploiement : supabase functions deploy psc-auth  (verify_jwt=false)
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } });

const CLIENT_ID = (Deno.env.get("PSC_CLIENT_ID") ?? "").trim();
const CLIENT_SECRET = (Deno.env.get("PSC_CLIENT_SECRET") ?? "").trim();
const BASE = (Deno.env.get("PSC_BASE") ??
  "https://auth.bas.psc.esante.gouv.fr/auth/realms/esante-wallet").replace(/\/$/, "");
const APP = (Deno.env.get("PRO_APP_URL") ?? "https://pro.avisdoc.fr").replace(/\/$/, "");
const SCOPES = Deno.env.get("PSC_SCOPES") ?? "openid scope_all";
const SIGNE = (Deno.env.get("PSC_SESSION_SECRET") ?? CLIENT_SECRET) || "avisdoc-dev";
const DUREE_H = 12;

// --- Signature HMAC-SHA256 (state OAuth + jeton de session) -----------------
const enc = new TextEncoder();
const b64u = (b: ArrayBuffer | Uint8Array) =>
  btoa(String.fromCharCode(...new Uint8Array(b instanceof ArrayBuffer ? b : b.buffer as ArrayBuffer)))
    .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const b64uVersTexte = (s: string) =>
  atob(s.replace(/-/g, "+").replace(/_/g, "/"));

async function cle(): Promise<CryptoKey> {
  return crypto.subtle.importKey("raw", enc.encode(SIGNE), { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]);
}
async function signer(payload: unknown): Promise<string> {
  const corps = b64u(enc.encode(JSON.stringify(payload)));
  const sig = b64u(await crypto.subtle.sign("HMAC", await cle(), enc.encode(corps)));
  return `${corps}.${sig}`;
}
async function verifier(jeton: string): Promise<Record<string, unknown> | null> {
  const [corps, sig] = String(jeton ?? "").split(".");
  if (!corps || !sig) return null;
  const attendu = b64u(await crypto.subtle.sign("HMAC", await cle(), enc.encode(corps)));
  if (attendu !== sig) return null;
  try {
    const p = JSON.parse(b64uVersTexte(corps));
    if (typeof p?.exp !== "number" || p.exp < Date.now() / 1000) return null;
    return p;
  } catch { return null; }
}

const versApp = (fragment: string) =>
  new Response(null, { status: 302, headers: { Location: `${APP}/#${fragment}` } });

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });

  const url = new URL(req.url);
  const moi = `${url.origin}${url.pathname}`; // URL publique de cette fonction
  const action = url.searchParams.get("action");

  // 1) Départ : redirection vers l'autorisation PSC (appli e-CPS).
  if (req.method === "GET" && action === "login") {
    if (!CLIENT_ID || !CLIENT_SECRET)
      return versApp(`erreur=${encodeURIComponent("PSC_CLIENT_ID / PSC_CLIENT_SECRET non configurés.")}`);
    // state signé (anti-CSRF, TTL 10 min) — aucun stockage serveur nécessaire.
    const state = await signer({ n: crypto.randomUUID(), exp: Date.now() / 1000 + 600 });
    const aut = new URL(`${BASE}/protocol/openid-connect/auth`);
    aut.searchParams.set("response_type", "code");
    aut.searchParams.set("client_id", CLIENT_ID);
    aut.searchParams.set("redirect_uri", `${moi}?action=callback`);
    aut.searchParams.set("scope", SCOPES);
    aut.searchParams.set("state", state);
    aut.searchParams.set("nonce", crypto.randomUUID());
    aut.searchParams.set("acr_values", "eidas1");
    return new Response(null, { status: 302, headers: { Location: aut.toString() } });
  }

  // 2) Retour PSC : échange du code, lecture de l'identité, session signée.
  if (req.method === "GET" && action === "callback") {
    const erreurPsc = url.searchParams.get("error_description") ?? url.searchParams.get("error");
    if (erreurPsc) return versApp(`erreur=${encodeURIComponent(erreurPsc)}`);

    const code = url.searchParams.get("code");
    const state = url.searchParams.get("state");
    if (!code || !state || !(await verifier(state)))
      return versApp(`erreur=${encodeURIComponent("Retour Pro Santé Connect invalide (state).")}`);

    const rTok = await fetch(`${BASE}/protocol/openid-connect/token`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code,
        redirect_uri: `${moi}?action=callback`,
        client_id: CLIENT_ID,
        client_secret: CLIENT_SECRET,
      }),
    });
    if (!rTok.ok) {
      const t = await rTok.text();
      return versApp(`erreur=${encodeURIComponent(`Échange de code refusé (${rTok.status}) ${t.slice(0, 120)}`)}`);
    }
    const tok = await rTok.json();

    const rInfo = await fetch(`${BASE}/protocol/openid-connect/userinfo`, {
      headers: { Authorization: `Bearer ${tok.access_token}` },
    });
    if (!rInfo.ok) return versApp(`erreur=${encodeURIComponent(`Lecture de l'identité refusée (${rInfo.status}).`)}`);
    const info = await rInfo.json();

    // Identité PSC : prénom / nom + identifiant national (RPPS préfixé).
    const identite = {
      sub: info.sub ?? null,
      prenom: info.given_name ?? "",
      nom: info.family_name ?? info.name ?? "",
      idnat: info.preferred_username ?? info.SubjectNameID ?? null,
    };
    const jeton = await signer({ ...identite, exp: Date.now() / 1000 + DUREE_H * 3600 });
    return versApp(`jeton=${encodeURIComponent(jeton)}`);
  }

  // 3) Vérification d'une session par l'app.
  if (req.method === "POST") {
    const { action: a, jeton } = await req.json().catch(() => ({}));
    if (a === "verifier") {
      const p = await verifier(String(jeton ?? ""));
      if (!p) return json({ ok: false });
      return json({ ok: true, identite: { prenom: p.prenom, nom: p.nom, idnat: p.idnat } });
    }
  }

  return json({ error: "action inconnue" }, 400);
});
