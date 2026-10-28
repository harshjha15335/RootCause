import React from "react";
import { AbsoluteFill, Easing, Img, interpolate, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import { C, F } from "./theme";
import { CLIP_FPS } from "./timeline";

export const ease = Easing.bezier(0.22, 1, 0.36, 1); // expo-ish out
export const inOut = Easing.bezier(0.65, 0, 0.35, 1);
const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;

export const fontFaces = `
@font-face{font-family:Anybody;src:url(${staticFile("fonts/anybody.woff2")}) format('woff2');font-weight:100 900;font-stretch:50% 150%}
@font-face{font-family:Hanken;src:url(${staticFile("fonts/hanken.woff2")}) format('woff2');font-weight:100 900}
@font-face{font-family:JetBrains;src:url(${staticFile("fonts/jetbrains.woff2")}) format('woff2');font-weight:100 900}`;

/** Plays a captured frame sequence. `start` = first source frame, `rate` = playback speed, `reverse` plays backwards. */
export const Seq: React.FC<{ clip: { dir: string; n: number; fps?: number }; start?: number; rate?: number; reverse?: boolean; hold?: number; style?: React.CSSProperties }> = ({ clip, start = 0, rate = 1, reverse = false, hold, style }) => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const srcFps = clip.fps ?? CLIP_FPS;
  let i = hold ?? Math.floor(start + (f / fps) * srcFps * rate);
  if (reverse) i = Math.floor(start - (f / fps) * srcFps * rate);
  i = Math.max(0, Math.min(clip.n - 1, i));
  return <Img src={staticFile(`${clip.dir}/${String(i).padStart(4, "0")}.jpg`)} style={{ width: 1920, height: 1080, display: "block", ...style }} />;
};

export const Still: React.FC<{ src: string; style?: React.CSSProperties }> = ({ src, style }) => (
  <Img src={staticFile(src)} style={{ width: 1920, height: 1080, display: "block", ...style }} />
);

type Shot = { x: number; y: number; z: number };
/** Virtual camera over a 1920x1080 plate: moves from `a` to `b` (focus point in plate pixels, zoom). */
export const Cam: React.FC<{ a: Shot; b?: Shot; dur: number; children: React.ReactNode; e?: (t: number) => number }> = ({ a, b, dur, children, e = inOut }) => {
  const f = useCurrentFrame();
  const t = e(Math.min(1, Math.max(0, f / dur)));
  const B = b ?? a;
  const x = a.x + (B.x - a.x) * t, y = a.y + (B.y - a.y) * t, z = a.z + (B.z - a.z) * t;
  // keep the plate covering the frame
  const tx = Math.min(0, Math.max(1920 - 1920 * z, 960 - x * z));
  const ty = Math.min(0, Math.max(1080 - 1080 * z, 540 - y * z));
  return (
    <AbsoluteFill style={{ overflow: "hidden" }}>
      <div style={{ position: "absolute", width: 1920, height: 1080, transformOrigin: "0 0", transform: `translate(${tx}px,${ty}px) scale(${z})` }}>{children}</div>
    </AbsoluteFill>
  );
};

/** A floating product "screen" with depth, for showing a page as an object on the brand background. */
export const Screen: React.FC<{ children: React.ReactNode; scale?: number; rotY?: number; rotX?: number; y?: number; x?: number; radius?: number; opacity?: number }> = ({ children, scale = 0.78, rotY = 0, rotX = 0, y = 0, x = 0, radius = 18, opacity = 1 }) => (
  <AbsoluteFill style={{ perspective: 2400, alignItems: "center", justifyContent: "center", opacity }}>
    <div style={{ width: 1920, height: 1080, transform: `translate(${x}px,${y}px) scale(${scale}) rotateY(${rotY}deg) rotateX(${rotX}deg)`, borderRadius: radius / scale, overflow: "hidden", boxShadow: "0 60px 140px rgba(0,0,0,.55), 0 0 0 2px rgba(255,255,255,.10)" }}>{children}</div>
  </AbsoluteFill>
);

