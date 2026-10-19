// 旧六格分镜到本轮独立纪实镜头的逐格剪辑表。只用于一次性迁移；重复执行安全。
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const shot = (name) => `assets/stills/${name}.png`;
const panels = {
  "01": ["wake", "wake", "cook-caution", "wake", "cook-caution", "cook-caution"],
  "02": ["cook-caution", "fog-route", "wake", "wake", "sandal", "fog-route"],
  "03": ["camp", "fog-route", "camp", "high-camp", "soup-serving", "camp"],
  "04": ["soup-serving", "soup-serving", "grass-root", "grass-root", "grass-root", "camp"],
  "05": ["medic-water", "medic-water", "medic-water", "medic-water", "roster", "roster"],
  "06": ["fog-route", "fog-route", "bog-edge", "bog-alone", "bog-alone", "bog-edge"],
  "07": ["bog-rescue", "bog-rescue", "bog-rescue", "bog-rescue", "bandage", "bandage"],
  "08": ["bandage", "bandage", "bandage", "bandage", "bandage", "bog-edge"],
  "09": ["markers", "grain-pick", "fog-route", "fog-route", "bog-edge", "bog-edge"],
  "10": ["fog-route", "markers", "high-camp", "high-camp", "high-camp", "high-camp"],
  "11": ["medic-water", "medic-water", "high-camp", "high-camp", "roster", "roster"],
  "12": ["roster", "high-camp", "roster", "high-camp", "medic-water", "dawn-river"],
  "13": ["high-camp", "dawn-river", "dawn-river", "dawn-river", "last-signpost"],
  "14": ["last-signpost", "last-signpost", "last-signpost", "last-signpost", "last-signpost", "today"],
  "15": ["today", "today", "today", "today", "today", "today"],
  "16": ["camp", "camp", "grass-root", "camp", "medic-water", "high-camp"],
};
const backgrounds = {
  "prologue-marsh-dusk": "wake",
  "act1-night-camp": "camp",
  "act2-morning-fog": "fog-route",
  "act2-bog": "bog-edge",
  "act3-rain-markers": "markers",
  "act3-night-high-ground": "high-camp",
  "act4-dawn-river": "dawn-river",
  "act4-signpost": "last-signpost",
  "epilogue-today": "today",
};

for (const name of ["prologue", "act1", "act2", "act3", "act4", "epilogue"]) {
  const file = path.join(root, "story", "scenes", `${name}.json`);
  let source = await readFile(file, "utf8");
  source = source.replace(/"sheet"\s*:\s*"assets\/storyboards\/sheet-(\d+)\.jpg"\s*,\s*"panel"\s*:\s*(\d+)/g,
    (old, sheet, panel) => {
      const chosen = panels[sheet]?.[Number(panel)];
      if (!chosen) throw new Error(`没有镜头映射：sheet-${sheet} panel ${panel}`);
      return `"src":"${shot(chosen)}"`;
    });
  source = source.replace(/"sheet"\s*:\s*"assets\/storyboards\/epilogue-scarves\.jpg"/g,
    `"src":"${shot("today")}"`);
  source = source.replace(/assets\/storyboards\/epilogue-scarves\.jpg/g, shot("today"));
  source = source.replace(/assets\/bg\/([\w-]+)\.jpg/g, (old, name) => {
    if (!backgrounds[name]) throw new Error(`没有背景映射：${name}`);
    return shot(backgrounds[name]);
  });
  await writeFile(file, source);
}
