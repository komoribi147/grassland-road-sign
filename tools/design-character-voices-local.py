"""Produce four age/emotion candidates using the official model locally.

The existing story bank is left unchanged until the user hears these candidates.
"""
from pathlib import Path
import argparse
import gc
import json
import os
import sys
import time
import urllib.request

ROOT = Path(__file__).resolve().parents[1]
os.environ["HF_HUB_OFFLINE"] = "1"
os.environ["HF_HUB_DISABLE_TELEMETRY"] = "1"
os.environ["TRANSFORMERS_OFFLINE"] = "1"


def release_chat_model():
    opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))
    with opener.open("http://127.0.0.1:11434/api/ps", timeout=8) as response:
        loaded = json.load(response).get("models", [])
    for model in loaded:
        name = model.get("name", "")
        if name != "qwen2.5:14b":
            continue
        request = urllib.request.Request("http://127.0.0.1:11434/api/generate", data=json.dumps({"model": name, "keep_alive": 0}).encode(), headers={"Content-Type": "application/json"})
        with opener.open(request, timeout=30) as response:
            response.read()
        print("Temporarily released chat model VRAM; next chat request reloads it automatically.", flush=True)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("npc", nargs="?")
    parser.add_argument("--release-chat-vram", action="store_true")
    args = parser.parse_args()
    if args.release_chat_vram:
        release_chat_model()
    import torch
    import soundfile as sf
    from qwen_tts import Qwen3TTSModel
    torch.set_num_threads(4)
    if not torch.cuda.is_available():
        raise RuntimeError("CUDA GPU is required for this local preview; GPU torch installation is incomplete.")
    print("GPU", torch.cuda.get_device_name(0), "free bytes", torch.cuda.mem_get_info()[0], flush=True)
    started = time.time()
    model = Qwen3TTSModel.from_pretrained(str(ROOT / "node_modules" / ".voice-models" / "qwen-voice-design"), device_map="cuda:0", dtype=torch.bfloat16, attn_implementation="sdpa")
    print(f"MODEL_LOADED {time.time()-started:.1f}s", flush=True)
    profiles = json.loads((ROOT / "story/voice-designs.json").read_text(encoding="utf-8"))
    output = ROOT / "assets/audio/voice-candidates"
    output.mkdir(parents=True, exist_ok=True)
    for i, (npc, profile) in enumerate(profiles.items()):
        if args.npc and args.npc != npc:
            continue
        torch.manual_seed(4100 + i)
        print("GENERATING", npc, flush=True)
        started = time.time()
        with torch.inference_mode():
            wavs, sr = model.generate_voice_design(text=profile["sample"], language="Chinese", instruct=profile["description"], non_streaming_mode=True, max_new_tokens=480)
        target = output / f"{npc}-qwen-local.wav"
        sf.write(str(target), wavs[0], sr, subtype="PCM_16")
        info = sf.info(str(target))
        print(f"SAVED {npc}: {info.duration:.2f}s, {sr}Hz; generation {time.time()-started:.1f}s", flush=True)
        clips = [{"npc": key, **p, "url": f"assets/audio/voice-candidates/{key}-qwen-local.wav"}
                 for key, p in profiles.items() if (output / f"{key}-qwen-local.wav").exists()]
        (output / "manifest.json").write_text(json.dumps({"provider": "Qwen3-TTS VoiceDesign 1.7B (local GPU)", "status": "candidates for listening, not adopted", "clips": clips}, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    del model
    gc.collect()
    torch.cuda.empty_cache()


if __name__ == "__main__":
    main()
