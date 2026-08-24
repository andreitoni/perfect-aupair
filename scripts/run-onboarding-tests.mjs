#!/usr/bin/env node

import { execFileSync, spawnSync } from "node:child_process";
import {
  existsSync,
  readdirSync,
  readFileSync,
  realpathSync,
} from "node:fs";
import { dirname, join } from "node:path";

const localEnvFiles = [".env.local", ".env.test.local"];

function cleanEnvValue(value = "") {
  const trimmed = String(value).trim();

  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1).trim();
  }

  return trimmed;
}

function readEnvFiles() {
  const env = {};

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
      // Local env files are optional.
    }
  }

  return env;
}

function normalizeStatusKey(key) {
  return key.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function readLineValue(line, wanted) {
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

function readStatusValue(output, wantedKeys) {
  const wanted = new Set(wantedKeys.map(normalizeStatusKey));

  for (const line of output.split("\n")) {
    const value = readLineValue(line, wanted);

    if (value) {
      return value;
    }
  }

  return "";
}

function redactSupabaseOutput(output) {
  return output
    .replace(/eyJ[A-Za-z0-9._-]+/g, "[redacted-jwt]")
    .replace(/sb_secret_[A-Za-z0-9._-]+/g, "[redacted-secret]")
    .replace(/sb_publishable_[A-Za-z0-9._-]+/g, "[redacted-publishable]")
    .replace(/(SERVICE_ROLE_KEY=)\S+/gi, "$1[redacted]")
    .replace(/(SUPABASE_SERVICE_ROLE_KEY=)\S+/gi, "$1[redacted]")
    .replace(/(SECRET_KEY=)\S+/gi, "$1[redacted]")
    .replace(/(ANON_KEY=)\S+/gi, "$1[redacted]")
    .replace(/(PUBLISHABLE_KEY=)\S+/gi, "$1[redacted]")
    .replace(/(JWT_SECRET=)\S+/gi, "$1[redacted]")
    .replace(/(S3_PROTOCOL_ACCESS_KEY_SECRET=)\S+/gi, "$1[redacted]");
}

function commandPath(command) {
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
  ].filter(Boolean);

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
      // Try the next candidate.
    }
  }

  return "";
}

function runSupabase(cli, args) {
  try {
    return {
      ok: true,
      output: execFileSync(cli, args, {
        cwd: process.cwd(),
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
      }),
    };
  } catch (error) {
    const output = [error.stdout, error.stderr]
      .filter(Boolean)
      .map(String)
      .join("\n");

    return { ok: false, output };
  }
}

function parseStatus(output) {
  const serviceRoleKey =
    readStatusValue(output, [
      "SUPABASE_SERVICE_ROLE_KEY",
      "SERVICE_ROLE_KEY",
      "service_role key",
      "service role key",
    ]) || readStatusValue(output, ["SECRET_KEY", "Secret"]);

  return {
    url: readStatusValue(output, ["API_URL", "SUPABASE_URL", "Project URL"]),
    publishableKey: readStatusValue(output, [
      "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
      "PUBLISHABLE_KEY",
      "Publishable",
      "NEXT_PUBLIC_SUPABASE_ANON_KEY",
      "ANON_KEY",
      "anon key",
    ]),
    serviceRoleKey,
  };
}

function readSupabaseStatus(cli) {
  for (const args of [
    ["status", "-o", "env"],
    ["status"],
  ]) {
    const result = runSupabase(cli, args);

    if (result.ok) {
      const parsed = parseStatus(result.output);

      if (parsed.url || parsed.publishableKey || parsed.serviceRoleKey) {
        return { parsed, output: result.output };
      }
    }
  }

  return { parsed: {}, output: "" };
}

function isLocalSupabaseUrl(value) {
  try {
    const url = new URL(cleanEnvValue(value));

    return ["127.0.0.1", "localhost", "::1"].includes(url.hostname);
  } catch {
    return false;
  }
}

