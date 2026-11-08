// AQ V40 P1.2: Tencent quote connectivity test. Not full-market or trade-ready.
const LEGACY_CODES=['000001','000002','000063','000333','000651','000725','000807','000977','001309','002050','002156','002230','002371','002475','002594','002787','002916','300014','300059','300124','300209','300308','300750','300760','600000','600030','600036','600089','600111','600276','600309','600519','600584','600703','600745','600900','601012','601318','601398','601899','601888','603019','603083','603256','603986','688008','688041','688111','688981','000006','000009','000012','000021','000027','000039','000050','000066','000069','000100','000157','000166','000301','000338','000400','000401','000408','000413','000415','000423','000425','000426','000429','000488','000513','000528','000538','000543','000568','000596','000625','000629','000630','000661','000683','000708','000709','000723','000728','000729','000733','000738','000768','000776','000778','000792','000799','000800','000858','000876','000883','000895','000898','000932','000933','000938','000960','000963','000983','001979','002001','002007','002008','002027','002028','002032','002049','002074','002085','002092','002129','002142','002179','002180','002202','002236','002241','002252','002271','002304','002311','002352','002384','002410','002415','002422','002459','002460','002466','002493','002555','002600','002601','002602','002603','002648','002714','002736','002812','002821','002841','002850','002920','002938','003816','300001','300003','300015','300017','300033','300073','300122','300136','300142','300274','300316','300347','300408','300418','300433','300450','300454','300476','300498','300502','300604','300628','300661','300672','300682','300759','300782','300803','300896','300919','300957','301029','301236','301269','301308','600010','600011','600015','600016','600019','600028','600031','600048','600050','600066','600085','600104','600109','600115','600150','600160','600176','600183','600196','600219','600233','600256','600332','600346','600362','600372','600383','600406','600415','600426','600436','600438','600460','600482','600487','600489','600498','600516','600522','600547','600570','600585','600588','600600','600660','600690','600741','600760','600795','600809','600837','600845','600875','600886','600893','600905','600918','600919','600926','600938','600941','600958','600989','600999','601006','601009','601021','601066','601088','601100','601111','601117','601127','601138','601166','601169','601186','601211','601225','601229','601288','601319','601328','601336','601360','601377','601390','601600','601601','601607','601618','601628','601633','601668','601669','601688','601696','601728','601766','601788','601800','601816','601818','601857','601868','601877','601881','601919','601939','601985','601988','601989','601995','601998','603005','603160','603259','603288','603369','603392','603444','603501','603606','603659','603799','603806','603833','605117','688012','688036','688072','688126','688169','688187','688223','688256','688271','688303','688390','688396','688472','688506','688599'];
// Exhaustive candidate CODE SPACE, not an exchange-listed security master. Invalid/nonlisted codes are discarded by quote().
const PREFIXES=['000','001','002','003','300','301','600','601','603','605','688','689','920'];
const UNIVERSE=PREFIXES.flatMap(prefix=>Array.from({length:1000},(_,i)=>prefix+String(i).padStart(3,'0')));
const SEGMENT_SIZE=400;
function clamp(v,lo=0,hi=100){return Math.max(lo,Math.min(hi,v))}
// V44 research scores: interpretable, uncalibrated; never probabilities.
function scoreItem(x){
 const quality=Math.round(.52*x.startScore+.48*x.relayScore);
 x.aqScore=quality;
 const eligible=x.dataQuality==='PARTIAL' ? false : x.startScore>=75&&x.relayScore>=70;
 x.grade=eligible&&quality>=85?'S':eligible?'A':quality>=65?'B':quality>=48?'C':'D';
 x.action=x.dataQuality==='PARTIAL'?'观察·数据不足':eligible?'强势备选·等待持续确认':'观察·未确认';
 return x;
}
const source='腾讯公开行情接口（非官方，可能限流或失效）';
const num=v=>{if(v===undefined||v===null||v===''||v==='-')return null;const x=Number(v);return Number.isFinite(x)?x:null};
const market=code=>/^92/.test(code)?'bj':/^(6|9)/.test(code)?'sh':'sz';
async function quote(codes,allowStale=false){
 const symbols=codes.map(c=>market(c)+c).join(',');
 const url='https://qt.gtimg.cn/q='+symbols;
 const r=await fetch(url,{signal:AbortSignal.timeout(10000),headers:{'Accept':'*/*'}});
 if(!r.ok)throw Error('腾讯行情 HTTP '+r.status);
 const buf=await r.arrayBuffer();
 // Tencent's response commonly uses GBK/GB18030 for Chinese names.
 const text=new TextDecoder('gb18030').decode(buf);
 const items=[];
 for(const match of text.matchAll(/v_([a-z]{2}\d{6})="([^"]*)"/g)){
   const f=match[2].split('~'),code=match[1].slice(2);
   // Tencent quote fields: name[1], code[2], last[3], prev close[4], open[5], volume[6], time[30], pct[32], high[33], low[34], turnover[38], PE[39], amplitude[43], turnover rate[44], amount[37].
   const price=num(f[3]),prev=num(f[4]);if(!(price>0&&prev>0)||!/^\d{6}$/.test(code)||!f[1])continue;
   // Reject non-tradable, delisted, placeholder, and visibly stale quote records.
   const name=String(f[1]).trim();
   if(/退市|退|\*ST|^ST|^PT|^N|^C/.test(name)||/^(000003|000004)$/.test(code))continue;
   const qt=String(f[30]||'');
   if(!/^20\d{12}$/.test(qt))continue;
   const quoteDate=qt.slice(0,8),todayCN=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date()).replace(/-/g,'');
   if(quoteDate!==todayCN&&!allowStale)continue;
   const pct=num(f[32])??((price/prev-1)*100),high=num(f[33])??price,low=num(f[34])??price;
   // Tencent fields: [38] is turnover ratio in some public schemas; [44] can differ by feed.
   // Neither field is used for turnover scoring until independently verified.
   const turn=null,amp=num(f[43]);
   const open=num(f[5]);
   // Zero-range days must not be treated as a weak close (the V44.0 one-price-board bug).
   const flatRange=Math.abs(high-low)<=Math.max(.005,price*.00015);
   const position=flatRange?1:clamp((price-low)/Math.max(.001,high-low),0,1);
   const pullback=high>0?(high-price)/high*100:0;
   const gap=open&&prev>0?(open/prev-1)*100:0;
   const limitPct=/^(300|301|688|689)/.test(code)?20:/^(8|9)/.test(code)?30:10;
   // Price-limit approximation is only applicable to ordinary non-ST A shares; names
   // with special rules and unverified market limits must not be asserted as locked.
   const nearLimit=pct>=limitPct-.65&&position>=.9;
   const lockedLimitCandidate=nearLimit&&flatRange&&open!==null&&Math.abs(open-price)<=Math.max(.005,price*.00015);
   const limitState=lockedLimitCandidate?'一字涨停候选（快照，未验证全天不开板）':nearLimit?'接近涨停':'非涨停结构';
   const buyAccess=lockedLimitCandidate?'极低·不可作为可买入推荐':nearLimit?'需核实可成交性':'待确认';
   // Snapshot-only: acceleration, sustained volume, sector co-movement and sealing quality are unknown.
   // Do not reward raw percent gain linearly or penalize strong limit-up/gaps mechanically.
   const startParts={base:25,position:Math.round(position*18),strength:Math.round(clamp(pct,0,limitPct)*1.2),breakout:Math.round((position>=.8?12:position>=.6?6:0)),limitStructure:nearLimit?8:0,drawdownPenalty:Math.round(Math.max(0,pullback-1.2)*3),weakClosePenalty:position<.4?12:0};
   // A locked board is strong in price, but the intraday "startup" is not observable.
   // Keep the score as a snapshot index, not a claim that the user could buy.
   const startScore=Math.round(clamp(startParts.base+startParts.position+startParts.strength+startParts.breakout+startParts.limitStructure-startParts.drawdownPenalty-startParts.weakClosePenalty));
   const relayParts={base:34,position:Math.round(position*20),trendStrength:Math.round(Math.min(15,Math.max(0,pct)*1.7)),limitStructure:nearLimit?12:0,drawdownPenalty:Math.round(Math.max(0,pullback-1.5)*4),weakClosePenalty:position<.45?12:0,largeAmplitudePenalty:(amp??0)>14&&position<.6?8:0};
   // Locked-board continuation cannot be inferred from OHLC alone. The 0-range
   // position bug is fixed; continuation remains UNVERIFIED until board history,
   // prior streak, sector and order book are available.
   const relayScore=Math.round(clamp(relayParts.base+relayParts.position+relayParts.trendStrength+relayParts.limitStructure-relayParts.drawdownPenalty-relayParts.weakClosePenalty-relayParts.largeAmplitudePenalty));
   const risk=[];if(position<.4)risk.push('日内位置偏弱');if(pullback>2.5)risk.push('高点回撤明显');if(amp>14&&position<.6)risk.push('大振幅且收盘位置偏弱');
   const grade=startScore>=75&&relayScore>=70&&risk.length===0?'A':startScore>=65&&relayScore>=60?'B':'C';
   items.push({code,name,price,pct:+pct.toFixed(2),volume:num(f[6]),amount:num(f[37]),turn,vr:null,amp,high,low,open,change:+(price-prev).toFixed(3),startScore,relayScore,grade,position:+position.toFixed(2),nearHigh:+((high-price)/high*100).toFixed(2),risk,action:'观察·等待确认',quoteTime:f[30]||null,prevClose:prev,limitState,lockedLimitCandidate,buyAccess,relayConfidence:lockedLimitCandidate?'UNVERIFIED_LOCKED_BOARD':'UNVERIFIED_SNAPSHOT',scoreVersion:'V44.3',dataQuality:'PARTIAL',scoreBreakdown:{start:startParts,relay:relayParts,missing:['连续有效报价加速度','连续成交量价承接','板块实时共振','涨停封板事件'],gapPct:+gap.toFixed(2),limitPct,flatRange,limitState,buyAccess,relayConfidence:lockedLimitCandidate?'UNVERIFIED_LOCKED_BOARD':'UNVERIFIED_SNAPSHOT'}});

 }
 return items;
}
async function auditTracked(env){
 if(!env.DB)return {error:'D1未绑定'};
 const now=new Date(),parts=Object.fromEntries(new Intl.DateTimeFormat('en-GB',{timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit',weekday:'short',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(now).map(x=>[x.type,x.value]));
 const minute=Number(parts.hour)*60+Number(parts.minute);
 if(['Sat','Sun'].includes(parts.weekday)||!((minute>=570&&minute<690)||(minute>=780&&minute<900)))return {skipped:'非通常交易时段（节假日还需交易所日历核验）'};
 const day=`${parts.year}-${parts.month}-${parts.day}`;
 // Track existing D1 signal symbols only. This is NOT a whole-market background scanner.
 const result=await env.DB.prepare('SELECT DISTINCT code FROM aq_v42_signals WHERE trade_date>=? ORDER BY code LIMIT 120').bind(new Date(Date.now()-8*86400000).toLocaleDateString('en-CA',{timeZone:'Asia/Shanghai'})).all();
 const codes=(result.results||[]).map(x=>x.code);let saved=0,failed=0;
 for(let i=0;i<codes.length;i+=25){
  try{const q=await quote(codes.slice(i,i+25));const stmts=q.map(x=>env.DB.prepare('INSERT OR IGNORE INTO aq_v44_quote_audit(trade_date,code,quote_time,name,price,start_score,relay_score,score_version,source,captured_at) VALUES(?,?,?,?,?,?,?,?,?,?)').bind(day,x.code,x.quoteTime,x.name,x.price,x.startScore,x.relayScore,'V44.2','Tencent-public',now.toISOString()));if(stmts.length){await env.DB.batch(stmts);saved+=stmts.length;}}
  catch(e){failed++}
 }
 return {tracked:codes.length,saved,failed,note:'仅追踪已有TOP3历史代码，不代表全市场扫描或官方收盘价'};
}
const json=(data,status=200)=>Response.json(data,{status,headers:{'Cache-Control':'no-store','Access-Control-Allow-Origin':'*'}});
export default {async scheduled(event,env,ctx){ctx.waitUntil(auditTracked(env).catch(e=>console.error("AQ V44 cron",String(e))))},async fetch(req,env){const u=new URL(req.url);
 if(u.pathname==='/api/db/status'){
   if(!env.DB)return json({bound:false,v42Ready:false,legacyReady:false});
   const tables=await env.DB.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name IN ('aq_v42_signals','aq_rank_history','aq_top3_events','aq_signals','aq_early_events')").all().catch(()=>({results:[]}));
   const names=(tables.results||[]).map(x=>x.name);
   return json({bound:true,v42Ready:names.includes('aq_v42_signals'),legacyReady:names.includes('aq_rank_history')&&names.includes('aq_top3_events'),earlyReady:names.includes('aq_early_events'),tables:names});
  }
  if(u.pathname==='/api/early/events'&&req.method==='POST'){
  if(!env.DB)return json({error:'D1未绑定'},503);
  let body=await req.json().catch(()=>null);
  if(!body||!Array.isArray(body.items)||body.items.length>50)return json({error:'信号格式错误'},400);
  const today=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
  const good=body.items.filter(x=>/^\d{6}$/.test(x.code||'')&&Number.isFinite(x.price)&&x.price>0&&['PREWARN','CONFIRM','INVALID','EXPIRED','RADAR'].includes(x.kind)&&/^20\d{12}$/.test(x.quoteTime||'')&&x.quoteTime.slice(0,8)===today.replace(/-/g,''));
  try{
   if(good.length)await env.DB.batch(good.map(x=>env.DB.prepare(`INSERT INTO aq_early_events(trade_date,code,kind,name,first_quote_time,first_price,first_seen_at,first_score,reason,last_quote_time,last_price,last_seen_at,samples) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(trade_date,code,kind) DO UPDATE SET
 first_quote_time=CASE WHEN excluded.first_quote_time<aq_early_events.first_quote_time THEN excluded.first_quote_time ELSE aq_early_events.first_quote_time END,
 first_price=CASE WHEN excluded.first_quote_time<aq_early_events.first_quote_time THEN excluded.first_price ELSE aq_early_events.first_price END,
 reason=CASE WHEN excluded.first_quote_time<aq_early_events.first_quote_time THEN excluded.reason ELSE aq_early_events.reason END,
 last_quote_time=CASE WHEN excluded.last_quote_time>aq_early_events.last_quote_time THEN excluded.last_quote_time ELSE aq_early_events.last_quote_time END,
 last_price=CASE WHEN excluded.last_quote_time>aq_early_events.last_quote_time THEN excluded.last_price ELSE aq_early_events.last_price END,
 last_seen_at=excluded.last_seen_at,samples=aq_early_events.samples+1`).bind(today,x.code,x.kind,String(x.name||'').slice(0,40),x.quoteTime,x.price,new Date().toISOString(),Number.isFinite(x.startScore)?x.startScore:null,String(x.reason||'').slice(0,120),x.quoteTime,x.price,new Date().toISOString(),1)));
   // V44.9: persist point-in-time scores independently of legacy early-event schema.
   // Keep the earliest quote snapshot immutable; never backfill missing old scores.
   await env.DB.prepare(`CREATE TABLE IF NOT EXISTS aq_v449_signal_snapshots (
     trade_date TEXT NOT NULL,code TEXT NOT NULL,kind TEXT NOT NULL,
     name TEXT,quote_time TEXT NOT NULL,price REAL NOT NULL,
     start_score REAL,relay_score REAL,rank_at_signal INTEGER,
     score_version TEXT NOT NULL,reason TEXT,recorded_at TEXT NOT NULL,
     PRIMARY KEY(trade_date,code,kind))`).run();
   if(good.length)await env.DB.batch(good.map(x=>env.DB.prepare(`INSERT INTO aq_v449_signal_snapshots
     (trade_date,code,kind,name,quote_time,price,start_score,relay_score,rank_at_signal,score_version,reason,recorded_at)
     VALUES(?,?,?,?,?,?,?,?,?,?,?,?)
     ON CONFLICT(trade_date,code,kind) DO UPDATE SET
     name=CASE WHEN excluded.quote_time<aq_v449_signal_snapshots.quote_time THEN excluded.name ELSE aq_v449_signal_snapshots.name END,
     price=CASE WHEN excluded.quote_time<aq_v449_signal_snapshots.quote_time THEN excluded.price ELSE aq_v449_signal_snapshots.price END,
     start_score=CASE WHEN excluded.quote_time<aq_v449_signal_snapshots.quote_time THEN excluded.start_score ELSE aq_v449_signal_snapshots.start_score END,
     relay_score=CASE WHEN excluded.quote_time<aq_v449_signal_snapshots.quote_time THEN excluded.relay_score ELSE aq_v449_signal_snapshots.relay_score END,
     rank_at_signal=CASE WHEN excluded.quote_time<aq_v449_signal_snapshots.quote_time THEN excluded.rank_at_signal ELSE aq_v449_signal_snapshots.rank_at_signal END,
     quote_time=MIN(aq_v449_signal_snapshots.quote_time,excluded.quote_time)`).bind(
     today,x.code,x.kind,String(x.name||'').slice(0,40),x.quoteTime,x.price,
     Number.isFinite(x.startScore)?x.startScore:null,Number.isFinite(x.relayScore)?x.relayScore:null,
     Number.isInteger(x.rank)&&x.rank>0?x.rank:null,'V44.9',String(x.reason||'').slice(0,120),new Date().toISOString())));
   return json({saved:good.length,snapshotSaved:good.length,day:today});
  }catch(e){return json({error:'早期信号表不可用，请执行 migration_v422.sql',detail:String(e)},503)}
 }
 if(u.pathname==='/api/early/events'&&req.method==='GET'){
  if(!env.DB)return json({error:'D1未绑定'},503);
  const day=u.searchParams.get('day');if(!/^\d{4}-\d{2}-\d{2}$/.test(day||''))return json({error:'day格式错误'},400);
  try{const d=await env.DB.prepare('SELECT * FROM aq_early_events WHERE trade_date=? ORDER BY first_quote_time ASC LIMIT 500').bind(day).all();return json({items:d.results,day});}
  catch(e){return json({error:'早期信号表不可用，请执行 migration_v422.sql',detail:String(e)},503)}
 }
 if(u.pathname==='/api/v44/audit/status'){
  if(!env.DB)return json({ready:false,reason:'D1未绑定'},503);
  try{const r=await env.DB.prepare('SELECT COUNT(*) AS rows,COUNT(DISTINCT code) AS symbols,MAX(captured_at) AS last_capture FROM aq_v44_quote_audit').first();return json({ready:true,...r,scope:'仅已记录TOP3股票的后台快照',notBacktest:true});}
  catch(e){return json({ready:false,reason:'需执行migration_v440.sql',detail:String(e)},503)}
 }
 if(u.pathname==='/api/v44/score-explain'){
  const code=u.searchParams.get('code')||'';
  if(!/^\d{6}$/.test(code))return json({error:'code须为6位数字'},400);
  const rows=await quote([code],true).catch(()=>[]);
  if(!rows.length)return json({error:'无有效报价'},503);
  const x=scoreItem(rows[0]);
  return json({code,name:x.name,quoteTime:x.quoteTime,startScore:x.startScore,relayScore:x.relayScore,limitState:x.limitState,buyAccess:x.buyAccess,relayConfidence:x.relayConfidence,scoreVersion:x.scoreVersion,breakdown:x.scoreBreakdown,notice:'未经历史校准的快照评分；缺少连续样本时不能作为正式买入信号。'});
 }
 if(u.pathname==='/api/sector/status')return json({ready:false,reason:'尚无已验证的行业/概念映射与实时板块报价源；不伪造数据'});
  if(u.pathname==='/api/health')return json({ok:true,version:'AQ V44.0 Score Audit',source,scope:'候选代码空间逐批发现，非官方上市名录',timestamp:new Date().toISOString()});
 if(u.pathname==='/api/cr/status')return json({version:'41.9-phase1',ready:false,provider:null,crStatus:'待授权数据；未生成分数',historyDb:!!env.DB,adapter:'vendor-neutral',note:'仅建立接口状态与数据契约；不接受客户端伪造的主动买卖数据',serverTime:new Date().toISOString()});
 if(u.pathname==='/api/universe')return json({mode:'候选代码空间逐批发现',candidateCount:UNIVERSE.length,segmentSize:SEGMENT_SIZE,segments:Math.ceil(UNIVERSE.length/SEGMENT_SIZE),warning:'代码空间包含大量未上市号码；仅已返回有效报价的代码计入股票数。完成全部分段前不可视为全市场。'});
 if(u.pathname==='/api/eod/board'){
  if(!env.DB)return json({error:'D1未绑定'},503);
  try{
   const day=u.searchParams.get('day')||'';
   const latest=await env.DB.prepare('SELECT MAX(trade_date) AS day FROM aq_eod_candidates').first();
   const d=day||latest?.day;
   if(!d)return json({ready:false,items:[],notice:'尚未生成盘后榜，请先点击盘后扫描并保存。'});
   const r=await env.DB.prepare('SELECT * FROM aq_eod_candidates WHERE trade_date=? AND pct>0 AND start_score>=60 AND locked_board=0 ORDER BY relay_score DESC,start_score DESC LIMIT 20').bind(d).all();
   // Expose filter attrition, so an empty list cannot be mistaken for a quote-source outage.
   const stats=await env.DB.prepare('SELECT COUNT(*) AS total, SUM(CASE WHEN pct>0 THEN 1 ELSE 0 END) AS positive, SUM(CASE WHEN pct>0 AND start_score>=60 THEN 1 ELSE 0 END) AS strong, SUM(CASE WHEN pct>0 AND start_score>=60 AND locked_board=0 THEN 1 ELSE 0 END) AS eligible, MIN(pct) AS min_pct, MAX(pct) AS max_pct FROM aq_eod_candidates WHERE trade_date=?').bind(d).first();
   const dayCounts=await env.DB.prepare('SELECT trade_date AS day,COUNT(*) AS n,COUNT(DISTINCT segment) AS segments FROM aq_eod_candidates GROUP BY trade_date ORDER BY trade_date DESC LIMIT 5').all();
   const count=await env.DB.prepare('SELECT COUNT(*) AS n,COUNT(DISTINCT segment) AS segments FROM aq_eod_candidates WHERE trade_date=?').bind(d).first();
   return json({ready:true,day:d,items:r.results||[],filterStats:stats,dayCounts:dayCounts.results||[],count:count?.n||0,segments:count?.segments||0,complete:(count?.segments||0)===Math.ceil(UNIVERSE.length/SEGMENT_SIZE),notice:'已在服务端筛选正涨幅、启动分≥60、排除一字板；单日快照未校准，不代表上涨概率，次日须重新确认。'});
  }catch(e){return json({error:'请先执行 migration_v4414.sql: '+String(e)},503)}
 }
 if(u.pathname==='/api/eod/segment'&&req.method==='POST'){
  if(!env.DB)return json({error:'D1未绑定'},503);
  const idx=Number(u.searchParams.get('i'));
  if(!Number.isInteger(idx)||idx<0||idx>=Math.ceil(UNIVERSE.length/SEGMENT_SIZE))return json({error:'分段无效'},400);
  const codes=UNIVERSE.slice(idx*SEGMENT_SIZE,(idx+1)*SEGMENT_SIZE),out=[];let errors=0;
  for(let i=0;i<codes.length;i+=40){try{out.push(...await quote(codes.slice(i,i+40),true))}catch(e){errors++}}
  if(errors)return json({error:'行情源有'+errors+'批失败，本段不保存以免虚假完整',segment:idx,received:out.length},503);
  const byDay=new Map();for(const x of out){const day=String(x.quoteTime||'').slice(0,8);if(!/^20\d{6}$/.test(day))continue;if(!byDay.has(day))byDay.set(day,[]);byDay.get(day).push(x)}
  const day=[...byDay.keys()].sort().pop();if(!day)return json({error:'本段无有效历史行情',segment:idx},422);
  const items=byDay.get(day);const statements=items.map(x=>env.DB.prepare(`INSERT INTO aq_eod_candidates(trade_date,code,name,close_price,pct,start_score,relay_score,high,low,open_price,quote_time,segment,limit_state,locked_board,risk,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(trade_date,code) DO UPDATE SET name=excluded.name,close_price=excluded.close_price,pct=excluded.pct,start_score=excluded.start_score,relay_score=excluded.relay_score,high=excluded.high,low=excluded.low,open_price=excluded.open_price,quote_time=excluded.quote_time,segment=excluded.segment,limit_state=excluded.limit_state,locked_board=excluded.locked_board,risk=excluded.risk,updated_at=excluded.updated_at`).bind(day,x.code,x.name,x.price,x.pct,x.startScore,x.relayScore,x.high,x.low,x.open,x.quoteTime,idx,x.limitState,x.lockedLimitCandidate?1:0,x.risk.join('；'),new Date().toISOString()));
  try{for(let i=0;i<statements.length;i+=50)await env.DB.batch(statements.slice(i,i+50))}catch(e){return json({error:'D1写入失败，检查迁移: '+String(e)},503)}
  return json({day,segment:idx,saved:items.length,errors:0,notice:'保存的是行情原始交易日；跨交易日数据不会混成同一榜单'});
 }
 if(u.pathname==='/api/segment'){
  const index=Number(u.searchParams.get('i'));
  const segments=Math.ceil(UNIVERSE.length/SEGMENT_SIZE);
  if(!Number.isInteger(index)||index<0||index>=segments)return json({error:'无效分段'},400);
  const codes=UNIVERSE.slice(index*SEGMENT_SIZE,(index+1)*SEGMENT_SIZE);
  const chunks=[];for(let i=0;i<codes.length;i+=40)chunks.push(codes.slice(i,i+40));
  const started=Date.now(),all=[],errors=[];
  // Off-hours and weekends: permit last trading snapshot for research only.
  // Client quoteFresh() still blocks stale snapshots from live signals.
  const cnNow=new Date(new Date().toLocaleString('en-US',{timeZone:'Asia/Shanghai'}));
  const day=cnNow.getDay(),mins=cnNow.getHours()*60+cnNow.getMinutes();
  const liveSession=day>=1&&day<=5&&((mins>=570&&mins<690)||(mins>=780&&mins<900));
  // V44.12: bound parallelism and retry transport failures with smaller chunks.
  // A fulfilled response with zero matches is not necessarily an error: this is a code-space scan.
  let recovered=0, attempted=0;
  async function fetchChunk(c,tag){
   attempted++;
   try{return {items:await quote(c,!liveSession),error:null}}catch(e){
    // Split a failing batch to reduce upstream URL size and retry once per half.
    if(c.length<=10)return {items:[],error:tag+': '+String(e)};
    const mid=Math.ceil(c.length/2);
    const halves=await Promise.allSettled([quote(c.slice(0,mid),!liveSession),quote(c.slice(mid),!liveSession)]);
    const out=[],failed=[];
    for(let k=0;k<halves.length;k++){
     if(halves[k].status==='fulfilled'){out.push(...halves[k].value);recovered++}
     else failed.push(tag+'.'+k+': '+String(halves[k].reason));
    }
    return {items:out,error:failed.length?failed.join(' | '):null};
   }
  }
  for(let i=0;i<chunks.length;i+=3){
   const batch=chunks.slice(i,i+3);
   const results=await Promise.all(batch.map((c,j)=>fetchChunk(c,'batch '+(i+j))));
   for(const r of results){all.push(...r.items);if(r.error)errors.push(r.error)}
  }
  const items=[...new Map(all.map(x=>[x.code,x])).values()].map(scoreItem);
  return json({index,segments,requested:codes.length,received:items.length,failedBatches:errors.length,recoveredChunks:recovered,attemptedChunks:attempted,errors,elapsedMs:Date.now()-started,snapshotOnly:!liveSession,items,timestamp:new Date().toISOString(),source,complete:errors.length===0},errors.length?206:200);
 }
 if(u.pathname==='/api/quotes'){
  const codes=[...new Set((u.searchParams.get('codes')||'').split(',').filter(c=>/^\d{6}$/.test(c)))].slice(0,50);
  if(!codes.length)return json({error:'请提供1—50个6位代码'},400);
  const chunks=[];for(let i=0;i<codes.length;i+=25)chunks.push(codes.slice(i,i+25));
  const result=await Promise.allSettled(chunks.map(c=>quote(c,true)));const items=result.flatMap(r=>r.status==='fulfilled'?r.value:[]).map(scoreItem);
  return json({items,requested:codes.length,received:items.length,failedBatches:result.filter(r=>r.status==='rejected').length,fetchTime:new Date().toISOString(),source},result.every(r=>r.status==='rejected')?503:200);
 }
 if(u.pathname==='/api/diagnostics')return json({version:'41.9',cr:'unavailable: no licensed minute/tick data',nextDayProbability:'unavailable: not backtested',scoreVersion:'V44.0',scoreCalibration:'uncalibrated',backgroundScan:false,persistence:!!env.DB,quoteSource:source});
 // V44.7: read-only premarket historical snapshot; never re-label old quotes as live signals.
 if(u.pathname==='/api/v447/premarket'){
  if(!env.DB)return json({ready:false,error:'D1未绑定',items:[],watch:[]},503);
  const dateCN=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
  const cutoff=u.searchParams.get('before')||dateCN;
  if(!/^20\d{2}-\d{2}-\d{2}$/.test(cutoff))return json({error:'日期格式错误'},400);
  const sources=[];let days=[];
  for(const [table,col] of [['aq_early_events','trade_date'],['aq_v42_signals','trade_date'],['aq_rank_history','day'],['aq_v449_signal_snapshots','trade_date']]){
   try{const q=await env.DB.prepare(`SELECT MAX(${col}) AS d FROM ${table} WHERE ${col} < ?`).bind(cutoff).first();if(q?.d)days.push(q.d);sources.push(table)}catch(e){}
  }
  const day=days.sort().at(-1)||null;
  if(!day)return json({ready:true,day:null,items:[],watch:[],coverage:'无可用的历史候选记录；不使用今天或未来的数据填充昨天',sources});
  const map=new Map(),counts={earlyValid:0,earlyInvalid:0,top3:0,rank:0};
  function add(row,origin){
   if(!/^\d{6}$/.test(row.code||''))return;
   let x=map.get(row.code);
   if(!x){x={code:row.code,name:row.name||'',sources:[],firstTime:null,firstPrice:null,lastPrice:null,startScore:null,relayScore:null,bestRank:null,firstRank:null,signal:false,hasEarly:false};map.set(row.code,x)}
   if(!x.name&&row.name)x.name=row.name;
   if(!x.sources.includes(origin))x.sources.push(origin);
   const ft=String(row.firstTime||'');
   if(Number(row.first_price)>0&&ft&&(!x.firstTime||ft<x.firstTime)){x.firstTime=ft;x.firstPrice=Number(row.first_price)}
   if(Number(row.last_price)>0)x.lastPrice=Number(row.last_price);
   if(row.start_score!==null&&row.start_score!==undefined&&Number.isFinite(Number(row.start_score)))x.startScore=Number(row.start_score);
   if(row.relay_score!==null&&row.relay_score!==undefined&&Number.isFinite(Number(row.relay_score)))x.relayScore=Number(row.relay_score);
   if(Number(row.best_rank)>0)x.bestRank=x.bestRank?Math.min(x.bestRank,Number(row.best_rank)):Number(row.best_rank);
   if(Number(row.first_rank)>0)x.firstRank=x.firstRank?Math.min(x.firstRank,Number(row.first_rank)):Number(row.first_rank);
   if(origin==='AQ_TOP3'||origin==='确认信号')x.signal=true;
  }
  // INVALID / EXPIRED are risk events, never positive candidates. RADAR and PREWARN are watch-only.
  try{const r=await env.DB.prepare("SELECT code,name,first_quote_time AS firstTime,first_price,last_price,kind,first_score FROM aq_early_events WHERE trade_date=? AND kind IN ('PREWARN','CONFIRM','RADAR') ORDER BY first_quote_time LIMIT 1000").bind(day).all();for(const x of r.results||[]){counts.earlyValid++;add(x,'早期观察:'+x.kind);const v=map.get(x.code);if(v){v.hasEarly=true;if(v.startScore===null&&x.first_score!==null&&Number.isFinite(Number(x.first_score)))v.startScore=Number(x.first_score)}}}catch(e){counts.earlyError=String(e)}
  // New schema holds first-time scores and rank; historical rows with absent scores remain null.
  try{const r=await env.DB.prepare("SELECT code,name,quote_time AS firstTime,price AS first_price,price AS last_price,start_score,relay_score,rank_at_signal AS first_rank,kind FROM aq_v449_signal_snapshots WHERE trade_date=? AND kind IN ('PREWARN','CONFIRM','RADAR') ORDER BY quote_time LIMIT 1500").bind(day).all();for(const x of r.results||[]){add(x,x.kind==='CONFIRM'?'确认信号':'完整评分快照');const v=map.get(x.code);if(v){v.hasEarly=true;if(x.kind==='CONFIRM')v.signal=true}}counts.snapshots=(r.results||[]).length}catch(e){counts.snapshotError=String(e)}
  try{const r=await env.DB.prepare("SELECT COUNT(*) AS n FROM aq_early_events WHERE trade_date=? AND kind IN ('INVALID','EXPIRED')").bind(day).first();counts.earlyInvalid=r?.n||0}catch(e){}
  try{const r=await env.DB.prepare('SELECT code,name,first_quote_time AS firstTime,first_price,last_price,start_score,relay_score,first_rank FROM aq_v42_signals WHERE trade_date=? ORDER BY first_rank LIMIT 300').bind(day).all();for(const x of r.results||[]){counts.top3++;add(x,'AQ_TOP3')}}catch(e){counts.top3Error=String(e)}
  try{const r=await env.DB.prepare('SELECT code,name,first_seen AS firstTime,first_price,last_price,best_rank FROM aq_rank_history WHERE day=? ORDER BY best_rank LIMIT 1000').bind(day).all();for(const x of r.results||[]){counts.rank++;add(x,'历史排名快照')}}catch(e){counts.rankError=String(e)}
  // Exclude known risk events from actionable watchlists, but preserve historical trace.
  const risky=new Set();
  try{const r=await env.DB.prepare("SELECT DISTINCT code FROM aq_early_events WHERE trade_date=? AND kind IN ('INVALID','EXPIRED') LIMIT 5000").bind(day).all();for(const x of r.results||[])risky.add(x.code)}catch(e){}
  for(const x of map.values()){x.riskFlag=risky.has(x.code);x.scoreComplete=x.relayScore!==null;x.rankEvidence=x.signal||x.bestRank!==null||x.firstRank!==null;}
  const priority=x=>x.signal?0:x.rankEvidence?1:x.hasEarly?2:3;
  const items=[...map.values()].sort((a,b)=>priority(a)-priority(b)||Number(a.riskFlag)-Number(b.riskFlag)||(b.relayScore??-1)-(a.relayScore??-1)||(b.startScore??-1)-(a.startScore??-1)||(a.bestRank??a.firstRank??999)-(b.bestRank??b.firstRank??999));
  const watch=items.filter(x=>!x.riskFlag&&x.relayScore!==null&&x.relayScore>=60&&x.rankEvidence).sort((a,b)=>b.relayScore-a.relayScore||(a.bestRank??a.firstRank??999)-(b.bestRank??b.firstRank??999)).slice(0,10);
  const incomplete=[]; // V44.13: no duplicate standalone missing-score pool
  // V44.10: expose a separate, explicitly UNVERIFIED historical candidate list.
  // These are NOT valid confirmed signals or scored next-day relay candidates.
  const researchCandidates=items.filter(x=>!x.riskFlag&&x.hasEarly&&x.startScore!==null&&x.startScore>=65)
    .sort((a,b)=>Number(b.signal)-Number(a.signal)||(b.relayScore??-1)-(a.relayScore??-1)||(b.startScore??-1)-(a.startScore??-1))
    .slice(0,15).map(x=>({...x,verification:x.relayScore===null?'缺少次日分':!x.rankEvidence?'缺少榜单/确认依据':'待次日行情验证'}));
  const coverage=counts.top3+counts.rank===0?'⚠️ 昨日缺少已保存的AQ榜单/确认信号，历史预警仅能用于观察。':'D1保存的历史预警、确认与排名快照；不代表全市场涨幅榜。';
  return json({ready:true,day,items:items.slice(0,30),watch,incomplete,researchCandidates,observedCount:items.length,counts,sources,coverage:coverage+' 已排除风险事件涉及的股票进入接力名单；缺失的历史次日分不补造。研究候选不等于有效信号。'});

 }
 if(u.pathname==='/api/history'&&req.method==='GET'){
  if(!env.DB)return json({enabled:false,error:'尚未配置D1数据库，无法读取持久化历史'},503);
  const day=u.searchParams.get('day');if(!/^\d{4}-\d{2}-\d{2}$/.test(day||''))return json({error:'day须为YYYY-MM-DD'},400);
  const result=await env.DB.prepare('SELECT * FROM aq_rank_history WHERE day=? ORDER BY first_seen ASC, rank ASC').bind(day).all();
  return json({enabled:true,day,items:result.results});
 }
 if(u.pathname==='/api/history'&&req.method==='POST'){
  if(!env.DB)return json({enabled:false,error:'尚未配置D1数据库，历史记录未保存'},503);
  const body=await req.json().catch(()=>null);
  if(!body||!/^\d{4}-\d{2}-\d{2}$/.test(body.day||'')||!Array.isArray(body.items)||body.items.length>30)return json({error:'历史记录格式错误'},400);
  const ts=new Date().toISOString();const rows=body.items.filter(x=>/^\d{6}$/.test(x.code)&&Number.isFinite(x.price)&&Number.isInteger(x.rank)&&x.rank>=1&&x.rank<=30);
  const statements=rows.map(x=>env.DB.prepare(`INSERT INTO aq_rank_history(day,code,name,rank,first_seen,first_price,last_seen,last_price,best_rank,peak_price,trough_price,cr_status) VALUES(?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(day,code) DO UPDATE SET last_seen=excluded.last_seen,last_price=excluded.last_price,best_rank=MIN(aq_rank_history.best_rank,excluded.rank),peak_price=MAX(aq_rank_history.peak_price,excluded.last_price),trough_price=MIN(aq_rank_history.trough_price,excluded.last_price)`).bind(body.day,x.code,String(x.name||'').slice(0,40),x.rank,ts,x.price,ts,x.price,x.rank,x.price,x.price,'数据不足'));
  if(statements.length)await env.DB.batch(statements);
  const top=rows.filter(x=>x.rank<=3);
  if(top.length){try{await env.DB.batch(top.map(x=>env.DB.prepare('INSERT OR IGNORE INTO aq_top3_events(day,code,name,first_top3_at,first_top3_price,first_top3_rank) VALUES(?,?,?,?,?,?)').bind(body.day,x.code,String(x.name||'').slice(0,40),ts,x.price,x.rank)));}catch(e){return json({saved:rows.length,top3Saved:false,error:'请执行V41 schema.sql迁移：'+String(e)},207)}}
  return json({saved:statements.length,day:body.day,time:ts});
 }
 if(u.pathname==='/api/top3-history'){
  if(!env.DB)return json({enabled:false,error:'未配置D1'},503);
  const day=u.searchParams.get('day');if(!/^\d{4}-\d{2}-\d{2}$/.test(day||''))return json({error:'day格式错误'},400);
  try{const r=await env.DB.prepare('SELECT e.*,h.last_price,h.peak_price,h.trough_price,h.best_rank,h.last_seen FROM aq_top3_events e LEFT JOIN aq_rank_history h ON e.day=h.day AND e.code=h.code WHERE e.day=? ORDER BY e.first_top3_at').bind(day).all();return json({day,items:r.results,priceNote:'报价快照非官方收盘价；无后续交易日价格不计算收益'});}catch(e){return json({error:'数据库需执行V41 schema.sql',detail:String(e)},503)}
 }

 // V42: server-generated timestamps; first entry immutable, subsequent quote snapshots are explicitly not closing prices.
 if(u.pathname==='/api/v42/signals'&&req.method==='POST'){
  if(!env.DB)return json({error:'D1未绑定'},503);
  const body=await req.json().catch(()=>null);
  if(!body||!Array.isArray(body.items)||body.items.length>3)return json({error:'TOP3格式错误'},400);
  const now=new Date(),day=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit'}).format(now);
  const rows=body.items.filter(x=>/^\d{6}$/.test(x.code||'')&&Number.isFinite(x.price)&&x.price>0&&Number.isInteger(x.rank)&&x.rank>=1&&x.rank<=3&&/^20\d{12}$/.test(String(x.quoteTime||''))&&String(x.quoteTime).slice(0,8)===day.replace(/-/g,''));
  try{
   if(rows.length)await env.DB.batch(rows.map(x=>env.DB.prepare(`INSERT INTO aq_v42_signals(trade_date,code,name,first_rank,first_price,first_quote_time,first_seen_at,start_score,relay_score,aq_score,source,mode,last_price,last_quote_date,last_quote_time,last_seen_at,outcome_status) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(trade_date,code,mode) DO UPDATE SET last_price=excluded.last_price,last_quote_date=excluded.last_quote_date,last_quote_time=excluded.last_quote_time,last_seen_at=excluded.last_seen_at,first_rank=MIN(aq_v42_signals.first_rank,excluded.first_rank)`).bind(day,x.code,String(x.name||'').slice(0,40),x.rank,x.price,String(x.quoteTime),now.toISOString(),x.startScore??null,x.relayScore??null,x.aqScore??null,'Tencent-public','AUTO_TOP3',x.price,day,String(x.quoteTime),now.toISOString(),'当日跟踪')));
   return json({saved:rows.length,day,notice:'仅页面打开且完成扫描时写入；不是后台定时任务'});
  }catch(e){return json({error:'请先执行V42_migration.sql：'+String(e)},503)}
 }
 if(u.pathname==='/api/v42/review'&&req.method==='GET'){
  if(!env.DB)return json({error:'D1未绑定'},503);
  const days=Math.min(30,Math.max(1,Number(u.searchParams.get('days'))||7));
  const from=new Date(Date.now()-(days-1)*86400000).toLocaleDateString('en-CA',{timeZone:'Asia/Shanghai'});
  try{const d=await env.DB.prepare('SELECT trade_date,code,name,first_rank,first_price,first_quote_time,last_price,last_quote_date,last_quote_time,outcome_status FROM aq_v42_signals WHERE trade_date>=? ORDER BY trade_date DESC,first_rank ASC LIMIT 100').bind(from).all();return json({items:d.results,days,source:'snapshot-only'});}catch(e){return json({error:'请先执行V42_migration.sql：'+String(e)},503)}
 }
 if(u.pathname==='/api/v42/refresh'&&req.method==='POST'){
  if(!env.DB)return json({error:'D1未绑定'},503);
  try{
   const d=await env.DB.prepare('SELECT DISTINCT code FROM aq_v42_signals WHERE trade_date>=? LIMIT 90').bind(new Date(Date.now()-8*86400000).toLocaleDateString('en-CA',{timeZone:'Asia/Shanghai'})).all();
   const codes=d.results.map(x=>x.code),now=new Date(),day=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit'}).format(now),updates=[];
   for(let i=0;i<codes.length;i+=25){try{updates.push(...await quote(codes.slice(i,i+25),true))}catch(e){/* leave prior snapshots unchanged */}}
   const good=updates.filter(x=>/^20\d{12}$/.test(x.quoteTime||'')&&x.quoteTime.slice(0,8)>=day.replace(/-/g,''));
   // Refresh only with today's quote, never silently use yesterday's snapshot as today's price.
   if(good.length)await env.DB.batch(good.map(x=>env.DB.prepare(`UPDATE aq_v42_signals SET last_price=?,last_quote_date=?,last_quote_time=?,last_seen_at=?,outcome_status=CASE WHEN trade_date<? THEN '后续交易日快照（非收盘价）' ELSE '当日跟踪' END WHERE code=? AND (last_quote_time IS NULL OR last_quote_time<=?)`).bind(x.price,day,x.quoteTime,now.toISOString(),day,x.code,x.quoteTime)));
   return json({updated:good.length,skipped:codes.length-good.length,note:'仅更新今日有效报价；历史日期的收盘价、次日/第三日收益未被验证'});
  }catch(e){return json({error:'追踪更新失败：'+String(e)},503)}
 }
 if(u.pathname==='/api/scan')return json({error:'P4已改为分段扫描，请使用新版页面。',endpoint:'/api/universe'},409);
 return env.ASSETS.fetch(req);
}};
