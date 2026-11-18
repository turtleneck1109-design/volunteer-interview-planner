/* Arrival notices are derived from the current, validated interview schedule. */
(function(root){
  'use strict';
  const defaults={arrivalMode:'batch',batchMinutes:20,waitingRoom:'',dateRooms:{}};
  const clock=seconds=>{const parts=[Math.floor(seconds/3600),Math.floor(seconds/60)%60,seconds%60];return parts.slice(0,parts[2]?3:2).map(v=>String(v).padStart(2,'0')).join(':');};
  function windowFor(session,startSeconds,config){
    const length=config.batchMinutes*60,start=session.start*60+Math.floor((startSeconds-session.start*60)/length)*length;
    const end=Math.min(start+length,(session.end-config.reserve)*60);
    return {id:session.id+'|'+start,date:session.date,startSeconds:start,endSeconds:end,label:`${session.date} ${clock(start)}–${clock(end)}`};
  }
  function apply(result){
    const config={...defaults,...result.config,dateRooms:{...(result.config.dateRooms||{})}};
    if(!['batch','exact'].includes(config.arrivalMode))throw Error('请选择有效的到场通知方式。');
    if(!Number.isInteger(config.batchMinutes)||config.batchMinutes<1||config.batchMinutes>240)throw Error('批次间隔请填写 1—240 分钟的整数。');
    if(typeof config.waitingRoom!=='string'||config.waitingRoom.length>120||Object.values(config.dateRooms).some(v=>typeof v!=='string'||v.length>120))throw Error('候场地点请填写 120 字以内的文字。');
    config.waitingRoom=config.waitingRoom.trim();
    const groups=new Map(),sessions=new Map(result.sessions.map(s=>[s.id,s]));
    const assignments=result.assignments.map(a=>{
      const s=sessions.get(a.session),batch=windowFor(s,a.startSeconds,config);
      const dateRoom=Object.hasOwn(config.dateRooms,s.date)?config.dateRooms[s.date].trim():'';
      const waitingRoom=a.online?'线上等候':dateRoom||config.waitingRoom||'待定';
      if(!groups.has(batch.id))groups.set(batch.id,{...batch,session:s.id,count:0,online:0,offline:0});
      const group=groups.get(batch.id);group.count++;group[a.online?'online':'offline']++;
      return {...a,batchId:batch.id,batchStartSeconds:batch.startSeconds,batchEndSeconds:batch.endSeconds,batchLabel:batch.label,arrivalLabel:config.arrivalMode==='batch'?batch.label:`${s.date} ${clock(a.startSeconds)}–${clock(a.endSeconds)}`,waitingRoom};
    });
    const batches=[...groups.values()].sort((a,b)=>a.date.localeCompare(b.date)||a.startSeconds-b.startSeconds);
    // Keep empty windows visible. Split each lane's required gaps across window
    // boundaries so the total budget agrees with the original session budget.
    const availableBatches=result.sessions.flatMap(s=>{
      const gaps=s.interviewers.flatMap(p=>{
        const lane=assignments.filter(a=>a.session===s.id&&a.interviewer===p.id).sort((a,b)=>a.startSeconds-b.startSeconds);
        return lane.slice(0,-1).map(a=>[a.endSeconds,a.endSeconds+config.gap*60]);
      }),windows=[];
      for(let start=s.start*60;start<(s.end-config.reserve)*60;start+=config.batchMinutes*60){
        const window=windowFor(s,start,config),group=groups.get(window.id);
        const gapSeconds=gaps.reduce((sum,[a,b])=>sum+Math.max(0,Math.min(b,window.endSeconds)-Math.max(a,start)),0);
        const budgetMinutes=s.enabled&&s.covered?Math.max(0,((window.endSeconds-start)*s.interviewers.length-gapSeconds)/60):0;
        const count=group?.count||0;
        windows.push({...window,session:s.id,count,online:group?.online||0,offline:group?.offline||0,enabled:s.enabled,covered:s.covered,interviewers:s.interviewers,fieldStaff:s.fieldStaff,budgetMinutes,average:count?budgetMinutes/count:null});
      }
      return windows;
    }).sort((a,b)=>a.date.localeCompare(b.date)||a.startSeconds-b.startSeconds);
    return {...result,config,assignments,batches,availableBatches};
  }
  function queryRows(result){
    const r=apply(result);
    const dates=new Map(r.sessions.map(s=>[s.id,s.date]));
    return [...r.assignments].sort((a,b)=>dates.get(a.session).localeCompare(dates.get(b.session))||a.batchStartSeconds-b.batchStartSeconds||a.startSeconds-b.startSeconds||a.id.localeCompare(b.id)).map(a=>[a.arrivalLabel,a.waitingRoom,a.name,a.id]).concat(r.unassigned.map(a=>['待安排','',a.name,a.id]));
  }
  root.Batches={defaults,apply,windowFor,queryRows,clock};
  if(typeof module!=='undefined')module.exports=root.Batches;
})(typeof globalThis!=='undefined'?globalThis:this);
