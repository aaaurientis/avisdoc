// Journées de dépistage — lecture des extractions CSV déposées dans un bucket AWS S3.
//
// Les clés AWS restent ici, côté serveur : le Hub ne voit jamais que la liste des
// fichiers et leur contenu. Lecture seule : rien n'est écrit ni supprimé dans le bucket.
//
// Garde-fous : compte @avisdoc.fr, et droit « journee » (ou super-admin).
//
// Actions :
//   "lister"            → les fichiers .csv du bucket (sous le préfixe configuré)
//   "lire" { keys[] }   → le contenu texte de ces fichiers (50 au plus par appel)
//
// Secrets (Supabase → Edge Functions → Secrets) :
//   AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY   clé d'un utilisateur IAM en lecture seule
//   AWS_REGION                                  ex. eu-west-3 (Paris) — défaut eu-west-3
//   JOURNEES_S3_BUCKET                          nom du bucket
//   JOURNEES_S3_PREFIX                          dossier dans le bucket (facultatif), ex. extractions/

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.99.3";
import { AwsClient } from "https://esm.sh/aws4fetch@1.0.20";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

const MODULE = "journee";
const MAX_FICHIERS_PAR_LECTURE = 50;

const env = (k: string) => (Deno.env.get(k) ?? "").trim();
const REGION = env("AWS_REGION") || "eu-west-3";
const BUCKET = env("JOURNEES_S3_BUCKET");
const PREFIXE = env("JOURNEES_S3_PREFIX").replace(/^\/+/, "");

/** Un bucket dont le nom contient un point casse le certificat en style « hôte » : on passe en style « chemin ». */
const BASE = BUCKET.includes(".")
  ? `https://s3.${REGION}.amazonaws.com/${BUCKET}`
  : `https://${BUCKET}.s3.${REGION}.amazonaws.com`;

const admin = () => createClient(env("SUPABASE_URL"), env("SUPABASE_SERVICE_ROLE_KEY"));

async function peutJournee(email: string): Promise<boolean> {
  const sb = admin();
  const { data: sa } = await sb.from("admin_superadmins").select("email").ilike("email", email).maybeSingle();
  if (sa) return true;
  const { data: droits } = await sb.from("admin_droits").select("modules").ilike("email", email).maybeSingle();
  return Array.isArray(droits?.modules) && droits.modules.includes(MODULE);
}

const aws = () =>
  new AwsClient({
    accessKeyId: env("AWS_ACCESS_KEY_ID"),
    secretAccessKey: env("AWS_SECRET_ACCESS_KEY"),
    region: REGION,
    service: "s3",
  });

const xmlTexte = (s: string) =>
  s.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, "&");
const balise = (bloc: string, nom: string) => {
  const m = bloc.match(new RegExp(`<${nom}>([\\s\\S]*?)</${nom}>`));
  return m ? xmlTexte(m[1]) : "";
};

interface Fichier {
  key: string;
  taille: number;
  modifie: string;
}

/** ListObjectsV2, page par page (1 000 objets par page). */
async function lister(): Promise<Fichier[]> {
  const client = aws();
  const fichiers: Fichier[] = [];
  let jeton = "";
  for (let page = 0; page < 50; page++) {
    const p = new URLSearchParams({ "list-type": "2", "max-keys": "1000" });
    if (PREFIXE) p.set("prefix", PREFIXE);
    if (jeton) p.set("continuation-token", jeton);
    const res = await client.fetch(`${BASE}/?${p}`);
    const xml = await res.text();
    if (!res.ok) throw new Error(`S3 ${res.status} : ${balise(xml, "Code") || xml.slice(0, 200)}`);
    for (const m of xml.matchAll(/<Contents>([\s\S]*?)<\/Contents>/g)) {
      const key = balise(m[1], "Key");
      if (!/\.csv$/i.test(key)) continue;
      fichiers.push({ key, taille: Number(balise(m[1], "Size")) || 0, modifie: balise(m[1], "LastModified") });
    }
    if (balise(xml, "IsTruncated") !== "true") break;
    jeton = balise(xml, "NextContinuationToken");
    if (!jeton) break;
  }
  return fichiers;
}

/** Les exports Excel sont souvent en Windows-1252 : on tente l'UTF-8 strict, sinon on bascule. */
function decoder(octets: Uint8Array): string {
  let texte: string;
  try {
    texte = new TextDecoder("utf-8", { fatal: true }).decode(octets);
  } catch {
    texte = new TextDecoder("windows-1252").decode(octets);
  }
  return texte.replace(/^\uFEFF/, "");
}

const cleSure = (key: unknown): key is string =>
  typeof key === "string" &&
  key.startsWith(PREFIXE) &&
  /\.csv$/i.test(key) &&
  !key.split("/").includes("..");

async function lire(key: string): Promise<string> {
  const chemin = key.split("/").map(encodeURIComponent).join("/");
  const res = await aws().fetch(`${BASE}/${chemin}`);
  if (!res.ok) throw new Error(`S3 ${res.status} sur ${key}`);
  return decoder(new Uint8Array(await res.arrayBuffer()));
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });

  try {
    const asUser = createClient(env("SUPABASE_URL"), env("SUPABASE_ANON_KEY"), {
      global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } },
    });
    const { data: u } = await asUser.auth.getUser();
    const email = u.user?.email ?? "";
    if (!email.toLowerCase().endsWith("@avisdoc.fr")) return json({ error: "Accès réservé aux comptes @avisdoc.fr." }, 403);
    if (!(await peutJournee(email))) return json({ error: "Le droit « Journée » n'est pas ouvert à ce compte." }, 403);

    const manquants = ["AWS_ACCESS_KEY_ID", "AWS_SECRET_ACCESS_KEY", "JOURNEES_S3_BUCKET"].filter((k) => !env(k));
    if (manquants.length) {
      return json({ error: `Bucket S3 non configuré : secret(s) manquant(s) ${manquants.join(", ")}.`, nonConfigure: true }, 500);
    }

    const body = await req.json().catch(() => ({}));

    if (body.action === "lister") {
      return json({ bucket: BUCKET, prefixe: PREFIXE, fichiers: await lister() });
    }

    if (body.action === "lire") {
      const keys: unknown[] = Array.isArray(body.keys) ? body.keys : [];
      if (keys.length === 0) return json({ fichiers: [] });
      if (keys.length > MAX_FICHIERS_PAR_LECTURE) return json({ error: `${MAX_FICHIERS_PAR_LECTURE} fichiers au plus par appel.` }, 400);
      if (!keys.every(cleSure)) return json({ error: "Fichier refusé : hors du dossier des extractions." }, 400);
      const fichiers = await Promise.all(
        (keys as string[]).map(async (key) => {
          try {
            return { key, contenu: await lire(key) };
          } catch (e) {
            return { key, erreur: e instanceof Error ? e.message : String(e) };
          }
        }),
      );
      return json({ fichiers });
    }

    return json({ error: "Action inconnue." }, 400);
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});