/** Kinetic headline: each word rises out of a mask, staggered. */
export const Headline: React.FC<{ text: string; at?: number; size?: number; color?: string; accent?: string; accentWords?: string[]; align?: "left" | "center"; out?: number; width?: number; style?: React.CSSProperties }> = ({ text, at = 0, size = 120, color = C.chalk, accent = C.lime, accentWords = [], align = "center", out, width = 1600, style }) => {
  const f = useCurrentFrame();
  const words = text.split(" ");
  const fadeOut = out !== undefined ? interpolate(f, [out, out + 8], [1, 0], clamp) : 1;
  return (
    <div style={{ fontFamily: F.display, fontWeight: 900, fontStretch: "130%", fontSize: size, lineHeight: 0.95, letterSpacing: "-0.01em", textTransform: "uppercase", color, textAlign: align, width, display: "flex", flexWrap: "wrap", justifyContent: align === "center" ? "center" : "flex-start", gap: `0 ${size * 0.28}px`, opacity: fadeOut, ...style }}>
      {words.map((w, i) => {
        const p = interpolate(f, [at + i * 3, at + i * 3 + 16], [0, 1], { ...clamp, easing: ease });
        const isAccent = accentWords.includes(w.replace(/[.,?!]/g, ""));
        return (
          <span key={i} style={{ display: "inline-block", overflow: "hidden", paddingBottom: size * 0.08 }}>
            <span style={{ display: "inline-block", transform: `translateY(${(1 - p) * 105}%)`, color: isAccent ? accent : undefined }}>{w}</span>
          </span>
        );
      })}
    </div>
  );
};

/** Mono eyebrow / tag, broadcast style. */
export const Tag: React.FC<{ children: React.ReactNode; at?: number; color?: string; style?: React.CSSProperties; dot?: boolean }> = ({ children, at = 0, color = C.chalk, style, dot = true }) => {
  const f = useCurrentFrame();
  const p = interpolate(f, [at, at + 12], [0, 1], { ...clamp, easing: ease });
  return (
    <div style={{ fontFamily: F.mono, fontWeight: 600, fontSize: 22, letterSpacing: "0.22em", textTransform: "uppercase", color, display: "flex", alignItems: "center", gap: 14, opacity: p, transform: `translateX(${(1 - p) * -20}px)`, ...style }}>
      {dot && <span style={{ width: 10, height: 10, borderRadius: 5, background: C.lime, boxShadow: `0 0 18px ${C.lime}` }} />}
      {children}
    </div>
  );
};

/** Scene chip shown in the top-left during product footage. */
export const SceneChip: React.FC<{ id: string; name: string; dur: number }> = ({ id, name, dur }) => {
  const f = useCurrentFrame();
  const o = interpolate(f, [6, 18, dur - 12, dur], [0, 1, 1, 0], clamp);
  return (
    <div style={{ position: "absolute", left: 56, bottom: 52, opacity: o, display: "flex", alignItems: "center", gap: 16, fontFamily: F.mono, fontSize: 20, letterSpacing: "0.2em", color: C.chalk, textTransform: "uppercase", background: "rgba(3,8,31,.72)", padding: "12px 20px", borderRadius: 999, border: "1px solid rgba(255,255,255,.14)" }}>
      <span style={{ color: C.lime }}>{id}</span>
      <span style={{ width: 1, height: 18, background: "rgba(255,255,255,.3)" }} />
      {name}
    </div>
  );
};

