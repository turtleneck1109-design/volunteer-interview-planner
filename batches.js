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
    return {...result,config,assignments,batches};
  }
  function queryRows(result){
    const r=apply(result);
    const dates=new Map(r.sessions.map(s=>[s.id,s.date]));
    return [...r.assignments].sort((a,b)=>dates.get(a.session).localeCompare(dates.get(b.session))||a.batchStartSeconds-b.batchStartSeconds||a.startSeconds-b.startSeconds||a.id.localeCompare(b.id)).map(a=>[a.arrivalLabel,a.waitingRoom,a.name,a.id]).concat(r.unassigned.map(a=>['待安排','',a.name,a.id]));
  }
  root.Batches={defaults,apply,windowFor,queryRows};
  if(typeof module!=='undefined')module.exports=root.Batches;
})(typeof globalThis!=='undefined'?globalThis:this);
