"use client";

import { useEffect } from "react";

type AccountType = "family" | "au_pair";

function normalizeAccountType(value: string | null): AccountType | null {
  if (value === "family") return "family";
  if (value === "au_pair") return "au_pair";

  return null;
}

function textOf(element: Element) {
  return element.textContent?.trim().toLowerCase() ?? "";
}

function dispatchInputEvents(element: HTMLElement) {
  element.dispatchEvent(new Event("input", { bubbles: true }));
  element.dispatchEvent(new Event("change", { bubbles: true }));
}

function setInputValue(element: HTMLInputElement, value: string) {
  const prototype = Object.getPrototypeOf(element);
  const descriptor = Object.getOwnPropertyDescriptor(prototype, "value");

  descriptor?.set?.call(element, value);
  dispatchInputEvents(element);
}

function setSelectValue(element: HTMLSelectElement, value: string) {
  const prototype = Object.getPrototypeOf(element);
  const descriptor = Object.getOwnPropertyDescriptor(prototype, "value");

  descriptor?.set?.call(element, value);
  dispatchInputEvents(element);
}

function setChecked(element: HTMLInputElement, checked: boolean) {
  const prototype = Object.getPrototypeOf(element);
  const descriptor = Object.getOwnPropertyDescriptor(prototype, "checked");

  descriptor?.set?.call(element, checked);
  dispatchInputEvents(element);
}

function clickRegisterTab() {
  const candidates = Array.from(
    document.querySelectorAll<HTMLElement>(
      '[role="tab"], button[type="button"], button, a',
    ),
  );

  const registerButton = candidates.find((element) => {
    const text = textOf(element);

    return text === "register";
  });

  registerButton?.click();
}

function preselectAccountType(accountType: AccountType) {
  const names = [
    "accountType",
    "account_type",
    "profileType",
    "profile_type",
    "type",
  ];

  for (const name of names) {
    document
      .querySelectorAll<HTMLInputElement>(`input[name="${name}"]`)
      .forEach((input) => {
        if (input.type === "radio") {
          setChecked(input, input.value === accountType);
        } else {
          setInputValue(input, accountType);
        }
      });

    document
      .querySelectorAll<HTMLSelectElement>(`select[name="${name}"]`)
      .forEach((select) => {
        setSelectValue(select, accountType);
      });
  }

  document
    .querySelectorAll<HTMLInputElement>(
      `input[type="radio"][value="${accountType}"]`,
    )
    .forEach((input) => {
      setChecked(input, true);
    });

  const labels =
    accountType === "family"
      ? ["family", "host family", "register as family"]
      : ["au pair", "register as au pair"];

  const clickable = Array.from(
    document.querySelectorAll<HTMLElement>(
      'button[type="button"], label, [role="radio"], [role="button"]',
    ),
  );

  const match = clickable.find((element) => {
    const text = textOf(element);

    return labels.some((label) => text.includes(label));
  });

  match?.click();

  document.querySelectorAll<HTMLFormElement>("form").forEach((form) => {
    const formText = textOf(form);

    if (!formText.includes("register")) return;

    for (const name of ["accountType", "account_type"]) {
      let input = form.querySelector<HTMLInputElement>(`input[name="${name}"]`);

      if (!input) {
        input = document.createElement("input");
        input.type = "hidden";
        input.name = name;
        form.appendChild(input);
      }

      setInputValue(input, accountType);
    }
  });
}

export function LoginUrlDefaults() {
  useEffect(() => {
    const url = new URL(window.location.href);
    const accountType = normalizeAccountType(url.searchParams.get("accountType"));
    const shouldOpenRegister = url.searchParams.get("mode") === "register";

    if (!accountType && !shouldOpenRegister) return;

    clickRegisterTab();

    if (accountType) {
      window.setTimeout(() => preselectAccountType(accountType), 50);
      window.setTimeout(() => preselectAccountType(accountType), 200);
      window.setTimeout(() => preselectAccountType(accountType), 500);
    }

    url.searchParams.delete("accountType");
    url.searchParams.delete("mode");
    window.history.replaceState({}, "", `${url.pathname}${url.search}${url.hash}`);
  }, []);

  return null;
}
