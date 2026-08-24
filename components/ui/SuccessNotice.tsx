import type { ReactNode } from "react";

type SuccessNoticeProps = {
  children: ReactNode;
  className?: string;
};

export function SuccessNotice({ children, className = "" }: SuccessNoticeProps) {
  return (
    <div
      role="status"
      aria-live="polite"
      className={`flex items-center gap-3 rounded-[1.15rem] border border-[#7bd49a] bg-[#e4f8ea] p-4 text-sm font-black text-[#17472f] shadow-sm ring-1 ring-[#b9e8cc] ${className}`}
    >
      <span
        aria-hidden="true"
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#2aa96b] text-white shadow-sm"
      >
        <svg
          viewBox="0 0 24 24"
          className="h-5 w-5"
          fill="none"
          stroke="currentColor"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="3"
        >
          <path d="m6 12.5 4 4L18 7.5" />
        </svg>
      </span>
      <span>{children}</span>
    </div>
  );
}
