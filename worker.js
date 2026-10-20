// AQ V40 P1.2: Tencent quote connectivity test. Not full-market or trade-ready.
const LEGACY_CODES=['000001','000002','000063','000333','000651','000725','000807','000977','001309','002050','002156','002230','002371','002475','002594','002787','002916','300014','300059','300124','300209','300308','300750','300760','600000','600030','600036','600089','600111','600276','600309','600519','600584','600703','600745','600900','601012','601318','601398','601899','601888','603019','603083','603256','603986','688008','688041','688111','688981','000006','000009','000012','000021','000027','000039','000050','000066','000069','000100','000157','000166','000301','000338','000400','000401','000408','000413','000415','000423','000425','000426','000429','000488','000513','000528','000538','000543','000568','000596','000625','000629','000630','000661','000683','000708','000709','000723','000728','000729','000733','000738','000768','000776','000778','000792','000799','000800','000858','000876','000883','000895','000898','000932','000933','000938','000960','000963','000983','001979','002001','002007','002008','002027','002028','002032','002049','002074','002085','002092','002129','002142','002179','002180','002202','002236','002241','002252','002271','002304','002311','002352','002384','002410','002415','002422','002459','002460','002466','002493','002555','002600','002601','002602','002603','002648','002714','002736','002812','002821','002841','002850','002920','002938','003816','300001','300003','300015','300017','300033','300073','300122','300136','300142','300274','300316','300347','300408','300418','300433','300450','300454','300476','300498','300502','300604','300628','300661','300672','300682','300759','300782','300803','300896','300919','300957','301029','301236','301269','301308','600010','600011','600015','600016','600019','600028','600031','600048','600050','600066','600085','600104','600109','600115','600150','600160','600176','600183','600196','600219','600233','600256','600332','600346','600362','600372','600383','600406','600415','600426','600436','600438','600460','600482','600487','600489','600498','600516','600522','600547','600570','600585','600588','600600','600660','600690','600741','600760','600795','600809','600837','600845','600875','600886','600893','600905','600918','600919','600926','600938','600941','600958','600989','600999','601006','601009','601021','601066','601088','601100','601111','601117','601127','601138','601166','601169','601186','601211','601225','601229','601288','601319','601328','601336','601360','601377','601390','601600','601601','601607','601618','601628','601633','601668','601669','601688','601696','601728','601766','601788','601800','601816','601818','601857','601868','601877','601881','601919','601939','601985','601988','601989','601995','601998','603005','603160','603259','603288','603369','603392','603444','603501','603606','603659','603799','603806','603833','605117','688012','688036','688072','688126','688169','688187','688223','688256','688271','688303','688390','688396','688472','688506','688599'];
// Exhaustive candidate CODE SPACE, not an exchange-listed security master. Invalid/nonlisted codes are discarded by quote().
const PREFIXES=['000','001','002','003','300','301','600','601','603','605','688','689','920'];
const UNIVERSE=PREFIXES.flatMap(prefix=>Array.from({length:1000},(_,i)=>prefix+String(i).padStart(3,'0')));
const SEGMENT_SIZE=400;
function scoreItem(x){const momentum=Math.max(0,Math.min(100,Math.round(45+x.pct*5+x.position*25-(x.pct>8?12:0)-(x.amp>10?10:0))));const quality=Math.round(.45*x.startScore+.35*x.relayScore+.2*momentum);const chase=x.pct>8||x.position<.35||x.amp>12;x.aqScore=quality;x.grade=quality>=82&&!chase?'S':quality>=73&&!chase?'A':quality>=60?'B':quality>=45?'C':'D';x.risk=[...x.risk,...(x.pct>6&&x.position>.85?['临近高位，等待回踩']:[])];x.action=chase?'不买·风险过滤':quality>=73?'强势备选·等待买点':'观察·未确认';return x;}
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
 if(u.pathname==='/api/health')return json({ok:true,version:'AQ V40 P4 Progressive Beta',source,scope:'候选代码空间逐批发现，非官方上市名录',timestamp:new Date().toISOString()});
 if(u.pathname==='/api/universe')return json({mode:'候选代码空间逐批发现',candidateCount:UNIVERSE.length,segmentSize:SEGMENT_SIZE,segments:Math.ceil(UNIVERSE.length/SEGMENT_SIZE),warning:'代码空间包含大量未上市号码；仅已返回有效报价的代码计入股票数。完成全部分段前不可视为全市场。'});
 if(u.pathname==='/api/segment'){
  const index=Number(u.searchParams.get('i'));
  const segments=Math.ceil(UNIVERSE.length/SEGMENT_SIZE);
  if(!Number.isInteger(index)||index<0||index>=segments)return json({error:'无效分段'},400);
  const codes=UNIVERSE.slice(index*SEGMENT_SIZE,(index+1)*SEGMENT_SIZE);
  const chunks=[];for(let i=0;i<codes.length;i+=40)chunks.push(codes.slice(i,i+40));
  const responses=await Promise.allSettled(chunks.map(quote));
  const all=responses.flatMap(r=>r.status==='fulfilled'?r.value:[]);
  const errors=responses.filter(r=>r.status==='rejected').map(r=>String(r.reason));
  const items=all.map(scoreItem);
  return json({index,segments,requested:codes.length,received:items.length,failedBatches:errors.length,errors,items,timestamp:new Date().toISOString(),source},errors.length?206:200);
 }
 if(u.pathname==='/api/scan')return json({error:'P4已改为分段扫描，请使用新版页面。',endpoint:'/api/universe'},409);
 return env.ASSETS.fetch(req);
}};
