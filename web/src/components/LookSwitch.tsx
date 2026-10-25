import { FONT, FONTS, LOOK, LOOKS } from "../theme/looks";

/** Preview builds only: flips the whole site between looks and headline fonts. A reload, so the 3D scenes repaint too. */
export function LookSwitch() {
  const go = (key: "look" | "font", v: string) => {
    const u = new URL(location.href);
    u.searchParams.set(key, v);
    location.assign(u.toString());
  };
  const pill = (on: boolean) => `flex shrink-0 items-center gap-2 rounded-full px-3 py-1.5 ${on ? "bg-white text-black" : "text-white/70 hover:text-white"}`;
  return (
    <div className="fixed bottom-4 left-1/2 z-[60] grid max-w-[calc(100vw-24px)] -translate-x-1/2 gap-1 rounded-[22px] bg-black/85 p-1 text-[13px] font-medium shadow-2xl backdrop-blur-md" style={{ fontFamily: "Inter, system-ui, sans-serif" }}>
      <div role="group" aria-label="Look" className="flex gap-1 overflow-x-auto">
        {Object.values(LOOKS).map((l) => (
          <button key={l.id} type="button" aria-pressed={l.id === LOOK.id} onClick={() => go("look", l.id)} className={pill(l.id === LOOK.id)}>
            <i aria-hidden className="block h-3 w-3 rounded-full" style={{ background: `linear-gradient(135deg, ${l.tones.ground} 50%, ${l.tones.flare} 50%)`, boxShadow: "inset 0 0 0 1px rgba(255,255,255,.3)" }} />
            {l.name}
          </button>
        ))}
      </div>
      <div role="group" aria-label="Headline font" className="flex gap-1 overflow-x-auto">
        <button type="button" aria-pressed={!FONT} onClick={() => go("font", "none")} className={pill(!FONT)}>Look's own font</button>
        {Object.entries(FONTS).map(([id, f]) => (
          <button key={id} type="button" aria-pressed={FONT === id} onClick={() => go("font", id)} className={pill(FONT === id)} style={{ fontFamily: f.display, fontWeight: f.weight, fontSize: 15 }}>
            {f.name}
          </button>
        ))}
      </div>
    </div>
  );
}
