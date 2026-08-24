import { readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "@playwright/test";
import { drainMessageDigestBatches } from "../../lib/email/message-digest-drain";

test("message digest cron slots stay Hobby-compatible and cover the day", () => {
  const config = JSON.parse(
    readFileSync(join(process.cwd(), "vercel.json"), "utf8"),
  ) as {
    crons: Array<{ path: string; schedule: string }>;
  };
  const digestCrons = config.crons.filter(({ path }) =>
    path.startsWith("/api/maintenance/send-message-digests?window="),
  );

  expect(digestCrons).toHaveLength(6);
  expect(digestCrons.map(({ path }) => path)).toEqual([
    "/api/maintenance/send-message-digests?window=asia",
    "/api/maintenance/send-message-digests?window=eu-summer",
    "/api/maintenance/send-message-digests?window=eu-early",
    "/api/maintenance/send-message-digests?window=eu-winter",
    "/api/maintenance/send-message-digests?window=us-summer",
    "/api/maintenance/send-message-digests?window=us-winter",
  ]);
  expect(digestCrons.map(({ schedule }) => schedule)).toEqual([
    "17 1 * * *",
    "17 6 * * *",
    "17 7 * * *",
    "17 8 * * *",
    "17 12 * * *",
    "17 13 * * *",
  ]);

  for (const { schedule } of digestCrons) {
    const [, , dayOfMonth, month, dayOfWeek] = schedule.split(" ");

    expect([dayOfMonth, month, dayOfWeek]).toEqual(["*", "*", "*"]);
    expect(schedule).not.toContain("*/");
  }
});

test("bounded digest drain processes a backlog larger than 25 once", async () => {
  const queued = Array.from({ length: 37 }, (_, index) => `delivery-${index}`);
  const processed = new Set<string>();

  const result = await drainMessageDigestBatches({
    batchSize: 10,
    maxBatches: 10,
    minimumBatchBudgetMs: 100,
    timeBudgetMs: 1_000,
    now: () => 0,
    runBatch: async () => {
      const batch = queued.splice(0, 10);

      for (const deliveryId of batch) {
        expect(processed.has(deliveryId)).toBe(false);
        processed.add(deliveryId);
      }

      return {
        checked: batch.length,
        sent: batch.length,
        suppressed: 0,
        retryableFailures: 0,
      };
    },
  });

  expect(result).toEqual({
    batches: 4,
    checked: 37,
    drained: true,
    retryableFailures: 0,
    sent: 37,
    stopReason: "drained",
    suppressed: 0,
  });
  expect(processed.size).toBe(37);
  expect(queued).toHaveLength(0);
});

test("bounded digest drain stops before another batch can exceed its budget", async () => {
  let currentTime = 0;
  let batchCalls = 0;

  const result = await drainMessageDigestBatches({
    batchSize: 10,
    maxBatches: 10,
    minimumBatchBudgetMs: 180,
    timeBudgetMs: 240,
    now: () => currentTime,
    runBatch: async () => {
      batchCalls += 1;
      currentTime += 70;

      return {
        checked: 10,
        sent: 10,
        suppressed: 0,
        retryableFailures: 0,
      };
    },
  });

  expect(batchCalls).toBe(1);
  expect(result).toMatchObject({
    batches: 1,
    checked: 10,
    drained: false,
    sent: 10,
    stopReason: "time_budget",
  });
});

test("bounded digest drain does not reclaim a retryable delivery in one run", async () => {
  let batchCalls = 0;

  const result = await drainMessageDigestBatches({
    batchSize: 10,
    maxBatches: 10,
    minimumBatchBudgetMs: 100,
    timeBudgetMs: 1_000,
    now: () => 0,
    runBatch: async () => {
      batchCalls += 1;

      return {
        checked: 10,
        sent: 9,
        suppressed: 0,
        retryableFailures: 1,
      };
    },
  });

  expect(batchCalls).toBe(1);
  expect(result).toMatchObject({
    batches: 1,
    drained: false,
    retryableFailures: 1,
    stopReason: "retryable_failure",
  });
});
