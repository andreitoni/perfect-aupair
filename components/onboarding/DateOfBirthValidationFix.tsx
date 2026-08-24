"use client";

import { useEffect } from "react";

function isBirthDateRelated(element: Element) {
  const name = element.getAttribute("name")?.toLowerCase() ?? "";
  const id = element.getAttribute("id")?.toLowerCase() ?? "";
  const ariaLabel = element.getAttribute("aria-label")?.toLowerCase() ?? "";

  return (
    name.includes("birth") ||
    name.includes("date_of_birth") ||
    name.includes("dob") ||
    id.includes("birth") ||
    id.includes("date_of_birth") ||
    id.includes("dob") ||
    ariaLabel.includes("birth") ||
    ariaLabel.includes("date of birth")
  );
}

function clearBirthDateInvalidState(form: HTMLFormElement) {
  const fields = Array.from(
    form.querySelectorAll<HTMLInputElement | HTMLSelectElement>(
      "input, select",
    ),
  ).filter(isBirthDateRelated);

  for (const field of fields) {
    field.setCustomValidity("");
    field.removeAttribute("aria-invalid");
    field.classList.remove("invalid", "is-invalid", "border-red-500");
  }
}

export function DateOfBirthValidationFix() {
  useEffect(() => {
    function handleChange(event: Event) {
      const target = event.target;

      if (!(target instanceof HTMLElement)) return;
      if (!isBirthDateRelated(target)) return;

      const form = target.closest("form");

      if (!form) return;

      clearBirthDateInvalidState(form);
    }

    document.addEventListener("change", handleChange, true);
    document.addEventListener("input", handleChange, true);

    return () => {
      document.removeEventListener("change", handleChange, true);
      document.removeEventListener("input", handleChange, true);
    };
  }, []);

  return null;
}
