import { expect, test } from "@playwright/test";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  filterBlockedProfilesForViewer,
  isProfilePairBlocked,
} from "../../lib/profile/blocks";

type RpcHandler = (
  functionName: string,
  params?: Record<string, unknown>,
) => Promise<{ data: unknown; error: { message: string } | null }>;

function createRpcClient(handler: RpcHandler) {
  return { rpc: handler } as unknown as SupabaseClient;
}

test.describe("profile block privacy fallbacks", () => {
  test("treats returned and thrown lookup errors as blocked", async () => {
    const returnedErrorClient = createRpcClient(async () => ({
      data: null,
      error: { message: "lookup unavailable" },
    }));
    const thrownErrorClient = createRpcClient(async () => {
      throw new Error("network unavailable");
    });

    await expect(
      isProfilePairBlocked(returnedErrorClient, "viewer", "candidate"),
    ).resolves.toBe(true);
    await expect(
      isProfilePairBlocked(thrownErrorClient, "viewer", "candidate"),
    ).resolves.toBe(true);
  });

  test("excludes candidates whose status cannot be recovered after a batch error", async () => {
    const client = createRpcClient(async (functionName, params) => {
      if (functionName === "get_blocked_profile_ids") {
        return {
          data: null,
          error: { message: "batch lookup unavailable" },
        };
      }

      const candidateId = params?.p_second_profile_id;

      if (candidateId === "allowed") {
        return { data: false, error: null };
      }

      if (candidateId === "blocked") {
        return { data: true, error: null };
      }

      throw new Error("single lookup unavailable");
    });

    const visibleProfiles = await filterBlockedProfilesForViewer(
      client,
      "viewer",
      [{ id: "allowed" }, { id: "blocked" }, { id: "unavailable" }],
    );

    expect(visibleProfiles).toEqual([{ id: "allowed" }]);
  });
});
