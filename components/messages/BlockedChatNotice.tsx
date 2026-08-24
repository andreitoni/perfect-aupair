"use client";

import { BlockProfileButton } from "@/components/messages/BlockProfileButton";
import { UnblockIcon } from "@/components/messages/MessageActionIcons";

type ActionResult = {
  ok: boolean;
  error?: string;
  errorCode?: "block_cooldown";
  retryAt?: string;
  isConversationBlocked?: boolean;
};

type BlockedChatNoticeProps = {
  conversationId: string;
  blockedProfileId?: string | null;
  canUnblock: boolean;
  labels: {
    title: string;
    body: string;
    unblock: string;
    unblockConfirm: string;
    unblockConfirmBody: string;
    unblockConfirmButton: string;
    cancel: string;
  };
  unblockAction: (formData: FormData) => Promise<ActionResult>;
  onUnblockSuccess?: (state: {
    viewerBlockedOtherProfile: boolean;
    isConversationBlocked?: boolean;
    blockCooldownUntil: string | null;
  }) => void;
};

export function BlockedChatNotice({
  conversationId,
  blockedProfileId,
  canUnblock,
  labels,
  unblockAction,
  onUnblockSuccess,
}: BlockedChatNoticeProps) {
  return (
    <div className="border-t border-black/10 bg-white p-3 sm:p-5">
      <div className="rounded-[1.5rem] bg-[var(--background)] px-4 py-5 text-center ring-1 ring-black/5 sm:px-6">
        <p className="text-sm font-black text-[#25302d]">{labels.title}</p>
        <p className="mx-auto mt-1 max-w-3xl text-sm font-semibold leading-6 text-[#25302d]/55">
          {labels.body}
        </p>

        {canUnblock ? (
          <BlockProfileButton
            conversationId={conversationId}
            blockedProfileId={blockedProfileId}
            label={labels.unblock}
            confirmButtonLabel={labels.unblockConfirmButton}
            confirmLabel={labels.unblockConfirm}
            confirmBody={labels.unblockConfirmBody}
            cancelLabel={labels.cancel}
            action={unblockAction}
            variant="unblock"
            onSuccess={onUnblockSuccess}
            buttonClassName="mx-auto mt-4 inline-flex h-11 items-center justify-center gap-2 rounded-full bg-[var(--pa-primary)] px-5 text-sm font-black text-[var(--pa-primary-ink)] transition hover:bg-[var(--pa-primary-hover)]"
          >
            <UnblockIcon className="h-5 w-5" />
            <span>{labels.unblock}</span>
          </BlockProfileButton>
        ) : null}
      </div>
    </div>
  );
}
