"use client";

import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type MouseEvent,
  type ReactNode,
} from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";

type TransitionPhase = "idle" | "cover" | "reveal";
type NavigateWithTransition = (href: string) => void;

const TransitionContext = createContext<NavigateWithTransition | null>(null);

export function AuthTransitionProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [phase, setPhase] = useState<TransitionPhase>("idle");
  const destination = useRef<string | null>(null);
  const sourcePath = useRef(pathname);

  const navigate = (href: string) => {
    if (phase !== "idle") return;
    destination.current = href;
    sourcePath.current = pathname;
    setPhase("cover");
  };

  useEffect(() => {
    if (phase === "cover" && pathname !== sourcePath.current) {
      setPhase("reveal");
    }
  }, [pathname, phase]);

  const handleCurtainAnimationEnd = () => {
    if (phase === "cover" && destination.current) {
      router.push(destination.current);
      return;
    }

    if (phase === "reveal") {
      destination.current = null;
      setPhase("idle");
    }
  };

  return (
    <TransitionContext.Provider value={navigate}>
      {children}
      <div
        aria-hidden="true"
        className="navigation-curtain"
        data-phase={phase}
        onAnimationEnd={handleCurtainAnimationEnd}
      />
    </TransitionContext.Provider>
  );
}

export function AuthTransitionLink({
  href,
  className,
  children,
  onClick,
}: {
  href: string;
  className?: string;
  children: ReactNode;
  onClick?: (event: MouseEvent<HTMLAnchorElement>) => void;
}) {
  const navigate = useContext(TransitionContext);

  return (
    <Link
      href={href}
      className={className}
      onClick={(event) => {
        onClick?.(event);
        if (
          event.defaultPrevented ||
          event.button !== 0 ||
          event.metaKey ||
          event.ctrlKey ||
          event.shiftKey ||
          event.altKey
        ) {
          return;
        }

        if (navigate) {
          event.preventDefault();
          navigate(href);
        }
      }}
    >
      {children}
    </Link>
  );
}
