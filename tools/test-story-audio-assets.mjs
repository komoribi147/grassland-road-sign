import assert from 'node:assert/strict';
import {readFile,access} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const manifest=JSON.parse(await readFile(path.join(root,'story/manifest.json'),'utf8'));
const missing=[];let checked=0;
async function visit(value){
 if(!value||typeof value!=='object')return;
 if(['sfx','ambient'].includes(value.t)&&value.name){
  const name=`assets/audio/${value.t==='sfx'?'sfx-':''}${value.name}.mp3`;checked++;
  try{await access(path.join(root,name));}catch{missing.push(name);}
 }
 for(const nested of Object.values(value))if(nested&&typeof nested==='object')await visit(nested);
}
for(const rel of manifest.scenes)await visit(JSON.parse(await readFile(path.join(root,rel),'utf8')));
assert.deepEqual([...new Set(missing)],[],'正式剧情不能引用不存在的音频');
console.log(`剧情音频引用检查通过：${checked} 处引用均有实际文件。`);
