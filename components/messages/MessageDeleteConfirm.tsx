"use client";

import { useEffect } from "react";
import { useTranslations } from "@/components/i18n/I18nProvider";

function textOf(element: Element | null) {
  return element?.textContent?.trim().toLowerCase() ?? "";
}

function isDeleteControl(element: Element | null) {
  if (!element) return false;

  const text = textOf(element);
  const ariaLabel = element.getAttribute("aria-label")?.toLowerCase() ?? "";
  const title = element.getAttribute("title")?.toLowerCase() ?? "";
  const name = element.getAttribute("name")?.toLowerCase() ?? "";
  const value = element.getAttribute("value")?.toLowerCase() ?? "";
  const formAction = element.getAttribute("formAction")?.toLowerCase() ?? "";

  return (
    element.getAttribute("data-delete-control") === "true" ||
    text === "delete" ||
    ariaLabel.includes("delete") ||
    title.includes("delete") ||
    name.includes("delete") ||
    value.includes("delete") ||
    formAction.includes("delete")
  );
}

function removeExistingConfirm(control: HTMLElement) {
  const parent = control.parentElement;

  parent
    ?.querySelectorAll("[data-message-delete-inline-confirm]")
    .forEach((element) => element.remove());

  control.hidden = false;
}

function submitOriginalDelete(control: HTMLElement) {
  control.dataset.deleteConfirmed = "true";

  const form = control.closest("form");

  if (form && control instanceof HTMLButtonElement) {
    form.requestSubmit(control);
    return;
  }

  if (control instanceof HTMLAnchorElement) {
    control.click();
    return;
  }

  control.click();
}

function showInlineConfirm(
  control: HTMLElement,
  labels: { question: string; cancel: string; delete: string; deleting: string },
) {
  removeExistingConfirm(control);

  const confirmBox = document.createElement("div");
  confirmBox.dataset.messageDeleteInlineConfirm = "true";
  confirmBox.className =
    "absolute right-2 top-2 z-20 flex items-center gap-2 rounded-full bg-white/95 p-1.5 shadow-lg ring-1 ring-black/10";

  const label = document.createElement("span");
  label.className = "pl-2 text-xs font-black text-[#25302d]/65";
  label.textContent = labels.question;

  const cancelButton = document.createElement("button");
  cancelButton.type = "button";
  cancelButton.dataset.inlineConfirmAction = "cancel";
  cancelButton.className =
    "rounded-full border border-black/10 bg-[var(--background)] px-3 py-1.5 text-xs font-black text-[#25302d]";
  cancelButton.textContent = labels.cancel;

  const deleteButton = document.createElement("button");
  deleteButton.type = "button";
  deleteButton.dataset.inlineConfirmAction = "delete";
  deleteButton.className =
    "inline-flex min-w-[86px] items-center justify-center gap-1.5 rounded-full bg-[#d65f4a] px-3 py-1.5 text-xs font-black text-white disabled:cursor-default disabled:opacity-80";
  deleteButton.textContent = labels.delete;

  cancelButton.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();

    confirmBox.remove();
    control.hidden = false;
  });

  deleteButton.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();

    deleteButton.disabled = true;
    deleteButton.setAttribute("aria-busy", "true");
    cancelButton.disabled = true;
    cancelButton.classList.add("opacity-60");
    deleteButton.replaceChildren();

    const spinner = document.createElement("span");
    spinner.className =
      "h-3 w-3 animate-spin rounded-full border-2 border-white/35 border-t-white";
    spinner.setAttribute("aria-hidden", "true");

    const label = document.createElement("span");
    label.textContent = labels.deleting;

    deleteButton.append(spinner, label);
    submitOriginalDelete(control);
  });

  confirmBox.append(label, cancelButton, deleteButton);

  const anchor = control.parentElement ?? control;

  if (anchor instanceof HTMLElement) {
    const currentPosition = window.getComputedStyle(anchor).position;

    if (currentPosition === "static") {
      anchor.style.position = "relative";
    }

    anchor.appendChild(confirmBox);
  }

  control.hidden = true;
}

export function MessageDeleteConfirm() {
  const t = useTranslations();

  useEffect(() => {
    function handleClick(event: MouseEvent) {
      const target = event.target;

      if (!(target instanceof HTMLElement)) return;
      if (target.closest("[data-inline-confirm-action]")) return;

      const control = target.closest<HTMLElement>(
        'button, a, input[type="submit"], [role="button"]',
      );

      if (!control) return;
      if (!isDeleteControl(control)) return;

      if (control.dataset.deleteConfirmed === "true") {
        return;
      }

      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();

      showInlineConfirm(control, {
        question: t("messages.deleteQuestion"),
        cancel: t("common.cancel"),
        delete: t("common.delete"),
        deleting: t("common.deleting"),
      });
    }

    document.addEventListener("click", handleClick, true);

    return () => {
      document.removeEventListener("click", handleClick, true);
    };
  }, [t]);

  return null;
}