function resolveSupabaseEnv() {
  const fileEnv = readEnvFiles();
  const cli = workingSupabaseCli();
  let status = {};

  if (cli) {
    let statusResult = readSupabaseStatus(cli);
    status = statusResult.parsed;

    if (!status.url || !status.publishableKey || !status.serviceRoleKey) {
      const startResult = runSupabase(cli, ["start"]);

      if (!startResult.ok) {
        throw new Error(
          [
            "Could not start local Supabase for onboarding tests.",
            `Tried CLI: ${cli}`,
            "Run `supabase start` or `supabase-go start` manually and check the output.",
            redactSupabaseOutput(startResult.output).slice(0, 1600),
          ]
            .filter(Boolean)
            .join("\n"),
        );
      }

      statusResult = readSupabaseStatus(cli);
      status = statusResult.parsed;
    }
  }

  const url =
    status.url ||
    cleanEnvValue(
      process.env.NEXT_PUBLIC_SUPABASE_URL ??
        process.env.SUPABASE_URL ??
        fileEnv.NEXT_PUBLIC_SUPABASE_URL ??
        fileEnv.SUPABASE_URL,
    );
  const publishableKey =
    status.publishableKey ||
    cleanEnvValue(
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
        process.env.ANON_KEY ??
        process.env.PUBLISHABLE_KEY ??
        fileEnv.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
        fileEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
        fileEnv.ANON_KEY ??
        fileEnv.PUBLISHABLE_KEY,
    );
  const serviceRoleKey =
    status.serviceRoleKey ||
    cleanEnvValue(
      process.env.SUPABASE_SERVICE_ROLE_KEY ??
        process.env.SERVICE_ROLE_KEY ??
        process.env.SECRET_KEY ??
        fileEnv.SUPABASE_SERVICE_ROLE_KEY ??
        fileEnv.SERVICE_ROLE_KEY ??
        fileEnv.SECRET_KEY,
    );

  if (!url || !publishableKey || !serviceRoleKey) {
    throw new Error(
      [
        "Missing local Supabase test credentials.",
        cli
          ? "The local CLI ran, but status did not expose URL, publishable key, and secret/service role key."
          : "No working Supabase CLI was found.",
        "Run `supabase start` or `supabase-go start`, then `supabase status -o env`.",
        "You can also copy local-only values into `.env.test.local` using `.env.test.local.example` as the template.",
      ].join("\n"),
    );
  }

  if (!isLocalSupabaseUrl(url)) {
    throw new Error(
      `Refusing to run onboarding tests against a non-local Supabase URL: ${url}`,
    );
  }

  return {
    cli,
    url,
    publishableKey,
    serviceRoleKey,
  };
}

try {
  const supabaseEnv = resolveSupabaseEnv();
  const forwardedArgs = process.argv.slice(2);
  const hasWorkerOverride = forwardedArgs.some(
    (arg) => arg === "-j" || arg === "--workers" || arg.startsWith("--workers="),
  );
  const childEnv = {
    ...process.env,
    NEXT_PUBLIC_SUPABASE_URL: supabaseEnv.url,
    SUPABASE_URL: supabaseEnv.url,
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: supabaseEnv.publishableKey,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: supabaseEnv.publishableKey,
    SUPABASE_SERVICE_ROLE_KEY: supabaseEnv.serviceRoleKey,
    SERVICE_ROLE_KEY: supabaseEnv.serviceRoleKey,
  };

  console.log(
    `Using local Supabase at ${supabaseEnv.url}${
      supabaseEnv.cli ? ` via ${supabaseEnv.cli}` : ""
    }.`,
  );

  const result = spawnSync(
    "pnpm",
    [
      "exec",
      "playwright",
      "test",
      "tests/e2e/onboarding-flow.spec.ts",
      ...(hasWorkerOverride ? [] : ["--workers=1"]),
      ...forwardedArgs,
    ],
    {
      cwd: process.cwd(),
      env: childEnv,
      stdio: "inherit",
    },
  );

  process.exit(result.status ?? 1);
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
