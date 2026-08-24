import { execFileSync } from "node:child_process";
import {
  existsSync,
  readdirSync,
  readFileSync,
  realpathSync,
} from "node:fs";
import { dirname, join } from "node:path";

type LocalEnv = Record<string, string>;

const localEnvFiles = [".env.local", ".env.test.local"];

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

function readLocalEnv(): LocalEnv {
  const env: LocalEnv = {};

  for (const fileName of localEnvFiles) {
    try {
      const raw = readFileSync(join(process.cwd(), fileName), "utf8");

      for (const line of raw.split(/\r?\n/)) {
        const trimmed = line.trim();

        if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) {
          continue;
        }

        const [key, ...valueParts] = trimmed.split("=");
        env[key] = cleanEnvValue(valueParts.join("="));
      }
    } catch {
      // Local env files are optional in tests.
    }
  }

  return env;
}

function normalizeStatusKey(key: string) {
  return key.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function isJwtLike(value?: string) {
  const cleaned = cleanEnvValue(value);

  return cleaned.startsWith("eyJ") && cleaned.split(".").length === 3;
}

function isSecretKeyLike(value?: string) {
  const cleaned = cleanEnvValue(value);

  return isJwtLike(cleaned) || cleaned.startsWith("sb_secret_");
}

function isLocalSupabaseUrl(value?: string) {
  try {
    const url = new URL(cleanEnvValue(value));

    return ["127.0.0.1", "localhost", "::1"].includes(url.hostname);
  } catch {
    return false;
  }
}

function readLineValue(line: string, wanted: Set<string>) {
  const trimmed = line.trim().replace(/^export\s+/, "");

  if (!trimmed) {
    return "";
  }

  const tableCells = trimmed
    .split("│")
    .map((cell) => cell.trim())
    .filter(Boolean);

  if (tableCells.length >= 2 && wanted.has(normalizeStatusKey(tableCells[0]))) {
    return cleanEnvValue(tableCells[1]);
  }

  const equalsIndex = trimmed.indexOf("=");
  const colonIndex = trimmed.indexOf(":");
  const separatorIndex =
    equalsIndex >= 0 && colonIndex >= 0
      ? Math.min(equalsIndex, colonIndex)
      : Math.max(equalsIndex, colonIndex);

  if (separatorIndex < 0) {
    return "";
  }

  const key = normalizeStatusKey(trimmed.slice(0, separatorIndex));

  if (!wanted.has(key)) {
    return "";
  }

  return cleanEnvValue(trimmed.slice(separatorIndex + 1));
}

function readStatusValue(output: string, wantedKeys: string[]) {
  const wanted = new Set(wantedKeys.map(normalizeStatusKey));

  for (const line of output.split("\n")) {
    const value = readLineValue(line, wanted);

    if (value) {
      return value;
    }
  }

  return "";
}

function commandPath(command: string) {
  try {
    return execFileSync("/usr/bin/env", ["which", command], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    return "";
  }
}

function supabaseCliCandidates() {
  const candidates = [
    process.env.SUPABASE_CLI,
    commandPath("supabase-go"),
    commandPath("supabase"),
  ].filter(Boolean) as string[];

  const supabasePath = commandPath("supabase");

  if (supabasePath) {
    try {
      candidates.push(join(dirname(realpathSync(supabasePath)), "supabase-go"));
    } catch {
      candidates.push(join(dirname(supabasePath), "supabase-go"));
    }
  }

  for (const cellarRoot of [
    "/opt/homebrew/Cellar/supabase",
    "/usr/local/Cellar/supabase",
  ]) {
    if (!existsSync(cellarRoot)) {
      continue;
    }

    for (const version of readdirSync(cellarRoot).sort().reverse()) {
      candidates.push(join(cellarRoot, version, "bin", "supabase-go"));
      candidates.push(join(cellarRoot, version, "bin", "supabase"));
    }
  }

  return [...new Set(candidates)];
}

function workingSupabaseCli() {
  for (const candidate of supabaseCliCandidates()) {
    try {
      execFileSync(candidate, ["--version"], {
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
      });

      return candidate;
    } catch {
      // Try the next candidate. Some Homebrew installs include a broken Bun
      // wrapper plus a working supabase-go binary.
    }
  }

  return "";
}

function readSupabaseStatusOutputs() {
  const cli = workingSupabaseCli();

  if (!cli) {
    return [];
  }

  const outputs: string[] = [];

  for (const args of [
    ["status", "-o", "env"],
    ["status"],
  ]) {
    try {
      outputs.push(
        execFileSync(cli, args, {
          cwd: process.cwd(),
          encoding: "utf8",
          stdio: ["ignore", "pipe", "pipe"],
        }),
      );
    } catch {
      // The package script starts Supabase before Playwright. Direct spec runs
      // still get a clear error below when status is unavailable.
    }
  }

  return outputs;
}

export function getSupabaseCredentials() {
  const localEnv = readLocalEnv();

  let url = cleanEnvValue(
    process.env.NEXT_PUBLIC_SUPABASE_URL ??
      process.env.SUPABASE_URL ??
      localEnv.NEXT_PUBLIC_SUPABASE_URL ??
      localEnv.SUPABASE_URL,
  );

  let serviceRoleKey = cleanEnvValue(
    process.env.SUPABASE_SERVICE_ROLE_KEY ??
      process.env.SERVICE_ROLE_KEY ??
      process.env.SECRET_KEY ??
      localEnv.SUPABASE_SERVICE_ROLE_KEY ??
      localEnv.SERVICE_ROLE_KEY ??
      localEnv.SECRET_KEY,
  );
  let publishableKey = cleanEnvValue(
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
      process.env.PUBLISHABLE_KEY ??
      process.env.ANON_KEY ??
      localEnv.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
      localEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
      localEnv.PUBLISHABLE_KEY ??
      localEnv.ANON_KEY,
  );

  if (serviceRoleKey && !isSecretKeyLike(serviceRoleKey)) {
    serviceRoleKey = "";
  }

  for (const output of readSupabaseStatusOutputs()) {
    url ||= readStatusValue(output, [
      "API_URL",
      "SUPABASE_URL",
      "Project URL",
    ]);

    const statusServiceRoleKey =
      readStatusValue(output, [
        "SERVICE_ROLE_KEY",
        "SUPABASE_SERVICE_ROLE_KEY",
        "service_role key",
        "service role key",
      ]) || readStatusValue(output, ["SECRET_KEY", "Secret"]);

    if (!serviceRoleKey && isSecretKeyLike(statusServiceRoleKey)) {
      serviceRoleKey = statusServiceRoleKey;
    }

    publishableKey ||= readStatusValue(output, [
      "PUBLISHABLE_KEY",
      "ANON_KEY",
      "Publishable",
      "anon key",
    ]);
  }

  if (url && !isLocalSupabaseUrl(url)) {
    throw new Error(
      "Refusing to run onboarding tests against a non-local Supabase URL. Use local Supabase at http://127.0.0.1:54321.",
    );
  }

  if (!url || !serviceRoleKey) {
    throw new Error(
      "Could not find local Supabase credentials. Run `pnpm test:onboarding` so the test runner can start Supabase locally, or run `supabase start` / `supabase-go start` and add local keys to `.env.test.local`.",
    );
  }

  return { url, publishableKey, serviceRoleKey };
}

export function getLocalRateLimitHashSecret() {
  const localEnv = readLocalEnv();
  const applicationEnv = (key: string) =>
    cleanEnvValue(process.env[key] ?? localEnv[key]);

  return (
    applicationEnv("SECURITY_RATE_LIMIT_HASH_SECRET") ||
    applicationEnv("AUTH_RATE_LIMIT_HASH_SECRET") ||
    applicationEnv("SUPABASE_SERVICE_ROLE_KEY") ||
    applicationEnv("SERVICE_ROLE_KEY") ||
    "perfect-aupair-security-rate-limit"
  );
}
