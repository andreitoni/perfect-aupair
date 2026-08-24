"use client";

import {
  useEffect,
  useRef,
  useState,
  useTransition,
  type FormEvent,
} from "react";
import { useRouter } from "next/navigation";
import { createPortal } from "react-dom";
import { useTranslations } from "@/components/i18n/I18nProvider";
import { BlockProfileButton } from "@/components/messages/BlockProfileButton";
import {
  BlockIcon,
  DeleteChatIcon,
  MoreIcon,
  ReportIcon,
  UnblockIcon,
} from "@/components/messages/MessageActionIcons";

type ActionResult = {
  ok: boolean;
  error?: string;
  errorCode?: "block_cooldown";
  retryAt?: string;
  isConversationBlocked?: boolean;
};

export type ConversationActionLabels = {
  moreActions: string;
  deleteChat: string;
  deleteChatConfirm: string;
  report: string;
  block: string;
  unblock: string;
  blockConfirm: string;
  unblockConfirm: string;
  unblockConfirmBody: string;
  blockConfirmButton: string;
  unblockConfirmButton: string;
  cancel: string;
  close: string;
  reportIntro: string;
  reportCategory: string;
  reportChooseCategory: string;
  reportCategoryFake: string;
  reportCategoryInappropriate: string;
  reportCategorySpam: string;
  reportCategoryHarassment: string;
  reportCategoryPrivacy: string;
  reportCategoryOther: string;
  reportReason: string;
  reportChooseReason: string;
  reportReasonFake: string;
  reportReasonInappropriate: string;
  reportReasonSpam: string;
  reportReasonHarassment: string;
  reportReasonOther: string;
  reportDetails: string;
  reportDetailsPlaceholder: string;
  reportSend: string;
  reportSent: string;
  reportSentText: string;
};

type ConversationHeaderActionsProps = {
  conversationId: string;
  otherProfileId?: string | null;
  returnTo: string;
  isBlockedByViewer: boolean;
  actionsDisabled?: boolean;
  reportDisabled?: boolean;
  blockCooldownUntil?: string | null;
  labels: ConversationActionLabels;
  deleteAction: (formData: FormData) => void | Promise<void>;
  blockAction: (formData: FormData) => Promise<ActionResult>;
  unblockAction: (formData: FormData) => Promise<ActionResult>;
  reportAction: (formData: FormData) => Promise<ActionResult>;
  onBlockStateChange?: (state: {
    viewerBlockedOtherProfile: boolean;
    isConversationBlocked?: boolean;
    blockCooldownUntil: string | null;
  }) => void;
  onMenuOpenChange?: (open: boolean) => void;
  onDeleteSuccess?: (conversationId: string) => void;
  redirectToMessagesAfterDelete?: boolean;
  buttonClassName?: string;
  iconClassName?: string;
};

const menuItemClass =
  "flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-black text-[#25302d] transition hover:bg-[var(--background)]";
const disabledMenuItemClass =
  "flex w-full cursor-not-allowed items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-black text-[#25302d]/30";

function CloseButton({
  label,
  onClick,
  disabled = false,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      className="flex h-10 w-10 items-center justify-center rounded-full bg-[#e2e5e9] text-2xl font-semibold leading-none text-[#25302d]/70 transition hover:bg-[#d8dce1] disabled:cursor-not-allowed disabled:opacity-50"
    >
      ×
    </button>
  );
}

