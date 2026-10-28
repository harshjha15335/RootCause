"""Generate each narration line with the local Kokoro TTS model (Apache-2.0) and report durations.
Usage: python narrate.py narration.json outdir kokoro.onnx voices.bin"""
import json, sys, soundfile as sf
from kokoro_onnx import Kokoro
lines, out, model, voices = sys.argv[1:5]
k = Kokoro(model, voices)
for l in json.load(open(lines)):
    s, sr = k.create(l["text"], voice="bm_george", speed=1.0, lang="en-gb")
    sf.write(f"{out}/{l['id']}.wav", s, sr)
    print(l["id"], l["at"], round(len(s) / sr, 2), "end", round(l["at"] + len(s) / sr, 2))
