(()=>{
  'use strict';
  const $=id=>document.getElementById(id),esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const hm=n=>{const sec=Math.round(n*60),parts=[Math.floor(sec/3600),Math.floor(sec/60)%60,sec%60];return parts.slice(0,parts[2]?3:2).map(v=>String(v).padStart(2,'0')).join(':');};
  const minutes=n=>n==null?'—':Number(n.toFixed(2));
  const durationLabel=n=>n==null?'—':`${Math.floor(n/60)}分${n%60?String(n%60)+'秒':''}`;
  const baseRaw=JSON.parse($('embedded-data').textContent),demoRaw=JSON.parse($('embedded-demo').textContent);let raw=structuredClone(baseRaw);
  const storageKey='volunteer-planner-v2:'+location.pathname;
  let rosterKind='candidates',rosterPage=1,selected=new Set(),history=[],editing=null,confirmAction=null,activePage='overview';
  let config=JSON.parse($('embedded-config').textContent),data,result,metric='actual',page=1,toastTimer,assignmentEditing=null;
  const freshConfig=()=>({...structuredClone(Planner.defaults),enabled:data.sessions.map(s=>s.id)});
  const staffName=id=>data.staff.find(p=>p.id===id)?.name||'—';
  const slotLabel=id=>data.sessions.find(s=>s.id===id)?.label||'待安排';
  function toast(msg){$('toast').textContent=msg;clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('toast').textContent='',4500);}
  function download(name,content,type='text/plain;charset=utf-8'){
    const url=URL.createObjectURL(new Blob([content],{type})),a=document.createElement('a');a.href=url;a.download=name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),2000);
  }
  function csvCell(v){let s=String(v??'');if(/^[=+@\-\r]/.test(s)||(/^\t/.test(s)&&!/^\t\d+$/.test(s)))s="'"+s;return '"'+s.replace(/"/g,'""')+'"';}
  function csv(name,rows){download(name,'\ufeff'+rows.map(r=>r.map(csvCell).join(',')).join('\r\n'),'text/csv;charset=utf-8');toast('已导出 CSV 文件');}
  function candidateCSV(items,name){
    csv(name,[['学号（文本）','候选人','面试方式','安排状态','日期','开始时间','结束时间','面试时长（分钟）','面试官','本场场务','待安排原因','原始可用时段'],...items.map(c=>{
      const s=result.sessions.find(s=>s.id===c.session);
      return ['\t'+c.id,c.name,c.online?'线上':'线下',c.status,s?.date||'',s?hm(c.start):'',s?hm(c.end):'',c.duration||'',s?staffName(c.interviewer):'',s?s.fieldStaff.map(p=>p.name).join('、'):'',c.reason||'',c.slots.map(slotLabel).join('、')];
    })]);
  }
  function navigate(id){
    document.querySelectorAll('.section').forEach(e=>e.classList.toggle('active',e.id===id));
    document.querySelectorAll('.nav button').forEach(e=>{e.classList.toggle('active',e.dataset.page===id);e.setAttribute('aria-current',e.dataset.page===id?'page':'false');});
    activePage=id;
    const titles={overview:['排班总览','覆盖人数、面试时长，一眼看清。'],schedule:['面试安排','可调整时间与面试官，保存后直接导出。'],staff:['人员排班','协调面试官与场务的分工。'],data:['名单管理','导入、编辑名单，自动同步排班。']};
    [$('pageTitle').textContent,$('introText').textContent]=titles[id];
    $('settings').hidden=id==='data';$('periodLabel').parentElement.hidden=id==='data';$('globalNotice').hidden=id==='data';
  }
  function hydrateSettings(){
    for(const k of ['duration','gap','reserve','field'])$(k).value=config[k];
    $('sessionToggles').innerHTML=data.sessions.map(s=>`<label><input type="checkbox" value="${esc(s.id)}" aria-label="${esc(s.label)}" ${config.enabled.includes(s.id)?'checked':''}><span class="session-text"><strong>${Number(s.date.slice(5,7))}月${s.day}日</strong><span>${hm(s.start)}–${hm(s.end)}</span></span></label>`).join('');
    $('sessionFilter').innerHTML='<option value="all">全部时段</option>'+data.sessions.map(s=>`<option value="${s.id}">${s.label}</option>`).join('');
  }
  function calculate(d,cfg){
    const next=Adjustments.apply(d,Planner.solve(d,cfg),cfg?.adjustments||{}),errors=Planner.validate(d,next);if(errors.length)throw Error('校验失败：'+errors.join('；'));return next;
  }
  function remember(){history.push({raw:structuredClone(raw),config:structuredClone(config)});if(history.length>20)history.shift();}
  function commitConfig(next,settings=false){
    const nr=calculate(data,next),savedPage=page;remember();config=next;if(settings)hydrateSettings();compute(nr);page=savedPage;renderSchedule();
  }
  function compute(next=calculate(data,config)){
    result=next;config=next.config;page=1;render();
    $('embedded-data').textContent=JSON.stringify(raw).replace(/</g,'\\u003c');
    $('embedded-config').textContent=JSON.stringify(config).replace(/</g,'\\u003c');
    persist();
  }
  function heatColor(s){
    if(!s.enabled||!s.count)return {bg:'#f1f3f5',fg:'#929da8'};
    const val=metric==='budget'?s.average:s.scheduledAverage, ratio=val/config.duration;
    if(ratio<0.5)return {bg:'#2563eb',fg:'#fff'};
    if(ratio<0.8)return {bg:'#93c5fd',fg:'#153e75'};
    if(ratio<1)return {bg:'#bfdbfe',fg:'#194b88'};
    return {bg:'#eff6ff',fg:'#37648f'};
  }
  function renderHeat(){
    const dates=[...new Set(data.sessions.map(s=>s.date))],ranges=[...new Set(data.sessions.map(s=>s.start+'|'+s.end))].map(k=>k.split('|').map(Number)).sort((a,b)=>a[0]-b[0]||a[1]-b[1]);
    $('heatmap').style.gridTemplateColumns=dates.length?`83px repeat(${dates.length},minmax(108px,1fr))`:'1fr';
    if(!dates.length){$('heatmap').innerHTML='<div class="empty">导入名单后显示面试时长</div>';$('heatFormula').textContent='';return;}
    let html='<div></div>'+dates.map(d=>`<div class="heat-head">${Number(d.slice(5,7))} 月 ${Number(d.slice(8))} 日<small>周${'日一二三四五六'[new Date(d+'T00:00:00Z').getUTCDay()]}</small></div>`).join('');
    for(const [start,end] of ranges){
      html+=`<div class="heat-axis">${hm(start)}–${hm(end)}<span>${end-start} 分钟 / 场</span></div>`;
      for(const date of dates){
        const s=result.sessions.find(s=>s.date===date&&s.start===start&&s.end===end);
        if(!s){html+='<div class="heatcell off"><b>—</b><span>无此时段</span></div>';continue;}
        const v=metric==='budget'?s.average:s.scheduledAverage,c=heatColor(s);
        html+=`<button class="heatcell ${s.enabled?'':'off'}" data-slot="${s.id}" style="background:${c.bg};color:${c.fg}" aria-label="${s.label}，${v==null?'暂无安排':v.toFixed(2)+' 分钟每人'}，${s.count} 位候选人" title="${s.label}\n面试官 ${s.interviewers.length} 人；场务 ${s.fieldStaff.length} 人\n已排 ${s.count} 人；线上 ${s.online} 人；线下 ${s.offline} 人\n人均可用 ${s.average?.toFixed(3)??'—'} 分钟；实际排定 ${minutes(s.scheduledAverage)} 分钟"><b>${v==null?'—':v.toFixed(2)}${v==null?'':'<small>分 / 人</small>'}</b><span>${s.enabled?`${s.count} 人 · ${s.interviewers.length} 位面试官`:'时段未启用'}</span></button>`;
      }
    }
    $('heatmap').innerHTML=html;
    $('heatFormula').textContent=metric==='budget'?'可用时间 ÷ 人数，包含未使用的时间。':'实际面试总分钟 ÷ 人数；参考 '+config.duration+' 分钟。';
    document.querySelectorAll('[data-metric]').forEach(b=>b.classList.toggle('active',b.dataset.metric===metric));
  }
  function table(items,preview=false){
    const headers=['候选人','学号','面试方式','面试日期 / 时段','具体时间','实际时长','面试官','状态',...(preview?[]:['操作'])];
    return `<table><thead><tr>${headers.map(h=>`<th scope="col">${h}</th>`).join('')}</tr></thead><tbody>${items.length?items.map(c=>`<tr><td><strong>${esc(c.name)}</strong></td><td class="id">${esc(c.id)}</td><td><span class="tag ${c.online?'online':''}">${c.online?'线上':'线下'}</span></td><td>${c.session?esc(slotLabel(c.session)):`<span title="${esc(c.slots.map(slotLabel).join('、'))}">${esc(c.reason)}</span>`}</td><td>${c.session?`<strong>${hm(c.start)}–${hm(c.end)}</strong>`:'—'}</td><td>${durationLabel(c.durationSeconds)}</td><td>${esc(staffName(c.interviewer))}</td><td><span class="tag ${c.session?'good':'warn'}">${c.status}</span></td>${preview?'':`<td><button class="text small" data-adjust="${esc(c.id)}" aria-label="调整 ${esc(c.name)} 的面试安排">${c.session?'调整':'安排'}</button></td>`}</tr>`).join(''):`<tr><td class="empty" colspan="${headers.length}">没有符合筛选条件的候选人</td></tr>`}</tbody></table>`;
  }
  function filtered(){
    const q=$('search').value.trim().toLowerCase(),s=$('sessionFilter').value,m=$('modeFilter').value,st=$('statusFilter').value;
    return [...result.assignments,...result.unassigned].filter(c=>(!q||[c.name,c.id,staffName(c.interviewer)].some(v=>v.toLowerCase().includes(q)))&&(s==='all'||c.session===s||(!c.session&&c.slots.includes(s)))&&(m==='all'||c.online===(m==='online'))&&(st==='all'||Boolean(c.session)===(st==='assigned')));
  }
  function renderSchedule(){
    const list=filtered(),pages=Math.max(1,Math.ceil(list.length/40));page=Math.min(Math.max(page,1),pages);
    $('scheduleTable').innerHTML=table(list.slice((page-1)*40,page*40));
    $('paginationText').textContent=`共 ${list.length} 人${list.length?`，显示 ${(page-1)*40+1}–${Math.min(page*40,list.length)} 人`:''}`;
    $('pageNumber').textContent=`${page} / ${pages}`;$('prevPage').disabled=page<=1;$('nextPage').disabled=page>=pages;
    $('scheduleCaption').textContent=`${result.matched} 人已安排 · ${result.unassigned.length} 人待安排${result.manualCount?' · '+result.manualCount+' 人手动调整':''}`;
    $('undoSchedule').disabled=!history.length;$('resetAdjustments').hidden=!result.manualCount;
  }
  function renderStaff(){
    $('staffTable').innerHTML='<table><thead><tr><th>工作人员</th>'+data.sessions.map(s=>`<th>${Number(s.date.slice(5,7))} 月 ${s.day} 日<br>${hm(s.start)}–${hm(s.end)}</th>`).join('')+'<th>面试人数</th><th>场务班次</th></tr></thead><tbody>'+data.staff.map(p=>{
      const w=result.workloads.find(w=>w.id===p.id);
      return `<tr><td><strong>${esc(p.name)}</strong><span class="role-label">${esc(p.department)}</span></td>`+result.sessions.map(s=>{
        const i=p.interview.includes(s.id),f=p.field.includes(s.id),key=p.id+'|'+s.id,value=config.overrides[key]||'auto',role=s.roles[p.id],count=s.lanes.find(l=>l.staff===p.id)?.count||0;
        if(!i&&!f)return '<td class="muted">—</td>';
        const opts=[['auto','自动'],...(i?[['interview','指定面试官']]:[]),...(f?[['field','指定场务']]:[]),['off','不安排']];
        return `<td><select data-role-key="${key}" aria-label="${esc(p.name)} ${s.label}角色" ${s.enabled?'':'disabled'}>${opts.map(([v,t])=>`<option value="${v}" ${v===value?'selected':''}>${t}</option>`).join('')}</select><span class="role-label">${!s.enabled?'未启用':role==='interview'?'面试 '+count+' 人':role==='field'?'场务 '+(s.end-s.start)+' 分钟':'未排班'}</span></td>`;
      }).join('')+`<td>${w.count}</td><td>${w.fieldShifts}</td></tr>`;
    }).join('')+'</tbody></table>';
    const max=Math.max(1,...result.workloads.map(w=>w.interviewMinutes+w.fieldMinutes));
    $('staffChart').innerHTML=[...result.workloads].sort((a,b)=>(b.interviewMinutes+b.fieldMinutes)-(a.interviewMinutes+a.fieldMinutes)).map(w=>`<div class="work-row"><span>${esc(w.name)}</span><div class="work-track" title="面试 ${minutes(w.interviewMinutes)} 分钟，场务 ${w.fieldMinutes} 分钟"><i style="width:${100*w.interviewMinutes/max}%"></i><i class="field" style="width:${100*w.fieldMinutes/max}%"></i></div><span class="number">${w.count} 人 / ${w.fieldShifts} 场场务</span></div>`).join('');
  }
  function render(){
    $('settingsSummary').textContent=`参考 ${config.duration} 分钟 · 场务 ${config.field} 人 / 场`;
    const online=data.candidates.filter(c=>c.online).length,active=new Set(result.sessions.flatMap(s=>s.interviewers.map(p=>p.id))).size;
    const metrics=[['候选人总数',data.candidates.length,'人',`线下 ${data.candidates.length-online} 人 · 线上 ${online} 人`],['已安排面试',result.matched,'人',`<strong>覆盖率 ${(result.total?100*result.matched/result.total:0).toFixed(1)}%</strong> · 待安排 ${result.unassigned.length} 人`],['参与面试官',active,'位',`工作人员 ${data.staff.length} 位 · 每场 ${config.field} 位场务`],['平均实际面试',minutes(result.averageDuration),'分钟',`参考 ${config.duration} 分钟 · ${result.compressedCount} 人已缩短时长`]];
    $('metrics').innerHTML=metrics.map(([title,value,unit,foot],i)=>`<div class="metric"><label>${title}<span>0${i+1}</span></label><div class="value">${value}<em>${unit}</em></div><div class="foot">${foot}</div></div>`).join('');
    const warns=result.sessions.flatMap(s=>s.warnings.map(w=>s.label+'：'+w));
    const pending=result.unassigned.length;
    const compression=result.compressedCount?`${result.compressedCount} 人已缩短时长，平均 ${minutes(result.averageDuration)} 分钟。`:'';
    $('globalNotice').innerHTML=pending||warns.length?`<div class="notice"><strong>${pending?pending+' 人待安排':'人员配置需检查'}</strong>${compression?' · '+compression:''}<details><summary>查看原因</summary>${warns.map(esc).join('<br>')||'请在面试安排中查看原因，或调整可用时间和人员。'}</details></div>`:compression?`<div class="notice ok">已安排全部 ${result.total} 人 · ${compression}</div>`:'';
    renderHeat();
    $('capacityList').innerHTML=result.sessions.map(s=>`<div><div class="capacity-title"><strong style="font-weight:500">${s.label}</strong><span>${s.count} / ${s.standardCapacity} 人</span></div><div class="capacity-track"><i style="width:${s.standardCapacity?Math.min(100,100*s.count/s.standardCapacity):s.count?100:0}%"></i></div><div class="capacity-meta"><span>${s.interviewers.length} 位面试官 · ${s.fieldStaff.length} 位场务</span><span>${s.count?'平均 '+minutes(s.scheduledAverage)+' 分钟':'暂无面试'}</span></div></div>`).join('')||'<div class="empty">暂无时段</div>';
    $('slotBadge').textContent=`${result.sessions.filter(s=>s.enabled).length} 个时段`;
    $('capacityNote').textContent=`参考容量按 ${config.duration} 分钟计算，超出时自动缩短面试。`;
    $('previewTable').innerHTML=table(result.assignments.slice(0,5),true);
    renderSchedule();renderStaff();
    renderSources();renderRoster();
    $('dataStatus').textContent=data.candidates.length||data.staff.length?`已识别 ${data.candidates.length} 位候选人 · ${data.staff.length} 位工作人员`:'';
    $('footerStatus').textContent=`已安排 ${result.matched} / ${result.total} 人`;
    const dates=[...new Set(data.sessions.map(s=>s.date))];$('periodLabel').textContent=dates.length?`${dates[0]}${dates.length>1?' — '+dates.at(-1):''}`:'';
    $('brandYear').textContent='VOLUNTEER PLANNER';$('footerBrand').textContent='志愿者面试工作台';
    $('exportExcel').disabled=!data.candidates.length&&!data.staff.length;
    $('exportHeat').disabled=!data.sessions.length;
    document.body.classList.add('ready');
  }
  function persist(){
    if(location.protocol==='file:'){$('saveStatus').textContent='离线运行';return;}
    try{localStorage.setItem(storageKey,JSON.stringify({raw,config}));$('saveStatus').textContent='已保存到本机';}
    catch{$('saveStatus').textContent='请保存网页备份';}
  }
  function applyRaw(next,reset=false,saveHistory=true,restoredConfig=null,renamedCandidates={}){
    next=Roster.canonical(next);
    const nd=Planner.normalize(next.candidates,next.staff,next.sources,next.year);
    const nc=restoredConfig|| (reset?{...structuredClone(Planner.defaults),duration:config.duration,gap:config.gap,reserve:config.reserve,field:config.field,enabled:nd.sessions.map(s=>s.id),overrides:{}}:Roster.reconcile(config,data,nd,renamedCandidates));
    const nr=calculate(nd,nc);
    if(saveHistory)remember();
    raw=next;data=nd;config=nc;rosterPage=1;selected.clear();$('importYear').value=raw.year;
    if(reset){rosterKind='candidates';$('rosterSearch').value='';$('candidateFile').value='';$('staffFile').value='';}
    hydrateSettings();compute(nr);
  }
  function renderSources(){
    for(const [source,file,index,count] of [['candidateSource','candidateFile',0,data.candidates.length],['staffSource','staffFile',1,data.staff.length]]){
      const filename=$(file).files[0]?.name||raw.sources[index]||'';
      $(source).textContent=filename|| (count?`${count} 人 · 手动录入`:'尚未选择文件');$(source).title=filename;
    }
  }
  function rosterFiltered(){
    const q=$('rosterSearch').value.trim().toLowerCase();return data[rosterKind].filter(p=>!q||[p.name,p.id,p.department||''].some(v=>v.toLowerCase().includes(q)));
  }
  function rosterVisible(){return rosterFiltered().slice((rosterPage-1)*30,rosterPage*30);}
  function timeChips(windows){
    return windows.length?`<div class="time-chips" title="${esc(Roster.windowsText(windows))}">${windows.slice(0,2).map(w=>`<span>${esc(w.date.slice(5))} ${hm(w.start)}–${hm(w.end)}</span>`).join('')}${windows.length>2?`<span>+${windows.length-2}</span>`:''}</div>`:'<span class="muted">未填写</span>';
  }
  function renderRoster(){
    const candidate=rosterKind==='candidates',list=rosterFiltered(),pages=Math.max(1,Math.ceil(list.length/30));rosterPage=Math.max(1,Math.min(rosterPage,pages));const shown=rosterVisible();
    $('candidateTab').textContent=`候选人 · ${data.candidates.length}`;$('staffTab').textContent=`工作人员 · ${data.staff.length}`;
    document.querySelectorAll('[data-roster]').forEach(b=>{b.classList.toggle('active',b.dataset.roster===rosterKind);b.setAttribute('aria-pressed',String(b.dataset.roster===rosterKind));});
    $('addRecord').textContent=candidate?'＋ 新增候选人':'＋ 新增工作人员';$('rosterSearch').placeholder=candidate?'搜索姓名或编号':'搜索姓名或部门';
    const heads=candidate?['姓名','编号 / 学号','面试方式','可用时间']:['姓名','部门','面试官时间','场务时间'];
    $('rosterTable').innerHTML=`<table><thead><tr><th class="check-cell"><input id="rosterSelectAll" type="checkbox" aria-label="选择本页全部" ${shown.length&&shown.every(p=>selected.has(p.id))?'checked':''} ${shown.length?'':'disabled'}></th>${heads.map(h=>`<th>${h}</th>`).join('')}<th>操作</th></tr></thead><tbody>${shown.length?shown.map(p=>`<tr><td class="check-cell"><input type="checkbox" aria-label="选择 ${esc(p.name)}" data-select-key="${esc(p.id)}" ${selected.has(p.id)?'checked':''}></td><td><strong>${esc(p.name)}</strong></td>${candidate?`<td class="id">${esc(p.id)}</td><td><span class="tag ${p.online?'online':''}">${p.online?'线上':'线下'}</span></td><td>${timeChips(p.windows)}</td>`:`<td>${esc(p.department)||'—'}</td><td>${timeChips(p.interviewWindows)}</td><td>${timeChips(p.fieldWindows)}</td>`}<td><div class="row-actions"><button class="text" data-edit="${esc(p.id)}" aria-label="编辑 ${esc(p.name)}">编辑</button><button class="text danger" data-delete="${esc(p.id)}" aria-label="删除 ${esc(p.name)}">删除</button></div></td></tr>`).join(''):`<tr><td colspan="6" class="empty">${list.length?'没有匹配的记录':data[rosterKind].length?'没有匹配的记录':'暂无'+(candidate?'候选人':'工作人员')+'，可导入问卷或手动新增'}</td></tr>`}</tbody></table>`;
    $('rosterCount').textContent=`共 ${list.length} 人${selected.size?' · 已选 '+selected.size+' 人':''}`;$('rosterPage').textContent=`${rosterPage} / ${pages}`;
    $('rosterPrev').disabled=rosterPage<=1;$('rosterNext').disabled=rosterPage>=pages;$('undoEdit').disabled=!history.length;
    $('deleteSelected').hidden=!selected.size;$('deleteSelected').textContent=`删除所选 (${selected.size})`;
    $('clearData').disabled=!data.candidates.length&&!data.staff.length;
  }
  function askReplace(message,action){
    if(!data.candidates.length&&!data.staff.length){action();return;}
    $('confirmTitle').textContent='确认操作';$('confirmText').textContent=message;confirmAction=action;$('confirmDialog').showModal();
  }
  function deleteRecords(keys){
    if(!keys.length)return;
    askReplace(`删除 ${keys.length} 位${rosterKind==='candidates'?'候选人':'工作人员'}？排班将自动更新，可撤销。`,()=>{applyRaw(Roster.remove(raw,rosterKind,keys));toast(`已删除 ${keys.length} 人，可撤销`);});
  }
  function openAssignment(id){
    const c=[...result.assignments,...result.unassigned].find(c=>c.id===id);if(!c)return;
    assignmentEditing={id,duration:c.durationSeconds||config.duration*60};
    $('assignmentTitle').textContent=c.session?'调整面试安排':'安排面试';$('assignmentPerson').textContent=`${c.name} · ${c.id} · ${c.online?'线上':'线下'}`;
    const sessions=result.sessions.filter(s=>c.slots.includes(s.id)&&s.enabled&&s.covered&&s.interviewers.length);
    $('assignmentSession').innerHTML=sessions.length?sessions.map(s=>`<option value="${esc(s.id)}">${s.date} ${hm(s.start)}–${hm(s.end)}</option>`).join(''):'<option value="">暂无可用时段</option>';
    if(c.session&&sessions.some(s=>s.id===c.session))$('assignmentSession').value=c.session;
    assignmentInterviewers(c.interviewer);
    $('assignmentStart').value=c.session?hm(c.start):'';$('assignmentEnd').value=c.session?hm(c.end):'';
    $('assignmentError').textContent=sessions.length?'':'暂无符合可用时间和人员配置的时段，请先在名单或人员排班中调整。';
    $('saveAssignment').disabled=!sessions.length;$('resetOneAssignment').hidden=!c.manual;
    renderAssignmentFree();if(!c.session)suggestAssignment();$('assignmentDialog').showModal();
  }
  function assignmentInterviewers(preferred){
    const s=result.sessions.find(s=>s.id===$('assignmentSession').value),people=s?.interviewers||[];
    $('assignmentInterviewer').innerHTML=people.length?people.map(p=>`<option value="${esc(p.id)}">${esc(p.name)}</option>`).join(''):'<option value="">暂无面试官</option>';
    if(people.some(p=>p.id===preferred))$('assignmentInterviewer').value=preferred;
  }
  function assignmentSpaces(){return Adjustments.free(result,assignmentEditing.id,$('assignmentSession').value,$('assignmentInterviewer').value);}
  function renderAssignmentFree(){
    const free=assignmentSpaces();$('assignmentFree').textContent=free.length?free.slice(0,6).map(w=>`${hm(w.start/60)}–${hm(w.end/60)}`).join('、')+(free.length>6?` 等 ${free.length} 个空档`:''):'暂无空闲时间，可更换时段或面试官。';
    $('suggestAssignment').disabled=!free.length;
  }
  function suggestAssignment(){
    const spaces=assignmentSpaces(),space=spaces.find(w=>w.end-w.start>=assignmentEditing.duration)||spaces[0];
    if(space){$('assignmentStart').value=hm(space.start/60);$('assignmentEnd').value=hm((space.start+Math.min(assignmentEditing.duration,space.end-space.start))/60);}
    else{$('assignmentStart').value='';$('assignmentEnd').value='';}
    renderAssignmentFree();
  }
  function localDate(){const d=new Date();return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;}
  function openEditor(key){
    const candidate=rosterKind==='candidates',person=data[rosterKind].find(p=>p.id===key),asDraft=ws=>(ws||[]).map(w=>({date:w.date,start:hm(w.start),end:hm(w.end)}));
    editing={key,windows:{interview:asDraft(candidate?person?.windows:person?.interviewWindows),field:asDraft(person?.fieldWindows)}};
    $('recordTitle').textContent=(key?'编辑':'新增')+(candidate?'候选人':'工作人员');$('recordForm').reset();$('recordError').textContent='';
    $('candidateIdField').hidden=!candidate;$('candidateModeField').hidden=!candidate;$('staffDepartmentField').hidden=candidate;$('editId').required=candidate;
    $('editName').value=person?.name||'';$('editDepartment').value=person?.department||'';$('editMode').value=person?.online?'是':'否';
    let index=1;while(data.candidates.some(p=>p.id==='V'+String(index).padStart(4,'0')))index++;
    $('editId').value=person?.id||'V'+String(index).padStart(4,'0');renderWindowEditor();$('recordDialog').showModal();$('editName').focus();
  }
  function renderWindowEditor(){
    const groups=rosterKind==='candidates'?[['interview','可用时间']]:[['interview','面试官时间'],['field','场务时间']];
    $('editorWindows').innerHTML=groups.map(([key,title])=>`<section class="window-group"><div class="window-head"><h3>${title}</h3><button type="button" class="text small" data-add-window="${key}">＋ 添加${title}</button></div><div class="window-rows">${editing.windows[key].length?editing.windows[key].map((w,i)=>`<div class="window-row" data-window="${key}:${i}"><label>日期<input type="date" data-part="date" aria-label="${title} ${i+1} 日期" value="${esc(w.date)}" required></label><label>开始<input type="text" inputmode="numeric" maxlength="5" placeholder="18:00" data-part="start" aria-label="${title} ${i+1} 开始" value="${esc(w.start)}" required pattern="[0-9]{1,2}:[0-9]{2}"></label><label>结束<input type="text" inputmode="numeric" maxlength="5" placeholder="20:00" data-part="end" aria-label="${title} ${i+1} 结束" value="${esc(w.end)}" required pattern="[0-9]{1,2}:[0-9]{2}"></label><button type="button" class="text danger" data-remove-window="${key}:${i}" aria-label="删除${title} ${i+1}">×</button></div>`).join(''):'<p class="window-empty">暂无时段，点击添加</p>'}</div></section>`).join('');
  }
  function readWindowDraft(){
    $('editorWindows').querySelectorAll('[data-window]').forEach(row=>{const [key,i]=row.dataset.window.split(':');for(const part of ['date','start','end'])editing.windows[key][Number(i)][part]=row.querySelector(`[data-part="${part}"]`).value;});
  }

  // Read the first XLSX sheet in-browser. Only data is read; formulas/macros are not executed.
  async function readXlsx(file){
    if(!file||!file.name.toLowerCase().endsWith('.xlsx'))throw Error('请选择 .xlsx 格式文件。');
    if(file.size>20*1024*1024)throw Error('文件超过 20 MB，请仅保留问卷答卷数据。');
    const bytes=new Uint8Array(await file.arrayBuffer()),view=new DataView(bytes.buffer),decoder=new TextDecoder();
    let eocd=-1;for(let i=bytes.length-22;i>=Math.max(0,bytes.length-65557);i--)if(view.getUint32(i,true)===0x06054b50){eocd=i;break;}
    if(eocd<0)throw Error('Excel 文件结构无法识别。');
    const entries=new Map();let pos=view.getUint32(eocd+16,true),count=view.getUint16(eocd+10,true);
    for(let i=0;i<count;i++){
      if(view.getUint32(pos,true)!==0x02014b50)throw Error('Excel 压缩目录损坏。');
      const method=view.getUint16(pos+10,true),size=view.getUint32(pos+20,true),expanded=view.getUint32(pos+24,true),nl=view.getUint16(pos+28,true),el=view.getUint16(pos+30,true),cl=view.getUint16(pos+32,true),offset=view.getUint32(pos+42,true),name=decoder.decode(bytes.slice(pos+46,pos+46+nl));
      if(expanded>30*1024*1024)throw Error('工作表过大，请缩小数据范围。');
      entries.set(name,{method,size,offset});pos+=46+nl+el+cl;
    }
    async function xml(name){
      const e=entries.get(name);if(!e)throw Error('Excel 缺少 '+name);
      const at=e.offset+30+view.getUint16(e.offset+26,true)+view.getUint16(e.offset+28,true),compressed=bytes.slice(at,at+e.size);let out;
      if(e.method===0)out=compressed;else if(e.method===8){
        if(typeof DecompressionStream==='undefined')throw Error('当前浏览器不支持 Excel 解压，请使用新版 Chrome 或 Edge，或使用附带的生成脚本。');
        try{out=new Uint8Array(await new Response(new Blob([compressed]).stream().pipeThrough(new DecompressionStream('deflate-raw'))).arrayBuffer());}catch{throw Error('Excel 解压失败，请使用新版 Chrome 或 Edge，或使用附带的生成脚本。');}
      }else throw Error('不支持此 Excel 压缩格式。');
      const doc=new DOMParser().parseFromString(decoder.decode(out),'application/xml');if(doc.getElementsByTagName('parsererror').length)throw Error('Excel XML 数据损坏。');return doc;
    }
    const all=(node,tag)=>Array.from(node.getElementsByTagNameNS('*',tag));
    const shared=entries.has('xl/sharedStrings.xml')?all(await xml('xl/sharedStrings.xml'),'si').map(si=>all(si,'t').map(t=>t.textContent).join('')):[];
    const book=await xml('xl/workbook.xml'),sheet=all(book,'sheet')[0];if(!sheet)throw Error('Excel 没有工作表。');
    const rid=sheet.getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships','id'),rels=await xml('xl/_rels/workbook.xml.rels'),rel=all(rels,'Relationship').find(r=>r.getAttribute('Id')===rid);if(!rel)throw Error('找不到首张工作表。');
    let target=rel.getAttribute('Target');target=target.startsWith('/')?target.slice(1):'xl/'+target;
    const rows=all(await xml(target),'row').map(row=>{const values=[];for(const c of all(row,'c')){
      const label=c.getAttribute('r')||'',letters=label.match(/^[A-Z]+/i)?.[0];if(!letters)continue;let index=0;for(const ch of letters.toUpperCase())index=index*26+ch.charCodeAt(0)-64;
      let v=all(c,'v')[0]?.textContent||'';if(c.getAttribute('t')==='s')v=shared[Number(v)]??'';if(c.getAttribute('t')==='inlineStr')v=all(c,'t').map(t=>t.textContent).join('');
      while(values.length<index)values.push('');values[index-1]=v;
    }return values;});
    return rows;
  }
  function exportHeat(){
    const dates=[...new Set(data.sessions.map(s=>s.date))],ranges=[...new Set(data.sessions.map(s=>s.start+'|'+s.end))].map(k=>k.split('|').map(Number)).sort((a,b)=>a[0]-b[0]||a[1]-b[1]);
    const width=Math.max(750,190+dates.length*270),height=240+ranges.length*140;let shapes=`<rect width="${width}" height="${height}" fill="#fff"/><text x="45" y="46" font-size="25" font-weight="600">志愿者面试 · 人均面试时间热力图</text><text x="45" y="77" font-size="13" fill="#6f829b">${metric==='budget'?'人均可用时间资源':'实际排定面试时长'} · 单位：分钟 / 人 · 参考 ${config.duration} 分钟 · 平均实际 ${minutes(result.averageDuration)} 分钟</text>`;
    dates.forEach((d,i)=>shapes+=`<text x="${280+i*270}" y="120" text-anchor="middle" font-size="17">${d}</text>`);
    ranges.forEach(([start,end],row)=>{shapes+=`<text x="25" y="${202+row*140}" font-size="14">${hm(start)}–${hm(end)}</text>`;dates.forEach((date,col)=>{
      const s=result.sessions.find(s=>s.date===date&&s.start===start&&s.end===end);if(!s)return;
      const v=metric==='budget'?s.average:s.scheduledAverage,c=heatColor(s),x=155+col*270,y=142+row*140;
      shapes+=`<rect x="${x}" y="${y}" width="250" height="120" rx="12" fill="${c.bg}"/><text x="${x+22}" y="${y+55}" font-size="34" fill="${c.fg}">${v==null?'—':v.toFixed(2)}</text><text x="${x+22}" y="${y+88}" font-size="13" fill="${c.fg}">${s.count} 位候选人 · ${s.interviewers.length} 位面试官</text>`;
    });});
    shapes+=`<text x="45" y="${height-55}" font-size="12" fill="#6f829b">${metric==='budget'?'人均可用 =（面试官人数 × 每场可用分钟 − 面试间隔总分钟）÷ 已安排人数':'实际排定 = 已排面试总分钟 ÷ 已安排人数'}</text><text x="45" y="${height-29}" font-size="12" fill="#6f829b">已安排 ${result.matched} / ${result.total} 人；每场最低场务 ${config.field} 人，面试间隔 ${config.gap} 分钟，末尾预留 ${config.reserve} 分钟。</text>`;
    download('面试时间热力图.svg',`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" font-family="Arial, PingFang SC, Microsoft YaHei, sans-serif" fill="#142a43">${shapes}</svg>`,'image/svg+xml;charset=utf-8');toast('已保存可缩放的 SVG 热力图');
  }
  document.querySelectorAll('.nav button').forEach(b=>b.onclick=()=>navigate(b.dataset.page));
  $('viewAll').onclick=()=>navigate('schedule');$('importShortcut').onclick=()=>navigate('data');
  document.querySelectorAll('[data-metric]').forEach(b=>b.onclick=()=>{metric=b.dataset.metric;renderHeat();});
  $('heatmap').onclick=e=>{const b=e.target.closest('[data-slot]');if(b){$('sessionFilter').value=b.dataset.slot;$('statusFilter').value='assigned';$('search').value='';$('modeFilter').value='all';page=1;renderSchedule();navigate('schedule');}};
  $('settingsForm').onsubmit=e=>{e.preventDefault();try{
    commitConfig({...config,...Object.fromEntries(['duration','gap','reserve','field'].map(k=>[k,Number($(k).value)])),enabled:[...$('sessionToggles').querySelectorAll('input:checked')].map(x=>x.value)},true);toast('排班已更新，手动调整已保留');
  }catch(error){hydrateSettings();toast(error.message);}};
  $('resetSettings').onclick=()=>{try{commitConfig({...freshConfig(),adjustments:config.adjustments||{}},true);toast('已恢复默认参数，手动调整已保留');}catch(error){toast(error.message);}};
  for(const id of ['search','sessionFilter','modeFilter','statusFilter'])$(id).addEventListener(id==='search'?'input':'change',()=>{page=1;renderSchedule();});
  $('prevPage').onclick=()=>{page--;renderSchedule();};$('nextPage').onclick=()=>{page++;renderSchedule();};
  $('staffTable').onchange=e=>{const key=e.target.dataset.roleKey;if(!key)return;try{commitConfig({...config,overrides:{...config.overrides,[key]:e.target.value}});toast('角色与面试安排已同步更新');}catch(error){renderStaff();toast(error.message);}};
  $('scheduleTable').onclick=e=>{const button=e.target.closest('[data-adjust]');if(button)openAssignment(button.dataset.adjust);};
  $('cancelAssignment').onclick=$('closeAssignment').onclick=()=>$('assignmentDialog').close();
  $('assignmentSession').onchange=()=>{assignmentInterviewers($('assignmentInterviewer').value);$('assignmentError').textContent='';suggestAssignment();};
  $('assignmentInterviewer').onchange=()=>{$('assignmentError').textContent='';suggestAssignment();};
  $('suggestAssignment').onclick=suggestAssignment;
  $('assignmentForm').onsubmit=e=>{e.preventDefault();try{
    const adjustment={session:$('assignmentSession').value,interviewer:$('assignmentInterviewer').value,startSeconds:Adjustments.seconds($('assignmentStart').value),endSeconds:Adjustments.seconds($('assignmentEnd').value)};
    commitConfig({...config,adjustments:{...config.adjustments,[assignmentEditing.id]:adjustment}});$('assignmentDialog').close();toast('调整已保存，可直接导出 Excel');
  }catch(error){$('assignmentError').textContent=error.message;}};
  $('resetOneAssignment').onclick=()=>{try{const adjustments={...config.adjustments};delete adjustments[assignmentEditing.id];commitConfig({...config,adjustments});$('assignmentDialog').close();toast('已恢复此人的自动安排');}catch(error){$('assignmentError').textContent=error.message;}};
  $('resetAdjustments').onclick=()=>askReplace(`恢复 ${result.manualCount} 位候选人的自动安排？可撤销。`,()=>{commitConfig({...config,adjustments:{}});toast('已恢复自动排班');});
  $('exportAll').onclick=()=>csv(rosterKind==='candidates'?'候选人名单.csv':'工作人员名单.csv',raw[rosterKind].map((r,i)=>r.map((v,j)=>i&&rosterKind==='candidates'&&j===0?'\t'+v:v)));
  $('exportExcel').onclick=()=>{
    const button=$('exportExcel');button.disabled=true;
    try{download('志愿者面试排班.xlsx',PlannerExcel.bytes(data,result),'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');toast('已导出 Excel：候选人面试安排、面试官排班、场务排班');}
    catch(error){toast('Excel 导出失败：'+error.message);}
    finally{button.disabled=false;}
  };
  $('exportFiltered').onclick=()=>candidateCSV(filtered(),'上马候选人面试安排_筛选.csv');
  $('exportStaff').onclick=()=>csv('上马工作人员安排.csv',[['姓名','部门','日期','时段','角色','面试人数','实际面试分钟','场务分钟','线上人数','备注'],...result.sessions.flatMap(s=>data.staff.filter(p=>['interview','field'].includes(s.roles[p.id])).map(p=>{
    const a=result.assignments.filter(a=>a.session===s.id&&a.interviewer===p.id),f=s.roles[p.id]==='field';return [p.name,p.department,s.date,hm(s.start)+'–'+hm(s.end),f?'场务':'面试官',a.length,a.reduce((n,c)=>n+c.durationSeconds,0)/60,f?s.end-s.start:0,a.filter(c=>c.online).length,s.warnings.join('；')];
  }))]);
  $('exportHeat').onclick=exportHeat;
  $('saveHtml').onclick=()=>{const clone=document.documentElement.cloneNode(true);clone.querySelector('#toast').textContent='';download('面试排班_当前方案.html','<!DOCTYPE html>\n'+clone.outerHTML,'text/html;charset=utf-8');toast('已保存当前问卷与排班设置');};
  for(const [id,kind] of [['candidateTemplate','candidates'],['staffTemplate','staff']])$(id).onclick=()=>{
    const template=PlannerImportTemplates[kind];
    download(template.name,Uint8Array.from(atob(template.base64),c=>c.charCodeAt(0)),'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    toast('模板已下载，填写方法见「填写说明」工作表');
  };
  $('importFiles').onclick=async()=>{
    const a=$('candidateFile').files[0],b=$('staffFile').files[0];if(!a||!b){toast('请先选择两份 Excel');return;}
    const button=$('importFiles');button.disabled=true;button.textContent='识别中…';
    try{const [candidates,staff]=await Promise.all([readXlsx(a),readXlsx(b)]);applyRaw({candidates,staff,sources:[a.name,b.name],year:Number($('importYear').value)},true);navigate('data');toast('名单已识别，可在下方编辑');}
    catch(error){$('dataStatus').textContent='导入失败：'+error.message;toast(error.message);}
    finally{button.disabled=false;button.textContent='识别名单';}
  };
  for(const id of ['candidateFile','staffFile'])$(id).onchange=()=>{const name=$(id).files[0]?.name||'',y=name.match(/(?:^|D)(20d{2})(?:D|$)/);if(id==='candidateFile'&&y)$('importYear').value=y[1];renderSources();};
  $('restoreData').onclick=()=>askReplace('载入示例名单？当前名单可通过“撤销”恢复。',()=>{applyRaw(structuredClone(demoRaw),true);navigate('data');toast('已载入演示数据');});
  $('clearData').onclick=()=>askReplace('清空全部候选人和工作人员？操作后可撤销。',()=>{applyRaw(Roster.empty(raw.year),true);toast('已清空，可撤销');});
  document.querySelectorAll('[data-roster]').forEach(b=>b.onclick=()=>{rosterKind=b.dataset.roster;rosterPage=1;selected.clear();$('rosterSearch').value='';renderRoster();});
  $('rosterSearch').oninput=()=>{rosterPage=1;renderRoster();};
  $('rosterPrev').onclick=()=>{rosterPage--;renderRoster();};$('rosterNext').onclick=()=>{rosterPage++;renderRoster();};
  $('addRecord').onclick=()=>openEditor(null);
  $('rosterTable').onclick=e=>{const b=e.target.closest('[data-edit],[data-delete]');if(!b)return;if(b.hasAttribute('data-edit'))openEditor(b.dataset.edit);else deleteRecords([b.dataset.delete]);};
  $('rosterTable').onchange=e=>{
    if(e.target.id==='rosterSelectAll')rosterVisible().forEach(p=>e.target.checked?selected.add(p.id):selected.delete(p.id));
    else if(e.target.dataset.selectKey){const k=e.target.dataset.selectKey;e.target.checked?selected.add(k):selected.delete(k);}
    renderRoster();
  };
  $('deleteSelected').onclick=()=>deleteRecords([...selected]);
  $('undoEdit').onclick=$('undoSchedule').onclick=()=>{const last=history.at(-1);if(!last)return;try{applyRaw(last.raw,false,false,last.config);history.pop();renderSchedule();renderRoster();toast('已撤销上一步');}catch(error){toast(error.message);}};
  $('cancelRecord').onclick=$('closeRecord').onclick=()=>$('recordDialog').close();
  $('cancelConfirm').onclick=()=>{$('confirmDialog').close();confirmAction=null;};
  $('acceptConfirm').onclick=()=>{const action=confirmAction;confirmAction=null;$('confirmDialog').close();if(action)try{action();}catch(e){toast(e.message);}};
  $('editorWindows').onclick=e=>{const b=e.target.closest('[data-add-window],[data-remove-window]');if(!b)return;
    readWindowDraft();if(b.dataset.addWindow){const s=data.sessions[0];editing.windows[b.dataset.addWindow].push({date:s?.date||localDate(),start:s?hm(s.start):'18:00',end:s?hm(s.end):'20:00'});}
    else{const [key,index]=b.dataset.removeWindow.split(':');editing.windows[key].splice(Number(index),1);}renderWindowEditor();
  };
  $('recordForm').onsubmit=e=>{e.preventDefault();try{
    readWindowDraft();const windowText=key=>editing.windows[key].map(w=>{if(!w.date||!w.start||!w.end)throw Error('请填写完整的日期和起止时间。');return `${w.date} ${w.start}-${w.end}`;}).join('、');
    const row=rosterKind==='candidates'?[$('editId').value.trim(),$('editName').value.trim(),windowText('interview'),$('editMode').value]:[$('editName').value.trim(),$('editDepartment').value.trim(),windowText('interview'),windowText('field'),editing.key||'staff-'+crypto.randomUUID()];
    applyRaw(Roster.change(raw,rosterKind,editing.key,row),false,true,null,rosterKind==='candidates'&&editing.key?{[editing.key]:row[0]}:{});$('recordDialog').close();toast('已保存并更新排班');
  }catch(error){$('recordError').textContent=error.message;}};
  try{
    raw=Roster.canonical(raw);
    if(location.protocol!=='file:')try{
      const cached=JSON.parse(localStorage.getItem(storageKey)||'null');
      if(cached){const next=Roster.canonical(cached.raw),nd=Planner.normalize(next.candidates,next.staff,next.sources,next.year),nr=calculate(nd,cached.config);raw=next;config=nr.config;}
    }catch{toast('本机记录无法读取，请重新导入或打开备份');}
    data=Planner.normalize(raw.candidates,raw.staff,raw.sources,raw.year);
    if(!config)config=freshConfig();$('importYear').value=raw.year;
    hydrateSettings();compute();navigate(data.candidates.length?'overview':'data');
  }catch(e){$('loading').textContent='无法生成排班：'+e.message;$('globalNotice').textContent=e.message;}
})();
