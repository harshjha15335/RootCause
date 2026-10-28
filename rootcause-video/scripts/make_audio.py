"""Synthesise the whole score and sound effects from scratch (no samples, no third-party audio),
so every sound in the video is original and free to use.
Writes audio/music/score.wav (120 s, 48 kHz stereo)."""
import numpy as np, soundfile as sf, sys
SR = 48000; DUR = 120.0; N = int(SR * DUR)
rng = np.random.default_rng(7)
t = np.arange(N) / SR
L = np.zeros(N); R = np.zeros(N)

def env_adsr(n, a, d, s, r):
    e = np.ones(n) * s
    na, nd, nr = int(a*SR), int(d*SR), int(r*SR)
    e[:na] = np.linspace(0, 1, na) if na else 1
    e[na:na+nd] = np.linspace(1, s, len(e[na:na+nd]))
    if nr: e[-nr:] *= np.linspace(1, 0, nr)
    return e

def add(sig, start, gain=1.0, pan=0.0):
    i = int(start * SR); j = min(N, i + len(sig)); sig = sig[:j-i]
    L[i:j] += sig * gain * (1 - max(pan, 0)); R[i:j] += sig * gain * (1 + min(pan, 0))

def lowpass(x, cutoff):
    # one-pole low-pass, cutoff may be an array
    a = np.exp(-2*np.pi*np.asarray(cutoff, float)/SR) * np.ones(len(x))
    y = np.zeros_like(x); acc = 0.0
    for k in range(len(x)):
        acc = (1-a[k])*x[k] + a[k]*acc; y[k] = acc
    return y

def lp_fast(x, cutoff):
    # FFT brick-ish low-pass for long static filters
    X = np.fft.rfft(x); f = np.fft.rfftfreq(len(x), 1/SR)
    X *= 1/(1+(f/cutoff)**4); return np.fft.irfft(X, len(x))

def bp_fast(x, lo, hi):
    X = np.fft.rfft(x); f = np.fft.rfftfreq(len(x), 1/SR)
    X *= (1/(1+(f/hi)**4)) * (1/(1+(lo/np.maximum(f,1))**4)); return np.fft.irfft(X, len(x))

def note(freq, dur, kind='saw', detune=0.004):
    n = int(dur*SR); tt = np.arange(n)/SR; out = np.zeros(n)
    for d in (-detune, 0, detune):
        ph = 2*np.pi*freq*(1+d)*tt + rng.uniform(0, 6.28)
        if kind == 'saw': out += 2*((freq*(1+d)*tt + rng.uniform()) % 1) - 1
        elif kind == 'sine': out += np.sin(ph)
        elif kind == 'tri': out += 2*np.abs(2*((freq*(1+d)*tt) % 1)-1)-1
    return out/3

hz = lambda m: 440*2**((m-69)/12)

# --- stadium ambience bed: band-passed noise with slow swells (0-14 s, and quietly under the rest)
crowd = bp_fast(rng.standard_normal(N), 250, 2200)
swell = 0.55 + 0.45*np.sin(2*np.pi*t/7.3)**2
amb_env = np.interp(t, [0, 2, 10, 12.5, 14, 110, 116, 120], [0, .9, 1, .5, .18, .18, .35, 0])
crowd *= swell * amb_env / np.abs(crowd).max()
L += crowd*0.20; R += np.roll(crowd, 900)*0.20

# --- low drone in the hook
drone = note(hz(33), 12.5, 'saw', 0.003) + 0.6*note(hz(45), 12.5, 'saw', 0.005)
drone = lp_fast(drone, 220) * env_adsr(len(drone), 2.5, 0.1, 1, 2.5)
add(drone, 0, 0.35)

# --- rewind whoosh (4.9 s): reversed rising noise sweep with a pitch-falling tone
n = int(1.3*SR); w = rng.standard_normal(n)
cut = np.linspace(6000, 300, n); w = lowpass(w, cut) * np.linspace(0.2, 1, n)**2 * env_adsr(n, 0.02, 0.0, 1, 0.15)
tone = np.sin(2*np.pi*np.cumsum(np.linspace(1400, 180, n))/SR) * np.linspace(0, .5, n) * env_adsr(n, .01, 0, 1, .2)
add(w/np.abs(w).max() + 0.4*tone, 4.85, 0.40)

