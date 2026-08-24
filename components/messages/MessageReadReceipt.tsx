type MessageReadReceiptProps = {
  read: boolean;
  compact?: boolean;
  label?: string;
};

export function MessageReadReceipt({
  read,
  compact = false,
  label,
}: MessageReadReceiptProps) {
  return (
    <span
      aria-hidden={label ? undefined : "true"}
      aria-label={label}
      role={label ? "img" : undefined}
      title={label}
      className={`inline-flex shrink-0 ${
        read ? "text-[#1299d5]" : "text-[#25302d]/70"
      }`}
    >
      <svg
        viewBox="0 0 23 16"
        className={compact ? "h-4 w-[1.4rem]" : "h-[1.05rem] w-6"}
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="2.6"
      >
        <path d="M1.8 8.7 5.4 12.3 13.5 4.2" />
        <path d="M8.8 8.7 12.4 12.3 20.5 4.2" />
      </svg>
    </span>
  );
}
