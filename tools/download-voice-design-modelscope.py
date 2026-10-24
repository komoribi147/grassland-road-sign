"""Resume bounded range downloads from Qwen's official ModelScope repository."""
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path
import shutil
import time
import urllib.request

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "node_modules" / ".voice-models" / "qwen-voice-design"
BASE = "https://modelscope.cn/models/Qwen/Qwen3-TTS-12Hz-1.7B-VoiceDesign/resolve/master/"
FILES = {"model.safetensors": 3833402552, "speech_tokenizer/model.safetensors": 682293092}
CHUNK = 16 * 1024 * 1024


def get_part(name, index, total):
    start, end = index * CHUNK, min(total, (index + 1) * CHUNK) - 1
    target = OUT / (name + ".parts") / f"{index:05d}"
    target.parent.mkdir(parents=True, exist_ok=True)
    if target.exists() and target.stat().st_size == end - start + 1:
        return target
    for attempt in range(4):
        try:
            opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))
            request = urllib.request.Request(BASE + name, headers={"Range": f"bytes={start}-{end}"})
            with opener.open(request, timeout=90) as response:
                if response.status != 206:
                    raise RuntimeError("Expected HTTP range response")
                if response.headers.get("Content-Range") != f"bytes {start}-{end}/{total}":
                    raise RuntimeError("Server returned a different model segment")
                with target.open("wb") as stream:
                    shutil.copyfileobj(response, stream, 1024 * 1024)
            if target.stat().st_size != end - start + 1:
                raise RuntimeError("Incomplete model segment")
            return target
        except Exception:
            if attempt == 3:
                raise
            time.sleep(attempt + 1)


for name, total in FILES.items():
    target = OUT / name
    if target.exists() and target.stat().st_size == total:
        print("CACHED", name, flush=True)
        continue
    count = (total + CHUNK - 1) // CHUNK
    with ThreadPoolExecutor(max_workers=6) as pool:
        futures = [pool.submit(get_part, name, i, total) for i in range(count)]
        done = 0
        for future in as_completed(futures):
            future.result()
            done += 1
            if done % 12 == 0 or done == count:
                print(f"{name}: {done}/{count} segments ({min(total, done*CHUNK)/1024**3:.2f} GiB)", flush=True)
    temp = target.with_suffix(".assembling")
    with temp.open("wb") as stream:
        for i in range(count):
            with (OUT / (name + ".parts") / f"{i:05d}").open("rb") as source:
                shutil.copyfileobj(source, stream, 1024 * 1024)
    if temp.stat().st_size != total:
        raise RuntimeError("Assembled model size mismatch")
    temp.replace(target)
    for i in range(count):
        (OUT / (name + ".parts") / f"{i:05d}").unlink()
    print("READY", name, total, flush=True)
print("MODEL_READY", OUT, flush=True)
