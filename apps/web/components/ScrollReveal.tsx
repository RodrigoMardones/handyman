"use client";

import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import styles from "./ScrollReveal.module.css";

/**
 * Hand-rolled "lighter alternative" to tasteskill v2 section 5.C's
 * whileInView stagger block: same idea (items fade and rise once as they
 * enter the viewport), no motion/react (zero new dependencies for this
 * feature). IntersectionObserver only, never a scroll listener (section
 * 5.D). Reduced motion is handled entirely in CSS: the visible class this
 * component toggles is inert unless `prefers-reduced-motion: no-preference`
 * matches, so reduced-motion users see the final state immediately with no
 * special-casing here (section 6.B).
 */
export function ScrollReveal({
  children,
  delayMs = 0,
  className,
}: {
  children: ReactNode;
  delayMs?: number;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === "undefined") {
      setVisible(true);
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setVisible(true);
            observer.unobserve(entry.target);
          }
        }
      },
      { threshold: 0.2, rootMargin: "0px 0px -10% 0px" },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const style: CSSProperties | undefined = delayMs
    ? ({ "--reveal-delay": `${delayMs}ms` } as CSSProperties)
    : undefined;

  const classes = [styles.reveal, visible ? styles.visible : "", className ?? ""]
    .filter(Boolean)
    .join(" ");

  return (
    <div ref={ref} className={classes} style={style}>
      {children}
    </div>
  );
}
