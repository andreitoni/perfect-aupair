import type { SupabaseClient } from "@supabase/supabase-js";
import { isMissingAuthUserError } from "@/lib/auth/errors";
import {
  removeProfilePhotoFiles,
  removeProfileVideoFiles,
  removeStoryPhotoFiles,
  removeVerificationSelfieFiles,
  type ImageStorageClient,
} from "@/lib/images/storage";
import { sendAccountDeletionReminderEmails } from "@/lib/privacy/send-account-deletion-reminders";
import { sendPendingAccountDeletionConfirmations } from "@/lib/privacy/send-account-deletion-confirmations";

type AccountDeletionCleanupClient = SupabaseClient & ImageStorageClient;

type AccountDeletionRequest = {
  id: string;
  profile_id: string;
  processing_token: string;
};

type StoragePathRow = {
  storage_path?: string | null;
  image_path?: string | null;
  video_path?: string | null;
  audio_path?: string | null;
};

export type CleanupStorageManifest = {
  profilePhotoPaths: string[];
  profileVideoPaths: string[];
  verificationSelfiePaths: string[];
  storyPhotoPaths: string[];
  messagePhotoPaths: string[];
  messageVideoPaths: string[];
  messageAudioPaths: string[];
};

type CleanupScheduledAccountDeletionsParams = {
  supabase: AccountDeletionCleanupClient;
  batchSize?: number;
  now?: Date;
};

const STALE_ACCOUNT_DELETION_CLAIM_MS = 6 * 60 * 60 * 1000;
const POSTGREST_PAGE_SIZE = 500;

class LostAccountDeletionClaimError extends Error {}

export async function cleanupScheduledAccountDeletions({
  supabase,
  batchSize = 25,
  now = new Date(),
}: CleanupScheduledAccountDeletionsParams) {
  const cutoff = now.toISOString();
  const safeBatchSize = Math.max(1, Math.min(batchSize, 100));
  const staleClaimCutoff = new Date(
    now.getTime() - STALE_ACCOUNT_DELETION_CLAIM_MS,
  ).toISOString();
  const confirmations = await sendPendingAccountDeletionConfirmations({
    supabase,
    batchSize: safeBatchSize,
    now,
  });
  const reminders = await sendAccountDeletionReminderEmails({
    supabase,
    batchSize: safeBatchSize,
    now,
  });

  const [staleClaimsResult, pendingRequestsResult] = await Promise.all([
    supabase
      .from("account_deletion_requests")
      .select("id, profile_id")
      .eq("status", "processing")
      .or(
        `processing_started_at.is.null,processing_started_at.lte.${staleClaimCutoff}`,
      )
      .order("processing_started_at", {
        ascending: true,
        nullsFirst: true,
      })
      .limit(safeBatchSize),
    supabase
      .from("account_deletion_requests")
      .select("id, profile_id")
      .eq("status", "pending")
      .lte("scheduled_delete_at", cutoff)
      .order("scheduled_delete_at", { ascending: true })
      .limit(safeBatchSize),
  ]);

  if (staleClaimsResult.error || pendingRequestsResult.error) {
    throw new Error(
      staleClaimsResult.error?.message ??
        pendingRequestsResult.error?.message ??
        "Could not load scheduled account deletions.",
    );
  }

  const requests = [
    ...((staleClaimsResult.data ?? []) as AccountDeletionRequest[]),
    ...((pendingRequestsResult.data ?? []) as AccountDeletionRequest[]),
  ]
    .filter(
      (request, index, allRequests) =>
        request.id &&
        request.profile_id &&
        allRequests.findIndex((candidate) => candidate.id === request.id) ===
          index,
    )
    .slice(0, safeBatchSize);

  let completed = 0;
  let removedFiles = 0;
  let failed = 0;
  const failures: Array<{ requestId: string; message: string }> = [];
  const configuredAdminEmails = getConfiguredAdminEmails();

  for (const request of requests) {
    let processingToken: string | null = null;

    try {
      if (
        await quarantineConfiguredAdminDeletion({
          supabase,
          request,
          configuredAdminEmails,
        })
      ) {
        continue;
      }

      processingToken = crypto.randomUUID();
      const { data: claimedProfileId, error: claimError } = await supabase.rpc(
        "claim_scheduled_account_deletion",
        {
          p_request_id: request.id,
          p_cutoff: cutoff,
          p_stale_before: staleClaimCutoff,
          p_processing_token: processingToken,
        },
      );

      if (claimError) {
        throw new Error(claimError.message);
      }

      if (!claimedProfileId) {
        continue;
      }

      const claimedRequest = {
        ...request,
        profile_id: String(claimedProfileId),
        processing_token: processingToken,
      };
      const result = await deleteClaimedScheduledAccount({
        supabase,
        request: claimedRequest,
        now,
      });
      if (result.completed) completed += 1;
      removedFiles += result.removedFiles;
    } catch (error) {
      if (error instanceof LostAccountDeletionClaimError) {
        continue;
      }

      if (processingToken) {
        const { error: retryError } = await supabase
          .from("account_deletion_requests")
          .update({ processing_started_at: null, processing_token: null })
          .eq("id", request.id)
          .eq("status", "processing")
          .eq("processing_token", processingToken);

        if (retryError) {
          console.error(
            "Could not mark failed account deletion for retry.",
            retryError.message,
          );
        }
      }

      const message =
        error instanceof Error
          ? error.message.slice(0, 500)
          : "Unknown account deletion cleanup error.";

      failed += 1;
      failures.push({ requestId: request.id, message });
      console.error("Scheduled account deletion request failed.", {
        requestId: request.id,
        message,
      });
    }
  }

  return {
    cutoff,
    processedRequests: requests.length,
    completed,
    failed,
    failures,
    removedFiles,
    confirmations,
    reminders,
  };
}

