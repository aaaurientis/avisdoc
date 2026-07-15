// Client Supabase pour le back-office.
//
// On réutilise l'instance du site (même projet Supabase) pour éviter deux
// clients GoTrue, mais typée « souple » car les tables admin_* ne sont pas dans
// le type généré `Database`. Les requêtes .from('admin_*') sont donc permises.

import type { SupabaseClient } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

export const supabaseAdmin = supabase as unknown as SupabaseClient;
