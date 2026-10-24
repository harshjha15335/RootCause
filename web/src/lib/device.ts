import { useEffect, useState, type RefObject } from "react";

/**
 * What this device can afford, decided once at load. Every 3D scene reads it instead of guessing:
 *   renderer.setPixelRatio(quality.dpr); count = Math.round(base * quality.particles)
 * Phones (narrow or coarse pointer, or few cores) get a lower pixel ratio and fewer particles,
 * to hold 30+ fps on a mid-range phone. Reduced motion means 2D with fades: skip 3D entirely.
 */
const mq = (q: string) => typeof window !== "undefined" && window.matchMedia(q).matches;
const cores = typeof navigator !== "undefined" ? navigator.hardwareConcurrency || 4 : 4;
const memory = typeof navigator !== "undefined" ? ((navigator as { deviceMemory?: number }).deviceMemory ?? 8) : 8;
const phone = mq("(max-width: 640px)") || (mq("(pointer: coarse)") && mq("(max-width: 1024px)"));
const weak = cores <= 4 || memory <= 4;
const dpr = typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1;

export const quality = {
  phone,
  /** low-end hardware, phone or not */
  weak,
  /** cap for renderer.setPixelRatio */
  dpr: Math.min(dpr, phone ? (weak ? 1.25 : 1.5) : weak ? 1.5 : 2),
  /** multiply particle, instance and segment counts by this */
  particles: phone ? (weak ? 0.35 : 0.5) : weak ? 0.75 : 1,
  /** post-processing (bloom, depth of field) only where it is cheap */
  post: !phone && !weak,
  antialias: !phone,
  reducedMotion: mq("(prefers-reduced-motion: reduce)"),
} as const;

/** True once the element is within `margin` of the viewport; stays true. Mount 3D canvases behind it. */
export function useNearViewport(ref: RefObject<Element>, margin = "200px"): boolean {
  const [near, setNear] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || near) return;
    if (typeof IntersectionObserver === "undefined") return setNear(true);
    const io = new IntersectionObserver((es) => es.some((e) => e.isIntersecting) && setNear(true), { rootMargin: margin });
    io.observe(el);
    return () => io.disconnect();
  }, [ref, margin, near]);
  return near;
}

/** True while the element is on screen: pause render loops when it is not. */
export function useOnScreen(ref: RefObject<Element>): boolean {
  const [on, setOn] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === "undefined") return setOn(true);
    const io = new IntersectionObserver((es) => setOn(es.some((e) => e.isIntersecting)));
    io.observe(el);
    return () => io.disconnect();
  }, [ref]);
  return on;
}
