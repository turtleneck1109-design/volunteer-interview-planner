/* Validated, immutable roster operations. No network or storage side effects. */
(function(root){
  'use strict';
  const P=typeof module!=='undefined'?require('./scheduler.js'):root.Planner;
  const headers={candidates:['学号','姓名','面试时间','线上面试'],staff:['姓名','部门','面试官时间','场务时间','工作人员编号']};
  const hm=n=>`${String(Math.floor(n/60)).padStart(2,'0')}:${String(n%60).padStart(2,'0')}`;
  const windowsText=ws=>ws.map(w=>`${w.date} ${hm(w.start)}-${hm(w.end)}`).join('、');
  const empty=(year=new Date().getFullYear())=>({candidates:[headers.candidates.slice()],staff:[headers.staff.slice()],sources:[],year});
  function canonical(raw){
    const d=P.normalize(raw.candidates,raw.staff,raw.sources,raw.year);
    return {...empty(raw.year),sources:(raw.sources||[]).slice(),
      candidates:[headers.candidates.slice(),...d.candidates.map(c=>[c.id,c.name,windowsText(c.windows),c.online?'是':'否'])],
      staff:[headers.staff.slice(),...d.staff.map(p=>[p.name,p.department,windowsText(p.interviewWindows),windowsText(p.fieldWindows),p.id])]};
  }
  function change(raw,kind,key,row){
    if(!['candidates','staff'].includes(kind))throw Error('名单类型无效。');
    const next=canonical(raw),col=kind==='candidates'?0:4,rows=next[kind];
    if(key===null){rows.push(row.slice());}
    else {const index=rows.findIndex((r,i)=>i>0&&r[col]===key);if(index<1)throw Error('该记录已不存在。');rows[index]=row.slice();}
    return canonical(next);
  }
  function remove(raw,kind,keys){
    if(!['candidates','staff'].includes(kind))throw Error('名单类型无效。');
    const next=canonical(raw),col=kind==='candidates'?0:4,ids=new Set(keys);
    next[kind]=next[kind].filter((r,i)=>i===0||!ids.has(r[col]));return canonical(next);
  }
  // Retain disabled windows even when a changed availability splits a session.
  function reconcile(config,before,after,renamedCandidates={}){
    const disabled=before.sessions.filter(s=>!config.enabled.includes(s.id));
    const enabled=after.sessions.filter(s=>!disabled.some(old=>old.date===s.date&&old.start<s.end&&old.end>s.start)).map(s=>s.id);
    const overrides={};
    for(const p of after.staff)for(const s of after.sessions){
      const role=config.overrides[`${p.id}|${s.id}`];
      if(role==='off'||role==='interview'&&p.interview.includes(s.id)||role==='field'&&p.field.includes(s.id))overrides[`${p.id}|${s.id}`]=role;
    }
    const adjustments=Object.fromEntries(Object.entries(config.adjustments||{}).map(([id,a])=>[Object.hasOwn(renamedCandidates,id)?renamedCandidates[id]:id,a]).filter(([id])=>after.candidates.some(c=>c.id===id)).map(([id,a])=>{
      const previous=before.sessions.find(s=>s.id===a.session);
      const session=after.sessions.find(s=>s.date===previous?.date&&s.start*60<=a.startSeconds&&s.end*60>=a.endSeconds);
      return [id,{...a,session:session?.id||a.session}];
    }));
    return {...config,enabled,overrides,adjustments};
  }
  root.Roster={headers,empty,canonical,change,remove,reconcile,windowsText};
  if(typeof module!=='undefined')module.exports=root.Roster;
})(typeof globalThis!=='undefined'?globalThis:this);
