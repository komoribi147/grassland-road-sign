"""Resume local story takes with one loaded model. No online synthesis or downloads."""
from pathlib import Path
import gc
import hashlib
import json
import os
import sys
import time

ROOT = Path(__file__).resolve().parents[1]
sys.dont_write_bytecode = True
sys.path.insert(0, str(ROOT / "server"))
from importlib.util import spec_from_file_location, module_from_spec
spec = spec_from_file_location("clone", ROOT / "server/synthesize-clone.py")
clone = module_from_spec(spec)
spec.loader.exec_module(clone)
os.environ["HF_HUB_OFFLINE"] = "1"
os.environ["TRANSFORMERS_OFFLINE"] = "1"
os.environ["HF_HUB_DISABLE_TELEMETRY"] = "1"


def digest(data):
    return hashlib.sha256(data).hexdigest()


def save_json(file, value):
    temp = file.with_suffix(".tmp")
    temp.write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    temp.replace(file)


def main():
    work = ROOT / "node_modules/.voice-batch"
    jobs = json.loads((work / "jobs.json").read_text(encoding="utf-8"))["jobs"]
    checkpoint = work / "progress.json"
    progress = json.loads(checkpoint.read_text(encoding="utf-8")) if checkpoint.exists() else {}
    todo = []
    for job in jobs:
        previous = progress.get(job["key"], {})
        target = ROOT / "voice" / job["file"]
        if previous.get("signature") == job["signature"] and target.exists() and digest(target.read_bytes()) == previous.get("sha256"):
            continue
        todo.append(job)
    print(f"RESUME {len(jobs)-len(todo)}/{len(jobs)} already complete; {len(todo)} remaining", flush=True)
    if not todo:
        return
    clone.release_dialogue_gpu()
    import torch
    import numpy as np
    import soundfile as sf
    from scipy.signal import resample_poly
    from math import gcd
    from qwen_tts import Qwen3TTSModel
    torch.set_num_threads(4)
    if not torch.cuda.is_available():
        raise RuntimeError("CUDA GPU is required")
    model = Qwen3TTSModel.from_pretrained(str(ROOT / "node_modules/.voice-models/qwen-voice-clone"), device_map="cuda:0", dtype=torch.bfloat16, attn_implementation="sdpa")
    prompts = {}
    started = time.time()
    for i, job in enumerate(todo):
        began = time.time()
        ref = job["reference"]
        ref_file = (ROOT / ref["file"]).resolve()
        if not ref_file.is_relative_to(ROOT) or digest(ref_file.read_bytes()) != ref["sha256"]:
            raise ValueError(f"Reference changed: {job['who']}")
        if job["who"] not in prompts:
            y, sr = sf.read(ref_file, dtype="float32")
            if y.ndim > 1:
                y = y.mean(axis=1)
            if sr != 24000:
                g = gcd(sr, 24000)
                y = resample_poly(y, 24000 // g, sr // g).astype(np.float32)
            with torch.inference_mode():
                prompts[job["who"]] = model.create_voice_clone_prompt(ref_audio=(y, 24000), ref_text=ref["text"], x_vector_only_mode=False)
        target = ROOT / "voice" / job["file"]
        if not target.resolve().is_relative_to(ROOT / "voice/audio"):
            raise ValueError("Invalid output path")
        target.parent.mkdir(parents=True, exist_ok=True)
        for attempt in range(2):
            try:
                torch.manual_seed(ref.get("seed", 147) + attempt)
                with torch.inference_mode():
                    wavs, sr = model.generate_voice_clone(text=job["text"], language="Chinese", voice_clone_prompt=prompts[job["who"]], non_streaming_mode=True, max_new_tokens=min(900, max(120, len(job["text"]) * 9)))
                y = np.asarray(wavs[0], dtype=np.float32).reshape(-1)
                if not np.isfinite(y).all() or np.max(np.abs(y)) < .01:
                    raise ValueError("Silent/non-finite generated audio")
                # Keep a little room before/after speech without cutting natural internal pauses.
                active = np.flatnonzero(np.abs(y) > max(.004, float(np.max(np.abs(y))) * .012))
                y = y[max(0, active[0] - int(.12 * sr)): min(len(y), active[-1] + int(.18 * sr))]
                duration = len(y) / sr
                if duration < .35 or duration > max(12, len(job["text"]) * .85 + 4):
                    raise ValueError(f"Abnormal speech duration: {duration:.2f}")
                peak = float(np.max(np.abs(y)))
                if peak > .96:
                    y *= .92 / peak
                temp = target.with_suffix(".tmp.mp3")
                sf.write(temp, y, sr, format="MP3")
                decoded, decoded_sr = sf.read(temp)
                if np.sqrt(np.mean(decoded ** 2)) < .003 or np.mean(np.abs(decoded) >= .999) > .001:
                    raise ValueError("Decoded audio silent or clipped")
                temp.replace(target)
                progress[job["key"]] = {"signature": job["signature"], "sha256": digest(target.read_bytes()), "duration": round(len(decoded) / decoded_sr, 4), "peak": round(float(np.max(np.abs(decoded))), 4), "rms": round(float(np.sqrt(np.mean(decoded ** 2))), 4), "text": job["text"]}
                save_json(checkpoint, progress)
                print(f"DONE {len(jobs)-len(todo)+i+1}/{len(jobs)} {job['key']} {duration:.2f}s ({time.time()-began:.1f}s render) {job['text'][:32]}", flush=True)
                break
            except Exception as error:
                if attempt:
                    raise
                print(f"RETRY {job['key']}: {error}", flush=True)
        gc.collect()
    print(f"COMPLETE {len(jobs)}/{len(jobs)}; session {time.time()-started:.1f}s", flush=True)


if __name__ == "__main__":
    main()
