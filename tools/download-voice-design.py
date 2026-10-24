"""Fetch official model weights into ignored project-local storage."""
from pathlib import Path
import os
import sys

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "node_modules" / ".voice-design-python"))
os.environ["HF_HUB_DISABLE_XET"] = "1"
os.environ["HF_HUB_DISABLE_TELEMETRY"] = "1"
os.environ["HF_HUB_DOWNLOAD_TIMEOUT"] = "180"
from huggingface_hub import snapshot_download

folder = snapshot_download(
    "Qwen/Qwen3-TTS-12Hz-1.7B-VoiceDesign",
    local_dir=str(ROOT / "node_modules" / ".voice-models" / "qwen-voice-design"),
    allow_patterns=["*.json", "*.txt", "*.safetensors"],
    max_workers=3,
    token=False,
)
print("MODEL_READY", folder, flush=True)
