/**
 * Motion tokens for the Tanmatra design system.
 *
 * Mirrors the CSS custom properties declared in `index.css` so that
 * Framer Motion / JS-driven animations stay in lockstep with CSS
 * transitions. Always import from here instead of hardcoding numbers.
 */

export const DURATION = {
  instant: 0.08,
  fast: 0.12,
  base: 0.2,
  slow: 0.32,
  slower: 0.52,
} as const;

export const EASE = {
  standard: [0.2, 0, 0, 1] as const,
  emphasized: [0.3, 0, 0, 1] as const,
  decelerate: [0, 0, 0, 1] as const,
  accelerate: [0.3, 0, 1, 1] as const,
} as const;

export const SPRING = {
  soft: { type: "spring" as const, stiffness: 220, damping: 26, mass: 0.9 },
  snappy: { type: "spring" as const, stiffness: 380, damping: 30, mass: 0.8 },
  bouncy: { type: "spring" as const, stiffness: 320, damping: 18, mass: 0.7 },
} as const;

export const FADE_IN_UP = {
  initial: { opacity: 0, y: 12 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: DURATION.slow, ease: EASE.standard },
};

export const FADE = {
  initial: { opacity: 0 },
  animate: { opacity: 1 },
  exit: { opacity: 0 },
  transition: { duration: DURATION.base, ease: EASE.standard },
};
