"use client";

import { useState, useTransition } from "react";
import type { ReactNode } from "react";
import { useRouter } from "next/navigation";
import { createPortal } from "react-dom";
import { useTranslations } from "@/components/i18n/I18nProvider";
import { createClient } from "@/lib/supabase/client";
import {
  isReblockCooldownActive,
  REBLOCK_COOLDOWN_MS,
} from "@/lib/profile/block-cooldown";

type BlockActionResult = {
  ok: boolean;
  error?: string;
  errorCode?: "block_cooldown";
  retryAt?: string;
  isConversationBlocked?: boolean;
};

type BlockProfileButtonProps = {
  conversationId: string;
  label: string;
  blockedProfileId?: string | null;
  confirmButtonLabel: string;
  confirmLabel: string;
  confirmBody?: string;
  cancelLabel: string;
  action: (formData: FormData) => Promise<BlockActionResult>;
  variant?: "block" | "unblock";
  blockCooldownUntil?: string | null;
  onSuccess?: (state: {
    viewerBlockedOtherProfile: boolean;
    isConversationBlocked?: boolean;
    blockCooldownUntil: string | null;
  }) => void;
  onDialogClose?: () => void;
  buttonClassName?: string;
  children?: ReactNode;
};

export function BlockProfileButton({
  conversationId,
  label,
  blockedProfileId,
  confirmButtonLabel,
  confirmLabel,
  confirmBody,
  cancelLabel,
  action,
  variant = "block",
  blockCooldownUntil,
  onSuccess,
  onDialogClose,
  buttonClassName,
  children,
}: BlockProfileButtonProps) {
  const t = useTranslations();
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);
  const [error, setError] = useState("");
  const [serverCooldownUntil, setServerCooldownUntil] = useState<string | null>(
    null,
  );
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isActionPending, startTransition] = useTransition();
  const isBlock = variant === "block";
  const effectiveCooldownUntil = serverCooldownUntil ?? blockCooldownUntil;
  const hasBlockCooldown =
    isBlock && isReblockCooldownActive(effectiveCooldownUntil);
  const isBusy = isSubmitting || isActionPending;
  const busyLabel = isBlock ? t("common.blocking") : t("common.unblocking");

  function getBlockCooldownError() {
    return t("messages.blockCooldown");
  }

  function closeDialog() {
    setIsOpen(false);
    onDialogClose?.();
  }

  async function runClientBlockAction(): Promise<BlockActionResult | null> {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return { ok: false, error: t("common.errorTryAgain") };
    }

    let targetProfileId = blockedProfileId ?? null;

    if (!targetProfileId) {
      const { data: conversation, error: conversationError } = await supabase
        .from("conversations")
        .select("family_id, au_pair_id")
        .eq("id", conversationId)
        .single<{
          family_id: string;
          au_pair_id: string;
        }>();

      if (conversationError || !conversation) {
        return null;
      }

      if (user.id === conversation.family_id) {
        targetProfileId = conversation.au_pair_id;
      } else if (user.id === conversation.au_pair_id) {
        targetProfileId = conversation.family_id;
      }
    }

    if (!targetProfileId) {
      return null;
    }

    if (isBlock) {
      const { data, error: blockError } = await supabase.rpc("block_profile", {
        p_blocked_profile_id: targetProfileId,
      });
      const blockResult = data as {
        ok?: boolean;
        error_code?: string | null;
        retry_at?: string | null;
      } | null;

      if (blockError) {
        return { ok: false, error: blockError.message };
      }

      if (blockResult?.error_code === "block_cooldown") {
        return {
          ok: false,
          errorCode: "block_cooldown",
          retryAt: blockResult.retry_at ?? undefined,
        };
      }

      if (blockResult?.ok === false) {
        return { ok: false, error: t("common.errorTryAgain") };
      }

      return { ok: true, isConversationBlocked: true };
    }

    const { data: unblockData, error: unblockError } = await supabase.rpc(
      "unblock_profile",
      {
        p_blocked_profile_id: targetProfileId,
      },
    );
    const unblockResult = unblockData as {
      ok?: boolean;
      error_code?: string | null;
    } | null;

    if (unblockError) {
      return { ok: false, error: unblockError.message };
    }

    if (
      unblockResult?.ok === false &&
      unblockResult.error_code === "moderation_separation"
    ) {
      return {
        ok: false,
        error: t("messages.moderationSeparation"),
      };
    }

    if (unblockResult?.ok === false) {
      return { ok: false, error: t("common.errorTryAgain") };
    }

    const { data: isConversationBlocked, error: blockStatusError } =
      await supabase.rpc("profile_pair_blocked", {
        p_first_profile_id: user.id,
        p_second_profile_id: targetProfileId,
      });

    if (blockStatusError) {
      return { ok: false, error: blockStatusError.message };
    }

    return {
      ok: true,
      isConversationBlocked: Boolean(isConversationBlocked),
    };
  }

  async function runServerBlockAction(formData: FormData) {
    return await new Promise<BlockActionResult>((resolve, reject) => {
      startTransition(() => {
        void action(formData).then(resolve, reject);
      });
    });
  }

  async function handleConfirm() {
    if (hasBlockCooldown) {
      setError(getBlockCooldownError());
      return;
    }

    setError("");
    setIsSubmitting(true);

    try {
      const formData = new FormData();
      formData.set("conversation_id", conversationId);

      const result =
        (await runClientBlockAction()) ?? (await runServerBlockAction(formData));

      if (!result.ok) {
        if (result.errorCode === "block_cooldown") {
          setServerCooldownUntil(result.retryAt ?? blockCooldownUntil ?? null);
        }

        setError(
          result.errorCode === "block_cooldown"
            ? t("messages.blockCooldown")
            : result.error ?? t("common.errorTryAgain"),
        );
        return;
      }

      onSuccess?.(
        isBlock
          ? {
              viewerBlockedOtherProfile: true,
              isConversationBlocked: result.isConversationBlocked ?? true,
              blockCooldownUntil: null,
            }
          : {
              viewerBlockedOtherProfile: false,
              isConversationBlocked: result.isConversationBlocked ?? false,
              blockCooldownUntil: new Date(
                Date.now() + REBLOCK_COOLDOWN_MS,
              ).toISOString(),
            },
      );
      closeDialog();
      router.replace(
        `/messages?conversation=${encodeURIComponent(conversationId)}`,
      );
      router.refresh();
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setError(hasBlockCooldown ? getBlockCooldownError() : "");
          setIsOpen(true);
        }}
        className={
          buttonClassName ??
          (isBlock
            ? "inline-flex w-fit items-center justify-center rounded-full bg-[#fff5f2] px-4 py-2 text-sm font-black text-[#d95f49] ring-1 ring-[#f4c7bc] transition hover:bg-[#ffece7]"
            : "inline-flex w-fit items-center justify-center rounded-full bg-[#eef4f5] px-4 py-2 text-sm font-black text-[#25302d] transition hover:bg-[#dfeaec]")
        }
      >
        {children ?? label}
      </button>

      {isOpen && typeof document !== "undefined"
        ? createPortal(
            <div
              data-profile-block-dialog="true"
              className="fixed inset-0 z-[110000] flex items-center justify-center bg-[#101312]/62 px-5 py-8 backdrop-blur-[1px]"
              onClick={(event) => {
                if (event.target === event.currentTarget && !isBusy) {
                  closeDialog();
                }
              }}
            >
              <div
                role="dialog"
                aria-modal="true"
                className="w-full max-w-[390px] rounded-[2rem] bg-white px-6 py-7 text-[#25302d] shadow-2xl sm:max-w-[440px] sm:px-8 sm:py-8"
              >
                <p className="text-xs font-black uppercase tracking-[0.28em] text-[#6f8793]">
                  {label}
                </p>
                <h2 className="mt-4 text-2xl font-black tracking-[-0.04em]">
                  {confirmLabel}
                </h2>
                {confirmBody ? (
                  <p className="mt-4 text-sm font-semibold leading-6 text-[#25302d]/58">
                    {confirmBody}
                  </p>
                ) : null}

                {error ? (
                  <div className="mt-5 rounded-2xl border border-[#d95f49]/20 bg-[#fff5f2] p-3 text-sm font-semibold text-[#9d3f2f]">
                    {error}
                  </div>
                ) : null}

                <div className="mt-7 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
                  <button
                    type="button"
                    onClick={closeDialog}
                    disabled={isBusy}
                    className="inline-flex h-12 items-center justify-center rounded-full bg-white px-5 text-sm font-black text-[#25302d] ring-1 ring-black/10 transition hover:bg-[var(--background)] disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {cancelLabel}
                  </button>
                  <button
                    type="button"
                    onClick={handleConfirm}
                    disabled={isBusy || hasBlockCooldown}
                    className={
                      isBlock
                        ? hasBlockCooldown
                          ? "inline-flex h-12 items-center justify-center gap-2 rounded-full bg-[#f0f1f2] px-5 text-sm font-black text-[#25302d]/40 ring-1 ring-black/10 transition disabled:cursor-not-allowed"
                          : "inline-flex h-12 items-center justify-center gap-2 rounded-full bg-[#fff5f2] px-5 text-sm font-black text-[#d95f49] ring-1 ring-[#f4c7bc] transition hover:bg-[#ffece7] disabled:cursor-not-allowed disabled:opacity-50"
                        : "inline-flex h-12 items-center justify-center gap-2 rounded-full bg-[var(--pa-primary)] px-5 text-sm font-black text-[var(--pa-primary-ink)] transition hover:bg-[var(--pa-primary-hover)] disabled:cursor-not-allowed disabled:opacity-50"
                    }
                  >
                    {isBusy ? (
                      <span
                        aria-hidden="true"
                        className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent"
                      />
                    ) : null}
                    {isBusy ? busyLabel : confirmButtonLabel}
                  </button>
                </div>
              </div>
            </div>,
            document.body,
          )
        : null}
    </>
  );
}
