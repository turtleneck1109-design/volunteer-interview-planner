/* One candidate, one interviewer. Pure functions; also usable from Node.js. */
(function(root) {
  'use strict';
  const SESSIONS = [17,18,19].flatMap(day => [18,20].map(hour => ({id:`2026-11-${day}-${hour}`,date:`2026-11-${day}`,day,hour,start:hour*60,end:(hour+2)*60,label:`11月${day}日 ${hour}:00–${hour+2}:00`})));
  const defaults = {duration:5,gap:0,reserve:0,field:1,enabled:SESSIONS.map(s=>s.id),overrides:{}};
  const clock=n=>`${String(Math.floor(n/60)).padStart(2,'0')}:${String(n%60).padStart(2,'0')}`;
  function times(value,year) {
    const text=String(value??'').trim(); if(!text) return [];
    const chunks=text.split(/[、，,;；\n]+/).filter(s=>s.trim());
    return chunks.map(chunk=>{
      const dm=chunk.match(/(?:(\d{4})[年\/-])?(\d{1,2})[月\/-](\d{1,2})日?/),tm=chunk.match(/(\d{1,2})[:：](\d{2})\s*[-—–~～至]\s*(\d{1,2})[:：](\d{2})/);
      if(!dm||!tm)throw Error(`无法识别时段：${chunk}。请使用“11月17日 18:00-20:00”等格式。`);
      const y=dm[1]?+dm[1]:year,month=+dm[2],day=+dm[3],date=`${y}-${String(month).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
      const actual=new Date(Date.UTC(y,month-1,day));
      if(actual.getUTCFullYear()!==y||actual.getUTCMonth()!==month-1||actual.getUTCDate()!==day)throw Error(`日期无效：${chunk}`);
      const start=+tm[1]*60+ +tm[2],end=+tm[3]*60+ +tm[4];
      if(+tm[1]>23||+tm[3]>24||+tm[2]>59||+tm[4]>59||end>1440||end<=start)throw Error(`时间范围无效或跨午夜：${chunk}`);
      return {date,start,end};
    });
  }
  function normalize(candidateRows,staffRows,sourceNames=[],year=2026) {
    if(!Number.isInteger(year)||year<2000||year>2100)throw Error('请选择 2000—2100 范围内的面试年份。');
    if(!candidateRows.length||!staffRows.length)throw Error('问卷不能为空。');
    const ci=re=>candidateRows[0].findIndex(h=>re.test(String(h)));
    const si=re=>staffRows[0].findIndex(h=>re.test(String(h)));
    const cs=[ci(/学号|候选人编号/),ci(/姓名/),ci(/面试.*(?:时间|时段)|(?:时间|时段).*面试/),ci(/线上/)], ss=[si(/姓名/),si(/部门|学院|组织/),si(/面试官.*(?:时间|时段)|(?:时间|时段).*面试官/),si(/场务.*(?:时间|时段)|(?:时间|时段).*场务/)];
    if(cs.some(x=>x<0)||[ss[0],ss[2],ss[3]].some(x=>x<0)) throw Error('表头不匹配。候选人表需含学号、姓名、面试时间和线上选项；工作人员表需含姓名、面试官时间、场务时间。');
    const seen=new Set();
    const candidates=candidateRows.slice(1).filter(r=>r.some(v=>String(v??'').trim())).map((r,index)=>{
      const id=String(r[cs[0]]??'').trim(),name=String(r[cs[1]]??'').trim(),mode=String(r[cs[3]]??'').trim();
      if(!id||!name) throw Error(`候选人第 ${index+2} 行缺少姓名或学号。`);
      if(seen.has(id)) throw Error(`学号重复：${id}，请先核对原表。`); seen.add(id);
      if(!['是','否'].includes(mode)) throw Error(`候选人第 ${index+2} 行的线上面试选项无法识别。`);
      return {id,name,online:mode==='是',windows:times(r[cs[2]],year),sourceRow:index+2};
    });
    const staffNames=new Set(),staffIds=new Set(),staffIdColumn=si(/工作人员编号/);
    const staff=staffRows.slice(1).filter(r=>r.some(v=>String(v??'').trim())).map((r,index)=>{
      const name=String(r[ss[0]]??'').trim(); if(!name) throw Error(`工作人员第 ${index+2} 行缺少姓名。`);
      if(staffNames.has(name)) throw Error(`工作人员姓名重复：${name}，请先合并或区分同名人员。`); staffNames.add(name);
      const id=String(r[staffIdColumn]||`staff-${index+1}`).trim();
      if(staffIds.has(id))throw Error('工作人员编号重复。');staffIds.add(id);
      return {id,name,department:String(r[ss[1]]??''),interviewWindows:times(r[ss[2]],year),fieldWindows:times(r[ss[3]],year)};
    });
    const overlaps=candidates.filter(c=>staffNames.has(c.name));
    if(overlaps.length) throw Error(`两张表出现同名人员：${overlaps.map(c=>c.name).join('、')}。请先确认是否同一人，避免跨角色冲突。`);
    const windows=[...candidates.flatMap(c=>c.windows),...staff.flatMap(p=>[...p.interviewWindows,...p.fieldWindows])],dates=[...new Set(windows.map(w=>w.date))].sort(),sessions=[];
    for(const date of dates){
      const dayWindows=windows.filter(w=>w.date===date),bounds=[...new Set(dayWindows.flatMap(w=>[w.start,w.end]))].sort((a,b)=>a-b);
      for(let j=0;j<bounds.length-1;j++){
        const start=bounds[j],end=bounds[j+1];if(!dayWindows.some(w=>w.start<=start&&w.end>=end))continue;
        const [y,m,d]=date.split('-').map(Number);
        sessions.push({id:`${date}-${clock(start)}-${clock(end)}`,date,day:d,hour:Math.floor(start/60),start,end,label:`${m}月${d}日 ${clock(start)}–${clock(end)}`});
      }
    }
    if(sessions.length>120)throw Error('识别出超过 120 个不同时段，请先合并问卷中零散的时间范围。');
    const covers=(windows,s)=>windows.some(w=>w.date===s.date&&w.start<=s.start&&w.end>=s.end);
    candidates.forEach(c=>{c.slots=sessions.filter(s=>covers(c.windows,s)).map(s=>s.id);});
    staff.forEach(p=>{p.interview=sessions.filter(s=>covers(p.interviewWindows,s)).map(s=>s.id);p.field=sessions.filter(s=>covers(p.fieldWindows,s)).map(s=>s.id);});
    return {candidates,staff,sessions,sources:sourceNames,year};
  }
  function staffPlan(data,config) {
    const fields=Object.fromEntries(data.staff.map(p=>[p.id,0]));
    return (data.sessions||SESSIONS).map(s=>{
      const enabled=config.enabled.includes(s.id),roles={},warnings=[];
      if(!enabled)return {...s,enabled,roles,interviewers:[],fieldStaff:[],capacity:0,per:0,usable:0,warnings};
      let pool=[];
      for(const p of data.staff) {
        const i=p.interview.includes(s.id),f=p.field.includes(s.id),v=config.overrides[`${p.id}|${s.id}`]||'auto';
        if(v==='off'||(!i&&!f)){roles[p.id]='off';continue;}
        if(v==='interview'&&i)roles[p.id]='interview';
        else if(v==='field'&&f){roles[p.id]='field';fields[p.id]++;}
        else if(v==='auto')pool.push({p,i,f});
        else {roles[p.id]='off';warnings.push(`${p.name}的指定角色不在问卷可用范围内`);}
      }
      let need=Math.max(0,config.field-Object.values(roles).filter(v=>v==='field').length);
      const fieldOptions=pool.filter(x=>x.f).sort((a,b)=>Number(a.i)-Number(b.i)||fields[a.p.id]-fields[b.p.id]||a.p.interview.length-b.p.interview.length||a.p.id.localeCompare(b.p.id));
      const selected=new Set(fieldOptions.slice(0,need).map(x=>x.p.id));
      for(const x of pool) {
        if(selected.has(x.p.id)){roles[x.p.id]='field';fields[x.p.id]++;}
        else roles[x.p.id]=x.i?'interview':'off';
      }
      const interviewers=data.staff.filter(p=>roles[p.id]==='interview'),fieldStaff=data.staff.filter(p=>roles[p.id]==='field');
      const covered=fieldStaff.length>=config.field, usable=Math.max(0,s.end-s.start-config.reserve);
      const per=Math.max(0,Math.floor((usable+config.gap)/(config.duration+config.gap)));
      if(!covered)warnings.push(`场务不足：需要 ${config.field} 人，实际 ${fieldStaff.length} 人，本场暂停安排候选人`);
      if(!interviewers.length)warnings.push('没有可用面试官');
      return {...s,enabled,roles,interviewers,fieldStaff,usable,covered,per,capacity:covered?per*interviewers.length:0,warnings};
    });
  }
  // Successive shortest augmenting paths: maximum coverage first, then scarce
  // availability and convex session occupancy costs. No fabricated availability.
  function match(candidates,sessions) {
    const N=candidates.length,source=N+sessions.length,sink=source+1,V=sink+1,g=Array.from({length:V},()=>[]);
    function edge(a,b,cap,cost){const x={to:b,rev:g[b].length,cap,cost,initial:cap};g[a].push(x);g[b].push({to:a,rev:g[a].length-1,cap:0,cost:-cost,initial:0});return x;}
    const refs=[];
    candidates.forEach((c,i)=>{
      const available=sessions.filter(s=>s.capacity&&c.slots.includes(s.id));
      edge(source,i,1,available.length*10000);
      refs[i]=available.map(s=>({s:sessions.indexOf(s),e:edge(i,N+sessions.indexOf(s),1,0)}));
    });
    sessions.forEach((s,j)=>{for(let k=1;k<=Math.min(s.capacity,N);k++)edge(N+j,sink,1,Math.round(1000*(2*k-1)/s.capacity));});
    let flow=0;
    while(true){
      const d=Array(V).fill(Infinity),prev=Array(V),inq=Array(V).fill(false),q=[source];d[source]=0;inq[source]=true;
      for(let h=0;h<q.length;h++){
        const u=q[h];inq[u]=false;
        g[u].forEach((e,k)=>{if(e.cap>0&&d[e.to]>d[u]+e.cost){d[e.to]=d[u]+e.cost;prev[e.to]=[u,k];if(!inq[e.to]){q.push(e.to);inq[e.to]=true;}}});
      }
      if(!prev[sink])break;
      for(let v=sink;v!==source;){const [u,k]=prev[v],e=g[u][k];e.cap--;g[v][e.rev].cap++;v=u;}flow++;
    }
    return {flow,assignment:refs.map(list=>list.find(x=>x.e.cap===0)?.s??-1)};
  }
  function solve(data,input={}) {
    const config={...defaults,...input,overrides:{...(input.overrides||{})},enabled:[...(input.enabled??(data.sessions||SESSIONS).map(s=>s.id))]};
    for(const [k,lo,hi] of [['duration',1,120],['gap',0,30],['reserve',0,119],['field',0,15]])if(!Number.isInteger(config[k])||config[k]<lo||config[k]>hi)throw Error('排班参数超出范围。');
    const sessions=staffPlan(data,config),referenceSeconds=config.duration*60,gapSeconds=config.gap*60;
    sessions.forEach(s=>{s.standardCapacity=s.capacity;s.standardPer=s.per;});
    const setCapacity=seconds=>sessions.forEach(s=>{
      s.per=Math.max(0,Math.floor((s.usable*60+gapSeconds)/(seconds+gapSeconds)));
      s.capacity=s.enabled&&s.covered?s.per*s.interviewers.length:0;
    });
    // First maximize coverage at one-second precision, then find the largest
    // common duration that preserves that coverage. The reference is soft.
    let matched=match(data.candidates,sessions),minimumSeconds=referenceSeconds;
    if(matched.flow<data.candidates.length){
      setCapacity(1);const maximum=match(data.candidates,sessions);
      if(maximum.flow>matched.flow){
        let lo=1,hi=referenceSeconds;
        while(lo<hi){const mid=Math.ceil((lo+hi)/2);setCapacity(mid);if(match(data.candidates,sessions).flow===maximum.flow)lo=mid;else hi=mid-1;}
        minimumSeconds=lo;
      }
      setCapacity(minimumSeconds);matched=match(data.candidates,sessions);
    }
    const workloads=Object.fromEntries(data.staff.map(p=>[p.id,{...p,count:0,interviewMinutes:0,fieldMinutes:0,fieldShifts:0,shifts:0}]));
    const assignments=[];
    for(let j=0;j<sessions.length;j++){
      const s=sessions[j],people=data.candidates.filter((c,i)=>matched.assignment[i]===j);
      const lanes=s.interviewers.map(p=>({p,people:[]}));
      // Balance each block first (difference at most one), then total workload.
      for(const c of people.sort((a,b)=>a.slots.length-b.slots.length||a.id.localeCompare(b.id))){
        lanes.sort((a,b)=>a.people.length-b.people.length||workloads[a.p.id].count-workloads[b.p.id].count||a.p.id.localeCompare(b.p.id));
        const lane=lanes[0];lane.people.push(c);workloads[lane.p.id].count++;
      }
      const maxLaneCount=Math.max(0,...lanes.map(l=>l.people.length));
      // Recover spare time in quieter sessions without reducing coverage.
      s.durationSeconds=maxLaneCount?Math.min(referenceSeconds,Math.floor((s.usable*60-(maxLaneCount-1)*gapSeconds)/maxLaneCount)):null;
      let gapMinutes=0;
      for(const lane of lanes){
        lane.people.sort((a,b)=>Number(b.online)-Number(a.online)||a.id.localeCompare(b.id));
        gapMinutes+=Math.max(0,lane.people.length-1)*config.gap;
        lane.people.forEach((c,index)=>{
          const startSeconds=s.start*60+index*(s.durationSeconds+gapSeconds),endSeconds=startSeconds+s.durationSeconds;
          assignments.push({...c,session:s.id,interviewer:lane.p.id,startSeconds,endSeconds,durationSeconds:s.durationSeconds,start:startSeconds/60,end:endSeconds/60,duration:s.durationSeconds/60,status:'已安排'});
        });
        workloads[lane.p.id].interviewMinutes+=lane.people.length*(s.durationSeconds||0)/60;
        workloads[lane.p.id].shifts++;
      }
      s.fieldStaff.forEach(p=>{workloads[p.id].fieldMinutes+=s.end-s.start;workloads[p.id].fieldShifts++;workloads[p.id].shifts++;});
      s.count=people.length;s.online=people.filter(c=>c.online).length;s.offline=people.length-s.online;
      s.budgetMinutes=s.interviewers.length*s.usable-gapMinutes;
      s.average=s.count?s.budgetMinutes/s.count:null;s.scheduledAverage=s.count?s.durationSeconds/60:null;s.utilization=s.standardCapacity?s.count/s.standardCapacity:null;
      s.lanes=lanes.map(l=>({staff:l.p.id,count:l.people.length}));
    }
    const unassigned=data.candidates.filter((c,i)=>matched.assignment[i]===-1).map(c=>({...c,status:'待安排',reason:!c.slots.length?'未填写可用时段':!c.slots.some(id=>config.enabled.includes(id))?'所选时段均未启用':!c.slots.some(id=>{const s=sessions.find(s=>s.id===id);return s?.enabled&&s.covered&&s.interviewers.length;})?'可用时段缺少面试官或场务':'扣除间隔和预留后，可用时间不足（已按秒压缩）'}));
    assignments.sort((a,b)=>a.session.localeCompare(b.session)||a.start-b.start||a.interviewer.localeCompare(b.interviewer));
    const durations=assignments.map(a=>a.durationSeconds);
    return {config,sessions,assignments,unassigned,workloads:Object.values(workloads),matched:matched.flow,total:data.candidates.length,capacity:sessions.reduce((n,s)=>n+s.capacity,0),standardCapacity:sessions.reduce((n,s)=>n+s.standardCapacity,0),minimumSeconds,averageDuration:durations.length?durations.reduce((n,v)=>n+v,0)/durations.length/60:null,minDuration:durations.length?Math.min(...durations)/60:null,maxDuration:durations.length?Math.max(...durations)/60:null,compressedCount:durations.filter(v=>v<referenceSeconds).length};
  }
  function validate(data,result){
    const errors=[],seen=new Set(),groups={};
    for(const a of result.assignments){
      if(seen.has(a.id))errors.push('候选人重复安排');seen.add(a.id);
      const c=data.candidates.find(c=>c.id===a.id),s=result.sessions.find(s=>s.id===a.session),p=data.staff.find(p=>p.id===a.interviewer);
      if(!c||!s||!p||!c.slots.includes(a.session)||!p.interview.includes(a.session))errors.push('超出可用时段');
      if(!s||!p)continue;
      if(!s.enabled||s.roles[p.id]!=='interview'||s.fieldStaff.length<result.config.field)errors.push('人员角色冲突或场务不足');
      if(!Number.isInteger(a.durationSeconds)||a.durationSeconds<1||a.durationSeconds>result.config.duration*60||a.startSeconds<s.start*60||a.endSeconds>(s.end-result.config.reserve)*60||a.endSeconds-a.startSeconds!==a.durationSeconds||a.start!==a.startSeconds/60||a.end!==a.endSeconds/60||a.duration!==a.durationSeconds/60)errors.push('面试时间越界');
      (groups[a.session+'|'+a.interviewer]??=[]).push(a);
    }
    for(const g of Object.values(groups)){g.sort((a,b)=>a.startSeconds-b.startSeconds);for(let i=1;i<g.length;i++)if(g[i].startSeconds<g[i-1].endSeconds+result.config.gap*60)errors.push('面试官时间冲突');}
    for(const c of result.unassigned){if(seen.has(c.id))errors.push('已安排与待安排重叠');seen.add(c.id);}
    if(seen.size!==data.candidates.length)errors.push('人数不守恒');
    for(const s of result.sessions){if(s.count>s.capacity)errors.push('时段超容量');for(const p of s.fieldStaff)if(!p.field.includes(s.id))errors.push('场务超出可用时段');}
    return [...new Set(errors)];
  }
  root.Planner={SESSIONS,defaults,normalize,solve,validate};
  if(typeof module!=='undefined')module.exports=root.Planner;
})(typeof globalThis!=='undefined'?globalThis:this);
