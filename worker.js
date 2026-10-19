// AQ V40 P1: market snapshot prototype. Public data endpoint may change or throttle.
const ORIGIN = 'https://push2.eastmoney.com/api/qt/clist/get';
const FIELDS = 'f12,f14,f2,f3,f4,f5,f6,f7,f8,f9,f10,f15,f16,f17,f18,f20,f21,f22';
const MARKET = 'm:0+t:6,m:0+t:80,m:1+t:2,m:1+t:23,m:0+t:81,m:1+t:3';
const PAGE_SIZE = 500;
function valid(s){return s && /^\d{6}$/.test(s.f12) && Number.isFinite(Number(s.f2)) && Number(s.f2)>0;}
function n(v){const x=Number(v);return Number.isFinite(x)?x:null;}
function evaluate(s){
  const pct=n(s.f3)||0, turn=n(s.f8)||0, vr=n(s.f10)||0, amp=n(s.f7)||0;
  const price=n(s.f2)||0, hi=n(s.f15)||price, lo=n(s.f16)||price, op=n(s.f17)||price;
  const range=Math.max(hi-lo,0.001), position=(price-lo)/range;
  const proximity=hi>0?(hi-price)/hi:1;
  // Heuristic discovery only; NOT probability or backtested signal.
  const start = Math.max(0,Math.min(100,Math.round(36+Math.min(vr,5)*9+Math.min(turn,15)*1.3+position*15+(pct>=0&&pct<=5?12:0)-Math.max(0,pct-7)*7-(amp>13?12:0))));
  const relay = Math.max(0,Math.min(100,Math.round(30+Math.min(vr,4)*7+Math.min(turn,12)*1.6+position*20+(pct>=2&&pct<=8?12:0)-(pct>9?15:0)-(amp>12?12:0))));
  const risk=[]; if(pct>8)risk.push('涨幅较大，警惕追高');if(position<.4)risk.push('日内位置偏弱');if(amp>12)risk.push('振幅较大');if(vr<1)risk.push('量比不足');
  const grade=start>=82&&relay>=70&&risk.length===0?'A':start>=70&&relay>=58?'B':'C';
  return {code:s.f12,name:s.f14,price,pct,volume:n(s.f5),amount:n(s.f6),turn,vr,amp,high:hi,low:lo,open:op,change:n(s.f4),startScore:start,relayScore:relay,grade,position:+position.toFixed(2),nearHigh:+(proximity*100).toFixed(2),risk,action:grade==='A'?'强势观察·等待买点确认':grade==='B'?'观察':'暂不买入'};
}
async function fetchPage(page){
  const q=new URLSearchParams({pn:String(page),pz:String(PAGE_SIZE),po:'1',np:'1',ut:'bd1d9ddb04089700cf9c27f6f7426281',fltt:'2',invt:'2',fid:'f6',fs:MARKET,fields:FIELDS});
  const r=await fetch(`${ORIGIN}?${q}`,{headers:{'User-Agent':'Mozilla/5.0','Accept':'application/json'},signal:AbortSignal.timeout(8500)});
  if(!r.ok)throw new Error('上游HTTP '+r.status);
  const data=await r.json();if(!data?.data||!Array.isArray(data.data.diff))throw new Error('上游返回格式异常');
  return {total:Number(data.data.total)||0,items:data.data.diff};
}
export default {async fetch(req,env,ctx){
  const u=new URL(req.url);
  if(u.pathname==='/api/health')return Response.json({ok:true,service:'AQ V40 P1',source:'Eastmoney public quote endpoint (unofficial)',timestamp:new Date().toISOString()});
  if(u.pathname==='/api/scan'){
    const cache=caches.default;const key=new Request(`${u.origin}/api/scan?version=1`);
    const cached=await cache.match(key);if(cached)return cached;
    try{
      const first=await fetchPage(1);
      const pages=Math.min(16,Math.ceil(first.total/PAGE_SIZE));
      const rest=await Promise.allSettled(Array.from({length:Math.max(0,pages-1)},(_,i)=>fetchPage(i+2)));
      const all=[...first.items];let failures=0;
      for(const p of rest){if(p.status==='fulfilled')all.push(...p.value.items);else failures++;}
      const unique=[...new Map(all.filter(valid).map(s=>[s.f12,s])).values()];
      const scored=unique.map(evaluate).filter(s=>s.pct>-6&&s.pct<19&&s.turn>=.5).sort((a,b)=>(b.startScore*.55+b.relayScore*.45)-(a.startScore*.55+a.relayScore*.45));
      const complete=failures===0&&all.length>=first.total;
      const body={timestamp:new Date().toISOString(),source:'东方财富公开行情接口（非官方、稳定性不保证）',totalExpected:first.total,received:unique.length,complete,failedPages:failures,mode:'观察雷达（非买入信号）',note:'分数是启发式排序，不是涨停/次日上涨概率。当前无分钟K线、盘口及回测，不生成可进买点。',items:scored.slice(0,80)};
      const res=Response.json(body,{headers:{'Cache-Control':'public,max-age=20','Access-Control-Allow-Origin':'*'}});
      if(complete)ctx.waitUntil(cache.put(key,res.clone()));
      return res;
    }catch(e){return Response.json({error:'行情获取失败',detail:String(e.message),timestamp:new Date().toISOString()},{status:503,headers:{'Cache-Control':'no-store'}});}
  }
  return env.ASSETS.fetch(req);
}};
