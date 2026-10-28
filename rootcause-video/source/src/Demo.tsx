import React from "react";
import { AbsoluteFill, Audio, Sequence, interpolate, staticFile, useCurrentFrame } from "remotion";
import { C, F } from "./theme";
import { CLIPS, SCENES, s } from "./timeline";
import { Callout, Cam, Count, Fade, Headline, Logo, Screen, SceneChip, Seq, SourceTag, Still, Tag, Vignette, ease, fontFaces } from "./components";

const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;
const BG: React.FC<{ color?: string }> = ({ color = C.night }) => <AbsoluteFill style={{ background: color }} />;
const Glow: React.FC = () => (
  <AbsoluteFill style={{ background: `radial-gradient(1200px 700px at 50% 38%, ${C.plate}55, transparent 70%), linear-gradient(180deg, ${C.cobalt}, ${C.deep} 70%, ${C.ink})` }} />
);
/** wraps a shot: fades in/out and shows the scene chip */
const Shot: React.FC<{ from: number; dur: number; children: React.ReactNode; inF?: number; outF?: number }> = ({ from, dur, children, inF = 5, outF = 3 }) => (
  <Sequence from={from} durationInFrames={dur}>
    <Fade dur={dur} inF={inF} outF={outF}>{children}</Fade>
  </Sequence>
);
const chip = (i: number) => {
  const sc = SCENES[i];
  return (
    <Sequence from={0} durationInFrames={s(sc.to - sc.from)}>
      <SceneChip id={sc.id} name={sc.name} dur={s(sc.to - sc.from)} />
    </Sequence>
  );
};
/** lower-third caption bar used over product footage */
const Lower: React.FC<{ kicker: string; title: string; at?: number; out?: number }> = ({ kicker, title, at = 6, out }) => {
  const f = useCurrentFrame();
  const p = interpolate(f, [at, at + 14], [0, 1], { ...clamp, easing: ease });
  const o = out !== undefined ? interpolate(f, [out, out + 8], [1, 0], clamp) : 1;
  return (
    <div style={{ position: "absolute", left: 96, top: 92, opacity: o * p, transform: `translateY(${(1 - p) * 16}px)` }}>
      <div style={{ fontFamily: F.mono, fontSize: 22, letterSpacing: "0.22em", color: C.lime, textTransform: "uppercase", marginBottom: 12 }}>{kicker}</div>
      <div style={{ fontFamily: F.display, fontWeight: 900, fontStretch: "130%", fontSize: 64, lineHeight: 1, color: C.chalk, textTransform: "uppercase", textShadow: "0 6px 30px rgba(0,0,0,.6)", maxWidth: 1100 }}>{title}</div>
    </div>
  );
};
const Shade: React.FC<{ top?: boolean }> = ({ top = true }) => (
  <AbsoluteFill style={{ background: top ? "linear-gradient(180deg, rgba(3,8,31,.85) 0%, rgba(3,8,31,.0) 38%)" : "linear-gradient(0deg, rgba(3,8,31,.85) 0%, rgba(3,8,31,0) 40%)" }} />
);

