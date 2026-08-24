type MessageIconProps = {
  className?: string;
};

export function MessageIcon({ className = "h-5 w-5" }: MessageIconProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      aria-hidden="true"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="2.2"
    >
      <path d="M7.5 18.5 4 21V7a4 4 0 0 1 4-4h8a4 4 0 0 1 4 4v7.5a4 4 0 0 1-4 4H7.5Z" />
      <path d="M8.5 9.5h7" />
      <path d="M8.5 13h4.5" />
    </svg>
  );
}
