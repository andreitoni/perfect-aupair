"use client";

import { useFormStatus } from "react-dom";

type FeatureFlagToggleSubmitProps = {
  enabled: boolean;
};

export function FeatureFlagToggleSubmit({
  enabled,
}: FeatureFlagToggleSubmitProps) {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      aria-pressed={enabled}
      aria-busy={pending}
      disabled={pending}
      className="inline-flex min-h-11 items-center gap-2 rounded-full border border-black/10 bg-white px-2.5 py-2 text-xs font-bold text-[#25302d] transition hover:bg-[#f8fafb] focus:outline-none focus:ring-4 focus:ring-[#6f8793]/20 disabled:cursor-wait disabled:opacity-75"
    >
      <span className="sr-only">
        {pending
          ? "Saving feature flag"
          : enabled
            ? "Disable feature flag"
            : "Enable feature flag"}
      </span>
      <span
        aria-hidden="true"
        className={`relative h-6 w-11 rounded-full transition ${
          enabled ? "bg-[#25302d]" : "bg-[#d7dde2]"
        }`}
      >
        <span
          className={`absolute left-1 top-1 h-4 w-4 rounded-full bg-white shadow-sm transition ${
            enabled ? "translate-x-5" : "translate-x-0"
          }`}
        />
      </span>
      <span aria-live="polite">{pending ? "Saving" : enabled ? "On" : "Off"}</span>
    </button>
  );
}
