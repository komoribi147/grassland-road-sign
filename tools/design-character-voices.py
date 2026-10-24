"""Generate candidate character references with the official Qwen3-TTS demo.

User approved sending fictional character descriptions and sample dialogue to Qwen.
This creates candidates only; it does not replace the story voice bank.
"""
from pathlib import Path
import json
import shutil
import sys
import time

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "node_modules" / ".voice-design-python"))
from gradio_client import Client
import soundfile as sf


def main():
    output = ROOT / "assets" / "audio" / "voice-candidates"
    output.mkdir(parents=True, exist_ok=True)
    profiles = json.loads((ROOT / "story" / "voice-designs.json").read_text(encoding="utf-8"))
    client = Client("https://qwen-qwen3-tts.hf.space", download_files=str(ROOT / "node_modules" / ".voice-design-downloads"), verbose=False,
                    httpx_kwargs={"timeout": 60}, analytics_enabled=False, token=False)
    if "--api" in sys.argv:
        api = client.view_api(return_format="dict", print_info=False)
        for name, endpoint in api.get("named_endpoints", {}).items():
            print(name, [p.get("parameter_name") for p in endpoint.get("parameters", [])], flush=True)
        return
    selected = next((x for x in sys.argv[1:] if not x.startswith("--")), None)
    for npc, profile in profiles.items():
        if selected and npc != selected:
            continue
        target = output / f"{npc}-qwen-design.wav"
        if target.exists() and "--force" not in sys.argv:
            print(f"CACHED {npc}", flush=True)
            continue
        print(f"GENERATING {npc}", flush=True)
        started = time.time()
        result = client.predict(text=profile["sample"], language="Chinese", voice_description=profile["description"], api_name="/generate_voice_design")
        file, status = result
        if not file:
            raise RuntimeError(status)
        shutil.copyfile(file, target)
        info = sf.info(str(target))
        print(f"SAVED {npc}: {info.duration:.2f}s, {info.samplerate}Hz; generation {time.time()-started:.1f}s", flush=True)
    clips = [{"npc": npc, **profile, "url": f"assets/audio/voice-candidates/{npc}-qwen-design.wav"}
             for npc, profile in profiles.items() if (output / f"{npc}-qwen-design.wav").exists()]
    (output / "manifest.json").write_text(json.dumps({"provider": "Qwen3-TTS VoiceDesign 1.7B (official demo)", "status": "candidates for listening, not adopted", "clips": clips}, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


if __name__ == "__main__":
    main()
