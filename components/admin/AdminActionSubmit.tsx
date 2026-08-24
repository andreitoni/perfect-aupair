"use client";

import { useEffect, useId, useRef, useState } from "react";
import type { KeyboardEvent as ReactKeyboardEvent, ReactNode } from "react";
import { createPortal, useFormStatus } from "react-dom";

type AdminActionConfirmation = {
  title: string;
  description: string;
  confirmLabel?: string;
  cancelLabel?: string;
};

type AdminActionSubmitProps = {
  children: ReactNode;
  pendingLabel?: string;
  tone?: "default" | "danger";
  confirmation?: AdminActionConfirmation;
};

export function AdminActionSubmit({
  children,
  pendingLabel = "Working...",
  tone = "default",
  confirmation,
}: AdminActionSubmitProps) {
  const { pending } = useFormStatus();
  const [confirmationOpen, setConfirmationOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const cancelButtonRef = useRef<HTMLButtonElement>(null);
  const restoreFocusRef = useRef<HTMLElement | null>(null);
  const titleId = useId();
  const descriptionId = useId();

  useEffect(() => {
    if (!confirmationOpen) {
      return;
    }

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const focusFrame = window.requestAnimationFrame(() => {
      cancelButtonRef.current?.focus();
    });

    return () => {
      window.cancelAnimationFrame(focusFrame);
      document.body.style.overflow = previousOverflow;
    };
  }, [confirmationOpen]);

  function openConfirmation() {
    restoreFocusRef.current =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : triggerRef.current;
    setConfirmationOpen(true);
  }

  function closeConfirmation({ restoreFocus = true } = {}) {
    setConfirmationOpen(false);

    if (restoreFocus) {
      window.requestAnimationFrame(() => {
        restoreFocusRef.current?.focus();
      });
    }
  }

  function submitConfirmedAction() {
    const form = triggerRef.current?.form;
    if (!form) {
      closeConfirmation();
      return;
    }

    setConfirmationOpen(false);
    form.requestSubmit();
  }

  function handleDialogKeyDown(event: ReactKeyboardEvent<HTMLDivElement>) {
    if (event.key === "Escape") {
      event.preventDefault();
      closeConfirmation();
      return;
    }

    if (event.key !== "Tab") {
      return;
    }

    const focusableElements = Array.from(
      dialogRef.current?.querySelectorAll<HTMLElement>(
        'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
      ) ?? [],
    );

    if (focusableElements.length === 0) {
      event.preventDefault();
      dialogRef.current?.focus();
      return;
    }

    const firstElement = focusableElements[0];
    const lastElement = focusableElements[focusableElements.length - 1];

    if (event.shiftKey && document.activeElement === firstElement) {
      event.preventDefault();
      lastElement.focus();
    } else if (!event.shiftKey && document.activeElement === lastElement) {
      event.preventDefault();
      firstElement.focus();
    }
  }

  const confirmationDialog =
    confirmation && confirmationOpen && typeof document !== "undefined"
      ? createPortal(
          <div
            className="fixed inset-0 z-[100] flex items-center justify-center bg-[#13272d]/60 p-4 backdrop-blur-sm"
            onMouseDown={(event) => {
              if (event.target === event.currentTarget) {
                closeConfirmation();
              }
            }}
          >
            <div
              ref={dialogRef}
              role="dialog"
              aria-modal="true"
              aria-labelledby={titleId}
              aria-describedby={descriptionId}
              tabIndex={-1}
              onKeyDown={handleDialogKeyDown}
              className="w-full max-w-md rounded-2xl border border-[#d7dde2] bg-white p-5 text-left shadow-2xl outline-none sm:p-6"
            >
              <p className="text-[0.7rem] font-black uppercase tracking-[0.16em] text-[#9d3f2f]">
                Permanent action
              </p>
              <h2
                id={titleId}
                className="mt-2 text-xl font-black tracking-[-0.025em] text-[#25302d]"
              >
                {confirmation.title}
              </h2>
              <p
                id={descriptionId}
                className="mt-2 text-sm font-semibold leading-6 text-[#45636f]"
              >
                {confirmation.description}
              </p>

              <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                <button
                  ref={cancelButtonRef}
                  type="button"
                  onClick={() => closeConfirmation()}
                  className="inline-flex min-h-11 items-center justify-center rounded-lg border border-[#c8d1d6] bg-white px-4 py-2 text-sm font-black text-[#25302d] transition hover:bg-[#f4f7f8] focus:outline-none focus:ring-4 focus:ring-[#6f8793]/24"
                >
                  {confirmation.cancelLabel ?? "Cancel"}
                </button>
                <button
                  type="button"
                  onClick={submitConfirmedAction}
                  className="inline-flex min-h-11 items-center justify-center rounded-lg bg-[#9d3f2f] px-4 py-2 text-sm font-black text-white transition hover:bg-[#853326] focus:outline-none focus:ring-4 focus:ring-[#d95f49]/25"
                >
                  {confirmation.confirmLabel ?? "Confirm"}
                </button>
              </div>
            </div>
          </div>,
          document.body,
        )
      : null;

  return (
    <>
      <button
        ref={triggerRef}
        type={confirmation ? "button" : "submit"}
        disabled={pending}
        aria-busy={pending}
        onClick={confirmation ? openConfirmation : undefined}
        className={`inline-flex min-h-11 min-w-[96px] items-center justify-center gap-2 rounded-xl px-3.5 py-2 text-center text-xs font-bold transition focus:outline-none focus:ring-4 disabled:cursor-wait disabled:opacity-75 ${
          tone === "danger"
            ? "bg-[#fff2ed] text-[#9d3f2f] ring-1 ring-[#f1c1b7] hover:bg-[#ffe4da] focus:ring-[#d95f49]/20"
            : "bg-[#25302d] text-white shadow-sm hover:bg-[#1b2421] focus:ring-[#6f8793]/24"
        }`}
      >
        {pending ? (
          <span
            aria-hidden="true"
            className={`h-3.5 w-3.5 animate-spin rounded-full border-2 ${
              tone === "danger"
                ? "border-[#9d3f2f]/25 border-t-[#9d3f2f]"
                : "border-white/30 border-t-white"
            }`}
          />
        ) : null}
        <span aria-live="polite">{pending ? pendingLabel : children}</span>
      </button>
      {confirmationDialog}
    </>
  );
}
