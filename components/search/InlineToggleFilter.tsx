"use client";

import type { ReactNode } from "react";

type ChoiceIconType = "female" | "male" | "no" | "yes";

export type InlineToggleOption = {
  label: string;
  value: string;
  icon: ChoiceIconType;
};

function ChoiceIcon({ type }: { type: ChoiceIconType }) {
  const commonProps = {
    className: "h-4 w-4",
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: "2.4",
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true,
  };

  if (type === "female") {
    return (
      <svg {...commonProps}>
        <circle cx="12" cy="8" r="5" />
        <path d="M12 13v8" />
        <path d="M8.5 17h7" />
      </svg>
    );
  }

  if (type === "male") {
    return (
      <svg {...commonProps}>
        <circle cx="10" cy="14" r="5" />
        <path d="m14 10 6-6" />
        <path d="M15 4h5v5" />
      </svg>
    );
  }

  if (type === "no") {
    return (
      <svg {...commonProps}>
        <circle cx="12" cy="12" r="8" />
        <path d="m6.5 6.5 11 11" />
      </svg>
    );
  }

  return (
    <svg {...commonProps}>
      <path d="m5 12 4 4L19 6" />
    </svg>
  );
}

export function InlineToggleFilter({
  title,
  name,
  leadingIcon,
  value,
  options,
  onChange,
}: {
  title: string;
  name: string;
  leadingIcon: ReactNode;
  value: string;
  options: InlineToggleOption[];
  onChange: (value: string) => void;
}) {
  return (
    <div>
      <div className="flex items-center justify-between gap-3">
        <p className="flex min-w-0 items-center gap-3 text-sm font-black">
          {leadingIcon}
          <span className="truncate">{title}</span>
        </p>

        <div className="flex shrink-0 items-center gap-2">
          {options.map((option) => {
            const isSelected = value === option.value;

            return (
              <button
                key={option.value}
                type="button"
                aria-pressed={isSelected}
                onClick={() => onChange(isSelected ? "" : option.value)}
                className="inline-flex items-center gap-1.5 whitespace-nowrap text-xs font-black"
              >
                <span
                  className={`flex h-9 w-9 items-center justify-center rounded-full border transition ${
                    isSelected
                      ? "border-[var(--pa-primary)] bg-[var(--pa-primary)] text-[var(--pa-primary-ink)] shadow-sm"
                      : "border-black/10 bg-white text-[#25302d]/65"
                  }`}
                >
                  <ChoiceIcon type={option.icon} />
                </span>
                <span
                  className={
                    isSelected ? "text-[#25302d]" : "text-[#25302d]/58"
                  }
                >
                  {option.label}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      <input type="hidden" name={value ? name : undefined} value={value} />
    </div>
  );
}
