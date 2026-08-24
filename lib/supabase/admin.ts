import "server-only";

import { execSync } from "node:child_process";
import { createClient } from "@supabase/supabase-js";

function cleanEnvValue(value?: string) {
  const trimmed = (value ?? "").trim();

  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1).trim();
  }

  return trimmed;
}

function normalizeStatusKey(key: string) {
  return key.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function readStatusValue(output: string, wantedKeys: string[]) {
  const wanted = new Set(wantedKeys.map(normalizeStatusKey));

  for (const rawLine of output.split("\n")) {
    const line = rawLine.trim().replace(/^export\s+/, "");

    if (!line) {
      continue;
    }

    const equalsIndex = line.indexOf("=");
    const colonIndex = line.indexOf(":");
    const separatorIndex =
      equalsIndex >= 0 && colonIndex >= 0
        ? Math.min(equalsIndex, colonIndex)
        : Math.max(equalsIndex, colonIndex);

    if (separatorIndex < 0) {
      continue;
    }

    const key = normalizeStatusKey(line.slice(0, separatorIndex));
    const value = cleanEnvValue(line.slice(separatorIndex + 1));

    if (wanted.has(key)) {
      return value;
    }
  }

  return "";
}

function isServiceRoleKeyLike(value?: string) {
  const cleaned = cleanEnvValue(value);

  return (
    (cleaned.startsWith("eyJ") && cleaned.split(".").length === 3) ||
    cleaned.startsWith("sb_secret_")
  );
}

let cachedLocalSupabaseStatusOutput: string | null | undefined;

function readLocalSupabaseStatusOutput() {
  if (cachedLocalSupabaseStatusOutput !== undefined) {
    return cachedLocalSupabaseStatusOutput;
  }

  for (const command of ["supabase status -o env", "supabase status"]) {
    try {
      cachedLocalSupabaseStatusOutput = execSync(command, {
        cwd: process.cwd(),
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
      });
      return cachedLocalSupabaseStatusOutput;
    } catch {
      // Try the human-readable status output before giving up.
    }
  }

  cachedLocalSupabaseStatusOutput = null;
  return cachedLocalSupabaseStatusOutput;
}

function readLocalSupabaseStatusValue(wantedKeys: string[]) {
  if (process.env.NODE_ENV === "production") {
    return "";
  }

  return readStatusValue(readLocalSupabaseStatusOutput() ?? "", wantedKeys);
}

type AdminClientOptions = {
  customFetch?: typeof fetch;
};

export function createAdminClient(options: AdminClientOptions = {}) {
  const supabaseUrl =
    process.env.NEXT_PUBLIC_SUPABASE_URL ??
    process.env.SUPABASE_URL ??
    readLocalSupabaseStatusValue(["API_URL", "SUPABASE_URL", "Project URL"]);
  const serviceRoleKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY ??
    process.env.SERVICE_ROLE_KEY ??
    readLocalSupabaseStatusValue([
      "SERVICE_ROLE_KEY",
      "SUPABASE_SERVICE_ROLE_KEY",
      "service_role key",
      "service role key",
    ]) ??
    readLocalSupabaseStatusValue(["SECRET_KEY", "Secret"]);

  if (!supabaseUrl || !serviceRoleKey || !isServiceRoleKeyLike(serviceRoleKey)) {
    throw new Error("Missing Supabase admin environment variables");
  }

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
    ...(options.customFetch
      ? {
          global: {
            fetch: options.customFetch,
          },
        }
      : {}),
  });
}
