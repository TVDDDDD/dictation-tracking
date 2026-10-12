import Image from "next/image";
import Link from "next/link";

export type BrandLogoProps = {
  name?: string;
  kicker?: string;
  href?: string;
  className?: string;
};

export default function BrandLogo({
  name = "Dictation Studio",
  kicker = "LISTEN · LEARN",
  href,
  className = "",
}: BrandLogoProps) {
  const content = (
    <>
      <Image
        src="/dictation-mark.svg"
        alt=""
        width={46}
        height={46}
        className="brand-mark-image"
      />
      <span className="brand-copy">
        <span className="brand-kicker">{kicker}</span>
        <span className="brand-name">{name}</span>
      </span>
    </>
  );

  if (href) {
    return (
      <Link href={href} className={`brand-lockup ${className}`.trim()}>
        {content}
      </Link>
    );
  }

  return <span className={`brand-lockup ${className}`.trim()}>{content}</span>;
}
