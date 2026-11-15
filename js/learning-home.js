import { learningOverview } from './learning-overview.js';
import { AiClient } from './ai.js';
const progress = document.getElementById('learningProgress');
if (progress) {
  let raw = null; try { raw = localStorage.getItem('grassland-road-sign.inquiry.signpost.v1'); } catch {}
  let task;
  try { const response = await fetch('story/inquiry.json', { cache: 'no-cache' }); if (!response.ok) throw new Error('unavailable'); task = await response.json(); } catch {}
  const summary = learningOverview(task ? raw : null, task);
  progress.textContent = summary.hasRevision ? '已留下初稿与修订稿，可以回看依据、补充思考或下载成果。'
    : summary.hasInitial ? '你已保留最初的想法，可以继续阅读资料和修订解释。' : '从自己的判断开始。你的学习记录保存在当前浏览器。';
  const resume = document.getElementById('continueLearning');
  if (resume) { resume.hidden = !summary.hasInitial; resume.textContent = summary.hasRevision ? '回看我的学习成果 →' : '继续上次探究 →'; }
}
const check = document.getElementById('checkCloud');
const status = document.getElementById('cloudStatus');
if (check && status) check.addEventListener('click', async () => {
  check.disabled = true; status.textContent = '正在检查连接…';
  const client = new AiClient(); await client.check();
  status.textContent = client.online && client.model === 'deepseek-chat' && client.lastError === ''
    ? 'DeepSeek 云端服务已配置。进入探究后，以实际返回的建议为准。'
    : '暂未确认 DeepSeek 服务可用。你仍可阅读资料、自主修订并保存成果。';
  check.disabled = false;
});
