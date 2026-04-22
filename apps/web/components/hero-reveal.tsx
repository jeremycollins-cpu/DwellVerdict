"use client";

import { motion, useReducedMotion } from "motion/react";
import type { ReactNode } from "react";

/**
 * HeroReveal — stagger-fade-in wrapper for the landing hero.
 *
 * Children are animated in sequence with a 60ms delay between them,
 * 8px y-offset, 400ms ease-out. Fires once on mount. Respects
 * prefers-reduced-motion.
 *
 * Keeps page.tsx a server component by isolating the Motion
 * client-side dependency to this wrapper.
 */

type Props = {
  children: ReactNode[];
  /** Delay (in ms) between each child's animation start. Default 80. */
  stagger?: number;
  /** Initial delay before the first child animates. Default 100ms. */
  delay?: number;
};

export function HeroReveal({ children, stagger = 80, delay = 100 }: Props) {
  const reduce = useReducedMotion();
  const items = Array.isArray(children) ? children : [children];

  return (
    <>
      {items.map((child, index) => (
        <motion.div
          key={index}
          initial={reduce ? false : { opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{
            duration: 0.5,
            delay: (delay + stagger * index) / 1000,
            ease: [0.22, 1, 0.36, 1],
          }}
        >
          {child}
        </motion.div>
      ))}
    </>
  );
}