/** Callout ring + label drawn in plate coordinates (inside a Cam). */
export const Callout: React.FC<{ x: number; y: number; w: number; h: number; label?: string; at?: number; labelSide?: "top" | "bottom" | "right" | "left"; color?: string; out?: number }> = ({ x, y, w, h, label, at = 0, labelSide = "top", color = C.lime, out }) => {
  const f = useCurrentFrame();
  const p = interpolate(f, [at, at + 14], [0, 1], { ...clamp, easing: ease });
  const o = out !== undefined ? interpolate(f, [out, out + 8], [1, 0], clamp) : 1;
  const per = 2 * (w + h);
  const pos: React.CSSProperties = labelSide === "top" ? { left: 0, bottom: h + 14 } : labelSide === "bottom" ? { left: 0, top: h + 14 } : labelSide === "right" ? { left: w + 16, top: 0 } : { right: w + 16, top: 0 };
  return (
    <div style={{ position: "absolute", left: x, top: y, width: w, height: h, opacity: o }}>
      <svg width={w} height={h} style={{ position: "absolute", overflow: "visible" }}>
        <rect x={0} y={0} width={w} height={h} rx={12} fill="none" stroke={color} strokeWidth={4} strokeDasharray={per} strokeDashoffset={per * (1 - p)} style={{ filter: `drop-shadow(0 0 12px ${color}88)` }} />
      </svg>
      {label && (
        <div style={{ position: "absolute", ...pos, whiteSpace: "nowrap", opacity: interpolate(f, [at + 8, at + 18], [0, 1], clamp), fontFamily: F.mono, fontWeight: 700, fontSize: 22, letterSpacing: "0.14em", color: C.night, background: color, padding: "8px 14px", borderRadius: 8, textTransform: "uppercase" }}>{label}</div>
      )}
    </div>
  );
};

/** Big animated number, e.g. 71% -> counts up. */
export const Count: React.FC<{ to: number; at?: number; dur?: number; suffix?: string; size?: number; color?: string }> = ({ to, at = 0, dur = 24, suffix = "%", size = 200, color = C.chalk }) => {
  const f = useCurrentFrame();
  const v = Math.round(interpolate(f, [at, at + dur], [0, to], { ...clamp, easing: ease }));
  return <div style={{ fontFamily: F.display, fontWeight: 900, fontStretch: "130%", fontSize: size, lineHeight: 0.9, color, fontVariantNumeric: "tabular-nums" }}>{v}{suffix}</div>;
};

export const Fade: React.FC<{ dur: number; inF?: number; outF?: number; children: React.ReactNode }> = ({ dur, inF = 8, outF = 8, children }) => {
  const f = useCurrentFrame();
  const o = Math.min(inF ? interpolate(f, [0, inF], [0, 1], clamp) : 1, outF ? interpolate(f, [dur - outF, dur], [1, 0], clamp) : 1);
  return <AbsoluteFill style={{ opacity: o }}>{children}</AbsoluteFill>;
};

export const Vignette: React.FC<{ strength?: number }> = ({ strength = 0.55 }) => (
  <AbsoluteFill style={{ background: `radial-gradient(ellipse at center, rgba(0,0,0,0) 45%, rgba(0,0,0,${strength}) 100%)`, pointerEvents: "none" }} />
);

export const Logo: React.FC<{ size?: number; color?: string }> = ({ size = 120, color = C.chalk }) => (
  <svg width={size} height={size} viewBox="0 0 22 22">
    <g fill="none" stroke={color} strokeWidth="1.6" strokeLinejoin="round">
      <path d="M3 15l8 4 8-4" />
      <path d="M3 11l8 4 8-4" opacity=".6" />
      <path d="M3 7l8 4 8-4-8-4z" opacity=".35" />
    </g>
    <circle cx="11" cy="19" r="2" fill={C.lime} />
  </svg>
);

/** Small honest source tag for product footage. */
export const SourceTag: React.FC<{ text?: string }> = ({ text = "Real product capture · synthetic demo match" }) => (
  <div style={{ position: "absolute", right: 40, bottom: 34, fontFamily: F.mono, fontSize: 15, letterSpacing: "0.12em", color: "rgba(244,246,255,.62)", textTransform: "uppercase" }}>{text}</div>
);
