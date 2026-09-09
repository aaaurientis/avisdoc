// Journal d'auditabilité — écriture (tous comptes) et lecture (super-admin).
//
// L'écriture est « best-effort » : elle ne doit JAMAIS bloquer ni faire échouer
// une action métier (on avale les erreurs). Les mutations de données sont, elles,
// tracées côté base par des triggers (voir 0019_audit_log.sql) ; ce module gère
// les événements que la base ne voit pas : connexions, déconnexions, tentatives
// refusées et erreurs applicatives.

import type { AuditCategory, AuditEntry } from "../types";
import { ADMIN_BACKEND } from "./config";
import { supabaseAdmin } from "../data/supabaseAdmin";

interface LogInput {
  actorEmail: string;
  category: AuditCategory;
  action: string;
  entity?: string | null;
  entityId?: string | null;
  success?: boolean | null;
  detail?: Record<string, unknown> | null;
}

/** Enregistre un événement d'audit (no-op en mode démo, jamais bloquant). */
export async function logAudit(input: LogInput): Promise<void> {
  if (ADMIN_BACKEND !== "supabase") return;
  try {
    await supabaseAdmin.from("admin_audit_log").insert({
      actor_email: input.actorEmail,
      category: input.category,
      action: input.action,
      entity: input.entity ?? null,
      entity_id: input.entityId ?? null,
      success: input.success ?? null,
      detail: input.detail ?? null,
      user_agent:
        typeof navigator !== "undefined" ? navigator.userAgent.slice(0, 400) : null,
    });
  } catch {
    /* journalisation best-effort : on n'interrompt jamais le flux */
  }
}

/* eslint-disable @typescript-eslint/no-explicit-any */
function toEntry(r: any): AuditEntry {
  return {
    id: r.id,
    at: r.at,
    actorEmail: r.actor_email ?? "",
    category: r.category,
    action: r.action,
    entity: r.entity ?? null,
    entityId: r.entity_id ?? null,
    success: r.success ?? null,
    detail: r.detail ?? null,
    userAgent: r.user_agent ?? null,
  };
}

/** Jeu de démonstration (mode démo) — illustre l'écran sans backend. */
function demoLog(): AuditEntry[] {
  const now = Date.now();
  const min = 60_000;
  const mk = (
    o: number,
    actorEmail: string,
    category: AuditCategory,
    action: string,
    extra: Partial<AuditEntry> = {},
  ): AuditEntry => ({
    id: `demo-${o}`,
    at: new Date(now - o * min).toISOString(),
    actorEmail,
    category,
    action,
    entity: null,
    entityId: null,
    success: null,
    detail: null,
    userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)",
    ...extra,
  });
  return [
    mk(2, "arthur@avisdoc.fr", "auth", "login", { success: true }),
    mk(9, "s.benali@avisdoc.fr", "data", "update", { entity: "admin_clients", entityId: "c-102", success: true }),
    mk(15, "s.benali@avisdoc.fr", "data", "insert", { entity: "admin_documents", entityId: "d-561", success: true }),
    mk(23, "inconnu@gmail.com", "auth", "login_refused", { success: false, detail: { reason: "domaine non autorisé" } }),
    mk(41, "s.benali@avisdoc.fr", "error", "persist_error", { success: false, detail: { message: "réseau indisponible" } }),
    mk(58, "s.benali@avisdoc.fr", "data", "delete", { entity: "admin_suivis", entityId: "s-77", success: true }),
    mk(120, "arthur@avisdoc.fr", "auth", "logout", { success: true }),
  ];
}

/** Charge les dernières entrées du journal (super-admin uniquement via RLS). */
export async function fetchAuditLog(limit = 200): Promise<AuditEntry[]> {
  if (ADMIN_BACKEND !== "supabase") return demoLog();
  const { data, error } = await supabaseAdmin
    .from("admin_audit_log")
    .select("*")
    .order("at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data ?? []).map(toEntry);
}
