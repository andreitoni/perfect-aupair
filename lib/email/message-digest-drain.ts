export type MessageDigestBatchResult = {
  checked: number;
  sent: number;
  suppressed: number;
  retryableFailures: number;
};

export type MessageDigestDrainStopReason =
  | "batch_limit"
  | "drained"
  | "retryable_failure"
  | "time_budget";

export type MessageDigestDrainResult = MessageDigestBatchResult & {
  batches: number;
  drained: boolean;
  stopReason: MessageDigestDrainStopReason;
};

export async function drainMessageDigestBatches({
  batchSize,
  maxBatches,
  minimumBatchBudgetMs,
  runBatch,
  timeBudgetMs,
  now = Date.now,
}: {
  batchSize: number;
  maxBatches: number;
  minimumBatchBudgetMs: number;
  runBatch: () => Promise<MessageDigestBatchResult>;
  timeBudgetMs: number;
  now?: () => number;
}): Promise<MessageDigestDrainResult> {
  const safeBatchSize = Math.max(1, Math.trunc(batchSize));
  const safeMaxBatches = Math.max(1, Math.trunc(maxBatches));
  const safeTimeBudgetMs = Math.max(1, Math.trunc(timeBudgetMs));
  const safeMinimumBatchBudgetMs = Math.max(
    0,
    Math.min(Math.trunc(minimumBatchBudgetMs), safeTimeBudgetMs),
  );
  const startedAt = now();
  const totals: MessageDigestBatchResult = {
    checked: 0,
    sent: 0,
    suppressed: 0,
    retryableFailures: 0,
  };
  let batches = 0;

  while (batches < safeMaxBatches) {
    const elapsedMs = Math.max(0, now() - startedAt);

    if (safeTimeBudgetMs - elapsedMs < safeMinimumBatchBudgetMs) {
      return {
        ...totals,
        batches,
        drained: false,
        stopReason: "time_budget",
      };
    }

    const batch = await runBatch();
    batches += 1;
    totals.checked += batch.checked;
    totals.sent += batch.sent;
    totals.suppressed += batch.suppressed;
    totals.retryableFailures += batch.retryableFailures;

    // A released retryable claim can be selected by the next RPC immediately.
    // Stop this invocation so the next scheduled slot performs the retry once,
    // while the delivery id keeps the external email send idempotent.
    if (batch.retryableFailures > 0) {
      return {
        ...totals,
        batches,
        drained: false,
        stopReason: "retryable_failure",
      };
    }

    if (batch.checked < safeBatchSize) {
      return {
        ...totals,
        batches,
        drained: true,
        stopReason: "drained",
      };
    }
  }

  return {
    ...totals,
    batches,
    drained: false,
    stopReason: "batch_limit",
  };
}
