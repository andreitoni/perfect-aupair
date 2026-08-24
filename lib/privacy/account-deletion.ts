export const ACCOUNT_DELETION_GRACE_PERIOD_DAYS = 7;
export const ACCOUNT_DELETION_CONFIRMATION_EMAIL_COOLDOWN_DAYS = 7;
export const ACCOUNT_DELETION_REMINDER_LEAD_HOURS = 24;

export type AccountDeletionRequestRpcResult = {
  request_id: string;
  public_slug: string | null;
  should_send_confirmation_email: boolean;
};

export type AccountDeletionCancellationRpcResult = {
  public_slug: string | null;
};

export function getScheduledAccountDeletionDate(requestedAt: Date) {
  return new Date(
    requestedAt.getTime() +
      ACCOUNT_DELETION_GRACE_PERIOD_DAYS * 24 * 60 * 60 * 1000,
  );
}

export function getAccountDeletionConfirmationEmailCutoff(now: Date) {
  return new Date(
    now.getTime() -
      ACCOUNT_DELETION_CONFIRMATION_EMAIL_COOLDOWN_DAYS * 24 * 60 * 60 * 1000,
  );
}
