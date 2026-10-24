"""Download the official small Base model; reuse the verified speech tokenizer."""
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path
import hashlib
import shutil
import time
import urllib.request

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "node_modules/.voice-models/qwen-voice-clone"
SOURCE = ROOT / "node_modules/.voice-models/qwen-voice-design"
BASE = "https://modelscope.cn/models/Qwen/Qwen3-TTS-12Hz-0.6B-Base/resolve/master/"
TOTAL = 1829344272
SHA = "180b3b10eb1c9f1b4db7806d5475bae3071c0243c299d49926bab1da3b6946f6"
CHUNK = 16 * 1024 * 1024
OUT.mkdir(parents=True, exist_ok=True)
PARTS = OUT / "model.parts"
PARTS.mkdir(exist_ok=True)
def opener():
    return urllib.request.build_opener(urllib.request.ProxyHandler({}))
for name in ["config.json", "generation_config.json", "preprocessor_config.json", "tokenizer_config.json", "merges.txt", "vocab.json"]:
    with opener().open(BASE + name, timeout=40) as response:
        (OUT / name).write_bytes(response.read())
shutil.copytree(SOURCE / "speech_tokenizer", OUT / "speech_tokenizer", dirs_exist_ok=True)

def part(index):
    start, end = index * CHUNK, min(TOTAL, (index + 1) * CHUNK) - 1
    file = PARTS / f"{index:05d}"
    if file.exists() and file.stat().st_size == end-start+1:
        return
    for attempt in range(4):
        try:
            req = urllib.request.Request(BASE + "model.safetensors", headers={"Range": f"bytes={start}-{end}"})
            with opener().open(req, timeout=90) as response, file.open("wb") as stream:
                if response.status != 206 or response.headers.get("Content-Range") != f"bytes {start}-{end}/{TOTAL}":
                    raise RuntimeError("Invalid model segment")
                shutil.copyfileobj(response, stream, 1024 * 1024)
            if file.stat().st_size != end-start+1:
                raise RuntimeError("Incomplete model segment")
            return
        except Exception:
            if attempt == 3:
                raise
            time.sleep(attempt+1)
target = OUT / "model.safetensors"
if not target.exists() or target.stat().st_size != TOTAL:
    count = (TOTAL + CHUNK - 1) // CHUNK
    with ThreadPoolExecutor(max_workers=6) as pool:
        for done, future in enumerate(as_completed([pool.submit(part, i) for i in range(count)]), 1):
            future.result()
            if done % 12 == 0 or done == count:
                print(f"Voice clone: {done}/{count} segments", flush=True)
    with target.open("wb") as stream:
        for i in range(count):
            with (PARTS / f"{i:05d}").open("rb") as source:
                shutil.copyfileobj(source, stream, 1024 * 1024)
with target.open("rb") as stream:
    digest = hashlib.file_digest(stream, "sha256").hexdigest()
if digest != SHA:
    raise RuntimeError("Model checksum mismatch")
for file in PARTS.iterdir():
    if file.is_file():
        file.unlink()
print("CLONE_MODEL_VERIFIED", digest, flush=True)
