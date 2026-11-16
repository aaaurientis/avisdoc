// Connecteur MCP du Hub — réseau d'aval, volet Doctolib (décision du 16/11).
//
// Protocole MCP « Streamable HTTP » sans état : POST JSON-RPC, réponses JSON
// (initialize, ping, tools/list, tools/call ; les notifications reçoivent 202).
// Accès par clé, sans OAuth : « Authorization: Bearer avd_… » (ou « ?cle=avd_… » pour un
// client qui ne sait pas envoyer d'en-tête). Clés créées et révoquées dans Admin ; seule
// leur empreinte est stockée (table admin_mcp_cles).
//
// Outils :
//   • point_collecte_doctolib       — liens, à collecter (jamais relevés, > 180 jours), à valider
//   • fiches_doctolib_a_collecter   — la liste à relever, avec le lien de chaque fiche
//   • importer_resultats_doctolib   — mêmes contrôles et même enregistrement que l'import CSV
//
// verify_jwt = false (la clé est vérifiée ici). Déploiement : supabase functions deploy reseau-mcp

/* eslint-disable @typescript-eslint/no-explicit-any */
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { clientService } from "../_shared/acces-sante.ts";
import { empreinteCle } from "../_shared/mcp-cle.ts";
import { analyserImport, versCsv } from "../_shared/doctolib-import.ts";
import { importerResultatsDoctolib } from "../_shared/doctolib-import-serveur.ts";
import { estDepartement, POPULATION_LIBELLE } from "../_shared/reseau-rpps.ts";

const VERSIONS = ["2025-06-18", "2025-03-26", "2024-11-05"];
const JOURS_COLLECTE = 180;

const entetes = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type, mcp-session-id, mcp-protocol-version, accept",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const reponse = (corps: unknown, statut = 200, extra: Record<string, string> = {}) =>
  new Response(corps === null ? null : JSON.stringify(corps), { status: statut, headers: { ...entetes, "Content-Type": "application/json", ...extra } });

// ── Outils ───────────────────────────────────────────────────────────────────

const OUTILS = [
  {
    name: "point_collecte_doctolib",
    description: "Point sur la collecte Doctolib du réseau d'aval : nombre de liens, fiches à collecter (jamais relevées ou relevées il y a plus de 180 jours), liens à valider. Option : un département.",
    inputSchema: { type: "object", properties: { departement: { type: "string", description: "Code du département (ex. « 63 », « 2A »). Tous si absent." } }, additionalProperties: false },
  },
  {
    name: "fiches_doctolib_a_collecter",
    description: "Liste des praticiens dont la fiche Doctolib est à relever (jamais relevée ou relevée il y a plus de 180 jours), avec le lien de la fiche. Les plus anciennes d'abord.",
    inputSchema: {
      type: "object",
      properties: {
        departement: { type: "string", description: "Code du département. Tous si absent." },
        limite: { type: "integer", minimum: 1, maximum: 500, description: "Nombre maximum de fiches (50 par défaut)." },
        inclure_recentes: { type: "boolean", description: "Inclure aussi les fiches relevées depuis moins de 180 jours." },
      },
      additionalProperties: false,
    },
  },
  {
    name: "importer_resultats_doctolib",
    description: "Enregistre les résultats relevés sur les fiches Doctolib. Chaque ligne : rpps, url_doctolib (la fiche relevée, obligatoire) et releve_le (date du relevé, obligatoire) ; reservable (oui/non), nouveaux_patients (oui/non), premier_creneau (AAAA-MM-JJ), creneaux_7j (nombre) si connus. Une valeur inconnue se laisse vide ; rien n'est deviné. Renvoie le bilan et les erreurs ligne par ligne.",
    inputSchema: {
      type: "object",
      required: ["lignes"],
      properties: {
        lignes: {
          type: "array", maxItems: 500,
          items: {
            type: "object", required: ["rpps", "url_doctolib", "releve_le"], additionalProperties: false,
            properties: {
              rpps: { type: "string" }, url_doctolib: { type: "string" }, releve_le: { type: "string", description: "AAAA-MM-JJ" },
              reservable: { type: "string", enum: ["oui", "non", ""] }, nouveaux_patients: { type: "string", enum: ["oui", "non", ""] },
              premier_creneau: { type: "string", description: "AAAA-MM-JJ, ou vide" }, creneaux_7j: { type: ["integer", "string"] },
            },
          },
        },
      },
      additionalProperties: false,
    },
  },
];

