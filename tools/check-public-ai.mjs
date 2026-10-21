// 默认只核对公网链路；带 --live 时才向真实模型发送三个人物的新问题。
import assert from "node:assert/strict";

const base = "https://grassland-road-sign-d8bdfce86570-1453404640.ap-shanghai.app.tcloudbase.com";
const origins = ["https://komoribi147.github.io", "https://grassland-road-sign-d8bdfce86570-1453404640.tcloudbaseapp.com"];
const people = ["li-changhe", "shitou", "he-xiuying"];
const request = (url, options = {}) => fetch(url, { ...options, signal: AbortSignal.timeout(40000) });

try {
  for (const origin of origins) {
    const preflight = await request(`${base}/api/ask`, {
      method: "OPTIONS", headers: { Origin: origin, "Access-Control-Request-Method": "POST", "Access-Control-Request-Headers": "content-type" },
    });
    assert.equal(preflight.status, 204);
    assert.equal(preflight.headers.get("access-control-allow-origin"), origin, "跨域来源必须是一个准确域名，不能有重复响应头");
  }
  const response = await request(`${base}/api/health`, { headers: { Origin: origins[0] } });
  assert.equal(response.status, 200);
  const health = await response.json();
  assert.equal(response.headers.get("access-control-allow-origin"), origins[0]);
  const blocked = await request(`${base}/api/health`, { headers: { Origin: "https://untrusted.example" } });
  assert.equal(blocked.status, 403);
  console.log(`公网 API 可达，两个网站来源与预检通过；模型 ${health.model}，已配置 ${health.ready}/${health.total}。`);
  if (!people.every((id) => health.characters?.[id]?.ready)) {
    console.log("尚未配置三个角色所需的云端模型凭据；没有完成公网 AI 对话验收。");
    process.exitCode = 2;
  } else if (!process.argv.includes("--live")) {
    console.log("凭据已配置。仍需执行 npm run check:public-ai -- --live，并从公开网页实际提问。");
  } else {
    for (const npc of people) {
      for (const route of ["npc", "ask"]) {
        const result = await request(`${base}/api/${route}`, {
          method: "POST", headers: { Origin: origins[0], "Content-Type": "application/json" },
          body: JSON.stringify({ npc, playerText: "这会儿我能帮你做点什么？", present: people,
            situation: "队伍正在草地上行军，准备照料伤员。", sceneTitle: "草地行军", step: 1, trust: 20, address: "你",
            history: [{ role: "npc", text: "先跟上队伍。" }],
            ...(route === "ask" ? { askHistory: [{ q: "能歇歇吗？", a: "再往前走一段。" }] } : {}),
          }),
        });
        assert.equal(result.status, 200, `${npc} 的 ${route} 必须由云端成功应答`);
        const answer = await result.json();
        assert.ok(typeof answer.text === "string" && answer.text.trim());
        console.log(`${npc} /${route}：${answer.text}`);
      }
    }
    console.log("三个角色的两个公网接口均收到回答。还需核对公开网页中的实际请求与交互。");
  }
} catch (err) {
  console.error(`公网核验未通过：${err.message}`);
  process.exitCode = 1;
}
