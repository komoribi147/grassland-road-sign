"""Produce a captioned review sheet for every official shot (no source edits)."""
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont
import json
import textwrap

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT.parent / "output" / "visual-round1"
OUT.mkdir(parents=True, exist_ok=True)
font = ImageFont.truetype("C:/Windows/Fonts/msyh.ttc", 15)
shots = []


def visit(value, where):
    if not isinstance(value, dict):
        return
    if value.get("visual"):
        shots.append({"where": where, "source": value["visual"]["src"],
                      "crop": value["visual"].get("crop"),
                      "caption": value.get("description") or value.get("label") or value.get("text", "")})
    if value.get("t") == "bg" and value.get("src"):
        shots.append({"where": where, "source": value["src"], "caption": "场景背景切换"})
    for key, child in value.items():
        if isinstance(child, list):
            for i, item in enumerate(child):
                visit(item, f"{where}.{key}[{i}]")


manifest = json.loads((ROOT / "story/manifest.json").read_text(encoding="utf-8"))
for rel in manifest["scenes"]:
    scene = json.loads((ROOT / rel).read_text(encoding="utf-8"))
    shots.append({"where": scene["id"] + ".bg", "source": scene["bg"], "caption": scene["title"] + "（背景）"})
    for i, step in enumerate(scene["steps"]):
        visit(step, f"{scene['id']}[{i}]")

(OUT / "shots.json").write_text(json.dumps(shots, ensure_ascii=False, indent=2), encoding="utf-8")
for page in range((len(shots) + 15) // 16):
    sheet = Image.new("RGB", (1600, 1200), "#101613")
    draw = ImageDraw.Draw(sheet)
    for slot, shot in enumerate(shots[page * 16:(page + 1) * 16]):
        x, y = (slot % 4) * 400, (slot // 4) * 300
        with Image.open(ROOT / shot["source"]) as raw:
            image = raw.convert("RGB")
            if shot.get("crop"):
                c = shot["crop"]
                w, h = image.size
                image = image.crop((int(c["x"]*w), int(c["y"]*h), int((c["x"]+c["w"])*w), int((c["y"]+c["h"])*h)))
            image.thumbnail((392, 222))
            sheet.paste(image, (x + (400 - image.width) // 2, y))
        lines = [f"{page*16+slot+1:03d} {shot['where']}"]
        lines += textwrap.wrap(shot["caption"].replace("\n", " "), 24)[:3]
        draw.multiline_text((x + 5, y + 225), "\n".join(lines), font=font, fill="#e8e4da", spacing=2)
    sheet.save(OUT / f"shots-{page+1:02d}.jpg", quality=90)
print(f"{len(shots)} shots; review sheets: {OUT}")