// ---------------------------------------------------------------- SCENE 1  0-12 s
const Hook: React.FC = () => {
  const f = useCurrentFrame();
  const flash = interpolate(f, [s(4.95), s(5.0), s(5.35)], [0, 0.85, 0], clamp);
  return (
    <AbsoluteFill>
      <BG />
      {/* 1.2-5.0: the goal, live from the Autopsy, slow push-in */}
      <Shot from={s(1.2)} dur={s(3.8)} inF={20} outF={0}>
        <Cam a={{ x: 1250, y: 560, z: 1.25 }} b={{ x: 1300, y: 540, z: 1.55 }} dur={s(3.8)}>
          <Seq clip={CLIPS.goal} start={40} rate={1} />
        </Cam>
        <Vignette strength={0.75} />
      </Shot>
      {/* 5.0-6.3: freeze + rewind, played backwards fast */}
      <Sequence from={s(5.0)} durationInFrames={s(1.3)}>
        <Cam a={{ x: 1300, y: 540, z: 1.55 }} b={{ x: 1200, y: 560, z: 1.3 }} dur={s(1.3)}>
          <Seq clip={CLIPS.goal} start={97} rate={4.5} reverse style={{ filter: "saturate(0.6) contrast(1.15) hue-rotate(-12deg)" }} />
        </Cam>
        <AbsoluteFill style={{ background: "repeating-linear-gradient(0deg, rgba(255,255,255,.05) 0 2px, transparent 2px 5px)" }} />
        <Vignette strength={0.8} />
        <Tag at={0} color={C.lime} style={{ position: "absolute", right: 80, top: 80 }} dot={false}>◀◀ Rewind</Tag>
      </Sequence>
      {/* 6.3-9.6: frozen first frame, dimmed, with the question */}
      <Sequence from={s(6.3)} durationInFrames={s(3.3)}>
        <Cam a={{ x: 1200, y: 560, z: 1.3 }} b={{ x: 1180, y: 560, z: 1.4 }} dur={s(3.3)}>
          <Seq clip={CLIPS.goal} hold={40} style={{ filter: "brightness(.45) blur(2px) saturate(.7)" }} />
        </Cam>
        <AbsoluteFill style={{ alignItems: "center", justifyContent: "center" }}>
          <Headline text="But what actually caused it?" at={2} size={118} accentWords={["caused"]} width={1500} out={s(3.3) - 8} />
        </AbsoluteFill>
      </Sequence>
      {/* 2.4-5.0 first line over the live goal */}
      <Sequence from={s(2.4)} durationInFrames={s(2.6)}>
        <AbsoluteFill style={{ justifyContent: "flex-end", padding: "0 0 120px 110px" }}>
          <Headline text="Every goal has a story." size={104} align="left" width={1300} accentWords={["story"]} out={s(2.6) - 6} />
        </AbsoluteFill>
      </Sequence>
      <AbsoluteFill style={{ background: "#fff", opacity: flash }} />
      {/* 9.6-12: brand reveal on cobalt */}
      <Sequence from={s(9.6)} durationInFrames={s(2.4)}>
        <BrandReveal />
      </Sequence>
      {/* opening tag */}
      <Sequence from={s(0.3)} durationInFrames={s(1.6)}>
        <AbsoluteFill style={{ alignItems: "center", justifyContent: "center" }}>
          <Tag at={2} color={C.sky}>West London Blues v Manchester Sky Blues · 28:24</Tag>
        </AbsoluteFill>
      </Sequence>
    </AbsoluteFill>
  );
};
const BrandReveal: React.FC = () => {
  const f = useCurrentFrame();
  const wipe = interpolate(f, [0, 10], [0, 100], { ...clamp, easing: ease });
  const lp = interpolate(f, [4, 22], [0, 1], { ...clamp, easing: ease });
  return (
    <AbsoluteFill style={{ clipPath: `circle(${wipe * 1.2}% at 50% 50%)` }}>
      <Glow />
      <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", gap: 34, flexDirection: "column" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 34, transform: `scale(${0.9 + lp * 0.1 + f / 1500})`, opacity: lp }}>
          <Logo size={150} />
          <div style={{ fontFamily: F.display, fontWeight: 900, fontStretch: "130%", fontSize: 150, letterSpacing: "0.02em", color: C.chalk }}>ROOT CAUSE</div>
        </div>
        <Tag at={12} color={C.chalk}>A debugger for football</Tag>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

// ---------------------------------------------------------------- SCENE 2  12-26 s
const Product: React.FC = () => (
  <AbsoluteFill>
    <Glow />
    {/* 12-16.5 landing page on a floating screen */}
    <Shot from={0} dur={s(4.5)} inF={10}>
      <Glow />
      <AbsoluteFill style={{ alignItems: "center", paddingTop: 70 }}>
        <Headline text="Football intelligence. Explained." size={78} accentWords={["Explained"]} at={4} />
      </AbsoluteFill>
      <ScreenRise dur={s(4.5)}>
        <Seq clip={CLIPS.home} rate={0.9} />
      </ScreenRise>
    </Shot>
    {/* 16.5-20 matches -> zoom into the 4-4 card */}
    <Shot from={s(4.5)} dur={s(3.5)}>
      <Cam a={{ x: 960, y: 540, z: 1 }} b={{ x: 470, y: 470, z: 1.9 }} dur={s(2.6)}>
        <Still src="captures/pages/matches@2x.jpg" />
        <Callout x={292} y={426} w={330} h={124} at={s(2.3)} label="8 goals · 4 traced" labelSide="bottom" />
      </Cam>
    </Shot>
    {/* 20-23 match page hero */}
    <Shot from={s(8)} dur={s(3)}>
      <Cam a={{ x: 960, y: 520, z: 1.08 }} b={{ x: 900, y: 560, z: 1.0 }} dur={s(3)}>
        <Still src="captures/pages/match-top@2x.jpg" />
      </Cam>
    </Shot>
    {/* 23-26 scroll to every goal judged */}
    <Shot from={s(11)} dur={s(3)} outF={6}>
      <Seq clip={CLIPS.matchScroll} rate={1.35} />
    </Shot>
  </AbsoluteFill>
);
const ScreenRise: React.FC<{ dur: number; children: React.ReactNode }> = ({ dur, children }) => {
  const f = useCurrentFrame();
  const p = interpolate(f, [0, 30], [0, 1], { ...clamp, easing: ease });
  const drift = interpolate(f, [0, dur], [0, 1], clamp);
  return (
    <Screen scale={0.66 + drift * 0.04} rotX={14 - p * 8} rotY={-6 + drift * 6} y={130 + (1 - p) * 120}>{children}</Screen>
  );
};

// ---------------------------------------------------------------- SCENE 3  26-48 s
const Replay: React.FC = () => (
  <AbsoluteFill>
    <BG />
    {/* 26-33: the goal, full clip, slow camera */}
    <Shot from={0} dur={s(7)}>
      <Cam a={{ x: 1200, y: 620, z: 1.4 }} b={{ x: 1230, y: 590, z: 1.62 }} dur={s(7)}>
        <Seq clip={CLIPS.goal} />
      </Cam>
      <Shade />
      <Lower kicker="Goal autopsy · 28:24" title="Corner. Header. 1–1." at={10} out={s(6.5)} />
      <SourceTag />
    </Shot>
    {/* 33-40: the move with the back line */}
    <Shot from={s(7)} dur={s(7)}>
      <Cam a={{ x: 1180, y: 640, z: 1.4 }} b={{ x: 1200, y: 620, z: 1.6 }} dur={s(7)}>
        <Seq clip={CLIPS.move} rate={0.86} />
      </Cam>
      <Shade />
      <Lower kicker="3D reconstruction" title="Walk back from the goal, second by second." at={8} out={s(6.5)} />
      <SourceTag text="Illustrative tactical replay reconstructed from match events" />
    </Shot>
    {/* 40-44: slow motion on the decisive moment */}
    <Shot from={s(14)} dur={s(4)}>
      <Cam a={{ x: 1180, y: 620, z: 1.7 }} b={{ x: 1180, y: 610, z: 1.95 }} dur={s(4)}>
        <Seq clip={CLIPS.move} start={50} rate={0.5} />
      </Cam>
      <Shade />
      <Tag at={4} color={C.lime} style={{ position: "absolute", left: 96, top: 96 }}>Slow motion · the yellow line is the back line</Tag>
      <SourceTag text="Illustrative off-ball movement" />
    </Shot>
    {/* 44-48: top-down replay in Explore with the run traced */}
    <Shot from={s(18)} dur={s(4)}>
      <Cam a={{ x: 700, y: 560, z: 1.0 }} b={{ x: 520, y: 640, z: 1.35 }} dur={s(4)}>
        <Still src="captures/pages/explore-whatif.jpg" />
        <Callout x={360} y={700} w={190} h={180} at={s(1.4)} label="25 · Akendo" labelSide="right" />
      </Cam>
    </Shot>
    {chip(2)}
  </AbsoluteFill>
);

// ---------------------------------------------------------------- SCENE 4  48-72 s
const Autopsy: React.FC = () => (
  <AbsoluteFill>
    <BG />
    {/* 48-52: headline */}
    <Shot from={0} dur={s(4)} inF={6}>
      <Cam a={{ x: 1300, y: 540, z: 1.5 }} b={{ x: 1300, y: 540, z: 1.6 }} dur={s(4)}>
        <Seq clip={CLIPS.mistakes} hold={0} style={{ filter: "brightness(.35) blur(3px)" }} />
      </Cam>
      <AbsoluteFill style={{ alignItems: "center", justifyContent: "center" }}>
        <Headline text="From the final touch to the first mistake." size={100} accentWords={["first", "mistake"]} width={1500} at={4} />
      </AbsoluteFill>
    </Shot>
    {/* 52-57: mistake 1 of 2 in the 3D autopsy */}
    <Shot from={s(4)} dur={s(5)}>
      <Cam a={{ x: 760, y: 640, z: 1.15 }} b={{ x: 760, y: 650, z: 1.25 }} dur={s(5)}>
        <Seq clip={CLIPS.mistakes} />
        <Callout x={20} y={732} w={428} h={266} at={s(1.6)} label="Evidence from the trace" labelSide="top" />
      </Cam>
      <SourceTag text="Highlighted evidence positions are recorded" />
    </Shot>
    {/* 57-62: the stack trace, read upward */}
    <Shot from={s(9)} dur={s(5)}>
      <Cam a={{ x: 1400, y: 470, z: 1.25 }} b={{ x: 1500, y: 500, z: 1.75 }} dur={s(5)}>
        <Still src="captures/pages/explore-expert.jpg" />
        <Callout x={1264} y={398} w={474} h={156} at={s(1.2)} label="Root cause · 84%" labelSide="top" />
        <Callout x={1264} y={556} w={474} h={152} at={s(2.6)} label="Second suspect · 16%" labelSide="bottom" />
      </Cam>
      <Lower kicker="How it happened" title="A stack trace for a goal." at={6} out={s(4.4)} />
    </Shot>
    {/* 62-67: the test, two pitches side by side */}
    <Shot from={s(14)} dur={s(5)}>
      <Cam a={{ x: 1180, y: 560, z: 1.4 }} b={{ x: 1180, y: 560, z: 1.7 }} dur={s(5)}>
        <Seq clip={CLIPS.test} />
      </Cam>
      <Shade />
      <Lower kicker="Two suspects" title="Akendo or Diales?" at={8} out={s(4.5)} />
      <SourceTag />
    </Shot>
    {/* 67-72: the verdict card */}
    <Shot from={s(19)} dur={s(5)} outF={6}>
      <Cam a={{ x: 1500, y: 380, z: 1.3 }} b={{ x: 1500, y: 380, z: 1.85 }} dur={s(5)}>
        <Still src="captures/pages/explore-verdict-simple.jpg" />
        <Callout x={1266} y={262} w={470} h={234} at={s(1.4)} label="The identified root cause" labelSide="bottom" />
      </Cam>
    </Shot>
    {chip(3)}
  </AbsoluteFill>
);

// ---------------------------------------------------------------- SCENE 5  72-94 s
const Counterfactual: React.FC = () => {
  return (
    <AbsoluteFill>
      <BG />
      {/* 72-79: split screen: what happened / what if it didn't */}
      <Shot from={0} dur={s(7)} inF={6}>
        <SplitWhatIf />
      </Shot>
      {/* 79-85: 200 replays chapter */}
      <Shot from={s(7)} dur={s(6)}>
        <Cam a={{ x: 1185, y: 560, z: 1.55 }} b={{ x: 1185, y: 540, z: 1.75 }} dur={s(6)}>
          <Seq clip={CLIPS.replays} />
        </Cam>
        <Shade />
        <Lower kicker="Trial by replay" title="200 replays. One deeper explanation." at={6} out={s(5.5)} />
        <ReplayStats />
        <SourceTag text="Replay results are the engine's recorded runs" />
      </Shot>
      {/* 85-89.5: verdict chapter */}
      <Shot from={s(13)} dur={s(4.5)}>
        <Cam a={{ x: 1350, y: 420, z: 1.4 }} b={{ x: 1380, y: 430, z: 1.55 }} dur={s(4.5)}>
          <Seq clip={CLIPS.verdict} rate={0.9} />
        </Cam>
        <AbsoluteFill style={{ background: "linear-gradient(90deg, rgba(3,8,31,.85), rgba(3,8,31,0) 45%)" }} />
        <AbsoluteFill style={{ alignItems: "flex-start", justifyContent: "flex-end", padding: "0 0 150px 110px" }}>
          <div>
            <Tag at={6} color={C.lime}>Verdict · share of the blame</Tag>
            <Count to={84} at={10} dur={30} size={200} color={C.chalk} />
            <div style={{ fontFamily: F.display, fontWeight: 800, fontSize: 52, color: C.chalk, textTransform: "uppercase" }}>Akendo</div>
            <div style={{ fontFamily: F.mono, fontSize: 24, color: C.sky, marginTop: 10, letterSpacing: "0.06em" }}>Diales 16%</div>
          </div>
        </AbsoluteFill>
      </Shot>
      {/* 89.5-94: the fix */}
      <Shot from={s(17.5)} dur={s(4.5)} outF={6}>
        <Cam a={{ x: 760, y: 640, z: 1.15 }} b={{ x: 760, y: 650, z: 1.25 }} dur={s(4.5)}>
          <Seq clip={CLIPS.fix} />
        </Cam>
        <Shade />
        <Lower kicker="The fix" title="Measured, not guessed." at={6} />
        <SourceTag text="Illustrative movement · numbers from the recorded trace" />
      </Shot>
      {chip(4)}
    </AbsoluteFill>
  );
};
const SplitWhatIf: React.FC = () => {
  const f = useCurrentFrame();
  const split = interpolate(f, [0, 18], [0, 1], { ...clamp, easing: ease });
  const pane = (src: string, label: string, color: string, pct: number, n: string, at: number, right: boolean) => (
    <div style={{ position: "absolute", top: 0, bottom: 0, width: 960, left: right ? 960 : 0, overflow: "hidden", borderLeft: right ? `3px solid ${C.lime}` : undefined }}>
      <div style={{ position: "absolute", left: -170, top: -70, width: 1920, height: 1080, transformOrigin: "560px 600px", transform: `scale(${1 + f / 3000})` }}>
        <Still src={src} />
      </div>
      <AbsoluteFill style={{ background: "linear-gradient(180deg, rgba(3,8,31,.9), rgba(3,8,31,.2) 35%, rgba(3,8,31,.2) 60%, rgba(3,8,31,.92))" }} />
      <div style={{ position: "absolute", left: 70, top: 70 }}>
        <Headline text={label} size={70} align="left" width={820} at={at} accentWords={right ? ["didn't"] : []} />
      </div>
      <div style={{ position: "absolute", left: 70, bottom: 70 }}>
        <Tag at={at + 20} color={color}>Goals in 200 replays · {n}</Tag>
        <Count to={pct} at={at + 22} size={190} color={color} />
      </div>
    </div>
  );
  return (
    <AbsoluteFill style={{ opacity: split }}>
      {pane("captures/pages/explore-whatif.jpg", "What happened", C.chalk, 71, "142 / 200", 4, false)}
      {pane("captures/pages/explore-whatif-fixed.jpg", "What if it didn't?", C.lime, 7, "14 / 200", 34, true)}
    </AbsoluteFill>
  );
};
const ReplayStats: React.FC = () => {
  const rows: [string, number, string][] = [["As played", 71, C.chalk], ["Akendo level", 7, C.lime], ["Diales level", 59, C.sky]];
  const f = useCurrentFrame();
  return (
    <div style={{ position: "absolute", right: 96, bottom: 120, width: 560, background: "rgba(3,8,31,.78)", border: "1px solid rgba(255,255,255,.14)", borderRadius: 20, padding: "26px 30px" }}>
      {rows.map(([k, v, c], i) => {
        const p = interpolate(f, [s(1.2) + i * 18, s(1.2) + i * 18 + 26], [0, 1], { ...clamp, easing: ease });
        return (
          <div key={k} style={{ marginBottom: i < 2 ? 22 : 0, opacity: p }}>
            <div style={{ display: "flex", justifyContent: "space-between", fontFamily: F.mono, fontSize: 22, color: C.chalk, letterSpacing: "0.08em", textTransform: "uppercase" }}>
              <span>{k}</span><span style={{ color: c, fontWeight: 700 }}>{Math.round(v * p)}% score</span>
            </div>
            <div style={{ height: 10, borderRadius: 5, background: "rgba(255,255,255,.12)", marginTop: 10 }}>
              <div style={{ height: 10, borderRadius: 5, width: `${v * p}%`, background: c }} />
            </div>
          </div>
        );
      })}
    </div>
  );
};

// ---------------------------------------------------------------- SCENE 6  94-112 s
const Perspectives: React.FC = () => (
  <AbsoluteFill>
    <Glow />
    {/* 94-100: fan vs analyst */}
    <Shot from={0} dur={s(6)} inF={6}>
      <Glow />
      <DuoCards />
    </Shot>
    {/* 100-104.5: languages */}
    <Shot from={s(6)} dur={s(4.5)}>
      <Glow />
      <LangFlip />
    </Shot>
    {/* 104.5-112: Tactics Lab layers */}
    <Shot from={s(10.5)} dur={s(7.5)} outF={6}>
      <LabMontage />
    </Shot>
    {chip(5)}
  </AbsoluteFill>
);
const DuoCards: React.FC = () => {
  const f = useCurrentFrame();
  const a = interpolate(f, [0, 22], [0, 1], { ...clamp, easing: ease });
  const b = interpolate(f, [s(2.2), s(2.2) + 22], [0, 1], { ...clamp, easing: ease });
  const card = (src: string, label: string, sub: string, p: number, x: number, at: number, focus: { x: number; y: number }) => (
    <div style={{ position: "absolute", left: x, top: 250, width: 860, opacity: p, transform: `translateY(${(1 - p) * 60}px)` }}>
      <div style={{ width: 860, height: 600, borderRadius: 18, overflow: "hidden", boxShadow: "0 40px 100px rgba(0,0,0,.5), 0 0 0 2px rgba(255,255,255,.12)", position: "relative" }}>
        <div style={{ position: "absolute", left: -focus.x, top: -focus.y, transformOrigin: `${focus.x + 430}px ${focus.y + 300}px`, transform: `scale(${1 + f / 2500})` }}><Still src={src} /></div>
      </div>
      <div style={{ marginTop: 26 }}>
        <Headline text={label} size={64} align="left" width={860} at={at} accentWords={["fan", "analyst"]} />
        <div style={{ fontFamily: F.body, fontSize: 28, color: C.sky, marginTop: 4 }}>{sub}</div>
      </div>
    </div>
  );
  return (
    <AbsoluteFill>
      {card("captures/pages/explore-verdict-simple.jpg", "For the fan.", "Simple: the verdict in plain words.", a, 80, 8, { x: 1060, y: 70 })}
      {card("captures/pages/explore-expert.jpg", "For the analyst.", "Expert: the full stack trace and replay counts.", b, 980, s(2.2) + 8, { x: 1060, y: 70 })}
      <div style={{ position: "absolute", left: 80, top: 120 }}><Tag at={4} color={C.chalk}>One match · every perspective</Tag></div>
    </AbsoluteFill>
  );
};
const LangFlip: React.FC = () => {
  const f = useCurrentFrame();
  const shots = ["captures/pages/explore-verdict-simple.jpg", "captures/pages/explore-hi.jpg", "captures/pages/explore-es.jpg"];
  const labels = ["English", "हिन्दी", "Español"];
  const seg = s(4.5) / 3;
  const i = Math.min(2, Math.floor(f / seg));
  const local = f - i * seg;
  const p = interpolate(local, [0, 10], [0, 1], { ...clamp, easing: ease });
  return (
    <AbsoluteFill>
      <Screen scale={0.7 + f / 4000} y={70} rotY={-4 + f / 40} opacity={1}>
        <div style={{ opacity: p }}><Still src={shots[i]} /></div>
      </Screen>
      <div style={{ position: "absolute", left: 0, right: 0, top: 70, display: "flex", justifyContent: "center", gap: 40, fontFamily: F.display, fontWeight: 800, fontSize: 54, color: C.chalk }}>
        {labels.map((l, k) => (
          <span key={l} style={{ opacity: k === i ? 1 : 0.35, color: k === i ? C.lime : C.chalk, fontFamily: k === 1 ? "Noto Sans Devanagari, sans-serif" : F.display }}>{l}</span>
        ))}
      </div>
    </AbsoluteFill>
  );
};
const LabMontage: React.FC = () => {
  const parts: [keyof typeof CLIPS, string, number][] = [["labSpace", "Space", s(2.6)], ["labOptions", "Passing options", s(1.6)], ["labPressure", "Pressure", s(1.6)], ["labRuns", "Runs", s(1.7)]];
  let at = 0;
  return (
    <AbsoluteFill>
      {parts.map(([k, label, d]) => {
        const from = at; at += d;
        return (
          <Sequence key={k} from={from} durationInFrames={d}>
            <Cam a={{ x: 790, y: 700, z: 1.32 }} b={{ x: 790, y: 690, z: 1.4 }} dur={d}>
              <Seq clip={CLIPS[k]} rate={(CLIPS[k].n / 15) / (d / 30)} />
            </Cam>
            <Tag at={2} color={C.lime} style={{ position: "absolute", left: 96, bottom: 150, fontSize: 30 }}>{label}</Tag>
          </Sequence>
        );
      })}
      <Shade />
      <Lower kicker="Tactics Lab" title="All ninety minutes, opened up." at={4} />
    </AbsoluteFill>
  );
};

// ---------------------------------------------------------------- SCENE 7  112-120 s
const Finale: React.FC = () => {
  const f = useCurrentFrame();
  const end = interpolate(f, [s(6.8), s(8)], [1, 0], clamp);
  const cuts = [CLIPS.goal, CLIPS.replays, CLIPS.verdict];
  return (
    <AbsoluteFill style={{ opacity: end }}>
      <BG />
      {cuts.map((c, i) => (
        <Sequence key={i} from={i * 12} durationInFrames={12}>
          <Cam a={{ x: 1250, y: 540, z: 1.3 }} b={{ x: 1250, y: 540, z: 1.45 }} dur={12}>
            <Seq clip={c} start={c.n - 30} rate={1} />
          </Cam>
        </Sequence>
      ))}
      <Sequence from={36}>
        <EndCard />
      </Sequence>
    </AbsoluteFill>
  );
};
const EndCard: React.FC = () => {
  const f = useCurrentFrame();
  const wipe = interpolate(f, [0, 14], [0, 100], { ...clamp, easing: ease });
  const lp = interpolate(f, [6, 26], [0, 1], { ...clamp, easing: ease });
  return (
    <AbsoluteFill style={{ clipPath: `inset(${50 - wipe / 2}% 0 ${50 - wipe / 2}% 0)` }}>
      <Glow />
      <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", flexDirection: "column", gap: 30 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 30, opacity: lp, transform: `scale(${0.94 + lp * 0.06 + f / 3000})` }}>
          <Logo size={130} />
          <div style={{ fontFamily: F.display, fontWeight: 900, fontStretch: "130%", fontSize: 140, color: C.chalk, letterSpacing: "0.02em" }}>ROOT CAUSE</div>
        </div>
        <Headline text="Every goal has a bug." size={84} accentWords={["bug"]} at={18} />
        <div style={{ marginTop: 40 }}><Tag at={40} color={C.sky} dot={false}>Built for Microsoft × Premier League — Inside the Game</Tag></div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

export const Demo: React.FC = () => (
  <AbsoluteFill style={{ background: C.night }}>
    <style>{fontFaces}</style>
    <Sequence from={0} durationInFrames={s(12)}><Hook /></Sequence>
    <Sequence from={s(12)} durationInFrames={s(14)}><Product />{chip(1)}</Sequence>
    <Sequence from={s(26)} durationInFrames={s(22)}><Replay /></Sequence>
    <Sequence from={s(48)} durationInFrames={s(24)}><Autopsy /></Sequence>
    <Sequence from={s(72)} durationInFrames={s(22)}><Counterfactual /></Sequence>
    <Sequence from={s(94)} durationInFrames={s(18)}><Perspectives /></Sequence>
    <Sequence from={s(112)} durationInFrames={s(8)}><Finale /></Sequence>
    <Audio src={staticFile("audio/mix.wav")} />
  </AbsoluteFill>
);
