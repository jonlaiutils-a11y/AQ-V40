// AQ V40 P1.1 - upstream diagnostics and graceful degradation (research only)
const ORIGIN = 'https://push2.eastmoney.com/api/qt/clist/get';
const FIELDS = 'f12,f14,f2,f3,f4,f5,f6,f7,f8,f9,f10,f15,f16,f17,f18,f20,f21,f22';
const MARKET = 'm:0+t:6,m:0+t:80,m:1+t:2,m:1+t:23,m:0+t:81,m:1+t:3';
const PAGE_SIZE = 500;
const MAX_PAGES = 16;
const TIMEOUT_MS = 6500;
const MAX_RETRIES = 1;
const pause = ms => new Promise(r => setTimeout(r, ms));
const num = v => { if (v === null || v === undefined || v === '' || v === '-') return null; const x = Number(v); return Number.isFinite(x) ? x : null; };
const valid = s => s && /^\d{6}$/.test(String(s.f12)) && num(s.f2) > 0;
function evaluate(s) {
  const pct=num(s.f3)||0,turn=num(s.f8)||0,vr=num(s.f10)||0,amp=num(s.f7)||0;
  const price=num(s.f2)||0,hi=num(s.f15)||price,lo=num(s.f16)||price,op=num(s.f17)||price;
  const range=Math.max(hi-lo,.001),position=Math.max(0,Math.min(1,(price-lo)/range));
  const proximity=hi>0?(hi-price)/hi:1;
  const start=Math.max(0,Math.min(100,Math.round(36+Math.min(vr,5)*9+Math.min(turn,15)*1.3+position*15+(pct>=0&&pct<=5?12:0)-Math.max(0,pct-7)*7-(amp>13?12:0))));
  const relay=Math.max(0,Math.min(100,Math.round(30+Math.min(vr,4)*7+Math.min(turn,12)*1.6+position*20+(pct>=2&&pct<=8?12:0)-(pct>9?15:0)-(amp>12?12:0))));
  const risk=[];if(pct>8)risk.push('涨幅较大，警惕追高');if(position<.4)risk.push('日内位置偏弱');if(amp>12)risk.push('振幅较大');if(vr<1)risk.push('量比不足');
  const grade=start>=82&&relay>=70&&risk.length===0?'A':start>=70&&relay>=58?'B':'C';
  return {code:s.f12,name:s.f14,price,pct,volume:num(s.f5),amount:num(s.f6),turn,vr,amp,high:hi,low:lo,open:op,change:num(s.f4),startScore:start,relayScore:relay,grade,position:+position.toFixed(2),nearHigh:+(proximity*100).toFixed(2),risk,action:grade==='A'?'强势观察·等待买点确认':grade==='B'?'观察':'暂不买入'};
}
async function fetchPage(page) {
  const q=new URLSearchParams({pn:String(page),pz:String(PAGE_SIZE),po:'1',np:'1',ut:'bd1d9ddb04089700cf9c27f6f7426281',fltt:'2',invt:'2',fid:'f6',fs:MARKET,fields:FIELDS});
  let last;
  for(let attempt=0;attempt<=MAX_RETRIES;attempt++){
    try {
      const r=await fetch(`${ORIGIN}?${q}`,{headers:{Accept:'application/json'},signal:AbortSignal.timeout(TIMEOUT_MS),cf:{cacheTtl:0}});
      if(!r.ok)throw new Error(`上游HTTP ${r.status} (page ${page})`);
      const data=await r.json();
      if(!data?.data||!Array.isArray(data.data.diff))throw new Error(`上游返回格式异常 (page ${page})`);
      return {total:Number(data.data.total)||0,items:data.data.diff};
    } catch(e) { last=e; if(attempt<MAX_RETRIES)await pause(250+attempt*350); }
  }
  throw last;
}
async function scan(){
  const started=Date.now();
  let first;
  try { first=await fetchPage(1); }
  catch(e){return {status:503,body:{error:'行情获取失败',detail:String(e?.message||e),source:'东方财富公开行情接口',upstreamHealthy:false,received:0,complete:false,failedPages:[1],timestamp:new Date().toISOString(),elapsedMs:Date.now()-started}};}
  const pages=Math.min(MAX_PAGES,Math.ceil(first.total/PAGE_SIZE));
  const all=[...first.items],failedPages=[];
  // Bounded concurrency to reduce upstream throttling and Worker request bursts.
  const pageIds=Array.from({length:Math.max(0,pages-1)},(_,i)=>i+2);
  for(let i=0;i<pageIds.length;i+=3){
    const batch=pageIds.slice(i,i+3);
    const results=await Promise.allSettled(batch.map(fetchPage));
    results.forEach((r,j)=>{if(r.status==='fulfilled')all.push(...r.value.items);else failedPages.push({page:batch[j],error:String(r.reason?.message||r.reason)});});
  }
  const unique=[...new Map(all.filter(valid).map(s=>[s.f12,s])).values()];
  const scored=unique.map(evaluate).filter(s=>s.pct>-6&&s.pct<19&&s.turn>=.5).sort((a,b)=>(b.startScore*.55+b.relayScore*.45)-(a.startScore*.55+a.relayScore*.45));
  const complete=failedPages.length===0&&all.length>=first.total&&pages*PAGE_SIZE>=first.total;
  return {status:200,body:{timestamp:new Date().toISOString(),source:'东方财富公开行情接口（非官方）',totalExpected:first.total,received:unique.length,complete,failedPages,upstreamHealthy:failedPages.length===0,elapsedMs:Date.now()-started,mode:'观察雷达（非买入信号）',note:'启发式评分非预测概率。缺少分钟线/盘口及样本外回测，不提供买入信号。行情可能延迟，盘后数据不代表实时行情。',items:scored.slice(0,80)}};
}
export default {async fetch(req,env,ctx){
  const u=new URL(req.url);
  if(u.pathname==='/api/health')return Response.json({ok:true,service:'AQ V40 P1.1',note:'仅表示Worker运行正常，不代表上游行情可用',timestamp:new Date().toISOString()},{headers:{'Cache-Control':'no-store'}});
  if(u.pathname==='/api/diagnostic'){
    try {const p=await fetchPage(1);return Response.json({ok:true,source:'eastmoney',count:p.items.length,total:p.total,timestamp:new Date().toISOString()},{headers:{'Cache-Control':'no-store'}});}
    catch(e){return Response.json({ok:false,source:'eastmoney',error:String(e?.message||e),timestamp:new Date().toISOString()},{status:503,headers:{'Cache-Control':'no-store'}});}
  }
  if(u.pathname==='/api/scan'){
    const cache=caches.default,key=new Request(`${u.origin}/api/scan?version=1.1`);
    if(!u.searchParams.has('fresh')){const cached=await cache.match(key);if(cached)return cached;}
    const {status,body}=await scan();
    const res=Response.json(body,{status,headers:{'Cache-Control':'no-store','Access-Control-Allow-Origin':'*'}});
    if(status===200&&body.complete)ctx.waitUntil(cache.put(key,new Response(JSON.stringify(body),{headers:{'Content-Type':'application/json','Cache-Control':'public,max-age=20'}})));
    return res;
  }
  return env.ASSETS?.fetch(req) ?? new Response('ASSETS binding missing',{status:500});
}};