function getConfiguredAdminEmails() {
  return new Set(
    (process.env.ADMIN_EMAILS ?? process.env.ADMIN_EMAIL ?? "")
      .split(",")
      .map((email) => email.trim().toLowerCase())
      .filter(Boolean),
  );
}

async function quarantineConfiguredAdminDeletion({
  supabase,
  request,
  configuredAdminEmails,
}: {
  supabase: AccountDeletionCleanupClient;
  request: Pick<AccountDeletionRequest, "id" | "profile_id">;
  configuredAdminEmails: Set<string>;
}) {
  if (!configuredAdminEmails.size) {
    return false;
  }

  const { data, error } = await supabase.auth.admin.getUserById(
    request.profile_id,
  );

  if (error) {
    if (isMissingAuthUserError(error)) {
      return false;
    }

    throw new Error(error.message);
  }

  const email = data.user?.email?.trim().toLowerCase();

  if (!email || !configuredAdminEmails.has(email)) {
    return false;
  }

  const { data: markedProfile, error: markError } = await supabase
    .from("profiles")
    .update({ is_admin: true })
    .eq("id", request.profile_id)
    .select("id")
    .maybeSingle<{ id: string }>();

  if (markError) {
    throw new Error(markError.message);
  }

  if (!markedProfile) {
    const { error: quarantineError } = await supabase
      .from("account_deletion_requests")
      .update({
        status: "cancelled",
        processing_started_at: null,
        processing_token: null,
        confirmation_email_sending_at: null,
      })
      .eq("id", request.id)
      .in("status", ["pending", "processing"]);

    if (quarantineError) {
      throw new Error(quarantineError.message);
    }
  }

  return true;
}

export async function deleteClaimedScheduledAccount({
  supabase,
  request,
  now,
}: {
  supabase: AccountDeletionCleanupClient;
  request: AccountDeletionRequest;
  now: Date;
}) {
  const profileId = request.profile_id;
  const manifest = await loadOrCreateCleanupStorageManifest({
    supabase,
    request,
  });

  let removedFiles = 0;

  await renewAccountDeletionClaim(supabase, request);

  const { error: authDeleteError } = await supabase.auth.admin.deleteUser(
    profileId,
  );

  if (authDeleteError && !isMissingAuthUserError(authDeleteError)) {
    throw new Error(authDeleteError.message);
  }

  if (authDeleteError) {
    await renewAccountDeletionClaim(supabase, request);

    const { error: profileDeleteError } = await supabase
      .from("profiles")
      .delete()
      .eq("id", profileId);

    if (profileDeleteError) {
      throw new Error(profileDeleteError.message);
    }
  }

  removedFiles += await removeStoragePaths({
    supabase,
    request,
    paths: manifest.profilePhotoPaths,
    remove: removeProfilePhotoFiles,
  });
  removedFiles += await removeStoragePaths({
    supabase,
    request,
    paths: manifest.storyPhotoPaths,
    remove: removeStoryPhotoFiles,
  });
  removedFiles += await removeStoragePaths({
    supabase,
    request,
    paths: manifest.profileVideoPaths,
    remove: removeProfileVideoFiles,
  });
  removedFiles += await removeStoragePaths({
    supabase,
    request,
    paths: manifest.verificationSelfiePaths,
    remove: removeVerificationSelfieFiles,
  });
  const { data: completedRequest, error: updateError } = await supabase
    .from("account_deletion_requests")
    .update({
      status: "completed",
      completed_at: now.toISOString(),
      email: null,
      processing_started_at: null,
      processing_token: null,
      cleanup_storage_manifest: null,
    })
    .eq("id", request.id)
    .eq("status", "processing")
    .eq("processing_token", request.processing_token)
    .select("id")
    .maybeSingle<{ id: string }>();

  if (updateError) {
    throw new Error(updateError.message);
  }

  if (!completedRequest) {
    throw new LostAccountDeletionClaimError(
      "Account deletion claim was lost before completion.",
    );
  }

  return { removedFiles, completed: true };
}

