"""Read one JSON job from stdin and write an MP3. Dependencies stay project-local."""
import asyncio
import json
import os
from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "node_modules" / ".voice-python"))
import edge_tts


async def main():
    job = json.loads(sys.stdin.buffer.read().decode("utf-8"))
    profile = job["profile"]
    proxy = os.environ.get("VOICE_PROXY") or os.environ.get("HTTPS_PROXY") or os.environ.get("HTTP_PROXY")
    speech = edge_tts.Communicate(
        job["text"], profile["voice"], rate=profile["rate"], pitch=profile["pitch"],
        proxy=proxy, connect_timeout=10, receive_timeout=25,
    )
    await speech.save(job["output"])


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except Exception as exc:
        print(f"{type(exc).__name__}: {exc}", file=sys.stderr)
        sys.exit(1)
