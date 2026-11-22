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
  // Maximum coverage, then maximum interview seconds. A second cost breaks
  // ties by scarce availability and balanced occupancy; it cannot reduce time.
  function match(candidates,units,gapSeconds) {
    const N=candidates.length,source=N+units.length,sink=source+1,V=sink+1,g=Array.from({length:V},()=>[]);
    function edge(a,b,cap,time,tie){const x={to:b,rev:g[b].length,cap,time,tie};g[a].push(x);g[b].push({to:a,rev:g[a].length-1,cap:0,time:-time,tie:-tie});return x;}
    const refs=[];
    candidates.forEach((c,i)=>{
      const available=units.map((u,j)=>({u,j})).filter(({u})=>u.capacity&&c.slots.includes(u.session));
      edge(source,i,1,0,new Set(available.map(({u})=>u.session)).size*10000);
      refs[i]=available.map(({u,j})=>({unit:j,e:edge(i,N+j,1,0,0)}));
    });
    units.forEach((u,j)=>{for(let k=1;k<=Math.min(u.capacity,N);k++)edge(N+j,sink,1,k<=u.staff.length?-(u.end-u.start):gapSeconds,Math.round(1000*(2*k-1)/u.capacity));});
    let flow=0;
    while(true){
      const d=Array(V).fill(Infinity),tie=Array(V).fill(Infinity),prev=Array(V),inq=Array(V).fill(false),q=[source];d[source]=0;tie[source]=0;inq[source]=true;
      for(let h=0;h<q.length;h++){
        const u=q[h];inq[u]=false;
        g[u].forEach((e,k)=>{const next=d[u]+e.time,t=tie[u]+e.tie;if(e.cap>0&&(next<d[e.to]||(next===d[e.to]&&t<tie[e.to]))){d[e.to]=next;tie[e.to]=t;prev[e.to]=[u,k];if(!inq[e.to]){q.push(e.to);inq[e.to]=true;}}});
      }
      if(!prev[sink])break;
      for(let v=sink;v!==source;){const [u,k]=prev[v],e=g[u][k];e.cap--;g[v][e.rev].cap++;v=u;}flow++;
    }
    const assignment=refs.map(list=>list.find(x=>x.e.cap===0)?.unit??-1),counts=Array(units.length).fill(0);
    assignment.forEach(j=>{if(j>=0)counts[j]++;});
    const interviewSeconds=units.reduce((sum,u,j)=>sum+Math.min(counts[j],u.staff.length)*(u.end-u.start)-Math.max(0,counts[j]-u.staff.length)*gapSeconds,0);
    return {flow,assignment,interviewSeconds};
  }
  function fixedAssignments(data,sessions,config){
    const fixed=[];
    for(const [id,v] of Object.entries(config.adjustments||{})){
      const c=data.candidates.find(c=>c.id===id),s=sessions.find(s=>s.id===v?.session),p=data.staff.find(p=>p.id===v?.interviewer);
      const fail=message=>{throw Error(`手动安排「${c?.name||id}」：${message}`);};
      if(!c)fail('候选人已不存在。');
      if(!s||!c.slots.includes(s.id))fail('时段不在候选人的可用时间内。');
      if(!s.enabled)fail('该时段已停用。');
      if(!p||!p.interview.includes(s.id)||s.roles[p.id]!=='interview')fail('所选人员在该时段未担任面试官。');
      if(!s.covered)fail('该时段场务不足。');
      const startSeconds=v.startSeconds,endSeconds=v.endSeconds,durationSeconds=endSeconds-startSeconds;
      if(!Number.isInteger(startSeconds)||!Number.isInteger(endSeconds)||durationSeconds<1)fail('结束时间必须晚于开始时间，精确到秒。');
      if(startSeconds<s.start*60||endSeconds>(s.end-config.reserve)*60)fail('起止时间超出所选时段或占用了末尾预留。');
      fixed.push({...c,session:s.id,interviewer:p.id,startSeconds,endSeconds,durationSeconds,start:startSeconds/60,end:endSeconds/60,duration:durationSeconds/60,status:'手动调整',manual:true});
    }
    const groups=new Map();
    for(const a of fixed){const key=a.session+'|'+a.interviewer;if(!groups.has(key))groups.set(key,[]);groups.get(key).push(a);}
    for(const lane of groups.values()){
      lane.sort((a,b)=>a.startSeconds-b.startSeconds);
      for(let i=1;i<lane.length;i++)if(lane[i].startSeconds<lane[i-1].endSeconds+config.gap*60)throw Error(`手动安排时间冲突：「${lane[i-1].name}」与「${lane[i].name}」，请保留面试间隔。`);
    }
    return fixed;
  }
  function summarize(data,result){
    const {config,sessions,assignments}=result,workloads=new Map(data.staff.map(p=>[p.id,{...p,count:0,interviewMinutes:0,fieldMinutes:0,fieldShifts:0,shifts:0}]));
    for(const s of sessions){
      const people=assignments.filter(a=>a.session===s.id),durations=people.map(a=>a.durationSeconds);let gapMinutes=0;
      s.lanes=s.interviewers.map(p=>{
        const lane=people.filter(a=>a.interviewer===p.id),w=workloads.get(p.id);
        w.count+=lane.length;w.interviewMinutes+=lane.reduce((sum,a)=>sum+a.durationSeconds,0)/60;w.shifts++;
        gapMinutes+=Math.max(0,lane.length-1)*config.gap;return {staff:p.id,count:lane.length};
      });
      for(const p of s.fieldStaff){const w=workloads.get(p.id);w.fieldMinutes+=s.end-s.start;w.fieldShifts++;w.shifts++;}
      s.count=people.length;s.online=people.filter(c=>c.online).length;s.offline=s.count-s.online;
      s.budgetMinutes=s.interviewers.length*s.usable-gapMinutes;s.average=s.count?s.budgetMinutes/s.count:null;
      s.interviewMinutes=durations.reduce((sum,n)=>sum+n,0)/60;
      s.scheduledAverage=s.count?s.interviewMinutes/s.count:null;s.durationSeconds=s.count?Math.round(s.scheduledAverage*60):null;
      s.availableMinutes=s.enabled&&s.covered?s.interviewers.length*s.usable:0;
      s.timeUtilization=s.availableMinutes?s.interviewMinutes/s.availableMinutes:0;
      s.utilization=s.standardCapacity?s.count/s.standardCapacity:null;
      const minimum=durations.length?Math.min(...durations):1;
      s.per=Math.max(0,Math.floor((s.usable*60+config.gap*60)/(minimum+config.gap*60)));
      s.capacity=s.enabled&&s.covered?s.per*s.interviewers.length:0;
    }
    assignments.sort((a,b)=>a.session.localeCompare(b.session)||a.startSeconds-b.startSeconds||a.interviewer.localeCompare(b.interviewer));
    const durations=assignments.map(a=>a.durationSeconds),totalMinutes=durations.reduce((sum,n)=>sum+n,0)/60,availableMinutes=sessions.reduce((sum,s)=>sum+s.availableMinutes,0);
    return Object.assign(result,{workloads:[...workloads.values()],manualCount:assignments.filter(a=>a.manual).length,matched:assignments.length,total:data.candidates.length,capacity:sessions.reduce((sum,s)=>sum+s.capacity,0),standardCapacity:sessions.reduce((sum,s)=>sum+s.standardCapacity,0),minimumSeconds:durations.length?Math.min(...durations):null,averageDuration:durations.length?totalMinutes/durations.length:null,minDuration:durations.length?Math.min(...durations)/60:null,maxDuration:durations.length?Math.max(...durations)/60:null,compressedCount:durations.filter(n=>n<config.duration*60).length,extendedCount:durations.filter(n=>n>config.duration*60).length,interviewMinutes:totalMinutes,availableMinutes,timeUtilization:availableMinutes?totalMinutes/availableMinutes:0});
  }
  function solve(data,input={}) {
    const config={...defaults,...input,overrides:{...(input.overrides||{})},enabled:[...(input.enabled??(data.sessions||SESSIONS).map(s=>s.id))]};
    for(const [k,lo,hi] of [['duration',1,120],['gap',0,30],['reserve',0,119],['field',0,15]])if(!Number.isInteger(config[k])||config[k]<lo||config[k]>hi)throw Error('排班参数超出范围。');
    const sessions=staffPlan(data,config),gapSeconds=config.gap*60;
    sessions.forEach(s=>{s.standardCapacity=s.capacity;s.standardPer=s.per;});
    const fixed=fixedAssignments(data,sessions,config),fixedIds=new Set(fixed.map(a=>a.id)),candidates=data.candidates.filter(c=>!fixedIds.has(c.id)),units=[];
    // Fixed interviews remain exact. Pack automatic interviews into the remaining
    // uninterrupted windows, reserving gaps on both sides of every fixed booking.
    for(const s of sessions){
      if(!s.enabled||!s.covered)continue;
      const windows=new Map(),limit=(s.end-config.reserve)*60;
      const add=(start,end,p)=>{if(end<=start)return;const key=start+'|'+end;if(!windows.has(key))windows.set(key,{session:s.id,start,end,staff:[]});windows.get(key).staff.push(p);};
      for(const p of s.interviewers){
        let start=s.start*60;
        const anchors=fixed.filter(a=>a.session===s.id&&a.interviewer===p.id).sort((a,b)=>a.startSeconds-b.startSeconds);
        for(const a of anchors){add(start,a.startSeconds-gapSeconds,p);start=a.endSeconds+gapSeconds;}
        add(start,limit,p);
      }
      units.push(...windows.values());
    }
    const setCapacity=seconds=>units.forEach(u=>u.capacity=Math.max(0,Math.floor((u.end-u.start+gapSeconds)/(seconds+gapSeconds)))*u.staff.length);
    setCapacity(1);const maximum=match(candidates,units,gapSeconds);
    // Among maximum-time, maximum-coverage solutions, maximize the shortest
    // automatic interview. The reference never bounds this search.
    let lo=1,hi=maximum.flow?Math.max(1,...units.map(u=>u.end-u.start)):1;
    while(lo<hi){const mid=Math.ceil((lo+hi)/2);setCapacity(mid);const trial=match(candidates,units,gapSeconds);if(trial.flow===maximum.flow&&trial.interviewSeconds===maximum.interviewSeconds)lo=mid;else hi=mid-1;}
    setCapacity(lo);const matched=match(candidates,units,gapSeconds),assignments=[...fixed],loads=new Map(data.staff.map(p=>[p.id,fixed.filter(a=>a.interviewer===p.id).length]));
    for(let j=0;j<units.length;j++){
      const u=units[j],people=candidates.filter((c,i)=>matched.assignment[i]===j),lanes=u.staff.map(p=>({p,people:[]}));
      for(const c of people.sort((a,b)=>a.slots.length-b.slots.length||a.id.localeCompare(b.id))){
        lanes.sort((a,b)=>a.people.length-b.people.length||loads.get(a.p.id)-loads.get(b.p.id)||a.p.id.localeCompare(b.p.id));
        const lane=lanes[0];lane.people.push(c);loads.set(lane.p.id,loads.get(lane.p.id)+1);
      }
      for(const lane of lanes){
        const n=lane.people.length;if(!n)continue;
        const available=u.end-u.start-(n-1)*gapSeconds,base=Math.floor(available/n),remainder=available%n;let startSeconds=u.start;
        lane.people.sort((a,b)=>Number(b.online)-Number(a.online)||a.id.localeCompare(b.id)).forEach((c,i)=>{
          const durationSeconds=base+(i<remainder?1:0),endSeconds=startSeconds+durationSeconds;
          assignments.push({...c,session:u.session,interviewer:lane.p.id,startSeconds,endSeconds,durationSeconds,start:startSeconds/60,end:endSeconds/60,duration:durationSeconds/60,status:'已安排'});startSeconds=endSeconds+gapSeconds;
        });
      }
    }
    const unassigned=candidates.filter((c,i)=>matched.assignment[i]===-1).map(c=>({...c,status:'待安排',reason:!c.slots.length?'未填写可用时段':!c.slots.some(id=>config.enabled.includes(id))?'所选时段均未启用':!c.slots.some(id=>{const s=sessions.find(s=>s.id===id);return s?.enabled&&s.covered&&s.interviewers.length;})?'可用时段缺少面试官或场务':'扣除间隔、预留和固定安排后，可用时间不足（已按秒分配）'}));
    return summarize(data,{config,sessions,assignments,unassigned});
  }
  function validate(data,result){
    const errors=[],seen=new Set(),groups={};
    for(const a of result.assignments){
      if(seen.has(a.id))errors.push('候选人重复安排');seen.add(a.id);
      const c=data.candidates.find(c=>c.id===a.id),s=result.sessions.find(s=>s.id===a.session),p=data.staff.find(p=>p.id===a.interviewer);
      if(!c||!s||!p||!c.slots.includes(a.session)||!p.interview.includes(a.session))errors.push('超出可用时段');
      if(!s||!p)continue;
      if(!s.enabled||s.roles[p.id]!=='interview'||s.fieldStaff.length<result.config.field)errors.push('人员角色冲突或场务不足');
      if(!Number.isInteger(a.durationSeconds)||a.durationSeconds<1||a.startSeconds<s.start*60||a.endSeconds>(s.end-result.config.reserve)*60||a.endSeconds-a.startSeconds!==a.durationSeconds||a.start!==a.startSeconds/60||a.end!==a.endSeconds/60||a.duration!==a.durationSeconds/60)errors.push('面试时间越界');
      (groups[a.session+'|'+a.interviewer]??=[]).push(a);
    }
    for(const g of Object.values(groups)){g.sort((a,b)=>a.startSeconds-b.startSeconds);for(let i=1;i<g.length;i++)if(g[i].startSeconds<g[i-1].endSeconds+result.config.gap*60)errors.push('面试官时间冲突');}
    for(const c of result.unassigned){if(seen.has(c.id))errors.push('已安排与待安排重叠');seen.add(c.id);}
    if(seen.size!==data.candidates.length)errors.push('人数不守恒');
    for(const s of result.sessions){if(s.count>s.capacity)errors.push('时段超容量');for(const p of s.fieldStaff)if(!p.field.includes(s.id))errors.push('场务超出可用时段');}
    return [...new Set(errors)];
  }
  root.Planner={SESSIONS,defaults,normalize,solve,validate,summarize};
  if(typeof module!=='undefined')module.exports=root.Planner;
})(typeof globalThis!=='undefined'?globalThis:this);