async function loadOrCreateCleanupStorageManifest({
  supabase,
  request,
}: {
  supabase: AccountDeletionCleanupClient;
  request: AccountDeletionRequest;
}) {
  const { data: requestRow, error: requestError } = await supabase
    .from("account_deletion_requests")
    .select("cleanup_storage_manifest")
    .eq("id", request.id)
    .eq("status", "processing")
    .eq("processing_token", request.processing_token)
    .maybeSingle<{ cleanup_storage_manifest: unknown }>();

  if (requestError) {
    throw new Error(requestError.message);
  }

  if (!requestRow) {
    throw new LostAccountDeletionClaimError(
      "Account deletion claim was lost before cleanup started.",
    );
  }

  if (requestRow.cleanup_storage_manifest !== null) {
    const existingManifest = parseCleanupStorageManifest(
      requestRow.cleanup_storage_manifest,
    );

    if (!existingManifest) {
      throw new Error("Account deletion storage manifest is invalid.");
    }

    return existingManifest;
  }

  const manifest = await collectAccountDeletionStorageManifest({
    supabase,
    profileId: request.profile_id,
  });
  const { data: persistedRequest, error: persistError } = await supabase
    .from("account_deletion_requests")
    .update({ cleanup_storage_manifest: manifest })
    .eq("id", request.id)
    .eq("status", "processing")
    .eq("processing_token", request.processing_token)
    .select("id")
    .maybeSingle<{ id: string }>();

  if (persistError) {
    throw new Error(persistError.message);
  }

  if (!persistedRequest) {
    throw new LostAccountDeletionClaimError(
      "Account deletion claim was lost before cleanup started.",
    );
  }

  return manifest;
}

export async function collectAccountDeletionStorageManifest({
  supabase,
  profileId,
}: {
  supabase: AccountDeletionCleanupClient;
  profileId: string;
}): Promise<CleanupStorageManifest> {
  const [
    profilePhotoPaths,
    profileVideoPaths,
    verificationSelfiePaths,
    storyPhotoPaths,
  ] = await Promise.all([
    listProfilePhotoPaths(supabase, profileId),
    listProfileVideoPaths(supabase, profileId),
    listVerificationSelfiePaths(supabase, profileId),
    listStoryPhotoPaths(supabase, profileId),
  ]);

  return {
    profilePhotoPaths: uniquePaths(profilePhotoPaths),
    profileVideoPaths: uniquePaths(profileVideoPaths),
    verificationSelfiePaths: uniquePaths(verificationSelfiePaths),
    storyPhotoPaths: uniquePaths(storyPhotoPaths),
    // Message attachments are part of the recipient's conversation copy.
    // They must remain referenced and readable after the sender deletes their
    // account, just like the message text.
    messagePhotoPaths: [],
    messageVideoPaths: [],
    messageAudioPaths: [],
  };
}

async function renewAccountDeletionClaim(
  supabase: AccountDeletionCleanupClient,
  request: AccountDeletionRequest,
) {
  const { data, error } = await supabase.rpc("renew_account_deletion_claim", {
    p_request_id: request.id,
    p_processing_token: request.processing_token,
  });

  if (error) {
    throw new Error(error.message);
  }

  if (!data || String(data) !== request.profile_id) {
    throw new LostAccountDeletionClaimError("Account deletion claim was lost.");
  }
}

type RemoveStorageFiles = (
  supabase: ImageStorageClient,
  paths: string[],
) => Promise<{ error: { message: string } | null }>;

