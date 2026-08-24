export const REBLOCK_COOLDOWN_HOURS = 48;
export const REBLOCK_COOLDOWN_MS = REBLOCK_COOLDOWN_HOURS * 60 * 60 * 1000;

export function getReblockCooldownCutoff(now = Date.now()) {
  return new Date(now - REBLOCK_COOLDOWN_MS).toISOString();
}

export function getReblockRetryAt(unblockedAt: string) {
  const unblockedAtMs = new Date(unblockedAt).getTime();

  if (!Number.isFinite(unblockedAtMs)) {
    return null;
  }

  return new Date(unblockedAtMs + REBLOCK_COOLDOWN_MS).toISOString();
}

export function isReblockCooldownActive(
  retryAt: string | null | undefined,
  now = Date.now(),
) {
  if (!retryAt) return false;

  const retryAtMs = new Date(retryAt).getTime();

  return Number.isFinite(retryAtMs) && retryAtMs > now;
}
