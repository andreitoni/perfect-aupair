import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createClient } from "@supabase/supabase-js";
import { expect, test } from "@playwright/test";
import { cleanupExpiredProfileStories } from "../../lib/stories/cleanup-expired-profile-stories";

type LocalEnv = Record<string, string>;

const PROFILE_STORIES_BUCKET = "profile-stories";

function readLocalEnv(): LocalEnv {
  try {
    const raw = readFileSync(join(process.cwd(), ".env.local"), "utf8");
    const env: LocalEnv = {};

    for (const line of raw.split(/\r?\n/)) {
      const trimmed = line.trim();

      if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) {
        continue;
      }

      const [key, ...valueParts] = trimmed.split("=");
      env[key] = cleanEnvValue(valueParts.join("="));
    }

    return env;
  } catch {
    return {};
  }
}

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

function isJwtLike(value?: string) {
  const cleaned = cleanEnvValue(value);

  return cleaned.startsWith("eyJ") && cleaned.split(".").length === 3;
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

function getSupabaseCredentials() {
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
      localEnv.SUPABASE_SERVICE_ROLE_KEY ??
      localEnv.SERVICE_ROLE_KEY,
  );

  if (serviceRoleKey && !isJwtLike(serviceRoleKey)) {
    serviceRoleKey = "";
  }

  for (const command of ["supabase status -o env", "supabase status"]) {
    if (url && serviceRoleKey) {
      break;
    }

    try {
      const output = execSync(command, {
        cwd: process.cwd(),
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
      });

      url ||= readStatusValue(output, ["API_URL", "SUPABASE_URL", "Project URL"]);

      const statusServiceRoleKey = readStatusValue(output, [
        "SERVICE_ROLE_KEY",
        "SUPABASE_SERVICE_ROLE_KEY",
        "service_role key",
        "service role key",
      ]);

      if (!serviceRoleKey && isJwtLike(statusServiceRoleKey)) {
        serviceRoleKey = statusServiceRoleKey;
      }
    } catch {
      // Try the next status format.
    }
  }

  if (!url || !serviceRoleKey || !isJwtLike(serviceRoleKey)) {
    throw new Error(
      "Could not find local Supabase credentials. Start Supabase locally or add SUPABASE_SERVICE_ROLE_KEY to .env.local.",
    );
  }

  return { url, serviceRoleKey };
}

async function createAuthUser(
  admin: ReturnType<typeof createClient>,
  email: string,
  password: string,
) {
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: {
      account_type: "au_pair",
    },
  });

  if (error || !data.user) {
    throw new Error(error?.message ?? "Could not create story cleanup user.");
  }

  return data.user;
}

async function uploadStoryFixture(
  admin: ReturnType<typeof createClient>,
  storagePath: string,
) {
  const fixture = readFileSync(join(process.cwd(), "tests/fixtures/profile-photo.png"));
  const { error } = await admin.storage
    .from(PROFILE_STORIES_BUCKET)
    .upload(storagePath, fixture, {
      contentType: "image/png",
      upsert: false,
    });

  if (error) {
    throw new Error(error.message);
  }
}

test("expired profile story cleanup removes only expired rows and files", async () => {
  const { url, serviceRoleKey } = getSupabaseCredentials();
  const admin = createClient(url, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });

  const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const password = "TestPassword123!";
  const user = await createAuthUser(
    admin,
    `story-cleanup-${suffix}@example.com`,
    password,
  );

  const expiredPath = `${user.id}/expired-${suffix}.png`;
  const activePath = `${user.id}/active-${suffix}.png`;
  let activeStoryId = "";

  try {
    const { error: profileError } = await admin.from("profiles").upsert({
      id: user.id,
      email: user.email,
      account_type: "au_pair",
      onboarding_completed: true,
      first_name: "Story",
      last_name: "Cleanup",
      full_name: "Story Cleanup",
      gender: "female",
      birth_date: "2000-01-01",
      date_of_birth: "2000-01-01",
      country: "Germany",
      city: "Berlin",
      nationality: "Romanian",
      preferred_host_countries: ["Germany"],
      mother_tongue: "Romanian",
      fluent_languages: ["English"],
      basic_languages: ["German"],
      availability_start: "2026-07-01",
      availability_start_from: "2026-07-01",
      availability_start_to: "2026-08-01",
      duration: "6 months",
      duration_min_months: 6,
      duration_max_months: 12,
      bio: "Story cleanup test profile.",
    });

    if (profileError) {
      throw new Error(profileError.message);
    }

    await uploadStoryFixture(admin, expiredPath);
    await uploadStoryFixture(admin, activePath);

    const { error: expiredInsertError } = await admin
      .from("profile_stories")
      .insert({
        profile_id: user.id,
        storage_path: expiredPath,
        expires_at: "2026-01-01T00:00:00.000Z",
      });

    if (expiredInsertError) {
      throw new Error(expiredInsertError.message);
    }

    const { data: activeStory, error: activeInsertError } = await admin
      .from("profile_stories")
      .insert({
        profile_id: user.id,
        storage_path: activePath,
        expires_at: "2026-12-31T00:00:00.000Z",
      })
      .select("id")
      .single();

    if (activeInsertError || !activeStory) {
      throw new Error(activeInsertError?.message ?? "Could not insert active story.");
    }

    activeStoryId = activeStory.id;

    const result = await cleanupExpiredProfileStories({
      supabase: admin,
      now: new Date("2026-06-09T12:00:00.000Z"),
    });

    expect(result.deletedStories).toBe(1);
    expect(result.removedFiles).toBe(1);

    const { data: remainingStories, error: remainingError } = await admin
      .from("profile_stories")
      .select("id, storage_path")
      .eq("profile_id", user.id);

    if (remainingError) {
      throw new Error(remainingError.message);
    }

    expect(remainingStories).toEqual([
      expect.objectContaining({
        id: activeStoryId,
        storage_path: activePath,
      }),
    ]);

    const { data: expiredFile } = await admin.storage
      .from(PROFILE_STORIES_BUCKET)
      .download(expiredPath);
    expect(expiredFile).toBeNull();

    const { data: activeFile, error: activeDownloadError } = await admin.storage
      .from(PROFILE_STORIES_BUCKET)
      .download(activePath);
    expect(activeDownloadError).toBeNull();
    expect(activeFile).not.toBeNull();
  } finally {
    await admin.storage
      .from(PROFILE_STORIES_BUCKET)
      .remove([expiredPath, activePath]);
    await admin.from("profile_stories").delete().eq("profile_id", user.id);
    await admin.from("profiles").delete().eq("id", user.id);
    await admin.auth.admin.deleteUser(user.id);
  }
});
