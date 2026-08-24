"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "@/components/i18n/I18nProvider";

function hasTextValue(form: HTMLFormElement) {
  const textFields = Array.from(
    form.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>(
      'textarea, input[type="text"]',
    ),
  );

  return textFields.some((field) => field.value.trim().length > 0);
}

function hasSelectedFile(form: HTMLFormElement) {
  const fileInputs = Array.from(
    form.querySelectorAll<HTMLInputElement>('input[type="file"]'),
  );

  return fileInputs.some((input) => {
    const file = input.files?.[0];

    return Boolean(file && file.size > 0);
  });
}

function hasMessageContent(form: HTMLFormElement) {
  return hasTextValue(form) || hasSelectedFile(form);
}

export function MessageEmptySubmitGuard() {
  const t = useTranslations();
  const rootRef = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const root = rootRef.current;

    if (!root) return;

    const closestForm = root.closest("form");

    if (!(closestForm instanceof HTMLFormElement)) return;

    const messageForm: HTMLFormElement = closestForm;

    function clearErrorIfValid() {
      if (hasMessageContent(messageForm)) {
        setError(null);
      }
    }

    function handleSubmit(event: SubmitEvent) {
      if (hasMessageContent(messageForm)) {
        setError(null);
        return;
      }

      window.dispatchEvent(new CustomEvent("message-empty-submit-attempt"));

      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();

      setError(t("messages.emptySubmit"));
    }

    messageForm.addEventListener("submit", handleSubmit, true);
    messageForm.addEventListener("input", clearErrorIfValid, true);
    messageForm.addEventListener("change", clearErrorIfValid, true);

    return () => {
      messageForm.removeEventListener("submit", handleSubmit, true);
      messageForm.removeEventListener("input", clearErrorIfValid, true);
      messageForm.removeEventListener("change", clearErrorIfValid, true);
    };
  }, [t]);

  return (
    <div ref={rootRef}>
      {error ? (
        <div className="mb-3 rounded-[1.25rem] border border-[#efb5a6] bg-[#fff4ef] px-4 py-3 text-sm font-bold text-[#b04b36]">
          {error}
        </div>
      ) : null}
    </div>
  );
}
