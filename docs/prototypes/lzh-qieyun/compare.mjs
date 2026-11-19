import fs from 'fs';
import TshetUinh from 'tshet-uinh';
import * as E from 'tshet-uinh-examples';
const data = JSON.parse(fs.readFileSync('lzh-chars.json','utf8'));
const bax=E.baxter(), pth=E.putonghua(), gz=E.gwongzau();
const strip=s=>s.normalize('NFD').replace(/[̀-ͯ]/g,'').replace(/ü/g,'v');
let tot=0, noEntry=0, baxHit=0, baxAmb=0, pyExact=0, pyToneless=0, jyExact=0, jyToneless=0; const miss={bax:[],py:[],jy:[]};
for (const [ch, rs] of Object.entries(data)) {
  const pos = TshetUinh.資料.query字頭(ch).map(r=>r.音韻地位);
  for (let [b,p,j,sense] of rs) {
    tot++;
    if (!pos.length) { noEntry++; continue; }
    const m = pos.filter(x=>bax(x)===b);
    if (!m.length) { miss.bax.push(`${ch} ${b} [${pos.map(bax).join(',')}]`); continue; }
    baxHit++; if (new Set(m.map(x=>x.描述)).size>1) baxAmb++;
    const x=m[0]; const dp=pth(x).normalize('NFC'), dj=gz(x); p=p.normalize('NFC');
    if (dp===p) pyExact++; else { if (strip(dp)===strip(p)) pyToneless++; miss.py.push(`${ch} ${x.描述} pinned ${p} derived ${dp}`); }
    if (dj===j) jyExact++; else { if (dj.replace(/\d/g,'')===j.replace(/\d/g,'')) jyToneless++; miss.jy.push(`${ch} ${x.描述} pinned ${j} derived ${dj}`); }
  }
}
console.log({tot,noEntry,baxHit,baxAmb,baxMiss:miss.bax.length,pyExact,pyTonelessOnly:pyToneless,pyMiss:miss.py.length,jyExact,jyTonelessOnly:jyToneless,jyMiss:miss.jy.length});
console.log('bax miss sample:',miss.bax.slice(0,8));
console.log('py miss sample:',miss.py.slice(0,10));
console.log('jy miss sample:',miss.jy.slice(0,10));
