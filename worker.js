// AQ V40 P1.2: Tencent quote connectivity test. Not full-market or trade-ready.
const CODES=['000001','000002','000063','000333','000651','000725','000807','000977','001309','002050','002156','002230','002371','002475','002594','002787','002916','300014','300059','300124','300209','300308','300750','300760','600000','600030','600036','600089','600111','600276','600309','600519','600584','600703','600745','600900','601012','601318','601398','601899','601888','603019','603083','603256','603986','688008','688041','688111','688981'];
const source='腾讯公开行情接口（非官方，可能限流或失效）';
const num=v=>{if(v===undefined||v===null||v===''||v==='-')return null;const x=Number(v);return Number.isFinite(x)?x:null};
const market=code=>/^(6|9)/.test(code)?'sh':'sz';
async function quote(codes){
 const symbols=codes.map(c=>market(c)+c).join(',');
 const url='https://qt.gtimg.cn/q='+symbols;
 const r=await fetch(url,{signal:AbortSignal.timeout(7000),headers:{'Accept':'*/*'}});
 if(!r.ok)throw Error('腾讯行情 HTTP '+r.status);
 const buf=await r.arrayBuffer();
 // Tencent's response commonly uses GBK/GB18030 for Chinese names.
 const text=new TextDecoder('gb18030').decode(buf);
 const items=[];
 for(const match of text.matchAll(/v_([a-z]{2}\d{6})="([^"]*)"/g)){
   const f=match[2].split('~'),code=match[1].slice(2);
   // Tencent quote fields: name[1], code[2], last[3], prev close[4], open[5], volume[6], time[30], pct[32], high[33], low[34], turnover[38], PE[39], amplitude[43], turnover rate[44], amount[37].
   const price=num(f[3]),prev=num(f[4]);if(!(price>0&&prev>0))continue;
   const pct=num(f[32])??((price/prev-1)*100),high=num(f[33])??price,low=num(f[34])??price;
   const turn=num(f[38]),amp=num(f[43]);
   const position=Math.max(0,Math.min(1,(price-low)/Math.max(.001,high-low)));
   const startScore=Math.max(0,Math.min(100,Math.round(38+position*25+Math.min(Math.max(pct,0),8)*4+(turn===null?0:Math.min(turn,12))-(amp>12?15:0))));
   const relayScore=Math.max(0,Math.min(100,Math.round(30+position*22+(pct>=2&&pct<=8?18:0)-(pct>9?18:0)-(amp>12?12:0))));
   const risk=[];if(pct>8)risk.push('涨幅较大，谨防追高');if(position<.4)risk.push('日内位置偏弱');if(amp>12)risk.push('振幅较大');
   const grade=startScore>=82&&relayScore>=65&&risk.length===0?'A':startScore>=65&&relayScore>=50?'B':'C';
   items.push({code,name:f[1]||code,price,pct:+pct.toFixed(2),volume:num(f[6]),amount:num(f[37]),turn,vr:null,amp,high,low,open:num(f[5]),change:+(price-prev).toFixed(3),startScore,relayScore,grade,position:+position.toFixed(2),nearHigh:+((high-price)/high*100).toFixed(2),risk,action:'观察·等待确认',quoteTime:f[30]||null});
 }
 return items;
}
const json=(data,status=200)=>Response.json(data,{status,headers:{'Cache-Control':'no-store','Access-Control-Allow-Origin':'*'}});
export default {async fetch(req,env){const u=new URL(req.url);
 if(u.pathname==='/api/health')return json({ok:true,version:'AQ V40 P1.2 Tencent Test',source,scope:'固定49只样本，非全A股',timestamp:new Date().toISOString()});
 if(u.pathname==='/api/diagnostic'||u.pathname==='/api/scan'){
  try{
   const chunks=[];for(let i=0;i<CODES.length;i+=25)chunks.push(CODES.slice(i,i+25));
   const results=await Promise.allSettled(chunks.map(quote));const all=results.flatMap(r=>r.status==='fulfilled'?r.value:[]);
   const errors=results.filter(r=>r.status==='rejected').map(r=>String(r.reason));
   const items=all.sort((a,b)=>b.startScore*.55+b.relayScore*.45-(a.startScore*.55+a.relayScore*.45)).slice(0,80);
   const ok=items.length>0;
   if(u.pathname==='/api/diagnostic')return json({ok,source,requested:CODES.length,received:all.length,errors,first:items.slice(0,3),timestamp:new Date().toISOString()},ok?200:503);
   return json({timestamp:new Date().toISOString(),source,totalExpected:CODES.length,received:all.length,complete:errors.length===0&&all.length===CODES.length,failedPages:errors.length,mode:'固定样本连通性测试（非全市场扫描）',note:'仅测试49只股票；启发式分数不代表涨停或次日上涨概率。交易时段外为最近快照，未核实报价时效，禁止直接用于交易。',errors,items},ok?200:503);
  }catch(e){return json({error:'腾讯行情获取失败',detail:String(e.message),timestamp:new Date().toISOString()},503)}
 }
 return env.ASSETS.fetch(req);
}};
