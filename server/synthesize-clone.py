"""Generate an in-character reply locally from a selected fictional role recording."""
from pathlib import Path
import gc
import json
import math
import os
import sys
import time
import urllib.request

ROOT = Path(__file__).resolve().parents[1]
os.environ["HF_HUB_OFFLINE"] = "1"
os.environ["HF_HUB_DISABLE_TELEMETRY"] = "1"
os.environ["TRANSFORMERS_OFFLINE"] = "1"


def release_dialogue_gpu():
    # The laptop has 8 GiB VRAM: release its idle local chat model while rendering.
    opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))
    try:
        with opener.open("http://127.0.0.1:11434/api/ps", timeout=5) as response:
            models = json.load(response).get("models", [])
        for model in models:
            if model.get("name") == "qwen2.5:14b":
                req = urllib.request.Request("http://127.0.0.1:11434/api/generate", data=json.dumps({"model": model["name"], "keep_alive": 0}).encode(), headers={"Content-Type": "application/json"})
                with opener.open(req, timeout=20) as response:
                    response.read()
    except Exception:
        pass


def main():
    job = json.loads(sys.stdin.buffer.read().decode("utf-8"))
    profile = job["profile"]
    reference = (ROOT / profile["referenceFile"]).resolve()
    if not reference.is_relative_to(ROOT):
        raise ValueError("Invalid reference path")
    release_dialogue_gpu()
    import torch
    import numpy as np
    import soundfile as sf
    from scipy.signal import resample_poly
    from qwen_tts import Qwen3TTSModel
    torch.set_num_threads(4)
    if not torch.cuda.is_available():
        raise RuntimeError("本地角色配音需要可用的显卡运行环境")
    model = Qwen3TTSModel.from_pretrained(str(ROOT / "node_modules/.voice-models/qwen-voice-clone"), device_map="cuda:0", dtype=torch.bfloat16, attn_implementation="sdpa")
    audio, sample_rate = sf.read(str(reference), dtype="float32")
    if audio.ndim > 1:
        audio = audio.mean(axis=1)
    if sample_rate != 24000:
        divisor = math.gcd(sample_rate, 24000)
        audio = resample_poly(audio, 24000 // divisor, sample_rate // divisor).astype(np.float32)
        sample_rate = 24000
    torch.manual_seed(profile.get("seed", 147))
    with torch.inference_mode():
        wavs, sr = model.generate_voice_clone(
            text=job["text"], language="Chinese", ref_audio=(audio, sample_rate),
            ref_text=profile["referenceText"], x_vector_only_mode=False,
            non_streaming_mode=True, max_new_tokens=min(1024, max(96, len(job["text"]) * 8)),
        )
    sf.write(job["output"], wavs[0], sr, format="WAV", subtype="PCM_16")
    del model
    gc.collect()
    torch.cuda.empty_cache()


if __name__ == "__main__":
    try:
        main()
    except Exception as error:
        print(f"{type(error).__name__}: {error}", file=sys.stderr)
        sys.exit(1)
