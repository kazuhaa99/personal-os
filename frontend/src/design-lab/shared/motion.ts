import type { Transition, Variants } from "framer-motion";

export const spring: Transition = { type: "spring", stiffness: 380, damping: 32, mass: 0.8 };
export const softSpring: Transition = { type: "spring", stiffness: 220, damping: 26 };
export const ease = [0.22, 1, 0.36, 1] as const; // expo-out

/** Container that staggers its children's entrance. */
export const stagger = (gap = 0.05, delay = 0.04): Variants => ({
  hidden: {},
  show: { transition: { staggerChildren: gap, delayChildren: delay } },
});

export const rise: Variants = {
  hidden: { opacity: 0, y: 18, filter: "blur(6px)" },
  show: { opacity: 1, y: 0, filter: "blur(0px)", transition: { duration: 0.6, ease } },
};

export const fade: Variants = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { duration: 0.4, ease } },
};

/** Masked line reveal for editorial headlines (wrap in overflow:hidden). */
export const lineUp: Variants = {
  hidden: { y: "105%" },
  show: { y: "0%", transition: { duration: 0.8, ease } },
};

export const shakeX = { x: [0, -8, 7, -5, 4, -2, 0], transition: { duration: 0.42 } };