/** Praticiens non exclus avec un lien Doctolib (option : un département), avec leur dernier relevé. */
async function praticiensAvecLien(db: any, departement?: string) {
  const out: any[] = [];
  for (let de = 0; ; de += 1000) {
    let q = db.from("admin_reseau_praticiens")
      .select(`id, rpps, nom, prenom, population, etat, doctolib_url, doctolib_statut, doctolib_infos, doctolib_releve_le, admin_reseau_lieux${departement ? "!inner" : ""}(commune, departement)`)
      .not("doctolib_url", "is", null).neq("etat", "exclu").order("id").range(de, de + 999);
    if (departement) q = q.eq("admin_reseau_lieux.departement", departement);
    const { data, error } = await q;
    if (error) throw new Error(error.message);
    out.push(...(data ?? []));
    if ((data ?? []).length < 1000) break;
  }
  return out.map((p) => ({
    ...p,
    dernier: [p.doctolib_releve_le, p.doctolib_infos?.disponibilites?.releve_le].filter(Boolean).sort().pop() ?? null as string | null,
  }));
}

function departementValide(v: unknown): string | undefined {
  if (v == null || v === "") return undefined;
  const d = String(v).toUpperCase();
  if (!estDepartement(d)) throw new Error(`Département inconnu : ${v}`);
  return d;
}

async function appelerOutil(db: any, acteur: string, nom: string, args: any): Promise<unknown> {
  const limiteJours = Date.now() - JOURS_COLLECTE * 86_400_000;
  if (nom === "point_collecte_doctolib") {
    const dep = departementValide(args?.departement);
    const ps = await praticiensAvecLien(db, dep);
    let jamais = 0, anciens = 0, aValider = 0;
    for (const p of ps) {
      if (!p.dernier) jamais++; else if (Date.parse(p.dernier) < limiteJours) anciens++;
      if (p.doctolib_statut === "trouve_auto" && !p.doctolib_infos) aValider++;
    }
    let q = db.from("admin_reseau_praticiens").select("id", { count: "exact", head: true }).eq("doctolib_statut", "a_confirmer").neq("etat", "exclu");
    const { count: aChoisir } = await q;
    return {
      departement: dep ?? "tous", liens: ps.length, a_collecter: jamais + anciens, jamais_releves: jamais,
      releves_de_plus_de_180_jours: anciens, releves_recents: ps.length - jamais - anciens,
      liens_trouves_a_valider: aValider, fiches_a_choisir: aChoisir ?? 0,
    };
  }
  if (nom === "fiches_doctolib_a_collecter") {
    const dep = departementValide(args?.departement);
    const limite = Math.min(500, Math.max(1, Number.isInteger(args?.limite) ? args.limite : 50));
    const ps = (await praticiensAvecLien(db, dep))
      .filter((p) => args?.inclure_recentes === true || !p.dernier || Date.parse(p.dernier) < limiteJours)
      .sort((a, b) => (a.dernier ?? "").localeCompare(b.dernier ?? ""))
      .slice(0, limite);
    return {
      total: ps.length,
      format_attendu_pour_l_import: "rpps, url_doctolib, releve_le (AAAA-MM-JJ) obligatoires ; reservable (oui/non), nouveaux_patients (oui/non), premier_creneau (AAAA-MM-JJ), creneaux_7j (nombre) si connus. Laisser vide ce qui n'est pas lu sur la fiche.",
      fiches: ps.map((p) => ({
        rpps: p.rpps, nom: p.nom, prenom: p.prenom, specialite: (POPULATION_LIBELLE as any)[p.population] ?? p.population,
        villes: [...new Set((p.admin_reseau_lieux ?? []).map((l: any) => l.commune).filter(Boolean))].join(", "),
        url_doctolib: p.doctolib_url, dernier_releve: p.dernier ? String(p.dernier).slice(0, 10) : null,
      })),
    };
  }
  if (nom === "importer_resultats_doctolib") {
    const lignes = Array.isArray(args?.lignes) ? args.lignes.slice(0, 500) : [];
    if (!lignes.length) throw new Error("Aucune ligne.");
    // Mêmes contrôles que l'import du fichier : on repasse par l'analyse du CSV.
    const colonnes = ["rpps", "url_doctolib", "reservable", "nouveaux_patients", "premier_creneau", "creneaux_7j", "releve_le"];
    const csv = versCsv(lignes.map((l: any) => Object.fromEntries(colonnes.map((c) => [c, l?.[c] == null ? "" : String(l[c])]))), colonnes);
    const lecture = analyserImport(csv);
    const bilan = lecture.resultats.length ? await importerResultatsDoctolib(db, acteur, lecture.resultats) : null;
    return { lignes_recues: lignes.length, lignes_retenues: lecture.resultats.length, erreurs: lecture.erreurs, bilan };
  }
  throw new Error(`Outil inconnu : ${nom}`);
}

