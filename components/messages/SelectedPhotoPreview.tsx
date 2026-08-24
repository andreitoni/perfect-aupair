"use client";

import Image from "next/image";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  IMAGE_UPLOAD_ACCEPT,
  IMAGE_COMPRESSION_SOURCE_MAX_SIZE,
  formatImageFileSize,
  validateImageUploadFile,
} from "@/lib/images/compress";
import { useTranslations } from "@/components/i18n/I18nProvider";

type PreviewState = {
  url: string;
  name: string;
  size: string;
};

function isRemoveButton(element: Element) {
  return element.textContent?.trim().toLowerCase() === "remove";
}

export function SelectedPhotoPreview() {
  const t = useTranslations();
  const rootRef = useRef<HTMLDivElement>(null);
  const objectUrlRef = useRef<string | null>(null);
  const [preview, setPreview] = useState<PreviewState | null>(null);
  const [error, setError] = useState<string | null>(null);

  const revokeCurrentObjectUrl = useCallback(function revokeCurrentObjectUrl() {
    if (objectUrlRef.current) {
      URL.revokeObjectURL(objectUrlRef.current);
      objectUrlRef.current = null;
    }
  }, []);

  const getForm = useCallback(function getForm() {
    return rootRef.current?.closest("form") ?? null;
  }, []);

  const getFileInput = useCallback(function getFileInput() {
    const form = getForm();

    if (!form) return null;

    return form.querySelector<HTMLInputElement>(
      'input[type="file"][accept*="image"], input[type="file"]',
    );
  }, [getForm]);

  const hideLegacySelectedPhotoRow = useCallback(
    function hideLegacySelectedPhotoRow() {
      const form = getForm();
      const root = rootRef.current;

      if (!form || !root) return;

      form.querySelectorAll<HTMLButtonElement>("button").forEach((button) => {
        if (root.contains(button)) return;
        if (!isRemoveButton(button)) return;

        const row = button.closest<HTMLElement>("div, section, p");

        if (!row || row === form || root.contains(row)) return;

        // Nu folosim row.remove(), fiindcă elementul aparține React.
        // Îl ascundem doar vizual ca să evităm eroarea removeChild.
        row.hidden = true;
        row.setAttribute("aria-hidden", "true");
        row.style.display = "none";
        row.style.pointerEvents = "none";
      });
    },
    [getForm],
  );

  const clearSelectedPhoto = useCallback(function clearSelectedPhoto() {
    const input = getFileInput();

    revokeCurrentObjectUrl();

    if (input) {
      input.value = "";
      input.dispatchEvent(new Event("change", { bubbles: true }));
    }

    setPreview(null);
    setError(null);

    window.setTimeout(hideLegacySelectedPhotoRow, 0);
  }, [getFileInput, hideLegacySelectedPhotoRow, revokeCurrentObjectUrl]);

  useEffect(() => {
    const form = getForm();

    if (!form) return;

    const input = form.querySelector<HTMLInputElement>(
      'input[type="file"][accept*="image"], input[type="file"]',
    );

    if (!input) return;

    function updatePreview() {
      revokeCurrentObjectUrl();
      setError(null);

      const file = input?.files?.[0];

      if (!file) {
        setPreview(null);
        window.setTimeout(hideLegacySelectedPhotoRow, 0);
        return;
      }

      const validationError = validateImageUploadFile(file, {
        maxSizeBytes: IMAGE_COMPRESSION_SOURCE_MAX_SIZE,
      });

      if (validationError) {
        input.value = "";
        setPreview(null);
        setError(validationError);
        window.setTimeout(hideLegacySelectedPhotoRow, 0);
        return;
      }

      const url = URL.createObjectURL(file);
      objectUrlRef.current = url;

      setPreview({
        url,
        name: file.name,
        size: formatImageFileSize(file.size),
      });

      window.setTimeout(hideLegacySelectedPhotoRow, 0);
    }

    function validateBeforeSubmit(event: SubmitEvent) {
      const file = input?.files?.[0];

      if (!file) {
        setError(null);
        return;
      }

      const validationError = validateImageUploadFile(file, {
        maxSizeBytes: IMAGE_COMPRESSION_SOURCE_MAX_SIZE,
      });

      if (!validationError) return;

      event.preventDefault();
      setError(validationError);
    }

    function clearAfterSubmit() {
      window.setTimeout(() => {
        clearSelectedPhoto();
      }, 900);
    }

    function clearAfterFormData() {
      window.setTimeout(() => {
        clearSelectedPhoto();
      }, 100);
    }

    function clearStalePhotoError() {
      const selectedFile = input?.files?.[0];

      if (!selectedFile) {
        setError(null);
      }
    }

    function clearStalePhotoErrorOnTextInput(event: Event) {
      const target = event.target;

      if (
        target instanceof HTMLTextAreaElement ||
        (target instanceof HTMLInputElement && target.type === "text")
      ) {
        clearStalePhotoError();
      }
    }

    input.setAttribute("accept", IMAGE_UPLOAD_ACCEPT);

    const observer = new MutationObserver(() => {
      hideLegacySelectedPhotoRow();
    });

    observer.observe(form, {
      childList: true,
      subtree: true,
    });

    input.addEventListener("change", updatePreview);
    form.addEventListener("submit", validateBeforeSubmit);
    form.addEventListener("submit", clearAfterSubmit);
    form.addEventListener("formdata", clearAfterFormData);
    form.addEventListener("input", clearStalePhotoErrorOnTextInput, true);
    window.addEventListener("message-empty-submit-attempt", clearStalePhotoError);

    updatePreview();
    hideLegacySelectedPhotoRow();

    return () => {
      observer.disconnect();
      input.removeEventListener("change", updatePreview);
      form.removeEventListener("submit", validateBeforeSubmit);
      form.removeEventListener("submit", clearAfterSubmit);
      form.removeEventListener("formdata", clearAfterFormData);
      form.removeEventListener("input", clearStalePhotoErrorOnTextInput, true);
      window.removeEventListener(
        "message-empty-submit-attempt",
        clearStalePhotoError,
      );
      revokeCurrentObjectUrl();
    };
  }, [
    clearSelectedPhoto,
    getForm,
    hideLegacySelectedPhotoRow,
    revokeCurrentObjectUrl,
  ]);

  return (
    <div ref={rootRef}>
      {error ? (
        <div className="mb-3 rounded-[1.25rem] border border-[#efb5a6] bg-[#fff4ef] px-4 py-3 text-sm font-bold text-[#b04b36]">
          {error}
        </div>
      ) : null}

      {preview ? (
        <div
          data-photo-preview-card="true"
          className="mb-3 flex items-center gap-3 rounded-[1.25rem] border border-black/10 bg-white p-3 shadow-sm"
        >
          <div className="relative h-20 w-20 overflow-hidden rounded-2xl bg-[#f7f3ed] ring-1 ring-black/5">
            <Image
              src={preview.url}
              alt=""
              fill
              sizes="80px"
              unoptimized
              draggable={false}
              className="pa-protected-media h-full w-full object-cover"
            />
          </div>

          <div className="min-w-0 flex-1">
            <p className="text-xs font-black uppercase tracking-[0.18em] text-[#6f8793]">
              {t("messages.photoPreview")}
            </p>
            <p className="mt-1 truncate text-sm font-bold text-[#25302d]">
              {preview.name}
            </p>
            <p className="mt-0.5 text-xs font-semibold text-[#25302d]/45">
              {preview.size}
            </p>
          </div>

          <button
            type="button"
            onClick={clearSelectedPhoto}
            className="rounded-full border border-black/10 bg-[var(--background)] px-3 py-2 text-xs font-black text-[#25302d] transition hover:bg-white"
          >
            {t("common.remove")}
          </button>
        </div>
      ) : null}
    </div>
  );
}
