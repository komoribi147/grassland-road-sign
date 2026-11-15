import { spawn } from 'node:child_process';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
export async function probeLearningServer(base) {
  let page;
  try { page=await fetch(base+'/learn.html',{signal:AbortSignal.timeout(1500)}); } catch { return 'unreachable'; }
  try {
    if (!page.ok || !(await page.text()).includes('学习首页 · 草地上的路标')) return 'occupied';
    const res=await fetch(base+'/api/health',{signal:AbortSignal.timeout(1500)});const health=await res.json();
    return res.ok && health.ok && health.model==='deepseek-chat' && health.capabilities?.inquiry && health.characters?.['li-changhe'] ? 'ready' : 'occupied';
  } catch { return 'occupied'; }
}
async function main() {
  const port=process.env.PORT || '8787';const base=`http://localhost:${port}`;
  const initial=await probeLearningServer(base);
  if(initial==='occupied')throw new Error('这个端口已有其他或旧版服务。请关闭旧预览窗口后重试，或换一个 PORT。');
  if(initial!=='ready') {
    const service=spawn(process.execPath,['server/server.mjs'],{cwd:new URL('..',import.meta.url),env:{...process.env,PORT:port},stdio:'inherit'});
    let exited=false;service.on('error',()=>{exited=true;});service.on('exit',()=>{exited=true;});
    let ready=false;
    for(let i=0;i<40&&!exited;i++){await new Promise(r=>setTimeout(r,150));if(await probeLearningServer(base)==='ready'){ready=true;break;}}
    if(!ready){service.kill();throw new Error('教育网站未能启动，请查看上方错误信息。');}
  }
  spawn('rundll32.exe',['url.dll,FileProtocolHandler',base+'/learn.html'],{windowsHide:true,stdio:'ignore'}).on('error',()=>console.log('请手动打开：'+base+'/learn.html'));
  console.log('教育网站：'+base+'/learn.html');
}
if(process.argv[1]&&pathToFileURL(path.resolve(process.argv[1])).href===import.meta.url)main().catch(err=>{console.error(err.message);process.exitCode=1;});
