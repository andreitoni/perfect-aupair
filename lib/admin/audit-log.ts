import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";

type AdminAuditLogEntry = {
  adminProfileId?: string | null;
  action: string;
  targetProfileId?: string | null;
  targetResourceType?: string | null;
  targetResourceId?: string | null;
  metadata?: Record<string, unknown>;
};

export async function logAdminAction(
  supabase: ReturnType<typeof createAdminClient>,
  entry: AdminAuditLogEntry,
) {
  const { error } = await supabase.from("admin_audit_log").insert({
    admin_profile_id: entry.adminProfileId ?? null,
    action: entry.action,
    target_profile_id: entry.targetProfileId ?? null,
    target_resource_type: entry.targetResourceType ?? null,
    target_resource_id: entry.targetResourceId ?? null,
    metadata: entry.metadata ?? {},
  });

  if (error) {
    console.warn("Could not write admin audit log.", {
      action: entry.action,
      message: error.message,
    });
  }
}
