import Image from "next/image";

type LogoMarkProps = {
  alt?: string;
  className?: string;
  decorative?: boolean;
};

export function LogoMark({
  alt = "Perfect AuPair",
  className,
  decorative = false,
}: LogoMarkProps) {
  return (
    <span
      className={["relative block aspect-square shrink-0 overflow-hidden rounded-full", className]
        .filter(Boolean)
        .join(" ")}
    >
      <Image
        src="/brand/perfect-aupair-logo-mark-symmetric.jpg"
        alt={decorative ? "" : alt}
        aria-hidden={decorative ? true : undefined}
        width={96}
        height={96}
        loading="eager"
        draggable={false}
        className="h-full w-full scale-[1.08] select-none object-cover"
      />
    </span>
  );
}
