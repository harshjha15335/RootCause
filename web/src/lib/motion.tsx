import { useEffect, useLayoutEffect, useRef, type ElementType, type ReactNode } from "react";
import { useUi } from "../store/uiStore";

/**
 * Scroll motion for the scrolling pages (home, report): Lenis smooths the wheel, GSAP's
 * ScrollTrigger ties each effect to scroll position. Both load on demand and stand down under
 * reduced motion, where everything renders in its final state.
 */
type Gsap = typeof import("gsap").gsap;
type ST = typeof import("gsap/ScrollTrigger").ScrollTrigger;
let loaded: Promise<{ gsap: Gsap; ScrollTrigger: ST }> | null = null;

export function loadGsap() {
  loaded ??= Promise.all([import("gsap"), import("gsap/ScrollTrigger")]).then(([{ gsap }, { ScrollTrigger }]) => {
    gsap.registerPlugin(ScrollTrigger);
    return { gsap, ScrollTrigger };
  });
  return loaded;
}

/** Smooth scrolling for as long as the calling page is mounted. */
export function useSmoothScroll() {
  const reduced = useUi((s) => s.reducedMotion);
  useEffect(() => {
    if (reduced) return;
    let off = false;
    let stop = () => {};
    Promise.all([import("lenis"), loadGsap()]).then(([{ default: Lenis }, { gsap, ScrollTrigger }]) => {
      if (off) return;
      const lenis = new Lenis({ duration: 1.15, easing: (x: number) => 1 - Math.pow(1 - x, 4) });
      lenis.on("scroll", ScrollTrigger.update);
      const tick = (time: number) => lenis.raf(time * 1000);
      gsap.ticker.add(tick);
      gsap.ticker.lagSmoothing(0);
      stop = () => {
        gsap.ticker.remove(tick);
        lenis.destroy();
      };
    });
    return () => {
      off = true;
      stop();
    };
  }, [reduced]);
}

/** Runs a GSAP setup against an element once it exists; reverts on unmount. */
function useGsap(setup: (el: HTMLElement, g: { gsap: Gsap; ScrollTrigger: ST }) => void, deps: unknown[] = []) {
  const ref = useRef<HTMLElement>(null);
  const reduced = useUi((s) => s.reducedMotion);
  useLayoutEffect(() => {
    if (reduced || !ref.current) return;
    const el = ref.current;
    let ctx: { revert(): void } | null = null;
    let off = false;
    loadGsap().then((g) => {
      if (off) return;
      ctx = g.gsap.context(() => setup(el, g), el);
    });
    return () => {
      off = true;
      ctx?.revert();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reduced, ...deps]);
  return ref;
}

/** Fades, lifts and un-blurs its content as it scrolls into view, tied to the scroll. */
export function Reveal({ children, as: Tag = "div", className = "", y = 70, delay = 0 }: { children: ReactNode; as?: ElementType; className?: string; y?: number; delay?: number }) {
  const ref = useGsap((el, { gsap }) => {
    gsap.fromTo(
      el,
      { opacity: 0, y, filter: "blur(10px)" },
      { opacity: 1, y: 0, filter: "blur(0px)", ease: "none", scrollTrigger: { trigger: el, start: `top ${92 - delay}%`, end: `top ${58 - delay}%`, scrub: 0.6 } },
    );
  });
  return (
    <Tag ref={ref} className={className}>
      {children}
    </Tag>
  );
}

/** A statement that lights up word by word as it is scrolled through. */
export function ScrollWords({ text, className = "", italicFrom = -1 }: { text: string; className?: string; italicFrom?: number }) {
  const words = text.split(/\s+/);
  const ref = useGsap(
    (el, { gsap }) => {
      gsap.fromTo(
        el.querySelectorAll("[data-w]"),
        { color: "rgb(var(--turf-edge))" },
        { color: "rgb(var(--chalk))", stagger: 0.12, ease: "none", scrollTrigger: { trigger: el, start: "top 78%", end: "bottom 42%", scrub: 0.5 } },
      );
    },
    [text],
  );
  return (
    <p ref={ref as React.RefObject<HTMLParagraphElement>} className={className}>
      {words.map((w, i) => (
        <span key={i} data-w className={italicFrom >= 0 && i >= italicFrom ? "italic" : ""}>
          {w}{" "}
        </span>
      ))}
    </p>
  );
}

/** A bar that fills to `to` (0..1) as it scrolls into view. */
export function ScrollBar({ to, className = "" }: { to: number; className?: string }) {
  const ref = useGsap(
    (el, { gsap }) => {
      gsap.fromTo(el, { scaleX: 0 }, { scaleX: 1, ease: "none", scrollTrigger: { trigger: el, start: "top 90%", end: "top 55%", scrub: 0.6 } });
    },
    [to],
  );
  return <div ref={ref as React.RefObject<HTMLDivElement>} className={`origin-left ${className}`} style={{ width: `${Math.max(1.5, to * 100)}%` }} />;
}

/** Headline lines that rise from below a mask on mount: the page's one authored entrance. */
export function RiseLines({ lines, className = "", delay = 0.1 }: { lines: ReactNode[]; className?: string; delay?: number }) {
  return (
    <span className={className}>
      {lines.map((l, i) => (
        <span key={i} className="block overflow-hidden pb-[0.08em]">
          <span className="rc-rise inline-block" style={{ animationDelay: `${delay + i * 0.14}s` }}>
            {l}
          </span>
        </span>
      ))}
    </span>
  );
}
