type DeletedAccountAvatarProps = {
  className?: string;
};

export function DeletedAccountAvatar({
  className = "h-1/2 w-1/2",
}: DeletedAccountAvatarProps) {
  return (
    <svg
      data-deleted-account-avatar
      aria-hidden="true"
      viewBox="0 0 24 24"
      className={className}
      fill="currentColor"
    >
      <circle cx="12" cy="8" r="4" />
      <path d="M3.75 21a8.25 8.25 0 0 1 16.5 0H3.75Z" />
    </svg>
  );
}
