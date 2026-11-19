import TshetUinh from 'tshet-uinh';
import * as E from 'tshet-uinh-examples';
for (const ch of ['楊','行','見','說','打','白']) {
  const rs = TshetUinh.資料.query字頭(ch);
  for (const r of rs) {
    const p = r.音韻地位;
    console.log(ch, p.描述, E.baxter()(p), E.putonghua?.()(p) ?? '', (r.釋義||'').slice(0,20));
  }
}
