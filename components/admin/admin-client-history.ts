"use client";

const STORAGE_KEY = "pa_admin_navigation_v1";
const MAX_ENTRIES = 24;
const MAX_HREF_LENGTH = 8_192;

type AdminHistoryEntry = {
  from: string;
  to: string;
};

function currentAdminHref() {
  return `${window.location.pathname}${window.location.search}${window.location.hash}`;
}

function adminHref(value: string) {
  if (!value || value.length > MAX_HREF_LENGTH) return null;

  try {
    const url = new URL(value, window.location.href);

    if (
      url.origin !== window.location.origin ||
      (url.pathname !== "/admin" && !url.pathname.startsWith("/admin/"))
    ) {
      return null;
    }

    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return null;
  }
}

function readEntries() {
  try {
    const parsed: unknown = JSON.parse(
      window.sessionStorage.getItem(STORAGE_KEY) ?? "[]",
    );

    if (!Array.isArray(parsed)) return [];

    return parsed
      .filter(
        (entry): entry is AdminHistoryEntry =>
          typeof entry === "object" &&
          entry !== null &&
          typeof (entry as AdminHistoryEntry).from === "string" &&
          typeof (entry as AdminHistoryEntry).to === "string",
      )
      .slice(-MAX_ENTRIES);
  } catch {
    return [];
  }
}

function writeEntries(entries: AdminHistoryEntry[]) {
  try {
    window.sessionStorage.setItem(
      STORAGE_KEY,
      JSON.stringify(entries.slice(-MAX_ENTRIES)),
    );
  } catch {
    // Deterministic returnTo remains available when sessionStorage is blocked.
  }
}

export function recordAdminNavigation(destination: string) {
  const from = adminHref(currentAdminHref());
  const to = adminHref(destination);

  if (!from || !to || from === to) return;

  const entries = readEntries();
  const previous = entries.at(-1);

  if (previous?.from === from && previous.to === to) return;

  entries.push({ from, to });
  writeEntries(entries);
}

export function consumeAdminBack(expectedDestination: string) {
  const current = adminHref(currentAdminHref());
  const expected = adminHref(expectedDestination);

  if (!current || !expected) return false;

  const entries = readEntries();
  const previous = entries.at(-1);

  if (previous?.to !== current || previous.from !== expected) return false;

  entries.pop();
  writeEntries(entries);
  return true;
}