// ── Accès par clé ────────────────────────────────────────────────────────────

async function verifierCle(db: any, req: Request): Promise<{ nom: string } | null> {
  const enTete = req.headers.get("Authorization") ?? "";
  const cle = enTete.match(/^Bearer\s+(\S+)$/i)?.[1] ?? new URL(req.url).searchParams.get("cle") ?? "";
  if (!/^avd_[A-Za-z0-9_-]{30,}$/.test(cle)) return null;
  const { data } = await db.from("admin_mcp_cles").select("id, nom").eq("empreinte", await empreinteCle(cle)).is("revoquee_le", null).maybeSingle();
  if (!data) return null;
  await db.from("admin_mcp_cles").update({ derniere_utilisation: new Date().toISOString() }).eq("id", data.id);
  return { nom: data.nom };
}

// ── JSON-RPC ─────────────────────────────────────────────────────────────────

async function traiter(db: any, acteur: string, m: any): Promise<unknown | undefined> {
  const id = m?.id;
  const estRequete = id !== undefined && id !== null;
  const ok = (result: unknown) => ({ jsonrpc: "2.0", id, result });
  const ko = (code: number, message: string) => ({ jsonrpc: "2.0", id: estRequete ? id : null, error: { code, message } });
  if (!m || m.jsonrpc !== "2.0" || typeof m.method !== "string") return ko(-32600, "Requête JSON-RPC invalide.");
  if (!estRequete) return undefined; // notification (notifications/initialized…) : pas de réponse
  switch (m.method) {
    case "initialize": {
      const demandee = m.params?.protocolVersion;
      return ok({
        protocolVersion: VERSIONS.includes(demandee) ? demandee : VERSIONS[0],
        capabilities: { tools: { listChanged: false } },
        serverInfo: { name: "avisdoc-reseau-aval", version: "1.0.0" },
        instructions: "Hub AvisDoc, réseau d'aval : point de collecte Doctolib, fiches à relever et import des résultats. Chaque résultat porte le lien de la fiche relevée et la date du relevé ; une information non lue reste vide.",
      });
    }
    case "ping": return ok({});
    case "tools/list": return ok({ tools: OUTILS });
    case "tools/call": {
      const nom = String(m.params?.name ?? "");
      if (!OUTILS.some((o) => o.name === nom)) return ko(-32602, `Outil inconnu : ${nom}`);
      try {
        const donnees = await appelerOutil(db, acteur, nom, m.params?.arguments ?? {});
        return ok({ content: [{ type: "text", text: JSON.stringify(donnees, null, 2) }], structuredContent: donnees, isError: false });
      } catch (e) {
        return ok({ content: [{ type: "text", text: `Erreur : ${e instanceof Error ? e.message : String(e)}` }], isError: true });
      }
    }
    default: return ko(-32601, `Méthode inconnue : ${m.method}`);
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: entetes });
  if (req.method !== "POST") return reponse({ error: "Utilisez POST (MCP, JSON-RPC)." }, 405, { Allow: "POST, OPTIONS" });
  const db = clientService();
  const cle = await verifierCle(db, req);
  if (!cle) return reponse({ jsonrpc: "2.0", id: null, error: { code: -32001, message: "Clé d'accès absente, invalide ou révoquée (Admin › Clés d'accès)." } }, 401, { "WWW-Authenticate": 'Bearer realm="avisdoc"' });
  const corps = await req.json().catch(() => undefined);
  if (corps === undefined) return reponse({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "JSON invalide." } }, 400);
  const acteur = `MCP « ${cle.nom} »`;
  if (Array.isArray(corps)) {
    const reps = (await Promise.all(corps.map((m) => traiter(db, acteur, m)))).filter((r) => r !== undefined);
    return reps.length ? reponse(reps) : new Response(null, { status: 202, headers: entetes });
  }
  const r = await traiter(db, acteur, corps);
  return r === undefined ? new Response(null, { status: 202, headers: entetes }) : reponse(r);
});