function DeleteChatDialog({
  conversationId,
  open,
  labels,
  deleteAction,
  redirectToMessagesAfterDelete,
  onDeleteSuccess,
  onClose,
}: {
  conversationId: string;
  open: boolean;
  labels: ConversationActionLabels;
  deleteAction: (formData: FormData) => void | Promise<void>;
  redirectToMessagesAfterDelete: boolean;
  onDeleteSuccess?: (conversationId: string) => void;
  onClose: () => void;
}) {
  const t = useTranslations();
  const router = useRouter();
  const [isDeleting, setIsDeleting] = useState(false);
  const [isPending, startTransition] = useTransition();
  const isBusy = isDeleting || isPending;

  useEffect(() => {
    if (!open) {
      return;
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape" || event.defaultPrevented || isBusy) {
        return;
      }

      event.preventDefault();
      onClose();
    }

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isBusy, onClose, open]);

  if (!open || typeof document === "undefined") return null;

  function handleDelete() {
    if (isBusy) return;

    setIsDeleting(true);

    startTransition(async () => {
      try {
        const formData = new FormData();
        formData.set("conversation_id", conversationId);

        if (redirectToMessagesAfterDelete) {
          formData.set("redirect_to", "/messages");
        }

        await deleteAction(formData);
        onDeleteSuccess?.(conversationId);
        onClose();
        router.refresh();
      } finally {
        setIsDeleting(false);
      }
    });
  }

  return createPortal(
    <div
      className="fixed inset-0 z-[110000] flex items-center justify-center bg-[#101312]/55 px-4 py-8 backdrop-blur-[1px]"
      onClick={(event) => {
        if (event.target === event.currentTarget && !isBusy) {
          onClose();
        }
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        className="w-full max-w-xl overflow-hidden rounded-[1.5rem] bg-white text-[#25302d] shadow-2xl"
      >
        <div className="relative border-b border-black/10 px-6 py-5 text-center">
          <h2 className="px-12 text-xl font-black sm:text-2xl">
            {labels.deleteChat}
          </h2>
          <div className="absolute right-5 top-4">
            <CloseButton
              label={labels.close}
              onClick={onClose}
              disabled={isBusy}
            />
          </div>
        </div>

        <div className="px-6 py-5">
          <p className="text-base font-semibold leading-7 text-[#25302d]/72">
            {labels.deleteChatConfirm}
          </p>
        </div>

        <div className="flex flex-col-reverse gap-3 px-6 pb-6 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={onClose}
            disabled={isBusy}
            className="inline-flex h-11 items-center justify-center rounded-full bg-white px-5 text-sm font-black text-[#25302d] ring-1 ring-black/10 transition hover:bg-[var(--background)] disabled:cursor-not-allowed disabled:opacity-50 sm:min-w-[112px]"
          >
            {labels.cancel}
          </button>
          <button
            type="button"
            onClick={handleDelete}
            disabled={isBusy}
            aria-busy={isBusy || undefined}
            className="inline-flex h-11 items-center justify-center gap-2 rounded-full bg-[#d95f49] px-5 text-sm font-black text-white transition hover:bg-[#c9513e] disabled:cursor-not-allowed disabled:opacity-75 sm:min-w-[132px]"
          >
            {isBusy ? (
              <span
                aria-hidden="true"
                className="h-4 w-4 animate-spin rounded-full border-2 border-white/35 border-t-white"
              />
            ) : null}
            <span>{isBusy ? t("common.deleting") : labels.deleteChat}</span>
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

function ReportProfileDialog({
  otherProfileId,
  returnTo,
  open,
  labels,
  reportAction,
  onClose,
}: {
  otherProfileId: string | null | undefined;
  returnTo: string;
  open: boolean;
  labels: ConversationActionLabels;
  reportAction: (formData: FormData) => Promise<ActionResult>;
  onClose: () => void;
}) {
  const [error, setError] = useState("");
  const [sent, setSent] = useState(false);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    if (!open || !otherProfileId) {
      return;
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape" || event.defaultPrevented) {
        return;
      }

      event.preventDefault();
      onClose();
    }

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [onClose, open, otherProfileId]);

  if (!open || !otherProfileId || typeof document === "undefined") return null;

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");

    const formData = new FormData(event.currentTarget);

    startTransition(async () => {
      const result = await reportAction(formData);

      if (!result.ok) {
        setError(result.error ?? "");
        return;
      }

      setSent(true);
    });
  }

  return createPortal(
    <div
      className="fixed inset-0 z-[110000] flex items-center justify-center bg-[#101312]/55 px-4 py-8 backdrop-blur-[1px]"
      onClick={(event) => {
        if (event.target === event.currentTarget && !isPending) {
          onClose();
        }
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        className="max-h-[88vh] w-full max-w-xl overflow-hidden rounded-[1.5rem] bg-white text-[#25302d] shadow-2xl"
      >
        <div className="relative border-b border-black/10 px-6 py-5 text-center">
          <h2 className="text-2xl font-black tracking-[-0.04em]">
            {sent ? labels.reportSent : labels.report}
          </h2>
          <div className="absolute right-5 top-4">
            <CloseButton
              label={labels.close}
              onClick={onClose}
              disabled={isPending}
            />
          </div>
        </div>

        {sent ? (
          <div className="p-6">
            <p className="text-sm font-semibold leading-6 text-[#25302d]/62">
              {labels.reportSentText}
            </p>
            <button
              type="button"
              onClick={onClose}
              className="mt-6 inline-flex h-11 w-full items-center justify-center rounded-full bg-[var(--pa-primary)] px-5 text-sm font-black text-[var(--pa-primary-ink)] transition hover:bg-[var(--pa-primary-hover)]"
            >
              {labels.close}
            </button>
          </div>
        ) : (
          <form
            onSubmit={handleSubmit}
            className="max-h-[calc(88vh-78px)] touch-pan-y overflow-y-auto overscroll-y-contain p-6"
          >
            <input type="hidden" name="type" value="profile" />
            <input type="hidden" name="id" value={otherProfileId} />
            <input type="hidden" name="returnTo" value={returnTo} />

            <p className="text-sm font-semibold leading-6 text-[#25302d]/58">
              {labels.reportIntro}
            </p>

            <div className="mt-5 space-y-4">
              <div>
                <label
                  htmlFor={`${conversationIdSafe(otherProfileId)}-category`}
                  className="mb-2 block text-sm font-bold"
                >
                  {labels.reportCategory}
                </label>
                <select
                  id={`${conversationIdSafe(otherProfileId)}-category`}
                  name="category"
                  required
                  defaultValue=""
                  className="w-full rounded-2xl border border-black/10 bg-[var(--background)] px-4 py-3 text-base font-semibold outline-none transition focus:border-[#6f8793] focus:bg-white sm:text-sm"
                >
                  <option value="" disabled>
                    {labels.reportChooseCategory}
                  </option>
                  <option value="fake_profile">{labels.reportCategoryFake}</option>
                  <option value="inappropriate_content">
                    {labels.reportCategoryInappropriate}
                  </option>
                  <option value="spam_scam">{labels.reportCategorySpam}</option>
                  <option value="harassment_safety">
                    {labels.reportCategoryHarassment}
                  </option>
                  <option value="privacy">{labels.reportCategoryPrivacy}</option>
                  <option value="other">{labels.reportCategoryOther}</option>
                </select>
              </div>

              <div>
                <label
                  htmlFor={`${conversationIdSafe(otherProfileId)}-reason`}
                  className="mb-2 block text-sm font-bold"
                >
                  {labels.reportReason}
                </label>
                <select
                  id={`${conversationIdSafe(otherProfileId)}-reason`}
                  name="reason"
                  required
                  defaultValue=""
                  className="w-full rounded-2xl border border-black/10 bg-[var(--background)] px-4 py-3 text-base font-semibold outline-none transition focus:border-[#6f8793] focus:bg-white sm:text-sm"
                >
                  <option value="" disabled>
                    {labels.reportChooseReason}
                  </option>
                  <option value="Suspicious or fake profile">
                    {labels.reportReasonFake}
                  </option>
                  <option value="Inappropriate profile photo or content">
                    {labels.reportReasonInappropriate}
                  </option>
                  <option value="Spam or scam">{labels.reportReasonSpam}</option>
                  <option value="Harassment or unsafe behavior">
                    {labels.reportReasonHarassment}
                  </option>
                  <option value="Other">{labels.reportReasonOther}</option>
                </select>
              </div>

              <div>
                <label
                  htmlFor={`${conversationIdSafe(otherProfileId)}-details`}
                  className="mb-2 block text-sm font-bold"
                >
                  {labels.reportDetails}
                </label>
                <textarea
                  id={`${conversationIdSafe(otherProfileId)}-details`}
                  name="details"
                  rows={4}
                  maxLength={1200}
                  placeholder={labels.reportDetailsPlaceholder}
                  className="w-full resize-none rounded-2xl border border-black/10 bg-[var(--background)] px-4 py-3 text-base font-semibold outline-none transition placeholder:text-[#25302d]/30 focus:border-[#6f8793] focus:bg-white sm:text-sm"
                />
              </div>
            </div>

            {error ? (
              <div className="mt-5 rounded-2xl border border-[#d95f49]/20 bg-[#fff5f2] p-3 text-sm font-semibold text-[#9d3f2f]">
                {error}
              </div>
            ) : null}

            <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={onClose}
                disabled={isPending}
                className="inline-flex h-11 items-center justify-center rounded-full bg-white px-5 text-sm font-black text-[#25302d] ring-1 ring-black/10 transition hover:bg-[var(--background)] disabled:cursor-not-allowed disabled:opacity-50"
              >
                {labels.cancel}
              </button>
              <button
                type="submit"
                disabled={isPending}
                className="inline-flex h-11 items-center justify-center rounded-full bg-[var(--pa-primary)] px-5 text-sm font-black text-[var(--pa-primary-ink)] transition hover:bg-[var(--pa-primary-hover)] disabled:cursor-not-allowed disabled:opacity-50"
              >
                {labels.reportSend}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>,
    document.body,
  );
}

function conversationIdSafe(value: string) {
  return value.replace(/[^a-z0-9_-]/gi, "");
}

export function ConversationHeaderActions({
  conversationId,
  otherProfileId,
  returnTo,
  isBlockedByViewer,
  actionsDisabled = false,
  reportDisabled = false,
  blockCooldownUntil,
  labels,
  deleteAction,
  blockAction,
  unblockAction,
  reportAction,
  onBlockStateChange,
  onMenuOpenChange,
  onDeleteSuccess,
  redirectToMessagesAfterDelete = true,
  buttonClassName = "flex h-10 w-10 items-center justify-center rounded-full bg-white text-[#25302d]/55 shadow-sm ring-1 ring-black/10 transition hover:bg-[var(--background)] hover:text-[#25302d]",
  iconClassName = "h-4 w-4",
}: ConversationHeaderActionsProps) {
  const [open, setOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    function handlePointerDown(event: PointerEvent) {
      const target = event.target as Element | null;

      if (target?.closest('[data-profile-block-dialog="true"]')) {
        return;
      }

      if (!target || !menuRef.current?.contains(target)) {
        setOpen(false);
        onMenuOpenChange?.(false);
      }
    }

    if (open) {
      window.addEventListener("pointerdown", handlePointerDown);
    }

    return () => {
      window.removeEventListener("pointerdown", handlePointerDown);
    };
  }, [onMenuOpenChange, open]);

  const blockLabel = isBlockedByViewer ? labels.unblock : labels.block;
  const blockConfirmLabel = isBlockedByViewer
    ? labels.unblockConfirm
    : labels.blockConfirm;
  const blockConfirmBody = isBlockedByViewer ? labels.unblockConfirmBody : "";
  const blockConfirmButtonLabel = isBlockedByViewer
    ? labels.unblockConfirmButton
    : labels.blockConfirmButton;
  const blockActionToRun = isBlockedByViewer ? unblockAction : blockAction;
  const blockVariant = isBlockedByViewer ? "unblock" : "block";
  const BlockMenuIcon = isBlockedByViewer ? UnblockIcon : BlockIcon;
  const closeMenu = () => {
    setOpen(false);
    onMenuOpenChange?.(false);
  };

  return (
    <div
      ref={menuRef}
      data-testid="conversation-header-actions"
      data-actions-disabled={actionsDisabled ? "true" : "false"}
      data-report-disabled={reportDisabled ? "true" : "false"}
      data-block-action={blockVariant}
      className="relative"
    >
      <button
        type="button"
        aria-label={labels.moreActions}
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          const nextOpen = !open;
          setOpen(nextOpen);
          onMenuOpenChange?.(nextOpen);
        }}
        className={buttonClassName}
      >
        <MoreIcon className={iconClassName} />
      </button>

      {open ? (
        <div className="absolute right-0 z-30 mt-2 w-56 rounded-2xl bg-white p-2 shadow-xl ring-1 ring-black/10">
          {otherProfileId ? (
            actionsDisabled ? (
              <button
                type="button"
                disabled
                className={disabledMenuItemClass}
              >
                <BlockMenuIcon className="h-5 w-5 shrink-0" />
                <span>{blockLabel}</span>
              </button>
            ) : (
              <BlockProfileButton
                conversationId={conversationId}
                blockedProfileId={otherProfileId}
                label={blockLabel}
                confirmButtonLabel={blockConfirmButtonLabel}
                confirmLabel={blockConfirmLabel}
                confirmBody={blockConfirmBody}
                cancelLabel={labels.cancel}
                action={blockActionToRun}
                variant={blockVariant}
                blockCooldownUntil={
                  blockVariant === "block" ? blockCooldownUntil : null
                }
                onSuccess={onBlockStateChange}
                onDialogClose={closeMenu}
                buttonClassName={menuItemClass}
              >
                <BlockMenuIcon className="h-5 w-5 shrink-0" />
                <span>{blockLabel}</span>
              </BlockProfileButton>
            )
          ) : null}

          <button
            type="button"
            onClick={() => {
              setOpen(false);
              onMenuOpenChange?.(false);
              setDeleteOpen(true);
            }}
            className={menuItemClass}
          >
            <DeleteChatIcon className="h-5 w-5 shrink-0" />
            <span>{labels.deleteChat}</span>
          </button>

          {otherProfileId ? (
            <button
              type="button"
              disabled={actionsDisabled || reportDisabled}
              onClick={() => {
                setOpen(false);
                onMenuOpenChange?.(false);
                setReportOpen(true);
              }}
              className={
                actionsDisabled || reportDisabled
                  ? disabledMenuItemClass
                  : menuItemClass
              }
            >
              <ReportIcon className="h-5 w-5 shrink-0" />
              <span>{labels.report}</span>
            </button>
          ) : null}
        </div>
      ) : null}

      <DeleteChatDialog
        conversationId={conversationId}
        open={deleteOpen}
        labels={labels}
        deleteAction={deleteAction}
        redirectToMessagesAfterDelete={redirectToMessagesAfterDelete}
        onDeleteSuccess={onDeleteSuccess}
        onClose={() => setDeleteOpen(false)}
      />
      {reportOpen ? (
        <ReportProfileDialog
          otherProfileId={otherProfileId}
          returnTo={returnTo}
          open={reportOpen}
          labels={labels}
          reportAction={reportAction}
          onClose={() => setReportOpen(false)}
        />
      ) : null}
    </div>
  );
}