# --- impact boom: sub drop + noise burst
def impact(dur=2.8, f0=90, f1=34):
    n = int(dur*SR); tt = np.arange(n)/SR
    sub = np.sin(2*np.pi*np.cumsum(np.geomspace(f0, f1, n))/SR) * np.exp(-tt*1.6)
    burst = lp_fast(rng.standard_normal(n), 1800) * np.exp(-tt*9)
    return sub + 0.5*burst/np.abs(burst).max()
add(impact(), 9.6, 0.65)
add(impact(3.5, 80, 30), 111.9, 0.6)

# --- music bed 12 s -> 112 s: 100 BPM, A minor progression, pads + pulse + arpeggio
BPM = 100; beat = 60/BPM; bar = 4*beat
prog = [(57, [57, 60, 64]), (53, [53, 57, 60]), (48, [48, 52, 55]), (55, [55, 59, 62])]  # Am F C G
start, end = 12.0, 112.0
bars = int((end-start)/bar)+1
for b in range(bars):
    t0 = start + b*bar
    if t0 >= end: break
    root, chord = prog[b % 4]
    pad = sum(note(hz(m+12), bar+0.4, 'saw', 0.006) for m in chord)/3
    pad = lp_fast(pad, 1400) * env_adsr(len(pad), 0.6, 0.3, 0.8, 0.6)
    add(pad, t0, 0.16, pan=-0.25); add(np.roll(pad, 1200), t0, 0.16, pan=0.25)
    bass = lp_fast(note(hz(root-12), bar, 'saw', 0.002), 300) * env_adsr(int(bar*SR), 0.02, 0.4, 0.7, 0.2)
    add(bass, t0, 0.22)
    for k in range(4):  # soft kick each beat
        tk = t0 + k*beat
        if tk >= end - 0.5: continue
        n = int(0.35*SR); tt = np.arange(n)/SR
        kick = np.sin(2*np.pi*np.cumsum(np.geomspace(120, 42, n))/SR)*np.exp(-tt*11)
        add(kick, tk, 0.30)
    # arpeggio in 16ths, entering at 26 s, brighter through the counterfactual
    if t0 >= 26:
        seq = chord + [chord[1]+12]
        for k in range(16):
            ts = t0 + k*beat/4
            if ts >= end: break
            m = seq[k % 4] + 12 + (12 if 72 <= ts < 94 and k % 8 == 7 else 0)
            n = int(beat/4*SR*0.9)
            pl = note(hz(m), n/SR, 'tri', 0.001) * np.exp(-np.arange(n)/SR*14)
            add(pl, ts, 0.07 if ts < 72 else 0.095, pan=0.35 if k % 2 else -0.35)
    # hats from the counterfactual onwards for lift
    if 72 <= t0 < 108:
        for k in range(8):
            th = t0 + k*beat/2 + beat/4
            n = int(0.05*SR); h = bp_fast(rng.standard_normal(n), 6000, 14000)*np.exp(-np.arange(n)/SR*80)
            add(h/np.abs(h).max(), th, 0.05, pan=0.2)

# --- riser into the counterfactual verdict (76-88 s) and into the finale (106-112 s)
for s0, s1 in [(76.0, 88.0), (106.0, 111.9)]:
    n = int((s1-s0)*SR); x = rng.standard_normal(n)
    x = lowpass(x, np.geomspace(300, 7000, n)); x /= np.abs(x).max()
    add(x*np.linspace(0, 1, n)**2.5, s0, 0.16)

# --- final resolving chord (112-120 s): A minor add9 -> fade
fin = sum(note(hz(m), 8.0, 'saw', 0.007) for m in [45, 57, 60, 64, 71])/5
fin = lp_fast(fin, 1800) * env_adsr(len(fin), 0.05, 1.0, 0.7, 5.5)
add(fin, 112.0, 0.42)
bell = sum(note(hz(m), 6, 'sine', 0.0) * np.exp(-np.arange(int(6*SR))/SR*0.9) for m in [81, 84, 88])/3
add(bell, 112.05, 0.12)

# --- UI ticks at scene cuts
for tc in [12.0, 26.0, 48.0, 72.0, 94.0]:
    n = int(0.04*SR); c = bp_fast(rng.standard_normal(n), 2500, 9000)*np.exp(-np.arange(n)/SR*150)
    add(c/np.abs(c).max(), tc, 0.10)

mix = np.stack([L, R], 1)
mix /= np.abs(mix).max() / 0.9
fade = np.interp(t, [0, 0.05, 118.0, 120.0], [0, 1, 1, 0]); mix *= fade[:, None]
sf.write(sys.argv[1] if len(sys.argv) > 1 else 'score.wav', mix.astype(np.float32), SR, subtype='PCM_24')
print('ok')