async function removeStoragePaths({
  supabase,
  request,
  paths,
  remove,
}: {
  supabase: AccountDeletionCleanupClient;
  request: AccountDeletionRequest;
  paths: string[];
  remove: RemoveStorageFiles;
}) {
  const chunkSize = 100;
  let removed = 0;

  for (let index = 0; index < paths.length; index += chunkSize) {
    const chunk = paths.slice(index, index + chunkSize);
    await renewAccountDeletionClaim(supabase, request);

    const { error } = await remove(supabase, chunk);

    if (error) {
      throw new Error(error.message);
    }

    removed += chunk.length;
  }

  return removed;
}

function parseCleanupStorageManifest(
  value: unknown,
): CleanupStorageManifest | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  const manifest = value as Record<string, unknown>;
  const requiredKeys = [
    "profilePhotoPaths",
    "profileVideoPaths",
    "storyPhotoPaths",
    "messagePhotoPaths",
    "messageVideoPaths",
    "messageAudioPaths",
  ] as const;

  if (!requiredKeys.every((key) => Array.isArray(manifest[key]))) {
    return null;
  }

  if (
    manifest.verificationSelfiePaths !== undefined &&
    !Array.isArray(manifest.verificationSelfiePaths)
  ) {
    return null;
  }

  return {
    profilePhotoPaths: uniquePaths(manifest.profilePhotoPaths as unknown[]),
    profileVideoPaths: uniquePaths(manifest.profileVideoPaths as unknown[]),
    verificationSelfiePaths: uniquePaths(
      (manifest.verificationSelfiePaths as unknown[] | undefined) ?? [],
    ),
    storyPhotoPaths: uniquePaths(manifest.storyPhotoPaths as unknown[]),
    messagePhotoPaths: uniquePaths(manifest.messagePhotoPaths as unknown[]),
    messageVideoPaths: uniquePaths(manifest.messageVideoPaths as unknown[]),
    messageAudioPaths: uniquePaths(manifest.messageAudioPaths as unknown[]),
  };
}

function uniquePaths(paths: unknown[]) {
  return [
    ...new Set(
      paths.filter(
        (path): path is string => typeof path === "string" && path.length > 0,
      ),
    ),
  ];
}

async function listProfilePhotoPaths(
  supabase: AccountDeletionCleanupClient,
  profileId: string,
) {
  const data = await loadAllPages<StoragePathRow>((from, to) =>
    supabase
      .from("profile_photos")
      .select("storage_path")
      .eq("profile_id", profileId)
      .order("id", { ascending: true })
      .range(from, to),
  );

  return compactPaths(data, "storage_path");
}

async function listStoryPhotoPaths(
  supabase: AccountDeletionCleanupClient,
  profileId: string,
) {
  const data = await loadAllPages<StoragePathRow>((from, to) =>
    supabase
      .from("profile_stories")
      .select("storage_path")
      .eq("profile_id", profileId)
      .order("id", { ascending: true })
      .range(from, to),
  );

  return compactPaths(data, "storage_path");
}

async function listProfileVideoPaths(
  supabase: AccountDeletionCleanupClient,
  profileId: string,
) {
  const data = await loadAllPages<StoragePathRow>((from, to) =>
    supabase
      .from("profile_videos")
      .select("storage_path")
      .eq("profile_id", profileId)
      .order("id", { ascending: true })
      .range(from, to),
  );

  return compactPaths(data, "storage_path");
}

async function listVerificationSelfiePaths(
  supabase: AccountDeletionCleanupClient,
  profileId: string,
) {
  const data = await loadAllPages<{ selfie_path?: string | null }>((from, to) =>
    supabase
      .from("profile_verification_requests")
      .select("selfie_path")
      .eq("profile_id", profileId)
      .order("id", { ascending: true })
      .range(from, to),
  );

  return data
    .map((row) => row.selfie_path)
    .filter((path): path is string => Boolean(path));
}

async function loadAllPages<T>(
  loadPage: (
    from: number,
    to: number,
  ) => PromiseLike<{
    data: T[] | null;
    error: { message: string } | null;
  }>,
) {
  const rows: T[] = [];

  for (let from = 0; ; from += POSTGREST_PAGE_SIZE) {
    const { data, error } = await loadPage(
      from,
      from + POSTGREST_PAGE_SIZE - 1,
    );

    if (error) {
      throw new Error(error.message);
    }

    const page = data ?? [];
    rows.push(...page);

    if (page.length < POSTGREST_PAGE_SIZE) {
      return rows;
    }
  }
}

function compactPaths(
  rows: StoragePathRow[],
  key: "storage_path" | "image_path" | "video_path" | "audio_path",
) {
  return rows
    .map((row) => row[key])
    .filter((path): path is string => Boolean(path));
}
