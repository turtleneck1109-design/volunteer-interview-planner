/* Manual assignments are an immutable layer over the automatic schedule. */
(function(root){
  'use strict';
  const P=typeof module!=='undefined'?require('./scheduler.js'):root.Planner;
  const time=n=>[Math.floor(n/3600),Math.floor(n/60)%60,n%60].map(v=>String(v).padStart(2,'0')).join(':');
  function seconds(value){
    const m=String(value).trim().match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
    if(!m||+m[1]>24||+m[2]>59||+(m[3]||0)>59)throw Error('时间请填写 HH:MM 或 HH:MM:SS。');
    const n=+m[1]*3600+ +m[2]*60+ +(m[3]||0);
    if(n>86400)throw Error('时间不能超过 24:00。');return n;
  }
  function free(result,id,session,interviewer){
    const s=result.sessions.find(s=>s.id===session);
    if(!s?.enabled||!s.covered||s.roles[interviewer]!=='interview')return [];
    const gap=result.config.gap*60,end=(s.end-result.config.reserve)*60,spaces=[];
    let start=s.start*60;
    const bookings=result.assignments.filter(a=>a.id!==id&&a.session===session&&a.interviewer===interviewer).sort((a,b)=>a.startSeconds-b.startSeconds);
    for(const a of bookings){
      const until=Math.min(end,a.startSeconds-gap);
      if(until>start)spaces.push({start,end:until});
      start=Math.max(start,a.endSeconds+gap);
    }
    if(start<end)spaces.push({start,end});return spaces;
  }
  function apply(data,automatic,overrides={}){
    const entries=Object.entries(overrides);
    if(!entries.length)return {...automatic,manualCount:0};
    const result=structuredClone(automatic),replacements=new Map();
    for(const [id,value] of entries){
      const c=data.candidates.find(c=>c.id===id),s=result.sessions.find(s=>s.id===value?.session),p=data.staff.find(p=>p.id===value?.interviewer);
      const fail=message=>{throw Error(`手动安排「${c?.name||id}」：${message}`);};
      if(!c)fail('候选人已不存在。');
      if(!s||!c.slots.includes(s.id))fail('时段不在候选人的可用时间内，请调整或恢复自动排班。');
      if(!s.enabled)fail('该时段已停用。请先调整手动安排。');
      if(!p||!p.interview.includes(s.id)||s.roles[p.id]!=='interview')fail('所选人员在该时段未担任面试官，请先调整手动安排或人员分工。');
      if(!s.covered)fail('该时段场务不足。');
      const startSeconds=value.startSeconds,endSeconds=value.endSeconds,durationSeconds=endSeconds-startSeconds;
      if(!Number.isInteger(startSeconds)||!Number.isInteger(endSeconds)||durationSeconds<1)fail('结束时间必须晚于开始时间，精确到秒。');
      if(startSeconds<s.start*60||endSeconds>(s.end-result.config.reserve)*60)fail('起止时间超出所选时段或占用了末尾预留。');
      replacements.set(id,{...c,session:s.id,interviewer:p.id,startSeconds,endSeconds,durationSeconds,start:startSeconds/60,end:endSeconds/60,duration:durationSeconds/60,status:'手动调整',manual:true});
    }
    result.assignments=result.assignments.filter(a=>!replacements.has(a.id)).concat([...replacements.values()]);
    result.unassigned=result.unassigned.filter(c=>!replacements.has(c.id));
    const groups=new Map();
    for(const a of result.assignments){const k=a.session+'|'+a.interviewer;if(!groups.has(k))groups.set(k,[]);groups.get(k).push(a);}
    for(const bookings of groups.values()){
      bookings.sort((a,b)=>a.startSeconds-b.startSeconds);
      for(let i=1;i<bookings.length;i++){
        const prev=bookings[i-1],next=bookings[i];
        if(next.startSeconds<prev.endSeconds+result.config.gap*60){
          const p=data.staff.find(p=>p.id===next.interviewer);
          throw Error(`${p.name} 时间冲突：「${prev.name}」${time(prev.startSeconds)}–${time(prev.endSeconds)} 与「${next.name}」${time(next.startSeconds)}–${time(next.endSeconds)}。请保留 ${result.config.gap} 分钟间隔，选择空闲时间或其他面试官。`);
        }
      }
    }
    P.summarize(data,result);
    const errors=P.validate(data,result);if(errors.length)throw Error(errors.join('；'));
    return result;
  }
  root.Adjustments={apply,free,seconds};
  if(typeof module!=='undefined')module.exports=root.Adjustments;
})(typeof globalThis!=='undefined'?globalThis:this);
