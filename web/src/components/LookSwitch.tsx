import { LOOK, LOOKS, type LookId } from "../theme/looks";

/** Preview builds only: flips the whole site between looks. A reload, so the 3D scenes repaint too. */
export function LookSwitch() {
  const pick = (id: LookId) => {
    const u = new URL(location.href);
    u.searchParams.set("look", id);
    location.assign(u.toString());
  };
  return (
    <div role="group" aria-label="Look" className="fixed bottom-4 left-1/2 z-[60] flex max-w-[calc(100vw-24px)] -translate-x-1/2 gap-1 overflow-x-auto rounded-full bg-black/80 p-1 text-[13px] font-medium shadow-2xl backdrop-blur-md" style={{ fontFamily: "Inter, system-ui, sans-serif" }}>
      {Object.values(LOOKS).map((l) => (
        <button
          key={l.id}
          type="button"
          aria-pressed={l.id === LOOK.id}
          onClick={() => pick(l.id)}
          className={`flex shrink-0 items-center gap-2 rounded-full px-3 py-2 ${l.id === LOOK.id ? "bg-white text-black" : "text-white/70 hover:text-white"}`}
        >
          <i aria-hidden className="block h-3 w-3 rounded-full" style={{ background: `linear-gradient(135deg, ${l.tones.ground} 50%, ${l.tones.flare} 50%)`, boxShadow: "inset 0 0 0 1px rgba(255,255,255,.3)" }} />
          {l.name}
        </button>
      ))}
    </div>
  );
}
